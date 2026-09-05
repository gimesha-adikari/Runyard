use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProjectSource {
    Discovered,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub project_type: Option<String>,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,
    pub has_git: bool,
    pub git_branch: Option<String>,
    pub git_remote: Option<String>,
    pub preferred_ide: Option<String>,
    pub default_run_config_id: Option<String>,
    pub is_favorite: bool,
    pub tags: Vec<String>,
    pub last_opened: Option<String>,
    pub last_run: Option<String>,
    pub created_at: String,
    pub source: ProjectSource,
    pub parent_project_id: Option<String>,
    pub is_runnable: bool,
    #[serde(default)]
    pub is_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ServiceSource {
    Detected,
    Manual,
}

impl Default for ServiceSource {
    fn default() -> Self {
        ServiceSource::Detected
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Service {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub path: String,
    pub service_type: Option<String>,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,
    pub is_runnable: bool,
    #[serde(default)]
    pub source: ServiceSource,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ScriptKind {
    DevelopmentServer,
    ApplicationStart,
    MultiServiceLauncher,
    InfrastructureTask,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ScriptConfidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ScriptExecutionMode {
    Background,
    TerminalRequired,
}

impl Default for ScriptExecutionMode {
    fn default() -> Self {
        ScriptExecutionMode::Background
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectScript {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub relative_path: String,
    pub command: String,
    pub script_kind: ScriptKind,
    pub confidence: ScriptConfidence,
    #[serde(default)]
    pub execution_mode: ScriptExecutionMode,
    pub evidence: Vec<String>,
    pub is_trusted: bool,
    #[serde(default)]
    pub trusted_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRoot {
    pub id: String,
    pub path: String,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: Option<String>,
    pub remote_url: Option<String>,
    pub is_clean: bool,
    pub modified_files: Vec<String>,
    pub untracked_files: Vec<String>,
    pub staged_files: Vec<String>,
    pub ahead: u32,
    pub behind: u32,
    pub recent_commits: Vec<GitCommit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileDiff {
    pub path: String,
    pub diff: String,
    pub is_staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitInstalledInfo {
    pub is_installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedIde {
    pub id: String,
    pub name: String,
    pub command: String,
    pub icon: Option<String>,
    pub installed_via: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunConfiguration {
    pub id: String,
    pub project_id: String,
    pub service_id: Option<String>,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
    pub env_file: Option<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
    pub is_trusted: bool,
    #[serde(default)]
    pub trusted_fingerprint: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    pub source: RunConfigSource,
    pub created_at: String,
}

impl RunConfiguration {
    pub fn extract_script_candidate_token(&self) -> Option<String> {
        let cmd = self.command.trim();
        if cmd.is_empty() {
            return None;
        }

        // Case 1: Direct script reference (starts with ./ or has script extension)
        let is_script_ext = |s: &str| {
            let lower = s.to_lowercase();
            lower.ends_with(".sh")
                || lower.ends_with(".bash")
                || lower.ends_with(".zsh")
                || lower.ends_with(".py")
                || lower.ends_with(".js")
                || lower.ends_with(".mjs")
                || lower.ends_with(".cjs")
                || lower.ends_with(".ts")
        };

        let words: Vec<&str> = cmd.split_whitespace().collect();
        if words.is_empty() {
            return None;
        }

        let is_interpreter = |w: &str| {
            matches!(
                w.to_lowercase().as_str(),
                "bash" | "sh" | "zsh" | "python" | "python3" | "node" | "ts-node" | "deno" | "bun"
            )
        };

        if words.len() >= 2 && is_interpreter(words[0]) {
            let target = words[1];
            if target.starts_with("./") || is_script_ext(target) {
                return Some(target.to_string());
            }
        }

        if words.len() == 1 && is_interpreter(words[0]) && !self.args.is_empty() {
            let first_arg = &self.args[0];
            if first_arg.starts_with("./") || is_script_ext(first_arg) {
                return Some(first_arg.to_string());
            }
        }

        if words[0].starts_with("./") || is_script_ext(words[0]) {
            return Some(words[0].to_string());
        }

        None
    }

    pub fn resolve_script_path(
        &self,
        base_dir: Option<&std::path::Path>,
    ) -> Result<Option<std::path::PathBuf>, &'static str> {
        let candidate_token = match self.extract_script_candidate_token() {
            Some(t) => t,
            None => return Ok(None),
        };

        let base = match base_dir {
            Some(b) => b,
            None => return Err("Base directory not provided for script resolution"),
        };

        // Reject path traversal via parent directory components
        let candidate_path = std::path::Path::new(&candidate_token);
        for comp in candidate_path.components() {
            if matches!(comp, std::path::Component::ParentDir) {
                return Err("Path traversal rejected");
            }
        }

        let target_full = if candidate_path.is_absolute() {
            candidate_path.to_path_buf()
        } else {
            base.join(candidate_path)
        };

        if !target_full.exists() || !target_full.is_file() {
            return Err("Script file does not exist");
        }

        let canonical_base = base.canonicalize().map_err(|_| "Invalid base directory")?;
        let canonical_target = target_full
            .canonicalize()
            .map_err(|_| "Cannot canonicalize script target")?;

        if !canonical_target.starts_with(&canonical_base) {
            return Err("Script target escapes project root");
        }

        Ok(Some(canonical_target))
    }

    pub fn compute_fingerprint(&self) -> String {
        let base = self.working_dir.as_deref().map(std::path::Path::new);
        self.compute_fingerprint_with_base(base)
    }

    pub fn compute_fingerprint_with_base(&self, base_dir: Option<&std::path::Path>) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(self.command.trim().as_bytes());
        hasher.update(b"\0");
        for arg in &self.args {
            hasher.update(arg.as_bytes());
            hasher.update(b"\0");
        }
        if let Some(ref wd) = self.working_dir {
            hasher.update(wd.trim().as_bytes());
        }
        hasher.update(b"\0");
        if let Some(ref ef) = self.env_file {
            hasher.update(ef.trim().as_bytes());
        }
        hasher.update(b"\0");
        let mut sorted_keys: Vec<&String> = self.env_vars.keys().collect();
        sorted_keys.sort();
        for k in sorted_keys {
            hasher.update(k.as_bytes());
            hasher.update(b"=");
            if let Some(val) = self.env_vars.get(k) {
                hasher.update(val.as_bytes());
            }
            hasher.update(b"\0");
        }

        // Bind trust to executable script content bytes when targeting a script
        match self.resolve_script_path(base_dir) {
            Ok(Some(script_path)) => match std::fs::read(&script_path) {
                Ok(bytes) => {
                    let script_hash = format!("{:x}", Sha256::digest(&bytes));
                    hasher.update(b"\0script_content_sha256=");
                    hasher.update(script_hash.as_bytes());
                }
                Err(_) => {
                    hasher.update(b"\0script_read_error");
                }
            },
            Err(reason) => {
                hasher.update(b"\0script_resolution_error=");
                hasher.update(reason.as_bytes());
            }
            Ok(None) => {}
        }

        format!("{:x}", hasher.finalize())
    }

    pub fn is_trust_valid(&self) -> bool {
        let base = self.working_dir.as_deref().map(std::path::Path::new);
        self.is_trust_valid_with_base(base)
    }

    pub fn is_trust_valid_with_base(&self, base_dir: Option<&std::path::Path>) -> bool {
        if !self.is_trusted {
            return false;
        }
        match &self.trusted_fingerprint {
            Some(expected) => expected == &self.compute_fingerprint_with_base(base_dir),
            None => false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RunConfigSource {
    Detected,
    UserCreated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunGroup {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub member_config_ids: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub id: String,
    pub project_id: String,
    pub service_id: Option<String>,
    pub run_config_id: String,
    pub run_config_name: String,
    pub pid: Option<u32>,
    pub status: ProcessStatus,
    pub started_at: String,
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub pty_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProcessStatus {
    Running,
    Stopped,
    Failed,
    Starting,
    Stopping,
    Exited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub default_ide: Option<String>,
    pub scan_roots: Vec<ScanRoot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedProject {
    pub path: String,
    pub signals: Vec<String>,
    pub has_git: bool,
    pub services: Vec<ScannedService>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedService {
    pub name: String,
    pub relative_path: String,
    pub service_type: Option<String>,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedRunConfig {
    pub service_id: Option<String>,
    pub service_name: Option<String>,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
    pub source_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInspection {
    pub project: Project,
    pub services: Vec<Service>,
    pub run_configs: Vec<DetectedRunConfig>,
    pub git_status: Option<GitStatus>,
    pub already_imported: bool,
}
