use runyard_lib::db::*;
use runyard_lib::models::*;
use runyard_lib::script_detector::*;
use rusqlite::Connection;
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;

#[test]
fn test_script_content_modification_invalidates_trust() {
    let dir = tempfile::tempdir().unwrap();
    let project_dir = dir.path();
    let script_file = project_dir.join("run_dev.sh");

    fs::write(
        &script_file,
        b"#!/usr/bin/env bash\necho starting server\nexec uvicorn main:app --port 8000\n",
    )
    .unwrap();

    let mut config = RunConfiguration {
        id: "cfg-1".to_string(),
        project_id: "proj-1".to_string(),
        service_id: None,
        name: "run_dev.sh".to_string(),
        command: "./run_dev.sh".to_string(),
        args: vec![],
        working_dir: Some(project_dir.to_str().unwrap().to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: false,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::Detected,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    // 1. Initial trust computation
    let fp = config.compute_fingerprint_with_base(Some(project_dir));
    config.is_trusted = true;
    config.trusted_fingerprint = Some(fp.clone());

    assert!(
        config.is_trust_valid_with_base(Some(project_dir)),
        "Config must be valid right after being trusted"
    );

    // 2. Modify script content by even 1 single byte
    fs::write(
        &script_file,
        b"#!/usr/bin/env bash\necho starting server\nexec uvicorn main:app --port 8001\n",
    )
    .unwrap();

    assert!(
        !config.is_trust_valid_with_base(Some(project_dir)),
        "Trust must be invalidated immediately when script content changes"
    );

    // 3. Modifying back restores fingerprint match
    fs::write(
        &script_file,
        b"#!/usr/bin/env bash\necho starting server\nexec uvicorn main:app --port 8000\n",
    )
    .unwrap();

    assert!(
        config.is_trust_valid_with_base(Some(project_dir)),
        "Restoring original content must restore valid trust"
    );
}

#[test]
fn test_missing_script_and_path_traversal_rejects_trust() {
    let dir = tempfile::tempdir().unwrap();
    let project_dir = dir.path();
    let script_file = project_dir.join("start.sh");
    fs::write(&script_file, b"#!/bin/bash\necho ok").unwrap();

    let mut config = RunConfiguration {
        id: "cfg-sec".to_string(),
        project_id: "proj-sec".to_string(),
        service_id: None,
        name: "start.sh".to_string(),
        command: "./start.sh".to_string(),
        args: vec![],
        working_dir: Some(project_dir.to_str().unwrap().to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::Detected,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    config.trusted_fingerprint = Some(config.compute_fingerprint_with_base(Some(project_dir)));
    assert!(config.is_trust_valid_with_base(Some(project_dir)));

    // 1. Script deleted
    fs::remove_file(&script_file).unwrap();
    assert!(
        !config.is_trust_valid_with_base(Some(project_dir)),
        "Deleted script must fail trust validation"
    );

    // 2. Path traversal attack in command
    let traversal_config = RunConfiguration {
        id: "cfg-trav".to_string(),
        project_id: "proj-sec".to_string(),
        service_id: None,
        name: "traversal".to_string(),
        command: "../../../etc/passwd".to_string(),
        args: vec![],
        working_dir: Some(project_dir.to_str().unwrap().to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: Some("dummy".to_string()),
        is_default: false,
        source: RunConfigSource::Detected,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    assert!(
        !traversal_config.is_trust_valid_with_base(Some(project_dir)),
        "Path traversal command must fail trust validation"
    );

    // 3. Symlink outside project root
    #[cfg(unix)]
    {
        let outside_dir = tempfile::tempdir().unwrap();
        let outside_script = outside_dir.path().join("external.sh");
        fs::write(&outside_script, b"#!/bin/bash\necho external").unwrap();

        let link_path = project_dir.join("symlink_escape.sh");
        std::os::unix::fs::symlink(&outside_script, &link_path).unwrap();

        let symlink_config = RunConfiguration {
            id: "cfg-sym".to_string(),
            project_id: "proj-sec".to_string(),
            service_id: None,
            name: "symlink_escape.sh".to_string(),
            command: "./symlink_escape.sh".to_string(),
            args: vec![],
            working_dir: Some(project_dir.to_str().unwrap().to_string()),
            env_file: None,
            env_vars: HashMap::new(),
            is_trusted: true,
            trusted_fingerprint: Some("dummy".to_string()),
            is_default: false,
            source: RunConfigSource::Detected,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        assert!(
            !symlink_config.is_trust_valid_with_base(Some(project_dir)),
            "Symlink target escaping base dir must be rejected"
        );
    }
}

#[test]
fn test_migration_v8_fk_remapping_and_data_safety() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("migration_v8_test.db");
    let mut conn = Connection::open(&db_path).unwrap();

    // Setup v7 schema
    conn.execute_batch(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
         INSERT INTO schema_version (version) VALUES (7);
         CREATE TABLE projects (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             path TEXT NOT NULL UNIQUE,
             git_branch TEXT,
             source TEXT NOT NULL,
             parent_project_id TEXT,
             is_runnable BOOLEAN NOT NULL DEFAULT 1,
             is_archived BOOLEAN NOT NULL DEFAULT 0,
             created_at TEXT NOT NULL
         );
         CREATE TABLE services (
             id TEXT PRIMARY KEY,
             project_id TEXT NOT NULL,
             name TEXT NOT NULL,
             path TEXT NOT NULL,
             service_type TEXT,
             languages TEXT NOT NULL,
             frameworks TEXT NOT NULL,
             is_runnable BOOLEAN NOT NULL DEFAULT 1,
             created_at TEXT NOT NULL
         );
         CREATE TABLE run_configurations (
             id TEXT PRIMARY KEY,
             project_id TEXT NOT NULL,
             service_id TEXT,
             name TEXT NOT NULL,
             command TEXT NOT NULL,
             args TEXT NOT NULL,
             working_dir TEXT,
             env_file TEXT,
             env_vars TEXT NOT NULL,
             is_trusted BOOLEAN NOT NULL DEFAULT 0,
             trusted_fingerprint TEXT,
             is_default BOOLEAN NOT NULL DEFAULT 0,
             source TEXT NOT NULL DEFAULT 'Detected',
             created_at TEXT NOT NULL
         );",
    )
    .unwrap();

    // Insert test data:
    // Project 1
    conn.execute(
        "INSERT INTO projects (id, name, path, source, created_at) VALUES ('p1', 'MainProj', '/apps/main', 'Manual', '2026-01-01')",
        [],
    ).unwrap();

    // Duplicate services for same path: s1 (canonical) and s2 (duplicate)
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s1', 'p1', 'BackendSvc', '/apps/main/backend', '[]', '[]', '2026-01-01')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s2', 'p1', 'BackendSvcDup', '/apps/main/backend', '[]', '[]', '2026-01-02')",
        [],
    )
    .unwrap();

    // Noise service that is Detected vs Manual
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s_noise_detected', 'p1', 'Scratch1', '/apps/main/scratch/tool1', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s_noise_manual', 'p1', 'ScratchManual', '/apps/main/scratch/manual_tool', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();

    // Run configs:
    // cfg1 pointing to duplicate s2 (source: Detected)
    conn.execute(
        "INSERT INTO run_configurations (id, project_id, service_id, name, command, args, env_vars, source, created_at)
         VALUES ('cfg1', 'p1', 's2', 'dev', 'npm run dev', '[]', '{}', 'Detected', '2026-01-01')",
        [],
    ).unwrap();

    // cfg2 pointing to duplicate s2 (source: UserCreated)
    conn.execute(
        "INSERT INTO run_configurations (id, project_id, service_id, name, command, args, env_vars, source, created_at)
         VALUES ('cfg2', 'p1', 's2', 'custom', 'npm start', '[]', '{}', 'UserCreated', '2026-01-01')",
        [],
    ).unwrap();

    // cfg3: UserCreated run config on noise path
    conn.execute(
        "INSERT INTO run_configurations (id, project_id, service_id, name, command, args, env_vars, source, created_at)
         VALUES ('cfg3', 'p1', 's_noise_manual', 'user scratch', './run.sh', '[]', '{}', 'UserCreated', '2026-01-01')",
        [],
    ).unwrap();

    // Run Migration v8
    migrate(&mut conn).unwrap();

    let version: i32 = conn
        .query_row(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(version, 8, "Migration v8 must apply");

    // Check duplicate service was removed:
    let s2_exists: bool = conn
        .query_row("SELECT count(*) FROM services WHERE id = 's2'", [], |r| {
            r.get::<_, i64>(0).map(|c| c > 0)
        })
        .unwrap();
    assert!(!s2_exists, "Duplicate service s2 must be removed");

    let s1_exists: bool = conn
        .query_row("SELECT count(*) FROM services WHERE id = 's1'", [], |r| {
            r.get::<_, i64>(0).map(|c| c > 0)
        })
        .unwrap();
    assert!(s1_exists, "Canonical service s1 must be retained");

    // Verify FK remapping: both cfg1 and cfg2 must now point to s1
    let cfg1_svc: String = conn
        .query_row(
            "SELECT service_id FROM run_configurations WHERE id = 'cfg1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        cfg1_svc, "s1",
        "cfg1 must be remapped to retained canonical service s1"
    );

    let cfg2_svc: String = conn
        .query_row(
            "SELECT service_id FROM run_configurations WHERE id = 'cfg2'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        cfg2_svc, "s1",
        "cfg2 must be remapped to retained canonical service s1"
    );

    // Verify UserCreated cfg3 was NOT deleted
    let cfg3_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE id = 'cfg3'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    assert!(
        cfg3_exists,
        "UserCreated run config cfg3 must survive migration v8"
    );

    // Verify Detected noise service was deleted
    let noise_det_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_noise_detected'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    assert!(
        !noise_det_exists,
        "Detected noise service must be pruned by migration v8"
    );
}

#[test]
fn test_script_qualification_rejects_trivial_echo_script() {
    let dir = tempfile::tempdir().unwrap();
    let project_dir = dir.path();

    // Create a trivial non-server script
    let script_file = project_dir.join("hello.sh");
    fs::write(&script_file, b"#!/bin/sh\necho hello world\n").unwrap();

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&script_file, fs::Permissions::from_mode(0o755)).unwrap();
    }

    // Attempt qualification
    let scripts = detect_project_scripts(project_dir, "test_proj");
    let qualifies = scripts.iter().any(|s| {
        s.confidence == ScriptConfidence::High
            && matches!(
                s.script_kind,
                ScriptKind::DevelopmentServer
                    | ScriptKind::ApplicationStart
                    | ScriptKind::MultiServiceLauncher
            )
    });

    assert!(
        !qualifies,
        "A simple 'echo hello' script must NEVER qualify a directory as a service"
    );
}

#[test]
fn test_script_qualification_accepts_strong_dev_server_script() {
    let dir = tempfile::tempdir().unwrap();
    let project_dir = dir.path();

    // Create a real development launcher
    let script_file = project_dir.join("run_dev.sh");
    fs::write(
        &script_file,
        b"#!/usr/bin/env bash\nexport PORT=8000\npg_isready -h localhost\nexec uvicorn main:app --reload --port $PORT\n",
    )
    .unwrap();

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&script_file, fs::Permissions::from_mode(0o755)).unwrap();
    }

    let scripts = detect_project_scripts(project_dir, "test_proj");
    assert_eq!(scripts.len(), 1);
    let s = &scripts[0];
    assert_eq!(s.confidence, ScriptConfidence::High);
    assert_eq!(s.script_kind, ScriptKind::DevelopmentServer);

    let qualifies = scripts.iter().any(|s| {
        s.confidence == ScriptConfidence::High
            && matches!(
                s.script_kind,
                ScriptKind::DevelopmentServer
                    | ScriptKind::ApplicationStart
                    | ScriptKind::MultiServiceLauncher
            )
    });
    assert!(
        qualifies,
        "A strong development launcher must qualify a service"
    );
}

#[test]
fn test_script_detection_metrics_bounded() {
    let dir = tempfile::tempdir().unwrap();
    let project_dir = dir.path();

    // Create 1 valid script and 1 non-launcher file
    fs::write(
        project_dir.join("run_dev.sh"),
        b"#!/usr/bin/env bash\nexec node server.js\n",
    )
    .unwrap();
    fs::write(
        project_dir.join("notes.txt"),
        b"These are some project notes that should not be scanned.",
    )
    .unwrap();

    let (_scripts, metrics) = detect_project_scripts_with_metrics(project_dir, "test_proj");

    assert!(
        metrics.candidates_considered >= 1,
        "Must have considered at least 1 candidate"
    );
    assert!(
        metrics.candidates_opened >= 1,
        "Must have opened at least 1 script"
    );
    assert!(metrics.bytes_read > 0, "Bytes read must be positive");
    assert!(
        metrics.bytes_read < 65536,
        "Bytes read must be strictly bounded"
    );
}

#[test]
fn test_deterministic_script_run_config_persistence() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("script_cfg_test.db");
    initialize_at_path(&db_path).unwrap();

    let project_dir = dir.path().join("my_proj");
    fs::create_dir_all(&project_dir).unwrap();
    let script_path = project_dir.join("run_dev.sh");
    fs::write(&script_path, b"#!/bin/bash\nexec uvicorn main:app\n").unwrap();

    let conn = get_connection_for_path(&db_path).unwrap();
    let project = Project {
        id: "proj-det-1".to_string(),
        name: "MyProj".to_string(),
        path: project_dir.to_str().unwrap().to_string(),
        project_type: None,
        languages: vec![],
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
        created_at: chrono::Utc::now().to_rfc3339(),
        source: ProjectSource::Manual,
        parent_project_id: None,
        is_runnable: true,
        is_archived: false,
    };
    upsert_project_with_conn(&conn, &project).unwrap();

    // Call get_or_create_script_run_config_with_conn multiple times
    let cfg1 = runyard_lib::commands::get_or_create_script_run_config_with_conn(
        &conn,
        "proj-det-1",
        "run_dev.sh",
    )
    .unwrap();

    let cfg2 = runyard_lib::commands::get_or_create_script_run_config_with_conn(
        &conn,
        "proj-det-1",
        "run_dev.sh",
    )
    .unwrap();

    // 1. Must have identical stable IDs
    assert_eq!(
        cfg1.id, cfg2.id,
        "Stable UUID v5 identity must match across repeated calls"
    );

    // 2. Exactly one row must exist in the database
    let count: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE project_id = 'proj-det-1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        count, 1,
        "Repeated Run/Cancel must never duplicate rows in run_configurations"
    );

    // Clean up custom db path
    set_custom_db_path::<&std::path::Path>(None);
}

#[test]
fn test_interactive_signals_classification() {
    // 1. read prompt
    let (mode, sigs) = detect_interactive_signals("read -r -p 'Confirm [y/N]: ' reply\n");
    assert_eq!(mode, ScriptExecutionMode::TerminalRequired);
    assert!(sigs.iter().any(|s| s.contains("read")));

    // 2. prompting sudo
    let (mode, sigs) = detect_interactive_signals("sudo systemctl restart postgresql\n");
    assert_eq!(mode, ScriptExecutionMode::TerminalRequired);
    assert!(sigs.iter().any(|s| s.contains("sudo")));

    // 3. non-prompting sudo (-n)
    let (mode, _sigs) = detect_interactive_signals("sudo -n docker ps\n");
    assert_eq!(mode, ScriptExecutionMode::Background);

    // 4. select loop
    let (mode, sigs) =
        detect_interactive_signals("select option in start stop exit; do break; done\n");
    assert_eq!(mode, ScriptExecutionMode::TerminalRequired);
    assert!(sigs.iter().any(|s| s.contains("select")));

    // 5. /dev/tty
    let (mode, sigs) = detect_interactive_signals("echo secret > /dev/tty\n");
    assert_eq!(mode, ScriptExecutionMode::TerminalRequired);
    assert!(sigs.iter().any(|s| s.contains("/dev/tty")));

    // 6. standard non-interactive server launch
    let (mode, sigs) = detect_interactive_signals("#!/usr/bin/env bash\nexec air -c .air.toml\n");
    assert_eq!(mode, ScriptExecutionMode::Background);
    assert!(sigs.is_empty());
}

#[test]
fn test_component_safe_noise_path_pruning() {
    use runyard_lib::scanner::is_noise_path;
    use std::path::Path;

    // Must be pruned (exact component matches noise dir)
    assert!(is_noise_path(Path::new("/workspace/scratch/tool")));
    assert!(is_noise_path(Path::new("/workspace/scratch")));
    assert!(is_noise_path(Path::new(
        "/workspace/benchmarks/perf_runner"
    )));
    assert!(is_noise_path(Path::new("/workspace/test-corpus/repo1")));
    assert!(is_noise_path(Path::new("/workspace/fixtures/sample_app")));

    // Must NOT be pruned (valid services with substring prefixes)
    assert!(!is_noise_path(Path::new("/workspace/scratchpad-server")));
    assert!(!is_noise_path(Path::new("/workspace/scratchpad")));
    assert!(!is_noise_path(Path::new(
        "/workspace/benchmarking-platform"
    )));
    assert!(!is_noise_path(Path::new("/workspace/test-corpus-manager")));
    assert!(!is_noise_path(Path::new("/workspace/my-fixtures-service")));
    assert!(!is_noise_path(Path::new("/workspace/pdfnest-backend")));
}

#[test]
fn test_migration_v8_protects_legitimate_prefix_services() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("migration_v8_prefix_test.db");
    let mut conn = Connection::open(&db_path).unwrap();

    conn.execute_batch(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
         INSERT INTO schema_version (version) VALUES (7);
         CREATE TABLE projects (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             path TEXT NOT NULL UNIQUE,
             git_branch TEXT,
             source TEXT NOT NULL,
             parent_project_id TEXT,
             is_runnable BOOLEAN NOT NULL DEFAULT 1,
             is_archived BOOLEAN NOT NULL DEFAULT 0,
             created_at TEXT NOT NULL
         );
         CREATE TABLE services (
             id TEXT PRIMARY KEY,
             project_id TEXT NOT NULL,
             name TEXT NOT NULL,
             path TEXT NOT NULL,
             service_type TEXT,
             languages TEXT NOT NULL,
             frameworks TEXT NOT NULL,
             is_runnable BOOLEAN NOT NULL DEFAULT 1,
             created_at TEXT NOT NULL
         );
         CREATE TABLE run_configurations (
             id TEXT PRIMARY KEY,
             project_id TEXT NOT NULL,
             service_id TEXT,
             name TEXT NOT NULL,
             command TEXT NOT NULL,
             args TEXT NOT NULL,
             working_dir TEXT,
             env_file TEXT,
             env_vars TEXT NOT NULL,
             is_trusted BOOLEAN NOT NULL DEFAULT 0,
             trusted_fingerprint TEXT,
             is_default BOOLEAN NOT NULL DEFAULT 0,
             source TEXT NOT NULL DEFAULT 'Detected',
             created_at TEXT NOT NULL
         );",
    )
    .unwrap();

    conn.execute(
        "INSERT INTO projects (id, name, path, source, created_at) VALUES ('p1', 'MainProj', '/workspace', 'Manual', '2026-01-01')",
        [],
    ).unwrap();

    // Valid services with substring noise names
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s_scratchpad', 'p1', 'scratchpad-server', '/workspace/scratchpad-server', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s_benchmark', 'p1', 'benchmarking-platform', '/workspace/benchmarking-platform', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s_corpus_mgr', 'p1', 'test-corpus-manager', '/workspace/test-corpus-manager', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();

    // Real noise services (exact folder component)
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s_real_scratch', 'p1', 'scratch-tool', '/workspace/scratch/tool', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at)
         VALUES ('s_real_corpus', 'p1', 'test-corpus-item', '/workspace/test-corpus/item1', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();

    // Run Migration v8
    migrate(&mut conn).unwrap();

    // Valid services MUST survive
    let s_scratchpad_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_scratchpad'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    assert!(
        s_scratchpad_exists,
        "scratchpad-server must survive migration v8"
    );

    let s_benchmark_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_benchmark'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    assert!(
        s_benchmark_exists,
        "benchmarking-platform must survive migration v8"
    );

    let s_corpus_mgr_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_corpus_mgr'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    assert!(
        s_corpus_mgr_exists,
        "test-corpus-manager must survive migration v8"
    );

    // Real noise services MUST be pruned
    let s_real_scratch_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_real_scratch'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    assert!(
        !s_real_scratch_exists,
        "Real scratch service must be pruned"
    );

    let s_real_corpus_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_real_corpus'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    assert!(
        !s_real_corpus_exists,
        "Real test-corpus service must be pruned"
    );
}

#[tokio::test]
async fn test_pty_process_tree_termination() {
    use runyard_lib::process_manager::ProcessManager;
    #[cfg(unix)]
    use std::os::unix::process::CommandExt;

    let pm = ProcessManager::new();
    let mut cmd = std::process::Command::new("sh");
    cmd.args(["-c", "sleep 60"]);
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd.spawn().unwrap();
    let pid = child.id();

    let cfg = RunConfiguration {
        id: "cfg_pty_test".to_string(),
        project_id: "proj_pty_test".to_string(),
        service_id: None,
        name: "PtyTreeScript".to_string(),
        command: "./run.sh".to_string(),
        args: vec![],
        working_dir: None,
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::Detected,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let pinfo = pm
        .register_pty_process("proj_pty_test", &cfg, pid, "session_pty_test_1")
        .await
        .unwrap();

    assert_eq!(pinfo.pty_session_id, Some("session_pty_test_1".to_string()));
    assert_eq!(pinfo.status, ProcessStatus::Running);

    // Stop process through process manager (kills entire process group/tree)
    pm.stop_process(&pinfo.id).await.unwrap();

    let procs = pm.get_all_processes().await;
    let p = procs.iter().find(|x| x.id == pinfo.id).unwrap();
    assert_eq!(p.status, ProcessStatus::Stopped);

    // Clean up child process handle
    let _ = child.kill();
    let _ = child.wait();
}

#[test]
fn test_script_detector_sets_terminal_required_for_interactive_script() {
    let dir = tempfile::tempdir().unwrap();
    let project_dir = dir.path();

    // 1. Script with read -p
    let interactive_script = project_dir.join("run_interactive.sh");
    fs::write(
        &interactive_script,
        b"#!/usr/bin/env bash\nread -r -p 'Enter database password: ' pass\nexec air\n",
    )
    .unwrap();

    // 2. Script without interactive signals
    let non_interactive_script = project_dir.join("run_background.sh");
    fs::write(&non_interactive_script, b"#!/usr/bin/env bash\nexec air\n").unwrap();

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&interactive_script, fs::Permissions::from_mode(0o755)).unwrap();
        fs::set_permissions(&non_interactive_script, fs::Permissions::from_mode(0o755)).unwrap();
    }

    let scripts = detect_project_scripts(project_dir, "test_proj");

    let interactive = scripts
        .iter()
        .find(|s| s.name == "run_interactive.sh")
        .expect("run_interactive.sh must be detected");
    assert_eq!(
        interactive.execution_mode,
        ScriptExecutionMode::TerminalRequired,
        "Script with read -p must be classified as TerminalRequired"
    );

    let background = scripts
        .iter()
        .find(|s| s.name == "run_background.sh")
        .expect("run_background.sh must be detected");
    assert_eq!(
        background.execution_mode,
        ScriptExecutionMode::Background,
        "Script without interactive signals must be classified as Background"
    );
}

#[test]
fn test_project_script_trust_state_backend_authoritative_sequence() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("authoritative_trust_test.db");
    initialize_at_path(&db_path).unwrap();

    let project_dir = dir.path().join("my_proj");
    fs::create_dir_all(&project_dir).unwrap();
    let script_path = project_dir.join("run_dev.sh");

    // 1. Create/detect startup script
    fs::write(
        &script_path,
        b"#!/usr/bin/env bash\necho starting\nexec uvicorn main:app --port 8000\n",
    )
    .unwrap();

    let conn = get_connection_for_path(&db_path).unwrap();
    let project = Project {
        id: "proj-auth-1".to_string(),
        name: "AuthProj".to_string(),
        path: project_dir.to_str().unwrap().to_string(),
        project_type: None,
        languages: vec![],
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
        created_at: chrono::Utc::now().to_rfc3339(),
        source: ProjectSource::Manual,
        parent_project_id: None,
        is_runnable: true,
        is_archived: false,
    };
    upsert_project_with_conn(&conn, &project).unwrap();

    // 2. Obtain backing deterministic RunConfiguration
    let mut cfg = runyard_lib::commands::get_or_create_script_run_config_with_conn(
        &conn,
        "proj-auth-1",
        "run_dev.sh",
    )
    .unwrap();
    assert_eq!(cfg.is_trusted, false, "Initial backing config is untrusted");

    // 3. Trust it
    let base_dir = Some(project_dir.as_path());
    let fp = cfg.compute_fingerprint_with_base(base_dir);
    cfg.is_trusted = true;
    cfg.trusted_fingerprint = Some(fp);
    save_run_config_with_conn(&conn, &cfg).unwrap();

    // 4. Refresh project scripts
    let scripts = runyard_lib::commands::detect_project_scripts_with_conn(
        Some(&conn),
        project_dir.to_str().unwrap(),
        Some("proj-auth-1"),
    )
    .unwrap();

    // 5. ProjectScript.is_trusted == true
    let s = scripts.iter().find(|x| x.name == "run_dev.sh").unwrap();
    assert_eq!(
        s.is_trusted, true,
        "Script must be reported as trusted when backing config is valid"
    );

    // 6. Modify ONE byte of the script on disk
    fs::write(
        &script_path,
        b"#!/usr/bin/env bash\necho starting\nexec uvicorn main:app --port 8001\n",
    )
    .unwrap();

    // 7. Refresh project scripts WITHOUT executing it
    let scripts_after = runyard_lib::commands::detect_project_scripts_with_conn(
        Some(&conn),
        project_dir.to_str().unwrap(),
        Some("proj-auth-1"),
    )
    .unwrap();

    // 8. ProjectScript.is_trusted == false
    let s_after = scripts_after
        .iter()
        .find(|x| x.name == "run_dev.sh")
        .unwrap();
    assert_eq!(
        s_after.is_trusted, false,
        "Modifying 1 byte must immediately invalidate script trust in backend"
    );

    // 9. Backing config evaluation directly also reports false
    let current_cfg = get_run_config_with_conn(&conn, &cfg.id).unwrap();
    assert_eq!(
        current_cfg.is_trust_valid_with_base(base_dir),
        false,
        "Backing config hash verification must fail"
    );

    // Clean up
    set_custom_db_path::<&std::path::Path>(None);
}

#[tokio::test]
async fn test_end_to_end_terminal_required_execution() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("terminal_required_prod.db");
    initialize_at_path(&db_path).unwrap();

    let project_dir = dir.path().join("terminal_proj");
    fs::create_dir_all(&project_dir).unwrap();
    let script_path = project_dir.join("run_dev.sh");

    // Synthetic interactive project script meeting High confidence (score >= 70) and TerminalRequired
    fs::write(
        &script_path,
        b"#!/usr/bin/env bash\nset -e\n# Environment configuration loading\nsource .env 2>/dev/null || true\nexport PORT=8080\ntype pg_isready >/dev/null 2>&1 || true\nread -r -p \"Continue? [y/N] \" reply\necho \"reply=$reply\"\nsleep 300 &\nchild=$!\necho \"child=$child\"\nwait \"$child\"\n",
    )
    .unwrap();

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755)).unwrap();
    }

    let conn = get_connection_for_path(&db_path).unwrap();
    let project = Project {
        id: "proj-term-1".to_string(),
        name: "TermProj".to_string(),
        path: project_dir.to_str().unwrap().to_string(),
        project_type: None,
        languages: vec![],
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
        created_at: chrono::Utc::now().to_rfc3339(),
        source: ProjectSource::Manual,
        parent_project_id: None,
        is_runnable: true,
        is_archived: false,
    };
    upsert_project_with_conn(&conn, &project).unwrap();

    // A. Prove detected High + TerminalRequired
    let scripts = runyard_lib::commands::detect_project_scripts_with_conn(
        Some(&conn),
        project_dir.to_str().unwrap(),
        Some("proj-term-1"),
    )
    .unwrap();
    let script = scripts
        .iter()
        .find(|s| s.name == "run_dev.sh")
        .expect("Synthetic script must be detected");
    assert_eq!(
        script.confidence,
        ScriptConfidence::High,
        "Script must qualify with High confidence"
    );
    assert_eq!(
        script.execution_mode,
        ScriptExecutionMode::TerminalRequired,
        "Synthetic script with read -p must qualify as TerminalRequired"
    );

    // B. Prove deterministic backing config created
    let cfg = runyard_lib::commands::get_or_create_script_run_config_with_conn(
        &conn,
        "proj-term-1",
        "run_dev.sh",
    )
    .unwrap();
    assert_eq!(cfg.source, RunConfigSource::Detected);
    let expected_stable_id = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_DNS,
        b"runyard:script:proj-term-1:run_dev.sh",
    )
    .to_string();
    assert_eq!(cfg.id, expected_stable_id);

    // C. Execution launched through production process-start path
    let pm_state = Arc::new(tokio::sync::Mutex::new(
        runyard_lib::process_manager::ProcessManager::new(),
    ));
    let pty_state = Arc::new(runyard_lib::pty::PtyManager::new());

    // Also spawn an unrelated shell PTY session to prove stopping this script does not affect other sessions
    let unrelated_sid = pty_state
        .create_session(None, project_dir.to_str().unwrap(), 80, 24)
        .expect("Unrelated PTY session must be created successfully");
    assert!(pty_state.has_session(&unrelated_sid));

    // Trust backing config before running through production boundary
    runyard_lib::commands::trust_run_config_with_conn(&conn, &cfg.id).unwrap();

    // Launch through real backend production start path
    let proc_info = runyard_lib::commands::start_process_with_state_and_conn(
        &conn, &cfg.id, &pm_state, &pty_state, None,
    )
    .await
    .expect("Process must start through production start path");

    // D. Returned ProcessInfo exists
    assert_eq!(proc_info.run_config_id, cfg.id);
    assert_eq!(proc_info.status, ProcessStatus::Running);

    // E. Process appears in list_processes / ProcessManager
    let procs = runyard_lib::commands::list_processes_with_state(&pm_state).await;
    assert!(
        procs.iter().any(|p| p.id == proc_info.id),
        "Process must appear in ProcessManager list_processes"
    );

    // F. Process has PTY session association
    let session_id = proc_info
        .pty_session_id
        .clone()
        .expect("TerminalRequired process must register PTY session ID");
    assert!(
        pty_state.has_session(&session_id),
        "PtyManager must track the session"
    );

    // Wait for the prompt to appear in the output buffer
    let t_start = std::time::Instant::now();
    let mut prompt_found = false;
    while t_start.elapsed() < std::time::Duration::from_secs(5) {
        if let Some(out) = pty_state.get_session_output(&session_id) {
            if out.contains("Continue? [y/N] ") {
                prompt_found = true;
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(
        prompt_found,
        "Prompt 'Continue? [y/N] ' must appear in PTY output buffer"
    );

    // G. Send 'y\n' through the normal PTY write path
    runyard_lib::commands::write_pty_session_with_state(&session_id, "y\n", &pty_state)
        .await
        .expect("Write to PTY must succeed");

    // H. Output contains 'reply=y'
    let t_reply = std::time::Instant::now();
    let mut child_pid: Option<u32> = None;
    while t_reply.elapsed() < std::time::Duration::from_secs(5) {
        if let Some(out) = pty_state.get_session_output(&session_id) {
            if out.contains("reply=y") {
                if let Some(pos) = out.find("child=") {
                    let rest = &out[pos + 6..];
                    if let Some(end) = rest.find('\n') {
                        let pid_str = rest[..end].trim();
                        if let Ok(p) = pid_str.parse::<u32>() {
                            child_pid = Some(p);
                            break;
                        }
                    }
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(
        child_pid.is_some(),
        "PTY output must confirm 'reply=y' and output child sleep PID"
    );
    let child_sleep_pid = child_pid.unwrap();

    // I. Child sleep PID exists
    #[cfg(unix)]
    unsafe {
        assert_eq!(
            libc::kill(child_sleep_pid as i32, 0),
            0,
            "Child sleep process must exist and be running"
        );
    }

    // J. Stop through production stop_process path
    runyard_lib::commands::stop_process_with_state(&proc_info.id, &pm_state, &pty_state)
        .await
        .expect("stop_process must succeed through production boundary");

    // K. Parent process marked stopped in ProcessManager
    let procs_after = runyard_lib::commands::list_processes_with_state(&pm_state).await;
    let parent_proc = procs_after
        .iter()
        .find(|p| p.id == proc_info.id)
        .expect("Parent process record must exist in ProcessManager");
    assert_eq!(
        parent_proc.status,
        ProcessStatus::Stopped,
        "Parent process must be marked Stopped"
    );

    // L. Child PID disappears
    let t_kill = std::time::Instant::now();
    let mut child_terminated = false;
    #[cfg(unix)]
    while t_kill.elapsed() < std::time::Duration::from_secs(5) {
        unsafe {
            if libc::kill(child_sleep_pid as i32, 0) != 0 {
                child_terminated = true;
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    #[cfg(unix)]
    assert!(
        child_terminated,
        "Child sleep process must be terminated when script is stopped"
    );

    // M. PTY session is closed
    assert!(
        !pty_state.has_session(&session_id),
        "PTY session must be removed and closed upon stop_process"
    );

    // Prove stopping this script does not affect unrelated PTY session
    assert!(
        pty_state.has_session(&unrelated_sid),
        "Unrelated PTY session must remain active and unaffected"
    );
    pty_state.close_session(&unrelated_sid).await.unwrap();
    assert!(!pty_state.has_session(&unrelated_sid));

    set_custom_db_path::<&std::path::Path>(None);
}

#[test]
fn test_backing_config_lifecycle_dedup_delete_rename() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("lifecycle_test.db");
    initialize_at_path(&db_path).unwrap();

    let project_dir = dir.path().join("proj_lifecycle");
    fs::create_dir_all(&project_dir).unwrap();
    let script_file = project_dir.join("run_dev.sh");
    fs::write(&script_file, b"#!/bin/bash\nexec uvicorn main:app\n").unwrap();

    let conn = get_connection_for_path(&db_path).unwrap();
    let project = Project {
        id: "proj-life-1".to_string(),
        name: "LifeProj".to_string(),
        path: project_dir.to_str().unwrap().to_string(),
        project_type: None,
        languages: vec![],
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
        created_at: chrono::Utc::now().to_rfc3339(),
        source: ProjectSource::Manual,
        parent_project_id: None,
        is_runnable: true,
        is_archived: false,
    };
    upsert_project_with_conn(&conn, &project).unwrap();

    // UserCreated config in same project (MUST be protected)
    let user_cfg = RunConfiguration {
        id: "user-custom-cfg".to_string(),
        project_id: "proj-life-1".to_string(),
        service_id: None,
        name: "My Custom Config".to_string(),
        command: "npm test".to_string(),
        args: vec![],
        working_dir: Some(project_dir.to_str().unwrap().to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    save_run_config_with_conn(&conn, &user_cfg).unwrap();

    // Step 1: Detect and create deterministic Detected backing RunConfiguration
    let scripts = runyard_lib::commands::detect_project_scripts_with_conn(
        Some(&conn),
        project_dir.to_str().unwrap(),
        Some("proj-life-1"),
    )
    .unwrap();
    assert_eq!(scripts.len(), 1);

    let cfg = runyard_lib::commands::get_or_create_script_run_config_with_conn(
        &conn,
        "proj-life-1",
        "run_dev.sh",
    )
    .unwrap();

    let detected_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE project_id = 'proj-life-1' AND source = 'Detected'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        detected_count, 1,
        "Verify Detected backing config count = 1"
    );

    // A. DELETE run_dev.sh
    fs::remove_file(&script_file).unwrap();

    // B. Run normal script/config reconciliation path
    let scripts_after_delete = runyard_lib::commands::detect_project_scripts_with_conn(
        Some(&conn),
        project_dir.to_str().unwrap(),
        Some("proj-life-1"),
    )
    .unwrap();
    assert_eq!(scripts_after_delete.len(), 0);

    // C. Verify old Detected backing RunConfiguration count = 0
    let detected_count_after_del: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE project_id = 'proj-life-1' AND source = 'Detected'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        detected_count_after_del, 0,
        "Orphaned Detected backing config must be pruned (count = 0)"
    );

    // Verify UserCreated row remains untouched
    let user_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE id = 'user-custom-cfg' AND source = 'UserCreated'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        user_count, 1,
        "UserCreated config row must remain untouched"
    );

    // Recreate run_dev.sh
    fs::write(&script_file, b"#!/bin/bash\nexec uvicorn main:app\n").unwrap();
    let cfg_recreated = runyard_lib::commands::get_or_create_script_run_config_with_conn(
        &conn,
        "proj-life-1",
        "run_dev.sh",
    )
    .unwrap();
    assert_eq!(cfg_recreated.id, cfg.id);

    // Rename run_dev.sh -> dev.sh
    let renamed_file = project_dir.join("dev.sh");
    fs::rename(&script_file, &renamed_file).unwrap();

    // Run normal discovery/reconciliation
    let scripts_after_rename = runyard_lib::commands::detect_project_scripts_with_conn(
        Some(&conn),
        project_dir.to_str().unwrap(),
        Some("proj-life-1"),
    )
    .unwrap();
    assert_eq!(scripts_after_rename.len(), 1);
    assert_eq!(scripts_after_rename[0].name, "dev.sh");

    let dev_cfg = runyard_lib::commands::get_or_create_script_run_config_with_conn(
        &conn,
        "proj-life-1",
        "dev.sh",
    )
    .unwrap();

    // Verify old run_dev.sh Detected config = 0
    let old_cfg_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE id = ?",
            [&cfg.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(old_cfg_count, 0, "Old run_dev.sh Detected config must be 0");

    // Verify new dev.sh Detected config = 1
    let new_cfg_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE id = ?",
            [&dev_cfg.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(new_cfg_count, 1, "New dev.sh Detected config must be 1");

    // Verify new config has deterministic identity for dev.sh
    let expected_dev_id = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_DNS,
        b"runyard:script:proj-life-1:dev.sh",
    )
    .to_string();
    assert_eq!(
        dev_cfg.id, expected_dev_id,
        "New config must have deterministic identity for dev.sh"
    );

    // Verify no stale/orphaned Detected script config remains
    let total_det_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE project_id = 'proj-life-1' AND source = 'Detected'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        total_det_count, 1,
        "Exactly 1 Detected config must remain in the project"
    );

    // Verify UserCreated config still exists
    let user_cfg_exists: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE id = 'user-custom-cfg' AND source = 'UserCreated'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(user_cfg_exists, 1, "UserCreated config must still exist");

    // Clean up custom db path
    set_custom_db_path::<&std::path::Path>(None);
}

#[test]
fn test_migration_v8_exact_collision_suite() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("migration_collision_test.db");
    let mut conn = Connection::open(&db_path).unwrap();

    conn.execute_batch(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
         INSERT INTO schema_version (version) VALUES (7);
         CREATE TABLE projects (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             path TEXT NOT NULL UNIQUE,
             git_branch TEXT,
             source TEXT NOT NULL,
             parent_project_id TEXT,
             is_runnable BOOLEAN NOT NULL DEFAULT 1,
             is_archived BOOLEAN NOT NULL DEFAULT 0,
             created_at TEXT NOT NULL
         );
         CREATE TABLE services (
             id TEXT PRIMARY KEY,
             project_id TEXT NOT NULL,
             name TEXT NOT NULL,
             path TEXT NOT NULL,
             service_type TEXT,
             languages TEXT NOT NULL,
             frameworks TEXT NOT NULL,
             is_runnable BOOLEAN NOT NULL DEFAULT 1,
             created_at TEXT NOT NULL
         );
         CREATE TABLE run_configurations (
             id TEXT PRIMARY KEY,
             project_id TEXT NOT NULL,
             service_id TEXT,
             name TEXT NOT NULL,
             command TEXT NOT NULL,
             args TEXT NOT NULL,
             working_dir TEXT,
             env_file TEXT,
             env_vars TEXT NOT NULL,
             is_trusted BOOLEAN NOT NULL DEFAULT 0,
             trusted_fingerprint TEXT,
             is_default BOOLEAN NOT NULL DEFAULT 0,
             source TEXT NOT NULL DEFAULT 'Detected',
             created_at TEXT NOT NULL
         );",
    )
    .unwrap();

    conn.execute(
        "INSERT INTO projects (id, name, path, source, created_at) VALUES ('p_root', 'Root', '/workspace', 'Manual', '2026-01-01')",
        [],
    ).unwrap();

    // PRUNE targets:
    // /workspace/scratch/tool
    // /workspace/test-corpus/repository
    // /workspace/fixtures/server
    // /workspace/benchmarks/runner
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at) VALUES
         ('s_prune_1', 'p_root', 'tool', '/workspace/scratch/tool', '[]', '[]', '2026-01-01'),
         ('s_prune_2', 'p_root', 'repository', '/workspace/test-corpus/repository', '[]', '[]', '2026-01-01'),
         ('s_prune_3', 'p_root', 'server', '/workspace/fixtures/server', '[]', '[]', '2026-01-01'),
         ('s_prune_4', 'p_root', 'runner', '/workspace/benchmarks/runner', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();

    // KEEP targets:
    // /workspace/scratchpad-server
    // /workspace/test-corpus-manager
    // /workspace/my-fixtures-service
    // /workspace/benchmarking-platform
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, created_at) VALUES
         ('s_keep_1', 'p_root', 'scratchpad-server', '/workspace/scratchpad-server', '[]', '[]', '2026-01-01'),
         ('s_keep_2', 'p_root', 'test-corpus-manager', '/workspace/test-corpus-manager', '[]', '[]', '2026-01-01'),
         ('s_keep_3', 'p_root', 'my-fixtures-service', '/workspace/my-fixtures-service', '[]', '[]', '2026-01-01'),
         ('s_keep_4', 'p_root', 'benchmarking-platform', '/workspace/benchmarking-platform', '[]', '[]', '2026-01-01')",
        [],
    ).unwrap();

    // Manual Service under /workspace/scratch/tool -> MUST KEEP
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, languages, frameworks, is_runnable, created_at)
         VALUES ('s_manual_scratch', 'p_root', 'manual-scratch-tool', '/workspace/scratch/tool', '[]', '[]', 1, '2026-01-01')",
        [],
    ).unwrap();

    // UserCreated config under /workspace/test-corpus/repository -> MUST KEEP
    conn.execute(
        "INSERT INTO run_configurations (id, project_id, service_id, name, command, args, env_vars, working_dir, source, created_at)
         VALUES ('cfg_user_corpus', 'p_root', 's_prune_2', 'user test config', 'cargo test', '[]', '{}', '/workspace/test-corpus/repository', 'UserCreated', '2026-01-01')",
        [],
    ).unwrap();

    // Run Migration v8
    migrate(&mut conn).unwrap();

    // PRUNE verifications:
    let prune_1: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_prune_1'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    let prune_2: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_prune_2'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    let prune_3: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_prune_3'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    let prune_4: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_prune_4'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();

    assert!(!prune_1, "/workspace/scratch/tool must be PRUNED");
    assert!(!prune_2, "/workspace/test-corpus/repository must be PRUNED");
    assert!(!prune_3, "/workspace/fixtures/server must be PRUNED");
    assert!(!prune_4, "/workspace/benchmarks/runner must be PRUNED");

    // KEEP verifications:
    let keep_1: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_keep_1'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    let keep_2: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_keep_2'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    let keep_3: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_keep_3'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    let keep_4: bool = conn
        .query_row(
            "SELECT count(*) FROM services WHERE id = 's_keep_4'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();

    assert!(keep_1, "/workspace/scratchpad-server must be KEPT");
    assert!(keep_2, "/workspace/test-corpus-manager must be KEPT");
    assert!(keep_3, "/workspace/my-fixtures-service must be KEPT");
    assert!(keep_4, "/workspace/benchmarking-platform must be KEPT");

    // User data preservation verification:
    let user_cfg_kept: bool = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE id = 'cfg_user_corpus'",
            [],
            |r| r.get::<_, i64>(0).map(|c| c > 0),
        )
        .unwrap();
    assert!(
        user_cfg_kept,
        "UserCreated config under test-corpus must be KEPT"
    );
}
