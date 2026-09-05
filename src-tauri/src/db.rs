use crate::error::{Result, RunyardError};
use crate::models::{Project, RunConfiguration, RunGroup, ScanRoot, Service};
use once_cell::sync::Lazy;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;

static DB_PATH: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("runyard");
    std::fs::create_dir_all(&path).ok();
    path.push("runyard.db");
    path
});

static CUSTOM_DB_PATH: std::sync::RwLock<Option<PathBuf>> = std::sync::RwLock::new(None);

pub fn set_custom_db_path<P: AsRef<std::path::Path>>(path: Option<P>) {
    let mut lock = CUSTOM_DB_PATH.write().unwrap();
    *lock = path.map(|p| p.as_ref().to_path_buf());
}

pub fn get_connection() -> Result<Connection> {
    if let Some(custom) = CUSTOM_DB_PATH.read().unwrap().as_ref() {
        return Connection::open(custom).map_err(Into::into);
    }
    Connection::open(&*DB_PATH).map_err(Into::into)
}

pub fn get_connection_for_path<P: AsRef<std::path::Path>>(path: P) -> Result<Connection> {
    Connection::open(path).map_err(Into::into)
}

pub fn initialize() -> Result<()> {
    let mut conn = get_connection()?;
    migrate(&mut conn)
}

pub fn initialize_at_path<P: AsRef<std::path::Path>>(path: P) -> Result<()> {
    set_custom_db_path(Some(&path));
    let mut conn = get_connection_for_path(path)?;
    migrate(&mut conn)
}

pub fn migrate(conn: &mut Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    )?;

    let current_version: i32 = conn
        .query_row(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let tx = conn.transaction()?;

    if current_version < 1 {
        tx.execute(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                project_type TEXT,
                languages TEXT,
                frameworks TEXT,
                has_git BOOLEAN NOT NULL,
                git_branch TEXT,
                git_remote TEXT,
                preferred_ide TEXT,
                default_run_config_id TEXT,
                is_favorite BOOLEAN NOT NULL DEFAULT 0,
                tags TEXT,
                last_opened TEXT,
                last_run TEXT,
                source TEXT NOT NULL DEFAULT 'Discovered',
                parent_project_id TEXT,
                is_runnable BOOLEAN NOT NULL DEFAULT 0,
                is_archived BOOLEAN NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        tx.execute(
            "CREATE TABLE IF NOT EXISTS scan_roots (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        tx.execute(
            "CREATE TABLE IF NOT EXISTS run_configurations (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                service_id TEXT,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                args TEXT NOT NULL,
                working_dir TEXT,
                env_file TEXT,
                env_vars TEXT DEFAULT '{}',
                is_trusted BOOLEAN NOT NULL DEFAULT 0,
                trusted_fingerprint TEXT,
                is_default BOOLEAN NOT NULL DEFAULT 0,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
            [],
        )?;

        tx.execute(
            "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;
    }

    if current_version < 2 {
        let mut pragma_stmt = tx.prepare("PRAGMA table_info(projects)")?;
        let columns: Vec<String> = pragma_stmt
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        drop(pragma_stmt);

        if !columns.contains(&"default_run_config_id".to_string()) {
            tx.execute(
                "ALTER TABLE projects ADD COLUMN default_run_config_id TEXT",
                [],
            )?;
        }

        let mut pragma_rc = tx.prepare("PRAGMA table_info(run_configurations)")?;
        let rc_columns: Vec<String> = pragma_rc
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        drop(pragma_rc);

        if !rc_columns.contains(&"service_id".to_string()) {
            tx.execute(
                "ALTER TABLE run_configurations ADD COLUMN service_id TEXT",
                [],
            )?;
        }
        if !rc_columns.contains(&"env_vars".to_string()) {
            tx.execute(
                "ALTER TABLE run_configurations ADD COLUMN env_vars TEXT DEFAULT '{}'",
                [],
            )?;
        }
        if !rc_columns.contains(&"is_default".to_string()) {
            tx.execute(
                "ALTER TABLE run_configurations ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT 0",
                [],
            )?;
        }

        tx.execute(
            "CREATE TABLE IF NOT EXISTS services (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                service_type TEXT,
                languages TEXT,
                frameworks TEXT,
                is_runnable BOOLEAN NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
            [],
        )?;

        tx.execute(
            "CREATE TABLE IF NOT EXISTS run_groups (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
            [],
        )?;

        tx.execute(
            "CREATE TABLE IF NOT EXISTS run_group_members (
                id TEXT PRIMARY KEY,
                run_group_id TEXT NOT NULL,
                run_config_id TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                FOREIGN KEY(run_group_id) REFERENCES run_groups(id) ON DELETE CASCADE,
                FOREIGN KEY(run_config_id) REFERENCES run_configurations(id) ON DELETE CASCADE
            )",
            [],
        )?;
    }

    if current_version < 3 {
        let mut pragma_rc = tx.prepare("PRAGMA table_info(run_configurations)")?;
        let rc_columns: Vec<String> = pragma_rc
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        drop(pragma_rc);

        if !rc_columns.contains(&"trusted_fingerprint".to_string()) {
            tx.execute(
                "ALTER TABLE run_configurations ADD COLUMN trusted_fingerprint TEXT",
                [],
            )?;
        }

        // Migrate existing trusted run configurations by computing their valid fingerprint
        let mut select_stmt = tx.prepare(
            "SELECT id, command, args, working_dir, env_file, env_vars FROM run_configurations WHERE is_trusted = 1 AND (trusted_fingerprint IS NULL OR trusted_fingerprint = '')"
        )?;
        #[allow(clippy::type_complexity)]
        let rows: Vec<(
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
        )> = select_stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
        drop(select_stmt);

        for (id, command, args_str, working_dir, env_file, env_vars_str) in rows {
            let args: Vec<String> = serde_json::from_str(&args_str).unwrap_or_default();
            let env_vars: HashMap<String, String> = env_vars_str
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();
            let mock_config = RunConfiguration {
                id: id.clone(),
                project_id: String::new(),
                service_id: None,
                name: String::new(),
                command,
                args,
                working_dir,
                env_file,
                env_vars,
                is_trusted: true,
                trusted_fingerprint: None,
                is_default: false,
                source: crate::models::RunConfigSource::UserCreated,
                created_at: String::new(),
            };
            let fp = mock_config.compute_fingerprint();
            tx.execute(
                "UPDATE run_configurations SET trusted_fingerprint = ? WHERE id = ?",
                [&fp, &id],
            )?;
        }
    }

    if current_version < 4 {
        let mut pragma_proj = tx.prepare("PRAGMA table_info(projects)")?;
        let proj_columns: Vec<String> = pragma_proj
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        drop(pragma_proj);

        if !proj_columns.contains(&"source".to_string()) {
            tx.execute(
                "ALTER TABLE projects ADD COLUMN source TEXT NOT NULL DEFAULT 'Discovered'",
                [],
            )?;
        }
    }
    tx.execute("INSERT INTO schema_version (version) VALUES (4) ON CONFLICT(version) DO UPDATE SET version = 4", [])?;

    if current_version < 5 {
        let mut pragma_stmt = tx.prepare("PRAGMA table_info(projects)")?;
        let columns: Vec<String> = pragma_stmt
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        drop(pragma_stmt);
        if !columns.contains(&"parent_project_id".to_string()) {
            tx.execute("ALTER TABLE projects ADD COLUMN parent_project_id TEXT", [])?;
        }
        if !columns.contains(&"is_runnable".to_string()) {
            tx.execute(
                "ALTER TABLE projects ADD COLUMN is_runnable BOOLEAN NOT NULL DEFAULT 0",
                [],
            )?;
        }

        let mut pragma_svc = tx.prepare("PRAGMA table_info(services)")?;
        let svc_columns: Vec<String> = pragma_svc
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        drop(pragma_svc);
        if !svc_columns.contains(&"is_runnable".to_string()) {
            tx.execute(
                "ALTER TABLE services ADD COLUMN is_runnable BOOLEAN NOT NULL DEFAULT 0",
                [],
            )?;
        }

        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (5)",
            [],
        )?;
    }

    if current_version < 6 {
        let mut pragma_stmt = tx.prepare("PRAGMA table_info(projects)")?;
        let columns: Vec<String> = pragma_stmt
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        drop(pragma_stmt);
        if !columns.contains(&"is_archived".to_string()) {
            tx.execute(
                "ALTER TABLE projects ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0",
                [],
            )?;
        }

        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (6)",
            [],
        )?;
    }

    if current_version < 7 {
        // 1. Normalize source column values (remove surrounding quotes from legacy serialization)
        tx.execute(
            "UPDATE projects SET source = 'Manual' WHERE source = '\"Manual\"' OR source = 'Manual'",
            [],
        )?;
        tx.execute(
            "UPDATE projects SET source = 'Discovered' WHERE source = '\"Discovered\"' OR source = 'Discovered' OR source IS NULL",
            [],
        )?;

        // 2. Fetch all enabled scan roots
        let mut roots_stmt = tx.prepare("SELECT path FROM scan_roots WHERE enabled = 1")?;
        let active_roots: Vec<std::path::PathBuf> = roots_stmt
            .query_map([], |row| {
                let p: String = row.get(0)?;
                Ok(std::path::PathBuf::from(p))
            })?
            .filter_map(|r| r.ok())
            .collect();
        drop(roots_stmt);

        // 3. Find all discovered projects that are not covered by ANY active scan root
        let mut proj_stmt = tx.prepare(
            "SELECT id, path, is_favorite, tags, preferred_ide, default_run_config_id FROM projects WHERE source = 'Discovered'"
        )?;
        let discovered_projs: Vec<(
            String,
            String,
            bool,
            Option<String>,
            Option<String>,
            Option<String>,
        )> = proj_stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
        drop(proj_stmt);

        for (pid, path_str, is_fav, tags_opt, pref_ide, def_rc) in discovered_projs {
            let p_path = std::path::Path::new(&path_str);
            let is_covered = active_roots.iter().any(|root| p_path.starts_with(root));

            if !is_covered {
                let tags: Vec<String> = tags_opt
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default();
                let has_user_cfg = {
                    let mut rc_stmt = tx.prepare(
                        "SELECT count(*) FROM run_configurations WHERE project_id = ? AND (source = 'UserCreated' OR is_trusted = 1)"
                    )?;
                    let count: i64 = rc_stmt.query_row([&pid], |r| r.get(0)).unwrap_or(0);
                    count > 0
                };
                let has_run_group = {
                    let mut rg_stmt =
                        tx.prepare("SELECT count(*) FROM run_groups WHERE project_id = ?")?;
                    let count: i64 = rg_stmt.query_row([&pid], |r| r.get(0)).unwrap_or(0);
                    count > 0
                };

                let is_enriched = is_fav
                    || !tags.is_empty()
                    || pref_ide.is_some()
                    || def_rc.is_some()
                    || has_user_cfg
                    || has_run_group;

                if is_enriched {
                    tx.execute("UPDATE projects SET is_archived = 1 WHERE id = ?", [&pid])?;
                } else {
                    tx.execute("DELETE FROM projects WHERE id = ?", [&pid])?;
                }
            }
        }

        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (7)",
            [],
        )?;
    }

    if current_version < 8 {
        tx.execute(
            "CREATE TABLE IF NOT EXISTS services (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                service_type TEXT,
                languages TEXT,
                frameworks TEXT,
                is_runnable BOOLEAN NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'Detected',
                created_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
            [],
        )?;

        let mut pragma_svc = tx.prepare("PRAGMA table_info(services)")?;
        let svc_columns: Vec<String> = pragma_svc
            .query_map([], |row| row.get(1))?
            .filter_map(|r| r.ok())
            .collect();
        drop(pragma_svc);

        if !svc_columns.contains(&"source".to_string()) {
            tx.execute(
                "ALTER TABLE services ADD COLUMN source TEXT NOT NULL DEFAULT 'Detected'",
                [],
            )?;
        }

        // Safe Deduplication with Foreign-Key Remapping:
        // Identify duplicate groups by (project_id, path)
        let mut dup_stmt = tx.prepare(
            "SELECT project_id, path, COUNT(*) as cnt FROM services GROUP BY project_id, path HAVING cnt > 1"
        )?;
        let dup_groups: Vec<(String, String)> = dup_stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();
        drop(dup_stmt);

        for (proj_id, svc_path) in dup_groups {
            // Prefer 'Manual' over 'Detected', then earliest by rowid
            let mut list_stmt = tx.prepare(
                "SELECT id, source FROM services WHERE project_id = ? AND path = ? 
                 ORDER BY CASE WHEN source = 'Manual' THEN 0 ELSE 1 END ASC, rowid ASC",
            )?;
            let rows: Vec<(String, String)> = list_stmt
                .query_map([&proj_id, &svc_path], |r| Ok((r.get(0)?, r.get(1)?)))?
                .filter_map(|r| r.ok())
                .collect();
            drop(list_stmt);

            if let Some((canonical_id, _)) = rows.first() {
                for (dup_id, _) in rows.iter().skip(1) {
                    // Remap all RunConfigurations referencing duplicate service to canonical ID
                    tx.execute(
                        "UPDATE run_configurations SET service_id = ? WHERE service_id = ?",
                        [canonical_id, dup_id],
                    )?;
                    // Now safely delete the duplicate service row
                    tx.execute("DELETE FROM services WHERE id = ?", [dup_id])?;
                }
            }
        }

        // Component-safe noise pruning for services: ONLY where source = 'Detected' (never touch 'Manual')
        {
            let mut stmt = tx.prepare("SELECT id, path FROM services WHERE source = 'Detected'")?;
            let candidate_services: Vec<(String, String)> = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                .filter_map(|r| r.ok())
                .collect();
            drop(stmt);

            for (id, path) in candidate_services {
                if crate::scanner::is_noise_path(&path) {
                    tx.execute("DELETE FROM services WHERE id = ?", [&id])?;
                }
            }
        }

        // For any UserCreated configs whose service_id may have pointed to a deleted service,
        // unlink by setting service_id = NULL so the UserCreated config is 100% preserved
        tx.execute(
            "UPDATE run_configurations 
             SET service_id = NULL 
             WHERE service_id IS NOT NULL 
               AND source = 'UserCreated' 
               AND service_id NOT IN (SELECT id FROM services)",
            [],
        )?;

        // Component-safe noise pruning for run configurations: ONLY where source = 'Detected' (never touch 'UserCreated')
        {
            let mut stmt = tx.prepare(
                "SELECT id, working_dir, name FROM run_configurations WHERE source = 'Detected'",
            )?;
            let candidate_configs: Vec<(String, Option<String>, String)> = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
                .filter_map(|r| r.ok())
                .collect();
            drop(stmt);

            for (id, wd_opt, name) in candidate_configs {
                let is_noise_wd = wd_opt
                    .as_deref()
                    .map(crate::scanner::is_noise_path)
                    .unwrap_or(false);
                let is_legacy_noise_name = name.starts_with("[studio_spec]")
                    || name.starts_with("[test_svg_spike]")
                    || name.starts_with("[repository]");

                if is_noise_wd || is_legacy_noise_name {
                    tx.execute("DELETE FROM run_configurations WHERE id = ?", [&id])?;
                }
            }
        }

        tx.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (8)",
            [],
        )?;
    }

    tx.commit()?;

    Ok(())
}

pub fn get_all_projects_with_conn(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source, parent_project_id, is_runnable, is_archived FROM projects WHERE is_archived = 0"
    )?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            project_type: row.get(3)?,
            languages: row
                .get::<_, Option<String>>(4)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            frameworks: row
                .get::<_, Option<String>>(5)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            has_git: row.get(6)?,
            git_branch: row.get(7)?,
            git_remote: row.get(8)?,
            preferred_ide: row.get(9)?,
            default_run_config_id: row.get(10)?,
            is_favorite: row.get(11)?,
            tags: row
                .get::<_, Option<String>>(12)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            last_opened: row.get(13)?,
            last_run: row.get(14)?,
            created_at: row.get(15)?,
            source: {
                let src_str: String = row.get(16)?;
                if src_str == "Manual" || src_str == "\"Manual\"" {
                    crate::models::ProjectSource::Manual
                } else {
                    crate::models::ProjectSource::Discovered
                }
            },
            parent_project_id: row.get(17).unwrap_or(None),
            is_runnable: row.get(18).unwrap_or(false),
            is_archived: row.get(19).unwrap_or(false),
        })
    })?;

    let mut result = Vec::new();
    for p in projects {
        result.push(p?);
    }
    Ok(result)
}

pub fn get_all_projects() -> Result<Vec<Project>> {
    let conn = get_connection()?;
    get_all_projects_with_conn(&conn)
}

pub fn get_project_with_conn(conn: &Connection, id: &str) -> Result<Project> {
    let mut stmt = conn.prepare(
        "SELECT id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source, parent_project_id, is_runnable, is_archived FROM projects WHERE id = ? AND is_archived = 0"
    )?;

    let p = stmt.query_row([id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            project_type: row.get(3)?,
            languages: row
                .get::<_, Option<String>>(4)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            frameworks: row
                .get::<_, Option<String>>(5)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            has_git: row.get(6)?,
            git_branch: row.get(7)?,
            git_remote: row.get(8)?,
            preferred_ide: row.get(9)?,
            default_run_config_id: row.get(10)?,
            is_favorite: row.get(11)?,
            tags: row
                .get::<_, Option<String>>(12)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            last_opened: row.get(13)?,
            last_run: row.get(14)?,
            created_at: row.get(15)?,
            source: {
                let src_str: String = row.get(16)?;
                if src_str == "Manual" || src_str == "\"Manual\"" {
                    crate::models::ProjectSource::Manual
                } else {
                    crate::models::ProjectSource::Discovered
                }
            },
            parent_project_id: row.get(17).unwrap_or(None),
            is_runnable: row.get(18).unwrap_or(false),
            is_archived: row.get(19).unwrap_or(false),
        })
    });

    p.map_err(|_| RunyardError::NotFound(format!("Project {} not found", id)))
}

pub fn get_project(id: &str) -> Result<Project> {
    let conn = get_connection()?;
    get_project_with_conn(&conn, id)
}

pub fn get_project_by_path_with_conn(conn: &Connection, path: &str) -> Result<Option<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source, parent_project_id, is_runnable, is_archived FROM projects WHERE path = ?"
    )?;

    let mut rows = stmt.query([path])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            project_type: row.get(3)?,
            languages: row
                .get::<_, Option<String>>(4)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            frameworks: row
                .get::<_, Option<String>>(5)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            has_git: row.get(6)?,
            git_branch: row.get(7)?,
            git_remote: row.get(8)?,
            preferred_ide: row.get(9)?,
            default_run_config_id: row.get(10)?,
            is_favorite: row.get(11)?,
            tags: row
                .get::<_, Option<String>>(12)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            last_opened: row.get(13)?,
            last_run: row.get(14)?,
            created_at: row.get(15)?,
            source: {
                let src_str: String = row.get(16)?;
                if src_str == "Manual" || src_str == "\"Manual\"" {
                    crate::models::ProjectSource::Manual
                } else {
                    crate::models::ProjectSource::Discovered
                }
            },
            parent_project_id: row.get(17).unwrap_or(None),
            is_runnable: row.get(18).unwrap_or(false),
            is_archived: row.get(19).unwrap_or(false),
        }))
    } else {
        Ok(None)
    }
}

pub fn get_project_by_path(path: &str) -> Result<Option<Project>> {
    let conn = get_connection()?;
    get_project_by_path_with_conn(&conn, path)
}

pub fn upsert_project_with_conn(conn: &Connection, project: &Project) -> Result<()> {
    let source_str = match project.source {
        crate::models::ProjectSource::Manual => "Manual",
        crate::models::ProjectSource::Discovered => "Discovered",
    };
    conn.execute(
        "INSERT INTO projects (id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source, parent_project_id, is_runnable, is_archived)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
         ON CONFLICT(path) DO UPDATE SET
         name = excluded.name,
         project_type = excluded.project_type,
         languages = excluded.languages,
         frameworks = excluded.frameworks,
         has_git = excluded.has_git,
         git_branch = excluded.git_branch,
         git_remote = excluded.git_remote,
         preferred_ide = excluded.preferred_ide,
         default_run_config_id = excluded.default_run_config_id,
         is_favorite = excluded.is_favorite,
         tags = excluded.tags,
         last_opened = excluded.last_opened,
         last_run = excluded.last_run,
         source = excluded.source,
         parent_project_id = excluded.parent_project_id,
         is_runnable = excluded.is_runnable,
         is_archived = excluded.is_archived",
        rusqlite::params![
            &project.id,
            &project.name,
            &project.path,
            &project.project_type,
            serde_json::to_string(&project.languages)?,
            serde_json::to_string(&project.frameworks)?,
            project.has_git,
            &project.git_branch,
            &project.git_remote,
            &project.preferred_ide,
            &project.default_run_config_id,
            project.is_favorite,
            serde_json::to_string(&project.tags)?,
            &project.last_opened,
            &project.last_run,
            &project.created_at,
            source_str,
            &project.parent_project_id,
            project.is_runnable,
            project.is_archived,
        ],
    )?;
    Ok(())
}

pub fn upsert_project(project: &Project) -> Result<()> {
    let conn = get_connection()?;
    upsert_project_with_conn(&conn, project)
}

pub fn delete_project_with_conn(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM projects WHERE id = ?", [id])?;
    Ok(())
}

pub fn delete_project(id: &str) -> Result<()> {
    let conn = get_connection()?;
    delete_project_with_conn(&conn, id)
}

pub fn get_services_with_conn(conn: &Connection, project_id: &str) -> Result<Vec<Service>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, path, service_type, languages, frameworks, is_runnable, source, created_at FROM services WHERE project_id = ?"
    )?;

    let services = stmt.query_map([project_id], |row| {
        let source_str: String = row.get(8).unwrap_or_else(|_| "Detected".to_string());
        let source = if source_str == "Manual" {
            crate::models::ServiceSource::Manual
        } else {
            crate::models::ServiceSource::Detected
        };
        Ok(Service {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            path: row.get(3)?,
            service_type: row.get(4)?,
            languages: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            frameworks: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
            is_runnable: row.get(7)?,
            source,
            created_at: row.get(9)?,
        })
    })?;

    let mut result = Vec::new();
    for s in services {
        result.push(s?);
    }
    Ok(result)
}

pub fn get_services(project_id: &str) -> Result<Vec<Service>> {
    let conn = get_connection()?;
    get_services_with_conn(&conn, project_id)
}

pub fn find_service_by_path_with_conn(
    conn: &Connection,
    project_id: &str,
    path: &str,
) -> Result<Option<Service>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, path, service_type, languages, frameworks, is_runnable, source, created_at FROM services WHERE project_id = ? AND path = ? LIMIT 1"
    )?;

    let mut rows = stmt.query_map([project_id, path], |row| {
        let source_str: String = row.get(8).unwrap_or_else(|_| "Detected".to_string());
        let source = if source_str == "Manual" {
            crate::models::ServiceSource::Manual
        } else {
            crate::models::ServiceSource::Detected
        };
        Ok(Service {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            path: row.get(3)?,
            service_type: row.get(4)?,
            languages: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            frameworks: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
            is_runnable: row.get(7)?,
            source,
            created_at: row.get(9)?,
        })
    })?;

    if let Some(first) = rows.next() {
        Ok(Some(first?))
    } else {
        Ok(None)
    }
}

pub fn prune_stale_detected_services_with_conn(
    conn: &Connection,
    project_id: &str,
    valid_paths: &[String],
) -> Result<()> {
    let existing = get_services_with_conn(conn, project_id)?;
    for svc in existing {
        if svc.source == crate::models::ServiceSource::Detected && !valid_paths.contains(&svc.path)
        {
            // Unlink any UserCreated run configs so they are safely preserved
            conn.execute(
                "UPDATE run_configurations SET service_id = NULL WHERE service_id = ? AND source = 'UserCreated'",
                [&svc.id],
            )?;
            // Only delete Detected run configurations referencing the stale detected service
            conn.execute(
                "DELETE FROM run_configurations WHERE service_id = ? AND source = 'Detected'",
                [&svc.id],
            )?;
            conn.execute("DELETE FROM services WHERE id = ?", [&svc.id])?;
        }
    }
    Ok(())
}

pub fn upsert_service_with_conn(conn: &Connection, service: &Service) -> Result<()> {
    let source_str = match service.source {
        crate::models::ServiceSource::Manual => "Manual",
        crate::models::ServiceSource::Detected => "Detected",
    };
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, service_type, languages, frameworks, is_runnable, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, path = excluded.path, service_type = excluded.service_type, languages = excluded.languages, frameworks = excluded.frameworks, is_runnable = excluded.is_runnable, source = excluded.source",
        rusqlite::params![
            &service.id,
            &service.project_id,
            &service.name,
            &service.path,
            &service.service_type,
            serde_json::to_string(&service.languages)?,
            serde_json::to_string(&service.frameworks)?,
            service.is_runnable,
            source_str,
            &service.created_at
        ]
    )?;
    Ok(())
}

pub fn upsert_service(service: &Service) -> Result<()> {
    let conn = get_connection()?;
    upsert_service_with_conn(&conn, service)
}

pub fn delete_service(id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM services WHERE id = ?", [id])?;
    Ok(())
}

pub fn get_scan_roots_with_conn(conn: &Connection) -> Result<Vec<ScanRoot>> {
    let mut stmt = conn.prepare("SELECT id, path, enabled, created_at FROM scan_roots")?;

    let roots = stmt.query_map([], |row| {
        Ok(ScanRoot {
            id: row.get(0)?,
            path: row.get(1)?,
            enabled: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;

    let mut result = Vec::new();
    for r in roots {
        result.push(r?);
    }
    Ok(result)
}

pub fn get_scan_roots() -> Result<Vec<ScanRoot>> {
    let conn = get_connection()?;
    get_scan_roots_with_conn(&conn)
}

pub fn add_scan_root_with_conn(conn: &Connection, root: &ScanRoot) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO scan_roots (id, path, enabled, created_at) VALUES (?1, ?2, ?3, ?4)",
        (&root.id, &root.path, root.enabled, &root.created_at),
    )?;
    Ok(())
}

pub fn add_scan_root(root: &ScanRoot) -> Result<()> {
    let conn = get_connection()?;
    add_scan_root_with_conn(&conn, root)
}

pub fn is_project_enriched_with_conn(conn: &Connection, project: &Project) -> Result<bool> {
    if project.is_favorite
        || !project.tags.is_empty()
        || project.preferred_ide.is_some()
        || project.default_run_config_id.is_some()
    {
        return Ok(true);
    }
    let configs = get_run_configs_with_conn(conn, &project.id)?;
    if configs
        .iter()
        .any(|c| c.source == crate::models::RunConfigSource::UserCreated || c.is_trusted)
    {
        return Ok(true);
    }
    let groups = get_run_groups_with_conn(conn, &project.id)?;
    if !groups.is_empty() {
        return Ok(true);
    }
    Ok(false)
}

pub fn is_project_enriched(project: &Project) -> Result<bool> {
    let conn = get_connection()?;
    is_project_enriched_with_conn(&conn, project)
}

pub fn remove_scan_root_with_conn(conn: &mut Connection, id: &str) -> Result<Vec<String>> {
    let tx = conn.transaction()?;

    // 1. Find the scan root to remove
    let root_path: Option<String> = tx
        .query_row("SELECT path FROM scan_roots WHERE id = ?", [id], |row| {
            row.get(0)
        })
        .ok();

    let removed_root_path = match root_path {
        Some(p) => p,
        None => {
            return Ok(Vec::new());
        }
    };

    let removed_path = std::path::Path::new(&removed_root_path);

    // 2. Fetch all other enabled scan roots
    let mut remaining_stmt =
        tx.prepare("SELECT path FROM scan_roots WHERE id != ? AND enabled = 1")?;
    let remaining_root_paths: Vec<String> = remaining_stmt
        .query_map([id], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    drop(remaining_stmt);

    let remaining_paths: Vec<std::path::PathBuf> = remaining_root_paths
        .iter()
        .map(|s| std::path::PathBuf::from(s))
        .collect();

    // 3. Fetch all projects in database
    let mut proj_stmt = tx.prepare(
        "SELECT id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source, parent_project_id, is_runnable, is_archived FROM projects"
    )?;

    let all_projects: Vec<Project> = proj_stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                project_type: row.get(3)?,
                languages: row
                    .get::<_, Option<String>>(4)?
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                frameworks: row
                    .get::<_, Option<String>>(5)?
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                has_git: row.get(6)?,
                git_branch: row.get(7)?,
                git_remote: row.get(8)?,
                preferred_ide: row.get(9)?,
                default_run_config_id: row.get(10)?,
                is_favorite: row.get(11)?,
                tags: row
                    .get::<_, Option<String>>(12)?
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                last_opened: row.get(13)?,
                last_run: row.get(14)?,
                created_at: row.get(15)?,
                source: {
                    let src_str: String = row.get(16)?;
                    if src_str == "Manual" || src_str == "\"Manual\"" {
                        crate::models::ProjectSource::Manual
                    } else {
                        crate::models::ProjectSource::Discovered
                    }
                },
                parent_project_id: row.get(17).unwrap_or(None),
                is_runnable: row.get(18).unwrap_or(false),
                is_archived: row.get(19).unwrap_or(false),
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    drop(proj_stmt);

    let mut affected_project_ids = Vec::new();

    for project in &all_projects {
        // Only consider auto-discovered projects. Manual projects are never removed.
        if project.source == crate::models::ProjectSource::Manual {
            continue;
        }

        let p_path = std::path::Path::new(&project.path);

        // Check if path is underneath the removed scan root (component-aware)
        let is_under_removed = p_path.starts_with(removed_path);

        // Check if subproject whose parent was under removed root
        let parent_under_removed = if let Some(ref pid) = project.parent_project_id {
            all_projects
                .iter()
                .any(|p| p.id == *pid && std::path::Path::new(&p.path).starts_with(removed_path))
        } else {
            false
        };

        if !is_under_removed && !parent_under_removed {
            continue;
        }

        // Check if covered by another remaining scan root
        let covered_by_other = remaining_paths.iter().any(|r| p_path.starts_with(r));
        if covered_by_other {
            continue;
        }

        affected_project_ids.push(project.id.clone());
    }

    // Process affected projects: archive user-enriched, delete untouched
    for pid in &affected_project_ids {
        if let Some(project) = all_projects.iter().find(|p| &p.id == pid) {
            let is_enriched = {
                if project.is_favorite
                    || !project.tags.is_empty()
                    || project.preferred_ide.is_some()
                    || project.default_run_config_id.is_some()
                {
                    true
                } else {
                    let mut rc_stmt = tx.prepare(
                        "SELECT source, is_trusted FROM run_configurations WHERE project_id = ?",
                    )?;
                    let has_user_cfg = rc_stmt
                        .query_map([pid], |row| {
                            let src: String = row.get(0)?;
                            let trusted: bool = row.get(1)?;
                            Ok(src == "UserCreated" || trusted)
                        })?
                        .filter_map(|r| r.ok())
                        .any(|b| b);
                    drop(rc_stmt);

                    if has_user_cfg {
                        true
                    } else {
                        let mut rg_stmt =
                            tx.prepare("SELECT count(*) FROM run_groups WHERE project_id = ?")?;
                        let count: i64 = rg_stmt.query_row([pid], |row| row.get(0)).unwrap_or(0);
                        count > 0
                    }
                }
            };

            if is_enriched {
                tx.execute("UPDATE projects SET is_archived = 1 WHERE id = ?", [pid])?;
            } else {
                tx.execute("DELETE FROM projects WHERE id = ?", [pid])?;
            }
        }
    }

    // 4. Delete the scan root
    tx.execute("DELETE FROM scan_roots WHERE id = ?", [id])?;

    tx.commit()?;

    Ok(affected_project_ids)
}

pub fn remove_scan_root(id: &str) -> Result<Vec<String>> {
    let mut conn = get_connection()?;
    remove_scan_root_with_conn(&mut conn, id)
}

pub fn get_run_configs_with_conn(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<RunConfiguration>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, service_id, name, command, args, working_dir, env_file, env_vars, is_trusted, is_default, source, created_at, trusted_fingerprint FROM run_configurations WHERE project_id = ?"
    )?;

    let configs = stmt.query_map([project_id], |row| {
        let env_vars_str: Option<String> = row.get(8)?;
        let env_vars: HashMap<String, String> = env_vars_str
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        let is_trusted_val: bool = row.get(9)?;
        let trusted_fp: Option<String> = row.get(13)?;

        Ok(RunConfiguration {
            id: row.get(0)?,
            project_id: row.get(1)?,
            service_id: row.get(2)?,
            name: row.get(3)?,
            command: row.get(4)?,
            args: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            working_dir: row.get(6)?,
            env_file: row.get(7)?,
            env_vars,
            is_trusted: is_trusted_val,
            trusted_fingerprint: trusted_fp,
            is_default: row.get(10)?,
            source: serde_json::from_str(&format!("\"{}\"", row.get::<_, String>(11)?))
                .unwrap_or(crate::models::RunConfigSource::UserCreated),
            created_at: row.get(12)?,
        })
    })?;

    let mut result = Vec::new();
    for c in configs {
        result.push(c?);
    }
    Ok(result)
}

pub fn get_run_configs(project_id: &str) -> Result<Vec<RunConfiguration>> {
    let conn = get_connection()?;
    get_run_configs_with_conn(&conn, project_id)
}

pub fn get_run_config(id: &str) -> Result<RunConfiguration> {
    let conn = get_connection()?;
    get_run_config_with_conn(&conn, id)
}

pub fn get_run_config_with_conn(conn: &Connection, id: &str) -> Result<RunConfiguration> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, service_id, name, command, args, working_dir, env_file, env_vars, is_trusted, is_default, source, created_at, trusted_fingerprint FROM run_configurations WHERE id = ?"
    )?;

    let config = stmt
        .query_row([id], |row| {
            let env_vars_str: Option<String> = row.get(8)?;
            let env_vars: HashMap<String, String> = env_vars_str
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            let is_trusted_val: bool = row.get(9)?;
            let trusted_fp: Option<String> = row.get(13)?;

            Ok(RunConfiguration {
                id: row.get(0)?,
                project_id: row.get(1)?,
                service_id: row.get(2)?,
                name: row.get(3)?,
                command: row.get(4)?,
                args: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
                working_dir: row.get(6)?,
                env_file: row.get(7)?,
                env_vars,
                is_trusted: is_trusted_val,
                trusted_fingerprint: trusted_fp,
                is_default: row.get(10)?,
                source: serde_json::from_str(&format!("\"{}\"", row.get::<_, String>(11)?))
                    .unwrap_or(crate::models::RunConfigSource::UserCreated),
                created_at: row.get(12)?,
            })
        })
        .map_err(|_| RunyardError::NotFound(format!("Run config {} not found", id)))?;

    Ok(config)
}

pub fn save_run_config_with_conn(conn: &Connection, config: &RunConfiguration) -> Result<()> {
    let source_str = match config.source {
        crate::models::RunConfigSource::Detected => "Detected",
        crate::models::RunConfigSource::UserCreated => "UserCreated",
    };

    let computed_fp = config.compute_fingerprint();
    let (is_trusted, trusted_fp) =
        if config.is_trusted && config.trusted_fingerprint.as_deref() == Some(&computed_fp) {
            (true, Some(computed_fp))
        } else {
            (false, None)
        };

    conn.execute(
        "INSERT INTO run_configurations (id, project_id, service_id, name, command, args, working_dir, env_file, env_vars, is_trusted, trusted_fingerprint, is_default, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(id) DO UPDATE SET
         service_id = excluded.service_id, name = excluded.name, command = excluded.command, args = excluded.args, working_dir = excluded.working_dir, env_file = excluded.env_file, env_vars = excluded.env_vars, is_trusted = excluded.is_trusted, trusted_fingerprint = excluded.trusted_fingerprint, is_default = excluded.is_default",
        (
            &config.id,
            &config.project_id,
            &config.service_id,
            &config.name,
            &config.command,
            serde_json::to_string(&config.args)?,
            &config.working_dir,
            &config.env_file,
            serde_json::to_string(&config.env_vars)?,
            is_trusted,
            &trusted_fp,
            config.is_default,
            source_str,
            &config.created_at,
        ),
    )?;
    Ok(())
}

pub fn save_run_config(config: &RunConfiguration) -> Result<()> {
    let conn = get_connection()?;
    save_run_config_with_conn(&conn, config)
}

pub fn delete_run_config(id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM run_configurations WHERE id = ?", [id])?;
    Ok(())
}

pub fn set_default_run_config(project_id: &str, config_id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE run_configurations SET is_default = 0 WHERE project_id = ?",
        [project_id],
    )?;
    conn.execute(
        "UPDATE run_configurations SET is_default = 1 WHERE id = ?",
        [config_id],
    )?;
    conn.execute(
        "UPDATE projects SET default_run_config_id = ? WHERE id = ?",
        [config_id, project_id],
    )?;
    Ok(())
}

pub fn get_run_groups_with_conn(conn: &Connection, project_id: &str) -> Result<Vec<RunGroup>> {
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, created_at FROM run_groups WHERE project_id = ?")?;

    let groups = stmt.query_map([project_id], |row| {
        let group_id: String = row.get(0)?;
        let name: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        Ok((group_id, name, created_at))
    })?;

    let mut result = Vec::new();
    for g in groups {
        let (group_id, name, created_at) = g?;
        let mut member_stmt = conn.prepare(
            "SELECT run_config_id FROM run_group_members WHERE run_group_id = ? ORDER BY order_index ASC"
        )?;
        let members: Vec<String> = member_stmt
            .query_map([&group_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        result.push(RunGroup {
            id: group_id,
            project_id: project_id.to_string(),
            name,
            member_config_ids: members,
            created_at,
        });
    }
    Ok(result)
}

pub fn get_run_groups(project_id: &str) -> Result<Vec<RunGroup>> {
    let conn = get_connection()?;
    get_run_groups_with_conn(&conn, project_id)
}

pub fn save_run_group(group: &RunGroup) -> Result<()> {
    let mut conn = get_connection()?;
    let tx = conn.transaction()?;

    tx.execute(
        "INSERT INTO run_groups (id, project_id, name, created_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name",
        (&group.id, &group.project_id, &group.name, &group.created_at),
    )?;

    tx.execute(
        "DELETE FROM run_group_members WHERE run_group_id = ?",
        [&group.id],
    )?;

    for (idx, config_id) in group.member_config_ids.iter().enumerate() {
        let member_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO run_group_members (id, run_group_id, run_config_id, order_index) VALUES (?1, ?2, ?3, ?4)",
            (member_id, &group.id, config_id, idx as i32),
        )?;
    }

    tx.commit()?;

    Ok(())
}

pub fn delete_run_group(id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM run_groups WHERE id = ?", [id])?;
    Ok(())
}

pub fn get_setting(key: &str) -> Result<Option<String>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?")?;
    let mut rows = stmt.query([key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(key: &str, value: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub fn toggle_favorite(id: &str) -> Result<bool> {
    let mut project = get_project(id)?;
    project.is_favorite = !project.is_favorite;
    let conn = get_connection()?;
    conn.execute(
        "UPDATE projects SET is_favorite = ? WHERE id = ?",
        (project.is_favorite, id),
    )?;
    Ok(project.is_favorite)
}

pub fn update_project_tags(id: &str, tags: Vec<String>) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE projects SET tags = ? WHERE id = ?",
        (serde_json::to_string(&tags)?, id),
    )?;
    Ok(())
}

pub fn set_preferred_ide(project_id: &str, ide_id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE projects SET preferred_ide = ? WHERE id = ?",
        (ide_id, project_id),
    )?;
    Ok(())
}

pub fn update_last_opened(project_id: &str) -> Result<()> {
    let conn = get_connection()?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET last_opened = ? WHERE id = ?",
        (&now, project_id),
    )?;
    Ok(())
}

pub fn update_last_run_with_conn(conn: &Connection, project_id: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET last_run = ? WHERE id = ?",
        (&now, project_id),
    )?;
    Ok(())
}

pub fn update_last_run(project_id: &str) -> Result<()> {
    let conn = get_connection()?;
    update_last_run_with_conn(&conn, project_id)
}
