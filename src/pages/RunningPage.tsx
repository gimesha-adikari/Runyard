import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProcesses, useStopProcess, useRestartProcess } from '../hooks/use-processes';
import { ProcessStatusBadge } from '../components/ProcessStatusBadge';
import { LogViewer } from '../components/LogViewer';
import { EmptyState } from '../components/EmptyState';
import {
  Play,
  Square,
  RotateCw,
  Terminal,
  StopCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { formatRelativeTime } from '../lib/utils';

export function RunningPage() {
  const { data: processes = [] } = useProcesses();
  const stopProcess = useStopProcess();
  const restartProcess = useRestartProcess();
  const navigate = useNavigate();

  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const activeProcesses = processes.filter(
    (p) => p.status === 'Running' || p.status === 'Starting' || p.status === 'Stopping'
  );
  const stoppedProcesses = processes.filter(
    (p) => p.status === 'Stopped' || p.status === 'Failed' || p.status === 'Exited'
  );

  const toggleExpand = (id: string) => {
    setExpandedLogs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStopAll = () => {
    activeProcesses.forEach((p) => stopProcess.mutate(p.id));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center">
            <Terminal className="w-6 h-6 mr-3 text-emerald-500" />
            Running Processes
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {activeProcesses.length} active {activeProcesses.length === 1 ? 'service' : 'services'}
          </p>
        </div>

        {activeProcesses.length > 0 && (
          <button
            onClick={handleStopAll}
            className="flex items-center px-4 py-2 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 rounded-md text-xs font-medium transition-colors"
          >
            <StopCircle className="w-4 h-4 mr-2" />
            Stop All Active Services
          </button>
        )}
      </div>

      {processes.length === 0 ? (
        <div className="mt-20">
          <EmptyState
            icon={Play}
            title="Nothing is running"
            description="Go to a project to start a service or run configuration."
            action={{ label: 'Browse Projects', onClick: () => navigate('/projects') }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {activeProcesses.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                Active Services ({activeProcesses.length})
              </h2>
              {activeProcesses.map((proc) => {
                const isExpanded = expandedLogs[proc.id] !== false; // default expanded
                return (
                  <div
                    key={proc.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-md"
                  >
                    <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/90 flex justify-between items-center text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-zinc-100 text-sm">
                            {proc.run_config_name}
                          </span>
                          <ProcessStatusBadge status={proc.status} />
                        </div>
                        <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
                          <span className="font-mono">PID: {proc.pid || '—'}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-500" />
                            Started {formatRelativeTime(proc.started_at)}
                          </span>
                          <span>•</span>
                          <button
                            onClick={() => navigate(`/projects/${proc.project_id}`)}
                            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                          >
                            <span>Go to Project</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => restartProcess.mutate(proc.id)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                          title="Restart Process"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => stopProcess.mutate(proc.id)}
                          className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
                          title="Stop Process"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop</span>
                        </button>
                        <button
                          onClick={() => toggleExpand(proc.id)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-md transition-colors"
                          title={isExpanded ? 'Collapse Logs' : 'Expand Logs'}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && <LogViewer processId={proc.id} />}
                  </div>
                );
              })}
            </section>
          )}

          {stoppedProcesses.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
                Exited / Stopped ({stoppedProcesses.length})
              </h2>
              <div className="grid gap-2">
                {stoppedProcesses.map((proc) => (
                  <div
                    key={proc.id}
                    className="p-3.5 bg-zinc-900/60 border border-zinc-800/60 rounded-lg flex justify-between items-center text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-medium text-zinc-300">{proc.run_config_name}</span>
                        <ProcessStatusBadge status={proc.status} />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {proc.exit_code !== null && proc.exit_code !== undefined
                          ? `Exited with code ${proc.exit_code}`
                          : 'Stopped manually'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/projects/${proc.project_id}`)}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors"
                      >
                        Project
                      </button>
                      <button
                        onClick={() => restartProcess.mutate(proc.id)}
                        className="px-3 py-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded text-xs transition-colors flex items-center gap-1"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Restart</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
