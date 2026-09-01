import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tauriApi } from '../lib/tauri';
import { RunConfiguration } from '../types';

export function useRunConfigs(projectId: string | undefined) {
  return useQuery({
    queryKey: ['runConfigs', projectId],
    queryFn: () => {
      if (!projectId) throw new Error('No project id provided');
      return tauriApi.getRunConfigs(projectId);
    },
    enabled: !!projectId,
  });
}

export function useDetectRunConfigs(projectPath: string | undefined) {
  return useQuery({
    queryKey: ['detectRunConfigs', projectPath],
    queryFn: () => {
      if (!projectPath) throw new Error('No project path provided');
      return tauriApi.detectRunConfigs(projectPath);
    },
    enabled: !!projectPath,
  });
}

export function useSaveRunConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: RunConfiguration) => tauriApi.saveRunConfig(config),
    onSuccess: (_, config) => {
      queryClient.invalidateQueries({ queryKey: ['runConfigs', config.project_id] });
    },
  });
}

export function useDeleteRunConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; projectId: string }) => tauriApi.deleteRunConfig(vars.id),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['runConfigs', vars.projectId] });
    },
  });
}

export function useTrustRunConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; projectId: string }) => tauriApi.trustRunConfig(vars.id),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['runConfigs', vars.projectId] });
    },
  });
}

export function useSetDefaultRunConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, configId }: { projectId: string; configId: string }) =>
      tauriApi.setDefaultRunConfig(projectId, configId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['runConfigs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
  });
}
