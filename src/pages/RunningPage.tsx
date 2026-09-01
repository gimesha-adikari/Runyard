import { useNavigate } from 'react-router-dom';
import { useProcesses, useStopProcess, useRestartProcess } from '../hooks/use-processes';
import { ProcessStatusBadge } from '../components/ProcessStatusBadge';
import { LogViewer } from '../components/LogViewer';
import { EmptyState } from '../components/EmptyState';
import { Play, Square, RotateCw, Terminal, StopCircle } from 'lucide-react';
import { formatRelativeTime } from '../lib/utils';

export function RunningPage() {
  const { data: processes = [] } = useProcesses();
  const stopProcess = useStopProcess();
  const restartProcess = useRestartProcess();
  const navigate = useNavigate();

  const activeProcesses = processes.filter(p => p.status === 'Running' || p.status === 'Starting');
  const stoppedProcesses = processes.filter(p => p.status === 'Stopped' || p.status === 'Failed');

  const handleStopAll = () => {
    activeProcesses.forEach(p => stopProcess.mutate(p.id));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center">
          <Terminal className="w-6 h-6 mr-3 text-emerald-500" />
          Running Processes
        </h1>
        {activeProcesses.length > 0 && (
          <button
            onClick={handleStopAll}
            className="flex items-center px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md text-sm font-medium transition-colors"
          >
            <StopCircle className="w-4 h-4 mr-2" />
            Stop All
          </button>
        )}
      </div>

      {processes.length === 0 ? (
        <div className="mt-20">
          <EmptyState 
            icon={Play} 
            title="Nothing is running" 
            description="Go to a project to start a run configuration."
            action={{ label: "View Projects", onClick: () => navigate('/projects') }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {activeProcesses.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-medium text-zinc-300">Active ({activeProcesses.length})</h2>
              {activeProcesses.map(proc => (
                <div key={proc.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/80 flex justify-between items-center">
                    <div>
                      <div className="flex items-center">
                        <span className="font-semibold text-zinc-100 mr-3">{proc.run_config_name}</span>
                        <ProcessStatusBadge status={proc.status} />
                      </div>
                      <div className="text-xs text-zinc-500 mt-1 cursor-pointer hover:text-zinc-300" onClick={() => navigate(`/projects/${proc.project_id}`)}>
                        PID: {proc.pid} • Started: {formatRelativeTime(proc.started_at)}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => restartProcess.mutate(proc.id)}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
                        title="Restart"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => stopProcess.mutate(proc.id)}
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition-colors"
                        title="Stop"
                      >
                        <Square className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  </div>
                  <LogViewer processId={proc.id} />
                </div>
              ))}
            </section>
          )}

          {stoppedProcesses.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-medium text-zinc-500">Recent ({stoppedProcesses.length})</h2>
              <div className="grid gap-3">
                {stoppedProcesses.map(proc => (
                  <div key={proc.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center mb-1">
                        <span className="font-medium text-zinc-300 mr-3">{proc.run_config_name}</span>
                        <ProcessStatusBadge status={proc.status} />
                      </div>
                      <div className="text-xs text-zinc-600">
                        {proc.exit_code !== null ? `Exit code: ${proc.exit_code}` : 'Stopped manually'}
                      </div>
                    </div>
                    <button 
                      onClick={() => restartProcess.mutate(proc.id)}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition-colors flex items-center"
                    >
                      <RotateCw className="w-3 h-3 mr-2" />
                      Restart
                    </button>
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
