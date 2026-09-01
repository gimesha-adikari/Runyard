import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tauriApi } from '../lib/tauri';

export function useDetectedIdes() {
  return useQuery({
    queryKey: ['ides'],
    queryFn: () => tauriApi.detectIdes(),
  });
}

export function useOpenInIde() {
  return useMutation({
    mutationFn: ({ command, projectPath }: { command: string; projectPath: string }) => 
      tauriApi.openInIde(command, projectPath),
  });
}

export function useDefaultIde() {
  return useQuery({
    queryKey: ['defaultIde'],
    queryFn: () => tauriApi.getDefaultIde(),
  });
}

export function useSetDefaultIde() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ideId: string) => tauriApi.setDefaultIde(ideId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defaultIde'] });
    },
  });
}
