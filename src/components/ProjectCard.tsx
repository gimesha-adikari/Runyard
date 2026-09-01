import type { MouseEvent } from 'react';
import { Star, Folder, GitBranch, Code } from 'lucide-react';
import { Project } from '../types';
import { useToggleFavorite } from '../hooks/use-projects';
import { truncatePath, formatRelativeTime, cn } from '../lib/utils';

interface Props {
  project: Project;
  onOpen: (id: string) => void;
}

export function ProjectCard({ project, onOpen }: Props) {
  const toggleFav = useToggleFavorite();

  const handleToggleFavorite = (e: MouseEvent) => {
    e.stopPropagation();
    toggleFav.mutate(project.id);
  };

  return (
    <div 
      onClick={() => onOpen(project.id)}
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 cursor-pointer hover:border-emerald-500/50 transition-colors group flex flex-col h-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center min-w-0">
          <Folder className="w-5 h-5 text-emerald-500 mr-2 flex-shrink-0" />
          <h3 className="font-semibold text-zinc-100 truncate">{project.name}</h3>
        </div>
        <button 
          onClick={handleToggleFavorite}
          className="text-zinc-500 hover:text-yellow-400 p-1 -mt-1 -mr-1"
        >
          <Star className={cn("w-4 h-4", project.is_favorite && "fill-yellow-400 text-yellow-400")} />
        </button>
      </div>

      <div className="text-xs text-zinc-500 truncate mb-4 font-mono">
        {truncatePath(project.path)}
      </div>

      <div className="flex-1 flex flex-col justify-end space-y-3">
        <div className="flex flex-wrap gap-2">
          {project.project_type && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300">
              <Code className="w-3 h-3 mr-1" />
              {project.project_type}
            </span>
          )}
          {project.git_branch && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-zinc-800/50 text-zinc-400">
              <GitBranch className="w-3 h-3 mr-1" />
              {project.git_branch}
            </span>
          )}
        </div>

        <div className="text-xs text-zinc-600 flex justify-between">
          <span>Opened: {formatRelativeTime(project.last_opened)}</span>
        </div>
      </div>
    </div>
  );
}
