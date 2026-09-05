import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useScanStore } from '../stores/scan-store';
import { tauriApi } from '../lib/tauri';

export function useScanProgress() {
  const queryClient = useQueryClient();
  const { progressMap, initListener, isAnyScanning, getRootProgress } = useScanStore();
  const prevCompletedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    initListener().then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [initListener]);

  // When any root finishes a scan, automatically invalidate queries to refresh catalog
  useEffect(() => {
    let newlyCompleted = false;
    for (const [rootId, p] of Object.entries(progressMap)) {
      if (p.state === 'completed' && !prevCompletedRef.current.has(rootId)) {
        prevCompletedRef.current.add(rootId);
        newlyCompleted = true;
      } else if (p.state !== 'completed' && prevCompletedRef.current.has(rootId)) {
        prevCompletedRef.current.delete(rootId);
      }
    }

    if (newlyCompleted) {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['allServices'] });
      queryClient.invalidateQueries({ queryKey: ['scanRoots'] });
    }
  }, [progressMap, queryClient]);

  const rescanRoot = async (rootId: string) => {
    await tauriApi.rescanRoot(rootId);
  };

  const rescanAll = async () => {
    await tauriApi.scanProjects();
  };

  return {
    progressMap,
    isAnyScanning: isAnyScanning(),
    getRootProgress,
    rescanRoot,
    rescanAll,
  };
}
