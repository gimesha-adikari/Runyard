use runyard_lib::models::*;
use runyard_lib::process_manager::ProcessManager;
use std::collections::HashMap;
use std::fs;
use std::process::Command;
use std::time::Duration;
use tempfile::tempdir;
use tokio::time::sleep;

#[tokio::test]
async fn test_full_project_scan_and_detection() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    // Create 3 projects
    let node_path = root.join("node-api");
    fs::create_dir_all(&node_path).unwrap();
    fs::write(
        node_path.join("package.json"),
        r#"{"name": "node-api", "dependencies": {"react": "^18.0.0", "express": "^4.18.0"}, "scripts": {"dev": "node index.js", "build": "node build.js"}}"#,
    ).unwrap();
    fs::write(node_path.join("tsconfig.json"), "{}").unwrap();
    fs::write(node_path.join("index.js"), "console.log('hello');").unwrap();

    Command::new("git")
        .args(["init"])
        .current_dir(&node_path)
        .status()
        .unwrap();
    Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(&node_path)
        .status()
        .unwrap();
    Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(&node_path)
        .status()
        .unwrap();
    fs::write(node_path.join("README.md"), "# node-api\n").unwrap();
    Command::new("git")
        .args(["add", "README.md"])
        .current_dir(&node_path)
        .status()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "init node api"])
        .current_dir(&node_path)
        .status()
        .unwrap();

    let py_path = root.join("python-worker");
    fs::create_dir_all(&py_path).unwrap();
    fs::write(
        py_path.join("pyproject.toml"),
        "[project]\nname = \"python-worker\"",
    )
    .unwrap();

    let rust_path = root.join("rust-cli");
    fs::create_dir_all(&rust_path).unwrap();
    fs::write(
        rust_path.join("Cargo.toml"),
        "[package]\nname = \"rust-cli\"",
    )
    .unwrap();

    // 1. Scan directory
    let scanned = runyard_lib::scanner::scan_directory(root.to_str().unwrap())
        .expect("scan_directory failed");
    assert_eq!(scanned.len(), 3, "Expected 3 projects in directory");

    let paths: Vec<String> = scanned.iter().map(|p| p.path.clone()).collect();
    assert!(paths.iter().any(|p| p.ends_with("node-api")));
    assert!(paths.iter().any(|p| p.ends_with("python-worker")));
    assert!(paths.iter().any(|p| p.ends_with("rust-cli")));

    // 2. Detection on node-api
    let node_det = runyard_lib::detector::detect_project_type(node_path.to_str().unwrap());
    assert_eq!(node_det.project_type, Some("Application".to_string()));
    assert!(node_det.languages.contains(&"TypeScript".to_string()));
    assert!(node_det.frameworks.contains(&"Express".to_string()));
    assert!(node_det.frameworks.contains(&"React".to_string()));

    // 3. Git status on node-api
    let git =
        runyard_lib::git::get_git_status(node_path.to_str().unwrap()).expect("git status failed");
    assert!(git.branch.is_some());
    assert!(
        !git.is_clean,
        "Expected dirty git repo because index.js is untracked"
    );
    assert!(git.untracked_files.iter().any(|f| f.contains("index.js")));
    assert!(!git.recent_commits.is_empty());
    assert_eq!(git.recent_commits[0].message, "init node api");

    // 4. Run config detection on node-api
    let configs = runyard_lib::runtime_detector::detect_run_configs(node_path.to_str().unwrap());
    assert!(configs.iter().any(|c| c.name == "npm run dev"));
    assert!(configs.iter().any(|c| c.name == "npm run build"));
}

#[tokio::test]
async fn test_process_lifecycle_and_log_streaming() {
    let dir = tempdir().unwrap();
    let working_dir = dir.path().to_str().unwrap().to_string();

    let pm = ProcessManager::new();
    let project_id = "test-node-proj";

    let mut config = RunConfiguration {
        id: "config-test-1".to_string(),
        project_id: project_id.to_string(),
        service_id: None,
        name: "Test Echo Service".to_string(),
        command: "sh".to_string(),
        args: vec![
            "-c".to_string(),
            "echo 'Runyard Service Started'; echo 'Ping 1'; echo 'Ping 2'; sleep 10".to_string(),
        ],
        working_dir: Some(working_dir),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    config.trusted_fingerprint = Some(config.compute_fingerprint());

    // 1. Start process
    let proc_id = pm
        .start_process(project_id, config)
        .await
        .expect("Failed to start process");
    assert!(!proc_id.is_empty());

    // Allow process to emit lines
    sleep(Duration::from_millis(200)).await;

    // 2. Check process info
    let procs = pm.get_all_processes().await;
    let proc_info = procs
        .iter()
        .find(|p| p.id == proc_id)
        .expect("Process not found in manager");
    assert!(proc_info.pid.is_some());

    // 3. Check streamed output
    let output = pm.get_output(&proc_id, 0).await;
    assert!(
        !output.is_empty(),
        "Expected streamed output lines, got empty"
    );
    let combined_log: String = output
        .iter()
        .map(|l| l.content.clone())
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        combined_log.contains("Runyard Service Started"),
        "Log should contain startup message, got: {}",
        combined_log
    );
    assert!(
        combined_log.contains("Ping"),
        "Log should contain ping ticks, got: {}",
        combined_log
    );

    // 4. Stop process
    pm.stop_process(&proc_id)
        .await
        .expect("Failed to stop process");

    let procs_after = pm.get_all_processes().await;
    let proc_after = procs_after
        .iter()
        .find(|p| p.id == proc_id)
        .expect("Process not found");
    assert_eq!(proc_after.status, ProcessStatus::Stopped);
}
