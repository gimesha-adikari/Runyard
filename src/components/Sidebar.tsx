import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Play, Settings, Terminal } from 'lucide-react';
import { useProcesses } from '../hooks/use-processes';
import { cn } from '../lib/utils';

export function Sidebar() {
  const { data: processes } = useProcesses();
  const runningCount = processes?.filter(p => p.status === 'Running').length || 0;

  const links = [
    { to: '/', icon: LayoutDashboard, label: 'Overview' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/running', icon: Play, label: 'Running', badge: runningCount > 0 ? runningCount : undefined },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full text-zinc-300">
      <div className="flex items-center px-6 py-5 mb-4">
        <Terminal className="w-6 h-6 text-emerald-500 mr-3" />
        <span className="font-bold text-lg tracking-wide text-zinc-100">Runyard</span>
      </div>
      
      <nav className="flex-1 px-3 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium border-l-2',
                isActive
                  ? 'bg-zinc-800 text-emerald-400 border-emerald-500'
                  : 'text-zinc-400 border-transparent hover:bg-zinc-800/50 hover:text-zinc-200'
              )
            }
          >
            <div className="flex items-center">
              <link.icon className="w-4 h-4 mr-3" />
              {link.label}
            </div>
            {link.badge !== undefined && (
              <span className="bg-emerald-500/10 text-emerald-400 py-0.5 px-2 rounded-full text-xs font-semibold">
                {link.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
