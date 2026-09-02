import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tauriApi } from '../lib/tauri';

export function useGitStatus(projectPath: string) {
  return useQuery({
    queryKey: ['git', 'status', projectPath],
    queryFn: () => tauriApi.getGitStatus(projectPath),
    enabled: !!projectPath,
    refetchInterval: 15000,
  });
}

export function useGitBranches(projectPath: string) {
  return useQuery({
    queryKey: ['git', 'branches', projectPath],
    queryFn: () => tauriApi.getGitBranches(projectPath),
    enabled: !!projectPath,
    refetchInterval: 30000,
  });
}

export function useGitDiff(projectPath: string, filePath: string, staged: boolean, enabled: boolean = false) {
  return useQuery({
    queryKey: ['git', 'diff', projectPath, filePath, staged],
    queryFn: () => tauriApi.getFileDiff(projectPath, filePath, staged),
    enabled: enabled && !!projectPath && !!filePath,
  });
}

export function useGitFetch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectPath: string) => tauriApi.gitFetch(projectPath),
    onSuccess: (_, projectPath) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', projectPath] });
    },
  });
}

export function useGitPull() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectPath: string) => tauriApi.gitPull(projectPath),
    onSuccess: (_, projectPath) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', projectPath] });
    },
  });
}

export function useGitCheckoutBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, branchName }: { projectPath: string; branchName: string }) =>
      tauriApi.gitCheckoutBranch(projectPath, branchName),
    onSuccess: (_, { projectPath }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', projectPath] });
    },
  });
}

export function useGitCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, branchName }: { projectPath: string; branchName: string }) =>
      tauriApi.gitCreateBranch(projectPath, branchName),
    onSuccess: (_, { projectPath }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', projectPath] });
    },
  });
}

export function useDetectGit() {
  return useQuery({
    queryKey: ['git', 'installed'],
    queryFn: () => tauriApi.detectGit(),
    staleTime: 60000,
  });
}

export function useGitStageFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, filePath }: { projectPath: string; filePath: string }) =>
      tauriApi.gitStageFile(projectPath, filePath),
    onSuccess: (_, { projectPath }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
    },
  });
}

export function useGitStageAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectPath: string) => tauriApi.gitStageAll(projectPath),
    onSuccess: (_, projectPath) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
    },
  });
}

export function useGitUnstageFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, filePath }: { projectPath: string; filePath: string }) =>
      tauriApi.gitUnstageFile(projectPath, filePath),
    onSuccess: (_, { projectPath }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
    },
  });
}

export function useGitCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, message }: { projectPath: string; message: string }) =>
      tauriApi.gitCommit(projectPath, message),
    onSuccess: (_, { projectPath }) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', projectPath] });
    },
  });
}

export function useGitPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectPath: string) => tauriApi.gitPush(projectPath),
    onSuccess: (_, projectPath) => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status', projectPath] });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', projectPath] });
    },
  });
}
