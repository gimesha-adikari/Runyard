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
    ".git",
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

pub fn detect_services_in_project(project_path: &str) -> Vec<ScannedService> {
    let p = Path::new(project_path);
    let mut services = Vec::new();

    let walker = WalkDir::new(project_path)
        .max_depth(3)
        .min_depth(1)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !should_skip(e));

    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_dir() {
            continue;
        }
        let sub_path = entry.path();
        if sub_path == p {
            continue;
        }

        let mut has_service_signal = false;
        for &file in PROJECT_FILES {
            if file != ".git" && sub_path.join(file).exists() {
                has_service_signal = true;
                break;
            }
        }

        if !has_service_signal {
            if let Ok(entries) = std::fs::read_dir(sub_path) {
                for e in entries.flatten() {
                    if let Some(ext) = e.path().extension().and_then(|s| s.to_str()) {
                        if ext == "sln" || ext == "csproj" || ext == "fsproj" {
                            has_service_signal = true;
                            break;
                        }
                    }
                }
            }
        }

        if has_service_signal {
            let relative = sub_path.strip_prefix(p).unwrap_or(sub_path);
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

pub fn scan_directory(root: &str) -> Result<Vec<ScannedProject>> {
    let root_path = Path::new(root);
    if !root_path.exists() || !root_path.is_dir() {
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();
    let walker = WalkDir::new(root)
        .max_depth(5)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !should_skip(e));

    let mut skip_subdirs_of: Option<std::path::PathBuf> = None;

    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();

        if let Some(ref skip_root) = skip_subdirs_of {
            if path.starts_with(skip_root) && path != skip_root.as_path() {
                continue;
            } else {
                skip_subdirs_of = None;
            }
        }

        let path_str = path.to_string_lossy().to_string();
        let mut signals = Vec::new();
        let mut has_git = false;

        for &file in PROJECT_FILES {
            if path.join(file).exists() {
                signals.push(file.to_string());
                if file == ".git" {
                    has_git = true;
                }
            }
        }

        if let Ok(entries) = std::fs::read_dir(path) {
            for e in entries.flatten() {
                if let Some(ext) = e.path().extension().and_then(|s| s.to_str()) {
                    if ext == "sln" || ext == "csproj" || ext == "fsproj" {
                        signals.push(e.file_name().to_string_lossy().to_string());
                    }
                }
            }
        }

        if !signals.is_empty() {
            let services = detect_services_in_project(&path_str);
            projects.push(ScannedProject {
                path: path_str,
                signals,
                has_git,
                services,
            });
            skip_subdirs_of = Some(path.to_path_buf());
        }
    }

    Ok(projects)
}
