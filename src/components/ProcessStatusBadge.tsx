import { getStatusColor } from '../lib/utils';
import { ProcessStatus } from '../types';

interface Props {
  status: ProcessStatus;
  exitCode?: number | null;
}

export function ProcessStatusBadge({ status, exitCode }: Props) {
  const color = getStatusColor(status);
  
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300">
      <span className={`w-2 h-2 rounded-full mr-1.5 ${color}`} />
      {status}
      {(status === 'Exited' || status === 'Failed') && exitCode != null && (
        <span className="ml-1.5 text-zinc-500 font-mono text-[10px]">({exitCode})</span>
      )}
    </span>
  );
}
