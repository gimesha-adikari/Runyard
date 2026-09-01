import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString();
}

export function getProjectTypeIcon(type: string | null): string {
  switch (type?.toLowerCase()) {
    case 'rust':
    case 'cargo':
      return 'Box';
    case 'node':
    case 'npm':
    case 'yarn':
    case 'pnpm':
      return 'Package';
    case 'python':
      return 'FileCode';
    case 'go':
      return 'Layers';
    default:
      return 'Folder';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'Running':
      return 'bg-emerald-500';
    case 'Stopped':
      return 'bg-zinc-500';
    case 'Failed':
      return 'bg-red-500';
    case 'Starting':
      return 'bg-amber-500';
    default:
      return 'bg-zinc-500';
  }
}

export function truncatePath(path: string, maxLen: number = 40): string {
  if (path.length <= maxLen) return path;
  const parts = path.split(/[/\\]/);
  if (parts.length <= 2) return path.substring(0, maxLen) + '...';
  
  const file = parts.pop();
  const first = parts[0];
  const second = parts[1];
  
  return `${first}/${second}/.../${file}`;
}
