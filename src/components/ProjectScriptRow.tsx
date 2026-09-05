import { useState } from 'react';
import { ProjectScript, RunConfiguration, Project, ProcessInfo } from '../types';
import { useProcesses, useStartProcess, useStopProcess, useRunUntrustedOnce } from '../hooks/use-processes';
import { useTrustRunConfig } from '../hooks/use-run-configs';
import { useUiStore } from '../stores/ui-store';
import { toast } from '../stores/toast-store';
import { getErrorMessage, cn } from '../lib/utils';
import { tauriApi } from '../lib/tauri';
import { Play, Square, ShieldAlert, Terminal, CheckCircle2 } from 'lucide-react';
import { TrustDialog } from './TrustDialog';
import { useQueryClient } from '@tanstack/react-query';

interface ProjectScriptRowProps {
  script: ProjectScript;
  project: Project;
  scopedConfigs: RunConfiguration[];
}

export function ProjectScriptRow({ script, project, scopedConfigs }: ProjectScriptRowProps) {
  const [showTrustDialog, setShowTrustDialog] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<RunConfiguration | null>(null);

  const queryClient = useQueryClient();
  const { data: processes } = useProcesses();
  const startProcess = useStartProcess();
  const stopProcess = useStopProcess();
  const runUntrustedOnce = useRunUntrustedOnce();
  const trustConfig = useTrustRunConfig();

  // Find matching run config if one already exists in DB
  const matchingConfig = scopedConfigs.find(
    (c) =>
      c.command === script.command ||
      c.command === `./${script.name}` ||
      c.name === script.name ||
      c.name === `Run ${script.name}` ||
      (c.working_dir === project.path && c.command.includes(script.name))
  );

  const activeProcess = processes?.find(
    (p) =>
      (matchingConfig && p.run_config_id === matchingConfig.id) ||
      p.run_config_name === script.name ||
      p.run_config_name === `Run ${script.name}`
  );

  const isRunning = !!activeProcess && (activeProcess.status === 'Running' || activeProcess.status === 'Starting');
  const isTrusted = script.is_trusted;

  const handleProcessStarted = (proc: ProcessInfo) => {
    if (proc.pty_session_id) {
      const store = useUiStore.getState();
      store.setActiveTerminalSessionId(proc.pty_session_id);
      store.setActiveTerminalTitle(script.name);
      store.setBottomPanelTab('terminal');
      store.setBottomPanelOpen(true);
    } else {
      useUiStore.getState().setSelectedProcessIdForLogs(proc.id);
    }
  };

  const handleToggle = async () => {
    if (isRunning && activeProcess) {
      try {
        await stopProcess.mutateAsync(activeProcess.id);
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
      return;
    }

    try {
      let configToRun = matchingConfig;
      if (!configToRun) {
        configToRun = await tauriApi.getOrCreateScriptRunConfig(project.id, script.relative_path);
        queryClient.invalidateQueries({ queryKey: ['runConfigs', project.id] });
      }

      if (!isTrusted) {
        setPendingConfig(configToRun);
        setShowTrustDialog(true);
        return;
      }

      const proc = await startProcess.mutateAsync(configToRun.id);
      handleProcessStarted(proc);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const getKindBadge = () => {
    switch (script.script_kind) {
      case 'DevelopmentServer':
        return (
          <span className="px-1.5 py-0.2 rounded-[2px] text-[9px] font-mono font-medium bg-blue-950/50 border border-blue-800/60 text-blue-300 shrink-0">
            Development Server
          </span>
        );
      case 'ApplicationStart':
        return (
          <span className="px-1.5 py-0.2 rounded-[2px] text-[9px] font-mono font-medium bg-cyan-950/50 border border-cyan-800/60 text-cyan-300 shrink-0">
            Application Start
          </span>
        );
      case 'MultiServiceLauncher':
        return (
          <span className="px-1.5 py-0.2 rounded-[2px] text-[9px] font-mono font-medium bg-purple-950/50 border border-purple-800/60 text-purple-300 shrink-0">
            Multi-Service
          </span>
        );
      case 'InfrastructureTask':
        return (
          <span className="px-1.5 py-0.2 rounded-[2px] text-[9px] font-mono font-medium bg-amber-950/50 border border-amber-800/60 text-amber-300 shrink-0">
            Infrastructure Task
          </span>
        );
      default:
        return null;
    }
  };

  const evidenceSummary = script.evidence.length > 0 ? script.evidence.join('\n') : undefined;

  return (
    <>
      <div
        className="flex items-center justify-between px-3.5 py-2 bg-[#0c0c0e] hover:bg-[#141418] active:bg-[#16161c] transition-colors duration-fast group select-none gap-2"
        title={evidenceSummary}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={handleToggle}
            className={cn(
              'w-5.5 h-5.5 rounded-[3px] flex items-center justify-center btn-tactile transition-colors duration-fast shrink-0',
              isRunning
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
            )}
            title={isRunning ? 'Stop script process' : `Run ${script.name}`}
          >
            {isRunning ? (
              <Square className="w-3 h-3 fill-red-400" />
            ) : (
              <Play className="w-3 h-3 fill-emerald-400/20 text-emerald-400 ml-0.5" />
            )}
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <Terminal className="w-3 h-3 text-zinc-400 shrink-0" />
              <span className="font-semibold text-xs text-zinc-200 font-mono truncate">
                {script.name}
              </span>
            </div>

            {getKindBadge()}

            {script.execution_mode === 'TerminalRequired' && (
              <span className="px-1.5 py-0.2 rounded-[2px] text-[9px] font-mono font-medium bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 shrink-0">
                Terminal
              </span>
            )}

            {!isTrusted ? (
              <span className="flex items-center text-[9px] text-amber-400/90 bg-amber-950/40 border border-amber-800/50 px-1 py-0.2 rounded-[2px] shrink-0 font-mono">
                <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> untrusted
              </span>
            ) : (
              <span className="flex items-center text-[9px] text-emerald-400/90 bg-emerald-950/40 border border-emerald-800/50 px-1 py-0.2 rounded-[2px] shrink-0 font-mono">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> trusted
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            title={script.command}
            className="hidden sm:inline-block font-mono text-[10px] text-zinc-500 truncate max-w-[120px] md:max-w-[200px] lg:max-w-[320px] bg-[#121216] px-2 py-0.5 rounded-[2px] border border-border-card group-hover:text-zinc-300 transition-colors duration-fast"
          >
            {script.command}
          </span>
        </div>
      </div>

      {showTrustDialog && pendingConfig && (
        <TrustDialog
          config={pendingConfig}
          onCancel={() => {
            setShowTrustDialog(false);
            setPendingConfig(null);
          }}
          onRunOnce={() => {
            const cfgId = pendingConfig.id;
            setShowTrustDialog(false);
            setPendingConfig(null);
            runUntrustedOnce.mutate(cfgId, {
              onSuccess: (proc) => {
                handleProcessStarted(proc);
              },
              onError: (err) => toast.error(getErrorMessage(err)),
            });
          }}
          onTrustAndRun={() => {
            const cfgId = pendingConfig.id;
            setShowTrustDialog(false);
            setPendingConfig(null);
            trustConfig.mutate(
              { id: cfgId, projectId: project.id },
              {
                onSuccess: () => {
                  startProcess.mutate(cfgId, {
                    onSuccess: (proc) => {
                      handleProcessStarted(proc);
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
