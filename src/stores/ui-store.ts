import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  projectViewMode: 'grid' | 'list';
  toggleSidebar: () => void;
  toggleCommandPalette: () => void;
  setProjectViewMode: (mode: 'grid' | 'list') => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  projectViewMode: 'grid',
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setProjectViewMode: (mode) => set({ projectViewMode: mode }),
}));
