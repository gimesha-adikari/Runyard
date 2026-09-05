import { useState, useEffect, useMemo } from 'react';
import { useProject, useProjects, useProjectServices, useProjectScripts, useSetProjectIde } from '../hooks/use-projects';
import { useRunConfigs, useSaveRunConfig } from '../hooks/use-run-configs';
import { useSettings } from '../hooks/use-settings';
import { useProcesses, useStartProcess, useStopProcess } from '../hooks/use-processes';
import { useGitStatus } from '../hooks/use-git';
import { useUiStore } from '../stores/ui-store';
import { tauriApi } from '../lib/tauri';
import {
  ExternalLink,
  Terminal,
  FolderOpen,
  Play,
  Square,
  RotateCw,
  ChevronDown,
  Check,
  Search,
  Plus,
  MoreHorizontal,
  GitCommit,
  Code2,
} from 'lucide-react';
import { toast } from '../stores/toast-store';
import { RunConfigModal } from './RunConfigModal';
import { RunConfigRow } from './RunConfigRow';
import { ProjectScriptRow } from './ProjectScriptRow';
import { CustomMenu, MenuItem } from './common/CustomMenu';
import { useQueryClient } from '@tanstack/react-query';
import { DetectedIde, RunConfiguration, Service, Project } from '../types';
import { formatElapsedDuration, cn } from '../lib/utils';

interface ProjectWorkspaceProps {
  projectId: string;
}

export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const { data: project, isLoading: pLoading } = useProject(projectId);

  if (pLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-xs font-mono">
        Loading workspace...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-xs font-mono">
        Project not found
      </div>
    );
  }

  return <LoadedProjectWorkspace key={project.id} project={project} />;
}

interface LoadedProjectWorkspaceProps {
  project: Project;
}

function LoadedProjectWorkspace({ project }: LoadedProjectWorkspaceProps) {
  const { data: allProjects = [] } = useProjects();
  const { setActiveProjectId } = useUiStore();

  const ancestors = useMemo(() => {
    const list: Project[] = [];
    let cur = project;
    while (cur.parent_project_id) {
      const parent = allProjects.find((p) => p.id === cur.parent_project_id);
      if (!parent) break;
      list.unshift(parent);
      cur = parent;
    }
    return list;
  }, [project, allProjects]);

  const parentProject = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;

  const { data: services } = useProjectServices(project.id);
  const { data: projectScripts = [] } = useProjectScripts(project.path, project.id);
  const { data: directRunConfigs = [] } = useRunConfigs(project.id);
  const { data: parentRunConfigs = [] } = useRunConfigs(parentProject?.id || '');

  const { scopedConfigs, monorepoConfigs } = useMemo(() => {
    if (!parentProject) {
      return {
        scopedConfigs: directRunConfigs,
        monorepoConfigs: [],
      };
    }

    // 1. Direct configs owned by this project (project_id is authoritative)
    const scoped: RunConfiguration[] = [...directRunConfigs];

    // 2. Legacy fallback: ONLY if child project has NO direct configs in the database,
    // infer configs from parent where working_dir explicitly matches the child path
    if (scoped.length === 0) {
      for (const cfg of parentRunConfigs) {
        const workingDir = cfg.working_dir || '';
        if (
          workingDir === project.path ||
          workingDir.startsWith(project.path + '/') ||
          workingDir.startsWith(project.path + '\\')
        ) {
          if (!scoped.some((c) => c.id === cfg.id)) {
            scoped.push(cfg);
          }
        }
      }
    }

    // 3. Monorepo / Repository Configurations
    // Configs owned by parentProject running at root, never duplicating any scoped config
    const monorepo: RunConfiguration[] = [];
    for (const cfg of parentRunConfigs) {
      const workingDir = cfg.working_dir || '';
      if (
        (workingDir === parentProject.path || !workingDir) &&
        !cfg.service_id &&
        !scoped.some((c) => c.id === cfg.id)
      ) {
        monorepo.push(cfg);
      }
    }

    return {
      scopedConfigs: scoped,
      monorepoConfigs: monorepo,
    };
  }, [directRunConfigs, parentRunConfigs, parentProject, project.path]);

  const { data: processes } = useProcesses();
  const startProcess = useStartProcess();
  const stopProcess = useStopProcess();
  const setProjectIde = useSetProjectIde();
  const saveRunConfig = useSaveRunConfig();
  const { data: settings } = useSettings();
  const { gitPaneCollapsed, setGitPaneCollapsed } = useUiStore();
  const queryClient = useQueryClient();

  const { data: gitStatus } = useGitStatus(project.path);
  const gitChangesCount = useMemo(() => {
    if (!gitStatus || gitStatus.is_clean) return 0;
    return (
      (gitStatus.staged_files?.length || 0) +
      (gitStatus.modified_files?.length || 0) +
      (gitStatus.untracked_files?.length || 0)
    );
  }, [gitStatus]);
  const isGitClean = !gitStatus || gitStatus.is_clean || gitChangesCount === 0;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<RunConfiguration | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedIdes, setDetectedIdes] = useState<DetectedIde[]>([]);

  useEffect(() => {
    tauriApi.detectIdes().then((ides) => setDetectedIdes(ides)).catch(() => {});
  }, []);

  const preferredIde =
    detectedIdes.find((i) => i.id === project.preferred_ide) ||
    (parentProject ? detectedIdes.find((i) => i.id === parentProject.preferred_ide) : null) ||
    detectedIdes.find((i) => i.id === settings?.default_ide) ||
    detectedIdes[0];

  const handleOpenFolder = async () => {
    try {
      await tauriApi.openFolder(project.path);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to open directory');
    }
  };

  const handleOpenTerminal = async () => {
    try {
      await tauriApi.openTerminal(project.path);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to open terminal');
    }
  };

  const handleOpenIde = async (ide: DetectedIde) => {
    try {
      await tauriApi.openInIde(ide.command, project.path);
      toast.success(`Opening ${project.name} in ${ide.name}...`);
    } catch (e: any) {
      toast.error(e?.message || `Failed to open ${ide.name}`);
    }
  };

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      const detected = await tauriApi.detectRunConfigs(project.path);
      if (detected.length === 0) {
        toast.info('No new run configurations found');
        return;
      }
      let count = 0;
      for (const d of detected) {
        const config: RunConfiguration = {
          id: crypto.randomUUID(),
          project_id: project.id,
          service_id: d.service_id || null,
          name: d.name,
          command: d.command,
          args: d.args,
          working_dir: d.working_dir,
          env_file: null,
          env_vars: {},
          is_trusted: false,
          trusted_fingerprint: null,
          is_default: false,
          source: 'Detected',
          created_at: new Date().toISOString(),
        };
        await tauriApi.saveRunConfig(config);
        count++;
      }
      queryClient.invalidateQueries({ queryKey: ['runConfigs', project.id] });
      if (parentProject) {
        queryClient.invalidateQueries({ queryKey: ['runConfigs', parentProject.id] });
      }
      toast.success(`Discovered ${count} run configurations`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to auto-detect run configurations');
    } finally {
      setIsDetecting(false);
    }
  };

  const ideMenuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [{ type: 'header', label: 'OPEN WITH' }];

    if (detectedIdes.length === 0) {
      items.push({
        id: 'no-ide',
        label: 'No IDEs detected',
        disabled: true,
        onSelect: () => {},
      });
    } else {
      detectedIdes.forEach((ide) => {
        items.push({
          id: ide.id,
          label: ide.name,
          icon: <Code2 className="w-3.5 h-3.5 text-zinc-400" />,
          isSelected: preferredIde?.id === ide.id,
          onSelect: () => handleOpenIde(ide),
        });
      });
    }

    if (preferredIde) {
      items.push({ type: 'separator' });
      items.push({
        id: 'set-preferred',
        label: `Set ${preferredIde.name} as preferred`,
        icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
        onSelect: async () => {
          try {
            await setProjectIde.mutateAsync({
              projectId: project.id,
              ideId: preferredIde.id,
            });
            toast.success(`Set ${preferredIde.name} as preferred`);
          } catch {
            toast.error('Failed to update project preference');
          }
        },
      });
    }

    return items;
  }, [detectedIdes, preferredIde, project.id, setProjectIde]);

  const moreMenuItems: MenuItem[] = useMemo(
    () => [
      {
        id: 'open-terminal',
        label: 'System Terminal',
        icon: <Terminal className="w-3.5 h-3.5 text-zinc-400" />,
        onSelect: handleOpenTerminal,
      },
      {
        id: 'open-folder',
        label: 'File Manager',
        icon: <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />,
        onSelect: handleOpenFolder,
      },
      { type: 'separator' },
      {
        id: 'auto-detect',
        label: 'Scan Run Configurations',
        icon: <RotateCw className="w-3.5 h-3.5 text-zinc-400" />,
        onSelect: handleAutoDetect,
      },
      {
        id: 'new-config',
        label: 'New Run Configuration',
        icon: <Plus className="w-3.5 h-3.5 text-emerald-400" />,
        onSelect: () => setShowCreateModal(true),
      },
    ],
    []
  );

  return (
    <>
      <div className="flex flex-col h-full bg-[#0a0a0c] text-zinc-300 select-none overflow-hidden">
        {/* Workspace Responsive Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 h-11 border-b border-[#1b1b20] shrink-0 bg-[#0c0c0e]">
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2 overflow-hidden">
            {/* Ancestor Breadcrumbs */}
            {ancestors.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0 text-xs font-mono text-zinc-500">
                {ancestors.map((anc) => (
                  <span key={anc.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveProjectId(anc.id)}
                      className="hover:text-emerald-400 text-zinc-400 transition-colors truncate max-w-[140px] focus:outline-none cursor-pointer"
                      title={`Switch to parent project: ${anc.name}`}
                    >
                      {anc.name}
                    </button>
                    <span className="text-zinc-600 select-none">/</span>
                  </span>
                ))}
              </div>
            )}

            <h1 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5 shrink-0">
              <span className="truncate max-w-[200px]">{project.name}</span>
              <span className="text-purple-400 font-mono text-[11px] font-normal bg-purple-950/40 border border-purple-900/40 px-1.5 py-0.2 rounded-[2px] shrink-0">
                {project.git_branch || 'main'}
              </span>
            </h1>

            {/* Language & Framework Badges (collapses on narrow screens) */}
            <div className="hidden xl:flex items-center gap-1 ml-2 shrink-0">
              {project.languages.slice(0, 3).map((l) => (
                <span
                  key={l}
                  className="px-1.5 py-0.2 rounded-[2px] text-[9px] font-mono uppercase tracking-wider font-medium bg-[#141418] border border-zinc-800/80 text-zinc-400"
                >
                  {l}
                </span>
              ))}
              {project.frameworks.slice(0, 2).map((f) => (
                <span
                  key={f}
                  className="px-1.5 py-0.2 rounded-[2px] text-[9px] font-mono uppercase tracking-wider font-medium bg-[#141418] border border-zinc-800/80 text-zinc-400"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Open in IDE Split Button with CustomMenu */}
            {preferredIde ? (
              <div className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenIde(preferredIde)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[#141418] hover:bg-[#1c1c22] text-zinc-200 text-xs font-medium rounded-l-[3px] btn-tactile transition-colors duration-fast border border-zinc-800 border-r-0 whitespace-nowrap"
                  title={`Open in ${preferredIde.name}`}
                >
                  <ExternalLink className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="hidden md:inline">Open in {preferredIde.name}</span>
                  <span className="md:hidden">IDE</span>
                </button>

                <CustomMenu
                  items={ideMenuItems}
                  align="right"
                  minWidth={190}
                  trigger={
                    <button
                      type="button"
                      className="px-1.5 py-1 bg-[#141418] hover:bg-[#1c1c22] text-zinc-400 hover:text-zinc-200 text-xs rounded-r-[3px] btn-tactile transition-colors duration-fast border border-zinc-800 h-full flex items-center justify-center shrink-0 focus:outline-none"
                      title="Choose IDE or editor"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  }
                />
              </div>
            ) : (
              <button
                disabled
                className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 text-zinc-600 text-xs font-medium rounded-[3px] border border-zinc-800 cursor-not-allowed whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in IDE</span>
              </button>
            )}

            {/* Persistent Git Button */}
            {project.has_git && (
              <button
                type="button"
                onClick={() => setGitPaneCollapsed(!gitPaneCollapsed)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-[3px] text-xs font-mono btn-tactile transition-colors duration-fast border select-none shrink-0',
                  !gitPaneCollapsed
                    ? 'bg-purple-950/60 border-purple-800/60 text-purple-300'
                    : 'bg-[#141418] hover:bg-[#1c1c22] border-zinc-800 hover:border-zinc-700 text-zinc-300'
                )}
                title={
                  isGitClean
                    ? 'Git: Working tree clean (Click to toggle Changes)'
                    : `Git: ${gitChangesCount} uncommitted change${gitChangesCount === 1 ? '' : 's'} (Click to toggle Changes)`
                }
              >
                <GitCommit className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Git</span>
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    isGitClean ? 'bg-emerald-500' : 'bg-amber-400'
                  )}
                />
                {gitChangesCount > 0 && (
                  <span className="text-[10px] text-zinc-400 font-normal">{gitChangesCount}</span>
                )}
              </button>
            )}

            {/* Terminal & Folder Actions (Direct on >= lg screens) */}
            <div className="hidden lg:flex items-center gap-1">
              <button
                type="button"
                onClick={handleOpenTerminal}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#141418] border border-transparent hover:border-zinc-800 rounded-[3px] btn-tactile transition-colors duration-fast"
                title="Open System Terminal"
              >
                <Terminal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleOpenFolder}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#141418] border border-transparent hover:border-zinc-800 rounded-[3px] btn-tactile transition-colors duration-fast"
                title="Open in File Manager"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Overflow More Menu with CustomMenu */}
            <CustomMenu
              items={moreMenuItems}
              align="right"
              minWidth={180}
              trigger={
                <button
                  type="button"
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#141418] border border-zinc-800/80 rounded-[3px] btn-tactile transition-colors duration-fast focus:outline-none shrink-0"
                  title="More actions"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              }
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#0a0a0c]">
          {/* Services Overview Dense Table */}
          {services && services.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                  Services Overview
                </h2>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {services.length} services
                </span>
              </div>

              <div className="border border-border-card rounded-[4px] bg-[#0c0c0e] overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#121216] border-b border-border-card text-zinc-400 text-[11px] font-mono">
                    <tr>
                      <th className="px-3.5 py-2 font-medium">Service</th>
                      <th className="px-3.5 py-2 font-medium hidden sm:table-cell">PID</th>
                      <th className="px-3.5 py-2 font-medium">Runtime</th>
                      <th className="px-3.5 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-card">
                    {services.map((svc: Service) => {
                      const svcConfigs = scopedConfigs?.filter((c) => c.service_id === svc.id) || [];
                      const svcProc = processes?.find(
                        (p) =>
                          svcConfigs.some((c) => c.id === p.run_config_id) &&
                          (p.status === 'Running' || p.status === 'Starting')
                      );
                      const isRunning = !!svcProc;

                      const handleServiceToggle = async () => {
                        if (isRunning && svcProc) {
                          try {
                            await stopProcess.mutateAsync(svcProc.id);
                          } catch {
                            toast.error('Failed to stop service');
                          }
                        } else {
                          const primaryConfig =
                            svcConfigs.find((c) => c.is_default) || svcConfigs[0];
                          if (primaryConfig) {
                            try {
                              const proc = await startProcess.mutateAsync(primaryConfig.id);
                              useUiStore.getState().setSelectedProcessIdForLogs(proc.id);
                            } catch {
                              toast.error('Failed to start service');
                            }
                          } else {
                            toast.info(`No run configurations configured for ${svc.name}`);
                          }
                        }
                      };

                      const matchingSubproject = allProjects.find(
                        (p) => p.parent_project_id === project.id && (p.path === svc.path || p.name === svc.name)
                      );

                      return (
                        <tr
                          key={svc.id}
                          className="hover:bg-[#141418] transition-colors duration-fast group"
                        >
                          <td className="px-3.5 py-2.5 font-medium text-zinc-200">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full shrink-0',
                                  isRunning
                                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                                    : 'bg-zinc-600'
                                )}
                              />
                              {matchingSubproject ? (
                                <button
                                  type="button"
                                  onClick={() => setActiveProjectId(matchingSubproject.id)}
                                  className="font-mono text-xs hover:text-emerald-400 transition-colors text-left flex items-center gap-1.5 focus:outline-none cursor-pointer"
                                  title={`Open subproject workspace: ${matchingSubproject.name}`}
                                >
                                  <span>{svc.name}</span>
                                  <span className="text-[9px] text-purple-400/90 bg-purple-950/40 border border-purple-900/40 px-1 py-0.2 rounded-[2px] font-mono">
                                    Subproject
                                  </span>
                                </button>
                              ) : (
                                <span className="font-mono text-xs">{svc.name}</span>
                              )}
                              {svc.service_type && svc.service_type !== 'Unknown' && (
                                <span className="text-[9px] text-zinc-500 border border-zinc-800/80 px-1 rounded-[2px] font-mono">
                                  {svc.service_type}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-zinc-500 text-[11px] hidden sm:table-cell">
                            {svcProc?.pid || '—'}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-zinc-400 text-[11px]">
                            {isRunning && svcProc
                              ? formatElapsedDuration(svcProc.started_at)
                              : svc.languages[0] || '—'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isRunning && svcProc ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const proc = await startProcess.mutateAsync(svcProc.run_config_id);
                                        useUiStore.getState().setSelectedProcessIdForLogs(proc.id);
                                      } catch {
                                        toast.error('Restart failed');
                                      }
                                    }}
                                    className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-[2px] btn-tactile transition-colors duration-fast"
                                    title="Restart"
                                  >
                                    <RotateCw className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleServiceToggle}
                                    className="p-1 hover:bg-red-950/60 text-red-400 rounded-[2px] btn-tactile transition-colors duration-fast"
                                    title="Stop"
                                  >
                                    <Square className="w-3 h-3 fill-red-400/40" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleServiceToggle}
                                  className="p-1 hover:bg-emerald-950/60 text-emerald-400 rounded-[2px] btn-tactile transition-colors duration-fast"
                                  title="Start service"
                                >
                                  <Play className="w-3 h-3 fill-emerald-400/30 ml-0.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Project Scripts Section */}
          {projectScripts && projectScripts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    Project Scripts
                  </h2>
                  <span className="text-[9px] text-emerald-400/90 border border-emerald-900/50 bg-emerald-950/30 px-1.5 py-0.2 rounded-[2px] font-mono">
                    Auto-Discovered
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {projectScripts.length} script{projectScripts.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="border border-border-card rounded-[4px] bg-[#0c0c0e] divide-y divide-border-card overflow-hidden">
                {projectScripts.map((script) => (
                  <ProjectScriptRow
                    key={script.id}
                    script={script}
                    project={project}
                    scopedConfigs={scopedConfigs}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Run Configurations Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                Run Configurations
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAutoDetect}
                  disabled={isDetecting}
                  className="flex items-center gap-1 px-2 py-0.8 bg-[#141418] hover:bg-[#1c1c22] border border-zinc-800 rounded-[3px] text-[10px] text-zinc-300 font-mono btn-tactile transition-colors duration-fast disabled:opacity-50"
                  title="Auto-detect configurations"
                >
                  <Search className="w-2.5 h-2.5" />
                  <span>{isDetecting ? 'Detecting...' : 'Detect'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1 px-2 py-0.8 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 rounded-[3px] text-[10px] text-emerald-300 font-mono btn-tactile transition-colors duration-fast"
                  title="Create new configuration"
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span>New</span>
                </button>
              </div>
            </div>

            {scopedConfigs && scopedConfigs.length > 0 ? (
              <div className="border border-border-card rounded-[4px] bg-[#0c0c0e] divide-y divide-border-card overflow-hidden">
                {scopedConfigs.map((config) => (
                  <RunConfigRow
                    key={config.id}
                    config={config}
                    projectId={project.id}
                    onEdit={() => setEditingConfig(config)}
                    onDuplicate={async () => {
                      const dup: RunConfiguration = {
                        ...config,
                        id: crypto.randomUUID(),
                        name: `${config.name} (Copy)`,
                        is_default: false,
                        created_at: new Date().toISOString(),
                      };
                      await tauriApi.saveRunConfig(dup);
                      queryClient.invalidateQueries({
                        queryKey: ['runConfigs', project.id],
                      });
                      if (parentProject) {
                        queryClient.invalidateQueries({
                          queryKey: ['runConfigs', parentProject.id],
                        });
                      }
                      toast.success('Configuration duplicated');
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-zinc-800/80 rounded-[4px] p-6 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                <span>No run configurations defined yet.</span>
                <button
                  type="button"
                  onClick={handleAutoDetect}
                  className="px-3 py-1 bg-[#141418] hover:bg-[#1c1c22] border border-zinc-800 rounded-[3px] text-zinc-300 text-xs font-mono btn-tactile transition-colors duration-fast"
                >
                  Scan for Configurations
                </button>
              </div>
            )}
          </div>

          {/* Monorepo / Repository Configurations (if subproject and parent has root configs) */}
          {parentProject && monorepoConfigs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    Repository Configurations
                  </h2>
                  <span className="text-[9px] text-purple-400/90 border border-purple-900/50 bg-purple-950/30 px-1.5 py-0.2 rounded-[2px] font-mono">
                    Inherited from {parentProject.name}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {monorepoConfigs.length} config{monorepoConfigs.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="border border-border-card rounded-[4px] bg-[#0c0c0e] divide-y divide-border-card overflow-hidden">
                {monorepoConfigs.map((config) => (
                  <RunConfigRow
                    key={config.id}
                    config={config}
                    projectId={parentProject.id}
                    onEdit={() => setEditingConfig(config)}
                    onDuplicate={async () => {
                      const dup: RunConfiguration = {
                        ...config,
                        id: crypto.randomUUID(),
                        name: `${config.name} (Copy)`,
                        is_default: false,
                        created_at: new Date().toISOString(),
                      };
                      await tauriApi.saveRunConfig(dup);
                      queryClient.invalidateQueries({
                        queryKey: ['runConfigs', parentProject.id],
                      });
                      toast.success('Configuration duplicated');
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <RunConfigModal
          isOpen={showCreateModal}
          projectId={project.id}
          projectPath={project.path}
          services={services || []}
          onClose={() => setShowCreateModal(false)}
          onSave={async (config) => {
            try {
              await saveRunConfig.mutateAsync(config);
              queryClient.invalidateQueries({ queryKey: ['runConfigs', project.id] });
              if (parentProject) {
                queryClient.invalidateQueries({ queryKey: ['runConfigs', parentProject.id] });
              }
              setShowCreateModal(false);
              toast.success('Configuration saved');
            } catch (e: any) {
              toast.error(e?.message || 'Failed to save configuration');
            }
          }}
        />
      )}

      {editingConfig && (
        <RunConfigModal
          isOpen={true}
          projectId={project.id}
          projectPath={project.path}
          existingConfig={editingConfig}
          services={services || []}
          onClose={() => setEditingConfig(null)}
          onSave={async (config) => {
            try {
              await saveRunConfig.mutateAsync(config);
              queryClient.invalidateQueries({ queryKey: ['runConfigs', project.id] });
              if (parentProject) {
                queryClient.invalidateQueries({ queryKey: ['runConfigs', parentProject.id] });
              }
              setEditingConfig(null);
              toast.success('Configuration updated');
            } catch (e: any) {
              toast.error(e?.message || 'Failed to update configuration');
            }
          }}
        />
      )}
    </>
  );
}
