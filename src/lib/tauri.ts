import { invoke } from '@tauri-apps/api/core';
import type {
  Project, ScanRoot, GitStatus, GitBranchInfo, GitFileDiff, GitInstalledInfo, DetectedIde, RunConfiguration,
  ProcessInfo, OutputLine, AppSettings, Service, RunGroup, DetectedRunConfig, ProjectInspection, ProjectScript,
  ScriptDetectionMetrics
} from '../types';

export const tauriApi = {
  getProjects: () => invoke<Project[]>('get_projects'),
  getProject: (id: string) => invoke<Project>('get_project', { id }),
  inspectProjectPath: (path: string) => invoke<ProjectInspection>('inspect_project_path', { path }),
  importProject: (path: string) => invoke<Project>('import_project', { path }),
  removeProject: (id: string) => invoke<void>('remove_project', { id }),
  scanProjects: () => invoke<Project[]>('scan_projects'),
  toggleFavorite: (id: string) => invoke<boolean>('toggle_favorite', { id }),
  updateProject: (project: Project) => invoke<void>('update_project', { project }),
  updateProjectTags: (id: string, tags: string[]) => invoke<void>('update_project_tags', { id, tags }),
  setProjectIde: (projectId: string, ideId: string) => invoke<void>('set_project_ide', { projectId: projectId, ideId: ideId }),
  searchProjects: (query: string) => invoke<Project[]>('search_projects', { query }),

  getProjectServices: (projectId: string) => invoke<Service[]>('get_project_services', { projectId: projectId }),

  getScanRoots: () => invoke<ScanRoot[]>('get_scan_roots'),
  addScanRoot: (path: string) => invoke<ScanRoot>('add_scan_root', { path }),
  removeScanRoot: (id: string) => invoke<void>('remove_scan_root', { id }),
  rescanRoot: (id: string) => invoke<void>('rescan_root', { id }),
  getScanStatus: () => invoke<Record<string, import('../types').ScanProgress>>('get_scan_status'),

  getGitStatus: (projectPath: string) => invoke<GitStatus>('get_git_status', { projectPath: projectPath }),
  getGitBranches: (projectPath: string) => invoke<GitBranchInfo[]>('get_git_branches', { projectPath: projectPath }),
  getFileDiff: (projectPath: string, filePath: string, staged: boolean) => invoke<GitFileDiff>('get_file_diff', { projectPath: projectPath, filePath: filePath, staged }),
  gitFetch: (projectPath: string) => invoke<string>('git_fetch', { projectPath: projectPath }),
  gitPull: (projectPath: string) => invoke<string>('git_pull', { projectPath: projectPath }),
  gitCheckoutBranch: (projectPath: string, branchName: string) => invoke<void>('git_checkout_branch', { projectPath: projectPath, branchName: branchName }),
  gitCreateBranch: (projectPath: string, branchName: string) => invoke<void>('git_create_branch', { projectPath: projectPath, branchName: branchName }),
  detectGit: () => invoke<GitInstalledInfo>('detect_git'),
  gitStageFile: (projectPath: string, filePath: string) => invoke<void>('git_stage_file', { projectPath, filePath }),
  gitStageAll: (projectPath: string) => invoke<void>('git_stage_all', { projectPath }),
  gitUnstageFile: (projectPath: string, filePath: string) => invoke<void>('git_unstage_file', { projectPath, filePath }),
  gitCommit: (projectPath: string, message: string) => invoke<string>('git_commit', { projectPath, message }),
  gitPush: (projectPath: string) => invoke<string>('git_push', { projectPath }),

  detectIdes: () => invoke<DetectedIde[]>('detect_ides'),
  openInIde: (command: string, projectPath: string) => invoke<void>('open_in_ide', { command, projectPath: projectPath }),
  openFolder: (path: string) => invoke<void>('open_folder', { path }),
  openTerminal: (path: string) => invoke<void>('open_terminal', { path }),
  getDefaultIde: () => invoke<string | null>('get_default_ide'),
  setDefaultIde: (ideId: string) => invoke<void>('set_default_ide', { ideId: ideId }),

  getRunConfigs: (projectId: string) => invoke<RunConfiguration[]>('get_run_configs', { projectId: projectId }),
  detectRunConfigs: (projectPath: string) => invoke<DetectedRunConfig[]>('detect_run_configs', { projectPath: projectPath }),
  detectProjectScripts: (projectPath: string, projectId?: string) => invoke<ProjectScript[]>('detect_project_scripts', { projectPath, projectId }),
  inspectScriptDetection: (projectPath: string, projectId?: string) =>
    invoke<[ProjectScript[], ScriptDetectionMetrics]>('inspect_script_detection', { projectPath, projectId }),
  getOrCreateScriptRunConfig: (projectId: string, scriptRelativePath: string) =>
    invoke<RunConfiguration>('get_or_create_script_run_config', { projectId, scriptRelativePath }),
  saveRunConfig: (config: RunConfiguration) => invoke<void>('save_run_config', { config }),
  deleteRunConfig: (id: string) => invoke<void>('delete_run_config', { id }),
  trustRunConfig: (id: string) => invoke<void>('trust_run_config', { id }),
  setDefaultRunConfig: (projectId: string, configId: string) => invoke<void>('set_default_run_config', { projectId: projectId, configId: configId }),

  getRunGroups: (projectId: string) => invoke<RunGroup[]>('get_run_groups', { projectId: projectId }),
  saveRunGroup: (group: RunGroup) => invoke<void>('save_run_group', { group }),
  deleteRunGroup: (id: string) => invoke<void>('delete_run_group', { id }),
  startRunGroup: (groupId: string) => invoke<string[]>('start_run_group', { groupId: groupId }),
  stopRunGroup: (groupId: string) => invoke<void>('stop_run_group', { groupId: groupId }),

  startProcess: (runConfigId: string) => invoke<ProcessInfo>('start_process', { runConfigId: runConfigId }),
  runUntrustedOnce: (runConfigId: string) => invoke<ProcessInfo>('run_untrusted_once', { runConfigId: runConfigId }),
  stopProcess: (processId: string) => invoke<void>('stop_process', { processId: processId }),
  restartProcess: (processId: string) => invoke<void>('restart_process', { processId: processId }),
  getProcesses: () => invoke<ProcessInfo[]>('get_processes'),
  getProcessOutput: (processId: string, sinceLine: number) => invoke<OutputLine[]>('get_process_output', { processId: processId, sinceLine: sinceLine }),
  clearProcessOutput: (processId: string) => invoke<void>('clear_process_output', { processId: processId }),

  createPtySession: (projectPath: string, cols: number, rows: number) => invoke<string>('create_pty_session', { projectPath: projectPath, cols, rows }),
  writePtySession: (sessionId: string, data: string) => invoke<void>('write_pty_session', { sessionId: sessionId, data }),
  resizePtySession: (sessionId: string, cols: number, rows: number) => invoke<void>('resize_pty_session', { sessionId: sessionId, cols, rows }),
  closePtySession: (sessionId: string) => invoke<void>('close_pty_session', { sessionId: sessionId }),

  getSettings: () => invoke<AppSettings>('get_settings'),
  updateSetting: (key: string, value: string) => invoke<void>('update_setting', { key, value }),
};
