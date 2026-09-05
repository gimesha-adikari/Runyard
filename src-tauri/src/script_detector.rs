use crate::models::{ProjectScript, ScriptConfidence, ScriptExecutionMode, ScriptKind};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScriptDetectionMetrics {
    pub candidates_considered: usize,
    pub candidates_opened: usize,
    pub bytes_read: usize,
    pub rejected_by_size: usize,
    pub rejected_by_name: usize,
    pub elapsed_ms: f64,
}

pub const MAX_CANDIDATE_FILES_PER_PROJECT: usize = 16;
pub const MAX_BYTES_READ_PER_FILE: usize = 32 * 1024; // 32 KiB
pub const MAX_TOTAL_BYTES_PER_PROJECT: usize = 256 * 1024; // 256 KiB

const CANDIDATE_PREFIXES: &[&str] = &["run", "start", "dev", "serve", "up", "launch"];
const CANDIDATE_EXTENSIONS: &[&str] = &[".sh", ".bash", ".py", ".js", ".ts", ".mjs", ".cjs"];

const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "out",
    ".venv",
    "venv",
    "vendor",
    ".next",
    ".turbo",
    "coverage",
    "scratch",
    "test-corpus",
    "fixtures",
    "benchmarks",
    "tests",
    "test",
    "docs",
    "samples",
    "examples",
    "generated",
];

const EXCLUDED_NAME_SUBSTRINGS: &[&str] = &[
    "test",
    "bench",
    "clean",
    "migrate",
    "migration",
    "seed",
    "lint",
    "format",
    "build",
    "install",
    "release",
    "deploy",
    "package",
    "audit",
    "eval",
    "parity",
    "profile",
    "soak",
    "setup",
];

/// Collect candidate script files in project root and standard subdirectories.
pub fn find_script_candidates(project_path: &Path) -> Vec<PathBuf> {
    let mut dummy = ScriptDetectionMetrics::default();
    find_script_candidates_with_metrics(project_path, &mut dummy)
}

/// Collect candidate script files while tracking detection diagnostic metrics.
pub fn find_script_candidates_with_metrics(
    project_path: &Path,
    metrics: &mut ScriptDetectionMetrics,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // 1. Root directory candidates (narrow launcher-filename or executable gate)
    if let Ok(entries) = std::fs::read_dir(project_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                metrics.candidates_considered += 1;
                if let Ok(meta) = path.metadata() {
                    if meta.len() > MAX_BYTES_READ_PER_FILE as u64 {
                        metrics.rejected_by_size += 1;
                        continue;
                    }
                }
                if is_candidate_file(project_path, &path, true) {
                    candidates.push(path);
                    if candidates.len() >= MAX_CANDIDATE_FILES_PER_PROJECT {
                        return candidates;
                    }
                } else {
                    metrics.rejected_by_name += 1;
                }
            }
        }
    }

    // 2. Standard script subdirectories (shallow: depth 1 inside script dir)
    for sub in &["scripts", "bin", "dev", "tools"] {
        let sub_dir = project_path.join(sub);
        if sub_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&sub_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        metrics.candidates_considered += 1;
                        if let Ok(meta) = path.metadata() {
                            if meta.len() > MAX_BYTES_READ_PER_FILE as u64 {
                                metrics.rejected_by_size += 1;
                                continue;
                            }
                        }
                        if is_candidate_file(project_path, &path, false) {
                            candidates.push(path);
                            if candidates.len() >= MAX_CANDIDATE_FILES_PER_PROJECT {
                                return candidates;
                            }
                        } else {
                            metrics.rejected_by_name += 1;
                        }
                    }
                }
            }
        }
    }

    candidates
}

fn is_candidate_file(project_root: &Path, path: &Path, is_root: bool) -> bool {
    let file_name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    let lower_name = file_name.to_lowercase();

    // Check directory exclusions only on components relative to project_root
    if let Ok(rel) = path.strip_prefix(project_root) {
        for comp in rel.components() {
            if let std::path::Component::Normal(c) = comp {
                let c_str = c.to_string_lossy().to_lowercase();
                if EXCLUDED_DIRS.contains(&c_str.as_str()) {
                    return false;
                }
            }
        }
    }

    // Check name exclusions
    for &exc in EXCLUDED_NAME_SUBSTRINGS {
        if lower_name.contains(exc) {
            return false;
        }
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_default();

    let base = match path.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s.to_lowercase(),
        None => return false,
    };

    let matches_prefix = CANDIDATE_PREFIXES
        .iter()
        .any(|&prefix| base.starts_with(prefix));

    if is_root {
        // Project root requires explicit launcher name or prefix
        if CANDIDATE_EXTENSIONS.contains(&ext.as_str()) {
            return matches_prefix || base == "run" || base == "dev" || base == "start";
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if ext.is_empty() {
                if let Ok(metadata) = path.metadata() {
                    let is_exec = metadata.permissions().mode() & 0o111 != 0;
                    if is_exec
                        && (matches_prefix || base == "run" || base == "dev" || base == "start")
                    {
                        return true;
                    }
                }
            }
        }
        false
    } else {
        // Dedicated scripts/bin/dev/tools subdirectories allow broader script extensions
        if CANDIDATE_EXTENSIONS.contains(&ext.as_str()) {
            return true;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = path.metadata() {
                return metadata.permissions().mode() & 0o111 != 0;
            }
        }
        false
    }
}

/// Read at most `max_bytes` from file gracefully. Never crashes on unreadable or malformed files.
pub fn read_bounded_string(path: &Path, max_bytes: usize) -> (String, usize) {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return (String::new(), 0),
    };

    let mut buf = Vec::new();
    let read_result = file.by_ref().take(max_bytes as u64).read_to_end(&mut buf);
    let bytes_read = match read_result {
        Ok(n) => n,
        Err(_) => return (String::new(), 0),
    };

    (String::from_utf8_lossy(&buf).to_string(), bytes_read)
}

/// Detect custom startup scripts for a given project directory while capturing metrics.
pub fn detect_project_scripts_with_metrics(
    project_path: &Path,
    project_id: &str,
) -> (Vec<ProjectScript>, ScriptDetectionMetrics) {
    let start = std::time::Instant::now();
    let mut metrics = ScriptDetectionMetrics::default();

    let candidates = find_script_candidates_with_metrics(project_path, &mut metrics);
    let mut scripts = Vec::new();
    let mut total_bytes_read = 0;

    for candidate in candidates {
        if total_bytes_read >= MAX_TOTAL_BYTES_PER_PROJECT {
            break;
        }

        let (content, bytes_read) = read_bounded_string(&candidate, MAX_BYTES_READ_PER_FILE);
        metrics.candidates_opened += 1;
        metrics.bytes_read += bytes_read;
        total_bytes_read += bytes_read;

        if let Some(script) = evaluate_script(project_path, &candidate, &content, project_id) {
            scripts.push(script);
        }
    }

    metrics.elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
    (scripts, metrics)
}

/// Detect custom startup scripts for a given project directory.
pub fn detect_project_scripts(project_path: &Path, project_id: &str) -> Vec<ProjectScript> {
    detect_project_scripts_with_metrics(project_path, project_id).0
}

/// Evaluate a single candidate script and return a `ProjectScript` if confidence is sufficient.
pub fn evaluate_script(
    project_path: &Path,
    candidate_path: &Path,
    content: &str,
    project_id: &str,
) -> Option<ProjectScript> {
    let file_name = candidate_path.file_name()?.to_str()?.to_string();
    let rel_path = candidate_path
        .strip_prefix(project_path)
        .unwrap_or(candidate_path)
        .to_string_lossy()
        .to_string();

    let mut score: i32 = 0;
    let mut evidence = Vec::new();

    let lower_content = content.to_lowercase();
    let lower_name = file_name.to_lowercase();

    // 1. Shebang & Header
    let first_line = content.lines().next().unwrap_or("");
    if first_line.starts_with("#!") {
        if first_line.contains("bash") || first_line.contains("sh") {
            score += 10;
            evidence.push(format!("Shell shebang: {}", first_line.trim()));
        } else if first_line.contains("python") {
            score += 10;
            evidence.push(format!("Python shebang: {}", first_line.trim()));
        } else if first_line.contains("node") {
            score += 10;
            evidence.push(format!("Node shebang: {}", first_line.trim()));
        }
    }

    // 2. Filename Signal
    if lower_name.starts_with("run_dev") || lower_name.starts_with("dev") {
        score += 20;
        evidence.push(format!("Development launcher filename: {}", file_name));
    } else if lower_name.starts_with("run")
        || lower_name.starts_with("start")
        || lower_name.starts_with("serve")
    {
        score += 15;
        evidence.push(format!("Startup candidate filename: {}", file_name));
    }

    // 3. Environment & Port Configuration
    let has_env = lower_content.contains(".env")
        || lower_content.contains("source .env")
        || lower_content.contains("set -a")
        || lower_content.contains("process.env")
        || lower_content.contains("os.getenv")
        || lower_content.contains("os.environ");
    if has_env {
        score += 15;
        evidence.push("Environment configuration loading".to_string());
    }

    let has_port = lower_content.contains("port=")
        || lower_content.contains("port:-")
        || lower_content.contains("env_port")
        || lower_content.contains("process.env.port")
        || lower_content.contains("port")
        || lower_content.contains("--port");
    if has_port {
        score += 10;
        evidence.push("Port configuration management".to_string());
    }

    // 4. Dependency Readiness & Service Checks
    if lower_content.contains("pg_isready") {
        score += 20;
        evidence.push("PostgreSQL readiness verification (pg_isready)".to_string());
    }
    if lower_content.contains("docker compose") || lower_content.contains("docker-compose") {
        score += 15;
        evidence.push("Docker Compose dependency orchestration".to_string());
    }
    if lower_content.contains("stop_port_listener")
        || lower_content.contains("lsof")
        || lower_content.contains("nc -z")
    {
        score += 10;
        evidence.push("Port conflict / listener management".to_string());
    }

    // 5. Development Runner / Server Listeners
    let has_air = lower_content.contains("exec air")
        || lower_content.contains(" air")
        || lower_content.lines().any(|l| l.trim() == "air");
    if has_air {
        score += 35;
        evidence.push("Air live-reload server runner".to_string());
    }
    if lower_content.contains("nodemon") {
        score += 35;
        evidence.push("Nodemon live-reload monitor".to_string());
    }
    if lower_content.contains("vite") || lower_content.contains("next dev") {
        score += 35;
        evidence.push("Frontend development server".to_string());
    }
    if lower_content.contains("uvicorn") {
        score += 35;
        evidence.push("Uvicorn ASGI application server".to_string());
    }
    if lower_content.contains("gunicorn") {
        score += 30;
        evidence.push("Gunicorn WSGI application server".to_string());
    }
    if lower_content.contains(".listen(")
        || lower_content.contains("createserver")
        || lower_content.contains("app.run(")
    {
        score += 25;
        evidence.push("Server socket listener (.listen/createServer)".to_string());
    }

    // 6. Process Execution / Handoff
    if lower_content.contains("exec ") {
        score += 15;
        evidence.push("Process replacement via exec".to_string());
    }

    // 7. Negative Penalties (Tests, Benchmarks, Migrations, Cleaners)
    if lower_content.contains("pytest")
        || lower_content.contains("go test")
        || lower_content.contains("cargo test")
        || lower_content.contains("npm test")
    {
        score -= 50;
        evidence.push("Penalty: Test runner detected".to_string());
    }
    if lower_content.contains("benchmark") || lower_content.contains("benchmarks") {
        score -= 50;
        evidence.push("Penalty: Benchmark suite detected".to_string());
    }
    if lower_content.contains("migrate up")
        || lower_content.contains("migrate down")
        || lower_content.contains("db:migrate")
    {
        score -= 40;
        evidence.push("Penalty: Database migration task".to_string());
    }
    if lower_content.contains("rm -rf") && !has_air && !has_env {
        score -= 30;
        evidence.push("Penalty: File deletion/cleanup script".to_string());
    }

    // Classification
    let confidence = if score >= 70 {
        ScriptConfidence::High
    } else if score >= 40 {
        ScriptConfidence::Medium
    } else {
        return None;
    };

    let (execution_mode, interactive_evidence) = detect_interactive_signals(content);
    evidence.extend(interactive_evidence);

    let is_dev_server = has_air
        || lower_content.contains("nodemon")
        || lower_content.contains("vite")
        || lower_content.contains("next dev")
        || lower_content.contains("reload=true")
        || lower_content.contains("--reload")
        || (lower_content.contains("reload") && lower_content.contains("uvicorn"))
        || lower_name.contains("dev");

    let script_kind = if is_dev_server {
        ScriptKind::DevelopmentServer
    } else if lower_content.contains("docker compose") || lower_content.contains("docker-compose") {
        ScriptKind::MultiServiceLauncher
    } else if lower_content.contains("migrate") || lower_content.contains("seed") {
        ScriptKind::InfrastructureTask
    } else {
        ScriptKind::ApplicationStart
    };

    // Formulate clean executable command
    let command = if file_name.ends_with(".py") {
        if rel_path.starts_with("./") || rel_path.starts_with('/') {
            format!("python3 {}", rel_path)
        } else {
            format!("python3 ./{}", rel_path)
        }
    } else if file_name.ends_with(".js") || file_name.ends_with(".ts") {
        if rel_path.starts_with("./") || rel_path.starts_with('/') {
            format!("node {}", rel_path)
        } else {
            format!("node ./{}", rel_path)
        }
    } else {
        if rel_path.starts_with("./") || rel_path.starts_with('/') {
            rel_path.clone()
        } else {
            format!("./{}", rel_path)
        }
    };

    let stable_id = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_DNS,
        format!("runyard:script:{}:{}", project_id, rel_path).as_bytes(),
    )
    .to_string();

    Some(ProjectScript {
        id: stable_id,
        project_id: project_id.to_string(),
        name: file_name,
        relative_path: rel_path,
        command,
        script_kind,
        confidence,
        execution_mode,
        evidence,
        is_trusted: false,
        trusted_fingerprint: None,
    })
}

pub fn detect_interactive_signals(content: &str) -> (ScriptExecutionMode, Vec<String>) {
    let mut interactive_evidence = Vec::new();

    let mut has_read_prompt = false;
    let mut has_select = false;
    let mut has_stty = false;
    let mut has_dev_tty = false;
    let mut has_prompting_sudo = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') {
            continue;
        }

        // 1. Shell read prompt (e.g. read -p, read -r -p, read -s, or interactive read without pipe/redirect)
        if (trimmed.contains("read ") || trimmed.contains("read\t"))
            && (trimmed.contains("-p")
                || trimmed.contains("-s")
                || trimmed.contains("-n")
                || (!trimmed.starts_with("while ")
                    && !trimmed.contains('|')
                    && !trimmed.contains('<')))
        {
            has_read_prompt = true;
        }

        // 2. Select statement
        if trimmed.starts_with("select ") || trimmed.contains(" select ") {
            has_select = true;
        }

        // 3. stty invocation
        if trimmed.starts_with("stty ") || trimmed.contains(" stty ") {
            has_stty = true;
        }

        // 4. /dev/tty access
        if trimmed.contains("/dev/tty") {
            has_dev_tty = true;
        }

        // 5. Sudo invocation (exclude sudo -n which proves non-interactive behavior)
        if trimmed.contains("sudo ") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            for (idx, &part) in parts.iter().enumerate() {
                if part == "sudo" {
                    let next = parts.get(idx + 1).copied().unwrap_or("");
                    if next != "-n" && next != "--non-interactive" {
                        has_prompting_sudo = true;
                        break;
                    }
                }
            }
        }
    }

    if has_read_prompt {
        interactive_evidence.push("Interactive input: shell read prompt (read -p)".to_string());
    }
    if has_prompting_sudo {
        interactive_evidence.push(
            "Interactive authentication: sudo invocation may require password prompt".to_string(),
        );
    }
    if has_select {
        interactive_evidence.push("Interactive menu: select statement".to_string());
    }
    if has_stty {
        interactive_evidence.push("Terminal control: stty invocation".to_string());
    }
    if has_dev_tty {
        interactive_evidence.push("Direct TTY device access (/dev/tty)".to_string());
    }

    let mode = if !interactive_evidence.is_empty() {
        ScriptExecutionMode::TerminalRequired
    } else {
        ScriptExecutionMode::Background
    };

    (mode, interactive_evidence)
}
