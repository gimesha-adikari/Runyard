use runyard_lib::models::*;
use runyard_lib::process_manager::ProcessManager;
use std::collections::HashMap;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::test]
async fn test_full_project_scan_and_detection() {
    let root = "/home/gimesha/My_Projects/TestProjects";
    
    // 1. Scan directory
    let scanned = runyard_lib::scanner::scan_directory(root).expect("scan_directory failed");
    assert_eq!(scanned.len(), 3, "Expected 3 projects in TestProjects directory");

    let paths: Vec<String> = scanned.iter().map(|p| p.path.clone()).collect();
    assert!(paths.iter().any(|p| p.ends_with("node-api")));
    assert!(paths.iter().any(|p| p.ends_with("python-worker")));
    assert!(paths.iter().any(|p| p.ends_with("rust-cli")));

    // 2. Detection on node-api
    let node_path = "/home/gimesha/My_Projects/TestProjects/node-api";
    let node_det = runyard_lib::detector::detect_project_type(node_path);
    assert_eq!(node_det.project_type, Some("node".to_string()));
    assert!(node_det.languages.contains(&"TypeScript".to_string()));
    assert!(node_det.frameworks.contains(&"Express".to_string()));
    assert!(node_det.frameworks.contains(&"React".to_string()));

    // 3. Git status on node-api
    let git = runyard_lib::git::get_git_status(node_path).expect("git status failed");
    assert_eq!(git.branch, Some("master".to_string()));
    assert!(!git.is_clean, "Expected dirty git repo because index.js is untracked");
    assert!(git.untracked_files.iter().any(|f| f.contains("index.js")));
    assert!(!git.recent_commits.is_empty());
    assert_eq!(git.recent_commits[0].message, "init node api");

    // 4. Run config detection on node-api
    let configs = runyard_lib::runtime_detector::detect_run_configs(node_path);
    assert!(configs.iter().any(|c| c.name == "npm run dev"));
    assert!(configs.iter().any(|c| c.name == "npm run build"));
}

#[tokio::test]
async fn test_process_lifecycle_and_log_streaming() {
    let pm = ProcessManager::new();
    let project_id = "test-node-proj";
    
    let config = RunConfiguration {
        id: "config-test-1".to_string(),
        project_id: project_id.to_string(),
        service_id: None,
        name: "Test Echo Service".to_string(),
        command: "sh".to_string(),
        args: vec![
            "-c".to_string(),
            "echo 'Runyard Service Started'; for i in 1 2 3; do echo \"Ping $i\"; sleep 0.1; done".to_string(),
        ],
        working_dir: Some("/home/gimesha/My_Projects/TestProjects/node-api".to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    // 1. Start process
    let proc_id = pm.start_process(project_id, config).await.expect("Failed to start process");
    assert!(!proc_id.is_empty());

    // Allow process to emit lines
    sleep(Duration::from_millis(500)).await;

    // 2. Check process info
    let procs = pm.get_all_processes().await;
    let proc_info = procs.iter().find(|p| p.id == proc_id).expect("Process not found in manager");
    assert!(proc_info.pid.is_some());

    // 3. Check streamed output
    let output = pm.get_output(&proc_id, 0).await;
    println!("Captured output: {:?}", output);
    assert!(!output.is_empty(), "Expected streamed output lines, got empty");
    let combined_log: String = output.iter().map(|l| l.content.clone()).collect::<Vec<_>>().join("\n");
    assert!(combined_log.contains("Runyard Service Started"), "Log should contain startup message, got: {}", combined_log);
    assert!(combined_log.contains("Ping"), "Log should contain ping ticks, got: {}", combined_log);

    // 4. Stop process
    pm.stop_process(&proc_id).await.expect("Failed to stop process");
    sleep(Duration::from_millis(200)).await;

    let procs_after = pm.get_all_processes().await;
    let proc_after = procs_after.iter().find(|p| p.id == proc_id).expect("Process not found");
    assert_eq!(proc_after.status, ProcessStatus::Stopped);
}
