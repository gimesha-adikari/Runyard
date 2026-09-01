import { GitBranch, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { GitStatus } from '../types';

interface Props {
  branch?: string | null;
  status?: GitStatus;
}

export function GitStatusBadge({ branch, status }: Props) {
  if (!branch) return null;

  const isClean = status ? status.is_clean : true;

  return (
    <div className={cn(
      "inline-flex items-center px-2 py-1 rounded text-xs font-medium space-x-1.5 border",
      isClean ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-amber-500/10 border-amber-500/20 text-amber-500"
    )}>
      <GitBranch className="w-3.5 h-3.5" />
      <span>{branch}</span>
      {status && (
        <>
          {isClean ? (
            <CheckCircle2 className="w-3 h-3 ml-1 text-emerald-500" />
          ) : (
            <AlertCircle className="w-3 h-3 ml-1" />
          )}
        </>
      )}
    </div>
  );
}
