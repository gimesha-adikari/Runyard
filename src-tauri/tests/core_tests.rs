use runyard_lib::models::*;
use std::fs;
use std::process::Command;
use tempfile::tempdir;

#[test]
fn test_project_type_detection() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    // Node + React project
    let node_dir = root.join("node-app");
    fs::create_dir_all(&node_dir).unwrap();
    fs::write(
        node_dir.join("package.json"),
        r#"{"name": "test-node", "dependencies": {"react": "^18.0.0", "next": "13.0.0"}}"#,
    ).unwrap();
    fs::write(node_dir.join("tsconfig.json"), "{}").unwrap();

    let result = runyard_lib::detector::detect_project_type(node_dir.to_str().unwrap());
    assert_eq!(result.project_type, Some("node".to_string()));
    assert!(result.languages.contains(&"TypeScript".to_string()));
    assert!(result.frameworks.contains(&"React".to_string()));
    assert!(result.frameworks.contains(&"Next.js".to_string()));

    // Rust project
    let rust_dir = root.join("rust-app");
    fs::create_dir_all(&rust_dir).unwrap();
    fs::write(rust_dir.join("Cargo.toml"), "[package]\nname = \"test-rust\"").unwrap();

    let result = runyard_lib::detector::detect_project_type(rust_dir.to_str().unwrap());
    assert_eq!(result.project_type, Some("rust".to_string()));
    assert!(result.languages.contains(&"Rust".to_string()));

    // Python FastAPI project
    let py_dir = root.join("py-app");
    fs::create_dir_all(&py_dir).unwrap();
    fs::write(py_dir.join("requirements.txt"), "fastapi\nuvicorn\n").unwrap();

    let result = runyard_lib::detector::detect_project_type(py_dir.to_str().unwrap());
    assert_eq!(result.project_type, Some("python".to_string()));
    assert!(result.frameworks.contains(&"FastAPI".to_string()));
}

#[test]
fn test_scanner_skips_ignored_directories() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    // Valid project
    let valid_proj = root.join("my-app");
    fs::create_dir_all(&valid_proj).unwrap();
    fs::write(valid_proj.join("package.json"), r#"{"name": "app"}"#).unwrap();

    // Project inside node_modules that should be ignored
    let nested_in_nm = valid_proj.join("node_modules").join("some-dep");
    fs::create_dir_all(&nested_in_nm).unwrap();
    fs::write(nested_in_nm.join("package.json"), r#"{"name": "some-dep"}"#).unwrap();

    // Project inside .git that should be ignored
    let git_dir = valid_proj.join(".git");
    fs::create_dir_all(&git_dir).unwrap();
    fs::write(git_dir.join("Cargo.toml"), "invalid").unwrap();

    let scanned = runyard_lib::scanner::scan_directory(root.to_str().unwrap()).unwrap();
    assert_eq!(scanned.len(), 1);
    assert_eq!(scanned[0].path, valid_proj.to_str().unwrap());
}

#[test]
fn test_runtime_run_config_detection() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    let node_dir = root.join("node-proj");
    fs::create_dir_all(&node_dir).unwrap();
    fs::write(
        node_dir.join("package.json"),
        r#"{"scripts": {"dev": "vite", "start": "node index.js", "build": "vite build"}}"#,
    ).unwrap();

    let configs = runyard_lib::runtime_detector::detect_run_configs(node_dir.to_str().unwrap());
    let names: Vec<String> = configs.into_iter().map(|c| c.name).collect();
    assert!(names.contains(&"npm run dev".to_string()));
    assert!(names.contains(&"npm run start".to_string()));
    assert!(names.contains(&"npm run build".to_string()));
}

#[test]
fn test_ide_detection() {
    let ides = runyard_lib::ide::detect_ides();
    for ide in ides {
        assert!(!ide.name.is_empty());
        assert!(!ide.command.is_empty());
    }
}

#[test]
fn test_git_status_detection() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    // Initialize a git repo
    let status = Command::new("git")
        .args(["init"])
        .current_dir(root)
        .status()
        .unwrap();
    assert!(status.success());

    // Configure user for commit
    Command::new("git").args(["config", "user.name", "Runyard Test"]).current_dir(root).status().unwrap();
    Command::new("git").args(["config", "user.email", "test@runyard.dev"]).current_dir(root).status().unwrap();

    // Create an initial committed file
    fs::write(root.join("README.md"), "# Hello").unwrap();
    Command::new("git").args(["add", "README.md"]).current_dir(root).status().unwrap();
    Command::new("git").args(["commit", "-m", "initial commit"]).current_dir(root).status().unwrap();

    // Now create an untracked file and modify existing file
    fs::write(root.join("README.md"), "# Hello World").unwrap();
    fs::write(root.join("untracked.txt"), "new").unwrap();

    let git_status = runyard_lib::git::get_git_status(root.to_str().unwrap()).unwrap();
    assert!(!git_status.is_clean);
    assert_eq!(git_status.modified_files.len(), 1);
    assert_eq!(git_status.untracked_files.len(), 1);
    assert_eq!(git_status.recent_commits.len(), 1);
    assert_eq!(git_status.recent_commits[0].message, "initial commit");
}

#[test]
fn test_database_operations() {
    runyard_lib::db::initialize().unwrap();

    let project_id = uuid::Uuid::new_v4().to_string();
    let project = Project {
        id: project_id.clone(),
        name: "Test Project".to_string(),
        path: format!("/tmp/test_project_{}", project_id),
        project_type: Some("rust".to_string()),
        languages: vec!["Rust".to_string()],
        frameworks: vec![],
        has_git: true,
        git_branch: Some("main".to_string()),
        git_remote: None,
        preferred_ide: None,
        is_favorite: false,
        tags: vec!["backend".to_string()],
        last_opened: None,
        last_run: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    runyard_lib::db::upsert_project(&project).unwrap();

    let fetched = runyard_lib::db::get_project(&project_id).unwrap();
    assert_eq!(fetched.name, "Test Project");
    assert_eq!(fetched.tags, vec!["backend".to_string()]);

    let is_fav = runyard_lib::db::toggle_favorite(&project_id).unwrap();
    assert!(is_fav);

    // Run configuration
    let config = RunConfiguration {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project_id.clone(),
        name: "cargo run".to_string(),
        command: "cargo".to_string(),
        args: vec!["run".to_string()],
        working_dir: None,
        env_file: None,
        is_trusted: false,
        source: RunConfigSource::Detected,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    runyard_lib::db::save_run_config(&config).unwrap();
    let configs = runyard_lib::db::get_run_configs(&project_id).unwrap();
    assert_eq!(configs.len(), 1);
    assert_eq!(configs[0].name, "cargo run");

    // Scan roots
    let root = ScanRoot {
        id: uuid::Uuid::new_v4().to_string(),
        path: format!("/tmp/scan_root_{}", project_id),
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    runyard_lib::db::add_scan_root(&root).unwrap();
    let roots = runyard_lib::db::get_scan_roots().unwrap();
    assert!(roots.iter().any(|r| r.id == root.id));

    // Cleanup
    runyard_lib::db::delete_project(&project_id).unwrap();
    assert!(runyard_lib::db::get_project(&project_id).is_err());
}
