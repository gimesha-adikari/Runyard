import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/use-projects';
import { useProcesses, useStopProcess } from '../hooks/use-processes';
import { useUiStore } from '../stores/ui-store';
import { ProjectCard } from '../components/ProjectCard';
import { ProcessStatusBadge } from '../components/ProcessStatusBadge';
import {
  Clock,
  Star,
  Play,
  Terminal,
  Search,
  StopCircle,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react';

export function OverviewPage() {
  const navigate = useNavigate();
  const { toggleCommandPalette } = useUiStore();
  const { data: projects = [], isLoading } = useProjects();
  const { data: processes = [] } = useProcesses();
  const stopProcess = useStopProcess();

  const recentProjects = [...projects]
    .filter((p) => p.last_opened)
    .sort((a, b) => new Date(b.last_opened!).getTime() - new Date(a.last_opened!).getTime())
    .slice(0, 4);

  const favoriteProjects = projects.filter((p) => p.is_favorite);
  const activeProcesses = processes.filter((p) => p.status === 'Running');
  const failedProcesses = processes.filter((p) => p.status === 'Failed');

  // Repositories needing attention: failed processes or uncommitted work
  const attentionProjects = projects.filter((p) => {
    const hasFailed = failedProcesses.some((fp) => fp.project_id === p.id);
    return hasFailed;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
      {/* Header & Quick Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Command Center</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Your local development command center</p>
        </div>

        <button
          onClick={toggleCommandPalette}
          className="flex items-center px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors text-xs w-full sm:w-auto justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search projects & actions...</span>
          </div>
          <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px] font-mono">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Repositories & Services Needing Attention (if any) */}
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
                  <p className="text-[11px] text-red-400">Process execution failed</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-500" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Currently Running Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Running Processes ({activeProcesses.length})</h2>
          </div>
          {activeProcesses.length > 0 && (
            <button
              onClick={() => navigate('/running')}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              View all running →
            </button>
          )}
        </div>

        {activeProcesses.length === 0 ? (
          <div className="text-xs text-zinc-500 bg-zinc-900/40 p-4 rounded-lg border border-zinc-800/60 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-zinc-600" />
            <span>No background services currently running.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeProcesses.map((proc) => (
              <div
                key={proc.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between text-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-zinc-200">{proc.run_config_name}</span>
                    <p className="font-mono text-[10px] text-zinc-500">PID: {proc.pid || '—'}</p>
                  </div>
                  <ProcessStatusBadge status={proc.status} />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                  <button
                    onClick={() => navigate(`/projects/${proc.project_id}`)}
                    className="px-2.5 py-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                  >
                    View Project
                  </button>
                  <button
                    onClick={() => stopProcess.mutate(proc.id)}
                    className="px-2.5 py-1 text-[11px] bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 rounded flex items-center gap-1 transition-colors"
                  >
                    <StopCircle className="w-3 h-3" />
                    <span>Stop</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Favorites Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Favorites ({favoriteProjects.length})</h2>
        </div>
        {favoriteProjects.length === 0 ? (
          <div className="text-xs text-zinc-500 bg-zinc-900/40 p-4 rounded-lg border border-zinc-800/60">
            No favorite projects starred yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {favoriteProjects.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={(projId) => navigate(`/projects/${projId}`)} />
            ))}
          </div>
        )}
      </section>

      {/* Recent Projects Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Recent Projects</h2>
        </div>
        {!isLoading && recentProjects.length === 0 ? (
          <div className="text-xs text-zinc-500 bg-zinc-900/40 p-4 rounded-lg border border-zinc-800/60">
            No recently opened projects yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentProjects.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={(projId) => navigate(`/projects/${projId}`)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
