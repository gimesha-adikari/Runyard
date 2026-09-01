import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tauriApi } from '../lib/tauri';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => tauriApi.getSettings(),
  });
}

export function useScanRoots() {
  return useQuery({
    queryKey: ['scanRoots'],
    queryFn: () => tauriApi.getScanRoots(),
  });
}

export function useAddScanRoot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => tauriApi.addScanRoot(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanRoots'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useRemoveScanRoot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tauriApi.removeScanRoot(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanRoots'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
