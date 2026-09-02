import { useState, useRef, useEffect } from 'react';
import { useProject, useProjectServices, useSetProjectIde } from '../hooks/use-projects';
import { useRunConfigs, useSaveRunConfig } from '../hooks/use-run-configs';
import { useSettings } from '../hooks/use-settings';
import { useProcesses, useStartProcess, useStopProcess } from '../hooks/use-processes';
import { tauriApi } from '../lib/tauri';
import { ExternalLink, Terminal, FolderOpen, Play, Square, ChevronDown, Check, Search, Plus } from 'lucide-react';
import { toast } from '../stores/toast-store';
import { RunConfigModal } from './RunConfigModal';
import { RunConfigRow } from './RunConfigRow';
import { useQueryClient } from '@tanstack/react-query';
import { DetectedIde, RunConfiguration, Service } from '../types';
import { formatElapsedDuration } from '../lib/utils';

interface ProjectWorkspaceProps {
  projectId: string;
}

export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const { data: project, isLoading: pLoading } = useProject(projectId);
  const { data: services } = useProjectServices(projectId);
  const { data: runConfigs } = useRunConfigs(projectId);
  const { data: processes } = useProcesses();
  const saveRunConfig = useSaveRunConfig();
  const startProcess = useStartProcess();
  const stopProcess = useStopProcess();
  const setProjectIde = useSetProjectIde();
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<RunConfiguration | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  
  const [detectedIdes, setDetectedIdes] = useState<DetectedIde[]>([]);
  const [showIdeDropdown, setShowIdeDropdown] = useState(false);
  const ideDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tauriApi.detectIdes().then(ides => setDetectedIdes(ides)).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ideDropdownRef.current && !ideDropdownRef.current.contains(e.target as Node)) {
        setShowIdeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const preferredIde = detectedIdes.find(i => i.id === project?.preferred_ide) 
    || detectedIdes.find(i => i.id === settings?.default_ide) 
    || detectedIdes[0];

  if (pLoading || !project) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
        Loading project workspace...
      </div>
    );
  }

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
      await tauriApi.openInIde(ide.id, project.path);
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
      toast.success(`Discovered ${count} run configurations`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to auto-detect run configurations");
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full bg-zinc-950 select-none">
        {/* Workspace Header matching Stitch */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/80 shrink-0 bg-zinc-950">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              {project.name}
              <span className="text-zinc-500 font-mono text-xs font-normal">
                [{project.git_branch || 'main'}]
              </span>
            </h1>

            <div className="flex items-center gap-1.5 ml-2">
              {project.languages.slice(0, 3).map((l) => (
                <span
                  key={l}
                  className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-medium bg-[#111] border border-zinc-800 text-zinc-400"
                >
                  {l}
                </span>
              ))}
              {project.frameworks.slice(0, 2).map((f) => (
                <span
                  key={f}
                  className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-medium bg-[#111] border border-zinc-800 text-zinc-400"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Open in IDE Selector */}
            <div className="relative" ref={ideDropdownRef}>
              {preferredIde ? (
                <div className="flex items-center">
                  <button
                    onClick={() => handleOpenIde(preferredIde)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#111] hover:bg-zinc-800 text-zinc-300 text-xs font-medium rounded-l transition-colors border border-zinc-800 border-r-0"
                  >
                    <ExternalLink className="w-3 h-3 text-emerald-400" />
                    <span>Open in {preferredIde.name}</span>
                  </button>
                  <button
                    onClick={() => setShowIdeDropdown(!showIdeDropdown)}
                    className="px-1.5 py-1 bg-[#111] hover:bg-zinc-800 text-zinc-400 text-xs rounded-r transition-colors border border-zinc-800 h-full flex items-center justify-center"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  disabled
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 text-zinc-600 text-xs font-medium rounded border border-zinc-800 cursor-not-allowed"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open in IDE</span>
                </button>
              )}

              {showIdeDropdown && detectedIdes.length > 0 && (
                <div className="absolute right-0 mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-md shadow-2xl z-50 overflow-hidden text-xs">
                  <div className="px-3 py-1.5 text-zinc-500 font-semibold uppercase tracking-wider border-b border-zinc-800 text-[10px]">
                    Installed Editors
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    {detectedIdes.map((ide) => (
                      <button
                        key={ide.id}
                        onClick={() => {
                          setShowIdeDropdown(false);
                          handleOpenIde(ide);
                        }}
                        className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                      >
                        <div className="w-4 flex justify-center">
                          {preferredIde?.id === ide.id && <Check className="w-3 h-3 text-emerald-500" />}
                        </div>
                        <span>{ide.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-zinc-800 p-1">
                    <button
                      onClick={async () => {
                        if (preferredIde) {
                          try {
                            await setProjectIde.mutateAsync({ projectId: project.id, ideId: preferredIde.id });
                            toast.success(`Set ${preferredIde.name} as preferred`);
                          } catch (e) {
                            toast.error("Failed to update project preference");
                          }
                        }
                        setShowIdeDropdown(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-emerald-400 hover:bg-zinc-800 flex items-center text-[11px]"
                    >
                      Set {preferredIde?.name} as preferred
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleOpenTerminal}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#111] border border-transparent hover:border-zinc-800 rounded transition-colors"
              title="System Terminal"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleOpenFolder}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#111] border border-transparent hover:border-zinc-800 rounded transition-colors"
              title="File Manager"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-zinc-950">
          {/* Services Overview Dense Table */}
          {services && services.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider">
                Services Overview
              </h2>
              <div className="border border-zinc-800/80 rounded overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#111] border-b border-zinc-800/80 text-zinc-400 text-[11px]">
                    <tr>
                      <th className="px-4 py-2 font-medium w-[22%]">Project</th>
                      <th className="px-4 py-2 font-medium w-[28%]">Service</th>
                      <th className="px-4 py-2 font-medium w-[15%]">PID</th>
                      <th className="px-4 py-2 font-medium w-[20%]">Runtime</th>
                      <th className="px-4 py-2 font-medium text-right w-[15%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 bg-zinc-950">
                    {services.map((svc: Service) => {
                      const svcConfigs = runConfigs?.filter((c) => c.service_id === svc.id) || [];
                      const svcProc = processes?.find((p) =>
                        svcConfigs.some((c) => c.id === p.run_config_id) &&
                        (p.status === 'Running' || p.status === 'Starting')
                      );
                      const isRunning = !!svcProc;

                      const handleServiceToggle = async () => {
                        if (isRunning && svcProc) {
                          try {
                            await stopProcess.mutateAsync(svcProc.id);
                          } catch (e: any) {
                            toast.error(e?.message || "Failed to stop service");
                          }
                        } else if (svcConfigs.length > 0) {
                          try {
                            await startProcess.mutateAsync(svcConfigs[0]!.id);
                          } catch (e: any) {
                            toast.error(e?.message || "Failed to start service");
                          }
                        }
                      };

                      return (
                        <tr key={svc.id} className="hover:bg-[#111] transition-colors group">
                          <td className="px-4 py-2 flex items-center gap-2">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isRunning ? 'bg-emerald-500' : 'bg-zinc-700 group-hover:bg-zinc-600'
                              }`}
                            />
                            <span className="text-zinc-300 font-medium">{project.name}</span>
                          </td>
                          <td className="px-4 py-2 text-zinc-300 font-mono text-[11px]">
                            {svc.name}
                          </td>
                          <td className="px-4 py-2 text-zinc-500 font-mono text-[11px]">
                            {svcProc?.pid || '—'}
                          </td>
                          <td className="px-4 py-2 text-zinc-400 text-[11px]">
                            {isRunning && svcProc?.started_at
                              ? formatElapsedDuration(svcProc.started_at)
                              : (svc.languages[0] ? `${svc.languages[0]} ${svc.frameworks[0] || ''}`.trim() : '—')}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {svcConfigs.length > 0 && (
                              <button
                                onClick={handleServiceToggle}
                                className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
                                title={isRunning ? "Stop service" : "Start service"}
                              >
                                {isRunning ? (
                                  <Square className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Run Configurations Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Run Configurations
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoDetect}
                  disabled={isDetecting}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[#111] hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded text-[11px] transition-colors disabled:opacity-50"
                >
                  <Search className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} /> Auto Detect
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 rounded text-[11px] transition-colors"
                >
                  <Plus className="w-3 h-3" /> Create
                </button>
              </div>
            </div>
            
            <div className="border border-zinc-800/80 rounded overflow-hidden divide-y divide-zinc-800/80 bg-[#111]">
              {(!runConfigs || runConfigs.length === 0) && (
                <div className="p-4 text-xs text-zinc-500 text-center bg-zinc-950">
                  No configurations found. Click "Auto Detect" or "Create".
                </div>
              )}
              {runConfigs?.map((config) => (
                <RunConfigRow
                  key={config.id}
                  config={config}
                  projectId={project.id}
                  onEdit={() => {
                    setEditingConfig(config);
                    setShowCreateModal(true);
                  }}
                  onDuplicate={() => {
                    setEditingConfig({ ...config, id: '', name: `${config.name} (Copy)` });
                    setShowCreateModal(true);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {(showCreateModal || editingConfig) && (
        <RunConfigModal
          isOpen={true}
          projectId={project.id}
          projectPath={project.path}
          services={services || []}
          existingConfig={editingConfig}
          onClose={() => {
            setShowCreateModal(false);
            setEditingConfig(null);
          }}
          onSave={(cfg) => {
            saveRunConfig.mutate(cfg);
            setShowCreateModal(false);
            setEditingConfig(null);
          }}
        />
      )}
    </>
  );
}
