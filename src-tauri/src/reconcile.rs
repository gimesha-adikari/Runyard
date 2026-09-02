use crate::error::Result;
use crate::models::{Project, Service};
use std::collections::HashMap;

pub fn reconcile_catalog() -> Result<()> {
    let all_projects = crate::db::get_all_projects()?;

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

                let parent_services = crate::db::get_services(&parent.id)?;
                let mut service_id = None;
                for svc in &parent_services {
                    if child.path.ends_with(&svc.path) {
                        service_id = Some(svc.id.clone());
                        break;
                    }
                }

                if service_id.is_none() {
                    let relative_path = child
                        .path
                        .strip_prefix(&parent.path)
                        .unwrap_or(&child.path)
                        .trim_start_matches('/')
                        .trim_start_matches('\\')
                        .to_string();

                    let new_svc = Service {
                        id: uuid::Uuid::new_v4().to_string(),
                        project_id: parent.id.clone(),
                        name: child.name.clone(),
                        path: relative_path,
                        service_type: child.project_type.clone(),
                        languages: child.languages.clone(),
                        frameworks: child.frameworks.clone(),
                        is_runnable: child.is_runnable,
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

    Ok(())
}
