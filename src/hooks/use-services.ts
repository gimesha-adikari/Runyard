import { useQuery } from '@tanstack/react-query';
import { tauriApi } from '../lib/tauri';

export function useProjectServices(projectId: string) {
  return useQuery({
    queryKey: ['services', projectId],
    queryFn: () => tauriApi.getProjectServices(projectId),
    enabled: !!projectId,
  });
}
