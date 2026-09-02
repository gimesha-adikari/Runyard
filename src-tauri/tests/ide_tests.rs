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
