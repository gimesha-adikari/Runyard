use crate::error::Result;
use crate::models::{ScannedProject, ScannedService};
use walkdir::{DirEntry, WalkDir};

const SKIPPED_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "build", "dist", "__pycache__", ".venv", "venv", "vendor",
    ".gradle", ".idea", ".vscode", ".cache", ".npm", ".yarn",
];

const PROJECT_FILES: &[&str] = &[
    ".git", "package.json", "Cargo.toml", "go.mod", "pyproject.toml", "requirements.txt",
    "pom.xml", "build.gradle", "docker-compose.yml", "compose.yml", "Makefile",
];

fn is_hidden(entry: &DirEntry) -> bool {
    entry.file_name().to_str().map(|s| s.starts_with('.') && s != ".git").unwrap_or(false)
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
    let p = std::path::Path::new(project_path);
    let mut services = Vec::new();

    let walker = WalkDir::new(project_path)
        .max_depth(3)
        .min_depth(1)
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

        if has_service_signal {
            let relative = sub_path.strip_prefix(p).unwrap_or(sub_path);
            let rel_str = relative.to_string_lossy().to_string();
            let name = sub_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| rel_str.clone());
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
    let mut projects = Vec::new();
    let walker = WalkDir::new(root)
        .max_depth(5)
        .into_iter()
        .filter_entry(|e| !should_skip(e));

    let mut skip_subdirs_of: Option<String> = None;

    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();

        if let Some(ref skip_root) = skip_subdirs_of {
            if path_str.starts_with(skip_root) && path_str != *skip_root {
                continue;
            } else {
                skip_subdirs_of = None;
            }
        }

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

        // Check for .sln or .csproj
        if let Ok(entries) = std::fs::read_dir(path) {
            for e in entries.flatten() {
                if let Some(ext) = e.path().extension().and_then(|s| s.to_str()) {
                    if ext == "sln" || ext == "csproj" {
                        signals.push(e.file_name().to_string_lossy().to_string());
                    }
                }
            }
        }

        if !signals.is_empty() {
            let services = detect_services_in_project(&path_str);
            projects.push(ScannedProject {
                path: path_str.clone(),
                signals,
                has_git,
                services,
            });
            skip_subdirs_of = Some(path_str);
        }
    }

    Ok(projects)
}
