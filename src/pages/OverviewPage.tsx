import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/use-projects';
import { useProcesses, useStopProcess } from '../hooks/use-processes';
import { useUiStore } from '../stores/ui-store';
import { ProjectCard } from '../components/ProjectCard';
import { ProcessStatusBadge } from '../components/ProcessStatusBadge';
import { EmptyState } from '../components/EmptyState';
import { Clock, Star, Play, Terminal, Search, StopCircle } from 'lucide-react';

export function OverviewPage() {
  const navigate = useNavigate();
  const { toggleCommandPalette } = useUiStore();
  const { data: projects = [], isLoading } = useProjects();
  const { data: processes = [] } = useProcesses();
  const stopProcess = useStopProcess();

  const recentProjects = [...projects]
    .filter(p => p.last_opened)
    .sort((a, b) => new Date(b.last_opened!).getTime() - new Date(a.last_opened!).getTime())
    .slice(0, 4);

  const favoriteProjects = projects.filter(p => p.is_favorite);
  const runningProcesses = processes.filter(p => p.status === 'Running');

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Overview</h1>
        <button
          onClick={toggleCommandPalette}
          className="flex items-center px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors text-sm"
        >
          <Search className="w-4 h-4 mr-2" />
          Search projects...
          <kbd className="ml-4 px-1.5 py-0.5 bg-zinc-800 rounded text-xs">⌘K</kbd>
        </button>
      </div>

      <section>
        <div className="flex items-center mb-4">
          <Play className="w-5 h-5 text-emerald-500 mr-2" />
          <h2 className="text-lg font-semibold text-zinc-200">Running Processes</h2>
        </div>
        
        {runningProcesses.length === 0 ? (
          <EmptyState 
            icon={Terminal} 
            title="No active processes" 
            description="Run configurations from your projects will appear here." 
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {runningProcesses.map(proc => (
              <div key={proc.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-semibold text-zinc-200 truncate pr-2">{proc.run_config_name}</div>
                  <ProcessStatusBadge status={proc.status} />
                </div>
                <div className="text-xs text-zinc-500 mb-4 font-mono">PID: {proc.pid}</div>
                <div className="mt-auto flex justify-end gap-2">
                  <button 
                    onClick={() => navigate(`/projects/${proc.project_id}`)}
                    className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded"
                  >
                    View Project
                  </button>
                  <button 
                    onClick={() => stopProcess.mutate(proc.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded flex items-center"
                  >
                    <StopCircle className="w-3 h-3 mr-1" />
                    Stop
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center mb-4">
          <Star className="w-5 h-5 text-yellow-500 mr-2" />
          <h2 className="text-lg font-semibold text-zinc-200">Favorites</h2>
        </div>
        {favoriteProjects.length === 0 ? (
          <div className="text-sm text-zinc-500 bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50">
            No favorite projects yet. Star a project to pin it here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {favoriteProjects.map(p => (
              <ProjectCard key={p.id} project={p} onOpen={(id) => navigate(`/projects/${id}`)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center mb-4">
          <Clock className="w-5 h-5 text-zinc-400 mr-2" />
          <h2 className="text-lg font-semibold text-zinc-200">Recent Projects</h2>
        </div>
        {!isLoading && recentProjects.length === 0 ? (
          <EmptyState 
            icon={Clock} 
            title="No recent projects" 
            description="Open some projects to see them here." 
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentProjects.map(p => (
              <ProjectCard key={p.id} project={p} onOpen={(id) => navigate(`/projects/${id}`)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
