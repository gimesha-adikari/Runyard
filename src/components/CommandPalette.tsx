import { useEffect, useState, useRef, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../stores/ui-store';
import { useProjects, useScanProjects } from '../hooks/use-projects';
import { useProcesses, useStopProcess } from '../hooks/use-processes';
import { toast } from '../stores/toast-store';
import {
  Search,
  Folder,
  X,
  FolderKanban,
  Play,
  Settings,
  LayoutDashboard,
  RefreshCw,
  FolderPlus,
  StopCircle,
} from 'lucide-react';
import { cn, truncatePath } from '../lib/utils';
import { Project } from '../types';

interface PaletteItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Projects';
  title: string;
  subtitle?: string;
  badge?: string;
  icon: any;
  action: () => void | Promise<void>;
}

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette, setCommandPaletteOpen } = useUiStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const navigate = useNavigate();

  const { data: allProjects = [] } = useProjects();
  const { data: processes = [] } = useProcesses();
  const scanProjects = useScanProjects();
  const stopProcess = useStopProcess();

  const activeProcesses = processes.filter((p) => p.status === 'Running' || p.status === 'Starting');

  // Build items list
  const navItems: PaletteItem[] = [
    {
      id: 'nav-overview',
      category: 'Navigation',
      title: 'Go to Overview',
      subtitle: 'Command center & active status',
      icon: LayoutDashboard,
      action: () => navigate('/'),
    },
    {
      id: 'nav-projects',
      category: 'Navigation',
      title: 'Browse All Projects',
      subtitle: `${allProjects.length} projects registered`,
      icon: FolderKanban,
      action: () => navigate('/projects'),
    },
    {
      id: 'nav-running',
      category: 'Navigation',
      title: 'Running Processes Dashboard',
      subtitle: `${activeProcesses.length} active services`,
      badge: activeProcesses.length > 0 ? `${activeProcesses.length} running` : undefined,
      icon: Play,
      action: () => navigate('/running'),
    },
    {
      id: 'nav-settings',
      category: 'Navigation',
      title: 'Open Settings',
      subtitle: 'Scan roots & IDE configuration',
      icon: Settings,
      action: () => navigate('/settings'),
    },
  ];

  const actionItems: PaletteItem[] = [
    {
      id: 'action-rescan',
      category: 'Actions',
      title: 'Rescan Configured Directories',
      subtitle: 'Look for new projects in scan roots',
      icon: RefreshCw,
      action: async () => {
        try {
          await scanProjects.mutateAsync();
          toast.success('Project scan completed successfully');
        } catch (e: any) {
          toast.error(e?.message || 'Failed to scan projects');
        }
      },
    },
    {
      id: 'action-import',
      category: 'Actions',
      title: 'Import Project from Directory',
      subtitle: 'Inspect and register a local repository',
      icon: FolderPlus,
      action: () => {
        navigate('/projects?action=import');
      },
    },
    ...(activeProcesses.length > 0
      ? [
          {
            id: 'action-stop-all',
            category: 'Actions' as const,
            title: 'Stop All Active Services',
            subtitle: `Terminate ${activeProcesses.length} running processes`,
            icon: StopCircle,
            action: () => {
              activeProcesses.forEach((p) => stopProcess.mutate(p.id));
              toast.info(`Stopping ${activeProcesses.length} processes`);
            },
          },
        ]
      : []),
  ];

  const projectItems: PaletteItem[] = allProjects.map((p: Project) => {
    const isRunning = processes.some((pr) => pr.project_id === p.id && pr.status === 'Running');

    return {
      id: `proj-${p.id}`,
      category: 'Projects',
      title: p.name,
      subtitle: p.path,
      badge: isRunning ? 'Running' : p.git_branch || p.project_type || undefined,
      icon: Folder,
      action: () => navigate(`/projects/${p.id}`),
    };
  });

  const allItems: PaletteItem[] = [...navItems, ...actionItems, ...projectItems];

  const filteredItems = query.trim()
    ? allItems.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          (item.badge && item.badge.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q)
        );
      })
    : [...navItems, ...actionItems, ...projectItems.slice(0, 8)];

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        e.preventDefault();
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [commandPaletteOpen, toggleCommandPalette, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setSelectedIndex(0);
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!commandPaletteOpen) return null;

  const handleSelect = (item: PaletteItem) => {
    setCommandPaletteOpen(false);
    item.action();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + Math.max(1, filteredItems.length)) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter' && filteredItems.length > 0) {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        handleSelect(selected);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-100"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="bg-zinc-900 w-full max-w-2xl rounded-xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 border-b border-zinc-800 bg-zinc-950/60">
          <Search className="w-4 h-4 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent border-none text-zinc-100 placeholder-zinc-500 px-3 py-3.5 focus:outline-none text-xs font-medium"
            placeholder="Type a command, project name, or action..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 space-y-1 divide-y divide-zinc-800/40">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-10 text-center text-zinc-500 text-xs">
              No matching actions or projects for "{query}"
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  className={cn(
                    'flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-xs transition-colors group',
                    isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/50'
                  )}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-center min-w-0 mr-3">
                    <div
                      className={cn(
                        'p-1.5 rounded mr-3 shrink-0',
                        item.category === 'Navigation'
                          ? 'bg-blue-500/10 text-blue-400'
                          : item.category === 'Actions'
                          ? 'bg-purple-500/10 text-purple-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-200 truncate flex items-center gap-2">
                        <span>{item.title}</span>
                        {item.category !== 'Projects' && (
                          <span className="text-[10px] text-zinc-500 font-mono">
                            [{item.category}]
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className="text-zinc-400 font-mono text-[11px] truncate">
                          {truncatePath(item.subtitle)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span
                        className={cn(
                          'px-1.5 py-0.2 rounded text-[10px] font-mono',
                          item.badge === 'Running'
                            ? 'bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold'
                            : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                    {isSelected && (
                      <kbd className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">
                        ↵
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500 font-mono select-none">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <div>
            <span>{filteredItems.length} items</span>
          </div>
        </div>
      </div>
    </div>
  );
}
