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
} from 'lucide-react';
import { Project } from '../types';
import { useToggleFavorite } from '../hooks/use-projects';
import { useProcesses, useStartProcess, useStopProcess } from '../hooks/use-processes';
import { useRunConfigs } from '../hooks/use-run-configs';
import { useDetectedIdes, useOpenInIde } from '../hooks/use-ides';
import { useSettings } from '../hooks/use-settings';
import { tauriApi } from '../lib/tauri';
import { toast } from '../stores/toast-store';
import { getErrorMessage, truncatePath, formatRelativeTime, cn } from '../lib/utils';
import { useUiStore } from '../stores/ui-store';

interface Props {
  project: Project;
  onOpen: (id: string) => void;
  onRemove?: (project: Project) => void;
}

export function ProjectListItem({ project, onOpen }: Props) {
  const toggleFav = useToggleFavorite();
  const { data: processes = [] } = useProcesses();
  const { data: runConfigs = [] } = useRunConfigs(project.id);
  const { data: detectedIdes = [] } = useDetectedIdes();
  const { data: settings } = useSettings();
  const openInIde = useOpenInIde();
  const startProcess = useStartProcess();
  const stopProcess = useStopProcess();

  const projectProcesses = processes.filter((p) => p.project_id === project.id);
  const runningProcess = projectProcesses.find((p) => p.status === 'Running' || p.status === 'Starting');
  const isRunning = !!runningProcess;

  const preferredIde =
    detectedIdes.find((i) => i.id === project.preferred_ide) ||
    detectedIdes.find((i) => i.id === settings?.default_ide) ||
    detectedIdes[0];
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
        const proc = await startProcess.mutateAsync(defaultConfig.id);
        useUiStore.getState().setSelectedProcessIdForLogs(proc.id);
        toast.success(`Started ${defaultConfig.name}`);
      } catch (err) {
        toast.error(getErrorMessage(err) || 'Failed to start process');
      }
    }
  };

  return (
    <div
      onClick={() => onOpen(project.id)}
      className="bg-[#121216] border border-border-card hover:border-border-card-hover rounded-[4px] p-2.5 cursor-pointer hover:bg-surface-card-hover active:bg-surface-card-active transition-all duration-fast flex items-center justify-between gap-4 text-xs group select-none"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={handleToggleFavorite}
          className="text-zinc-500 hover:text-amber-400 p-1 rounded-[2px] shrink-0 btn-tactile transition-colors duration-fast"
          title={project.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={cn('w-4 h-4', project.is_favorite && 'fill-amber-400 text-amber-400')} />
        </button>

        <div
          className={cn(
            'p-1.5 rounded-[3px] shrink-0 transition-colors duration-fast',
            isRunning ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#18181e] text-zinc-400 group-hover:text-zinc-300'
          )}
        >
          <Folder className="w-3.5 h-3.5" />
        </div>

        <div className="w-1/4 min-w-[150px] max-w-xs">
          <div className="font-semibold text-zinc-100 truncate group-hover:text-emerald-400 transition-colors flex items-center gap-2">
            <span>{project.name}</span>
            {isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)] shrink-0" />
            )}
          </div>
          <div className="text-[11px] text-zinc-400 truncate font-mono">
            {truncatePath(project.path, 35)}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 w-32 shrink-0">
          {project.project_type && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[2px] bg-zinc-800/80 text-zinc-300 font-mono uppercase text-[10px]">
              <Code className="w-3 h-3 mr-1 text-zinc-500" />
              {project.project_type}
            </span>
          )}
        </div>

        <div className="hidden md:flex items-center gap-2 w-36 shrink-0">
          {project.git_branch && (
            <span className="inline-flex items-center text-[11px] text-purple-300 font-mono">
              <GitBranch className="w-3 h-3 mr-1 text-purple-400" />
              <span className="truncate max-w-[110px]">{project.git_branch}</span>
            </span>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-1.5 flex-1 min-w-0">
          {project.languages.map((l) => (
            <span
              key={l}
              className="px-1.5 py-0.2 bg-emerald-950/40 border border-emerald-800/30 text-emerald-300 text-[10px] rounded-[2px] shrink-0"
            >
              {l}
            </span>
          ))}
          {project.frameworks.map((f) => (
            <span
              key={f}
              className="px-1.5 py-0.2 bg-blue-950/40 border border-blue-800/30 text-blue-300 text-[10px] rounded-[2px] shrink-0"
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[11px] text-zinc-400 whitespace-nowrap font-mono">
          {formatRelativeTime(project.last_opened)}
        </span>

        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity duration-fast">
          {defaultConfig && (
            <button
              onClick={handleToggleRun}
              className={cn(
                'p-1.5 rounded-[3px] btn-tactile transition-colors duration-fast',
                isRunning
                  ? 'bg-red-950/80 text-red-400 hover:bg-red-900 border border-red-800/60'
                  : 'bg-zinc-800 hover:bg-emerald-950/80 text-emerald-400 border border-transparent hover:border-emerald-800/40'
              )}
              title={isRunning ? `Stop (${runningProcess?.run_config_name})` : `Run (${defaultConfig.name})`}
            >
              {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          )}

          {preferredIde && (
            <button
              onClick={handleOpenIde}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-[3px] btn-tactile transition-colors duration-fast"
              title={`Open in ${preferredIde.name}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleOpenFolder}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-[3px] btn-tactile transition-colors duration-fast"
            title="Open Folder"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleOpenTerminal}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-[3px] btn-tactile transition-colors duration-fast"
            title="Open Terminal"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
