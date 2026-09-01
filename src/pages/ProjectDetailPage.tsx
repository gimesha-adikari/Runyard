import React, { useState } from 'react';
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
import { GitView } from '../components/GitView';
import { TerminalView } from '../components/TerminalView';
import { LogViewer } from '../components/LogViewer';
import { TrustDialog } from '../components/TrustDialog';
import { RunConfigModal } from '../components/RunConfigModal';
import { RunGroupModal } from '../components/RunGroupModal';
import { RunConfiguration, RunGroup } from '../types';
import {
  Folder,
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
} from 'lucide-react';

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

  if (projectLoading || !project) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-zinc-500">
        Loading project details...
      </div>
    );
  }

  // Determine preferred IDE or fallback
  const preferredIde = detectedIdes.find((i) => i.id === project.preferred_ide) || detectedIdes[0];

  // Running processes for this project
  const projectProcesses = processes.filter((p) => p.project_id === project.id);
  const activeLogsProcessId = selectedProcessId || projectProcesses[0]?.id;

  const handleStartConfig = async (config: RunConfiguration) => {
    if (!config.is_trusted) {
      setUntrustedConfig(config);
      return;
    }
    try {
      const pid = await startProcess.mutateAsync(config.id);
      setSelectedProcessId(pid);
      setActiveTab('logs');
    } catch (e: any) {
      alert(`Failed to start process: ${e?.message || e}`);
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
    saveRunConfig.mutate(duplicated);
  };

  const handleAutoDetect = async () => {
    try {
      const detected = await tauriApi.detectRunConfigs(project.path);
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
    } catch (e: any) {
      alert(`Auto-detect failed: ${e?.message || e}`);
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim() || project.tags.includes(tagInput.trim())) return;
    const newTags = [...project.tags, tagInput.trim()];
    updateTags.mutate({ id: project.id, tags: newTags });
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = project.tags.filter((t) => t !== tagToRemove);
    updateTags.mutate({ id: project.id, tags: newTags });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-zinc-100">{project.name}</h1>
              {project.project_type && (
                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded uppercase font-mono tracking-wider">
                  {project.project_type}
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
            <p className="text-xs font-mono text-zinc-400">{project.path}</p>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center gap-2">
            {/* Preferred IDE & Open With dropdown */}
            <div className="relative">
              <div className="flex rounded-md shadow-sm">
                <button
                  onClick={() => {
                    if (preferredIde) {
                      openInIde.mutate({ command: preferredIde.command, projectPath: project.path });
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
                <div className="absolute right-0 mt-1 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-30 text-xs">
                  <div className="px-3 py-1 text-[10px] uppercase font-semibold text-zinc-500 border-b border-zinc-800">
                    Open with Installed IDE
                  </div>
                  {detectedIdes.map((ide) => (
                    <button
                      key={ide.id}
                      onClick={() => {
                        openInIde.mutate({ command: ide.command, projectPath: project.path });
                        setShowIdeDropdown(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 flex items-center justify-between"
                    >
                      <span>{ide.name}</span>
                      <span className="text-[10px] text-zinc-500 capitalize">{ide.installed_via}</span>
                    </button>
                  ))}
                  <div className="border-t border-zinc-800 mt-1 pt-1">
                    <div className="px-3 py-1 text-[10px] text-zinc-500">Set as Preferred IDE</div>
                    {detectedIdes.map((ide) => (
                      <button
                        key={`pref-${ide.id}`}
                        onClick={() => {
                          setProjectIde.mutate({ projectId: project.id, ideId: ide.id });
                          setShowIdeDropdown(false);
                        }}
                        className="w-full text-left px-3 py-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-between text-[11px]"
                      >
                        <span>{ide.name}</span>
                        {project.preferred_ide === ide.id && (
                          <Check className="w-3 h-3 text-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => tauriApi.openFolder(project.path)}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              title="Open Folder in File Manager"
            >
              <Folder className="w-4 h-4" />
            </button>
            <button
              onClick={() => tauriApi.openTerminal(project.path)}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              title="Open System Terminal"
            >
              <Terminal className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (confirm(`Remove '${project.name}' from Runyard? (Files on disk will NOT be deleted)`)) {
                  removeProject.mutate(project.id);
                  navigate('/projects');
                }
              }}
              className="p-1.5 bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 rounded-md transition-colors"
              title="Remove from Runyard"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Badges & Git info */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/80 text-xs">
          {project.languages.map((l) => (
            <span key={l} className="px-2.5 py-0.5 bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 text-xs rounded">
              {l}
            </span>
          ))}
          {project.frameworks.map((f) => (
            <span key={f} className="px-2.5 py-0.5 bg-blue-950/60 border border-blue-800/50 text-blue-300 text-xs rounded">
              {f}
            </span>
          ))}
          {project.has_git && (
            <div className="flex items-center gap-1 px-2.5 py-0.5 bg-purple-950/60 border border-purple-800/50 text-purple-300 text-xs rounded">
              <GitBranch className="w-3 h-3" />
              <span>{project.git_branch || 'git'}</span>
            </div>
          )}
          {services.length > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded">
              <Layers className="w-3 h-3 text-blue-400" />
              <span>{services.length} {services.length === 1 ? 'Service' : 'Services'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-800 text-xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Overview & Services
        </button>
        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
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
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
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
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
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
            className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
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

      {/* Overview & Services Tab */}
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
                      className="p-3.5 bg-zinc-950 flex items-center justify-between text-xs hover:bg-zinc-900/50 transition-colors"
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

                      <div className="flex items-center gap-2">
                        {svcConfigs.map((cfg) => {
                          const isRunning = projectProcesses.some(
                            (p) => p.run_config_id === cfg.id && p.status === 'Running'
                          );
                          return (
                            <button
                              key={cfg.id}
                              onClick={() => handleStartConfig(cfg)}
                              disabled={isRunning}
                              className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-emerald-950/80 hover:text-emerald-400 border border-zinc-700 text-zinc-300 rounded transition-colors text-xs"
                            >
                              <Play className="w-3 h-3" />
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
            <h3 className="text-sm font-semibold text-zinc-200">Tags</h3>
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
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-300 rounded"
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Run Configurations & Groups Tab */}
      {activeTab === 'runs' && (
        <div className="space-y-6">
          {/* Multi-Service Run Groups */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Multi-Service Run Groups</h3>
                  <p className="text-xs text-zinc-400">Launch and stop full multi-service environments with one click</p>
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
                No run groups defined yet. Create a group to bundle multiple service configs together.
              </p>
            ) : (
              <div className="space-y-2">
                {runGroups.map((group) => {
                  const memberConfigs = runConfigs.filter((c) =>
                    group.member_config_ids.includes(c.id)
                  );
                  const isAnyRunning = memberConfigs.some((cfg) =>
                    projectProcesses.some((p) => p.run_config_id === cfg.id && p.status === 'Running')
                  );

                  return (
                    <div
                      key={group.id}
                      className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-100 text-sm">{group.name}</span>
                          <span className="text-[11px] text-zinc-500 font-mono">
                            ({group.member_config_ids.length} configs)
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {memberConfigs.map((cfg) => {
                            const proc = projectProcesses.find((p) => p.run_config_id === cfg.id);
                            const isRunning = proc?.status === 'Running';
                            return (
                              <span
                                key={cfg.id}
                                className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 ${
                                  isRunning
                                    ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-400'
                                    : 'bg-zinc-800/80 text-zinc-400'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isRunning ? 'bg-emerald-400' : 'bg-zinc-600'
                                  }`}
                                />
                                <span>{cfg.name}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startRunGroup.mutate(group.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Run All</span>
                        </button>
                        {isAnyRunning && (
                          <button
                            onClick={() => stopRunGroup.mutate(group.id)}
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
                          onClick={() => deleteRunGroup.mutate({ id: group.id, projectId: project.id })}
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
                <p className="text-xs text-zinc-400">Manage, edit, and launch project execution profiles</p>
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
                    (p) => p.run_config_id === config.id && p.status === 'Running'
                  );
                  const isRunning = !!runningProc;
                  const isDefault = project.default_run_config_id === config.id || config.is_default;

                  return (
                    <div
                      key={config.id}
                      className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between text-xs hover:border-zinc-700 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-100">{config.name}</span>
                          {isDefault && (
                            <span className="px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] rounded">
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
                          <span className="text-zinc-500 text-[11px]">[{config.source}]</span>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-zinc-400 text-[11px]">
                          <span>
                            {config.command} {config.args.join(' ')}
                          </span>
                          {config.working_dir && (
                            <span className="text-zinc-600">in {config.working_dir}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isRunning ? (
                          <>
                            <button
                              onClick={() => stopProcess.mutate(runningProc.id)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 font-medium rounded transition-colors"
                            >
                              <Square className="w-3 h-3" />
                              <span>Stop</span>
                            </button>
                            <button
                              onClick={() => restartProcess.mutate(runningProc.id)}
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
                          onClick={() =>
                            setDefaultRunConfig.mutate({ projectId: project.id, configId: config.id })
                          }
                          className={`p-1 rounded transition-colors ${
                            isDefault
                              ? 'text-emerald-400'
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
                          onClick={() =>
                            deleteRunConfig.mutate({ id: config.id, projectId: project.id })
                          }
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

      {/* Git View Tab */}
      {activeTab === 'git' && <GitView projectPath={project.path} />}

      {/* Integrated Terminal Tab */}
      {activeTab === 'terminal' && <TerminalView projectPath={project.path} />}

      {/* Live Logs Tab */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400">Active Process:</span>
            <div className="flex gap-2">
              {projectProcesses.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProcessId(p.id)}
                  className={`px-3 py-1 text-xs rounded-md font-mono flex items-center gap-1.5 transition-colors ${
                    activeLogsProcessId === p.id
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{p.run_config_name}</span>
                </button>
              ))}
            </div>
          </div>
          {activeLogsProcessId ? (
            <LogViewer processId={activeLogsProcessId} />
          ) : (
            <p className="text-xs text-zinc-500 italic">No process selected or running.</p>
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
            const pid = await startProcess.mutateAsync(config.id);
            setSelectedProcessId(pid);
            setActiveTab('logs');
          }}
          onTrustAndRun={async () => {
            const config = untrustedConfig;
            setUntrustedConfig(null);
            await trustRunConfig.mutateAsync({ id: config.id, projectId: project.id });
            const pid = await startProcess.mutateAsync(config.id);
            setSelectedProcessId(pid);
            setActiveTab('logs');
          }}
        />
      )}

      {/* Run Config Modal */}
      {editingConfig !== undefined && (
        <RunConfigModal
          isOpen={true}
          onClose={() => setEditingConfig(undefined)}
          onSave={(config) => saveRunConfig.mutate(config)}
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
          onSave={(group) => saveRunGroup.mutate(group)}
          projectId={project.id}
          runConfigs={runConfigs}
          existingGroup={editingGroup}
        />
      )}
    </div>
  );
};
