use std::fs;
use tempfile::tempdir;

#[test]
fn test_ide_detection_and_deduplication() {
    let ides = runyard_lib::ide::detect_ides();
    // Verify no duplicate IDs
    let mut ids = std::collections::HashSet::new();
    for ide in ides {
        assert!(
            ids.insert(ide.id.clone()),
            "Duplicate IDE ID detected: {}",
            ide.id
        );
        assert!(!ide.command.is_empty());
        assert!(!ide.name.is_empty());
    }
}

#[test]
fn test_open_in_ide_and_folder_validates_path() {
    // 1. Non-existent path
    let res = runyard_lib::ide::open_in_ide("echo", "/non_existent_project_path_1234");
    assert!(res.is_err());

    let res_folder = runyard_lib::ide::open_folder("/non_existent_folder_1234");
    assert!(res_folder.is_err());

    // 2. Real directory with spaces
    let dir = tempdir().unwrap();
    let space_dir = dir.path().join("Space In Name Project");
    fs::create_dir_all(&space_dir).unwrap();

    // Verify open_in_ide with safe echo command succeeds
    let res_echo = runyard_lib::ide::open_in_ide("true", space_dir.to_str().unwrap());
    assert!(res_echo.is_ok());
}

#[test]
fn test_default_ide_persistence_and_project_independence() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_ide_settings.db");
    let mut conn = rusqlite::Connection::open(&db_path).unwrap();
    runyard_lib::db::migrate(&mut conn).unwrap();

    // 1. Initial default IDE is None
    let initial_default: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'default_ide'",
            [],
            |row| row.get(0),
        )
        .ok();
    assert_eq!(initial_default, None);

    // 2. Set default IDE to "idea"
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('default_ide', 'idea')
         ON CONFLICT(key) DO UPDATE SET value = 'idea'",
        [],
    )
    .unwrap();

    let def1: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'default_ide'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(def1, "idea");

    // 3. Create a project with preferred_ide = "pycharm"
    conn.execute(
        "INSERT INTO projects (id, name, path, project_type, languages, frameworks, has_git, preferred_ide, is_favorite, tags, created_at, source)
         VALUES ('proj-1', 'My Project', '/tmp/my-proj', 'Application', '[]', '[]', 0, 'pycharm', 0, '[]', '2026-09-03', 'Manual')",
        [],
    ).unwrap();

    let proj_pref: Option<String> = conn
        .query_row(
            "SELECT preferred_ide FROM projects WHERE id = 'proj-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(proj_pref, Some("pycharm".to_string()));

    // 4. Update global default IDE to "code" (VS Code)
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('default_ide', 'code')
         ON CONFLICT(key) DO UPDATE SET value = 'code'",
        [],
    )
    .unwrap();

    let def2: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'default_ide'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(def2, "code");

    // 5. Verify project preferred_ide is strictly preserved
    let proj_pref_after: Option<String> = conn
        .query_row(
            "SELECT preferred_ide FROM projects WHERE id = 'proj-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(proj_pref_after, Some("pycharm".to_string()));
}
