use runyard_lib::models::{ScriptConfidence, ScriptKind};
use runyard_lib::script_detector::{
    detect_project_scripts, evaluate_script, read_bounded_string, MAX_BYTES_READ_PER_FILE,
};
use std::fs::{self, File};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use tempfile::tempdir;

#[test]
fn test_case_a_strong_bash_dev_launcher() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("run_dev.sh");
    let content = r#"#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ -f ".env" ]; then
    source .env
fi
PORT="${PORT:-8080}"

pg_isready -h localhost -p 5432
stop_port_listener "$PORT"

exec air
"#;
    fs::write(&script_path, content).unwrap();

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert_eq!(detected.len(), 1, "Must detect exactly one script");
    let s = &detected[0];
    assert_eq!(s.name, "run_dev.sh");
    assert_eq!(s.command, "./run_dev.sh");
    assert_eq!(s.confidence, ScriptConfidence::High);
    assert_eq!(s.script_kind, ScriptKind::DevelopmentServer);
    assert!(s.evidence.iter().any(|e| e.contains("Air live-reload")));
    assert!(s
        .evidence
        .iter()
        .any(|e| e.contains("PostgreSQL readiness")));
}

#[test]
fn test_case_b_cleanup_script_excluded() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("cleanup.sh");
    let content = r#"#!/usr/bin/env bash
rm -rf tmp/*
rm -rf .cache/*
echo "Cleanup done"
"#;
    fs::write(&script_path, content).unwrap();

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert!(
        detected.is_empty(),
        "cleanup.sh must not be detected as startup script"
    );
}

#[test]
fn test_case_c_migrate_script_excluded() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("migrate.sh");
    let content = r#"#!/usr/bin/env bash
if [ -f ".env" ]; then source .env; fi
migrate up
"#;
    fs::write(&script_path, content).unwrap();

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert!(
        detected.is_empty(),
        "migrate.sh must not be detected as startup script"
    );
}

#[test]
fn test_case_d_benchmark_script_excluded() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("run_benchmark.sh");
    let content = r#"#!/usr/bin/env bash
echo "Running performance benchmarks..."
pytest --benchmark
"#;
    fs::write(&script_path, content).unwrap();

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert!(
        detected.is_empty(),
        "benchmark script must not be detected as startup script"
    );
}

#[test]
fn test_case_e_start_server_py_detected() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("start_server.py");
    let content = r#"#!/usr/bin/env python3
import os
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
"#;
    fs::write(&script_path, content).unwrap();

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert_eq!(detected.len(), 1);
    let s = &detected[0];
    assert_eq!(s.name, "start_server.py");
    assert!(s.command.starts_with("python3"));
    assert_eq!(s.confidence, ScriptConfidence::High);
    assert_eq!(s.script_kind, ScriptKind::DevelopmentServer);
    assert!(s.evidence.iter().any(|e| e.contains("Uvicorn")));
}

#[test]
fn test_case_f_utility_python_file_excluded() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("utils.py");
    let content = r#"def calculate_hash(data):
    return hash(data)
"#;
    fs::write(&script_path, content).unwrap();

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert!(
        detected.is_empty(),
        "utils.py must not be considered a candidate startup script"
    );
}

#[test]
fn test_case_g_dev_js_detected() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("dev.js");
    let content = r#"const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Dev server on ${port}`));
"#;
    fs::write(&script_path, content).unwrap();

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert_eq!(detected.len(), 1);
    let s = &detected[0];
    assert_eq!(s.name, "dev.js");
    assert!(s.command.starts_with("node"));
    assert_eq!(s.script_kind, ScriptKind::DevelopmentServer);
}

#[test]
fn test_case_h_build_sh_compilation_only_excluded() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("build.sh");
    let content = r#"#!/usr/bin/env bash
go build -o ./bin/app .
echo "Build complete"
"#;
    fs::write(&script_path, content).unwrap();

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert!(
        detected.is_empty(),
        "build.sh must not be detected as startup script"
    );
}

#[test]
fn test_case_i_neutral_executable_with_strong_launch_behavior() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("launch");
    let content = r#"#!/usr/bin/env bash
source .env
PORT="${PORT:-9000}"
pg_isready -h localhost
exec air
"#;
    fs::write(&script_path, content).unwrap();

    #[cfg(unix)]
    {
        let mut perms = fs::metadata(&script_path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&script_path, perms).unwrap();
    }

    let detected = detect_project_scripts(dir.path(), "test-proj");
    assert_eq!(detected.len(), 1);
    let s = &detected[0];
    assert_eq!(s.name, "launch");
    assert_eq!(s.confidence, ScriptConfidence::High);
}

#[test]
fn test_case_j_huge_candidate_file_bounded_read() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("run_dev.sh");

    // Write a huge file: header with valid script followed by 500 KiB of padding
    let mut f = File::create(&script_path).unwrap();
    writeln!(f, "#!/usr/bin/env bash").unwrap();
    writeln!(f, "source .env").unwrap();
    writeln!(f, "PORT=8080").unwrap();
    writeln!(f, "exec air").unwrap();
    let padding = vec![b'#'; 500 * 1024];
    f.write_all(&padding).unwrap();
    drop(f);

    let (content, bytes_read) = read_bounded_string(&script_path, MAX_BYTES_READ_PER_FILE);
    assert_eq!(
        bytes_read, MAX_BYTES_READ_PER_FILE,
        "Must be bounded to MAX_BYTES_READ_PER_FILE (32 KiB)"
    );
    assert_eq!(content.len(), MAX_BYTES_READ_PER_FILE);

    // Verify evaluation succeeds without reading the 500 KiB
    let detected = evaluate_script(dir.path(), &script_path, &content, "test-proj");
    assert!(detected.is_some());
    assert_eq!(detected.unwrap().confidence, ScriptConfidence::High);
}

#[test]
fn test_case_k_malformed_unreadable_file_no_crash() {
    let dir = tempdir().unwrap();
    let script_path = dir.path().join("run_dev.sh");
    // Write arbitrary binary garbage
    let garbage = vec![0xFF, 0xFE, 0x00, 0x12, 0x88, 0x99, 0xAA, 0xBB];
    fs::write(&script_path, garbage).unwrap();

    let (content, bytes_read) = read_bounded_string(&script_path, MAX_BYTES_READ_PER_FILE);
    assert_eq!(bytes_read, 8);
    // Lossy conversion produces replacement characters without panic
    let detected = evaluate_script(dir.path(), &script_path, &content, "test-proj");
    // Should safely return None (or Low confidence), definitely not panic
    assert!(detected.is_none());
}
