use runyard_lib::db::{
    add_scan_root_with_conn, get_all_projects_with_conn, initialize_at_path,
    remove_scan_root_with_conn, set_custom_db_path,
};
use runyard_lib::models::{ProjectSource, ScanRoot};
use runyard_lib::scan_coordinator::{ScanCoordinator, ScanState};
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tempfile::tempdir;

static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tokio::test]
async fn test_scenario_a_add_root_automatically_scans() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_a.db");
    initialize_at_path(&db_path).unwrap();

    // Create a mock filesystem directory with 2 projects
    let root_dir = dir.path().join("mock_root_a");
    let proj1 = root_dir.join("web-app");
    let proj2 = root_dir.join("api-service");
    fs::create_dir_all(&proj1).unwrap();
    fs::create_dir_all(&proj2).unwrap();
    fs::write(proj1.join("package.json"), "{}").unwrap();
    fs::write(
        proj2.join("Cargo.toml"),
        "[package]\nname = \"api-service\"\nversion = \"0.1.0\"",
    )
    .unwrap();

    let conn = runyard_lib::db::get_connection().unwrap();
    let root = ScanRoot {
        id: "root-a".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let coordinator = Arc::new(ScanCoordinator::new());

    // Request scan (as add_scan_root does)
    let enqueued = coordinator.request_scan(&root.id, &root.path, None).await;
    assert!(enqueued, "Scan request should be enqueued");

    // Wait for idle
    let finished = coordinator.wait_for_idle(Duration::from_secs(5)).await;
    assert!(finished, "Coordinator should finish scanning root A");

    // Verify projects are committed to SQLite automatically without manual rescan
    let projects = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(projects.len(), 2, "Expected 2 projects auto-discovered");
    assert!(projects.iter().any(|p| p.name == "web-app"));
    assert!(projects.iter().any(|p| p.name == "api-service"));

    let progress_map = coordinator.get_all_progress().await;
    let root_prog = progress_map.get("root-a").unwrap();
    assert_eq!(root_prog.state, ScanState::Completed);
    assert_eq!(root_prog.projects_found, 2);

    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_scenario_b_only_new_root_scans() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_b.db");
    initialize_at_path(&db_path).unwrap();

    // Create roots A, B, and C
    let root_a_dir = dir.path().join("root_a");
    let root_b_dir = dir.path().join("root_b");
    let root_c_dir = dir.path().join("root_c");
    fs::create_dir_all(root_a_dir.join("proj_a")).unwrap();
    fs::create_dir_all(root_b_dir.join("proj_b")).unwrap();
    fs::create_dir_all(root_c_dir.join("proj_c")).unwrap();
    fs::write(root_a_dir.join("proj_a").join("package.json"), "{}").unwrap();
    fs::write(root_b_dir.join("proj_b").join("package.json"), "{}").unwrap();
    fs::write(root_c_dir.join("proj_c").join("package.json"), "{}").unwrap();

    let conn = runyard_lib::db::get_connection().unwrap();
    let root_a = ScanRoot {
        id: "root-a".to_string(),
        path: root_a_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    let root_b = ScanRoot {
        id: "root-b".to_string(),
        path: root_b_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    let root_c = ScanRoot {
        id: "root-c".to_string(),
        path: root_c_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root_a).unwrap();
    add_scan_root_with_conn(&conn, &root_b).unwrap();
    add_scan_root_with_conn(&conn, &root_c).unwrap();

    let coordinator = Arc::new(ScanCoordinator::new());

    // When root C is added, we request scan for ONLY root C
    coordinator
        .request_scan(&root_c.id, &root_c.path, None)
        .await;

    coordinator.wait_for_idle(Duration::from_secs(5)).await;

    let progress_map = coordinator.get_all_progress().await;
    assert!(
        progress_map.contains_key("root-c"),
        "root-c should be scanned"
    );
    assert!(
        !progress_map.contains_key("root-a"),
        "root-a should NOT be scanned"
    );
    assert!(
        !progress_map.contains_key("root-b"),
        "root-b should NOT be scanned"
    );

    let projects = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].name, "proj_c");

    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_scenario_c_add_root_is_not_scan_duration_bound() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_c.db");
    initialize_at_path(&db_path).unwrap();

    let root_dir = dir.path().join("root_c_bench");
    for i in 0..50 {
        let p = root_dir.join(format!("proj_{}", i));
        fs::create_dir_all(&p).unwrap();
        fs::write(p.join("package.json"), "{}").unwrap();
    }

    let conn = runyard_lib::db::get_connection().unwrap();
    let root = ScanRoot {
        id: "root-c".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let coordinator = Arc::new(ScanCoordinator::new());

    let start = Instant::now();
    let enqueued = coordinator.request_scan(&root.id, &root.path, None).await;
    let enqueue_duration = start.elapsed();

    assert!(enqueued);
    assert!(
        enqueue_duration < Duration::from_millis(50),
        "request_scan must return immediately (took {:?})",
        enqueue_duration
    );

    coordinator.wait_for_idle(Duration::from_secs(10)).await;
    let projects = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(projects.len(), 50);

    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_scenario_d_duplicate_request_coalescing() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_d.db");
    initialize_at_path(&db_path).unwrap();

    let root_dir = dir.path().join("root_d");
    fs::create_dir_all(root_dir.join("app")).unwrap();
    fs::write(root_dir.join("app").join("package.json"), "{}").unwrap();

    let conn = runyard_lib::db::get_connection().unwrap();
    let root = ScanRoot {
        id: "root-d".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let coordinator = Arc::new(ScanCoordinator::new());

    // Rapid successive requests
    let req1 = coordinator.request_scan(&root.id, &root.path, None).await;
    let req2 = coordinator.request_scan(&root.id, &root.path, None).await;
    let req3 = coordinator.request_scan(&root.id, &root.path, None).await;

    assert!(req1, "First request must be enqueued");
    assert!(!req2, "Second request must be coalesced / ignored");
    assert!(!req3, "Third request must be coalesced / ignored");

    coordinator.wait_for_idle(Duration::from_secs(5)).await;

    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_scenario_e_visible_lifecycle_state() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_e.db");
    initialize_at_path(&db_path).unwrap();

    let root_dir = dir.path().join("root_e");
    fs::create_dir_all(root_dir.join("sample")).unwrap();
    fs::write(
        root_dir.join("sample").join("Cargo.toml"),
        "[package]\nname=\"s\"\nversion=\"0.1.0\"",
    )
    .unwrap();

    let conn = runyard_lib::db::get_connection().unwrap();
    let root = ScanRoot {
        id: "root-e".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let coordinator = Arc::new(ScanCoordinator::new());
    coordinator.request_scan(&root.id, &root.path, None).await;

    // Immediately after request, state is Queued or Scanning
    let prog = coordinator.get_all_progress().await;
    let s = prog.get("root-e").unwrap().state;
    assert!(s == ScanState::Queued || s == ScanState::Scanning || s == ScanState::Completed);

    coordinator.wait_for_idle(Duration::from_secs(5)).await;

    let final_prog = coordinator.get_all_progress().await;
    let e = final_prog.get("root-e").unwrap();
    assert_eq!(e.state, ScanState::Completed);
    assert_eq!(e.projects_found, 1);
    assert!(e.directories_inspected >= 1);

    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_scenario_f_single_pass_traversal() {
    let dir = tempdir().unwrap();
    let root_dir = dir.path().join("root_f");
    fs::create_dir_all(root_dir.join("dir1").join("proj1")).unwrap();
    fs::write(
        root_dir.join("dir1").join("proj1").join("package.json"),
        "{}",
    )
    .unwrap();

    let token = AtomicBool::new(false);
    let mut progress_calls = 0;
    let scanned = runyard_lib::scanner::scan_directory_streaming(
        &root_dir.to_string_lossy(),
        &token,
        |_dirs, _projs, _svcs| {
            progress_calls += 1;
        },
    )
    .unwrap();

    assert_eq!(scanned.len(), 1);
    assert!(
        progress_calls > 0,
        "Progress callback called during single pass"
    );
}

#[tokio::test]
async fn test_scenario_g_remove_root_during_scan_cancels_and_discards_stale_results() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_g.db");
    initialize_at_path(&db_path).unwrap();

    let root_dir = dir.path().join("root_g");
    for i in 0..20 {
        let p = root_dir.join(format!("proj_{}", i));
        fs::create_dir_all(&p).unwrap();
        fs::write(p.join("package.json"), "{}").unwrap();
    }

    let mut conn = runyard_lib::db::get_connection().unwrap();
    let root = ScanRoot {
        id: "root-g".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let coordinator = Arc::new(ScanCoordinator::new());

    // Request scan
    coordinator.request_scan(&root.id, &root.path, None).await;

    // Immediately cancel and remove scan root from DB (simulating user clicking remove root)
    coordinator.cancel_root_scan(&root.id, None).await;
    remove_scan_root_with_conn(&mut conn, &root.id).unwrap();

    coordinator.wait_for_idle(Duration::from_secs(5)).await;

    // Verify: Database MUST contain 0 projects! No stale results committed!
    let projects = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(
        projects.len(),
        0,
        "No projects should be committed if root was removed during scan"
    );

    let progress = coordinator.get_all_progress().await;
    let prog = progress.get("root-g").unwrap();
    assert_eq!(prog.state, ScanState::Cancelled);

    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_scenario_h_scan_failure_handling() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_h.db");
    initialize_at_path(&db_path).unwrap();

    let conn = runyard_lib::db::get_connection().unwrap();
    let non_existent = dir.path().join("does_not_exist");
    let root = ScanRoot {
        id: "root-h".to_string(),
        path: non_existent.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let coordinator = Arc::new(ScanCoordinator::new());
    coordinator.request_scan(&root.id, &root.path, None).await;

    coordinator.wait_for_idle(Duration::from_secs(5)).await;

    let progress = coordinator.get_all_progress().await;
    let prog = progress.get("root-h").unwrap();
    assert_eq!(prog.state, ScanState::Failed);
    assert!(prog.error.is_some());

    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_scenario_i_existing_lifecycle_preserved_with_coordinator() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_i.db");
    initialize_at_path(&db_path).unwrap();

    let root_dir = dir.path().join("root_i");
    let proj_auto = root_dir.join("auto_discovered");
    fs::create_dir_all(&proj_auto).unwrap();
    fs::write(proj_auto.join("package.json"), "{}").unwrap();

    let manual_dir = dir.path().join("outside_manual");
    fs::create_dir_all(&manual_dir).unwrap();
    fs::write(
        manual_dir.join("Cargo.toml"),
        "[package]\nname=\"manual\"\nversion=\"0.1.0\"",
    )
    .unwrap();

    let mut conn = runyard_lib::db::get_connection().unwrap();

    // Add manual project
    let manual_proj = runyard_lib::models::Project {
        id: "manual-1".to_string(),
        name: "manual".to_string(),
        path: manual_dir.to_string_lossy().to_string(),
        project_type: Some("rust".to_string()),
        languages: vec!["Rust".to_string()],
        frameworks: vec![],
        has_git: false,
        git_branch: None,
        git_remote: None,
        preferred_ide: None,
        default_run_config_id: None,
        is_favorite: false,
        tags: vec![],
        last_opened: None,
        last_run: None,
        source: ProjectSource::Manual,
        parent_project_id: None,
        is_runnable: false,
        is_archived: false,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    runyard_lib::db::upsert_project_with_conn(&conn, &manual_proj).unwrap();

    // Add root and auto-scan
    let root = ScanRoot {
        id: "root-i".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let coordinator = Arc::new(ScanCoordinator::new());
    coordinator.request_scan(&root.id, &root.path, None).await;
    coordinator.wait_for_idle(Duration::from_secs(5)).await;

    let projects_before = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(projects_before.len(), 2);

    // Remove root
    coordinator.cancel_root_scan(&root.id, None).await;
    remove_scan_root_with_conn(&mut conn, &root.id).unwrap();

    // Active catalog now only has manual project!
    let projects_after = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(projects_after.len(), 1);
    assert_eq!(projects_after[0].id, "manual-1");
    assert_eq!(projects_after[0].source, ProjectSource::Manual);

    set_custom_db_path(None::<&str>);
}

#[test]
fn test_regression_construction_without_tokio_runtime_does_not_panic() {
    // Run on a dedicated thread with NO Tokio runtime
    let handle = std::thread::spawn(|| {
        // Assert no tokio runtime is active on this thread
        assert!(
            tokio::runtime::Handle::try_current().is_err(),
            "Thread must NOT have a Tokio runtime"
        );

        // Construction must succeed without panicking ("there is no reactor running")
        let coordinator = ScanCoordinator::new();
        assert!(
            !coordinator.is_started(),
            "Worker must not be started upon construction"
        );
    });

    handle
        .join()
        .expect("ScanCoordinator::new() panicked on a non-Tokio thread!");
}

#[tokio::test]
async fn test_starting_worker_inside_runtime_works() {
    let _guard = TEST_MUTEX.lock().await;
    let coordinator = Arc::new(ScanCoordinator::new());
    assert!(!coordinator.is_started());

    // Explicitly start worker
    coordinator.start(None);
    assert!(coordinator.is_started());

    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_start_worker.db");
    initialize_at_path(&db_path).unwrap();

    let root_dir = dir.path().join("root_worker");
    fs::create_dir_all(root_dir.join("sample")).unwrap();
    fs::write(root_dir.join("sample").join("package.json"), "{}").unwrap();

    let conn = runyard_lib::db::get_connection().unwrap();
    let root = ScanRoot {
        id: "root-worker".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    coordinator.request_scan(&root.id, &root.path, None).await;
    let finished = coordinator.wait_for_idle(Duration::from_secs(5)).await;
    assert!(finished);

    let progress = coordinator.get_all_progress().await;
    let prog = progress.get("root-worker").unwrap();
    assert_eq!(prog.state, ScanState::Completed);
    assert_eq!(prog.projects_found, 1);

    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_start_called_multiple_times_is_idempotent() {
    let _guard = TEST_MUTEX.lock().await;
    let coordinator = Arc::new(ScanCoordinator::new());
    assert!(!coordinator.is_started());

    // Call start 5 times in rapid succession
    for _ in 0..5 {
        coordinator.start(None);
    }
    assert!(coordinator.is_started());

    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_idempotent_worker.db");
    initialize_at_path(&db_path).unwrap();

    let root_dir = dir.path().join("root_idem");
    fs::create_dir_all(root_dir.join("sample")).unwrap();
    fs::write(root_dir.join("sample").join("package.json"), "{}").unwrap();

    let conn = runyard_lib::db::get_connection().unwrap();
    let root = ScanRoot {
        id: "root-idem".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    coordinator.request_scan(&root.id, &root.path, None).await;
    let finished = coordinator.wait_for_idle(Duration::from_secs(5)).await;
    assert!(finished);

    let progress = coordinator.get_all_progress().await;
    let prog = progress.get("root-idem").unwrap();
    assert_eq!(prog.state, ScanState::Completed);

    set_custom_db_path(None::<&str>);
}

#[test]
fn test_bounded_queue_capacity() {
    let default_coord = ScanCoordinator::new();
    assert_eq!(default_coord.queue_capacity(), 16);
    assert_eq!(default_coord.remaining_capacity(), 16);

    let custom_coord = ScanCoordinator::with_capacity(4);
    assert_eq!(custom_coord.queue_capacity(), 4);
    assert_eq!(custom_coord.remaining_capacity(), 4);
}

#[tokio::test]
async fn test_duplicate_request_storm_bounded() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_storm.db");
    initialize_at_path(&db_path).unwrap();

    let root_dir = dir.path().join("root_storm");
    for i in 0..20 {
        let p = root_dir.join(format!("proj_{}", i));
        fs::create_dir_all(&p).unwrap();
        fs::write(p.join("package.json"), "{}").unwrap();
    }

    let conn = runyard_lib::db::get_connection().unwrap();
    let root = ScanRoot {
        id: "root-storm".to_string(),
        path: root_dir.to_string_lossy().to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let coordinator = Arc::new(ScanCoordinator::with_capacity(4));
    assert_eq!(coordinator.queue_capacity(), 4);

    let first = coordinator.request_scan(&root.id, &root.path, None).await;
    assert!(first, "First request must be enqueued");

    // Hammer with 100 rapid duplicate requests while scan is in progress
    let mut rejected_count = 0;
    for _ in 0..100 {
        let accepted = coordinator.request_scan(&root.id, &root.path, None).await;
        if !accepted {
            rejected_count += 1;
        }
    }

    assert_eq!(
        rejected_count, 100,
        "All 100 duplicates must be rejected/coalesced"
    );
    assert_eq!(coordinator.queue_capacity(), 4);
    assert!(coordinator.remaining_capacity() <= 4);

    coordinator.wait_for_idle(Duration::from_secs(5)).await;
    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_distinct_root_overflow_handled_predictably() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_overflow.db");
    initialize_at_path(&db_path).unwrap();

    // Bounded capacity of 3
    let coordinator = Arc::new(ScanCoordinator::with_capacity(3));
    assert_eq!(coordinator.queue_capacity(), 3);

    // Enqueue 6 distinct roots rapidly
    let mut accepted = 0;
    let mut rejected = 0;
    let mut rejected_ids = Vec::new();

    for i in 1..=6 {
        let id = format!("root-overflow-{}", i);
        let path = format!("/path/overflow/{}", i);
        if coordinator.request_scan(&id, &path, None).await {
            accepted += 1;
        } else {
            rejected += 1;
            rejected_ids.push(id);
        }
    }

    // Capacity is 3, with at most 1 active scan in progress.
    // Therefore accepted can never exceed 3 + 1 = 4, and rejected must be at least 2.
    assert!(
        accepted <= 4,
        "Cannot accept more than capacity (3) + 1 active scan: got {}",
        accepted
    );
    assert!(
        accepted >= 3,
        "Must accept at least queue capacity (3): got {}",
        accepted
    );
    assert!(
        rejected >= 2,
        "Must reject at least 2 overflow requests: got {}",
        rejected
    );
    assert_eq!(accepted + rejected, 6);

    // Verify all rejected roots are recorded as Failed with descriptive error
    let progress = coordinator.get_all_progress().await;
    for rej_id in &rejected_ids {
        let p = progress
            .get(rej_id)
            .expect("Rejected root must have progress entry");
        assert_eq!(p.state, ScanState::Failed);
        assert!(p.error.is_some());
        assert!(
            p.error.as_ref().unwrap().contains("Scan queue is full"),
            "Error message must indicate queue is full: {:?}",
            p.error
        );
    }

    coordinator.wait_for_idle(Duration::from_secs(5)).await;
    set_custom_db_path(None::<&str>);
}

#[tokio::test]
async fn test_scanner_concurrency_remains_one() {
    let _guard = TEST_MUTEX.lock().await;
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_concurrency.db");
    initialize_at_path(&db_path).unwrap();

    let conn = runyard_lib::db::get_connection().unwrap();

    // Create 3 distinct mock roots with several subprojects to ensure scan takes some time
    let mut root_ids = Vec::new();
    for i in 1..=3 {
        let root_dir = dir.path().join(format!("root_{}", i));
        for j in 1..=10 {
            let p = root_dir.join(format!("proj_{}", j));
            fs::create_dir_all(&p).unwrap();
            fs::write(p.join("package.json"), "{}").unwrap();
        }
        let root_id = format!("root-conc-{}", i);
        let root = ScanRoot {
            id: root_id.clone(),
            path: root_dir.to_string_lossy().to_string(),
            enabled: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };
        add_scan_root_with_conn(&conn, &root).unwrap();
        root_ids.push((root_id, root_dir.to_string_lossy().to_string()));
    }

    let coordinator = Arc::new(ScanCoordinator::with_capacity(16));

    // Monitor concurrency in background
    let coordinator_clone = coordinator.clone();
    let max_concurrent_scanning = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let max_clone = max_concurrent_scanning.clone();
    let stop_monitor = Arc::new(AtomicBool::new(false));
    let stop_clone = stop_monitor.clone();

    let monitor = tokio::spawn(async move {
        while !stop_clone.load(Ordering::Relaxed) {
            let prog = coordinator_clone.get_all_progress().await;
            let scanning_count = prog
                .values()
                .filter(|p| p.state == ScanState::Scanning)
                .count();
            max_clone.fetch_max(scanning_count, Ordering::Relaxed);
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    });

    // Enqueue all 3 roots in rapid succession
    for (id, path) in &root_ids {
        let enqueued = coordinator.request_scan(id, path, None).await;
        assert!(enqueued);
    }

    let finished = coordinator.wait_for_idle(Duration::from_secs(10)).await;
    assert!(finished);

    stop_monitor.store(true, Ordering::Relaxed);
    let _ = monitor.await;

    let max_observed = max_concurrent_scanning.load(Ordering::Relaxed);
    assert!(
        max_observed <= 1,
        "Concurrency must NEVER exceed 1 (max observed: {})",
        max_observed
    );

    let progress = coordinator.get_all_progress().await;
    for (id, _) in &root_ids {
        let p = progress.get(id).unwrap();
        assert_eq!(p.state, ScanState::Completed);
        assert_eq!(p.projects_found, 10);
    }

    set_custom_db_path(None::<&str>);
}
