use runyard_lib::scanner::detect_services_in_project;
use std::fs;
use tempfile::tempdir;

#[test]
fn test_case_l_direct_frontend_app_with_dev_server() {
    let dir = tempdir().unwrap();
    let app_dir = dir.path().join("web-frontend");
    fs::create_dir_all(&app_dir).unwrap();
    fs::write(
        app_dir.join("package.json"),
        r#"{
            "name": "web-frontend",
            "scripts": {
                "dev": "vite",
                "build": "vite build"
            }
        }"#,
    )
    .unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert_eq!(services.len(), 1);
    assert_eq!(services[0].name, "web-frontend");
    assert_eq!(services[0].relative_path, "web-frontend");
}

#[test]
fn test_case_m_direct_backend_api() {
    let dir = tempdir().unwrap();
    let backend_dir = dir.path().join("backend-api");
    fs::create_dir_all(&backend_dir).unwrap();
    fs::write(backend_dir.join("go.mod"), "module backend\n\ngo 1.22\n").unwrap();
    fs::write(
        backend_dir.join("main.go"),
        "package main\nfunc main() {}\n",
    )
    .unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert_eq!(services.len(), 1);
    assert_eq!(services[0].name, "backend-api");
}

#[test]
fn test_case_n_direct_worker_service() {
    let dir = tempdir().unwrap();
    let worker_dir = dir.path().join("worker");
    fs::create_dir_all(&worker_dir).unwrap();
    fs::write(
        worker_dir.join("docker-compose.yml"),
        "version: '3'\nservices:\n  worker:\n    image: worker:latest\n",
    )
    .unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert_eq!(services.len(), 1);
    assert_eq!(services[0].name, "worker");
}

#[test]
fn test_case_o_nested_test_fixture_excluded() {
    let dir = tempdir().unwrap();
    let fixture_dir = dir
        .path()
        .join("test-corpus")
        .join("small")
        .join("repository");
    fs::create_dir_all(&fixture_dir).unwrap();
    fs::write(
        fixture_dir.join("package.json"),
        r#"{ "name": "fixture", "scripts": { "dev": "node dev.js" } }"#,
    )
    .unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert!(
        services.is_empty(),
        "test-corpus fixture must be excluded from discovered services"
    );
}

#[test]
fn test_case_p_scratch_project_excluded() {
    let dir = tempdir().unwrap();
    let scratch_dir = dir.path().join("scratch").join("test_spike");
    fs::create_dir_all(&scratch_dir).unwrap();
    fs::write(scratch_dir.join("go.mod"), "module spike\n\ngo 1.22\n").unwrap();
    fs::write(
        scratch_dir.join("main.go"),
        "package main\nfunc main() {}\n",
    )
    .unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert!(
        services.is_empty(),
        "scratch directory must be excluded from discovered services"
    );
}

#[test]
fn test_case_q_library_package_excluded() {
    let dir = tempdir().unwrap();
    // A pure node library without "dev" or "start" scripts
    let lib_dir = dir.path().join("packages").join("core-utils");
    fs::create_dir_all(&lib_dir).unwrap();
    fs::write(
        lib_dir.join("package.json"),
        r#"{
            "name": "@myorg/core-utils",
            "version": "1.0.0",
            "main": "index.js",
            "scripts": {
                "build": "tsc"
            }
        }"#,
    )
    .unwrap();

    // A pure Rust library without src/main.rs or [[bin]]
    let rust_lib = dir.path().join("packages").join("math-lib");
    fs::create_dir_all(rust_lib.join("src")).unwrap();
    fs::write(
        rust_lib.join("Cargo.toml"),
        "[package]\nname = \"math-lib\"\nversion = \"0.1.0\"\n",
    )
    .unwrap();
    fs::write(rust_lib.join("src").join("lib.rs"), "pub fn add() {}\n").unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert!(
        services.is_empty(),
        "Pure libraries without runtime servers/entrypoints must not qualify as services"
    );
}

#[test]
fn test_case_r_nested_git_subproject_no_runtime_not_service() {
    let dir = tempdir().unwrap();
    // Subproject has .git but only docs/assets (no runtime)
    let doc_proj = dir.path().join("docs-site");
    fs::create_dir_all(doc_proj.join(".git")).unwrap();
    fs::write(doc_proj.join("README.md"), "# Documentation").unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert!(
        services.is_empty(),
        "Nested project without runtime server must not be classified as a service"
    );
}

#[test]
fn test_case_s_duplicate_project_and_service_same_canonical_path() {
    let dir = tempdir().unwrap();
    let backend = dir.path().join("backend");
    fs::create_dir_all(&backend).unwrap();
    fs::write(backend.join("go.mod"), "module backend\n\ngo 1.22\n").unwrap();
    fs::write(backend.join("main.go"), "package main\nfunc main() {}\n").unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert_eq!(services.len(), 1);
    assert_eq!(services[0].relative_path, "backend");
}

#[test]
fn test_case_t_same_name_different_paths_no_accidental_dedup() {
    let dir = tempdir().unwrap();
    // services/auth and tools/auth
    let svc_auth = dir.path().join("services").join("auth");
    let tools_auth = dir.path().join("tools").join("auth");
    fs::create_dir_all(&svc_auth).unwrap();
    fs::create_dir_all(&tools_auth).unwrap();

    fs::write(svc_auth.join("go.mod"), "module auth_svc\n").unwrap();
    fs::write(svc_auth.join("main.go"), "package main\nfunc main() {}\n").unwrap();

    fs::write(tools_auth.join("go.mod"), "module auth_tool\n").unwrap();
    fs::write(tools_auth.join("main.go"), "package main\nfunc main() {}\n").unwrap();

    let services = detect_services_in_project(&dir.path().to_string_lossy());
    assert_eq!(services.len(), 2);
    let paths: Vec<String> = services.into_iter().map(|s| s.relative_path).collect();
    assert!(paths.contains(&"services/auth".to_string()));
    assert!(paths.contains(&"tools/auth".to_string()));
}
