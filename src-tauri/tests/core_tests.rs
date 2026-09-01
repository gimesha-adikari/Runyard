use runyard_lib::models::*;
use std::collections::HashMap;
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
fn test_monorepo_service_detection() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    let mono_dir = root.join("platen-mono");
    fs::create_dir_all(mono_dir.join("frontend")).unwrap();
    fs::create_dir_all(mono_dir.join("backend")).unwrap();
    fs::create_dir_all(mono_dir.join("worker")).unwrap();

    fs::write(mono_dir.join("frontend").join("package.json"), r#"{"name": "frontend", "scripts": {"dev": "vite"}}"#).unwrap();
    fs::write(mono_dir.join("backend").join("Cargo.toml"), "[package]\nname = \"backend\"").unwrap();
    fs::write(mono_dir.join("worker").join("pyproject.toml"), "[project]\nname = \"worker\"").unwrap();

    let services = runyard_lib::scanner::detect_services_in_project(mono_dir.to_str().unwrap());
    assert_eq!(services.len(), 3);
    let names: Vec<String> = services.into_iter().map(|s| s.name).collect();
    assert!(names.contains(&"frontend".to_string()));
    assert!(names.contains(&"backend".to_string()));
    assert!(names.contains(&"worker".to_string()));
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
fn test_git_branches_and_diffs() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    Command::new("git").args(["init"]).current_dir(root).status().unwrap();
    Command::new("git").args(["config", "user.name", "Test"]).current_dir(root).status().unwrap();
    Command::new("git").args(["config", "user.email", "test@test.com"]).current_dir(root).status().unwrap();

    fs::write(root.join("test.txt"), "hello\n").unwrap();
    Command::new("git").args(["add", "test.txt"]).current_dir(root).status().unwrap();
    Command::new("git").args(["commit", "-m", "init"]).current_dir(root).status().unwrap();

    // Create a new branch
    runyard_lib::git::git_create_branch(root.to_str().unwrap(), "feature-1").unwrap();
    let branches = runyard_lib::git::get_git_branches(root.to_str().unwrap()).unwrap();
    assert!(branches.iter().any(|b| b.name == "feature-1" && b.is_current));

    // Modify file and test diff
    fs::write(root.join("test.txt"), "hello world\n").unwrap();
    let diff = runyard_lib::git::get_file_diff(root.to_str().unwrap(), "test.txt", false).unwrap();
    assert!(diff.diff.contains("+hello world"));
}

#[test]
fn test_database_operations_and_migrations() {
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
        preferred_ide: Some("code".to_string()),
        default_run_config_id: None,
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
    assert_eq!(fetched.preferred_ide, Some("code".to_string()));

    // Services
    let service_id = uuid::Uuid::new_v4().to_string();
    let service = Service {
        id: service_id.clone(),
        project_id: project_id.clone(),
        name: "api".to_string(),
        path: "services/api".to_string(),
        service_type: Some("node".to_string()),
        languages: vec!["TypeScript".to_string()],
        frameworks: vec!["Express".to_string()],
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    runyard_lib::db::upsert_service(&service).unwrap();
    let services = runyard_lib::db::get_services(&project_id).unwrap();
    assert_eq!(services.len(), 1);
    assert_eq!(services[0].name, "api");

    // Run configuration with env vars
    let mut env_vars = HashMap::new();
    env_vars.insert("PORT".to_string(), "8080".to_string());

    let config_id = uuid::Uuid::new_v4().to_string();
    let config = RunConfiguration {
        id: config_id.clone(),
        project_id: project_id.clone(),
        service_id: Some(service_id.clone()),
        name: "cargo run".to_string(),
        command: "cargo".to_string(),
        args: vec!["run".to_string()],
        working_dir: None,
        env_file: None,
        env_vars,
        is_trusted: true,
        is_default: true,
        source: RunConfigSource::UserCreated,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    runyard_lib::db::save_run_config(&config).unwrap();
    let configs = runyard_lib::db::get_run_configs(&project_id).unwrap();
    assert_eq!(configs.len(), 1);
    assert_eq!(configs[0].env_vars.get("PORT"), Some(&"8080".to_string()));

    // Run Groups
    let group_id = uuid::Uuid::new_v4().to_string();
    let group = RunGroup {
        id: group_id.clone(),
        project_id: project_id.clone(),
        name: "Full Stack".to_string(),
        member_config_ids: vec![config_id.clone()],
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    runyard_lib::db::save_run_group(&group).unwrap();
    let groups = runyard_lib::db::get_run_groups(&project_id).unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].name, "Full Stack");
    assert_eq!(groups[0].member_config_ids, vec![config_id.clone()]);

    // Rescan / update preservation: re-upserting project preserves user's favorite, preferred IDE, tags
    runyard_lib::db::toggle_favorite(&project_id).unwrap();
    let updated_project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Updated Name".to_string(),
        path: format!("/tmp/test_project_{}", project_id),
        project_type: Some("rust".to_string()),
        languages: vec!["Rust".to_string()],
        frameworks: vec!["Axum".to_string()],
        has_git: true,
        git_branch: Some("feature".to_string()),
        git_remote: None,
        preferred_ide: None,
        default_run_config_id: None,
        is_favorite: false,
        tags: vec![],
        last_opened: None,
        last_run: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    runyard_lib::db::upsert_project(&updated_project).unwrap();
    let after_rescan = runyard_lib::db::get_project_by_path(&format!("/tmp/test_project_{}", project_id)).unwrap().unwrap();
    assert!(after_rescan.is_favorite);
    assert_eq!(after_rescan.preferred_ide, Some("code".to_string()));
    assert_eq!(after_rescan.tags, vec!["backend".to_string()]);
    assert_eq!(after_rescan.frameworks, vec!["Axum".to_string()]);

    // Cleanup
    runyard_lib::db::delete_project(&project_id).unwrap();
    assert!(runyard_lib::db::get_project(&project_id).is_err());
}
