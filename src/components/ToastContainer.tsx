import React from 'react';
import { useToastStore, Toast } from '../stores/toast-store';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: Toast;
  onClose: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose }) => {
  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
    error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
    info: <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />,
  };

  const borders = {
    success: 'border-emerald-800/80 bg-zinc-900/95 text-zinc-100 shadow-emerald-950/20',
    error: 'border-red-800/80 bg-zinc-900/95 text-zinc-100 shadow-red-950/20',
    warning: 'border-amber-800/80 bg-zinc-900/95 text-zinc-100 shadow-amber-950/20',
    info: 'border-blue-800/80 bg-zinc-900/95 text-zinc-100 shadow-blue-950/20',
  };

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-lg border shadow-xl backdrop-blur-md transition-all text-xs animate-in slide-in-from-bottom-2 duration-150',
        borders[toast.type]
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {icons[toast.type]}
        <div className="space-y-0.5 min-w-0">
          {toast.title && <div className="font-semibold text-zinc-200">{toast.title}</div>}
          <div className="text-zinc-300 break-words whitespace-pre-wrap">{toast.message}</div>
        </div>
      </div>
      <button
        onClick={onClose}
        className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 -mr-1 -mt-1 shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
