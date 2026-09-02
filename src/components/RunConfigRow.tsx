import { RunConfiguration } from '../types';
import { useStartProcess, useStopProcess, useProcesses } from '../hooks/use-processes';
import { Play, Square, ShieldAlert, Edit2, Copy, Trash2, CheckCircle2 } from 'lucide-react';
import { useDeleteRunConfig, useSetDefaultRunConfig } from '../hooks/use-run-configs';
import { useState } from 'react';
import { TrustDialog } from './TrustDialog';
import { useTrustRunConfig } from '../hooks/use-run-configs';
import { useRunUntrustedOnce } from '../hooks/use-processes';
import { cn } from '../lib/utils';
import { toast } from '../stores/toast-store';
import { getErrorMessage } from '../lib/utils';

interface RunConfigRowProps {
  config: RunConfiguration;
  projectId: string;
  onEdit?: () => void;
  onDuplicate?: () => void;
}

export function RunConfigRow({ config, projectId, onEdit, onDuplicate }: RunConfigRowProps) {
  const [showTrustDialog, setShowTrustDialog] = useState(false);
  const trustConfig = useTrustRunConfig();
  const runUntrustedOnce = useRunUntrustedOnce();
  const deleteConfig = useDeleteRunConfig();
  const setDefaultConfig = useSetDefaultRunConfig();
  
  const { data: processes } = useProcesses();
  const startProcess = useStartProcess();
  const stopProcess = useStopProcess();
  
  const isRunning = processes?.some(p => p.run_config_id === config.id && (p.status === 'Running' || p.status === 'Starting'));
  const process = processes?.find(p => p.run_config_id === config.id);

  const handleToggle = async () => {
    if (isRunning && process) {
      try {
        await stopProcess.mutateAsync(process.id);
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    } else {
      if (!config.is_trusted) {
        setShowTrustDialog(true);
        return;
      }
      try {
        await startProcess.mutateAsync(config.id);
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    }
  };

  const fullCommand = `${config.command} ${config.args || ''}`.trim();

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-950 hover:bg-[#111] transition-colors group select-none">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={handleToggle}
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0",
              isRunning
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            )}
            title={isRunning ? "Stop process" : "Run configuration"}
          >
            {isRunning ? (
              <Square className="w-3 h-3 fill-red-400" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-emerald-400/20 text-emerald-400 ml-0.5" />
            )}
          </button>
          
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-xs text-zinc-200 truncate">{config.name}</span>
            {!config.is_trusted && (
              <span className="flex items-center text-[10px] text-amber-400 bg-amber-950/40 border border-amber-800/50 px-1.5 py-0.2 rounded shrink-0">
                <ShieldAlert className="w-3 h-3 mr-1" /> untrusted
              </span>
            )}
            {config.is_default && (
              <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-1.5 py-0.2 rounded shrink-0">
                default
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-[10px] text-zinc-500 truncate max-w-sm bg-[#111] px-2 py-0.5 rounded border border-zinc-800/60 group-hover:text-zinc-400 transition-colors">
            {fullCommand}
          </span>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setDefaultConfig.mutate({ projectId, configId: config.id })}
              className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors rounded"
              title="Set as Default"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onEdit}
              className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors rounded"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDuplicate}
              className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors rounded"
              title="Duplicate"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { if(confirm('Delete this configuration?')) deleteConfig.mutate({ projectId, id: config.id }); }}
              className="p-1 text-zinc-500 hover:text-red-400 transition-colors rounded"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showTrustDialog && (
        <TrustDialog
          config={config}
          onCancel={() => setShowTrustDialog(false)}
          onRunOnce={() => {
            setShowTrustDialog(false);
            runUntrustedOnce.mutate(config.id, {
              onError: (err) => toast.error(getErrorMessage(err))
            });
          }}
          onTrustAndRun={() => {
            setShowTrustDialog(false);
            trustConfig.mutate({ id: config.id, projectId }, {
              onSuccess: () => {
                startProcess.mutate(config.id, {
                  onError: (err) => toast.error(getErrorMessage(err))
                });
              },
              onError: (err) => toast.error(getErrorMessage(err))
            });
          }}
        />
      )}
    </>
  );
}
