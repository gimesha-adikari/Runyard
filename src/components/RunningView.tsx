import { useProcesses, useStopProcess, useStartProcess } from '../hooks/use-processes';
import { useProjects } from '../hooks/use-projects';
import { useUiStore } from '../stores/ui-store';
import { LogViewer } from './LogViewer';
import {
  Play,
  Square,
  RotateCw,
  RefreshCw,
  OctagonAlert,
  Terminal,
  X,
  Layers,
} from 'lucide-react';
import { cn, formatElapsedDuration, getErrorMessage } from '../lib/utils';
import { toast } from '../stores/toast-store';
import { useState, useMemo } from 'react';

export function RunningView() {
  const { data: processes = [], isLoading: pLoading } = useProcesses();
  const { data: projects = [], isLoading: projLoading } = useProjects();
  const stopProcess = useStopProcess();
  const startProcess = useStartProcess();
  const { selectedProcessIdForLogs, setSelectedProcessIdForLogs } = useUiStore();

  const [filterText, setFilterText] = useState('');
  const [showLogsInView, setShowLogsInView] = useState(true);

  const activeProcesses = useMemo(
    () => processes.filter((p) => p.status === 'Running' || p.status === 'Starting'),
    [processes]
  );

  const filteredProcesses = useMemo(() => {
    if (!filterText.trim()) return processes;
    const lower = filterText.toLowerCase();
    return processes.filter(
      (p) =>
        p.run_config_name.toLowerCase().includes(lower) ||
        (projects.find((pr) => pr.id === p.project_id)?.name || '').toLowerCase().includes(lower)
    );
  }, [processes, projects, filterText]);

  // Group processes by project
  const grouped = useMemo(() => {
    const map = new Map<string, typeof processes>();
    filteredProcesses.forEach((p) => {
      const proj = projects.find((pr) => pr.id === p.project_id);
      const groupName = proj?.name || 'Unknown Project';
      if (!map.has(groupName)) map.set(groupName, []);
      map.get(groupName)!.push(p);
    });
    return map;
  }, [filteredProcesses, projects]);

  const activeProcessForLogs = useMemo(() => {
    if (selectedProcessIdForLogs) {
      const found = processes.find((p) => p.id === selectedProcessIdForLogs);
      if (found) return found;
    }
    return activeProcesses[0] || processes[0] || null;
  }, [processes, selectedProcessIdForLogs, activeProcesses]);

  if (pLoading || projLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-xs">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Loading process supervisor...
      </div>
    );
  }

  const handleStop = async (processId: string) => {
    try {
      await stopProcess.mutateAsync(processId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleRestart = async (configId: string) => {
    try {
      const proc = await startProcess.mutateAsync(configId);
      setSelectedProcessIdForLogs(proc.id);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleStopAll = async () => {
    if (activeProcesses.length === 0) return;
    try {
      for (const p of activeProcesses) {
        await stopProcess.mutateAsync(p.id);
      }
      toast.success(`Stopped ${activeProcesses.length} processes`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-zinc-300 select-none overflow-hidden">
      {/* Supervisor Header matching Stitch Reference 2 */}
      <div className="px-4 sm:px-6 h-11 border-b border-[#1b1b20] bg-[#0c0c0e] shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xs font-semibold text-zinc-200 tracking-wide uppercase font-mono">
            Running Services
          </h1>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-950/70 border border-emerald-800/60 text-emerald-400">
            {activeProcesses.length} Active
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter processes search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter processes..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="bg-[#141418] border border-zinc-800/80 rounded-[3px] px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 w-36 sm:w-48 transition-all duration-fast"
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText('')}
                className="absolute right-1.5 top-1.5 text-zinc-500 hover:text-zinc-300 btn-tactile transition-colors duration-fast"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Stop All Button */}
          {activeProcesses.length > 0 && (
            <button
              type="button"
              onClick={handleStopAll}
              disabled={stopProcess.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/40 hover:bg-red-900/50 border border-red-800/60 text-red-300 text-xs font-medium rounded-[3px] btn-tactile transition-colors duration-fast"
              title="Stop all running processes"
            >
              <OctagonAlert className="w-3 h-3" />
              <span className="hidden sm:inline">Stop All</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Supervisor Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Process Table (Dense) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[160px]">
          {processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-xs gap-2">
              <Layers className="w-8 h-8 text-zinc-700 opacity-60" />
              <p>No active or recent processes.</p>
            </div>
          ) : (
            <div className="bg-[#0c0c0e] border border-border-card rounded-[4px] overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#121216] border-b border-border-card text-zinc-400 text-[11px] font-mono">
                  <tr>
                    <th className="px-3.5 py-2 font-medium">Service / Config</th>
                    <th className="px-3.5 py-2 font-medium">Status</th>
                    <th className="px-3.5 py-2 font-medium hidden sm:table-cell">PID</th>
                    <th className="px-3.5 py-2 font-medium">Runtime</th>
                    <th className="px-3.5 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-card">
                  {Array.from(grouped.entries()).map(([groupName, procs]) => (
                    <div key={groupName} className="contents">
                      {/* Project Section Header */}
                      <tr className="bg-[#0e0e11]">
                        <td
                          colSpan={5}
                          className="px-3.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono"
                        >
                          {groupName}
                        </td>
                      </tr>

                      {/* Process Rows */}
                      {procs.map((proc) => {
                        const isRunning =
                          proc.status === 'Running' || proc.status === 'Starting';
                        const isSelected = activeProcessForLogs?.id === proc.id;

                        return (
                          <tr
                            key={proc.id}
                            onClick={() => setSelectedProcessIdForLogs(proc.id)}
                            className={cn(
                              'hover:bg-[#141418] transition-colors duration-fast cursor-pointer group',
                              isSelected && 'bg-[#18181f]'
                            )}
                          >
                            <td className="px-3.5 py-2.5 font-medium text-zinc-200">
                              <div className="flex items-center gap-2">
                                <Terminal className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 transition-colors shrink-0" />
                                <span className="font-mono text-xs text-zinc-200">
                                  {proc.run_config_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                <span
                                  className={cn(
                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                    isRunning
                                      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                                      : proc.exit_code !== 0
                                      ? 'bg-red-400'
                                      : 'bg-zinc-600'
                                  )}
                                />
                                <span
                                  className={
                                    isRunning
                                      ? 'text-emerald-400'
                                      : proc.exit_code !== 0
                                      ? 'text-red-400'
                                      : 'text-zinc-500'
                                  }
                                >
                                  {proc.status}
                                </span>
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 font-mono text-zinc-500 text-[11px] hidden sm:table-cell">
                              {proc.pid || '—'}
                            </td>
                            <td className="px-3.5 py-2.5 text-zinc-400 font-mono text-[11px]">
                              {isRunning
                                ? formatElapsedDuration(proc.started_at)
                                : proc.exit_code !== null
                                ? `Exit (${proc.exit_code})`
                                : '—'}
                            </td>
                            <td className="px-3.5 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isRunning ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRestart(proc.run_config_id);
                                      }}
                                      className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-[2px] btn-tactile transition-colors duration-fast"
                                      title="Restart"
                                    >
                                      <RotateCw className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStop(proc.id);
                                      }}
                                      className="p-1 hover:bg-red-950/60 text-red-400 rounded-[2px] btn-tactile transition-colors duration-fast"
                                      title="Stop"
                                    >
                                      <Square className="w-3 h-3 fill-red-400/40" />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRestart(proc.run_config_id);
                                    }}
                                    className="p-1 hover:bg-emerald-950/60 text-emerald-400 rounded-[2px] btn-tactile transition-colors duration-fast"
                                    title="Rerun"
                                  >
                                    <Play className="w-3 h-3 fill-emerald-400/30 ml-0.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </div>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Integrated Log Viewer matching Stitch Reference 2 */}
        {showLogsInView && activeProcessForLogs && (
          <div className="h-56 sm:h-64 border-t border-border-card bg-[#0c0c0e] flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#121216] border-b border-border-card text-xs font-mono shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-zinc-200 font-semibold">
                  {activeProcessForLogs.run_config_name} logs
                </span>
                <span className="text-zinc-500 text-[10px]">
                  PID: {activeProcessForLogs.pid || '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowLogsInView(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded-[2px] btn-tactile transition-colors duration-fast"
                title="Hide logs"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 p-3 overflow-hidden">
              <LogViewer processId={activeProcessForLogs.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
