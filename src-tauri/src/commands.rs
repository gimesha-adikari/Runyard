use crate::error::{Result, RunyardError};
use crate::models::{
    AppSettings, DetectedIde, DetectedRunConfig, GitBranchInfo, GitFileDiff, GitStatus,
    ProcessInfo, Project, ProjectInspection, RunConfigSource, RunConfiguration, RunGroup, ScanRoot,
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
    let _ = crate::reconcile::reconcile_catalog();

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

    let mut services: Vec<Service> = scanned_services
        .into_iter()
        .map(|s| Service {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.clone(),
            name: s.name,
            path: s.relative_path,
            service_type: s.service_type,
            languages: s.languages,
            frameworks: s.frameworks,
            is_runnable: false,
            source: crate::models::ServiceSource::Detected,
            created_at: chrono::Utc::now().to_rfc3339(),
        })
        .collect();

    let mut run_configs = crate::runtime_detector::detect_run_configs(&path);
    for svc in &mut services {
        let svc_full_path = p.join(&svc.path);
        let mut svc_configs =
            crate::runtime_detector::detect_run_configs(&svc_full_path.to_string_lossy());
        if !svc_configs.is_empty() {
            svc.is_runnable = true;
        }
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
        default_run_config_id: existing
            .as_ref()
            .and_then(|e| e.default_run_config_id.clone()),
        is_favorite: existing.as_ref().map(|e| e.is_favorite).unwrap_or(false),
        tags: existing
            .as_ref()
            .map(|e| e.tags.clone())
            .unwrap_or_default(),
        last_opened: existing.as_ref().and_then(|e| e.last_opened.clone()),
        last_run: existing.as_ref().and_then(|e| e.last_run.clone()),
        source: crate::models::ProjectSource::Manual,
        parent_project_id: None,
        is_runnable: false,
        is_archived: false,
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
            trusted_fingerprint: None,
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
pub async fn scan_projects(
    coordinator: State<'_, crate::ScanCoordinatorState>,
    app: AppHandle,
) -> Result<Vec<Project>> {
    let roots = crate::db::get_scan_roots()?;
    for root in roots {
        if root.enabled {
            coordinator
                .request_scan(&root.id, &root.path, Some(app.clone()))
                .await;
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
    let _ = crate::reconcile::reconcile_catalog();

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
pub async fn add_scan_root(
    path: String,
    coordinator: State<'_, crate::ScanCoordinatorState>,
    app: AppHandle,
) -> Result<ScanRoot> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(RunyardError::Validation(format!(
            "Path '{}' does not exist or is not a directory",
            path
        )));
    }
    let root = ScanRoot {
        id: Uuid::new_v4().to_string(),
        path: path.clone(),
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    crate::db::add_scan_root(&root)?;

    // Automatically begin discovery for this newly added root only!
    coordinator
        .request_scan(&root.id, &root.path, Some(app))
        .await;

    Ok(root)
}

#[tauri::command]
pub async fn remove_scan_root(
    id: String,
    coordinator: State<'_, crate::ScanCoordinatorState>,
    app: AppHandle,
) -> Result<()> {
    // 1. Cancel in-flight scan for this root immediately so stale results are never committed
    coordinator.cancel_root_scan(&id, Some(&app)).await;

    // 2. Perform DB removal and catalog cleanup
    crate::db::remove_scan_root(&id)?;
    Ok(())
}

#[tauri::command]
pub async fn rescan_root(
    id: String,
    coordinator: State<'_, crate::ScanCoordinatorState>,
    app: AppHandle,
) -> Result<()> {
    let roots = crate::db::get_scan_roots()?;
    if let Some(root) = roots.into_iter().find(|r| r.id == id) {
        if root.enabled {
            coordinator
                .request_scan(&root.id, &root.path, Some(app))
                .await;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_scan_status(
    coordinator: State<'_, crate::ScanCoordinatorState>,
) -> Result<HashMap<String, crate::scan_coordinator::ScanProgress>> {
    Ok(coordinator.get_all_progress().await)
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

#[tauri::command]
pub fn detect_git() -> crate::models::GitInstalledInfo {
    crate::git::detect_git()
}

#[tauri::command]
pub fn git_stage_file(project_path: String, file_path: String) -> Result<()> {
    crate::git::git_stage_file(&project_path, &file_path)
}

#[tauri::command]
pub fn git_stage_all(project_path: String) -> Result<()> {
    crate::git::git_stage_all(&project_path)
}

#[tauri::command]
pub fn git_unstage_file(project_path: String, file_path: String) -> Result<()> {
    crate::git::git_unstage_file(&project_path, &file_path)
}

#[tauri::command]
pub fn git_commit(project_path: String, message: String) -> Result<String> {
    crate::git::git_commit(&project_path, &message)
}

#[tauri::command]
pub fn git_push(project_path: String) -> Result<String> {
    crate::git::git_push(&project_path)
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
    let mut configs = crate::db::get_run_configs(&project_id)?;
    if let Ok(project) = crate::db::get_project(&project_id) {
        let p_path = Path::new(&project.path);
        for cfg in &mut configs {
            let base_dir = cfg.working_dir.as_deref().map(Path::new).or(Some(p_path));
            cfg.is_trusted = cfg.is_trust_valid_with_base(base_dir);
        }
    }
    Ok(configs)
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
pub fn detect_project_scripts(
    project_path: String,
    project_id: Option<String>,
) -> Result<Vec<crate::models::ProjectScript>> {
    let conn = crate::db::get_connection().ok();
    detect_project_scripts_with_conn(conn.as_ref(), &project_path, project_id.as_deref())
}

pub fn detect_project_scripts_with_conn(
    conn: Option<&rusqlite::Connection>,
    project_path: &str,
    project_id: Option<&str>,
) -> Result<Vec<crate::models::ProjectScript>> {
    let p = Path::new(project_path);
    let pid = project_id.unwrap_or_default();
    if let Some(c) = conn {
        if !pid.is_empty() {
            let _ = crate::reconcile::reconcile_project_script_configs(c, pid, p);
        }
    }
    let mut scripts = crate::script_detector::detect_project_scripts(p, pid);

    if let Some(c) = conn {
        if let Ok(configs) = crate::db::get_run_configs_with_conn(c, pid) {
            for script in &mut scripts {
                let clean_rel = script.relative_path.clone();
                let stable_id = uuid::Uuid::new_v5(
                    &uuid::Uuid::NAMESPACE_DNS,
                    format!("runyard:script:{}:{}", pid, clean_rel).as_bytes(),
                )
                .to_string();

                if let Some(cfg) = configs.iter().find(|cfg_item| {
                    cfg_item.id == stable_id
                        || cfg_item.command == script.command
                        || cfg_item.command == format!("./{}", script.relative_path)
                        || cfg_item.command == script.relative_path
                }) {
                    script.is_trusted = cfg.is_trust_valid_with_base(Some(p));
                    script.trusted_fingerprint = cfg.trusted_fingerprint.clone();
                }
            }
        }
    }

    Ok(scripts)
}

#[tauri::command]
pub fn inspect_script_detection(
    project_path: String,
    project_id: Option<String>,
) -> Result<(
    Vec<crate::models::ProjectScript>,
    crate::script_detector::ScriptDetectionMetrics,
)> {
    let p = Path::new(&project_path);
    let pid = project_id.unwrap_or_default();
    let (mut scripts, metrics) =
        crate::script_detector::detect_project_scripts_with_metrics(p, &pid);

    if let Ok(conn) = crate::db::get_connection() {
        if let Ok(configs) = crate::db::get_run_configs_with_conn(&conn, &pid) {
            for script in &mut scripts {
                let clean_rel = script.relative_path.clone();
                let stable_id = uuid::Uuid::new_v5(
                    &uuid::Uuid::NAMESPACE_DNS,
                    format!("runyard:script:{}:{}", pid, clean_rel).as_bytes(),
                )
                .to_string();

                if let Some(cfg) = configs.iter().find(|c| {
                    c.id == stable_id
                        || c.command == script.command
                        || c.command == format!("./{}", script.relative_path)
                        || c.command == script.relative_path
                }) {
                    script.is_trusted = cfg.is_trust_valid_with_base(Some(p));
                    script.trusted_fingerprint = cfg.trusted_fingerprint.clone();
                }
            }
        }
    }

    Ok((scripts, metrics))
}

#[tauri::command]
pub fn get_or_create_script_run_config(
    project_id: String,
    script_relative_path: String,
) -> Result<RunConfiguration> {
    let conn = crate::db::get_connection()?;
    get_or_create_script_run_config_with_conn(&conn, &project_id, &script_relative_path)
}

pub fn get_or_create_script_run_config_with_conn(
    conn: &rusqlite::Connection,
    project_id: &str,
    script_relative_path: &str,
) -> Result<RunConfiguration> {
    let project = crate::db::get_project_with_conn(conn, project_id)?;
    let p_path = Path::new(&project.path);
    let full_script_path = p_path.join(script_relative_path);

    let canonical_base = p_path
        .canonicalize()
        .map_err(|e| RunyardError::Validation(format!("Invalid project path: {}", e)))?;
    let canonical_script = full_script_path
        .canonicalize()
        .map_err(|e| RunyardError::Validation(format!("Script file does not exist: {}", e)))?;

    if !canonical_script.starts_with(&canonical_base) {
        return Err(RunyardError::Validation(
            "Script target escapes project root".into(),
        ));
    }

    let clean_rel = canonical_script
        .strip_prefix(&canonical_base)
        .unwrap_or(&canonical_script)
        .to_string_lossy()
        .to_string();

    let stable_id = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_DNS,
        format!("runyard:script:{}:{}", project_id, clean_rel).as_bytes(),
    )
    .to_string();

    let existing_configs = crate::db::get_run_configs_with_conn(conn, project_id)?;

    // 1. If an existing config matches by stable ID, return it
    if let Some(cfg) = existing_configs.iter().find(|c| c.id == stable_id) {
        return Ok(cfg.clone());
    }

    // 2. If a config matches by command or relative path, return it (never overwrite UserCreated)
    let cmd_variant_1 = format!("./{}", clean_rel);
    let cmd_variant_2 = clean_rel.clone();
    if let Some(cfg) = existing_configs.iter().find(|c| {
        (c.working_dir.as_deref() == Some(&project.path) || c.working_dir.is_none())
            && (c.command == cmd_variant_1
                || c.command == cmd_variant_2
                || c.command.ends_with(&clean_rel))
    }) {
        return Ok(cfg.clone());
    }

    // 3. Create deterministic Detected config
    let file_name = canonical_script
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| clean_rel.clone());

    let new_config = RunConfiguration {
        id: stable_id,
        project_id: project_id.to_string(),
        service_id: None,
        name: file_name,
        command: format!("./{}", clean_rel),
        args: vec![],
        working_dir: Some(project.path),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: false,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::Detected,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    crate::db::save_run_config_with_conn(conn, &new_config)?;
    Ok(new_config)
}

#[tauri::command]
pub fn save_run_config(config: RunConfiguration) -> Result<()> {
    crate::db::save_run_config(&config)
}

#[tauri::command]
pub fn delete_run_config(id: String) -> Result<()> {
    crate::db::delete_run_config(&id)
}

pub fn trust_run_config_with_conn(conn: &rusqlite::Connection, id: &str) -> Result<()> {
    let mut config = crate::db::get_run_config_with_conn(conn, id)?;
    let project = crate::db::get_project_with_conn(conn, &config.project_id).ok();
    let base_dir = config
        .working_dir
        .as_deref()
        .map(Path::new)
        .or_else(|| project.as_ref().map(|p| Path::new(&p.path)));

    config.is_trusted = true;
    config.trusted_fingerprint = Some(config.compute_fingerprint_with_base(base_dir));
    crate::db::save_run_config_with_conn(conn, &config)
}

#[tauri::command]
pub fn trust_run_config(id: String) -> Result<()> {
    let conn = crate::db::get_connection()?;
    trust_run_config_with_conn(&conn, &id)
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
            let project = crate::db::get_project(&config.project_id).ok();
            let base_dir = config
                .working_dir
                .as_deref()
                .map(Path::new)
                .or_else(|| project.as_ref().map(|p| Path::new(&p.path)));

            if !config.is_trust_valid_with_base(base_dir) {
                return Err(RunyardError::Validation(format!(
                    "Run configuration '{}' in group is not trusted or its execution semantics changed. Please re-approve before running.",
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
        if let Ok(info) = pm.start_process(&project_id, config).await {
            started_process_ids.push(info.id);
        }
    }

    Ok(started_process_ids)
}

#[tauri::command]
pub async fn stop_run_group(group_id: String, state: State<'_, ProcessManagerState>) -> Result<()> {
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
        if config_ids.contains(&p.run_config_id)
            && p.status == crate::models::ProcessStatus::Running
        {
            let _ = pm.stop_process(&p.id).await;
        }
    }

    Ok(())
}

// Processes & Output

fn is_terminal_required(config: &RunConfiguration, base_dir: Option<&Path>) -> bool {
    if let Ok(Some(script_path)) = config.resolve_script_path(base_dir) {
        if let Ok(bytes) = std::fs::read(&script_path) {
            let content = String::from_utf8_lossy(&bytes);
            let (mode, _) = crate::script_detector::detect_interactive_signals(&content);
            return mode == crate::models::ScriptExecutionMode::TerminalRequired;
        }
    }
    false
}

pub async fn start_configured_process_core(
    config: RunConfiguration,
    project: Option<&Project>,
    state: &ProcessManagerState,
    pty_state: &PtyManagerState,
    app_handle: Option<AppHandle>,
) -> Result<ProcessInfo> {
    let project_id = config.project_id.clone();
    let base_dir = config
        .working_dir
        .as_deref()
        .map(Path::new)
        .or_else(|| project.map(|p| Path::new(&p.path)));

    if is_terminal_required(&config, base_dir) {
        let working_dir_str = config
            .working_dir
            .as_deref()
            .or_else(|| project.map(|p| p.path.as_str()))
            .unwrap_or(".");

        let (session_id, pid) = pty_state.create_command_session(
            app_handle.clone(),
            working_dir_str,
            &config.command,
            &config.args,
            &config.env_vars,
            80,
            24,
        )?;

        let pm = state.lock().await;
        let info = pm
            .register_pty_process(&project_id, &config, pid, &session_id)
            .await?;

        if let Some(app) = app_handle {
            let pm_clone = state.clone();
            let proc_id_clone = info.id.clone();
            let session_id_clone = session_id.clone();
            tokio::spawn(async move {
                use tauri::Listener;
                let (tx, rx) = tokio::sync::oneshot::channel();
                let tx_mutex = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
                let unlisten = app.listen(format!("pty-exit-{}", session_id_clone), move |_| {
                    if let Some(sender) = tx_mutex.lock().unwrap().take() {
                        let _ = sender.send(());
                    }
                });
                let _ = rx.await;
                app.unlisten(unlisten);
                let pm = pm_clone.lock().await;
                pm.mark_process_exited(&proc_id_clone, 0).await;
            });
        }

        Ok(info)
    } else {
        let pm = state.lock().await;
        pm.start_process(&project_id, config).await
    }
}

pub async fn start_process_with_state_and_conn(
    conn: &rusqlite::Connection,
    run_config_id: &str,
    state: &ProcessManagerState,
    pty_state: &PtyManagerState,
    app_handle: Option<AppHandle>,
) -> Result<ProcessInfo> {
    let (config, project) = {
        let config = crate::db::get_run_config_with_conn(conn, run_config_id)?;
        let project = crate::db::get_project_with_conn(conn, &config.project_id).ok();
        let _ = crate::db::update_last_run_with_conn(conn, &config.project_id);

        let base_dir = config
            .working_dir
            .as_deref()
            .map(Path::new)
            .or_else(|| project.as_ref().map(|p| Path::new(&p.path)));

        if !config.is_trust_valid_with_base(base_dir) {
            return Err(RunyardError::Validation(
                "Run configuration is not trusted or its execution semantics changed. Please re-approve before running.".to_string(),
            ));
        }
        (config, project)
    };

    start_configured_process_core(config, project.as_ref(), state, pty_state, app_handle).await
}

pub async fn run_untrusted_once_with_state_and_conn(
    conn: &rusqlite::Connection,
    run_config_id: &str,
    state: &ProcessManagerState,
    pty_state: &PtyManagerState,
    app_handle: Option<AppHandle>,
) -> Result<ProcessInfo> {
    let (config, project) = {
        let config = crate::db::get_run_config_with_conn(conn, run_config_id)?;
        let project = crate::db::get_project_with_conn(conn, &config.project_id).ok();
        let _ = crate::db::update_last_run_with_conn(conn, &config.project_id);
        (config, project)
    };
    start_configured_process_core(config, project.as_ref(), state, pty_state, app_handle).await
}

pub async fn stop_process_with_state(
    process_id: &str,
    state: &ProcessManagerState,
    pty_state: &PtyManagerState,
) -> Result<()> {
    let pty_sid = {
        let pm = state.lock().await;
        let procs = pm.get_all_processes().await;
        procs
            .iter()
            .find(|p| p.id == process_id)
            .and_then(|p| p.pty_session_id.clone())
    };

    let pm = state.lock().await;
    let res = pm.stop_process(process_id).await;

    if let Some(sid) = pty_sid {
        let _ = pty_state.close_session(&sid).await;
    }

    res
}

pub async fn list_processes_with_state(state: &ProcessManagerState) -> Vec<ProcessInfo> {
    let pm = state.lock().await;
    pm.get_all_processes().await
}

pub async fn write_pty_session_with_state(
    session_id: &str,
    data: &str,
    pty_state: &PtyManagerState,
) -> Result<()> {
    pty_state.write_session(session_id, data).await
}

#[tauri::command]
pub async fn start_process(
    run_config_id: String,
    state: State<'_, ProcessManagerState>,
    pty_state: State<'_, PtyManagerState>,
    app_handle: AppHandle,
) -> Result<ProcessInfo> {
    let (config, project) = {
        let conn = crate::db::get_connection()?;
        let config = crate::db::get_run_config_with_conn(&conn, &run_config_id)?;
        let project = crate::db::get_project_with_conn(&conn, &config.project_id).ok();
        let _ = crate::db::update_last_run_with_conn(&conn, &config.project_id);

        let base_dir = config
            .working_dir
            .as_deref()
            .map(Path::new)
            .or_else(|| project.as_ref().map(|p| Path::new(&p.path)));

        if !config.is_trust_valid_with_base(base_dir) {
            return Err(RunyardError::Validation(
                "Run configuration is not trusted or its execution semantics changed. Please re-approve before running.".to_string(),
            ));
        }
        (config, project)
    };

    start_configured_process_core(
        config,
        project.as_ref(),
        state.inner(),
        pty_state.inner(),
        Some(app_handle),
    )
    .await
}

#[tauri::command]
pub async fn run_untrusted_once(
    run_config_id: String,
    state: State<'_, ProcessManagerState>,
    pty_state: State<'_, PtyManagerState>,
    app_handle: AppHandle,
) -> Result<ProcessInfo> {
    let (config, project) = {
        let conn = crate::db::get_connection()?;
        let config = crate::db::get_run_config_with_conn(&conn, &run_config_id)?;
        let project = crate::db::get_project_with_conn(&conn, &config.project_id).ok();
        let _ = crate::db::update_last_run_with_conn(&conn, &config.project_id);
        (config, project)
    };

    start_configured_process_core(
        config,
        project.as_ref(),
        state.inner(),
        pty_state.inner(),
        Some(app_handle),
    )
    .await
}

#[tauri::command]
pub async fn stop_process(
    process_id: String,
    state: State<'_, ProcessManagerState>,
    pty_state: State<'_, PtyManagerState>,
) -> Result<()> {
    stop_process_with_state(&process_id, state.inner(), pty_state.inner()).await
}

#[tauri::command]
pub async fn restart_process(
    process_id: String,
    state: State<'_, ProcessManagerState>,
    pty_state: State<'_, PtyManagerState>,
    app_handle: AppHandle,
) -> Result<()> {
    let (config, project_id) = {
        let pm = state.lock().await;
        let procs = pm.get_all_processes().await;
        let proc_info = procs
            .iter()
            .find(|p| p.id == process_id)
            .ok_or_else(|| RunyardError::NotFound(format!("Process {} not found", process_id)))?;
        let config = crate::db::get_run_config(&proc_info.run_config_id)?;
        let project_id = proc_info.project_id.clone();
        (config, project_id)
    };

    let project = crate::db::get_project(&project_id).ok();
    let base_dir = config
        .working_dir
        .as_deref()
        .map(Path::new)
        .or_else(|| project.as_ref().map(|p| Path::new(&p.path)));

    if !config.is_trust_valid_with_base(base_dir) {
        return Err(RunyardError::Validation(
            "Run configuration is not trusted or its execution semantics changed. Please re-approve before running.".to_string(),
        ));
    }

    stop_process_with_state(&process_id, state.inner(), pty_state.inner()).await?;
    start_configured_process_core(
        config,
        project.as_ref(),
        state.inner(),
        pty_state.inner(),
        Some(app_handle),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_processes(state: State<'_, ProcessManagerState>) -> Result<Vec<ProcessInfo>> {
    Ok(list_processes_with_state(state.inner()).await)
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
    state.create_session(Some(app_handle), &project_path, cols, rows)
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
