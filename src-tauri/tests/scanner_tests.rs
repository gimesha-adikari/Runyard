use std::fs;
use tempfile::tempdir;

#[test]
fn test_complex_monorepo_detection() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    // 1. Node apps + shared package
    let web_app = root.join("apps").join("web");
    let api_app = root.join("apps").join("api");
    let shared_pkg = root.join("packages").join("shared");

    fs::create_dir_all(&web_app).unwrap();
    fs::create_dir_all(&api_app).unwrap();
    fs::create_dir_all(&shared_pkg).unwrap();

    fs::write(
        web_app.join("package.json"),
        r#"{"name": "web-app", "scripts": {"dev": "next dev"}}"#,
    )
    .unwrap();
    fs::write(
        api_app.join("package.json"),
        r#"{"name": "api-app", "scripts": {"start": "node server.js"}}"#,
    )
    .unwrap();
    fs::write(shared_pkg.join("package.json"), r#"{"name": "shared-pkg"}"#).unwrap();

    // 2. Go services
    let go_server = root.join("cmd").join("server");
    let go_worker = root.join("cmd").join("worker");
    fs::create_dir_all(&go_server).unwrap();
    fs::create_dir_all(&go_worker).unwrap();
    fs::write(root.join("go.mod"), "module example.com/mono\n\ngo 1.22\n").unwrap();
    fs::write(go_server.join("main.go"), "package main\nfunc main() {}\n").unwrap();
    fs::write(go_worker.join("main.go"), "package main\nfunc main() {}\n").unwrap();

    let services = runyard_lib::scanner::detect_services_in_project(root.to_str().unwrap());
    let names: Vec<String> = services.into_iter().map(|s| s.name).collect();

    assert!(names.contains(&"web".to_string()));
    assert!(names.contains(&"api".to_string()));
    assert!(
        !names.contains(&"shared".to_string()),
        "Library package without runtime scripts must not be a service"
    );
}

#[test]
fn test_symlink_safety_and_no_infinite_loop() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    let app_dir = root.join("app");
    fs::create_dir_all(&app_dir).unwrap();
    fs::write(app_dir.join("package.json"), r#"{"name": "app"}"#).unwrap();

    // Create a circular symlink inside app pointing to its parent
    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        let loop_link = app_dir.join("recursive_link");
        let _ = symlink(root, loop_link);
    }

    let scanned = runyard_lib::scanner::scan_directory(root.to_str().unwrap()).unwrap();
    assert_eq!(scanned.len(), 1);
    assert_eq!(scanned[0].path, app_dir.to_str().unwrap());
}

#[test]
fn test_comprehensive_skipped_directories() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    let valid_proj = root.join("valid-proj");
    fs::create_dir_all(&valid_proj).unwrap();
    fs::write(
        valid_proj.join("Cargo.toml"),
        "[package]\nname = \"valid-proj\"",
    )
    .unwrap();

    let skipped_names = [
        "node_modules",
        ".git",
        "target",
        "build",
        "dist",
        "out",
        "__pycache__",
        ".venv",
        "venv",
        "vendor",
        ".gradle",
        ".idea",
        ".vscode",
        ".cache",
        ".npm",
        ".yarn",
        ".next",
        ".turbo",
        "coverage",
        "bin",
        "obj",
    ];

    for name in skipped_names {
        let fake_sub = valid_proj.join(name).join("fake-subproject");
        fs::create_dir_all(&fake_sub).unwrap();
        fs::write(
            fake_sub.join("package.json"),
            r#"{"name": "should-be-ignored"}"#,
        )
        .unwrap();
    }

    let scanned = runyard_lib::scanner::scan_directory(root.to_str().unwrap()).unwrap();
    assert_eq!(scanned.len(), 1);
    assert_eq!(scanned[0].path, valid_proj.to_str().unwrap());
}
