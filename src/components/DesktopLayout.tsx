import { useUiStore } from '../stores/ui-store';
import { ProjectNavigator } from './ProjectNavigator';
import { ProjectWorkspace } from './ProjectWorkspace';
import { SettingsPage } from '../pages/SettingsPage';
import { RunningView } from './RunningView';
import { BottomPanel } from './BottomPanel';
import { GitChangesPane } from './GitChangesPane';
import { Terminal, Box, GitBranch, Bell } from 'lucide-react';
import { useState } from 'react';
import { useResize } from '../hooks/use-resize';
import { useProjects } from '../hooks/use-projects';
import { tauriApi } from '../lib/tauri';
import { useQuery } from '@tanstack/react-query';

export function DesktopLayout() {
  const { activeView, activeProjectId, sidebarCollapsed, bottomPanelOpen, setBottomPanelOpen } = useUiStore();
  const [gitPaneOpen, setGitPaneOpen] = useState(true);
  
  const navResize = useResize(260, 200, 400, 'horizontal');
  const gitResize = useResize(300, 200, 500, 'horizontal', true);
  const bottomResize = useResize(256, 100, 600, 'vertical', true);

  const { data: projects } = useProjects();
  const activeProject = projects?.find(p => p.id === activeProjectId);

  const { data: runningCount = 0 } = useQuery({
    queryKey: ['runningCount'],
    queryFn: async () => {
      const procs = await tauriApi.getProcesses();
      return procs.length;
    },
    refetchInterval: 2000,
  });

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-300 overflow-hidden font-sans">
      
      {/* Main Workspace Area (flex-1) */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Navigator Pane */}
        {!sidebarCollapsed && (
          <div 
            style={{ width: navResize.size }} 
            className="flex flex-col bg-[#111] border-r border-zinc-800/80 shrink-0 relative"
          >
            <ProjectNavigator />
            <div 
              onMouseDown={navResize.startResize}
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-500/50 z-10"
            />
          </div>
        )}

        {/* Center/Right Area */}
        <div className="flex flex-col flex-1 min-w-0">
          
          <div className="flex flex-1 overflow-hidden">
            
            {/* Center Content */}
            <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 relative">
              {activeView === 'settings' ? (
                <SettingsPage />
              ) : activeView === 'running' ? (
                <RunningView />
              ) : activeProjectId ? (
                <ProjectWorkspace projectId={activeProjectId} />
              ) : (
                <div className="flex h-full items-center justify-center text-zinc-500">
                  <div className="text-center">
                    <Box className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-xs">Select a project from the explorer to begin</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Git Pane (Only show in project workspace view) */}
            {activeView === 'projects' && activeProjectId && gitPaneOpen && (
              <div 
                style={{ width: gitResize.size }}
                className="flex flex-col bg-[#111] border-l border-zinc-800/80 shrink-0 relative"
              >
                <div 
                  onMouseDown={gitResize.startResize}
                  className="absolute left-0 top-0 bottom-0 w-1 -ml-0.5 cursor-col-resize hover:bg-emerald-500/50 z-10"
                />
                <GitChangesPane projectId={activeProjectId} onClose={() => setGitPaneOpen(false)} />
              </div>
            )}
            
          </div>

          {/* Bottom Tool Panel */}
          {bottomPanelOpen ? (
            <div 
              style={{ height: bottomResize.size }}
              className="border-t border-zinc-800 bg-[#111] flex flex-col shrink-0 relative"
            >
              <div 
                onMouseDown={bottomResize.startResize}
                className="absolute top-0 left-0 right-0 h-1 -mt-0.5 cursor-row-resize hover:bg-emerald-500/50 z-10"
              />
              <BottomPanel onClose={() => setBottomPanelOpen(false)} />
            </div>
          ) : (
            <div className="h-7 border-t border-zinc-800/80 bg-[#111] flex items-center px-4 shrink-0 text-[11px] text-zinc-400">
              <button
                onClick={() => setBottomPanelOpen(true)}
                className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors uppercase tracking-wider font-semibold"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Terminal & Logs</span>
              </button>
            </div>
          )}
          
        </div>

      </div>

      {/* Thin Bottom Status Bar */}
      <div className="h-6 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between px-3 text-[10px] text-zinc-500 font-mono shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-zinc-400">Runyard v0.2.1</span>
          
          {activeProject?.git_branch && (
            <span className="flex items-center gap-1 text-purple-400">
              <GitBranch className="w-3 h-3" />
              {activeProject.git_branch}
            </span>
          )}

          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${runningCount > 0 ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
            {runningCount} {runningCount === 1 ? 'service' : 'services'} running
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <button className="hover:text-zinc-300">
            <Bell className="w-3 h-3" />
          </button>
        </div>
      </div>

    </div>
  );
}
