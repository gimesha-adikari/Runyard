use runyard_lib::db::*;
use runyard_lib::models::*;
use rusqlite::Connection;
use std::path::Path;

#[test]
fn test_native_acceptance_lifecycle_workflow() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("runyard_acceptance.db");

    // Copy the real user database backup to our test workspace
    let real_backup =
        Path::new("/home/gimesha/.local/share/runyard/runyard.db.backup_20260903_205127");
    assert!(real_backup.exists(), "Real database backup must exist");
    std::fs::copy(real_backup, &db_path).unwrap();

    // STEP 0: Open the real DB and run migration to current version (v7)
    {
        let mut conn = Connection::open(&db_path).unwrap();
        migrate(&mut conn).unwrap();

        // Schema version must be 8
        let v: i32 = conn
            .query_row(
                "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(v, 8);

        // Before adding any scan roots, orphaned discovered projects from legacy state must be cleaned up!
        let active = get_all_projects_with_conn(&conn).unwrap();
        assert_eq!(
            active.len(),
            0,
            "Active catalog must be 0 when scan_roots is empty"
        );

        // Enriched projects from real DB (portfolio, Runyard, platen) are preserved as archived
        let enriched_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM projects WHERE is_archived = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            enriched_count, 3,
            "Expected 3 enriched projects preserved in archived state"
        );
    }

    // STEP 1: Add /home/gimesha/My_Projects as scan root
    let root_id = "root-my-projects";
    let root_path = "/home/gimesha/My_Projects";
    {
        let conn = Connection::open(&db_path).unwrap();
        let root = ScanRoot {
            id: root_id.to_string(),
            path: root_path.to_string(),
            enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        add_scan_root_with_conn(&conn, &root).unwrap();
    }

    // STEP 2: Rescan projects beneath that root
    {
        let conn = Connection::open(&db_path).unwrap();
        let discovered = runyard_lib::scanner::scan_directory(root_path).unwrap();
        assert!(
            !discovered.is_empty(),
            "Scanner must discover projects under /home/gimesha/My_Projects"
        );

        for sp in &discovered {
            let dp = &sp.path;
            let existing = get_project_by_path_with_conn(&conn, dp).unwrap();
            let p_obj = std::path::Path::new(dp);
            let name = p_obj
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| dp.clone());
            let det = runyard_lib::detector::detect_project_type(dp);
            let has_git = p_obj.join(".git").exists();
            let project_id = existing
                .as_ref()
                .map(|p| p.id.clone())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

            let proj = Project {
                id: project_id,
                name,
                path: dp.clone(),
                project_type: det.project_type,
                languages: det.languages,
                frameworks: det.frameworks,
                has_git,
                git_branch: None,
                git_remote: None,
                preferred_ide: existing.as_ref().and_then(|p| p.preferred_ide.clone()),
                default_run_config_id: existing
                    .as_ref()
                    .and_then(|p| p.default_run_config_id.clone()),
                is_favorite: existing.as_ref().map(|p| p.is_favorite).unwrap_or(false),
                tags: existing
                    .as_ref()
                    .map(|p| p.tags.clone())
                    .unwrap_or_default(),
                last_opened: None,
                last_run: None,
                created_at: existing
                    .as_ref()
                    .map(|p| p.created_at.clone())
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                source: ProjectSource::Discovered,
                parent_project_id: None,
                is_runnable: false,
                is_archived: false,
            };
            upsert_project_with_conn(&conn, &proj).unwrap();
        }
    }

    // STEP 3: Confirm projects appear beneath that root
    let selected_project_id: String;
    {
        let conn = Connection::open(&db_path).unwrap();
        let active = get_all_projects_with_conn(&conn).unwrap();
        assert!(active.len() >= 80, "Expected around 81 projects restored");
        selected_project_id = active[0].id.clone();

        // Confirm enriched projects (e.g. portfolio) survived and unarchived
        let portfolio = active
            .iter()
            .find(|p| p.name == "portfolio")
            .expect("portfolio must be present");
        assert!(!portfolio.is_archived);
        let rc = get_run_configs_with_conn(&conn, &portfolio.id).unwrap();
        assert!(
            rc.iter().any(|c| c.is_trusted),
            "Trusted run configuration on portfolio must be preserved"
        );
    }

    // STEP 4: Select one project (represented by selected_project_id)
    assert!(!selected_project_id.is_empty());

    // STEP 5: Remove /home/gimesha/My_Projects
    {
        let mut conn = Connection::open(&db_path).unwrap();
        let affected = remove_scan_root_with_conn(&mut conn, root_id).unwrap();
        assert!(
            affected.contains(&selected_project_id),
            "Affected projects must include selected project"
        );
        assert!(affected.len() >= 80);

        // Scan root is removed
        let roots = get_scan_roots_with_conn(&conn).unwrap();
        assert!(roots.is_empty(), "Scan roots must be empty");

        // Discovered projects disappear immediately from get_all_projects()
        let active = get_all_projects_with_conn(&conn).unwrap();
        assert_eq!(active.len(), 0, "Active catalog must be empty immediately");
    }

    // STEP 6: Return to Explorer WITHOUT restarting Runyard
    // Verified by checking that active catalog is empty and selected project is not in catalog.

    // STEP 7: Restart Runyard (simulate fresh app startup / connection)
    {
        let mut conn = Connection::open(&db_path).unwrap();
        runyard_lib::reconcile::reconcile_catalog_with_conn(&mut conn).unwrap();
        let active = get_all_projects_with_conn(&conn).unwrap();
        assert_eq!(
            active.len(),
            0,
            "After restart, removed projects are still absent"
        );
    }

    // STEP 8: Re-add /home/gimesha/My_Projects and Rescan
    {
        let conn = Connection::open(&db_path).unwrap();
        let root = ScanRoot {
            id: root_id.to_string(),
            path: root_path.to_string(),
            enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        add_scan_root_with_conn(&conn, &root).unwrap();

        let discovered = runyard_lib::scanner::scan_directory(root_path).unwrap();
        for sp in &discovered {
            let dp = &sp.path;
            let existing = get_project_by_path_with_conn(&conn, dp).unwrap();
            let p_obj = std::path::Path::new(dp);
            let name = p_obj
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| dp.clone());
            let det = runyard_lib::detector::detect_project_type(dp);
            let has_git = p_obj.join(".git").exists();
            let project_id = existing
                .as_ref()
                .map(|p| p.id.clone())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

            let proj = Project {
                id: project_id,
                name,
                path: dp.clone(),
                project_type: det.project_type,
                languages: det.languages,
                frameworks: det.frameworks,
                has_git,
                git_branch: None,
                git_remote: None,
                preferred_ide: existing.as_ref().and_then(|p| p.preferred_ide.clone()),
                default_run_config_id: existing
                    .as_ref()
                    .and_then(|p| p.default_run_config_id.clone()),
                is_favorite: existing.as_ref().map(|p| p.is_favorite).unwrap_or(false),
                tags: existing
                    .as_ref()
                    .map(|p| p.tags.clone())
                    .unwrap_or_default(),
                last_opened: None,
                last_run: None,
                created_at: existing
                    .as_ref()
                    .map(|p| p.created_at.clone())
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                source: ProjectSource::Discovered,
                parent_project_id: None,
                is_runnable: false,
                is_archived: false,
            };
            upsert_project_with_conn(&conn, &proj).unwrap();
        }

        let active = get_all_projects_with_conn(&conn).unwrap();
        assert!(active.len() >= 80);

        // Check for NO duplicate projects (all IDs and paths must be unique)
        let mut ids = std::collections::HashSet::new();
        let mut paths = std::collections::HashSet::new();
        for p in &active {
            assert!(ids.insert(&p.id), "Duplicate project id: {}", p.id);
            assert!(paths.insert(&p.path), "Duplicate project path: {}", p.path);
        }

        // Check that enriched portfolio still has its trusted config intact without duplicates
        let portfolio = active.iter().find(|p| p.name == "portfolio").unwrap();
        let rcs = get_run_configs_with_conn(&conn, &portfolio.id).unwrap();
        let trusted_rcs: Vec<_> = rcs.iter().filter(|c| c.is_trusted).collect();
        assert_eq!(
            trusted_rcs.len(),
            1,
            "Must have exactly 1 trusted run config, no duplicates"
        );
    }

    // STEP 9: Verify genuine manually imported project outside scan root
    {
        let mut conn = Connection::open(&db_path).unwrap();
        let manual_proj = Project {
            id: "p-manual-external".to_string(),
            name: "external-tool".to_string(),
            path: "/opt/custom/external-tool".to_string(),
            project_type: Some("rust".to_string()),
            languages: vec!["Rust".to_string()],
            frameworks: vec![],
            has_git: true,
            git_branch: None,
            git_remote: None,
            preferred_ide: None,
            default_run_config_id: None,
            is_favorite: false,
            tags: vec![],
            last_opened: None,
            last_run: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            source: ProjectSource::Manual,
            parent_project_id: None,
            is_runnable: false,
            is_archived: false,
        };
        upsert_project_with_conn(&conn, &manual_proj).unwrap();

        // Now remove the scan root again
        remove_scan_root_with_conn(&mut conn, root_id).unwrap();

        // The manual project MUST survive removal of unrelated roots!
        let active = get_all_projects_with_conn(&conn).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, "p-manual-external");
        assert_eq!(active[0].source, ProjectSource::Manual);
    }
}
