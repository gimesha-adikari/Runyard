pub mod commands;
pub mod db;
pub mod detector;
pub mod error;
pub mod git;
pub mod ide;
pub mod models;
pub mod process_manager;
pub mod pty;
pub mod runtime_detector;
pub mod scanner;

use process_manager::ProcessManager;
use pty::PtyManager;
use std::sync::Arc;
use tokio::sync::Mutex;

pub type ProcessManagerState = Arc<Mutex<ProcessManager>>;
pub type PtyManagerState = Arc<PtyManager>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let process_manager = Arc::new(Mutex::new(ProcessManager::new()));
    let pty_manager = Arc::new(PtyManager::new());

    let pm_clone = process_manager.clone();
    let pty_clone = pty_manager.clone();

    let app = tauri::Builder::default()
        .manage(process_manager)
        .manage(pty_manager)
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_projects,
            commands::get_project,
            commands::inspect_project_path,
            commands::import_project,
            commands::remove_project,
            commands::scan_projects,
            commands::toggle_favorite,
            commands::update_project_tags,
            commands::set_project_ide,
            commands::search_projects,
            commands::get_project_services,
            commands::get_scan_roots,
            commands::add_scan_root,
            commands::remove_scan_root,
            commands::get_git_status,
            commands::get_git_branches,
            commands::get_file_diff,
            commands::git_fetch,
            commands::git_pull,
            commands::git_checkout_branch,
            commands::git_create_branch,
            commands::detect_ides,
            commands::open_in_ide,
            commands::open_folder,
            commands::open_terminal,
            commands::get_default_ide,
            commands::set_default_ide,
            commands::get_run_configs,
            commands::detect_run_configs,
            commands::save_run_config,
            commands::delete_run_config,
            commands::trust_run_config,
            commands::set_default_run_config,
            commands::get_run_groups,
            commands::save_run_group,
            commands::delete_run_group,
            commands::start_run_group,
            commands::stop_run_group,
            commands::start_process,
            commands::run_untrusted_once,
            commands::stop_process,
            commands::restart_process,
            commands::get_processes,
            commands::get_process_output,
            commands::clear_process_output,
            commands::create_pty_session,
            commands::write_pty_session,
            commands::resize_pty_session,
            commands::close_pty_session,
            commands::get_settings,
            commands::update_setting,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let pm = pm_clone.clone();
            let pty = pty_clone.clone();
            pty.shutdown_all();
            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                handle.block_on(async {
                    let pm_lock = pm.lock().await;
                    pm_lock.shutdown_all().await;
                });
            } else if let Ok(rt) = tokio::runtime::Runtime::new() {
                rt.block_on(async {
                    let pm_lock = pm.lock().await;
                    pm_lock.shutdown_all().await;
                });
            }
        }
    });
}
