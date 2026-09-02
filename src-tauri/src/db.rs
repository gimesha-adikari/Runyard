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

pub fn get_connection() -> Result<Connection> {
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

    tx.commit()?;

    Ok(())
}

pub fn get_all_projects() -> Result<Vec<Project>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source, parent_project_id, is_runnable FROM projects"
    )?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            project_type: row.get(3)?,
            languages: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_default(),
            frameworks: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            has_git: row.get(6)?,
            git_branch: row.get(7)?,
            git_remote: row.get(8)?,
            preferred_ide: row.get(9)?,
            default_run_config_id: row.get(10)?,
            is_favorite: row.get(11)?,
            tags: serde_json::from_str(&row.get::<_, String>(12)?).unwrap_or_default(),
            last_opened: row.get(13)?,
            last_run: row.get(14)?,
            created_at: row.get(15)?,
            source: {
                let src_str: String = row.get(16)?;
                if src_str == "Manual" {
                    crate::models::ProjectSource::Manual
                } else {
                    crate::models::ProjectSource::Discovered
                }
            },
            parent_project_id: row.get(17).unwrap_or(None),
            is_runnable: row.get(18).unwrap_or(false),
        })
    })?;

    let mut result = Vec::new();
    for p in projects {
        result.push(p?);
    }
    Ok(result)
}

pub fn get_project(id: &str) -> Result<Project> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source, parent_project_id, is_runnable FROM projects WHERE id = ?"
    )?;

    let p = stmt.query_row([id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            project_type: row.get(3)?,
            languages: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_default(),
            frameworks: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            has_git: row.get(6)?,
            git_branch: row.get(7)?,
            git_remote: row.get(8)?,
            preferred_ide: row.get(9)?,
            default_run_config_id: row.get(10)?,
            is_favorite: row.get(11)?,
            tags: serde_json::from_str(&row.get::<_, String>(12)?).unwrap_or_default(),
            last_opened: row.get(13)?,
            last_run: row.get(14)?,
            created_at: row.get(15)?,
            source: {
                let src_str: String = row.get(16)?;
                if src_str == "Manual" {
                    crate::models::ProjectSource::Manual
                } else {
                    crate::models::ProjectSource::Discovered
                }
            },
            parent_project_id: row.get(17).unwrap_or(None),
            is_runnable: row.get(18).unwrap_or(false),
        })
    });

    p.map_err(|_| RunyardError::NotFound(format!("Project {} not found", id)))
}

pub fn get_project_by_path(path: &str) -> Result<Option<Project>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source, parent_project_id, is_runnable FROM projects WHERE path = ?"
    )?;

    let mut rows = stmt.query([path])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            project_type: row.get(3)?,
            languages: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_default(),
            frameworks: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            has_git: row.get(6)?,
            git_branch: row.get(7)?,
            git_remote: row.get(8)?,
            preferred_ide: row.get(9)?,
            default_run_config_id: row.get(10)?,
            is_favorite: row.get(11)?,
            tags: serde_json::from_str(&row.get::<_, String>(12)?).unwrap_or_default(),
            last_opened: row.get(13)?,
            last_run: row.get(14)?,
            created_at: row.get(15)?,
            source: {
                let src_str: String = row.get(16)?;
                if src_str == "Manual" {
                    crate::models::ProjectSource::Manual
                } else {
                    crate::models::ProjectSource::Discovered
                }
            },
            parent_project_id: row.get(17).unwrap_or(None),
            is_runnable: row.get(18).unwrap_or(false),
        }))
    } else {
        Ok(None)
    }
}

pub fn upsert_project(project: &Project) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO projects (id, name, path, project_type, languages, frameworks, has_git, git_branch, git_remote, preferred_ide, default_run_config_id, is_favorite, tags, last_opened, last_run, created_at, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
         ON CONFLICT(path) DO UPDATE SET
         name = excluded.name, project_type = excluded.project_type, languages = excluded.languages, frameworks = excluded.frameworks, has_git = excluded.has_git, git_branch = excluded.git_branch, git_remote = excluded.git_remote",
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
            serde_json::to_string(&project.source)?
        ],
    )?;
    Ok(())
}

pub fn delete_project(id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM projects WHERE id = ?", [id])?;
    Ok(())
}

pub fn get_services(project_id: &str) -> Result<Vec<Service>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, path, service_type, languages, frameworks, is_runnable, created_at FROM services WHERE project_id = ?"
    )?;

    let services = stmt.query_map([project_id], |row| {
        Ok(Service {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            path: row.get(3)?,
            service_type: row.get(4)?,
            languages: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            frameworks: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
            is_runnable: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;

    let mut result = Vec::new();
    for s in services {
        result.push(s?);
    }
    Ok(result)
}

pub fn upsert_service(service: &Service) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO services (id, project_id, name, path, service_type, languages, frameworks, is_runnable, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, path = excluded.path, service_type = excluded.service_type, languages = excluded.languages, frameworks = excluded.frameworks, is_runnable = excluded.is_runnable",
        rusqlite::params![
            &service.id,
            &service.project_id,
            &service.name,
            &service.path,
            &service.service_type,
            serde_json::to_string(&service.languages)?,
            serde_json::to_string(&service.frameworks)?,
            service.is_runnable,
            &service.created_at
        ]
    )?;
    Ok(())
}

pub fn delete_service(id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM services WHERE id = ?", [id])?;
    Ok(())
}

pub fn get_scan_roots() -> Result<Vec<ScanRoot>> {
    let conn = get_connection()?;
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

pub fn add_scan_root(root: &ScanRoot) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT OR IGNORE INTO scan_roots (id, path, enabled, created_at) VALUES (?1, ?2, ?3, ?4)",
        (&root.id, &root.path, root.enabled, &root.created_at),
    )?;
    Ok(())
}

pub fn remove_scan_root(id: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM scan_roots WHERE id = ?", [id])?;
    Ok(())
}

pub fn get_run_configs(project_id: &str) -> Result<Vec<RunConfiguration>> {
    let conn = get_connection()?;
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

pub fn get_run_config(id: &str) -> Result<RunConfiguration> {
    let conn = get_connection()?;
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

pub fn save_run_config(config: &RunConfiguration) -> Result<()> {
    let conn = get_connection()?;
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

pub fn get_run_groups(project_id: &str) -> Result<Vec<RunGroup>> {
    let conn = get_connection()?;
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

pub fn update_last_run(project_id: &str) -> Result<()> {
    let conn = get_connection()?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET last_run = ? WHERE id = ?",
        (&now, project_id),
    )?;
    Ok(())
}
