use runyard_lib::db::{
    add_scan_root_with_conn, get_all_projects_with_conn, get_project_by_path_with_conn,
    get_scan_roots_with_conn, initialize_at_path, remove_scan_root_with_conn,
    upsert_project_with_conn,
};
use runyard_lib::models::{Project, ProjectSource, RunConfigSource, RunConfiguration, ScanRoot};
use rusqlite::Connection;
use tempfile::tempdir;

fn create_test_project(
    id: &str,
    name: &str,
    path: &str,
    source: ProjectSource,
    parent_id: Option<&str>,
) -> Project {
    Project {
        id: id.to_string(),
        name: name.to_string(),
        path: path.to_string(),
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
        created_at: "2026-01-01T00:00:00Z".to_string(),
        source,
        parent_project_id: parent_id.map(|s| s.to_string()),
        is_runnable: false,
        is_archived: false,
    }
}

#[test]
fn test_scenario_a_basic_root_removal() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_a.db");
    initialize_at_path(&db_path).unwrap();
    let mut conn = Connection::open(&db_path).unwrap();

    let root = ScanRoot {
        id: "root-1".to_string(),
        path: "/tmp/workspace".to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let p1 = create_test_project(
        "p1",
        "app-a",
        "/tmp/workspace/app-a",
        ProjectSource::Discovered,
        None,
    );
    let p2 = create_test_project(
        "p2",
        "app-b",
        "/tmp/workspace/app-b",
        ProjectSource::Discovered,
        None,
    );
    upsert_project_with_conn(&conn, &p1).unwrap();
    upsert_project_with_conn(&conn, &p2).unwrap();

    // Verify initial state: 1 root, 2 projects
    assert_eq!(get_scan_roots_with_conn(&conn).unwrap().len(), 1);
    assert_eq!(get_all_projects_with_conn(&conn).unwrap().len(), 2);

    // Remove the scan root
    let affected = remove_scan_root_with_conn(&mut conn, "root-1").unwrap();
    assert_eq!(affected.len(), 2);

    // After removal:
    // - root count = 0
    // - both discovered projects are absent from active catalog
    // - active catalog is empty
    assert_eq!(get_scan_roots_with_conn(&conn).unwrap().len(), 0);
    let remaining = get_all_projects_with_conn(&conn).unwrap();
    assert!(
        remaining.is_empty(),
        "Active catalog must be empty after removing the only scan root"
    );
}

#[test]
fn test_scenario_b_manual_project_protection() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_b.db");
    initialize_at_path(&db_path).unwrap();
    let mut conn = Connection::open(&db_path).unwrap();

    let root = ScanRoot {
        id: "root-1".to_string(),
        path: "/tmp/workspace".to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    // Discovered project under root
    let p_disc = create_test_project(
        "p-disc",
        "discovered-app",
        "/tmp/workspace/discovered-app",
        ProjectSource::Discovered,
        None,
    );
    // Manual project inside the same root path
    let p_manual = create_test_project(
        "p-manual",
        "manual-project",
        "/tmp/workspace/manual-project",
        ProjectSource::Manual,
        None,
    );

    upsert_project_with_conn(&conn, &p_disc).unwrap();
    upsert_project_with_conn(&conn, &p_manual).unwrap();

    assert_eq!(get_all_projects_with_conn(&conn).unwrap().len(), 2);

    // Remove the scan root
    remove_scan_root_with_conn(&mut conn, "root-1").unwrap();

    // After root removal:
    // - manual-project remains available in active catalog
    // - discovered project is gone
    let remaining = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, "p-manual");
    assert_eq!(remaining[0].source, ProjectSource::Manual);
}

#[test]
fn test_scenario_c_overlapping_roots() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_c.db");
    initialize_at_path(&db_path).unwrap();
    let mut conn = Connection::open(&db_path).unwrap();

    let root_outer = ScanRoot {
        id: "root-outer".to_string(),
        path: "/tmp/workspace".to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    let root_inner = ScanRoot {
        id: "root-inner".to_string(),
        path: "/tmp/workspace/important".to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root_outer).unwrap();
    add_scan_root_with_conn(&conn, &root_inner).unwrap();

    // Project under the nested / overlapping root
    let p_nested = create_test_project(
        "p-nested",
        "nested-app",
        "/tmp/workspace/important/app",
        ProjectSource::Discovered,
        None,
    );
    // Project only under outer root
    let p_outer = create_test_project(
        "p-outer",
        "outer-app",
        "/tmp/workspace/other-app",
        ProjectSource::Discovered,
        None,
    );

    upsert_project_with_conn(&conn, &p_nested).unwrap();
    upsert_project_with_conn(&conn, &p_outer).unwrap();

    assert_eq!(get_all_projects_with_conn(&conn).unwrap().len(), 2);

    // Remove outer root /tmp/workspace
    remove_scan_root_with_conn(&mut conn, "root-outer").unwrap();

    // After removing outer root:
    // - nested app remains because root_inner still covers it
    // - outer app is removed
    let remaining = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, "p-nested");
    assert_eq!(remaining[0].path, "/tmp/workspace/important/app");
}

#[test]
fn test_scenario_d_path_prefix_safety() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_d.db");
    initialize_at_path(&db_path).unwrap();
    let mut conn = Connection::open(&db_path).unwrap();

    let root_foo = ScanRoot {
        id: "root-foo".to_string(),
        path: "/tmp/foo".to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root_foo).unwrap();

    // Project at /tmp/foobar/app shares string prefix "/tmp/foo" but NOT a path component!
    let p_foobar = create_test_project(
        "p-foobar",
        "foobar-app",
        "/tmp/foobar/app",
        ProjectSource::Discovered,
        None,
    );
    // Project at /tmp/foo/child is a legitimate child
    let p_foo = create_test_project(
        "p-foo",
        "foo-child",
        "/tmp/foo/child",
        ProjectSource::Discovered,
        None,
    );

    upsert_project_with_conn(&conn, &p_foobar).unwrap();
    upsert_project_with_conn(&conn, &p_foo).unwrap();

    // Remove root /tmp/foo
    let affected = remove_scan_root_with_conn(&mut conn, "root-foo").unwrap();

    assert!(
        !affected.contains(&"p-foobar".to_string()),
        "p-foobar must NOT be affected by removing /tmp/foo"
    );
    assert!(affected.contains(&"p-foo".to_string()));

    let remaining = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, "p-foobar");
}

#[test]
fn test_scenario_e_nested_services_and_subprojects() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_e.db");
    initialize_at_path(&db_path).unwrap();
    let mut conn = Connection::open(&db_path).unwrap();

    let root = ScanRoot {
        id: "root-1".to_string(),
        path: "/tmp/workspace".to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    let parent = create_test_project(
        "parent",
        "parent-mono",
        "/tmp/workspace/mono",
        ProjectSource::Discovered,
        None,
    );
    let subproject = create_test_project(
        "sub",
        "sub-pkg",
        "/tmp/workspace/mono/sub-pkg",
        ProjectSource::Discovered,
        Some("parent"),
    );

    upsert_project_with_conn(&conn, &parent).unwrap();
    upsert_project_with_conn(&conn, &subproject).unwrap();

    // Insert service directly into services table
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, service_type, languages, frameworks, is_runnable, created_at)
         VALUES ('svc-1', 'parent', 'api-svc', 'api', 'rust', '[]', '[]', 0, '2026-01-01T00:00:00Z')",
        [],
    )
    .unwrap();

    assert_eq!(get_all_projects_with_conn(&conn).unwrap().len(), 2);

    // Remove scan root
    let affected = remove_scan_root_with_conn(&mut conn, "root-1").unwrap();
    assert!(affected.contains(&"parent".to_string()));
    assert!(affected.contains(&"sub".to_string()));

    // Active catalog is empty
    assert_eq!(get_all_projects_with_conn(&conn).unwrap().len(), 0);

    // Nested services should be gone due to cascade deletion
    let svc_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM services WHERE project_id = 'parent'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(svc_count, 0);
}

#[test]
fn test_scenario_f_user_data_safety() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_f.db");
    initialize_at_path(&db_path).unwrap();
    let mut conn = Connection::open(&db_path).unwrap();

    let root = ScanRoot {
        id: "root-1".to_string(),
        path: "/tmp/workspace".to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    // Create a user-enriched project: favorite, tags, preferred IDE
    let mut enriched_p = create_test_project(
        "p-enriched",
        "enriched-app",
        "/tmp/workspace/enriched-app",
        ProjectSource::Discovered,
        None,
    );
    enriched_p.is_favorite = true;
    enriched_p.tags = vec!["critical".to_string(), "backend".to_string()];
    enriched_p.preferred_ide = Some("code".to_string());
    upsert_project_with_conn(&conn, &enriched_p).unwrap();

    // Add a custom user-created run configuration
    let custom_cfg = RunConfiguration {
        id: "rc-user".to_string(),
        project_id: "p-enriched".to_string(),
        service_id: None,
        name: "Custom Dev Script".to_string(),
        command: "cargo".to_string(),
        args: vec![
            "run".to_string(),
            "--bin".to_string(),
            "special".to_string(),
        ],
        working_dir: None,
        env_file: None,
        env_vars: std::collections::HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::UserCreated,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    conn.execute(
        "INSERT INTO run_configurations (id, project_id, name, command, args, working_dir, env_file, env_vars, is_trusted, trusted_fingerprint, is_default, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        (
            &custom_cfg.id,
            &custom_cfg.project_id,
            &custom_cfg.name,
            &custom_cfg.command,
            serde_json::to_string(&custom_cfg.args).unwrap(),
            &custom_cfg.working_dir,
            &custom_cfg.env_file,
            "{}",
            custom_cfg.is_trusted,
            &custom_cfg.trusted_fingerprint,
            custom_cfg.is_default,
            "UserCreated",
            &custom_cfg.created_at,
        ),
    )
    .unwrap();

    // Create an untouched project
    let untouched_p = create_test_project(
        "p-untouched",
        "untouched-app",
        "/tmp/workspace/untouched-app",
        ProjectSource::Discovered,
        None,
    );
    upsert_project_with_conn(&conn, &untouched_p).unwrap();

    assert_eq!(get_all_projects_with_conn(&conn).unwrap().len(), 2);

    // Remove the scan root
    let affected = remove_scan_root_with_conn(&mut conn, "root-1").unwrap();
    assert_eq!(affected.len(), 2);

    // 1. Visible active catalog is empty
    let active_projects = get_all_projects_with_conn(&conn).unwrap();
    assert!(
        active_projects.is_empty(),
        "Explorer active catalog must be empty"
    );

    // 2. Untouched project was pruned (hard deleted)
    let untouched_in_db =
        get_project_by_path_with_conn(&conn, "/tmp/workspace/untouched-app").unwrap();
    assert!(untouched_in_db.is_none());

    // 3. User-enriched project is preserved as archived in DB
    let archived_p = get_project_by_path_with_conn(&conn, "/tmp/workspace/enriched-app").unwrap();
    assert!(archived_p.is_some());
    let ap = archived_p.unwrap();
    assert!(ap.is_archived);
    assert!(ap.is_favorite);
    assert_eq!(ap.tags, vec!["critical".to_string(), "backend".to_string()]);
    assert_eq!(ap.preferred_ide, Some("code".to_string()));

    // User-created run config is preserved
    let cfg_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE id = 'rc-user'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(cfg_count, 1);

    // 4. Rediscovery simulation: Root re-added and project rescanned
    add_scan_root_with_conn(&conn, &root).unwrap();

    // Re-scanning updates project and toggles is_archived to false
    let mut restored_p = ap.clone();
    restored_p.is_archived = false;
    upsert_project_with_conn(&conn, &restored_p).unwrap();

    // Active catalog now contains the restored project with all metadata intact
    let active_after_rescan = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(active_after_rescan.len(), 1);
    let rp = &active_after_rescan[0];
    assert_eq!(rp.id, "p-enriched");
    assert!(rp.is_favorite);
    assert_eq!(rp.tags, vec!["critical".to_string(), "backend".to_string()]);
    assert_eq!(rp.preferred_ide, Some("code".to_string()));
    assert!(!rp.is_archived);
}

#[test]
fn test_scenario_g_legacy_database_with_orphaned_discovered_projects() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_legacy.db");

    // Simulate legacy v6 database before Migration 7:
    // scan_roots is empty, projects contains legacy records with quotes and unquotes, some enriched, some untouched.
    {
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE schema_version (version INTEGER PRIMARY KEY)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO schema_version (version) VALUES (6)", [])
            .unwrap();
        conn.execute(
            "CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                project_type TEXT,
                languages TEXT,
                frameworks TEXT,
                has_git BOOLEAN NOT NULL DEFAULT 0,
                git_branch TEXT,
                git_remote TEXT,
                preferred_ide TEXT,
                is_favorite BOOLEAN NOT NULL DEFAULT 0,
                tags TEXT,
                last_opened TEXT,
                last_run TEXT,
                created_at TEXT NOT NULL,
                default_run_config_id TEXT,
                source TEXT NOT NULL DEFAULT 'Discovered',
                parent_project_id TEXT,
                is_runnable BOOLEAN NOT NULL DEFAULT 0,
                is_archived BOOLEAN NOT NULL DEFAULT 0
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE scan_roots (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE run_configurations (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                service_id TEXT,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                args TEXT NOT NULL,
                working_dir TEXT,
                env_file TEXT,
                env_vars TEXT,
                is_trusted BOOLEAN NOT NULL DEFAULT 0,
                trusted_fingerprint TEXT,
                is_default BOOLEAN NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'Detected',
                created_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE run_groups (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE run_group_members (
                id TEXT PRIMARY KEY,
                run_group_id TEXT NOT NULL,
                run_config_id TEXT NOT NULL,
                order_index INTEGER NOT NULL
            )",
            [],
        )
        .unwrap();

        // Insert legacy orphaned discovered projects with both 'Discovered' and '"Discovered"'
        // 1. Untouched project with '"Discovered"'
        conn.execute(
            "INSERT INTO projects (id, name, path, languages, frameworks, source, is_archived, created_at)
             VALUES ('p-old-1', 'app-old-1', '/home/gimesha/My_Projects/old-1', '[]', '[]', '\"Discovered\"', 0, '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        // 2. Untouched project with 'Discovered'
        conn.execute(
            "INSERT INTO projects (id, name, path, languages, frameworks, source, is_archived, created_at)
             VALUES ('p-old-2', 'app-old-2', '/home/gimesha/My_Projects/old-2', '[]', '[]', 'Discovered', 0, '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        // 3. User-enriched project (has a trusted run config)
        conn.execute(
            "INSERT INTO projects (id, name, path, languages, frameworks, source, is_archived, created_at)
             VALUES ('p-enriched', 'portfolio', '/home/gimesha/My_Projects/portfolio', '[]', '[]', 'Discovered', 0, '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO run_configurations (id, project_id, name, command, args, is_trusted, created_at)
             VALUES ('rc-trust-1', 'p-enriched', 'npm run dev', 'npm', '[\"run\",\"dev\"]', 1, '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        // 4. Manually imported project
        conn.execute(
            "INSERT INTO projects (id, name, path, languages, frameworks, source, is_archived, created_at)
             VALUES ('p-manual', 'my-special-tool', '/home/gimesha/tools/special', '[]', '[]', 'Manual', 0, '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
    }

    // Now open and run migration to current version (v7)
    let mut conn = Connection::open(&db_path).unwrap();
    runyard_lib::db::migrate(&mut conn).unwrap();

    // Verify Migration 7 effects:
    // - Untouched discovered projects are pruned (hard deleted)
    // - User-enriched discovered project is preserved but archived (is_archived = 1)
    // - Genuinely manual project remains active!
    let active_projects = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(
        active_projects.len(),
        1,
        "Only the manual project should remain active"
    );
    assert_eq!(active_projects[0].id, "p-manual");

    // Check that p-old-1 and p-old-2 are deleted from the table
    let p1 = get_project_by_path_with_conn(&conn, "/home/gimesha/My_Projects/old-1").unwrap();
    assert!(p1.is_none());
    let p2 = get_project_by_path_with_conn(&conn, "/home/gimesha/My_Projects/old-2").unwrap();
    assert!(p2.is_none());

    // Check that p-enriched is archived and preserved in DB
    let enriched = get_project_by_path_with_conn(&conn, "/home/gimesha/My_Projects/portfolio")
        .unwrap()
        .unwrap();
    assert!(enriched.is_archived);
    assert_eq!(enriched.source, ProjectSource::Discovered); // normalized without quotes

    // Now re-add the scan root /home/gimesha/My_Projects
    let root = ScanRoot {
        id: "root-my-projects".to_string(),
        path: "/home/gimesha/My_Projects".to_string(),
        enabled: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    add_scan_root_with_conn(&conn, &root).unwrap();

    // Re-scanning unarchives the enriched project
    let mut restored = enriched.clone();
    restored.is_archived = false;
    upsert_project_with_conn(&conn, &restored).unwrap();

    let active_after_rescan = get_all_projects_with_conn(&conn).unwrap();
    assert_eq!(active_after_rescan.len(), 2);
    assert!(active_after_rescan.iter().any(|p| p.id == "p-manual"));
    assert!(active_after_rescan.iter().any(|p| p.id == "p-enriched"));
}
