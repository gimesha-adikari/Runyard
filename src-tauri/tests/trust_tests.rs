use runyard_lib::models::{RunConfigSource, RunConfiguration};
use std::collections::HashMap;
use tempfile::tempdir;

#[test]
fn test_execution_fingerprint_generation_and_stability() {
    let mut env_vars = HashMap::new();
    env_vars.insert("PORT".to_string(), "3000".to_string());
    env_vars.insert("NODE_ENV".to_string(), "development".to_string());

    let config = RunConfiguration {
        id: "cfg-1".to_string(),
        project_id: "proj-1".to_string(),
        service_id: None,
        name: "Dev Server".to_string(),
        command: "npm".to_string(),
        args: vec!["run".to_string(), "dev".to_string()],
        working_dir: Some("/tmp/project".to_string()),
        env_file: Some(".env.local".to_string()),
        env_vars: env_vars.clone(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::Detected,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };

    let fp1 = config.compute_fingerprint();
    let fp2 = config.compute_fingerprint();
    assert_eq!(fp1, fp2);
    assert!(!fp1.is_empty());

    // Check env vars ordering stability
    let mut env_vars_reversed = HashMap::new();
    env_vars_reversed.insert("NODE_ENV".to_string(), "development".to_string());
    env_vars_reversed.insert("PORT".to_string(), "3000".to_string());

    let mut config_reversed = config.clone();
    config_reversed.env_vars = env_vars_reversed;
    assert_eq!(
        config.compute_fingerprint(),
        config_reversed.compute_fingerprint()
    );
}

#[test]
fn test_trust_invalidation_on_semantic_changes() {
    let config = RunConfiguration {
        id: "cfg-1".to_string(),
        project_id: "proj-1".to_string(),
        service_id: None,
        name: "Dev".to_string(),
        command: "npm".to_string(),
        args: vec!["run".to_string(), "dev".to_string()],
        working_dir: Some("/app".to_string()),
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: true,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::Detected,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };

    let initial_fp = config.compute_fingerprint();
    let mut trusted_config = config.clone();
    trusted_config.trusted_fingerprint = Some(initial_fp.clone());
    assert!(trusted_config.is_trust_valid());

    // 1. Changing command invalidates trust
    let mut tampered_cmd = trusted_config.clone();
    tampered_cmd.command = "sh".to_string();
    tampered_cmd.args = vec!["-c".to_string(), "malicious".to_string()];
    assert!(!tampered_cmd.is_trust_valid());

    // 2. Changing args invalidates trust
    let mut tampered_args = trusted_config.clone();
    tampered_args.args = vec!["run".to_string(), "build".to_string()];
    assert!(!tampered_args.is_trust_valid());

    // 3. Changing working directory invalidates trust
    let mut tampered_wd = trusted_config.clone();
    tampered_wd.working_dir = Some("/etc".to_string());
    assert!(!tampered_wd.is_trust_valid());

    // 4. Changing env_vars invalidates trust
    let mut tampered_env = trusted_config.clone();
    tampered_env
        .env_vars
        .insert("LD_PRELOAD".to_string(), "/tmp/hack.so".to_string());
    assert!(!tampered_env.is_trust_valid());

    // 5. Changing env_file invalidates trust
    let mut tampered_file = trusted_config.clone();
    tampered_file.env_file = Some(".env.production".to_string());
    assert!(!tampered_file.is_trust_valid());
}

#[test]
fn test_database_persistence_of_trust_and_invalidation() {
    let dir = tempdir().unwrap();
    let db_file = dir.path().join("test_trust.db");

    runyard_lib::db::initialize_at_path(&db_file).unwrap();
    let conn = runyard_lib::db::get_connection_for_path(&db_file).unwrap();

    // Insert dummy project
    let project_id = "proj-trust-1";
    conn.execute(
        "INSERT INTO projects (id, name, path, has_git, is_favorite, created_at) VALUES (?, ?, ?, 0, 0, ?)",
        [project_id, "Trust Proj", "/tmp/trust_proj", "2026-01-01T00:00:00Z"],
    ).unwrap();

    // 1. Save untrusted config
    let config = RunConfiguration {
        id: "rc-1".to_string(),
        project_id: project_id.to_string(),
        service_id: None,
        name: "Test Config".to_string(),
        command: "npm".to_string(),
        args: vec!["start".to_string()],
        working_dir: None,
        env_file: None,
        env_vars: HashMap::new(),
        is_trusted: false,
        trusted_fingerprint: None,
        is_default: false,
        source: RunConfigSource::Detected,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };

    // Save
    let conn = runyard_lib::db::get_connection_for_path(&db_file).unwrap();
    let source_str = "Detected";
    conn.execute(
        "INSERT INTO run_configurations (id, project_id, name, command, args, env_vars, is_trusted, trusted_fingerprint, is_default, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        (
            &config.id,
            &config.project_id,
            &config.name,
            &config.command,
            serde_json::to_string(&config.args).unwrap(),
            "{}",
            0,
            &config.trusted_fingerprint,
            0,
            source_str,
            &config.created_at,
        ),
    ).unwrap();

    // Query back
    let row_trusted: (bool, Option<String>) = conn
        .query_row(
            "SELECT is_trusted, trusted_fingerprint FROM run_configurations WHERE id = ?",
            [&config.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert!(!row_trusted.0);
    assert_eq!(row_trusted.1, None);

    // 2. Trust config
    let fp = config.compute_fingerprint();
    conn.execute(
        "UPDATE run_configurations SET is_trusted = 1, trusted_fingerprint = ? WHERE id = ?",
        [&fp, &config.id],
    )
    .unwrap();

    let row_trusted_after: (bool, Option<String>) = conn
        .query_row(
            "SELECT is_trusted, trusted_fingerprint FROM run_configurations WHERE id = ?",
            [&config.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert!(row_trusted_after.0);
    assert_eq!(row_trusted_after.1, Some(fp.clone()));

    // 3. Changing command in save resets trust
    let mut modified = config.clone();
    modified.command = "sh".to_string();
    modified.is_trusted = true; // Attempt to claim trust with old/missing fingerprint
    modified.trusted_fingerprint = Some(fp); // Stale fingerprint

    // Execute save logic
    let computed_fp = modified.compute_fingerprint();
    let (is_trusted, trusted_fp) =
        if modified.is_trusted && modified.trusted_fingerprint.as_deref() == Some(&computed_fp) {
            (true, Some(computed_fp))
        } else {
            (false, None)
        };

    assert!(!is_trusted);
    assert_eq!(trusted_fp, None);
}
