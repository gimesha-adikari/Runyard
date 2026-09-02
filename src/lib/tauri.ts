import { invoke } from '@tauri-apps/api/core';
import type {
  Project, ScanRoot, GitStatus, GitBranchInfo, GitFileDiff, DetectedIde, RunConfiguration,
  ProcessInfo, OutputLine, AppSettings, Service, RunGroup, DetectedRunConfig, ProjectInspection
} from '../types';

export const tauriApi = {
  getProjects: () => invoke<Project[]>('get_projects'),
  getProject: (id: string) => invoke<Project>('get_project', { id }),
  inspectProjectPath: (path: string) => invoke<ProjectInspection>('inspect_project_path', { path }),
  importProject: (path: string) => invoke<Project>('import_project', { path }),
  removeProject: (id: string) => invoke<void>('remove_project', { id }),
  scanProjects: () => invoke<Project[]>('scan_projects'),
  toggleFavorite: (id: string) => invoke<boolean>('toggle_favorite', { id }),
  updateProjectTags: (id: string, tags: string[]) => invoke<void>('update_project_tags', { id, tags }),
  setProjectIde: (projectId: string, ideId: string) => invoke<void>('set_project_ide', { project_id: projectId, ide_id: ideId }),
  searchProjects: (query: string) => invoke<Project[]>('search_projects', { query }),

  getProjectServices: (projectId: string) => invoke<Service[]>('get_project_services', { project_id: projectId }),

  getScanRoots: () => invoke<ScanRoot[]>('get_scan_roots'),
  addScanRoot: (path: string) => invoke<ScanRoot>('add_scan_root', { path }),
  removeScanRoot: (id: string) => invoke<void>('remove_scan_root', { id }),

  getGitStatus: (projectPath: string) => invoke<GitStatus>('get_git_status', { project_path: projectPath }),
  getGitBranches: (projectPath: string) => invoke<GitBranchInfo[]>('get_git_branches', { project_path: projectPath }),
  getFileDiff: (projectPath: string, filePath: string, staged: boolean) => invoke<GitFileDiff>('get_file_diff', { project_path: projectPath, file_path: filePath, staged }),
  gitFetch: (projectPath: string) => invoke<string>('git_fetch', { project_path: projectPath }),
  gitPull: (projectPath: string) => invoke<string>('git_pull', { project_path: projectPath }),
  gitCheckoutBranch: (projectPath: string, branchName: string) => invoke<void>('git_checkout_branch', { project_path: projectPath, branch_name: branchName }),
  gitCreateBranch: (projectPath: string, branchName: string) => invoke<void>('git_create_branch', { project_path: projectPath, branch_name: branchName }),

  detectIdes: () => invoke<DetectedIde[]>('detect_ides'),
  openInIde: (command: string, projectPath: string) => invoke<void>('open_in_ide', { command, project_path: projectPath }),
  openFolder: (path: string) => invoke<void>('open_folder', { path }),
  openTerminal: (path: string) => invoke<void>('open_terminal', { path }),
  getDefaultIde: () => invoke<string | null>('get_default_ide'),
  setDefaultIde: (ideId: string) => invoke<void>('set_default_ide', { ide_id: ideId }),

  getRunConfigs: (projectId: string) => invoke<RunConfiguration[]>('get_run_configs', { project_id: projectId }),
  detectRunConfigs: (projectPath: string) => invoke<DetectedRunConfig[]>('detect_run_configs', { project_path: projectPath }),
  saveRunConfig: (config: RunConfiguration) => invoke<void>('save_run_config', { config }),
  deleteRunConfig: (id: string) => invoke<void>('delete_run_config', { id }),
  trustRunConfig: (id: string) => invoke<void>('trust_run_config', { id }),
  setDefaultRunConfig: (projectId: string, configId: string) => invoke<void>('set_default_run_config', { project_id: projectId, config_id: configId }),

  getRunGroups: (projectId: string) => invoke<RunGroup[]>('get_run_groups', { project_id: projectId }),
  saveRunGroup: (group: RunGroup) => invoke<void>('save_run_group', { group }),
  deleteRunGroup: (id: string) => invoke<void>('delete_run_group', { id }),
  startRunGroup: (groupId: string) => invoke<string[]>('start_run_group', { group_id: groupId }),
  stopRunGroup: (groupId: string) => invoke<void>('stop_run_group', { group_id: groupId }),

  startProcess: (runConfigId: string) => invoke<string>('start_process', { run_config_id: runConfigId }),
  runUntrustedOnce: (runConfigId: string) => invoke<string>('run_untrusted_once', { run_config_id: runConfigId }),
  stopProcess: (processId: string) => invoke<void>('stop_process', { process_id: processId }),
  restartProcess: (processId: string) => invoke<void>('restart_process', { process_id: processId }),
  getProcesses: () => invoke<ProcessInfo[]>('get_processes'),
  getProcessOutput: (processId: string, sinceLine: number) => invoke<OutputLine[]>('get_process_output', { process_id: processId, since_line: sinceLine }),
  clearProcessOutput: (processId: string) => invoke<void>('clear_process_output', { process_id: processId }),

  createPtySession: (projectPath: string, cols: number, rows: number) => invoke<string>('create_pty_session', { project_path: projectPath, cols, rows }),
  writePtySession: (sessionId: string, data: string) => invoke<void>('write_pty_session', { session_id: sessionId, data }),
  resizePtySession: (sessionId: string, cols: number, rows: number) => invoke<void>('resize_pty_session', { session_id: sessionId, cols, rows }),
  closePtySession: (sessionId: string) => invoke<void>('close_pty_session', { session_id: sessionId }),

  getSettings: () => invoke<AppSettings>('get_settings'),
  updateSetting: (key: string, value: string) => invoke<void>('update_setting', { key, value }),
};
