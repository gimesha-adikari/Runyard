import { useUiStore } from '../stores/ui-store';
import { TitleBar } from './TitleBar';
import { ProjectNavigator } from './ProjectNavigator';
import { ProjectWorkspace } from './ProjectWorkspace';
import { SettingsPage } from '../pages/SettingsPage';
import { RunningView } from './RunningView';
import { BottomPanel } from './BottomPanel';
import { GitChangesPane } from './GitChangesPane';
import { ErrorBoundary } from './ErrorBoundary';
import {
  Terminal,
  Box,
  GitBranch,
  Bell,
  FolderKanban,
  Play,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useResize } from '../hooks/use-resize';
import { useProjects } from '../hooks/use-projects';
import { useProcesses } from '../hooks/use-processes';
import { cn } from '../lib/utils';

export function DesktopLayout() {
  const {
    activeView,
    setActiveView,
    activeProjectId,
    setActiveProjectId,
    setSelectedProcessIdForLogs,
    setDiffTarget,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    bottomPanelOpen,
    setBottomPanelOpen,
    toggleBottomPanel,
    explorerWidth,
    setExplorerWidth,
    gitPaneWidth,
    setGitPaneWidth,
    gitPaneCollapsed,
    setGitPaneCollapsed,
    bottomPanelHeight,
    setBottomPanelHeight,
  } = useUiStore();

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  // Responsive breakpoint tracking
  useEffect(() => {
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Global keyboard shortcuts (Ctrl+` for bottom panel, Ctrl+B for sidebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing inside an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        toggleBottomPanel();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleBottomPanel, toggleSidebar]);

  // Resizable Panes
  const navResize = useResize({
    initialSize: explorerWidth,
    minSize: 190,
    maxSize: 400,
    direction: 'horizontal',
    onSizeChange: setExplorerWidth,
  });

  const gitResize = useResize({
    initialSize: gitPaneWidth,
    minSize: 220,
    maxSize: 450,
    direction: 'horizontal',
    reverse: true,
    onSizeChange: setGitPaneWidth,
  });

  // Calculate dynamic bottom panel bounds based on window height
  const maxBottomHeight = Math.floor(windowHeight * 0.65);
  const clampedBottomInitial = Math.min(bottomPanelHeight, maxBottomHeight);

  const bottomResize = useResize({
    initialSize: clampedBottomInitial,
    minSize: 120,
    maxSize: maxBottomHeight,
    direction: 'vertical',
    reverse: true,
    onSizeChange: setBottomPanelHeight,
  });

  const { data: projects } = useProjects();
  const activeProject = projects?.find((p) => p.id === activeProjectId);

  // Synchronize active project selection: if activeProjectId refers to a removed/nonexistent project, clear it
  useEffect(() => {
    if (activeProjectId && projects && !projects.some((p) => p.id === activeProjectId)) {
      setActiveProjectId(null);
      setSelectedProcessIdForLogs(null);
      setDiffTarget(null);
    }
  }, [activeProjectId, projects, setActiveProjectId, setSelectedProcessIdForLogs, setDiffTarget]);

  const { data: processes = [] } = useProcesses();
  const runningCount = Array.isArray(processes)
    ? processes.filter((p) => p.status === 'Running' || p.status === 'Starting').length
    : 0;

  // Wide window docked Git vs narrow window overlay drawer
  const isNarrowDesktop = windowWidth < 1150;
  const isDockedGitOpen =
    activeView === 'projects' && !!activeProject && !!activeProjectId && !gitPaneCollapsed && !isNarrowDesktop;
  const isGitDrawerOpen =
    activeView === 'projects' && !!activeProject && !!activeProjectId && !gitPaneCollapsed && isNarrowDesktop;

  // Close Git drawer on Escape key press
  useEffect(() => {
    if (isGitDrawerOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setGitPaneCollapsed(true);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isGitDrawerOpen, setGitPaneCollapsed]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0c] text-zinc-300 overflow-hidden font-sans select-none">
      {/* 1. Custom Integrated Title Bar */}
      <TitleBar />

      {/* 2. Main Workspace Body (Activity Bar + Explorer + Workspace + Git) */}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        {/* Left Activity Rail matching Stitch */}
        <aside className="w-11 min-w-[44px] bg-[#0c0c0e] border-r border-[#1f1f24] flex flex-col items-center py-2.5 justify-between shrink-0 z-20">
          <div className="flex flex-col items-center gap-1.5 w-full">
            {/* Projects / Explorer tab */}
            <button
              type="button"
              onClick={() => {
                if (activeView !== 'projects') {
                  setActiveView('projects');
                  setSidebarCollapsed(false);
                } else {
                  toggleSidebar();
                }
              }}
              className={cn(
                'btn-tactile w-8 h-8 rounded-[4px] flex items-center justify-center transition-colors relative cursor-pointer',
                activeView === 'projects' && !sidebarCollapsed
                  ? 'bg-[#1a1a22] text-emerald-400 font-medium'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-[#14141a]'
              )}
              title={sidebarCollapsed ? 'Expand Explorer (Ctrl+B)' : 'Projects Explorer'}
            >
              <FolderKanban className="w-4 h-4" />
              {activeView === 'projects' && !sidebarCollapsed && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-emerald-500 rounded-r" />
              )}
            </button>

            {/* Running Process Supervisor tab */}
            <button
              type="button"
              onClick={() => setActiveView('running')}
              className={cn(
                'btn-tactile w-8 h-8 rounded-[4px] flex items-center justify-center transition-colors relative cursor-pointer',
                activeView === 'running'
                  ? 'bg-[#1a1a22] text-emerald-400 font-medium'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-[#14141a]'
              )}
              title="Running Services Supervisor"
            >
              <Play className="w-4 h-4" />
              {runningCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0c0c0e]" />
              )}
              {activeView === 'running' && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-emerald-500 rounded-r" />
              )}
            </button>
          </div>

          <div className="flex flex-col items-center gap-1.5 w-full">
            {/* Settings button */}
            <button
              type="button"
              onClick={() => setActiveView('settings')}
              className={cn(
                'btn-tactile w-8 h-8 rounded-[4px] flex items-center justify-center transition-colors relative cursor-pointer',
                activeView === 'settings'
                  ? 'bg-[#1a1a22] text-emerald-400 font-medium'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-[#14141a]'
              )}
              title="Runyard Settings"
            >
              <Settings className="w-4 h-4" />
              {activeView === 'settings' && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-emerald-500 rounded-r" />
              )}
            </button>

            {/* Sidebar toggle button at bottom of rail */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="btn-tactile w-8 h-8 rounded-[4px] flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#14141a] transition-colors cursor-pointer"
              title={sidebarCollapsed ? 'Expand Explorer (Ctrl+B)' : 'Collapse Explorer (Ctrl+B)'}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </aside>

        {/* Left Explorer Pane */}
        {activeView === 'projects' && !sidebarCollapsed && (
          <div
            style={{ width: navResize.size }}
            className="flex flex-col bg-[#0e0e12] border-r border-[#1f1f24] shrink-0 relative z-10"
          >
            <ProjectNavigator />
            <div
              onMouseDown={navResize.startResize}
              onDoubleClick={navResize.resetToDefault}
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-500/60 transition-colors duration-fast z-20"
              title="Drag to resize Explorer (double-click to reset)"
            />
          </div>
        )}

        {/* Center Workspace & Right Git Pane Area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden relative">
          <div className="flex flex-1 min-h-0 overflow-hidden relative">
            {/* Center Content Area with smooth entrance transition */}
            <div
              key={activeView + (activeView === 'projects' ? activeProjectId || '' : '')}
              className="flex-1 flex flex-col min-w-0 bg-[#0a0a0c] relative overflow-hidden view-entrance"
            >
              <ErrorBoundary fallbackTitle="Workspace Error">
                {activeView === 'settings' ? (
                  <SettingsPage />
                ) : activeView === 'running' ? (
                  <RunningView />
                ) : activeProject && activeProjectId ? (
                  <ProjectWorkspace projectId={activeProjectId} />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    <div className="text-center p-6">
                      <Box className="w-12 h-12 mx-auto mb-3 text-zinc-700 opacity-60" />
                      <p className="text-xs font-mono text-zinc-400">
                        Select a project from the explorer to inspect workspace
                      </p>
                    </div>
                  </div>
                )}
              </ErrorBoundary>
            </div>

            {/* Right Docked Git Pane on wide screens */}
            {isDockedGitOpen && activeProjectId && (
              <div
                style={{ width: gitResize.size }}
                className="flex flex-col bg-[#0c0c0e] border-l border-[#1f1f23] shrink-0 relative z-10"
              >
                <div
                  onMouseDown={gitResize.startResize}
                  onDoubleClick={gitResize.resetToDefault}
                  className="absolute left-0 top-0 bottom-0 w-1 -ml-0.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors z-20"
                  title="Drag to resize Git Changes (double-click to reset)"
                />
                <GitChangesPane
                  projectId={activeProjectId}
                  onClose={() => setGitPaneCollapsed(true)}
                />
              </div>
            )}

            {/* Git Drawer Overlay for narrow/medium screens */}
            {isGitDrawerOpen && activeProjectId && (
              <>
                <div
                  className="fixed inset-0 bg-black/40 z-[140] backdrop-blur-[1px] animate-in fade-in duration-150"
                  onClick={() => setGitPaneCollapsed(true)}
                />
                <div
                  style={{ width: Math.min(gitResize.size, 380) }}
                  className="absolute right-0 top-0 bottom-0 max-w-[85vw] bg-[#0c0c0e] border-l border-[#1f1f23] shadow-2xl z-[150] flex flex-col animate-in slide-in-from-right duration-150"
                >
                  <GitChangesPane
                    projectId={activeProjectId}
                    onClose={() => setGitPaneCollapsed(true)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Bottom Tool Panel */}
          {bottomPanelOpen ? (
            <div
              style={{ height: bottomResize.size }}
              className="border-t border-[#1f1f23] bg-[#0a0a0c] flex flex-col shrink-0 relative z-20"
            >
              <div
                onMouseDown={bottomResize.startResize}
                onDoubleClick={bottomResize.resetToDefault}
                className="absolute top-0 left-0 right-0 h-1 -mt-0.5 cursor-row-resize hover:bg-emerald-500/50 transition-colors z-30"
                title="Drag to resize panel (double-click to reset)"
              />
              <ErrorBoundary fallbackTitle="Panel Error">
                <BottomPanel onClose={() => setBottomPanelOpen(false)} />
              </ErrorBoundary>
            </div>
          ) : (
            <div className="h-6.5 min-h-[26px] border-t border-[#1f1f23] bg-[#0c0c0e] flex items-center justify-between px-3 shrink-0 text-[11px] text-zinc-400 font-mono">
              <button
                type="button"
                onClick={() => setBottomPanelOpen(true)}
                className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors"
                title="Open Terminal & Logs (Ctrl+`)"
              >
                <Terminal className="w-3 h-3 text-emerald-500" />
                <span className="font-medium text-[10px] uppercase tracking-wider">
                  Terminal & Logs
                </span>
              </button>

              <span className="text-[10px] text-zinc-600">Ctrl+`</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Thin Bottom Status Bar matching Stitch */}
      <footer className="h-6 bg-[#0c0c0e] border-t border-[#1f1f23] flex items-center justify-between px-3 text-[11px] text-zinc-500 font-mono shrink-0 select-none z-20">
        <div className="flex items-center gap-3 sm:gap-4 truncate mr-2">
          <span className="font-semibold text-zinc-400 shrink-0">Runyard v0.2.2</span>

          {activeProject?.git_branch && (
            <span className="flex items-center gap-1 text-purple-400 shrink-0">
              <GitBranch className="w-3 h-3" />
              <span className="truncate max-w-[140px]">{activeProject.git_branch}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setActiveView('running')}
            className="hidden sm:flex items-center gap-1.5 shrink-0 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Open Running Services Supervisor"
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                runningCount > 0
                  ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
                  : 'bg-zinc-600'
              )}
            />
            <span className={runningCount > 0 ? 'text-emerald-400' : 'text-zinc-500'}>
              {runningCount} {runningCount === 1 ? 'service running' : 'services running'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline text-zinc-600">UTF-8</span>
          <button
            type="button"
            className="hover:text-zinc-300 p-0.5 rounded transition-colors"
            title="Notifications"
          >
            <Bell className="w-3 h-3" />
          </button>
        </div>
      </footer>
    </div>
  );
}
