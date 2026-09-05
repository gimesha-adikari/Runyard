use crate::error::Result;
use crate::models::Service;
use rusqlite::Connection;

pub fn reconcile_catalog() -> Result<()> {
    let mut conn = crate::db::get_connection()?;
    reconcile_catalog_with_conn(&mut conn)
}

pub fn reconcile_catalog_with_conn(conn: &mut Connection) -> Result<()> {
    // 1. Reconcile scan root coverage: ensure no orphaned discovered projects remain active
    let roots = crate::db::get_scan_roots_with_conn(conn)?;
    let active_roots: Vec<std::path::PathBuf> = roots
        .into_iter()
        .filter(|r| r.enabled)
        .map(|r| std::path::PathBuf::from(r.path))
        .collect();

    let all_projects = crate::db::get_all_projects_with_conn(conn)?;
    for p in &all_projects {
        if p.source == crate::models::ProjectSource::Discovered {
            let p_path = std::path::Path::new(&p.path);
            let covered = active_roots.iter().any(|r| p_path.starts_with(r));
            if !covered {
                let enriched = crate::db::is_project_enriched_with_conn(conn, p)?;
                if enriched {
                    conn.execute("UPDATE projects SET is_archived = 1 WHERE id = ?", [&p.id])?;
                } else {
                    conn.execute("DELETE FROM projects WHERE id = ?", [&p.id])?;
                }
            }
        }
    }

    // 2. Parent-child subprojects / nested services reconciliation
    let all_projects = crate::db::get_all_projects_with_conn(conn)?;

    // Sort projects by path length so that parents come before children
    let mut projects = all_projects.clone();
    projects.sort_by_key(|p| p.path.len());

    for child in &projects {
        for parent in &projects {
            if child.id == parent.id {
                continue;
            }

            // Only reconcile automatically discovered projects. Manual ones stay top-level.
            if child.source == crate::models::ProjectSource::Manual {
                continue;
            }

            // Do not delete auto-discovered projects that the user has explicitly enriched
            if child.is_favorite
                || !child.tags.is_empty()
                || child.preferred_ide.is_some()
                || child.default_run_config_id.is_some()
            {
                continue;
            }

            let child_path = std::path::Path::new(&child.path);
            let parent_path = std::path::Path::new(&parent.path);
            if child_path.starts_with(parent_path) && child.path != parent.path {
                // If it has its own .git, it's a Subproject (keep as Project)
                if child.has_git {
                    let mut updated_child = child.clone();
                    updated_child.parent_project_id = Some(parent.id.clone());
                    let _ = crate::db::upsert_project(&updated_child);
                    break;
                }

                // Otherwise convert to Service

                let relative_path = child
                    .path
                    .strip_prefix(&parent.path)
                    .unwrap_or(&child.path)
                    .trim_start_matches('/')
                    .trim_start_matches('\\')
                    .to_string();

                if crate::scanner::is_noise_path(&relative_path) {
                    let _ = conn.execute("DELETE FROM projects WHERE id = ?", [&child.id]);
                    continue;
                }

                let parent_services = crate::db::get_services(&parent.id)?;
                let mut service_id = None;
                for svc in &parent_services {
                    if child.path.ends_with(&svc.path) {
                        service_id = Some(svc.id.clone());
                        break;
                    }
                }

                if service_id.is_none() {
                    let new_svc = Service {
                        id: uuid::Uuid::new_v4().to_string(),
                        project_id: parent.id.clone(),
                        name: child.name.clone(),
                        path: relative_path,
                        service_type: child.project_type.clone(),
                        languages: child.languages.clone(),
                        frameworks: child.frameworks.clone(),
                        is_runnable: child.is_runnable,
                        source: crate::models::ServiceSource::Detected,
                        created_at: chrono::Utc::now().to_rfc3339(),
                    };
                    crate::db::upsert_service(&new_svc)?;
                    service_id = Some(new_svc.id);
                }

                let sid = service_id.unwrap();

                let child_configs = crate::db::get_run_configs(&child.id)?;
                for mut cfg in child_configs {
                    cfg.project_id = parent.id.clone();
                    cfg.service_id = Some(sid.clone());
                    crate::db::save_run_config(&cfg)?;
                }

                // Migrate RunGroups before deleting child project
                if let Ok(run_groups) = crate::db::get_run_groups(&child.id) {
                    for mut rg in run_groups {
                        rg.project_id = parent.id.clone();
                        let _ = crate::db::save_run_group(&rg);
                    }
                }
                crate::db::delete_project(&child.id)?;
                break; // child is migrated
            }
        }
    }

    // 3. Reconcile project script configs for all remaining active projects
    let all_projects_after = crate::db::get_all_projects_with_conn(conn)?;
    for p in &all_projects_after {
        let _ = reconcile_project_script_configs(conn, &p.id, std::path::Path::new(&p.path));
    }

    Ok(())
}

pub fn reconcile_project_script_configs(
    conn: &Connection,
    project_id: &str,
    project_path: &std::path::Path,
) -> Result<()> {
    if project_id.is_empty() || !project_path.exists() {
        return Ok(());
    }

    let scripts = crate::script_detector::detect_project_scripts(project_path, project_id);
    let valid_stable_ids: std::collections::HashSet<String> = scripts
        .iter()
        .map(|s| {
            uuid::Uuid::new_v5(
                &uuid::Uuid::NAMESPACE_DNS,
                format!("runyard:script:{}:{}", project_id, s.relative_path).as_bytes(),
            )
            .to_string()
        })
        .collect();

    let configs = crate::db::get_run_configs_with_conn(conn, project_id)?;
    for cfg in configs {
        // ONLY prune Detected script configs. UserCreated configs are NEVER touched.
        if cfg.source == crate::models::RunConfigSource::Detected && cfg.service_id.is_none() {
            let is_script_config = cfg.id.starts_with("runyard:script:")
                || cfg.id.starts_with("script:")
                || cfg.command.starts_with("./")
                || cfg.command.ends_with(".sh")
                || cfg.command.ends_with(".py")
                || cfg.command.ends_with(".js");

            if is_script_config {
                let rel = cfg.command.trim_start_matches("./");
                let file_exists = project_path.join(rel).exists();
                let is_valid = valid_stable_ids.contains(&cfg.id)
                    || (file_exists
                        && scripts
                            .iter()
                            .any(|s| s.command == cfg.command || s.relative_path == rel));

                if !is_valid {
                    conn.execute("DELETE FROM run_configurations WHERE id = ?", [&cfg.id])?;
                }
            }
        }
    }

    Ok(())
}
