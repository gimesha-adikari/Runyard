import { useProcesses, useStopProcess, useStartProcess } from '../hooks/use-processes';
import { useProjects } from '../hooks/use-projects';
import { Play, Square, RotateCw, RefreshCw, Terminal, XCircle, Clock } from 'lucide-react';
import { cn, formatElapsedDuration, getErrorMessage } from '../lib/utils';
import { toast } from '../stores/toast-store';
import { ProcessStatusBadge } from './ProcessStatusBadge';
import { useState } from 'react';

export function RunningView() {
  const { data: processes = [], isLoading: pLoading } = useProcesses();
  const { data: projects = [], isLoading: projLoading } = useProjects();
  const stopProcess = useStopProcess();
  const startProcess = useStartProcess();
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);

  if (pLoading || projLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <RefreshCw className="w-5 h-5 animate-spin" />
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
      await startProcess.mutateAsync(configId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950 shrink-0 flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          Process Supervisor
        </h1>
        <div className="text-xs text-zinc-500 font-mono">
          {processes.length} total processes
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {processes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <XCircle className="w-12 h-12 mb-4 opacity-20" />
            <p>No processes found.</p>
          </div>
        ) : (
          <div className="bg-[#111] border border-zinc-800/80 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#111] text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Config</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">PID</th>
                  <th className="px-4 py-3 font-semibold">Runtime</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {processes.map(proc => {
                  const proj = projects.find(p => p.id === proc.project_id);
                  const isRunning = proc.status === 'Running' || proc.status === 'Starting';
                  
                  return (
                    <tr 
                      key={proc.id} 
                      className={cn(
                        "hover:bg-zinc-800/50 transition-colors cursor-pointer",
                        selectedProcessId === proc.id && "bg-zinc-800/80"
                      )}
                      onClick={() => setSelectedProcessId(proc.id)}
                    >
                      <td className="px-4 py-3 font-medium text-zinc-300">
                        {proj?.name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-400">
                        {proc.run_config_name}
                      </td>
                      <td className="px-4 py-3">
                        <ProcessStatusBadge status={proc.status} exitCode={proc.exit_code} />
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500">
                        {proc.pid || '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {isRunning ? formatElapsedDuration(proc.started_at) : (proc.exit_code !== null ? `Exited (${proc.exit_code})` : '—')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isRunning ? (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); handleRestart(proc.run_config_id); }} className="p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded" title="Restart">
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleStop(proc.id); }} className="p-1.5 hover:bg-red-900 text-red-400 hover:text-red-300 rounded" title="Stop">
                                <Square className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); handleRestart(proc.run_config_id); }} className="p-1.5 hover:bg-emerald-900 text-emerald-400 hover:text-emerald-300 rounded" title="Rerun">
                              <Play className="w-3.5 h-3.5" />
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
        )}
      </div>
    </div>
  );
}
