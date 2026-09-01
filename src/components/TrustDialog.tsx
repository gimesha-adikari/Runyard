import { AlertTriangle, Terminal } from 'lucide-react';
import { RunConfiguration } from '../types';

interface Props {
  config: RunConfiguration;
  onCancel: () => void;
  onRunOnce: () => void;
  onTrustAndRun: () => void;
}

export function TrustDialog({ config, onCancel, onRunOnce, onTrustAndRun }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-6">
          <div className="flex items-center mb-4 text-amber-500">
            <AlertTriangle className="w-6 h-6 mr-2" />
            <h2 className="text-xl font-semibold">Review Command</h2>
          </div>
          
          <p className="text-zinc-400 mb-6 text-sm">
            This run configuration was automatically detected and has not been reviewed yet. 
            Please verify the command is safe to execute.
          </p>

          <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800 mb-6 font-mono text-sm overflow-x-auto">
            <div className="flex items-center text-zinc-500 mb-2">
              <Terminal className="w-4 h-4 mr-2" />
              <span>{config.name}</span>
            </div>
            <div className="text-emerald-400 break-all">
              $ {config.command} {config.args.join(' ')}
            </div>
            {config.working_dir && (
              <div className="text-zinc-500 mt-2 text-xs">
                cwd: {config.working_dir}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-8">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onRunOnce}
              className="px-4 py-2 rounded-md text-sm font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Run Once
            </button>
            <button
              onClick={onTrustAndRun}
              className="px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
            >
              Trust & Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
