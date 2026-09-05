
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

  if (diffInSeconds < 0) return 'Just now';
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function formatElapsedDuration(startedAt: string | null): string {
  if (!startedAt) return '0s';
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - start) / 1000));

  const hours = Math.floor(elapsedSec / 3600);
  const minutes = Math.floor((elapsedSec % 3600) / 60);
  const seconds = elapsedSec % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
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
      return 'bg-amber-400 animate-pulse';
    case 'Stopping':
      return 'bg-amber-600 animate-pulse';
    case 'Exited':
      return 'bg-blue-500';
    default:
      return 'bg-zinc-600';
  }
}

export function truncatePath(path: string, maxLen: number = 42): string {
  if (path.length <= maxLen) return path;
  const parts = path.split(/[/\\]/);
  if (parts.length <= 2) return path.substring(0, maxLen) + '...';
  
  const file = parts.pop();
  const first = parts[0];
  const second = parts[1];
  
  return `${first}/${second}/.../${file}`;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isPathAncestorOrEqual(parent: string, child: string): boolean {
  const normParent = parent.replace(/[/\\]+$/, '');
  const normChild = child.replace(/[/\\]+$/, '');
  if (normChild === normParent) return true;
  return normChild.startsWith(normParent + '/') || normChild.startsWith(normParent + '\\');
}
