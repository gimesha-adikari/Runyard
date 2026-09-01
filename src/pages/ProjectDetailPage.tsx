import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useProject,
  useToggleFavorite,
  useUpdateProjectTags,
  useSetProjectIde,
  useRemoveProject,
} from '../hooks/use-projects';
import { useProjectServices } from '../hooks/use-services';
import {
  useRunConfigs,
  useSaveRunConfig,
  useDeleteRunConfig,
  useTrustRunConfig,
  useSetDefaultRunConfig,
} from '../hooks/use-run-configs';
import {
  useRunGroups,
  useSaveRunGroup,
  useDeleteRunGroup,
  useStartRunGroup,
  useStopRunGroup,
} from '../hooks/use-run-groups';
import {
  useProcesses,
  useStartProcess,
  useStopProcess,
  useRestartProcess,
} from '../hooks/use-processes';
import { useDetectedIdes, useOpenInIde } from '../hooks/use-ides';
import { tauriApi } from '../lib/tauri';
import { toast } from '../stores/toast-store';
import { GitView } from '../components/GitView';
import { TerminalView } from '../components/TerminalView';
import { LogViewer } from '../components/LogViewer';
import { TrustDialog } from '../components/TrustDialog';
import { RunConfigModal } from '../components/RunConfigModal';
import { RunGroupModal } from '../components/RunGroupModal';
import { RunConfiguration, RunGroup } from '../types';
import {
  FolderOpen,
  Terminal,
  ExternalLink,
  Star,
  Play,
  Square,
  RotateCw,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Layers,
  GitBranch,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  Sparkles,
  Check,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '../lib/utils';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: project, isLoading: projectLoading } = useProject(id || '');
  const { data: services = [] } = useProjectServices(id || '');
  const { data: runConfigs = [], refetch: refetchRunConfigs } = useRunConfigs(id);
  const { data: runGroups = [] } = useRunGroups(id);
  const { data: processes = [] } = useProcesses();
  const { data: detectedIdes = [] } = useDetectedIdes();

  const toggleFavorite = useToggleFavorite();
  const updateTags = useUpdateProjectTags();
  const setProjectIde = useSetProjectIde();
  const removeProject = useRemoveProject();
  const openInIde = useOpenInIde();

  const saveRunConfig = useSaveRunConfig();
  const deleteRunConfig = useDeleteRunConfig();
  const trustRunConfig = useTrustRunConfig();
  const setDefaultRunConfig = useSetDefaultRunConfig();

  const saveRunGroup = useSaveRunGroup();
  const deleteRunGroup = useDeleteRunGroup();
  const startRunGroup = useStartRunGroup();
  const stopRunGroup = useStopRunGroup();

  const startProcess = useStartProcess();
  const stopProcess = useStopProcess();
  const restartProcess = useRestartProcess();

  // Modals & Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'runs' | 'git' | 'terminal' | 'logs'>('overview');
  const [untrustedConfig, setUntrustedConfig] = useState<RunConfiguration | null>(null);
  const [editingConfig, setEditingConfig] = useState<RunConfiguration | null | undefined>(undefined);
  const [editingGroup, setEditingGroup] = useState<RunGroup | null | undefined>(undefined);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [showIdeDropdown, setShowIdeDropdown] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Close IDE dropdown when clicking outside
  useEffect(() => {
    const handleDocClick = () => setShowIdeDropdown(false);
    if (showIdeDropdown) {
      document.addEventListener('click', handleDocClick);
      return () => document.removeEventListener('click', handleDocClick);
    }
  }, [showIdeDropdown]);

  if (projectLoading || !project) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-zinc-500">
        <RotateCw className="w-4 h-4 mr-2 animate-spin text-emerald-500" />
        <span>Loading project details...</span>
      </div>
    );
  }

  // Determine preferred IDE or fallback
  const preferredIde = detectedIdes.find((i) => i.id === project.preferred_ide) || detectedIdes[0];

  // Running processes for this project
  const projectProcesses = processes.filter((p) => p.project_id === project.id);
  const activeProcesses = projectProcesses.filter((p) => p.status === 'Running' || p.status === 'Starting');
  const activeLogsProcessId = selectedProcessId || activeProcesses[0]?.id || projectProcesses[0]?.id;

  // Default run config
  const defaultConfig =
    runConfigs.find((c) => c.id === project.default_run_config_id || c.is_default) || runConfigs[0];
  const isDefaultRunning = projectProcesses.some(
    (p) => p.run_config_id === defaultConfig?.id && (p.status === 'Running' || p.status === 'Starting')
  );

  const handleStartConfig = async (config: RunConfiguration) => {
    if (!config.is_trusted) {
      setUntrustedConfig(config);
      return;
    }
    try {
      const pid = await startProcess.mutateAsync(config.id);
      setSelectedProcessId(pid);
      setActiveTab('logs');
      toast.success(`Started '${config.name}'`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start process');
    }
  };

  const handleStopConfig = async (configId: string) => {
    const running = projectProcesses.find((p) => p.run_config_id === configId && p.status === 'Running');
    if (running) {
      try {
        await stopProcess.mutateAsync(running.id);
        toast.info(`Stopped process '${running.run_config_name}'`);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to stop process');
      }
    }
  };

  const handleDuplicateConfig = (config: RunConfiguration) => {
    const duplicated: RunConfiguration = {
      ...config,
      id: crypto.randomUUID(),
      name: `${config.name} (Copy)`,
      source: 'UserCreated',
      created_at: new Date().toISOString(),
    };
    saveRunConfig.mutate(duplicated, {
      onSuccess: () => toast.success(`Duplicated configuration '${config.name}'`),
      onError: (err: any) => toast.error(err?.message || 'Failed to duplicate configuration'),
    });
  };

  const handleAutoDetect = async () => {
    try {
      const detected = await tauriApi.detectRunConfigs(project.path);
      if (detected.length === 0) {
        toast.info('No new run configurations found in project files');
        return;
      }
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
          is_default: false,
          source: 'Detected',
          created_at: new Date().toISOString(),
        };
        await tauriApi.saveRunConfig(config);
      }
      refetchRunConfigs();
      toast.success(`Detected and added ${detected.length} run configuration(s)`);
    } catch (e: any) {
      toast.error(`Auto-detect failed: ${e?.message || e}`);
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim() || project.tags.includes(tagInput.trim())) return;
    const newTags = [...project.tags, tagInput.trim()];
    updateTags.mutate(
      { id: project.id, tags: newTags },
      {
        onSuccess: () => {
          toast.success(`Added tag '${tagInput.trim()}'`);
          setTagInput('');
        },
      }
    );
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = project.tags.filter((t) => t !== tagToRemove);
    updateTags.mutate({ id: project.id, tags: newTags });
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(project.path).then(() => {
      setCopiedPath(true);
      toast.info('Project path copied to clipboard');
      setTimeout(() => setCopiedPath(false), 2000);
    });
  };

  const handleConfirmRemove = async () => {
    try {
      await removeProject.mutateAsync(project.id);
      toast.info(`Removed '${project.name}' from Runyard`);
      navigate('/projects');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove project');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 max-w-6xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => navigate('/projects')}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800 transition-colors mr-1"
                title="Back to projects catalog"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <h1 className="text-xl font-bold text-zinc-100 truncate">{project.name}</h1>

              {project.project_type && (
                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded uppercase font-mono tracking-wider">
                  {project.project_type}
                </span>
              )}

              {activeProcesses.length > 0 && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs rounded-full font-mono font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {activeProcesses.length} Running
                </span>
              )}

              <button
                onClick={() => toggleFavorite.mutate(project.id)}
                className="text-zinc-500 hover:text-amber-400 transition-colors p-1"
                title={project.is_favorite ? 'Unfavorite' : 'Favorite'}
              >
                <Star
                  className={`w-4 h-4 ${project.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`}
                />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="truncate">{project.path}</span>
              <button
                onClick={handleCopyPath}
                className="text-zinc-500 hover:text-zinc-300 p-0.5 transition-colors"
                title="Copy project path"
              >
                {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Preferred IDE & Open With dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <div className="flex rounded-md shadow-sm">
                <button
                  onClick={() => {
                    if (preferredIde) {
                      openInIde.mutate({ command: preferredIde.command, projectPath: project.path });
                      toast.success(`Opened in ${preferredIde.name}`);
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-l-md transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in {preferredIde?.name || 'IDE'}</span>
                </button>
                <button
                  onClick={() => setShowIdeDropdown(!showIdeDropdown)}
                  className="px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-r-md border-l border-emerald-600 transition-colors"
                  title="Open With..."
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {showIdeDropdown && (
                <div className="absolute right-0 mt-1 w-60 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl py-1 z-30 text-xs">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-zinc-500 border-b border-zinc-800">
                    Open with Installed IDE
                  </div>
                  {detectedIdes.map((ide) => (
                    <button
                      key={ide.id}
                      onClick={() => {
                        openInIde.mutate({ command: ide.command, projectPath: project.path });
                        toast.success(`Opened in ${ide.name}`);
                        setShowIdeDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 text-zinc-200 flex items-center justify-between transition-colors"
                    >
                      <span className="font-medium">{ide.name}</span>
                      <span className="text-[10px] text-zinc-500 capitalize">{ide.installed_via}</span>
                    </button>
                  ))}
                  <div className="border-t border-zinc-800 mt-1 pt-1">
                    <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase font-semibold">
                      Set Preferred IDE
                    </div>
                    {detectedIdes.map((ide) => (
                      <button
                        key={`pref-${ide.id}`}
                        onClick={() => {
                          setProjectIde.mutate(
                            { projectId: project.id, ideId: ide.id },
                            { onSuccess: () => toast.success(`Set preferred IDE to ${ide.name}`) }
                          );
                          setShowIdeDropdown(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-between text-[11px] transition-colors"
                      >
                        <span>{ide.name}</span>
                        {project.preferred_ide === ide.id && (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Default Run Config quick trigger */}
            {defaultConfig && (
              <button
                onClick={() => {
                  if (isDefaultRunning) {
                    handleStopConfig(defaultConfig.id);
                  } else {
                    handleStartConfig(defaultConfig);
                  }
                }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                  isDefaultRunning
                    ? 'bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                )}
                title={isDefaultRunning ? 'Stop default service' : 'Run default configuration'}
              >
                {isDefaultRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{isDefaultRunning ? 'Stop' : 'Run'} {defaultConfig.name}</span>
              </button>
            )}

            <button
              onClick={() => tauriApi.openFolder(project.path)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              title="Open Folder in File Manager"
            >
              <FolderOpen className="w-4 h-4" />
            </button>

            <button
              onClick={() => tauriApi.openTerminal(project.path)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              title="Open System Terminal"
            >
              <Terminal className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowRemoveConfirm(true)}
              className="p-2 bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 rounded-md transition-colors"
              title="Remove from Runyard"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Badges & Git overview line */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-800/80 text-xs">
          {project.languages.map((l) => (
            <span
              key={l}
              className="px-2.5 py-0.5 bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 text-xs rounded"
            >
              {l}
            </span>
          ))}
          {project.frameworks.map((f) => (
            <span
              key={f}
              className="px-2.5 py-0.5 bg-blue-950/60 border border-blue-800/50 text-blue-300 text-xs rounded"
            >
              {f}
            </span>
          ))}
          {project.has_git && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-purple-950/60 border border-purple-800/50 text-purple-300 text-xs rounded font-mono">
              <GitBranch className="w-3 h-3" />
              <span>{project.git_branch || 'git'}</span>
            </div>
          )}
          {services.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded">
              <Layers className="w-3 h-3 text-blue-400" />
              <span>{services.length} {services.length === 1 ? 'Service' : 'Services'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-800 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Overview & Services
        </button>
        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'runs'
              ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Play className="w-3.5 h-3.5 text-emerald-400" />
          <span>Run Configurations ({runConfigs.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('git')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'git'
              ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5 text-purple-400" />
          <span>Git Repository</span>
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'terminal'
              ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>Interactive Terminal</span>
        </button>
        {projectProcesses.length > 0 && (
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Logs ({projectProcesses.length})</span>
          </button>
        )}
      </div>

      {/* Tab Content: Overview & Services */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Services breakdown table */}
          {services.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">Discovered Nested Services</h3>
                </div>
                <span className="text-xs text-zinc-500">{services.length} services</span>
              </div>

              <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-lg overflow-hidden">
                {services.map((svc) => {
                  const svcConfigs = runConfigs.filter((c) => c.service_id === svc.id);
                  return (
                    <div
                      key={svc.id}
                      className="p-3.5 bg-zinc-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-zinc-900/50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-200">{svc.name}</span>
                          <span className="font-mono text-[11px] text-zinc-500">{svc.path}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {svc.languages.map((l) => (
                            <span key={l} className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded">
                              {l}
                            </span>
                          ))}
                          {svc.frameworks.map((f) => (
                            <span key={f} className="text-[10px] px-1.5 py-0.2 bg-blue-950 text-blue-300 rounded">
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {svcConfigs.map((cfg) => {
                          const isRunning = projectProcesses.some(
                            (p) => p.run_config_id === cfg.id && (p.status === 'Running' || p.status === 'Starting')
                          );
                          return (
                            <button
                              key={cfg.id}
                              onClick={() => {
                                if (isRunning) {
                                  handleStopConfig(cfg.id);
                                } else {
                                  handleStartConfig(cfg);
                                }
                              }}
                              className={cn(
                                'flex items-center gap-1 px-2.5 py-1 rounded transition-colors text-xs font-medium',
                                isRunning
                                  ? 'bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300'
                                  : 'bg-zinc-800 hover:bg-emerald-950/80 hover:text-emerald-400 border border-zinc-700 text-zinc-300'
                              )}
                            >
                              {isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 text-emerald-400" />}
                              <span>{cfg.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags management */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">Project Tags</h3>
            <div className="flex flex-wrap items-center gap-2">
              {project.tags.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-md flex items-center gap-1.5"
                >
                  <span>{t}</span>
                  <button
                    onClick={() => handleRemoveTag(t)}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
              <form onSubmit={handleAddTag} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add tag..."
                  className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <button
                  type="submit"
                  disabled={!tagInput.trim()}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-300 rounded font-medium"
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Run Configurations & Groups */}
      {activeTab === 'runs' && (
        <div className="space-y-6">
          {/* Multi-Service Run Groups */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Multi-Service Run Groups</h3>
                  <p className="text-xs text-zinc-400">Launch and supervise full service stacks together</p>
                </div>
              </div>
              <button
                onClick={() => setEditingGroup(null)}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Run Group</span>
              </button>
            </div>

            {runGroups.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-4 bg-zinc-950/60 rounded-lg border border-zinc-800 text-center">
                No run groups defined yet. Click "New Run Group" to bundle multiple services together.
              </p>
            ) : (
              <div className="space-y-2.5">
                {runGroups.map((group) => {
                  const memberConfigs = runConfigs.filter((c) =>
                    group.member_config_ids.includes(c.id)
                  );
                  const isAnyRunning = memberConfigs.some((cfg) =>
                    projectProcesses.some((p) => p.run_config_id === cfg.id && (p.status === 'Running' || p.status === 'Starting'))
                  );

                  return (
                    <div
                      key={group.id}
                      className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-100 text-sm">{group.name}</span>
                          <span className="text-[11px] text-zinc-500 font-mono">
                            ({group.member_config_ids.length} configs)
                          </span>
                        </div>

                        {/* Partial status for each service member */}
                        <div className="flex flex-wrap gap-1.5">
                          {memberConfigs.map((cfg) => {
                            const proc = projectProcesses.find((p) => p.run_config_id === cfg.id);
                            const status = proc?.status;
                            const isRunning = status === 'Running';
                            const isFailed = status === 'Failed';

                            return (
                              <span
                                key={cfg.id}
                                className={cn(
                                  'px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1.5 border',
                                  isRunning
                                    ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                                    : isFailed
                                    ? 'bg-red-950/80 border-red-800 text-red-300'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                                )}
                              >
                                <span
                                  className={cn(
                                    'w-1.5 h-1.5 rounded-full',
                                    isRunning ? 'bg-emerald-400 animate-pulse' : isFailed ? 'bg-red-400' : 'bg-zinc-600'
                                  )}
                                />
                                <span>{cfg.name}</span>
                                {status && isFailed && (
                                  <span className="text-[9px] text-red-400 uppercase font-sans font-bold">Failed</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            startRunGroup.mutate(group.id);
                            toast.success(`Launched run group '${group.name}'`);
                            setActiveTab('logs');
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Run All</span>
                        </button>
                        {isAnyRunning && (
                          <button
                            onClick={() => {
                              stopRunGroup.mutate(group.id);
                              toast.info(`Stopped run group '${group.name}'`);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-red-950/80 hover:text-red-400 text-zinc-300 font-medium rounded-md transition-colors"
                          >
                            <Square className="w-3.5 h-3.5" />
                            <span>Stop All</span>
                          </button>
                        )}
                        <button
                          onClick={() => setEditingGroup(group)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md transition-colors"
                          title="Edit Group"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            deleteRunGroup.mutate({ id: group.id, projectId: project.id });
                            toast.info(`Deleted run group '${group.name}'`);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 rounded-md transition-colors"
                          title="Delete Group"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Individual Run Configurations */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Run Configurations</h3>
                <p className="text-xs text-zinc-400">Launch individual execution profiles</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoDetect}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md transition-colors"
                  title="Detect run configurations from files"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Auto-Detect</span>
                </button>
                <button
                  onClick={() => setEditingConfig(null)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Configuration</span>
                </button>
              </div>
            </div>

            {runConfigs.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-6 bg-zinc-950/60 rounded-lg border border-zinc-800 text-center">
                No run configurations yet. Click "Auto-Detect" or "New Configuration" above.
              </p>
            ) : (
              <div className="space-y-2">
                {runConfigs.map((config) => {
                  const runningProc = projectProcesses.find(
                    (p) => p.run_config_id === config.id && (p.status === 'Running' || p.status === 'Starting')
                  );
                  const isRunning = !!runningProc;
                  const isDefault = project.default_run_config_id === config.id || config.is_default;

                  return (
                    <div
                      key={config.id}
                      className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs hover:border-zinc-700 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-zinc-100">{config.name}</span>
                          {isDefault && (
                            <span className="px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] rounded font-mono">
                              default
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.2 text-[10px] rounded flex items-center gap-1 ${
                              config.is_trusted
                                ? 'bg-zinc-800 text-zinc-400'
                                : 'bg-amber-950/80 border border-amber-800 text-amber-300'
                            }`}
                          >
                            {config.is_trusted ? (
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <ShieldAlert className="w-3 h-3 text-amber-400" />
                            )}
                            <span>{config.is_trusted ? 'Trusted' : 'Untrusted'}</span>
                          </span>
                          <span className="text-zinc-500 text-[11px] font-mono">[{config.source}]</span>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-zinc-400 text-[11px] truncate">
                          <span className="truncate">
                            {config.command} {config.args.join(' ')}
                          </span>
                          {config.working_dir && (
                            <span className="text-zinc-600 truncate shrink-0">in {config.working_dir}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isRunning ? (
                          <>
                            <button
                              onClick={() => handleStopConfig(config.id)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 font-medium rounded transition-colors"
                            >
                              <Square className="w-3 h-3" />
                              <span>Stop</span>
                            </button>
                            <button
                              onClick={() => {
                                restartProcess.mutate(runningProc.id);
                                toast.info(`Restarting ${config.name}`);
                              }}
                              className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                              title="Restart"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleStartConfig(config)}
                            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded transition-colors"
                          >
                            <Play className="w-3 h-3" />
                            <span>Run</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setDefaultRunConfig.mutate(
                              { projectId: project.id, configId: config.id },
                              { onSuccess: () => toast.success(`Set '${config.name}' as default configuration`) }
                            );
                          }}
                          className={`p-1 rounded transition-colors ${
                            isDefault
                              ? 'text-amber-400 bg-amber-950/40'
                              : 'text-zinc-500 hover:text-zinc-300 bg-zinc-800'
                          }`}
                          title="Set as Default Run Config"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDuplicateConfig(config)}
                          className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                          title="Duplicate Config"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingConfig(config)}
                          className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                          title="Edit Config"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            deleteRunConfig.mutate(
                              { id: config.id, projectId: project.id },
                              { onSuccess: () => toast.info(`Deleted '${config.name}'`) }
                            );
                          }}
                          className="p-1 bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 rounded transition-colors"
                          title="Delete Config"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Git View */}
      {activeTab === 'git' && <GitView projectPath={project.path} />}

      {/* Tab Content: Integrated Terminal */}
      {activeTab === 'terminal' && <TerminalView projectPath={project.path} />}

      {/* Tab Content: Live Logs */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400">Active Service Logs:</span>
              <div className="flex gap-2 flex-wrap">
                {projectProcesses.map((p) => {
                  const isSelected = activeLogsProcessId === p.id;
                  const isRunning = p.status === 'Running';
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProcessId(p.id)}
                      className={cn(
                        'px-3 py-1 text-xs rounded-md font-mono flex items-center gap-1.5 transition-colors',
                        isSelected
                          ? 'bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      )}
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                        )}
                      />
                      <span>{p.run_config_name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {activeLogsProcessId ? (
            <LogViewer processId={activeLogsProcessId} />
          ) : (
            <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-900/40 rounded-xl border border-zinc-800">
              No process selected or active.
            </div>
          )}
        </div>
      )}

      {/* Trust Dialog Modal */}
      {untrustedConfig && (
        <TrustDialog
          config={untrustedConfig}
          onCancel={() => setUntrustedConfig(null)}
          onRunOnce={async () => {
            const config = untrustedConfig;
            setUntrustedConfig(null);
            try {
              const pid = await startProcess.mutateAsync(config.id);
              setSelectedProcessId(pid);
              setActiveTab('logs');
              toast.success(`Started '${config.name}' (Run Once)`);
            } catch (e: any) {
              toast.error(e?.message || 'Failed to start process');
            }
          }}
          onTrustAndRun={async () => {
            const config = untrustedConfig;
            setUntrustedConfig(null);
            try {
              await trustRunConfig.mutateAsync({ id: config.id, projectId: project.id });
              const pid = await startProcess.mutateAsync(config.id);
              setSelectedProcessId(pid);
              setActiveTab('logs');
              toast.success(`Trusted & Started '${config.name}'`);
            } catch (e: any) {
              toast.error(e?.message || 'Failed to trust and run process');
            }
          }}
        />
      )}

      {/* Run Config Modal */}
      {editingConfig !== undefined && (
        <RunConfigModal
          isOpen={true}
          onClose={() => setEditingConfig(undefined)}
          onSave={(config) => {
            saveRunConfig.mutate(config, {
              onSuccess: () => toast.success(`Saved configuration '${config.name}'`),
              onError: (err: any) => toast.error(err?.message || 'Failed to save configuration'),
            });
          }}
          projectId={project.id}
          projectPath={project.path}
          services={services}
          existingConfig={editingConfig}
        />
      )}

      {/* Run Group Modal */}
      {editingGroup !== undefined && (
        <RunGroupModal
          isOpen={true}
          onClose={() => setEditingGroup(undefined)}
          onSave={(group) => {
            saveRunGroup.mutate(group, {
              onSuccess: () => toast.success(`Saved run group '${group.name}'`),
              onError: (err: any) => toast.error(err?.message || 'Failed to save run group'),
            });
          }}
          projectId={project.id}
          runConfigs={runConfigs}
          existingGroup={editingGroup}
        />
      )}

      {/* Safe Remove Project Confirmation Modal */}
      {showRemoveConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
          onClick={() => setShowRemoveConfirm(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-semibold text-zinc-100">Remove from Runyard</h3>
            </div>
            <p className="text-xs text-zinc-300">
              Remove <span className="font-semibold text-zinc-100">'{project.name}'</span> from Runyard?
            </p>
            <p className="text-[11px] text-zinc-400 bg-zinc-950 p-2.5 rounded border border-zinc-800">
              Files and Git repository on disk will <span className="text-emerald-400 font-semibold">NOT</span> be deleted.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRemoveConfirm(false)}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                className="px-3.5 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-medium rounded-md"
              >
                Remove Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
