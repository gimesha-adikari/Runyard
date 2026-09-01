use crate::error::{Result, RunyardError};
use crate::models::{
    AppSettings, DetectedIde, DetectedRunConfig, GitBranchInfo, GitFileDiff, GitStatus,
    ProcessInfo, Project, ProjectInspection, RunConfiguration, RunConfigSource, RunGroup, ScanRoot,
    Service,
};
use crate::{ProcessManagerState, PtyManagerState};
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, State};
use uuid::Uuid;

// Projects

#[tauri::command]
pub fn get_projects() -> Result<Vec<Project>> {
    crate::db::get_all_projects()
}

#[tauri::command]
pub fn get_project(id: String) -> Result<Project> {
    crate::db::get_project(&id)
}

#[tauri::command]
pub fn inspect_project_path(path: String) -> Result<ProjectInspection> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(RunyardError::Validation(format!(
            "Path '{}' does not exist or is not a directory",
            path
        )));
    }

    let existing = crate::db::get_project_by_path(&path)?;
    let already_imported = existing.is_some();

    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let det = crate::detector::detect_project_type(&path);
    let has_git = p.join(".git").exists();
    let git_status = if has_git {
        crate::git::get_git_status(&path).ok()
    } else {
        None
    };

    let scanned_services = crate::scanner::detect_services_in_project(&path);
    let project_id = existing
        .as_ref()
        .map(|proj| proj.id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let services: Vec<Service> = scanned_services
        .into_iter()
        .map(|s| Service {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.clone(),
            name: s.name,
            path: s.relative_path,
            service_type: s.service_type,
            languages: s.languages,
            frameworks: s.frameworks,
            created_at: chrono::Utc::now().to_rfc3339(),
        })
        .collect();

    let mut run_configs = crate::runtime_detector::detect_run_configs(&path);
    for svc in &services {
        let svc_full_path = p.join(&svc.path);
        let mut svc_configs =
            crate::runtime_detector::detect_run_configs(&svc_full_path.to_string_lossy());
        for cfg in &mut svc_configs {
            cfg.service_id = Some(svc.id.clone());
            cfg.service_name = Some(svc.name.clone());
        }
        run_configs.extend(svc_configs);
    }

    let project = Project {
        id: project_id,
        name,
        path: path.clone(),
        project_type: det.project_type,
        languages: det.languages,
        frameworks: det.frameworks,
        has_git,
        git_branch: git_status.as_ref().and_then(|g| g.branch.clone()),
        git_remote: git_status.as_ref().and_then(|g| g.remote_url.clone()),
        preferred_ide: existing.as_ref().and_then(|e| e.preferred_ide.clone()),
        default_run_config_id: existing.as_ref().and_then(|e| e.default_run_config_id.clone()),
        is_favorite: existing.as_ref().map(|e| e.is_favorite).unwrap_or(false),
        tags: existing.as_ref().map(|e| e.tags.clone()).unwrap_or_default(),
        last_opened: existing.as_ref().and_then(|e| e.last_opened.clone()),
        last_run: existing.as_ref().and_then(|e| e.last_run.clone()),
        created_at: existing
            .as_ref()
            .map(|e| e.created_at.clone())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
    };

    Ok(ProjectInspection {
        project,
        services,
        run_configs,
        git_status,
        already_imported,
    })
}

#[tauri::command]
pub fn import_project(path: String) -> Result<Project> {
    let inspection = inspect_project_path(path)?;
    crate::db::upsert_project(&inspection.project)?;

    for svc in &inspection.services {
        crate::db::upsert_service(svc)?;
    }

    for cfg in &inspection.run_configs {
        let run_config = RunConfiguration {
            id: Uuid::new_v4().to_string(),
            project_id: inspection.project.id.clone(),
            service_id: cfg.service_id.clone(),
            name: cfg.name.clone(),
            command: cfg.command.clone(),
            args: cfg.args.clone(),
            working_dir: cfg.working_dir.clone(),
            env_file: None,
            env_vars: HashMap::new(),
            is_trusted: false,
            is_default: false,
            source: RunConfigSource::Detected,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let _ = crate::db::save_run_config(&run_config);
    }

    Ok(inspection.project)
}

#[tauri::command]
pub fn remove_project(id: String) -> Result<()> {
    crate::db::delete_project(&id)
}

#[tauri::command]
pub fn scan_projects() -> Result<Vec<Project>> {
    let roots = crate::db::get_scan_roots()?;
    let mut scanned_all = Vec::new();

    for root in roots {
        if root.enabled {
            if let Ok(projects) = crate::scanner::scan_directory(&root.path) {
                for p in projects {
                    let path = Path::new(&p.path);
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| p.path.clone());

                    let det = crate::detector::detect_project_type(&p.path);
                    let git_status = if p.has_git {
                        crate::git::get_git_status(&p.path).ok()
                    } else {
                        None
                    };

                    let existing = crate::db::get_project_by_path(&p.path)?;
                    let project_id = existing
                        .as_ref()
                        .map(|proj| proj.id.clone())
                        .unwrap_or_else(|| Uuid::new_v4().to_string());

                    let project = Project {
                        id: project_id.clone(),
                        name,
                        path: p.path.clone(),
                        project_type: det.project_type,
                        languages: det.languages,
                        frameworks: det.frameworks,
                        has_git: p.has_git,
                        git_branch: git_status.as_ref().and_then(|g| g.branch.clone()),
                        git_remote: git_status.as_ref().and_then(|g| g.remote_url.clone()),
                        preferred_ide: existing.as_ref().and_then(|e| e.preferred_ide.clone()),
                        default_run_config_id: existing.as_ref().and_then(|e| e.default_run_config_id.clone()),
                        is_favorite: existing.as_ref().map(|e| e.is_favorite).unwrap_or(false),
                        tags: existing.as_ref().map(|e| e.tags.clone()).unwrap_or_default(),
                        last_opened: existing.as_ref().and_then(|e| e.last_opened.clone()),
                        last_run: existing.as_ref().and_then(|e| e.last_run.clone()),
                        created_at: existing
                            .as_ref()
                            .map(|e| e.created_at.clone())
                            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                    };

                    crate::db::upsert_project(&project)?;

                    // Save nested services
                    for svc in p.services {
                        let service = Service {
                            id: Uuid::new_v4().to_string(),
                            project_id: project_id.clone(),
                            name: svc.name,
                            path: svc.relative_path,
                            service_type: svc.service_type,
                            languages: svc.languages,
                            frameworks: svc.frameworks,
                            created_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _ = crate::db::upsert_service(&service);
                    }

                    // Populate detected run configs
                    let detected_configs = crate::runtime_detector::detect_run_configs(&p.path);
                    for cfg in detected_configs {
                        let run_config = RunConfiguration {
                            id: Uuid::new_v4().to_string(),
                            project_id: project_id.clone(),
                            service_id: None,
                            name: cfg.name,
                            command: cfg.command,
                            args: cfg.args,
                            working_dir: cfg.working_dir,
                            env_file: None,
                            env_vars: HashMap::new(),
                            is_trusted: false,
                            is_default: false,
                            source: RunConfigSource::Detected,
                            created_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _ = crate::db::save_run_config(&run_config);
                    }

                    scanned_all.push(project);
                }
            }
        }
    }

    crate::db::get_all_projects()
}

#[tauri::command]
pub fn toggle_favorite(id: String) -> Result<bool> {
    crate::db::toggle_favorite(&id)
}

#[tauri::command]
pub fn update_project_tags(id: String, tags: Vec<String>) -> Result<()> {
    crate::db::update_project_tags(&id, tags)
}

#[tauri::command]
pub fn set_project_ide(project_id: String, ide_id: String) -> Result<()> {
    crate::db::set_preferred_ide(&project_id, &ide_id)
}

#[tauri::command]
pub fn search_projects(query: String) -> Result<Vec<Project>> {
    let projects = crate::db::get_all_projects()?;
    let q = query.to_lowercase();
    Ok(projects
        .into_iter()
        .filter(|p| {
            p.name.to_lowercase().contains(&q)
                || p.path.to_lowercase().contains(&q)
                || p.tags.iter().any(|t| t.to_lowercase().contains(&q))
                || p.languages.iter().any(|l| l.to_lowercase().contains(&q))
                || p.frameworks.iter().any(|f| f.to_lowercase().contains(&q))
        })
        .collect())
}

// Services

#[tauri::command]
pub fn get_project_services(project_id: String) -> Result<Vec<Service>> {
    crate::db::get_services(&project_id)
}

// Scan Roots

#[tauri::command]
pub fn get_scan_roots() -> Result<Vec<ScanRoot>> {
    crate::db::get_scan_roots()
}

#[tauri::command]
pub fn add_scan_root(path: String) -> Result<ScanRoot> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(RunyardError::Validation(format!(
            "Path '{}' does not exist or is not a directory",
            path
        )));
    }
    let root = ScanRoot {
        id: Uuid::new_v4().to_string(),
        path,
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    crate::db::add_scan_root(&root)?;
    Ok(root)
}

#[tauri::command]
pub fn remove_scan_root(id: String) -> Result<()> {
    crate::db::remove_scan_root(&id)
}

// Git

#[tauri::command]
pub fn get_git_status(project_path: String) -> Result<GitStatus> {
    crate::git::get_git_status(&project_path)
}

#[tauri::command]
pub fn get_git_branches(project_path: String) -> Result<Vec<GitBranchInfo>> {
    crate::git::get_git_branches(&project_path)
}

#[tauri::command]
pub fn get_file_diff(project_path: String, file_path: String, staged: bool) -> Result<GitFileDiff> {
    crate::git::get_file_diff(&project_path, &file_path, staged)
}

#[tauri::command]
pub fn git_fetch(project_path: String) -> Result<String> {
    crate::git::git_fetch(&project_path)
}

#[tauri::command]
pub fn git_pull(project_path: String) -> Result<String> {
    crate::git::git_pull(&project_path)
}

#[tauri::command]
pub fn git_checkout_branch(project_path: String, branch_name: String) -> Result<()> {
    crate::git::git_checkout_branch(&project_path, &branch_name)
}

#[tauri::command]
pub fn git_create_branch(project_path: String, branch_name: String) -> Result<()> {
    crate::git::git_create_branch(&project_path, &branch_name)
}

// IDE

#[tauri::command]
pub fn detect_ides() -> Result<Vec<DetectedIde>> {
    Ok(crate::ide::detect_ides())
}

#[tauri::command]
pub fn open_in_ide(command: String, project_path: String) -> Result<()> {
    crate::ide::open_in_ide(&command, &project_path)
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<()> {
    crate::ide::open_folder(&path)
}

#[tauri::command]
pub fn open_terminal(path: String) -> Result<()> {
    crate::ide::open_terminal(&path)
}

#[tauri::command]
pub fn get_default_ide() -> Result<Option<String>> {
    crate::db::get_setting("default_ide")
}

#[tauri::command]
pub fn set_default_ide(ide_id: String) -> Result<()> {
    crate::db::set_setting("default_ide", &ide_id)
}

// Run Configurations

#[tauri::command]
pub fn get_run_configs(project_id: String) -> Result<Vec<RunConfiguration>> {
    crate::db::get_run_configs(&project_id)
}

#[tauri::command]
pub fn detect_run_configs(project_path: String) -> Result<Vec<DetectedRunConfig>> {
    let p = Path::new(&project_path);
    let mut configs = crate::runtime_detector::detect_run_configs(&project_path);

    let services = crate::scanner::detect_services_in_project(&project_path);
    for svc in services {
        let svc_path = p.join(&svc.relative_path);
        let mut svc_configs =
            crate::runtime_detector::detect_run_configs(&svc_path.to_string_lossy());
        for cfg in &mut svc_configs {
            cfg.service_name = Some(svc.name.clone());
        }
        configs.extend(svc_configs);
    }

    Ok(configs)
}

#[tauri::command]
pub fn save_run_config(config: RunConfiguration) -> Result<()> {
    crate::db::save_run_config(&config)
}

#[tauri::command]
pub fn delete_run_config(id: String) -> Result<()> {
    crate::db::delete_run_config(&id)
}

#[tauri::command]
pub fn trust_run_config(id: String) -> Result<()> {
    let mut config = crate::db::get_run_config(&id)?;
    config.is_trusted = true;
    crate::db::save_run_config(&config)
}

#[tauri::command]
pub fn set_default_run_config(project_id: String, config_id: String) -> Result<()> {
    crate::db::set_default_run_config(&project_id, &config_id)
}

// Run Groups

#[tauri::command]
pub fn get_run_groups(project_id: String) -> Result<Vec<RunGroup>> {
    crate::db::get_run_groups(&project_id)
}

#[tauri::command]
pub fn save_run_group(group: RunGroup) -> Result<()> {
    crate::db::save_run_group(&group)
}

#[tauri::command]
pub fn delete_run_group(id: String) -> Result<()> {
    crate::db::delete_run_group(&id)
}

#[tauri::command]
pub async fn start_run_group(
    group_id: String,
    state: State<'_, ProcessManagerState>,
) -> Result<Vec<String>> {
    let configs: Vec<RunConfiguration> = {
        let conn = crate::db::get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT run_config_id FROM run_group_members WHERE run_group_id = ? ORDER BY order_index ASC",
        )?;
        let config_ids: Vec<String> = stmt
            .query_map([&group_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        drop(conn);

        let mut res = Vec::new();
        for cid in config_ids {
            let config = crate::db::get_run_config(&cid)?;
            if !config.is_trusted {
                return Err(RunyardError::Validation(format!(
                    "Run configuration '{}' in group is not trusted. Approve it first.",
                    config.name
                )));
            }
            res.push(config);
        }
        res
    };

    let mut started_process_ids = Vec::new();

    for config in configs {
        let project_id = config.project_id.clone();
        let _ = crate::db::update_last_run(&project_id);

        let pm = state.lock().await;
        if let Ok(pid) = pm.start_process(&project_id, config).await {
            started_process_ids.push(pid);
        }
    }

    Ok(started_process_ids)
}

#[tauri::command]
pub async fn stop_run_group(
    group_id: String,
    state: State<'_, ProcessManagerState>,
) -> Result<()> {
    let config_ids: Vec<String> = {
        let conn = crate::db::get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT run_config_id FROM run_group_members WHERE run_group_id = ? ORDER BY order_index ASC",
        )?;
        let ids: Vec<String> = stmt
            .query_map([&group_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };

    let pm = state.lock().await;
    let procs = pm.get_all_processes().await;
    for p in procs {
        if config_ids.contains(&p.run_config_id) && p.status == crate::models::ProcessStatus::Running {
            let _ = pm.stop_process(&p.id).await;
        }
    }

    Ok(())
}

// Processes & Output

#[tauri::command]
pub async fn start_process(
    run_config_id: String,
    state: State<'_, ProcessManagerState>,
) -> Result<String> {
    let config = crate::db::get_run_config(&run_config_id)?;

    if !config.is_trusted {
        return Err(RunyardError::Validation(
            "Run configuration is not trusted. Approve it before running.".to_string(),
        ));
    }

    let project_id = config.project_id.clone();
    crate::db::update_last_run(&project_id)?;

    let pm = state.lock().await;
    pm.start_process(&project_id, config).await
}

#[tauri::command]
pub async fn stop_process(
    process_id: String,
    state: State<'_, ProcessManagerState>,
) -> Result<()> {
    let pm = state.lock().await;
    pm.stop_process(&process_id).await
}

#[tauri::command]
pub async fn restart_process(
    process_id: String,
    state: State<'_, ProcessManagerState>,
) -> Result<()> {
    let pm = state.lock().await;
    pm.stop_process(&process_id).await?;
    let info = pm.get_all_processes().await;
    drop(pm);

    if let Some(proc_info) = info.iter().find(|p| p.id == process_id) {
        let config = crate::db::get_run_config(&proc_info.run_config_id)?;
        let project_id = config.project_id.clone();
        let pm = state.lock().await;
        pm.start_process(&project_id, config).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_processes(state: State<'_, ProcessManagerState>) -> Result<Vec<ProcessInfo>> {
    let pm = state.lock().await;
    Ok(pm.get_all_processes().await)
}

#[tauri::command]
pub async fn get_process_output(
    process_id: String,
    since_line: usize,
    state: State<'_, ProcessManagerState>,
) -> Result<Vec<crate::process_manager::OutputLine>> {
    let pm = state.lock().await;
    Ok(pm.get_output(&process_id, since_line).await)
}

#[tauri::command]
pub async fn clear_process_output(
    process_id: String,
    state: State<'_, ProcessManagerState>,
) -> Result<()> {
    let pm = state.lock().await;
    pm.clear_output(&process_id).await
}

// PTY Terminal

#[tauri::command]
pub fn create_pty_session(
    app_handle: AppHandle,
    project_path: String,
    cols: u16,
    rows: u16,
    state: State<'_, PtyManagerState>,
) -> Result<String> {
    state.create_session(app_handle, &project_path, cols, rows)
}

#[tauri::command]
pub async fn write_pty_session(
    session_id: String,
    data: String,
    state: State<'_, PtyManagerState>,
) -> Result<()> {
    state.write_session(&session_id, &data).await
}

#[tauri::command]
pub async fn resize_pty_session(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, PtyManagerState>,
) -> Result<()> {
    state.resize_session(&session_id, cols, rows).await
}

#[tauri::command]
pub async fn close_pty_session(
    session_id: String,
    state: State<'_, PtyManagerState>,
) -> Result<()> {
    state.close_session(&session_id).await
}

// Settings

#[tauri::command]
pub fn get_settings() -> Result<AppSettings> {
    let default_ide = crate::db::get_setting("default_ide")?;
    let scan_roots = crate::db::get_scan_roots()?;
    Ok(AppSettings {
        default_ide,
        scan_roots,
    })
}

#[tauri::command]
pub fn update_setting(key: String, value: String) -> Result<()> {
    crate::db::set_setting(&key, &value)
}
