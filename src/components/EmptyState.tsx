import { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-900/50 rounded-lg border border-zinc-800/50 border-dashed">
      <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-zinc-400" />
      </div>
      <h3 className="text-zinc-200 font-medium mb-2">{title}</h3>
      <p className="text-zinc-500 text-sm max-w-sm mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-md transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
