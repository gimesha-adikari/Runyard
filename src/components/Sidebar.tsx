import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Play,
  Settings,
  Terminal,
  PanelLeftClose,
  PanelLeft,
  Search,
} from 'lucide-react';
import { useProcesses } from '../hooks/use-processes';
import { useUiStore } from '../stores/ui-store';
import { cn } from '../lib/utils';

export function Sidebar() {
  const { data: processes } = useProcesses();
  const { sidebarCollapsed, toggleSidebar, toggleCommandPalette } = useUiStore();
  const runningCount = processes?.filter((p) => p.status === 'Running' || p.status === 'Starting').length || 0;

  const links = [
    { to: '/', icon: LayoutDashboard, label: 'Overview' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/running', icon: Play, label: 'Running', badge: runningCount > 0 ? runningCount : undefined },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside
      className={cn(
        'bg-zinc-900 border-r border-zinc-800 flex flex-col h-full text-zinc-300 transition-all duration-200 select-none shrink-0',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800/80">
        <div className="flex items-center min-w-0 overflow-hidden">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 mr-2.5 shrink-0">
            <Terminal className="w-5 h-5" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <span className="font-bold text-sm tracking-wide text-zinc-100 block">Runyard</span>
              <span className="text-[10px] text-zinc-500 font-mono block">Developer Manager</span>
            </div>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            title={sidebarCollapsed ? link.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-lg transition-colors text-xs font-medium relative group',
                sidebarCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2',
                isActive
                  ? 'bg-zinc-800 text-emerald-400 font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className="flex items-center min-w-0">
                  <link.icon
                    className={cn(
                      'w-4 h-4 shrink-0 transition-colors',
                      sidebarCollapsed ? '' : 'mr-2.5',
                      isActive ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-zinc-200'
                    )}
                  />
                  {!sidebarCollapsed && <span className="truncate">{link.label}</span>}
                </div>

                {link.badge !== undefined && (
                  <span
                    className={cn(
                      'flex items-center gap-1 font-mono text-[10px] font-bold rounded-full',
                      sidebarCollapsed
                        ? 'absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full'
                        : 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 px-1.5 py-0.2'
                    )}
                  >
                    {!sidebarCollapsed && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    {!sidebarCollapsed && link.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-2.5 border-t border-zinc-800/80">
        <button
          onClick={toggleCommandPalette}
          className={cn(
            'w-full flex items-center bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs transition-colors',
            sidebarCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'
          )}
          title="Open Command Palette (Ctrl+K)"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
            {!sidebarCollapsed && <span className="text-[11px]">Command Palette</span>}
          </div>
          {!sidebarCollapsed && (
            <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[9px] font-mono border border-zinc-700">
              ^K
            </kbd>
          )}
        </button>
      </div>
    </aside>
  );
}
