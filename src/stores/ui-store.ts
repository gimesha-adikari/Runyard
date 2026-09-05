import { create } from 'zustand';

interface UiState {
  activeView: 'projects' | 'running' | 'settings';
  activeProjectId: string | null;
  setActiveView: (view: 'projects' | 'running' | 'settings') => void;
  setActiveProjectId: (id: string | null) => void;
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  projectViewMode: 'grid' | 'list';
  projectSortBy: 'name' | 'last_opened' | 'last_run' | 'created_at';
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setProjectViewMode: (mode: 'grid' | 'list') => void;
  setProjectSortBy: (sortBy: 'name' | 'last_opened' | 'last_run' | 'created_at') => void;
  
  // Panel management
  bottomPanelOpen: boolean;
  setBottomPanelOpen: (open: boolean) => void;
  toggleBottomPanel: () => void;
  bottomPanelTab: 'terminal' | 'logs' | 'git' | 'problems';
  setBottomPanelTab: (tab: 'terminal' | 'logs' | 'git' | 'problems') => void;
  bottomPanelHeight: number;
  setBottomPanelHeight: (height: number) => void;
  diffTarget: { path: string; staged: boolean } | null;
  setDiffTarget: (target: { path: string; staged: boolean } | null) => void;
  selectedProcessIdForLogs: string | null;
  setSelectedProcessIdForLogs: (id: string | null) => void;
  activeTerminalSessionId: string | null;
  setActiveTerminalSessionId: (sessionId: string | null) => void;
  activeTerminalTitle: string | null;
  setActiveTerminalTitle: (title: string | null) => void;

  // Resizable pane widths & states
  explorerWidth: number;
  setExplorerWidth: (width: number) => void;
  gitPaneWidth: number;
  setGitPaneWidth: (width: number) => void;
  gitPaneCollapsed: boolean;
  setGitPaneCollapsed: (collapsed: boolean) => void;
  toggleGitPane: () => void;
}

const getStoredString = (key: string, fallback: string): string => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const setStoredString = (key: string, value: string): void => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota/security errors
  }
};

const getStoredNumber = (key: string, fallback: number, min: number, max: number): number => {
  const val = getStoredString(key, '');
  if (!val) return fallback;
  const num = parseInt(val, 10);
  return isNaN(num) ? fallback : Math.min(Math.max(num, min), max);
};

export const useUiStore = create<UiState>((set) => ({
  activeView: 'projects',
  activeProjectId: null,
  setActiveView: (view) => set({ activeView: view }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  sidebarCollapsed: getStoredString('runyard_sidebar_collapsed', 'false') === 'true',
  commandPaletteOpen: false,
  projectViewMode: (getStoredString('runyard_view_mode', 'grid') as 'grid' | 'list') || 'grid',
  projectSortBy: (getStoredString('runyard_sort_by', 'last_opened') as any) || 'last_opened',
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      setStoredString('runyard_sidebar_collapsed', String(next));
      return { sidebarCollapsed: next };
    }),
  setSidebarCollapsed: (collapsed) => {
    setStoredString('runyard_sidebar_collapsed', String(collapsed));
    set({ sidebarCollapsed: collapsed });
  },
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setProjectViewMode: (mode) => {
    setStoredString('runyard_view_mode', mode);
    set({ projectViewMode: mode });
  },
  setProjectSortBy: (sortBy) => {
    setStoredString('runyard_sort_by', sortBy);
    set({ projectSortBy: sortBy });
  },

  bottomPanelOpen: getStoredString('runyard_bottom_open', 'false') === 'true',
  setBottomPanelOpen: (open) => {
    setStoredString('runyard_bottom_open', String(open));
    set({ bottomPanelOpen: open });
  },
  toggleBottomPanel: () =>
    set((state) => {
      const next = !state.bottomPanelOpen;
      setStoredString('runyard_bottom_open', String(next));
      return { bottomPanelOpen: next };
    }),
  bottomPanelTab: 'terminal',
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  bottomPanelHeight: getStoredNumber('runyard_bottom_height', 256, 120, 600),
  setBottomPanelHeight: (height) => {
    setStoredString('runyard_bottom_height', String(height));
    set({ bottomPanelHeight: height });
  },
  diffTarget: null,
  setDiffTarget: (target) => set({ diffTarget: target }),
  selectedProcessIdForLogs: null,
  setSelectedProcessIdForLogs: (id) =>
    set({
      selectedProcessIdForLogs:
        typeof id === 'object' && id !== null && 'id' in id ? String((id as any).id) : id,
    }),
  activeTerminalSessionId: null,
  setActiveTerminalSessionId: (sessionId) => set({ activeTerminalSessionId: sessionId }),
  activeTerminalTitle: null,
  setActiveTerminalTitle: (title) => set({ activeTerminalTitle: title }),

  explorerWidth: getStoredNumber('runyard_explorer_width', 240, 190, 400),
  setExplorerWidth: (width) => {
    setStoredString('runyard_explorer_width', String(width));
    set({ explorerWidth: width });
  },
  gitPaneWidth: getStoredNumber('runyard_git_width', 280, 220, 450),
  setGitPaneWidth: (width) => {
    setStoredString('runyard_git_width', String(width));
    set({ gitPaneWidth: width });
  },
  gitPaneCollapsed: getStoredString('runyard_git_collapsed', 'false') === 'true',
  setGitPaneCollapsed: (collapsed) => {
    setStoredString('runyard_git_collapsed', String(collapsed));
    set({ gitPaneCollapsed: collapsed });
  },
  toggleGitPane: () =>
    set((state) => {
      const next = !state.gitPaneCollapsed;
      setStoredString('runyard_git_collapsed', String(next));
      return { gitPaneCollapsed: next };
    }),
}));

if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as any).useUiStore = useUiStore;
  (window as any).__UI_STORE__ = useUiStore;
}
