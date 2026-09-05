use runyard_lib::models::RunConfiguration;
use rusqlite::Connection;
use tempfile::tempdir;

#[test]
fn test_migration_from_v1_to_current_preserves_all_data() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("v1_legacy.db");

    let mut conn = Connection::open(&db_path).unwrap();

    // 1. Create legacy v1 schema manually
    conn.execute(
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY)",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO schema_version (version) VALUES (1)", [])
        .unwrap();

    conn.execute(
        "CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            project_type TEXT,
            languages TEXT,
            frameworks TEXT,
            has_git BOOLEAN NOT NULL,
            git_branch TEXT,
            git_remote TEXT,
            preferred_ide TEXT,
            is_favorite BOOLEAN NOT NULL DEFAULT 0,
            tags TEXT,
            last_opened TEXT,
            last_run TEXT,
            created_at TEXT NOT NULL
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
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            args TEXT NOT NULL,
            working_dir TEXT,
            env_file TEXT,
            is_trusted BOOLEAN NOT NULL DEFAULT 0,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )
    .unwrap();

    conn.execute(
        "CREATE TABLE app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )
    .unwrap();

    // 2. Insert v1 legacy records
    conn.execute(
        "INSERT INTO projects (id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, is_favorite, tags, last_opened, last_run, created_at)
         VALUES ('p1', 'Legacy Project', '/home/user/legacy', 'node', '[\"TypeScript\"]', '[\"React\"]', 1, 'main', 'git@github.com:test/legacy.git', 'code', 1, '[\"frontend\", \"web\"]', '2026-01-01T10:00:00Z', '2026-01-02T10:00:00Z', '2025-12-01T00:00:00Z')",
        [],
    ).unwrap();

    conn.execute(
        "INSERT INTO scan_roots (id, path, enabled, created_at)
         VALUES ('sr1', '/home/user/projects', 1, '2025-12-01T00:00:00Z')",
        [],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO run_configurations (id, project_id, name, command, args, working_dir, env_file, is_trusted, source, created_at)
         VALUES ('rc1', 'p1', 'dev server', 'npm', '[\"run\",\"dev\"]', '/home/user/legacy', '.env', 1, 'Detected', '2025-12-01T00:00:00Z')",
        [],
    ).unwrap();

    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('default_ide', 'code')",
        [],
    )
    .unwrap();

    // 3. Run migration to current version
    runyard_lib::db::migrate(&mut conn).unwrap();

    // 4. Verify schema version is 7
    let version: i32 = conn
        .query_row(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(version, 8);

    // Verify services source column exists
    let svc_cols: Vec<String> = {
        let mut pragma = conn.prepare("PRAGMA table_info(services)").unwrap();
        pragma
            .query_map([], |r| r.get(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    };
    assert!(svc_cols.contains(&"source".to_string()));

    // 5. Verify project data preservation
    let (id, name, path, is_fav, pref_ide, tags, is_archived): (
        String,
        String,
        String,
        bool,
        Option<String>,
        String,
        bool,
    ) = conn
        .query_row(
            "SELECT id, name, path, is_favorite, preferred_ide, tags, is_archived FROM projects WHERE id = 'p1'",
            [],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                ))
            },
        )
        .unwrap();

    assert_eq!(id, "p1");
    assert_eq!(name, "Legacy Project");
    assert_eq!(path, "/home/user/legacy");
    assert!(is_fav);
    assert_eq!(pref_ide, Some("code".to_string()));
    assert_eq!(tags, "[\"frontend\", \"web\"]");
    // p1 is not under scan root sr1 (/home/user/projects), but enriched with favorite and tags, so it is archived
    assert!(is_archived);

    // 6. Verify scan roots preserved
    let (sr_id, sr_path): (String, String) = conn
        .query_row(
            "SELECT id, path FROM scan_roots WHERE id = 'sr1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(sr_id, "sr1");
    assert_eq!(sr_path, "/home/user/projects");

    // 7. Verify run config data preservation and automatic fingerprint computation for legacy trusted config
    let (rc_id, is_trusted, trusted_fp): (String, bool, Option<String>) = conn
        .query_row(
            "SELECT id, is_trusted, trusted_fingerprint FROM run_configurations WHERE id = 'rc1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();

    assert_eq!(rc_id, "rc1");
    assert!(is_trusted);
    assert!(trusted_fp.is_some());

    // Verify computed fingerprint matches expected
    let mock_cfg = RunConfiguration {
        id: "rc1".to_string(),
        project_id: "p1".to_string(),
        service_id: None,
        name: "dev server".to_string(),
        command: "npm".to_string(),
        args: vec!["run".to_string(), "dev".to_string()],
        working_dir: Some("/home/user/legacy".to_string()),
        env_file: Some(".env".to_string()),
        env_vars: std::collections::HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: runyard_lib::models::RunConfigSource::Detected,
        created_at: "2025-12-01T00:00:00Z".to_string(),
    };
    assert_eq!(trusted_fp, Some(mock_cfg.compute_fingerprint()));

    // 8. Verify app settings preserved
    let val: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'default_ide'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(val, "code");
}

#[test]
fn test_migration_from_empty_database() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("empty_init.db");

    let mut conn = Connection::open(&db_path).unwrap();
    runyard_lib::db::migrate(&mut conn).unwrap();

    let version: i32 = conn
        .query_row(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(version, 8);

    // Verify all tables exist
    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap();
        stmt.query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    };

    assert!(tables.contains(&"projects".to_string()));
    assert!(tables.contains(&"services".to_string()));
    assert!(tables.contains(&"scan_roots".to_string()));
    assert!(tables.contains(&"run_configurations".to_string()));
    assert!(tables.contains(&"run_groups".to_string()));
    assert!(tables.contains(&"run_group_members".to_string()));
    assert!(tables.contains(&"app_settings".to_string()));
}
