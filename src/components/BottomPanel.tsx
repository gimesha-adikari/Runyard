import { useState, useMemo } from 'react';
import { TerminalView } from './TerminalView';
import { LogViewer } from './LogViewer';
import { CustomSelect } from './common/CustomSelect';
import { useUiStore } from '../stores/ui-store';
import { useProject } from '../hooks/use-projects';
import { useProcesses } from '../hooks/use-processes';
import { useRunConfigs } from '../hooks/use-run-configs';
import { useGitDiff } from '../hooks/use-git';
import {
  X,
  AlertTriangle,
  FileDiff,
  Terminal,
  ScrollText,
  GitCommit,
  Eraser,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface BottomPanelProps {
  onClose: () => void;
}

export function BottomPanel({ onClose }: BottomPanelProps) {
  const {
    activeProjectId,
    bottomPanelTab,
    setBottomPanelTab,
    diffTarget,
    activeTerminalSessionId,
    setActiveTerminalSessionId,
    activeTerminalTitle,
    setActiveTerminalTitle,
  } = useUiStore();
  const { data: project } = useProject(activeProjectId || '');
  const { data: processes = [] } = useProcesses();
  const { data: directRunConfigs = [] } = useRunConfigs(activeProjectId || '');
  const { data: parentRunConfigs = [] } = useRunConfigs(project?.parent_project_id || '');
  const { selectedProcessIdForLogs, setSelectedProcessIdForLogs } = useUiStore();

  const [terminalControls, setTerminalControls] = useState<{
    clear: () => void;
    restart: () => void;
  } | null>(null);

  const relevantConfigIds = useMemo(() => {
    const ids = new Set<string>(directRunConfigs.map((c) => c.id));
    if (project?.parent_project_id && project?.path) {
      for (const cfg of parentRunConfigs) {
        const wd = cfg.working_dir || '';
        if (
          wd === project.path ||
          wd.startsWith(project.path + '/') ||
          wd.startsWith(project.path + '\\')
        ) {
          ids.add(cfg.id);
        }
      }
    }
    return ids;
  }, [directRunConfigs, parentRunConfigs, project?.parent_project_id, project?.path]);

  const projectProcesses = useMemo(
    () =>
      processes.filter(
        (p) => p.project_id === activeProjectId || relevantConfigIds.has(p.run_config_id)
      ),
    [processes, activeProjectId, relevantConfigIds]
  );

  const runningPtyProcesses = useMemo(
    () =>
      projectProcesses.filter(
        (p) => p.pty_session_id && (p.status === 'Running' || p.status === 'Starting')
      ),
    [projectProcesses]
  );

  const activeLogProcess = useMemo(() => {
    if (projectProcesses.length === 0) return null;
    if (selectedProcessIdForLogs) {
      const match = projectProcesses.find((p) => p.id === selectedProcessIdForLogs);
      if (match) return match;
    }
    return (
      projectProcesses.find((p) => p.status === 'Running' || p.status === 'Starting') ||
      projectProcesses[0] ||
      null
    );
  }, [projectProcesses, selectedProcessIdForLogs]);

  const logProcessOptions = useMemo(
    () =>
      projectProcesses.map((p) => ({
        value: p.id,
        label: `${p.run_config_name} (${p.status})`,
        secondaryLabel: p.pid ? `PID: ${p.pid}` : undefined,
      })),
    [projectProcesses]
  );

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-zinc-300 select-none overflow-hidden">
      {/* Single Consolidated Tool Header Row (~32px) */}
      <div className="flex items-center justify-between border-b border-[#1b1b20] bg-[#0c0c0e] shrink-0 h-8 px-2">
        {/* Left: Tab selectors */}
        <div className="flex items-center h-full text-xs font-mono">
          <button
            type="button"
            onClick={() => setBottomPanelTab('terminal')}
            className={cn(
              'px-3 h-full flex items-center gap-1.5 border-b-2 transition-colors duration-fast text-[11px] select-none',
              bottomPanelTab === 'terminal'
                ? 'border-emerald-500 text-emerald-400 font-semibold bg-[#141418]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#141418]/50'
            )}
          >
            <Terminal className="w-3 h-3" />
            <span>Terminal</span>
          </button>

          <button
            type="button"
            onClick={() => setBottomPanelTab('logs')}
            className={cn(
              'px-3 h-full flex items-center gap-1.5 border-b-2 transition-colors duration-fast text-[11px] select-none',
              bottomPanelTab === 'logs'
                ? 'border-emerald-500 text-emerald-400 font-semibold bg-[#141418]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#141418]/50'
            )}
          >
            <ScrollText className="w-3 h-3" />
            <span>Logs</span>
            {projectProcesses.filter((p) => p.status === 'Running').length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setBottomPanelTab('git')}
            className={cn(
              'px-3 h-full flex items-center gap-1.5 border-b-2 transition-colors duration-fast text-[11px] select-none',
              bottomPanelTab === 'git'
                ? 'border-emerald-500 text-emerald-400 font-semibold bg-[#141418]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#141418]/50'
            )}
          >
            <GitCommit className="w-3 h-3" />
            <span>Git Diff</span>
          </button>

          <button
            type="button"
            onClick={() => setBottomPanelTab('problems')}
            className={cn(
              'px-3 h-full flex items-center gap-1.5 border-b-2 transition-colors duration-fast text-[11px] select-none',
              bottomPanelTab === 'problems'
                ? 'border-emerald-500 text-emerald-400 font-semibold bg-[#141418]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#141418]/50'
            )}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Problems</span>
          </button>
        </div>

        {/* Right: Consolidated Context Actions based on tab */}
        <div className="flex items-center gap-2">
          {bottomPanelTab === 'terminal' && (
            <div className="flex items-center gap-2">
              {(activeTerminalSessionId || runningPtyProcesses.length > 0) && (
                <div className="flex items-center bg-[#141418] rounded-[3px] p-0.5 border border-zinc-800 mr-1 text-[11px] font-mono gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTerminalSessionId(null);
                      setActiveTerminalTitle(null);
                    }}
                    className={cn(
                      'px-2 py-0.5 rounded-[2px] transition-colors',
                      !activeTerminalSessionId
                        ? 'bg-zinc-800 text-zinc-100 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    Shell
                  </button>

                  {activeTerminalSessionId && (
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded-[2px] bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 font-semibold flex items-center gap-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{activeTerminalTitle || 'Script'}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTerminalSessionId(null);
                          setActiveTerminalTitle(null);
                        }}
                        className="hover:text-zinc-200 ml-0.5 text-zinc-400 cursor-pointer"
                        title="Detach from script (keeps running)"
                      >
                        ×
                      </span>
                    </button>
                  )}

                  {!activeTerminalSessionId &&
                    runningPtyProcesses.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (p.pty_session_id) {
                            setActiveTerminalSessionId(p.pty_session_id);
                            setActiveTerminalTitle(p.run_config_name);
                          }
                        }}
                        className="px-2 py-0.5 rounded-[2px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 hover:bg-[#1c1c24] transition-colors"
                        title={`Attach to ${p.run_config_name}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>{p.run_config_name}</span>
                      </button>
                    ))}
                </div>
              )}
              {project && (
                <span
                  className="hidden md:inline text-[11px] text-zinc-500 font-mono truncate max-w-[260px]"
                  title={project.path}
                >
                  {project.path.replace(/^\/home\/[^/]+/, '~')}
                </span>
              )}
              {!activeTerminalSessionId && (
                <>
                  <button
                    type="button"
                    onClick={terminalControls?.clear}
                    className="flex items-center gap-1 px-2 py-0.5 bg-[#141418] hover:bg-zinc-800 text-zinc-300 rounded-[2px] text-[11px] font-mono border border-zinc-800 btn-tactile transition-colors duration-fast"
                    title="Clear terminal output"
                  >
                    <Eraser className="w-3 h-3 text-zinc-400" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                  <button
                    type="button"
                    onClick={terminalControls?.restart}
                    className="flex items-center gap-1 px-2 py-0.5 bg-[#141418] hover:bg-zinc-800 text-zinc-300 rounded-[2px] text-[11px] font-mono border border-zinc-800 btn-tactile transition-colors duration-fast"
                    title="Restart terminal shell"
                  >
                    <RefreshCw className="w-3 h-3 text-zinc-400" />
                    <span className="hidden sm:inline">Restart</span>
                  </button>
                </>
              )}
            </div>
          )}

          {bottomPanelTab === 'logs' && projectProcesses.length > 0 && activeLogProcess && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-[11px] text-zinc-500 font-mono">Stream:</span>
              <CustomSelect
                value={activeLogProcess.id}
                onChange={(val) => setSelectedProcessIdForLogs(val)}
                options={logProcessOptions}
                size="xs"
              />
              {activeLogProcess.pid && (
                <span className="hidden md:inline text-[10px] text-zinc-500 font-mono">
                  PID: {activeLogProcess.pid}
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-[#141418] btn-tactile transition-colors duration-fast rounded-[2px] ml-1"
            title="Close bottom panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab contents (occupies entire height under single 32px bar) */}
      <div className="flex-1 overflow-hidden relative bg-[#0a0a0c]">
        {bottomPanelTab === 'terminal' &&
          (activeProjectId && project?.path ? (
            <div className="relative w-full h-full">
              <div className={cn('w-full h-full', activeTerminalSessionId ? 'hidden' : 'block')}>
                <TerminalView
                  projectPath={project.path}
                  onRegisterControls={setTerminalControls}
                />
              </div>
              {activeTerminalSessionId && (
                <div className="w-full h-full block">
                  <TerminalView
                    key={activeTerminalSessionId}
                    projectPath={project.path}
                    customSessionId={activeTerminalSessionId}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500 text-xs font-mono">
              {activeProjectId ? 'Loading terminal session...' : 'Select a project in the explorer to view terminal'}
            </div>
          ))}

        {bottomPanelTab === 'logs' && (
          <div className="h-full flex flex-col p-2">
            <LogTab activeProcessId={activeLogProcess?.id || null} />
          </div>
        )}

        {bottomPanelTab === 'git' && (
          <GitDiffTab projectPath={project?.path || ''} diffTarget={diffTarget} />
        )}

        {bottomPanelTab === 'problems' && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs gap-1 font-mono">
            <AlertTriangle className="w-5 h-5 text-zinc-600 mb-1" />
            <span>No problems detected in workspace</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LogTab({ activeProcessId }: { activeProcessId: string | null }) {
  if (!activeProcessId) {
    return (
      <div className="text-zinc-500 text-xs flex items-center justify-center h-full font-mono">
        No active or logged processes in this project.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <LogViewer processId={activeProcessId} className="h-full rounded-md border border-zinc-800" />
    </div>
  );
}

function GitDiffTab({
  projectPath,
  diffTarget,
}: {
  projectPath: string;
  diffTarget: { path: string; staged: boolean } | null;
}) {
  const { data: fileDiffData, isLoading } = useGitDiff(
    projectPath,
    diffTarget?.path || '',
    diffTarget?.staged || false,
    !!diffTarget && !!projectPath
  );

  if (!diffTarget) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs gap-2 font-mono">
        <FileDiff className="w-6 h-6 text-zinc-600 opacity-60" />
        <span>Select a modified file in Git Changes to inspect diff</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] font-mono text-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#0c0c0e] border-b border-[#1f1f23] shrink-0 text-[11px]">
        <div className="flex items-center gap-2">
          <FileDiff className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-zinc-200">{diffTarget.path}</span>
          {diffTarget.staged && (
            <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1 rounded border border-emerald-800/60">
              staged
            </span>
          )}
        </div>
        {isLoading && <span className="text-zinc-500 text-[10px]">Loading diff...</span>}
      </div>

      <div className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed">
        {fileDiffData?.diff ? (
          <pre className="text-zinc-300 font-mono">
            {fileDiffData.diff.split('\n').map((line: string, idx: number) => {
              let color = 'text-zinc-400';
              if (line.startsWith('+') && !line.startsWith('+++'))
                color = 'text-emerald-400 bg-emerald-950/20';
              else if (line.startsWith('-') && !line.startsWith('---'))
                color = 'text-red-400 bg-red-950/20';
              else if (line.startsWith('@@')) color = 'text-purple-400/90';
              return (
                <div key={idx} className={cn('px-2 py-0.2', color)}>
                  {line}
                </div>
              );
            })}
          </pre>
        ) : (
          <div className="text-zinc-500 italic">No diff content found.</div>
        )}
      </div>
    </div>
  );
}
