use crate::error::Result;
use crate::models::{ScannedProject, ScannedService};
use std::path::Path;
use walkdir::{DirEntry, WalkDir};

const SKIPPED_DIRS: &[&str] = &[
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
    ".pytest_cache",
    ".mypy_cache",
    ".tox",
    "Pods",
    "Carthage",
];

const PROJECT_FILES: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
    "Makefile",
];

pub const NOISE_DIRS: &[&str] = &[
    "scratch",
    "test-corpus",
    "fixtures",
    "benchmarks",
    "samples",
    "examples",
    "sample",
    "example",
    "generated",
];

/// Returns true if any component in `path` matches an exact noise directory name.
pub fn is_noise_path<P: AsRef<Path>>(path: P) -> bool {
    let p = path.as_ref();
    for comp in p.components() {
        if let std::path::Component::Normal(c) = comp {
            let s = c.to_string_lossy();
            let lower = s.to_lowercase();
            if NOISE_DIRS.iter().any(|&d| d.eq_ignore_ascii_case(&lower)) {
                return true;
            }
        }
    }
    false
}

fn is_hidden(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| s.starts_with('.') && s != ".git")
        .unwrap_or(false)
}

fn should_skip(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }
    if entry.file_type().is_dir() {
        let name = entry.file_name().to_string_lossy();
        if SKIPPED_DIRS.contains(&name.as_ref()) {
            return true;
        }
    }
    is_hidden(entry)
}

fn should_skip_service(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }
    if entry.file_type().is_dir() {
        let name = entry.file_name().to_string_lossy();
        if SKIPPED_DIRS.contains(&name.as_ref()) || NOISE_DIRS.contains(&name.as_ref()) {
            return true;
        }
    }
    is_hidden(entry)
}

pub fn detect_services_in_project(project_path: &str) -> Vec<ScannedService> {
    let p = Path::new(project_path);
    let mut services = Vec::new();
    let mut service_paths: Vec<std::path::PathBuf> = Vec::new();

    let mut entries: Vec<_> = WalkDir::new(project_path)
        .max_depth(2)
        .min_depth(1)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !should_skip_service(e))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir() && e.path() != p)
        .collect();

    // Sort by depth so parent directories are processed before child directories
    entries.sort_by_key(|e| e.depth());

    for entry in entries {
        let sub_path = entry.path();

        // If sub_path is inside an already-discovered service directory, do not descend into internal packages
        if service_paths.iter().any(|sp| sub_path.starts_with(sp)) {
            continue;
        }

        let relative = match sub_path.strip_prefix(p) {
            Ok(r) => r,
            Err(_) => sub_path,
        };

        if is_noise_path(relative) {
            continue;
        }

        // Validate runtime / service qualification
        let mut is_valid_service = false;

        // 1. Docker Compose indicates a standalone service container
        if sub_path.join("docker-compose.yml").exists()
            || sub_path.join("docker-compose.yaml").exists()
            || sub_path.join("compose.yml").exists()
            || sub_path.join("compose.yaml").exists()
        {
            is_valid_service = true;
        }

        // 2. Validated Custom Startup Script: must have High confidence and represent a long-lived runtime
        if !is_valid_service {
            let scripts = crate::script_detector::detect_project_scripts(sub_path, "");
            let has_high_confidence_runtime_script = scripts.iter().any(|s| {
                s.confidence == crate::models::ScriptConfidence::High
                    && matches!(
                        s.script_kind,
                        crate::models::ScriptKind::DevelopmentServer
                            | crate::models::ScriptKind::ApplicationStart
                            | crate::models::ScriptKind::MultiServiceLauncher
                    )
            });
            if has_high_confidence_runtime_script {
                is_valid_service = true;
            }
        }

        // 3. Node.js package.json: only services with "dev", "start", or "serve" scripts
        if !is_valid_service && sub_path.join("package.json").exists() {
            if let Ok(content) = std::fs::read_to_string(sub_path.join("package.json")) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(scripts) = val.get("scripts").and_then(|s| s.as_object()) {
                        if scripts.contains_key("dev")
                            || scripts.contains_key("start")
                            || scripts.contains_key("serve")
                        {
                            is_valid_service = true;
                        }
                    }
                }
            }
        }

        // 4. Go: only if main.go or cmd/ exists
        if !is_valid_service && sub_path.join("go.mod").exists() {
            if sub_path.join("main.go").exists() {
                is_valid_service = true;
            } else if sub_path.join("cmd").is_dir() {
                if let Ok(mut cmd_entries) = std::fs::read_dir(sub_path.join("cmd")) {
                    if cmd_entries.any(|e| e.map(|entry| entry.path().is_dir()).unwrap_or(false)) {
                        is_valid_service = true;
                    }
                }
            }
        }

        // 5. Rust: only if src/main.rs exists (not a pure library with only src/lib.rs)
        if !is_valid_service && sub_path.join("Cargo.toml").exists() {
            if sub_path.join("src").join("main.rs").exists() {
                is_valid_service = true;
            } else if let Ok(content) = std::fs::read_to_string(sub_path.join("Cargo.toml")) {
                if content.contains("[[bin]]") {
                    is_valid_service = true;
                }
            }
        }

        // 6. Python: only if manage.py, app.py, or main.py exists
        if !is_valid_service {
            if sub_path.join("manage.py").exists()
                || sub_path.join("app.py").exists()
                || sub_path.join("main.py").exists()
            {
                is_valid_service = true;
            }
        }

        // 7. Java: pom.xml or build.gradle
        if !is_valid_service {
            if sub_path.join("pom.xml").exists()
                || sub_path.join("build.gradle").exists()
                || sub_path.join("build.gradle.kts").exists()
            {
                is_valid_service = true;
            }
        }

        // 8. .NET: .sln / .csproj / .fsproj
        if !is_valid_service {
            if let Ok(entries) = std::fs::read_dir(sub_path) {
                for e in entries.flatten() {
                    if let Some(ext) = e.path().extension().and_then(|s| s.to_str()) {
                        if ext == "sln" || ext == "csproj" || ext == "fsproj" {
                            is_valid_service = true;
                            break;
                        }
                    }
                }
            }
        }

        if is_valid_service {
            service_paths.push(sub_path.to_path_buf());
            let rel_str = relative.to_string_lossy().to_string();
            let name = sub_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| rel_str.clone());
            let det = crate::detector::detect_project_type(&sub_path.to_string_lossy());

            services.push(ScannedService {
                name,
                relative_path: rel_str,
                service_type: det.project_type,
                languages: det.languages,
                frameworks: det.frameworks,
            });
        }
    }

    services
}

pub fn scan_directory_streaming<F>(
    root: &str,
    cancellation_token: &std::sync::atomic::AtomicBool,
    mut on_progress: F,
) -> Result<Vec<ScannedProject>>
where
    F: FnMut(usize, usize, usize), // (directories_inspected, projects_found, services_found)
{
    let root_path = Path::new(root);
    if !root_path.exists() || !root_path.is_dir() {
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();
    let mut dirs_inspected = 0;
    let mut total_services = 0;

    let mut it = WalkDir::new(root)
        .max_depth(5)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !should_skip(e));

    while let Some(Ok(entry)) = it.next() {
        if cancellation_token.load(std::sync::atomic::Ordering::Relaxed) {
            break;
        }

        if !entry.file_type().is_dir() {
            continue;
        }

        dirs_inspected += 1;

        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();

        let has_git = path.join(".git").exists();

        let mut has_project_signal = false;
        let mut signals = Vec::new();
        if has_git {
            signals.push(".git".to_string());
        }
        for &file in PROJECT_FILES {
            if path.join(file).exists() {
                signals.push(file.to_string());
                has_project_signal = true;
            }
        }
        if !has_project_signal {
            if let Ok(entries) = std::fs::read_dir(path) {
                for e in entries.flatten() {
                    if let Some(ext) = e.path().extension().and_then(|s| s.to_str()) {
                        if ext == "sln" || ext == "csproj" || ext == "fsproj" {
                            signals.push(e.file_name().to_string_lossy().to_string());
                            has_project_signal = true;
                        }
                    }
                }
            }
        }

        // A directory is a project root if it has `.git` OR (it has a project signal AND is not inside another project).
        if has_git || has_project_signal {
            let services = detect_services_in_project(&path_str);
            total_services += services.len();
            projects.push(ScannedProject {
                path: path_str,
                signals,
                has_git,
                services,
            });
        }

        on_progress(dirs_inspected, projects.len(), total_services);
    }

    Ok(projects)
}

pub fn scan_directory(root: &str) -> Result<Vec<ScannedProject>> {
    let dummy_token = std::sync::atomic::AtomicBool::new(false);
    scan_directory_streaming(root, &dummy_token, |_, _, _| {})
}
