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
  bottomPanelTab: 'terminal' | 'logs' | 'git' | 'problems';
  setBottomPanelTab: (tab: 'terminal' | 'logs' | 'git' | 'problems') => void;
  diffTarget: { path: string; staged: boolean } | null;
  setDiffTarget: (target: { path: string; staged: boolean } | null) => void;
  selectedProcessIdForLogs: string | null;
  setSelectedProcessIdForLogs: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'projects',
  activeProjectId: null,
  setActiveView: (view) => set({ activeView: view }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  projectViewMode: (localStorage.getItem('runyard_view_mode') as 'grid' | 'list') || 'grid',
  projectSortBy: (localStorage.getItem('runyard_sort_by') as any) || 'last_opened',
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setProjectViewMode: (mode) => {
    localStorage.setItem('runyard_view_mode', mode);
    set({ projectViewMode: mode });
  },
  setProjectSortBy: (sortBy) => {
    localStorage.setItem('runyard_sort_by', sortBy);
    set({ projectSortBy: sortBy });
  },
  
  bottomPanelOpen: false,
  setBottomPanelOpen: (open) => set({ bottomPanelOpen: open }),
  bottomPanelTab: 'terminal',
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  diffTarget: null,
  setDiffTarget: (target) => set({ diffTarget: target }),
  selectedProcessIdForLogs: null,
  setSelectedProcessIdForLogs: (id) => set({ selectedProcessIdForLogs: id }),
}));
