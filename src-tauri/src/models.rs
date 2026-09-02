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
    pub created_at: String,
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
    pub fn compute_fingerprint(&self) -> String {
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
        format!("{:x}", hasher.finalize())
    }

    pub fn is_trust_valid(&self) -> bool {
        if !self.is_trusted {
            return false;
        }
        match &self.trusted_fingerprint {
            Some(expected) => expected == &self.compute_fingerprint(),
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
