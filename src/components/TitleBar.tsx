import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X, Play } from 'lucide-react';
import { useUiStore } from '../stores/ui-store';
import { useProjects } from '../hooks/use-projects';
import { useProcesses } from '../hooks/use-processes';
import { cn } from '../lib/utils';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const { activeProjectId, setActiveView } = useUiStore();
  const { data: projects } = useProjects();
  const activeProject = projects?.find((p) => p.id === activeProjectId);

  const { data: processes = [] } = useProcesses();
  const runningCount = processes.filter((p) => p.status === 'Running' || p.status === 'Starting').length;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const checkMaximized = async () => {
      try {
        const win = getCurrentWindow();
        const max = await win.isMaximized();
        setIsMaximized(max);
        unlisten = await win.onResized(async () => {
          const m = await win.isMaximized();
          setIsMaximized(m);
        });
      } catch {
        // Fallback for non-Tauri environment if tested in browser
      }
    };

    checkMaximized();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error('Failed to minimize', e);
    }
  };

  const handleToggleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    } catch (e) {
      console.error('Failed to toggle maximize', e);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error('Failed to close window', e);
    }
  };

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={handleToggleMaximize}
      className="h-8.5 min-h-[34px] max-h-[34px] bg-[#0c0c0e] border-b border-[#1f1f24] flex items-center justify-between px-3 select-none z-50 text-xs shrink-0"
    >
      {/* Left: App Identity & Active Project Info */}
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200 text-[12px] tracking-wide">
          <img src="/runyard.svg" alt="Runyard" className="w-3.5 h-3.5" />
          <span>Runyard</span>
        </div>

        {activeProject ? (
          <div className="flex items-center gap-1.5 ml-2 text-[11px] text-zinc-400 font-mono">
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-medium truncate max-w-[150px]">
              {activeProject.name}
            </span>
            {activeProject.git_branch && (
              <span className="text-[10px] text-purple-400/90 bg-purple-950/30 border border-purple-900/40 px-1 py-0.2 rounded-[2px] truncate max-w-[110px]">
                {activeProject.git_branch}
              </span>
            )}
            {activeProject.languages?.slice(0, 2).map((lang) => (
              <span
                key={lang}
                className="hidden sm:inline-block text-[9px] text-zinc-400 bg-[#141418] border border-[#26262e] px-1 py-0.2 rounded-[2px] uppercase tracking-wider"
              >
                {lang}
              </span>
            ))}
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 ml-2 text-[10px] font-mono text-zinc-500">
            <span className="text-zinc-700">|</span>
            <span>Workspace</span>
          </div>
        )}
      </div>

      {/* Center: Draggable area */}
      <div
        data-tauri-drag-region
        className="flex-1 h-full mx-2 flex items-center justify-center cursor-default"
      />

      {/* Right: Global Running Control & Window Controls */}
      <div className="flex items-center h-full gap-2 -mr-3">
        <button
          type="button"
          onClick={() => setActiveView('running')}
          className={cn(
            'btn-tactile flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[11px] font-mono select-none mr-1 cursor-pointer border',
            runningCount > 0
              ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/60'
              : 'bg-[#141418] border-[#26262e] text-zinc-400 hover:text-zinc-200 hover:bg-[#191920]'
          )}
          title={
            runningCount > 0
              ? `${runningCount} running service${runningCount === 1 ? '' : 's'} (Click to open supervisor)`
              : 'Running Services Supervisor'
          }
        >
          <Play
            className={cn('w-2.5 h-2.5', runningCount > 0 && 'fill-emerald-400 text-emerald-400')}
          />
          <span>{runningCount > 0 ? `${runningCount} Running` : 'Running'}</span>
        </button>

        <button
          type="button"
          onClick={handleMinimize}
          className="h-full px-3.5 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1a20] transition-colors duration-fast focus:outline-none"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5 stroke-[1.5]" />
        </button>

        <button
          type="button"
          onClick={handleToggleMaximize}
          className="h-full px-3.5 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1a20] transition-colors duration-fast focus:outline-none"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Copy className="w-3 h-3 stroke-[1.5] rotate-180" />
          ) : (
            <Square className="w-3 h-3 stroke-[1.5]" />
          )}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="h-full px-3.5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 transition-colors duration-fast focus:outline-none"
          title="Close"
        >
          <X className="w-3.5 h-3.5 stroke-[1.5]" />
        </button>
      </div>
    </header>
  );
}
