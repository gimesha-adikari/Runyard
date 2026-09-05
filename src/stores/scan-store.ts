import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { tauriApi } from '../lib/tauri.ts';
import type { ScanProgress } from '../types/index.ts';

interface ScanStoreState {
  progressMap: Record<string, ScanProgress>;
  isInitialized: boolean;
  initListener: () => Promise<() => void>;
  updateProgress: (progress: ScanProgress) => void;
  getRootProgress: (rootId: string) => ScanProgress | undefined;
  isAnyScanning: () => boolean;
}

let unlistenFn: UnlistenFn | null = null;
let initializing = false;

export const useScanStore = create<ScanStoreState>((set, get) => ({
  progressMap: {},
  isInitialized: false,

  updateProgress: (progress: ScanProgress) => {
    set((state) => ({
      progressMap: {
        ...state.progressMap,
        [progress.root_id]: progress,
      },
    }));
  },

  getRootProgress: (rootId: string) => {
    return get().progressMap[rootId];
  },

  isAnyScanning: () => {
    const map = get().progressMap;
    return Object.values(map).some(
      (p) => p.state === 'queued' || p.state === 'scanning'
    );
  },

  initListener: async () => {
    if (unlistenFn || initializing) {
      return () => {
        if (unlistenFn) {
          unlistenFn();
          unlistenFn = null;
        }
      };
    }
    initializing = true;

    try {
      const statuses = await tauriApi.getScanStatus().catch(() => ({}));
      if (statuses) {
        set({ progressMap: statuses, isInitialized: true });
      }

      unlistenFn = await listen<ScanProgress>('scan-progress', (event) => {
        get().updateProgress(event.payload);
      });
    } catch (e) {
      console.warn('Failed to initialize scan progress listener:', e);
    } finally {
      initializing = false;
    }

    return () => {
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
      }
    };
  },
}));
