import { TerminalView } from './TerminalView';
import { LogViewer } from './LogViewer';
import { useUiStore } from '../stores/ui-store';
import { useProject } from '../hooks/use-projects';
import { useProcesses } from '../hooks/use-processes';
import { useGitDiff } from '../hooks/use-git';
import { X, RefreshCw, AlertTriangle, FileDiff } from 'lucide-react';
import { cn } from '../lib/utils';

interface BottomPanelProps {
  onClose: () => void;
}

export function BottomPanel({ onClose }: BottomPanelProps) {
  const { activeProjectId, bottomPanelTab, setBottomPanelTab, diffTarget } = useUiStore();
  const { data: project } = useProject(activeProjectId || '');

  return (
    <div className="flex flex-col h-full bg-[#111] text-zinc-300 select-none">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950 shrink-0 h-8 px-2">
        <div className="flex items-center h-full text-xs font-medium">
          <button 
            onClick={() => setBottomPanelTab('terminal')}
            className={cn(
              "px-3 h-full flex items-center border-b-2 transition-colors",
              bottomPanelTab === 'terminal' 
                ? "border-emerald-500 text-emerald-400 font-semibold bg-[#111]" 
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Terminal
          </button>
          <button 
            onClick={() => setBottomPanelTab('logs')}
            className={cn(
              "px-3 h-full flex items-center border-b-2 transition-colors",
              bottomPanelTab === 'logs' 
                ? "border-emerald-500 text-emerald-400 font-semibold bg-[#111]" 
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Logs
          </button>
          <button 
            onClick={() => setBottomPanelTab('git')}
            className={cn(
              "px-3 h-full flex items-center border-b-2 transition-colors",
              bottomPanelTab === 'git' 
                ? "border-emerald-500 text-emerald-400 font-semibold bg-[#111]" 
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Git Diff
          </button>
          <button 
            onClick={() => setBottomPanelTab('problems')}
            className={cn(
              "px-3 h-full flex items-center border-b-2 transition-colors",
              bottomPanelTab === 'problems' 
                ? "border-emerald-500 text-emerald-400 font-semibold bg-[#111]" 
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Problems
          </button>
        </div>

        <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab contents */}
      <div className="flex-1 overflow-hidden relative bg-zinc-950">
        {bottomPanelTab === 'terminal' && (
          activeProjectId ? (
            <TerminalView projectPath={project?.path || ''} />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
              Select a project to view terminal
            </div>
          )
        )}

        {bottomPanelTab === 'logs' && (
          <div className="h-full flex flex-col p-3">
            <LogTab projectId={activeProjectId || ''} />
          </div>
        )}

        {bottomPanelTab === 'git' && (
          <GitDiffTab projectPath={project?.path || ''} diffTarget={diffTarget} />
        )}

        {bottomPanelTab === 'problems' && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs gap-1">
            <AlertTriangle className="w-5 h-5 text-zinc-600 mb-1" />
            <span>No problems detected in workspace</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LogTab({ projectId }: { projectId: string }) {
  const { data: processes } = useProcesses();
  const { selectedProcessIdForLogs } = useUiStore();
  const projectProcesses = (processes || []).filter(p => p.project_id === projectId);
  
  if (projectProcesses.length === 0) {
    return (
      <div className="text-zinc-500 text-xs flex items-center justify-center h-full">
        No processes have been run in this project.
      </div>
    );
  }
  
  const activeProcess = selectedProcessIdForLogs 
    ? projectProcesses.find(p => p.id === selectedProcessIdForLogs) 
    : (projectProcesses.find(p => p.status === 'Running' || p.status === 'Starting') || projectProcesses[0]);

  if (!activeProcess) return null;
  
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="mb-2 text-xs text-zinc-400 flex items-center justify-between">
        <span>Viewing logs for: <span className="text-zinc-200 font-semibold">{activeProcess.run_config_name}</span></span>
        <span className="font-mono text-[10px] text-zinc-500">PID: {activeProcess.pid || '—'}</span>
      </div>
      <LogViewer processId={activeProcess.id} />
    </div>
  );
}

function GitDiffTab({ projectPath, diffTarget }: { projectPath: string; diffTarget: { path: string; staged: boolean } | null }) {
  const { data: fileDiffData, isLoading } = useGitDiff(
    projectPath,
    diffTarget?.path || '',
    diffTarget?.staged || false,
    !!diffTarget && !!projectPath
  );

  if (!diffTarget) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs gap-2">
        <FileDiff className="w-6 h-6 text-zinc-600 opacity-60" />
        <span>Select a modified file in Git Changes to view its diff</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-xs">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#111] border-b border-zinc-800/80 shrink-0 text-[11px]">
        <div className="flex items-center gap-2">
          <FileDiff className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-zinc-200">{diffTarget.path}</span>
          {diffTarget.staged && (
            <span className="px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 text-[9px] rounded font-semibold">
              staged
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 select-text">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-zinc-500 text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin text-emerald-500" />
            <span>Loading diff...</span>
          </div>
        ) : fileDiffData?.diff ? (
          <pre className="whitespace-pre font-mono leading-relaxed text-[11px]">
            {fileDiffData.diff.split('\n').map((line, i) => {
              let className = 'text-zinc-400';
              if (line.startsWith('+') && !line.startsWith('+++')) {
                className = 'text-emerald-400 bg-emerald-950/40 font-medium';
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                className = 'text-red-400 bg-red-950/40 font-medium';
              } else if (line.startsWith('@@')) {
                className = 'text-cyan-400 bg-zinc-900/80 font-bold';
              }
              return (
                <div key={i} className={`px-2 py-0.5 ${className}`}>
                  {line || ' '}
                </div>
              );
            })}
          </pre>
        ) : (
          <div className="text-zinc-500 italic py-6 text-center text-xs">
            No diff changes detected for this file.
          </div>
        )}
      </div>
    </div>
  );
}
