export interface Project {
  id: string;
  name: string;
  path: string;
  project_type: string | null;
  parent_project_id: string | null;
  is_runnable: boolean;
  languages: string[];
  frameworks: string[];
  has_git: boolean;
  git_branch: string | null;
  git_remote: string | null;
  preferred_ide: string | null;
  default_run_config_id: string | null;
  is_favorite: boolean;
  tags: string[];
  last_opened: string | null;
  last_run: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  project_id: string;
  name: string;
  path: string;
  service_type: string | null;
  languages: string[];
  frameworks: string[];
  is_runnable: boolean;
  created_at: string;
}

export interface ScanRoot {
  id: string;
  path: string;
  enabled: boolean;
  created_at: string;
}

export interface GitStatus {
  branch: string | null;
  remote_url: string | null;
  is_clean: boolean;
  modified_files: string[];
  untracked_files: string[];
  staged_files: string[];
  ahead: number;
  behind: number;
  recent_commits: GitCommit[];
}

export interface GitCommit {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitBranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

export interface GitFileDiff {
  path: string;
  diff: string;
  is_staged: boolean;
}

export interface DetectedIde {
  id: string;
  name: string;
  command: string;
  icon: string | null;
  installed_via: string;
}

export interface RunConfiguration {
  id: string;
  project_id: string;
  service_id: string | null;
  name: string;
  command: string;
  args: string[];
  working_dir: string | null;
  env_file: string | null;
  env_vars: Record<string, string>;
  is_trusted: boolean;
  trusted_fingerprint: string | null;
  is_default: boolean;
  source: 'Detected' | 'UserCreated';
  created_at: string;
}

export interface RunGroup {
  id: string;
  project_id: string;
  name: string;
  member_config_ids: string[];
  created_at: string;
}

export type ProcessStatus = 'Running' | 'Stopped' | 'Failed' | 'Starting' | 'Stopping' | 'Exited';

export interface ProcessInfo {
  id: string;
  project_id: string;
  service_id: string | null;
  run_config_id: string;
  run_config_name: string;
  pid: number | null;
  status: ProcessStatus;
  started_at: string;
  exit_code: number | null;
}

export interface OutputLine {
  timestamp: string;
  stream: 'stdout' | 'stderr';
  content: string;
}

export interface AppSettings {
  default_ide: string | null;
  scan_roots: ScanRoot[];
}

export interface DetectedRunConfig {
  service_id: string | null;
  service_name: string | null;
  name: string;
  command: string;
  args: string[];
  working_dir: string | null;
  source_file: string;
}

export interface ProjectInspection {
  project: Project;
  services: Service[];
  run_configs: DetectedRunConfig[];
  git_status: GitStatus | null;
  already_imported: boolean;
}
