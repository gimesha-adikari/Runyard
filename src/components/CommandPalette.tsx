import { useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../stores/ui-store';
import { useSearchProjects } from '../hooks/use-projects';
import { Search, Folder, Code, X } from 'lucide-react';
import { cn, truncatePath } from '../lib/utils';

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette } = useUiStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  
  const { data: results = [] } = useSearchProjects(query);

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [commandPaletteOpen, toggleCommandPalette]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length, query]);

  if (!commandPaletteOpen) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + Math.max(1, results.length)) % Math.max(1, results.length));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (selected) {
        navigate(`/projects/${selected.id}`);
        toggleCommandPalette();
        setQuery('');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/50 backdrop-blur-sm">
      <div 
        className="bg-zinc-900 w-full max-w-2xl rounded-xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 border-b border-zinc-800">
          <Search className="w-5 h-5 text-zinc-400" />
          <input
            autoFocus
            type="text"
            className="w-full bg-transparent border-none text-zinc-100 placeholder-zinc-500 px-4 py-4 focus:outline-none text-lg"
            placeholder="Search projects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={() => { toggleCommandPalette(); setQuery(''); }} className="p-1 hover:bg-zinc-800 rounded-md">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {query.length >= 2 && results.length === 0 && (
          <div className="px-4 py-12 text-center text-zinc-500">
            No projects found for "{query}"
          </div>
        )}

        {results.length > 0 && (
          <div className="max-h-96 overflow-y-auto p-2">
            {results.map((project, index) => (
              <div
                key={project.id}
                className={cn(
                  "flex items-center px-4 py-3 rounded-lg cursor-pointer",
                  index === selectedIndex ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                )}
                onClick={() => {
                  navigate(`/projects/${project.id}`);
                  toggleCommandPalette();
                  setQuery('');
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <Folder className="w-5 h-5 text-zinc-400 mr-4" />
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-200 font-medium truncate">{project.name}</div>
                  <div className="text-zinc-500 text-sm truncate">{truncatePath(project.path)}</div>
                </div>
                {project.project_type && (
                  <div className="ml-4 flex items-center bg-zinc-800 px-2 py-1 rounded text-xs text-zinc-400">
                    <Code className="w-3 h-3 mr-1" />
                    {project.project_type}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
