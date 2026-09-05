use runyard_lib::db::*;
use runyard_lib::models::*;
use runyard_lib::scanner::*;
use runyard_lib::script_detector::*;
use rusqlite::Connection;
use std::path::Path;
use std::time::Instant;

#[test]
#[ignore = "Local acceptance test requiring /home/gimesha user directory and repositories"]
fn test_real_platen_discovery_engine_acceptance() {
    let bak_db = Path::new("/home/gimesha/.local/share/runyard/runyard.db.bak");
    let src_db = if bak_db.exists() {
        bak_db
    } else {
        Path::new("/home/gimesha/.local/share/runyard/runyard.db")
    };
    assert!(src_db.exists(), "Real or backup user database must exist");

    let dir = tempfile::tempdir().unwrap();
    let test_db_path = dir.path().join("runyard_test.db");
    std::fs::copy(src_db, &test_db_path).unwrap();

    let mut conn = Connection::open(&test_db_path).unwrap();

    // 1. Before Migration v8 Stats for platen
    let platen_id: String = conn
        .query_row(
            "SELECT id FROM projects WHERE path = '/home/gimesha/My_Projects/platen'",
            [],
            |r| r.get(0),
        )
        .unwrap();

    let svcs_before_v8: i64 = conn
        .query_row(
            "SELECT count(*) FROM services WHERE project_id = ?",
            [&platen_id],
            |r| r.get(0),
        )
        .unwrap();

    let rcs_before_v8: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE project_id = ?",
            [&platen_id],
            |r| r.get(0),
        )
        .unwrap();

    println!("--- PLATEN BEFORE MIGRATION V8 ---");
    println!("Services count: {}", svcs_before_v8);
    println!("Run configs count: {}", rcs_before_v8);

    assert_eq!(svcs_before_v8, 41, "Legacy platen had 41 noisy services");
    assert_eq!(
        rcs_before_v8, 36,
        "Legacy platen had 36 noisy run configurations"
    );

    // 2. Run Migration v8
    let t0 = Instant::now();
    migrate(&mut conn).unwrap();
    let migration_duration = t0.elapsed();
    println!("Migration v8 duration: {:?}", migration_duration);

    let v: i32 = conn
        .query_row(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(v, 8, "Schema version must be 8");

    // 3. After Migration v8 Stats for platen
    let svcs_after_v8: i64 = conn
        .query_row(
            "SELECT count(*) FROM services WHERE project_id = ?",
            [&platen_id],
            |r| r.get(0),
        )
        .unwrap();

    let rcs_after_v8: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE project_id = ?",
            [&platen_id],
            |r| r.get(0),
        )
        .unwrap();

    println!("--- PLATEN AFTER MIGRATION V8 (Noise Pruning) ---");
    println!("Services count: {}", svcs_after_v8);
    println!("Run configs count: {}", rcs_after_v8);

    // Verify noisy items are pruned by migration
    let noise_svcs: i64 = conn
        .query_row(
            "SELECT count(*) FROM services WHERE project_id = ? AND (path LIKE '%scratch%' OR path LIKE '%test-corpus%')",
            [&platen_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        noise_svcs, 0,
        "All scratch and test-corpus services must be pruned"
    );

    let noise_rcs: i64 = conn
        .query_row(
            "SELECT count(*) FROM run_configurations WHERE project_id = ? AND (working_dir LIKE '%scratch%' OR working_dir LIKE '%test-corpus%')",
            [&platen_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        noise_rcs, 0,
        "All scratch and test-corpus run configs must be pruned"
    );

    // 4. Test Script Detection on real pdfnest-backend
    let backend_path = Path::new("/home/gimesha/My_Projects/platen/pdfnest-backend");
    assert!(
        backend_path.exists(),
        "pdfnest-backend directory must exist"
    );

    let t_script = Instant::now();
    let (detected_scripts, metrics) =
        detect_project_scripts_with_metrics(backend_path, "pdfnest-backend");
    let script_detection_duration = t_script.elapsed();

    println!("--- SCRIPT DETECTION ON pdfnest-backend ---");
    println!("Detection duration: {:?}", script_detection_duration);
    println!("Detected scripts count: {}", detected_scripts.len());
    println!("--- SCRIPT DETECTION METRICS ---");
    println!("  Candidates considered: {}", metrics.candidates_considered);
    println!("  Candidates opened: {}", metrics.candidates_opened);
    println!("  Bytes read: {}", metrics.bytes_read);
    println!("  Rejected by size: {}", metrics.rejected_by_size);
    println!("  Rejected by name: {}", metrics.rejected_by_name);
    println!("  Elapsed ms: {}", metrics.elapsed_ms);
    for s in &detected_scripts {
        println!("  Script: {} ({})", s.name, s.command);
        println!("  Kind: {:?}", s.script_kind);
        println!("  Confidence: {:?}", s.confidence);
        println!("  Execution Mode: {:?}", s.execution_mode);
        println!("  Is Trusted: {}", s.is_trusted);
        println!("  Evidence: {:?}", s.evidence);
    }

    let run_dev = detected_scripts
        .iter()
        .find(|s| s.name == "run_dev.sh")
        .expect("run_dev.sh must be detected in pdfnest-backend");

    assert_eq!(run_dev.script_kind, ScriptKind::DevelopmentServer);
    assert_eq!(run_dev.confidence, ScriptConfidence::High);
    assert_eq!(
        run_dev.execution_mode,
        ScriptExecutionMode::TerminalRequired,
        "run_dev.sh in pdfnest-backend has read -p and sudo so it must be TerminalRequired"
    );
    assert_eq!(run_dev.command, "./run_dev.sh");
    assert_eq!(run_dev.is_trusted, false, "Must be untrusted by default");
    assert!(run_dev
        .evidence
        .iter()
        .any(|e| e.contains("Air live-reload")));
    assert!(run_dev.evidence.iter().any(|e| e.contains("pg_isready")));

    // 5. Test Rescanning platen directory with High-Precision Qualified Services
    let t_scan = Instant::now();
    let cancel = std::sync::atomic::AtomicBool::new(false);

    let scanned_projects = scan_directory_streaming(
        "/home/gimesha/My_Projects/platen",
        &cancel,
        |_dirs, _projs, _svcs| {},
    )
    .unwrap();
    let scan_duration = t_scan.elapsed();

    println!("--- RESCAN PLATEN DIRECTORY ---");
    println!("Scan duration: {:?}", scan_duration);
    println!("Scanned projects count: {}", scanned_projects.len());

    let platen_scanned = scanned_projects
        .iter()
        .find(|p| p.path == "/home/gimesha/My_Projects/platen")
        .expect("platen project must be found in scan");

    println!(
        "Platen discovered services ({}):",
        platen_scanned.services.len()
    );
    for s in &platen_scanned.services {
        println!(
            "  Service: {} (rel_path: {}, type: {:?}, languages: {:?}, frameworks: {:?})",
            s.name, s.relative_path, s.service_type, s.languages, s.frameworks
        );
    }

    // Check that NO services are from scratch or test-corpus
    for s in &platen_scanned.services {
        assert!(
            !s.relative_path.contains("scratch"),
            "Service {} in scratch must NOT be discovered",
            s.relative_path
        );
        assert!(
            !s.relative_path.contains("test-corpus"),
            "Service {} in test-corpus must NOT be discovered",
            s.relative_path
        );
        assert!(
            !s.relative_path.contains("fixtures"),
            "Service {} in fixtures must NOT be discovered",
            s.relative_path
        );
    }

    // Genuine services expected: pdfnest, pdfnest-backend, pdfnest-worker
    let svc_names: Vec<&str> = platen_scanned
        .services
        .iter()
        .map(|s| s.name.as_str())
        .collect();
    assert!(
        svc_names.contains(&"pdfnest"),
        "pdfnest must be a qualified service"
    );
    assert!(
        svc_names.contains(&"pdfnest-backend"),
        "pdfnest-backend must be a qualified service"
    );
    assert!(
        svc_names.contains(&"pdfnest-worker"),
        "pdfnest-worker must be a qualified service"
    );
    assert_eq!(
        platen_scanned.services.len(),
        3,
        "Expected exactly 3 qualified services in platen, got: {:?}",
        svc_names
    );

    println!("--- ALL REAL PLATEN ACCEPTANCE CHECKS PASSED! ---");
}
