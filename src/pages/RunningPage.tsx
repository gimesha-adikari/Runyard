import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProcesses, useStopProcess, useRestartProcess } from '../hooks/use-processes';
import { useProjects } from '../hooks/use-projects';
import { toast } from '../stores/toast-store';
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
  Folder,
  AlertCircle,
} from 'lucide-react';
import { formatElapsedDuration, cn } from '../lib/utils';
import { ProcessInfo } from '../types';

export function RunningPage() {
  const { data: processes = [] } = useProcesses();
  const { data: projects = [] } = useProjects();
  const stopProcess = useStopProcess();
  const restartProcess = useRestartProcess();
  const navigate = useNavigate();

  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'exited'>('active');
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeProcesses = useMemo(
    () => processes.filter((p) => p.status === 'Running' || p.status === 'Starting' || p.status === 'Stopping'),
    [processes]
  );

  const exitedProcesses = useMemo(
    () => processes.filter((p) => p.status === 'Stopped' || p.status === 'Failed' || p.status === 'Exited'),
    [processes]
  );

  const displayedProcesses = useMemo(() => {
    if (filterMode === 'active') return activeProcesses;
    if (filterMode === 'exited') return exitedProcesses;
    return processes;
  }, [filterMode, activeProcesses, exitedProcesses, processes]);

  const processesByProject = useMemo(() => {
    const map = new Map<string, { project?: any; processes: ProcessInfo[] }>();
    for (const proc of displayedProcesses) {
      const proj = projects.find((p) => p.id === proc.project_id);
      const groupKey = proc.project_id || 'unknown';
      if (!map.has(groupKey)) {
        map.set(groupKey, { project: proj, processes: [] });
      }
      map.get(groupKey)!.processes.push(proc);
    }
    return Array.from(map.entries());
  }, [displayedProcesses, projects]);

  const toggleExpand = (id: string) => {
    setExpandedLogs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStopAll = () => {
    if (activeProcesses.length === 0) return;
    activeProcesses.forEach((p) => stopProcess.mutate(p.id));
    toast.info(`Stopping all ${activeProcesses.length} active services`);
  };

  const handleRestartProcess = async (proc: ProcessInfo) => {
    try {
      await restartProcess.mutateAsync(proc.id);
      toast.info(`Restarting ${proc.run_config_name}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to restart process');
    }
  };

  const handleStopProcess = async (proc: ProcessInfo) => {
    try {
      await stopProcess.mutateAsync(proc.id);
      toast.info(`Stopped ${proc.run_config_name}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to stop process');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center">
            <Terminal className="w-5 h-5 mr-2 text-emerald-500" />
            Process Supervisor
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {activeProcesses.length} active {activeProcesses.length === 1 ? 'service' : 'services'} across{' '}
            {projects.length} projects
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* Filter Pills */}
          <div className="flex bg-zinc-900 rounded-lg border border-zinc-800 p-1 text-xs">
            <button
              onClick={() => setFilterMode('active')}
              className={cn(
                'px-2.5 py-1 rounded transition-colors font-medium',
                filterMode === 'active'
                  ? 'bg-zinc-800 text-emerald-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              Active ({activeProcesses.length})
            </button>
            <button
              onClick={() => setFilterMode('exited')}
              className={cn(
                'px-2.5 py-1 rounded transition-colors font-medium',
                filterMode === 'exited'
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              Exited ({exitedProcesses.length})
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={cn(
                'px-2.5 py-1 rounded transition-colors font-medium',
                filterMode === 'all'
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              All ({processes.length})
            </button>
          </div>

          {activeProcesses.length > 0 && (
            <button
              onClick={handleStopAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 rounded-lg text-xs font-medium transition-colors"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Stop All ({activeProcesses.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Processes Area */}
      {processes.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            icon={Play}
            title="No running processes"
            description="Start a service or run configuration from any project to supervise processes."
            action={{ label: 'Browse Projects', onClick: () => navigate('/projects') }}
          />
        </div>
      ) : displayedProcesses.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 text-xs bg-zinc-900/40 rounded-xl border border-zinc-800">
          No processes found matching the "{filterMode}" filter.
        </div>
      ) : (
        <div className="space-y-6">
          {processesByProject.map(([projectId, group]) => {
            const projectName = group.project?.name || 'Project';
            return (
              <div key={projectId} className="space-y-3">
                {/* Project Group Header */}
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-emerald-500" />
                    <button
                      onClick={() => navigate(`/projects/${projectId}`)}
                      className="font-semibold text-sm text-zinc-200 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                    >
                      <span>{projectName}</span>
                      <ExternalLink className="w-3 h-3 text-zinc-500" />
                    </button>
                    {group.project?.path && (
                      <span className="text-[11px] font-mono text-zinc-500 hidden md:inline">
                        ({group.project.path})
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-zinc-500 font-mono">
                    {group.processes.length} {group.processes.length === 1 ? 'process' : 'processes'}
                  </span>
                </div>

                {/* Process Cards in Group */}
                <div className="space-y-3">
                  {group.processes.map((proc) => {
                    const isRunning = proc.status === 'Running' || proc.status === 'Starting';
                    const isFailed = proc.status === 'Failed';
                    const isExpanded = expandedLogs[proc.id] !== false; // default expanded

                    return (
                      <div
                        key={proc.id}
                        className={cn(
                          'bg-zinc-900 border rounded-xl overflow-hidden shadow-sm transition-colors',
                          isFailed
                            ? 'border-red-900/60 bg-red-950/10'
                            : isRunning
                            ? 'border-zinc-800 hover:border-zinc-700'
                            : 'border-zinc-850 opacity-90'
                        )}
                      >
                        <div className="px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-semibold text-zinc-100 text-sm truncate">
                                {proc.run_config_name}
                              </span>
                              <ProcessStatusBadge status={proc.status} />

                              {isFailed && (
                                <span className="flex items-center gap-1 text-[10px] text-red-400 font-mono bg-red-950/80 px-1.5 py-0.2 rounded border border-red-800">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Non-zero exit code: {proc.exit_code ?? 'unknown'}</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-zinc-400 text-[11px] font-mono flex-wrap">
                              <span>PID: {proc.pid || '—'}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-zinc-500" />
                                <span>
                                  {isRunning
                                    ? `Running for ${formatElapsedDuration(proc.started_at)}`
                                    : `Exited with code ${proc.exit_code ?? 0}`}
                                </span>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isRunning ? (
                              <>
                                <button
                                  onClick={() => handleRestartProcess(proc)}
                                  className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                                  title="Restart Process"
                                >
                                  <RotateCw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleStopProcess(proc)}
                                  className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
                                  title="Stop Process"
                                >
                                  <Square className="w-3 h-3" />
                                  <span>Stop</span>
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRestartProcess(proc)}
                                className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
                              >
                                <RotateCw className="w-3 h-3" />
                                <span>Rerun</span>
                              </button>
                            )}

                            <button
                              onClick={() => toggleExpand(proc.id)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md transition-colors"
                              title={isExpanded ? 'Collapse Logs' : 'Expand Logs'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Log Viewer */}
                        {isExpanded && <LogViewer processId={proc.id} className="h-64 border-none rounded-none" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
