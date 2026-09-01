import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject, useToggleFavorite, useRemoveProject } from '../hooks/use-projects';
import { useGitStatus } from '../hooks/use-git';
import { useRunConfigs, useDetectRunConfigs } from '../hooks/use-run-configs';
import { useProcesses, useStartProcess, useStopProcess } from '../hooks/use-processes';
import { useDetectedIdes } from '../hooks/use-ides';
import { tauriApi } from '../lib/tauri';
import { 
  Folder, Code, Star, Trash2, Terminal, ExternalLink, GitCommit as GitCommitIcon, 
  Play, Square, Search, AlertCircle
} from 'lucide-react';
import { GitStatusBadge } from '../components/GitStatusBadge';
import { ProcessStatusBadge } from '../components/ProcessStatusBadge';
import { LogViewer } from '../components/LogViewer';
import { TrustDialog } from '../components/TrustDialog';
import { cn } from '../lib/utils';
import { RunConfiguration } from '../types';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id!);
  const { data: gitStatus } = useGitStatus(project?.path);
  const { data: runConfigs = [] } = useRunConfigs(id);
  const { data: processes = [] } = useProcesses();
  const { data: ides = [] } = useDetectedIdes();
  const detectRunConfigs = useDetectRunConfigs(project?.path);
  const toggleFavorite = useToggleFavorite();
  const removeProject = useRemoveProject();
  const startProcess = useStartProcess();
  const stopProcess = useStopProcess();

  const [trustConfigDialog, setTrustConfigDialog] = useState<RunConfiguration | null>(null);

  if (isLoading || !project) return <div className="p-8 text-zinc-500">Loading...</div>;

  const projectProcesses = processes.filter(p => p.project_id === id);

  const handleRun = (config: RunConfiguration) => {
    if (!config.is_trusted && config.source === 'Detected') {
      setTrustConfigDialog(config);
    } else {
      startProcess.mutate(config.id);
    }
  };

  const handleOpenFolder = () => tauriApi.openFolder(project.path);
  const handleOpenTerminal = () => tauriApi.openTerminal(project.path);
  const handleOpenIde = (command: string) => tauriApi.openInIde(command, project.path);

  const handleRemove = async () => {
    if (window.confirm('Are you sure you want to remove this project from Runyard?')) {
      await removeProject.mutateAsync(project.id);
      navigate('/projects');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-start">
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg mr-4">
            <Folder className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center">
              {project.name}
              <button 
                onClick={() => toggleFavorite.mutate(project.id)}
                className="ml-3 text-zinc-500 hover:text-yellow-400"
              >
                <Star className={cn("w-5 h-5", project.is_favorite && "fill-yellow-400 text-yellow-400")} />
              </button>
            </h1>
            <div className="text-zinc-500 font-mono text-sm mt-1">{project.path}</div>
          </div>
        </div>
        <div className="flex space-x-2">
          {ides.length > 0 && (
            <div className="relative group">
              <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-sm font-medium transition-colors flex items-center">
                <Code className="w-4 h-4 mr-2" />
                Open IDE
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl hidden group-hover:block z-10 overflow-hidden">
                {ides.map(ide => (
                  <button
                    key={ide.id}
                    onClick={() => handleOpenIde(ide.command)}
                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    {ide.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button onClick={handleOpenFolder} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors" title="Open Folder">
            <ExternalLink className="w-4 h-4" />
          </button>
          <button onClick={handleOpenTerminal} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors" title="Open Terminal">
            <Terminal className="w-4 h-4" />
          </button>
          <button onClick={handleRemove} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition-colors" title="Remove Project">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Run Configurations */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-zinc-200 flex items-center">
                <Play className="w-5 h-5 mr-2 text-emerald-500" />
                Run Configurations
              </h2>
              <button 
                onClick={() => detectRunConfigs.refetch()}
                className="text-xs flex items-center text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded bg-zinc-800"
              >
                <Search className="w-3 h-3 mr-1" /> Detect
              </button>
            </div>
            <div className="divide-y divide-zinc-800">
              {runConfigs.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 text-sm">No configurations found.</div>
              ) : (
                runConfigs.map(config => {
                  const isRunning = projectProcesses.some(p => p.run_config_id === config.id && p.status === 'Running');
                  const proc = projectProcesses.find(p => p.run_config_id === config.id);

                  return (
                    <div key={config.id} className="p-5 flex justify-between items-start hover:bg-zinc-800/30 transition-colors">
                      <div>
                        <div className="font-medium text-zinc-200 mb-1">{config.name}</div>
                        <div className="text-xs font-mono text-zinc-500 bg-zinc-950 px-2 py-1 rounded inline-block">
                          {config.command} {config.args.join(' ')}
                        </div>
                        {!config.is_trusted && config.source === 'Detected' && (
                          <div className="flex items-center text-amber-500 text-xs mt-2">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Needs review before running
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 ml-4">
                        {proc && <ProcessStatusBadge status={proc.status} />}
                        {isRunning ? (
                          <button 
                            onClick={() => stopProcess.mutate(proc!.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md"
                          >
                            <Square className="w-4 h-4 fill-current" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleRun(config)}
                            className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-md"
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Active Processes & Logs */}
          {projectProcesses.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-zinc-200">Process Output</h2>
              {projectProcesses.map(proc => (
                <div key={proc.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 flex justify-between items-center text-sm">
                    <div className="font-medium text-zinc-300">{proc.run_config_name}</div>
                    <ProcessStatusBadge status={proc.status} />
                  </div>
                  <LogViewer processId={proc.id} />
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="space-y-6">
          {/* Tech Stack */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Tech Stack</h2>
            <div className="flex flex-wrap gap-2">
              {project.project_type && (
                <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-sm font-medium">
                  {project.project_type}
                </span>
              )}
              {project.languages.map(lang => (
                <span key={lang} className="px-2.5 py-1 bg-zinc-800 text-zinc-300 rounded text-sm">
                  {lang}
                </span>
              ))}
              {project.languages.length === 0 && !project.project_type && (
                <span className="text-zinc-600 text-sm">Unknown</span>
              )}
            </div>
          </section>

          {/* Git Status */}
          {project.has_git && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Git Status</h2>
                <GitStatusBadge branch={project.git_branch} status={gitStatus} />
              </div>
              
              {gitStatus && (
                <div className="space-y-4">
                  {!gitStatus.is_clean && (
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="bg-zinc-800 rounded py-2">
                        <div className="text-zinc-500 mb-1">Modified</div>
                        <div className="text-amber-400 font-medium">{gitStatus.modified_files.length}</div>
                      </div>
                      <div className="bg-zinc-800 rounded py-2">
                        <div className="text-zinc-500 mb-1">Staged</div>
                        <div className="text-emerald-400 font-medium">{gitStatus.staged_files.length}</div>
                      </div>
                      <div className="bg-zinc-800 rounded py-2">
                        <div className="text-zinc-500 mb-1">Untracked</div>
                        <div className="text-zinc-300 font-medium">{gitStatus.untracked_files.length}</div>
                      </div>
                    </div>
                  )}

                  {gitStatus.recent_commits.length > 0 && (
                    <div>
                      <div className="text-xs text-zinc-500 mb-2">Recent Commits</div>
                      <div className="space-y-3">
                        {gitStatus.recent_commits.slice(0, 3).map(commit => (
                          <div key={commit.hash} className="text-sm">
                            <div className="flex items-center text-zinc-300">
                              <GitCommitIcon className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                              <span className="truncate">{commit.message}</span>
                            </div>
                            <div className="flex items-center text-xs text-zinc-500 mt-1 ml-5.5">
                              <span className="font-mono bg-zinc-800 px-1 rounded mr-2">{commit.short_hash}</span>
                              {commit.author}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {trustConfigDialog && (
        <TrustDialog
          config={trustConfigDialog}
          onCancel={() => setTrustConfigDialog(null)}
          onRunOnce={() => {
            startProcess.mutate(trustConfigDialog.id);
            setTrustConfigDialog(null);
          }}
          onTrustAndRun={async () => {
            await tauriApi.trustRunConfig(trustConfigDialog.id);
            startProcess.mutate(trustConfigDialog.id);
            setTrustConfigDialog(null);
          }}
        />
      )}
    </div>
  );
}
