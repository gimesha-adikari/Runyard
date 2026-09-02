import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useScanProjects } from '../hooks/use-projects';
import { useProcesses, useStopProcess, useRestartProcess } from '../hooks/use-processes';
import { useUiStore } from '../stores/ui-store';
import { toast } from '../stores/toast-store';
import { ProjectCard } from '../components/ProjectCard';
import { ProcessStatusBadge } from '../components/ProcessStatusBadge';
import { ImportProjectDialog } from '../components/ImportProjectDialog';
import {
  Clock,
  Star,
  Play,
  Terminal,
  Search,
  StopCircle,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  FolderPlus,
  RotateCw,
} from 'lucide-react';
import { getErrorMessage, formatElapsedDuration } from '../lib/utils';

export function OverviewPage() {
  const navigate = useNavigate();
  const { toggleCommandPalette } = useUiStore();
  const { data: projects = [], isLoading } = useProjects();
  const { data: processes = [] } = useProcesses();
  const scanProjects = useScanProjects();
  const stopProcess = useStopProcess();
  const restartProcess = useRestartProcess();

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const recentProjects = [...projects]
    .filter((p) => p.last_opened)
    .sort((a, b) => new Date(b.last_opened!).getTime() - new Date(a.last_opened!).getTime())
    .slice(0, 4);

  const favoriteProjects = projects.filter((p) => p.is_favorite);
  const activeProcesses = processes.filter((p) => p.status === 'Running' || p.status === 'Starting');
  const failedProcesses = processes.filter((p) => p.status === 'Failed');

  const attentionProjects = projects.filter((p) => {
    return failedProcesses.some((fp) => fp.project_id === p.id);
  });

  const handleScan = async () => {
    try {
      await scanProjects.mutateAsync();
      toast.success('Projects scan completed');
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Failed to scan projects');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Command Center</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Local developer projects & process supervisor</p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={toggleCommandPalette}
            className="flex items-center px-3.5 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors text-xs w-full sm:w-auto justify-between gap-4"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-emerald-400" />
              <span>Search actions & projects...</span>
            </div>
            <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px] font-mono border border-zinc-700">
              Ctrl+K
            </kbd>
          </button>

          <button
            onClick={handleScan}
            disabled={scanProjects.isPending}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-lg text-xs transition-colors shrink-0"
            title="Rescan projects"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanProjects.isPending ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
        </div>
      </div>

      {attentionProjects.length > 0 && (
        <section className="bg-red-950/20 border border-red-900/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-400 text-xs font-semibold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Needs Attention ({attentionProjects.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attentionProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="p-3 bg-zinc-950 border border-red-900/50 rounded-lg flex items-center justify-between text-xs cursor-pointer hover:border-red-700 transition-colors"
              >
                <div className="space-y-0.5">
                  <span className="font-semibold text-zinc-200">{p.name}</span>
                  <p className="text-[11px] text-red-400">One or more process executions failed</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-500" />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-200">
              Running Services ({activeProcesses.length})
            </h2>
          </div>
          {activeProcesses.length > 0 && (
            <button
              onClick={() => navigate('/running')}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
            >
              Open Supervisor →
            </button>
          )}
        </div>

        {activeProcesses.length === 0 ? (
          <div className="text-xs text-zinc-500 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-zinc-600 shrink-0" />
            <span>No background services currently running.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeProcesses.map((proc) => {
              const project = projects.find((p) => p.id === proc.project_id);
              return (
                <div
                  key={proc.id}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3.5 flex flex-col justify-between text-xs space-y-3 shadow-sm transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-semibold text-zinc-200 truncate block">
                        {proc.run_config_name}
                      </span>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {project?.name || 'Project'} • PID {proc.pid || '—'}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-mono">
                        {formatElapsedDuration(proc.started_at)}
                      </div>
                    </div>
                    <ProcessStatusBadge status={proc.status} exitCode={proc.exit_code} />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                    <button
                      onClick={() => navigate(`/projects/${proc.project_id}`)}
                      className="px-2.5 py-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                    >
                      Project
                    </button>
                    <button
                      onClick={() => {
                        restartProcess.mutate(proc.id);
                        toast.info(`Restarting ${proc.run_config_name}`);
                      }}
                      className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                      title="Restart"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        stopProcess.mutate(proc.id);
                        toast.info(`Stopped ${proc.run_config_name}`);
                      }}
                      className="px-2.5 py-1 text-[11px] bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 rounded flex items-center gap-1 transition-colors"
                    >
                      <StopCircle className="w-3 h-3" />
                      <span>Stop</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-200">
            Favorite Projects ({favoriteProjects.length})
          </h2>
        </div>
        {favoriteProjects.length === 0 ? (
          <div className="text-xs text-zinc-500 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
            No favorite projects starred yet. Star projects in the catalog for quick access.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {favoriteProjects.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={(projId) => navigate(`/projects/${projId}`)} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Recent Projects</h2>
        </div>
        {!isLoading && recentProjects.length === 0 ? (
          <div className="text-xs text-zinc-500 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
            No recently opened projects yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentProjects.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={(projId) => navigate(`/projects/${projId}`)} />
            ))}
          </div>
        )}
      </section>

      <ImportProjectDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onSuccess={(projId) => navigate(`/projects/${projId}`)}
      />
    </div>
  );
}
