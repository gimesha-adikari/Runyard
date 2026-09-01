import { getStatusColor } from '../lib/utils';

interface Props {
  status: 'Running' | 'Stopped' | 'Failed' | 'Starting';
}

export function ProcessStatusBadge({ status }: Props) {
  const color = getStatusColor(status);
  
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300">
      <span className={`w-2 h-2 rounded-full mr-1.5 ${color}`} />
      {status}
    </span>
  );
}
