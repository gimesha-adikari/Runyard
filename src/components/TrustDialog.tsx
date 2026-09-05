import { useEffect } from 'react';
import { ShieldAlert, Terminal, X, ShieldCheck, Play } from 'lucide-react';
import { RunConfiguration } from '../types';

interface Props {
  config: RunConfiguration;
  onCancel: () => void;
  onRunOnce: () => void;
  onTrustAndRun: () => void;
}

export function TrustDialog({ config, onCancel, onRunOnce, onTrustAndRun }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-fast"
      onClick={onCancel}
    >
      <div
        className="bg-[#111114] border border-border-card rounded-[6px] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col menu-entrance"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-card bg-[#0c0c0e]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-[4px] text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Review Untrusted Command</h2>
              <p className="text-xs text-zinc-400">Auto-detected configuration requires your verification</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-zinc-500 hover:text-zinc-300 btn-tactile transition-colors duration-fast p-1 rounded-[2px]"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-zinc-300 leading-relaxed">
            This run configuration was automatically discovered in project files. Verify the command and arguments below before executing native processes on your machine.
          </p>

          <div className="bg-[#0c0c0e] rounded-[4px] p-3.5 border border-border-card font-mono space-y-2">
            <div className="flex items-center justify-between text-zinc-500 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-semibold text-zinc-300">{config.name}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded-[2px]">
                {config.source}
              </span>
            </div>

            <div className="text-emerald-400 text-xs break-all bg-[#141418] p-2 rounded-[3px] border border-border-card">
              <span className="text-zinc-500 mr-1.5">$</span>
              {config.command} {config.args.join(' ')}
            </div>

            {config.working_dir && (
              <div className="text-zinc-500 text-[11px] truncate">
                cwd: <span className="text-zinc-400">{config.working_dir}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#0c0c0e] border-t border-border-card">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-[3px] text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-[#18181f] btn-tactile transition-colors duration-fast"
          >
            Cancel
          </button>
          <button
            onClick={onRunOnce}
            className="px-3.5 py-1.5 rounded-[3px] text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 btn-tactile transition-colors duration-fast flex items-center gap-1"
          >
            <Play className="w-3 h-3" />
            <span>Run Once</span>
          </button>
          <button
            onClick={onTrustAndRun}
            className="px-4 py-1.5 rounded-[3px] text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white btn-tactile transition-colors duration-fast flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Trust & Run</span>
          </button>
        </div>
      </div>
    </div>
  );
}
