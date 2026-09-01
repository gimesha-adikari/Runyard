import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tauriApi } from '../lib/tauri';
import { RunGroup } from '../types';

export function useRunGroups(projectId: string | undefined) {
  return useQuery({
    queryKey: ['runGroups', projectId],
    queryFn: () => {
      if (!projectId) throw new Error('No project id provided');
      return tauriApi.getRunGroups(projectId);
    },
    enabled: !!projectId,
  });
}

export function useSaveRunGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (group: RunGroup) => tauriApi.saveRunGroup(group),
    onSuccess: (_, group) => {
      queryClient.invalidateQueries({ queryKey: ['runGroups', group.project_id] });
    },
  });
}

export function useDeleteRunGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) => tauriApi.deleteRunGroup(id),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['runGroups', projectId] });
    },
  });
}

export function useStartRunGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => tauriApi.startRunGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useStopRunGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => tauriApi.stopRunGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}
