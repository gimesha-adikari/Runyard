import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tauriApi } from '../lib/tauri';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => tauriApi.getProjects(),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => tauriApi.getProject(id),
    enabled: !!id,
  });
}

export function useInspectProject(path: string, enabled: boolean = false) {
  return useQuery({
    queryKey: ['projects', 'inspect', path],
    queryFn: () => tauriApi.inspectProjectPath(path),
    enabled: enabled && path.trim().length > 0,
  });
}

export function useScanProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriApi.scanProjects(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useImportProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => tauriApi.importProject(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useRemoveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tauriApi.removeProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tauriApi.toggleFavorite(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
  });
}

export function useUpdateProjectTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) => tauriApi.updateProjectTags(id, tags),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
  });
}

export function useSetProjectIde() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ideId }: { projectId: string; ideId: string }) =>
      tauriApi.setProjectIde(projectId, ideId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
  });
}

export function useSearchProjects(query: string) {
  return useQuery({
    queryKey: ['projects', 'search', query],
    queryFn: () => tauriApi.searchProjects(query),
    enabled: query.length >= 2,
  });
}
