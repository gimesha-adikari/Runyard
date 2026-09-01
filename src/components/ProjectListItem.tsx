import type { MouseEvent } from 'react';
import { Star, Folder, GitBranch, Code } from 'lucide-react';
import { Project } from '../types';
import { useToggleFavorite } from '../hooks/use-projects';
import { truncatePath, formatRelativeTime, cn } from '../lib/utils';

interface Props {
  project: Project;
  onOpen: (id: string) => void;
}

export function ProjectListItem({ project, onOpen }: Props) {
  const toggleFav = useToggleFavorite();

  const handleToggleFavorite = (e: MouseEvent) => {
    e.stopPropagation();
    toggleFav.mutate(project.id);
  };

  return (
    <div 
      onClick={() => onOpen(project.id)}
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-pointer hover:bg-zinc-800/50 transition-colors flex items-center gap-4"
    >
      <button 
        onClick={handleToggleFavorite}
        className="text-zinc-500 hover:text-yellow-400 p-1 flex-shrink-0"
      >
        <Star className={cn("w-4 h-4", project.is_favorite && "fill-yellow-400 text-yellow-400")} />
      </button>

      <Folder className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      
      <div className="w-1/4 min-w-0">
        <div className="font-semibold text-zinc-100 truncate">{project.name}</div>
        <div className="text-xs text-zinc-500 truncate font-mono">{truncatePath(project.path)}</div>
      </div>

      <div className="w-1/6 flex items-center">
        {project.project_type && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300">
            <Code className="w-3 h-3 mr-1" />
            {project.project_type}
          </span>
        )}
      </div>

      <div className="w-1/6 flex items-center">
        {project.git_branch && (
          <span className="inline-flex items-center text-xs text-zinc-400">
            <GitBranch className="w-3 h-3 mr-1" />
            <span className="truncate max-w-[100px]">{project.git_branch}</span>
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-wrap gap-1">
        {project.languages.slice(0, 2).map(lang => (
          <span key={lang} className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
            {lang}
          </span>
        ))}
        {project.languages.length > 2 && (
          <span className="px-1.5 py-0.5 text-xs text-zinc-500">+{project.languages.length - 2}</span>
        )}
      </div>

      <div className="text-xs text-zinc-500 whitespace-nowrap">
        {formatRelativeTime(project.last_opened)}
      </div>
    </div>
  );
}
