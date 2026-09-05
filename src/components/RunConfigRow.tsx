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
import { useUiStore } from '../stores/ui-store';

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
        const proc = await startProcess.mutateAsync(config.id);
        useUiStore.getState().setSelectedProcessIdForLogs(proc.id);
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    }
  };

  const fullCommand = `${config.command} ${config.args || ''}`.trim();

  return (
    <>
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0c0c0e] hover:bg-[#141418] active:bg-[#16161c] transition-colors duration-fast group select-none gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={handleToggle}
            className={cn(
              "w-5.5 h-5.5 rounded-[3px] flex items-center justify-center btn-tactile transition-colors duration-fast shrink-0",
              isRunning
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            )}
            title={isRunning ? "Stop process" : "Run configuration"}
          >
            {isRunning ? (
              <Square className="w-3 h-3 fill-red-400" />
            ) : (
              <Play className="w-3 h-3 fill-emerald-400/20 text-emerald-400 ml-0.5" />
            )}
          </button>
          
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-xs text-zinc-200 truncate">{config.name}</span>
            {!config.is_trusted && (
              <span className="flex items-center text-[9px] text-amber-400/90 bg-amber-950/40 border border-amber-800/50 px-1 py-0.2 rounded-[2px] shrink-0 font-mono">
                <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> untrusted
              </span>
            )}
            {config.is_default && (
              <span className="text-[9px] text-emerald-400/90 bg-emerald-950/40 border border-emerald-800/50 px-1 py-0.2 rounded-[2px] shrink-0 font-mono">
                default
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <span
            title={fullCommand}
            className="hidden sm:inline-block font-mono text-[10px] text-zinc-500 truncate max-w-[120px] md:max-w-[200px] lg:max-w-[320px] bg-[#121216] px-2 py-0.5 rounded-[2px] border border-border-card group-hover:text-zinc-300 transition-colors duration-fast"
          >
            {fullCommand}
          </span>

          <div className="flex items-center gap-0.5 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-fast shrink-0">
            <button
              type="button"
              onClick={() => setDefaultConfig.mutate({ projectId, configId: config.id })}
              className="p-1 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800/80 transition-colors duration-fast rounded-[2px] btn-tactile"
              title="Set as Default"
            >
              <CheckCircle2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors duration-fast rounded-[2px] btn-tactile"
              title="Edit"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onDuplicate}
              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors duration-fast rounded-[2px] btn-tactile"
              title="Duplicate"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => { if(confirm('Delete this configuration?')) deleteConfig.mutate({ projectId, id: config.id }); }}
              className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-950/40 transition-colors duration-fast rounded-[2px] btn-tactile"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
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
              onSuccess: (proc) => {
                useUiStore.getState().setSelectedProcessIdForLogs(proc.id);
              },
              onError: (err) => toast.error(getErrorMessage(err)),
            });
          }}
          onTrustAndRun={() => {
            setShowTrustDialog(false);
            trustConfig.mutate(
              { id: config.id, projectId },
              {
                onSuccess: () => {
                  startProcess.mutate(config.id, {
                    onSuccess: (proc) => {
                      useUiStore.getState().setSelectedProcessIdForLogs(proc.id);
                    },
                    onError: (err) => toast.error(getErrorMessage(err)),
                  });
                },
                onError: (err) => toast.error(getErrorMessage(err)),
              }
            );
          }}
        />
      )}
    </>
  );
}
