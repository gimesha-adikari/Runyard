import { useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../stores/ui-store';
import { useSearchProjects, useProjects } from '../hooks/use-projects';
import { Search, Folder, X, FolderKanban, Play, Settings, ArrowRight } from 'lucide-react';
import { cn, truncatePath } from '../lib/utils';

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette } = useUiStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const { data: searchResults = [] } = useSearchProjects(query);
  const { data: allProjects = [] } = useProjects();

  const navigationItems = [
    { id: 'nav-overview', name: 'Go to Overview', path: '/', icon: ArrowRight, type: 'nav' },
    { id: 'nav-projects', name: 'Browse All Projects', path: '/projects', icon: FolderKanban, type: 'nav' },
    { id: 'nav-running', name: 'View Running Processes', path: '/running', icon: Play, type: 'nav' },
    { id: 'nav-settings', name: 'Open Settings', path: '/settings', icon: Settings, type: 'nav' },
  ];

  const displayItems = query.length >= 2
    ? searchResults.map((p) => ({ ...p, type: 'project' }))
    : [
        ...navigationItems,
        ...allProjects.slice(0, 5).map((p) => ({ ...p, type: 'project' })),
      ];

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
  }, [displayItems.length, query]);

  if (!commandPaletteOpen) return null;

  const handleSelect = (item: any) => {
    if (item.type === 'nav') {
      navigate(item.path);
    } else {
      navigate(`/projects/${item.id}`);
    }
    toggleCommandPalette();
    setQuery('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, displayItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + Math.max(1, displayItems.length)) % Math.max(1, displayItems.length));
    } else if (e.key === 'Enter' && displayItems.length > 0) {
      e.preventDefault();
      const selected = displayItems[selectedIndex];
      if (selected) {
        handleSelect(selected);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-zinc-900 w-full max-w-2xl rounded-xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            autoFocus
            type="text"
            className="w-full bg-transparent border-none text-zinc-100 placeholder-zinc-500 px-3 py-3.5 focus:outline-none text-sm"
            placeholder="Search projects, navigation..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={() => {
              toggleCommandPalette();
              setQuery('');
            }}
            className="p-1 text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {displayItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-500 text-xs">
              No results found for "{query}"
            </div>
          ) : (
            displayItems.map((item: any, index: number) => {
              const isSelected = index === selectedIndex;
              if (item.type === 'nav') {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors',
                      isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
                    )}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <Icon className="w-4 h-4 mr-3 text-emerald-400" />
                    <span className="font-medium">{item.name}</span>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-xs transition-colors',
                    isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/50'
                  )}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-center min-w-0 mr-2">
                    <Folder className="w-4 h-4 text-zinc-500 mr-2.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-200 truncate">{item.name}</div>
                      <div className="text-zinc-500 font-mono text-[11px] truncate">
                        {truncatePath(item.path)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.project_type && (
                      <span className="px-1.5 py-0.2 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[10px] uppercase font-mono">
                        {item.project_type}
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] text-zinc-500 font-mono">Enter ↵</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
