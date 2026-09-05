import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tauriApi } from '../lib/tauri';
import type { ProcessInfo } from '../types';

export function useProcesses() {
  return useQuery({
    queryKey: ['processes'],
    queryFn: () => tauriApi.getProcesses(),
    refetchInterval: 2000,
  });
}

export function useProcessOutput(processId: string | undefined, sinceLine: number) {
  return useQuery({
    queryKey: ['processOutput', processId, sinceLine],
    queryFn: () => {
      if (!processId) throw new Error('No process id');
      return tauriApi.getProcessOutput(processId, sinceLine);
    },
    enabled: !!processId,
    refetchInterval: 1000,
  });
}

export function useRunUntrustedOnce() {
  const queryClient = useQueryClient();
  return useMutation<ProcessInfo, Error, string>({
    mutationFn: (runConfigId: string) => tauriApi.runUntrustedOnce(runConfigId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useStartProcess() {
  const queryClient = useQueryClient();
  return useMutation<ProcessInfo, Error, string>({
    mutationFn: (runConfigId: string) => tauriApi.startProcess(runConfigId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useStopProcess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (processId: string) => tauriApi.stopProcess(processId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useRestartProcess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (processId: string) => tauriApi.restartProcess(processId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useClearProcessOutput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (processId: string) => tauriApi.clearProcessOutput(processId),
    onSuccess: (_, processId) => {
      queryClient.invalidateQueries({ queryKey: ['processOutput', processId] });
    },
  });
}
