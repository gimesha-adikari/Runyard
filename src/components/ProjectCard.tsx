import type { MouseEvent } from 'react';
import {
  Star,
  Folder,
  GitBranch,
  Code,
  ExternalLink,
  Terminal,
  FolderOpen,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { Project } from '../types';
import { useToggleFavorite } from '../hooks/use-projects';
import { useProcesses, useStartProcess, useStopProcess } from '../hooks/use-processes';
import { useRunConfigs } from '../hooks/use-run-configs';
import { useDetectedIdes, useOpenInIde } from '../hooks/use-ides';
import { tauriApi } from '../lib/tauri';
import { toast } from '../stores/toast-store';
import { getErrorMessage, truncatePath, formatRelativeTime, cn } from '../lib/utils';

interface Props {
  project: Project;
  onOpen: (id: string) => void;
  onRemove?: (project: Project) => void;
}

export function ProjectCard({ project, onOpen, onRemove }: Props) {
  const toggleFav = useToggleFavorite();
  const { data: processes = [] } = useProcesses();
  const { data: runConfigs = [] } = useRunConfigs(project.id);
  const { data: detectedIdes = [] } = useDetectedIdes();
  const openInIde = useOpenInIde();
  const startProcess = useStartProcess();
  const stopProcess = useStopProcess();

  const projectProcesses = processes.filter((p) => p.project_id === project.id);
  const runningProcess = projectProcesses.find((p) => p.status === 'Running' || p.status === 'Starting');
  const isRunning = !!runningProcess;

  const preferredIde = detectedIdes.find((i) => i.id === project.preferred_ide) || detectedIdes[0];

  const defaultConfig =
    runConfigs.find((c) => c.id === project.default_run_config_id || c.is_default) || runConfigs[0];

  const handleToggleFavorite = (e: MouseEvent) => {
    e.stopPropagation();
    toggleFav.mutate(project.id);
  };

  const handleOpenIde = (e: MouseEvent) => {
    e.stopPropagation();
    if (preferredIde) {
      openInIde.mutate(
        { command: preferredIde.command, projectPath: project.path },
        {
          onSuccess: () => toast.success(`Opened in ${preferredIde.name}`),
          onError: (err: any) => toast.error(getErrorMessage(err) || 'Failed to open in IDE'),
        }
      );
    } else {
      toast.warning('No detected IDE available');
    }
  };

  const handleOpenFolder = (e: MouseEvent) => {
    e.stopPropagation();
    tauriApi.openFolder(project.path).catch((e) => toast.error(getErrorMessage(e) || 'Failed to open folder'));
  };

  const handleOpenTerminal = (e: MouseEvent) => {
    e.stopPropagation();
    tauriApi.openTerminal(project.path).catch((e) => toast.error(getErrorMessage(e) || 'Failed to open terminal'));
  };

  const handleToggleRun = async (e: MouseEvent) => {
    e.stopPropagation();
    if (isRunning && runningProcess) {
      try {
        await stopProcess.mutateAsync(runningProcess.id);
        toast.info(`Stopped ${runningProcess.run_config_name}`);
      } catch (err) {
        toast.error(getErrorMessage(err) || 'Failed to stop process');
      }
    } else if (defaultConfig) {
      if (!defaultConfig.is_trusted) {
        onOpen(project.id);
        return;
      }
      try {
        await startProcess.mutateAsync(defaultConfig.id);
        toast.success(`Started ${defaultConfig.name}`);
      } catch (err) {
        toast.error(getErrorMessage(err) || 'Failed to start process');
      }
    }
  };

  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(project);
    }
  };

  return (
    <div
      onClick={() => onOpen(project.id)}
      className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 cursor-pointer transition-all duration-150 group flex flex-col justify-between h-full shadow-sm hover:shadow-md relative"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center min-w-0 gap-2">
            <div
              className={cn(
                'p-1.5 rounded-lg shrink-0 transition-colors',
                isRunning
                  ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50'
                  : 'bg-zinc-800 text-zinc-400 group-hover:text-zinc-200'
              )}
            >
              <Folder className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-zinc-100 truncate group-hover:text-emerald-400 transition-colors">
                {project.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isRunning && (
              <span className="flex items-center gap-1 px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] font-mono rounded-full font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            )}
            <button
              onClick={handleToggleFavorite}
              className="text-zinc-500 hover:text-amber-400 p-1 rounded hover:bg-zinc-800 transition-colors"
              title={project.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={project.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star
                className={cn('w-4 h-4', project.is_favorite && 'fill-amber-400 text-amber-400')}
              />
            </button>
          </div>
        </div>

        <div className="text-[11px] text-zinc-400 truncate mb-3 font-mono">
          {truncatePath(project.path)}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {project.project_type && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono uppercase">
              <Code className="w-3 h-3 mr-1 text-zinc-500" />
              {project.project_type}
            </span>
          )}
          {project.git_branch && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-purple-950/40 border border-purple-800/40 text-purple-300 font-mono">
              <GitBranch className="w-3 h-3 mr-1 text-purple-400" />
              <span className="truncate max-w-[100px]">{project.git_branch}</span>
            </span>
          )}
          {project.languages.slice(0, 2).map((l) => (
            <span
              key={l}
              className="px-1.5 py-0.2 bg-emerald-950/40 border border-emerald-800/30 text-emerald-300 text-[10px] rounded"
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
        <span className="text-[11px] text-zinc-400">
          {formatRelativeTime(project.last_opened)}
        </span>

        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          {defaultConfig && (
            <button
              onClick={handleToggleRun}
              className={cn(
                'p-1.5 rounded transition-colors',
                isRunning
                  ? 'bg-red-950/80 text-red-400 hover:bg-red-900 border border-red-800/60'
                  : 'bg-zinc-800 text-emerald-400 hover:bg-emerald-950/80 hover:border-emerald-800'
              )}
              title={isRunning ? `Stop (${runningProcess?.run_config_name})` : `Run (${defaultConfig.name})`}
            >
              {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          )}

          {preferredIde && (
            <button
              onClick={handleOpenIde}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
              title={`Open in ${preferredIde.name}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleOpenFolder}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
            title="Open in File Manager"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleOpenTerminal}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
            title="Open System Terminal"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>

          {onRemove && (
            <button
              onClick={handleRemove}
              className="p-1.5 bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 rounded transition-colors"
              title="Remove from Runyard"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
