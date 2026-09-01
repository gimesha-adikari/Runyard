import { create } from 'zustand';

interface UiState {
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
}

export const useUiStore = create<UiState>((set) => ({
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
}));
