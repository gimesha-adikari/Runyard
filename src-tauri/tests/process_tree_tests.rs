use runyard_lib::models::{ProcessStatus, RunConfigSource, RunConfiguration};
use runyard_lib::process_manager::ProcessManager;
use std::collections::HashMap;
use std::time::Duration;
use tempfile::tempdir;
use tokio::time::sleep;

#[tokio::test]
async fn test_process_natural_exit_zero_and_nonzero() {
    let pm = ProcessManager::new();
    let dir = tempdir().unwrap();
    let wd = dir.path().to_str().unwrap().to_string();

    // 1. Exit 0
    let mut config_zero = RunConfiguration {
        id: "cfg-zero".to_string(),
        project_id: "p1".to_string(),
        service_id: None,
        name: "Exit Zero".to_string(),
        command: "sh".to_string(),
        args: vec!["-c".to_string(), "exit 0".to_string()],
        working_dir: Some(wd.clone()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    config_zero.trusted_fingerprint = Some(config_zero.compute_fingerprint());

    let pid_zero = pm.start_process("p1", config_zero).await.unwrap();
    sleep(Duration::from_millis(300)).await;

    let procs = pm.get_all_processes().await;
    let proc_zero = procs.iter().find(|p| p.id == pid_zero).unwrap();
    assert_eq!(proc_zero.status, ProcessStatus::Exited);
    assert_eq!(proc_zero.exit_code, Some(0));

    // 2. Exit 42
    let mut config_nonzero = RunConfiguration {
        id: "cfg-nonzero".to_string(),
        project_id: "p1".to_string(),
        service_id: None,
        name: "Exit Nonzero".to_string(),
        command: "sh".to_string(),
        args: vec!["-c".to_string(), "exit 42".to_string()],
        working_dir: Some(wd),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    config_nonzero.trusted_fingerprint = Some(config_nonzero.compute_fingerprint());

    let pid_nonzero = pm.start_process("p1", config_nonzero).await.unwrap();
    sleep(Duration::from_millis(300)).await;

    let procs = pm.get_all_processes().await;
    let proc_nz = procs.iter().find(|p| p.id == pid_nonzero).unwrap();
    assert_eq!(proc_nz.status, ProcessStatus::Exited);
    assert_eq!(proc_nz.exit_code, Some(42));
}

#[tokio::test]
async fn test_spawn_failures_missing_executable_and_cwd() {
    let pm = ProcessManager::new();

    // 1. Missing executable
    let mut config_bad_exe = RunConfiguration {
        id: "cfg-bad-exe".to_string(),
        project_id: "p1".to_string(),
        service_id: None,
        name: "Bad Exe".to_string(),
        command: "non_existent_executable_12345".to_string(),
        args: vec![],
        working_dir: None,
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    config_bad_exe.trusted_fingerprint = Some(config_bad_exe.compute_fingerprint());

    let res_exe = pm.start_process("p1", config_bad_exe).await;
    assert!(res_exe.is_err());

    // 2. Missing cwd
    let mut config_bad_cwd = RunConfiguration {
        id: "cfg-bad-cwd".to_string(),
        project_id: "p1".to_string(),
        service_id: None,
        name: "Bad Cwd".to_string(),
        command: "sh".to_string(),
        args: vec!["-c".to_string(), "echo ok".to_string()],
        working_dir: Some("/non_existent_dir_abcdef".to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    config_bad_cwd.trusted_fingerprint = Some(config_bad_cwd.compute_fingerprint());

    let res_cwd = pm.start_process("p1", config_bad_cwd).await;
    assert!(res_cwd.is_err());
}

#[tokio::test]
async fn test_unix_process_tree_cleanup() {
    let pm = ProcessManager::new();
    let dir = tempdir().unwrap();
    let child_pid_file = dir.path().join("child.pid");

    // Script spawns a background child process, records its PID, and sleeps
    let script = format!("sleep 100 & echo $! > {}; wait", child_pid_file.display());

    let mut config = RunConfiguration {
        id: "cfg-tree".to_string(),
        project_id: "p1".to_string(),
        service_id: None,
        name: "Tree Process".to_string(),
        command: "sh".to_string(),
        args: vec!["-c".to_string(), script],
        working_dir: Some(dir.path().to_str().unwrap().to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    config.trusted_fingerprint = Some(config.compute_fingerprint());

    let proc_id = pm.start_process("p1", config).await.unwrap();

    // Wait for child PID to be written
    let mut child_pid: Option<i32> = None;
    for _ in 0..30 {
        if child_pid_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&child_pid_file) {
                if let Ok(pid) = content.trim().parse::<i32>() {
                    child_pid = Some(pid);
                    break;
                }
            }
        }
        sleep(Duration::from_millis(100)).await;
    }

    assert!(child_pid.is_some(), "Child PID file was not created");
    let cpid = child_pid.unwrap();

    // Verify child is alive initially
    #[cfg(unix)]
    {
        let alive = unsafe { libc::kill(cpid, 0) == 0 };
        assert!(alive, "Spawned child process should be alive before stop");
    }

    // Stop process
    pm.stop_process(&proc_id).await.unwrap();

    // Verify status is stopped
    let procs = pm.get_all_processes().await;
    let proc_info = procs.iter().find(|p| p.id == proc_id).unwrap();
    assert_eq!(proc_info.status, ProcessStatus::Stopped);

    // Verify that the child process tree is dead in OS process table
    #[cfg(unix)]
    {
        sleep(Duration::from_millis(300)).await;
        let alive_after = unsafe { libc::kill(cpid, 0) == 0 };
        assert!(
            !alive_after,
            "Spawned child process must be terminated when Runyard stops the process"
        );
    }
}

#[tokio::test]
async fn test_bounded_output_buffer() {
    let pm = ProcessManager::new();
    let dir = tempdir().unwrap();

    // Script emits 12,000 lines
    let mut config = RunConfiguration {
        id: "cfg-spam".to_string(),
        project_id: "p1".to_string(),
        service_id: None,
        name: "Spam Lines".to_string(),
        command: "sh".to_string(),
        args: vec![
            "-c".to_string(),
            "for i in $(seq 1 12000); do echo \"line $i\"; done".to_string(),
        ],
        working_dir: Some(dir.path().to_str().unwrap().to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    config.trusted_fingerprint = Some(config.compute_fingerprint());

    let proc_id = pm.start_process("p1", config).await.unwrap();
    sleep(Duration::from_millis(800)).await;

    let output = pm.get_output(&proc_id, 0).await;
    assert!(
        output.len() <= 10000,
        "Output buffer must not exceed 10000 lines, got {}",
        output.len()
    );
    assert!(!output.is_empty());
}
