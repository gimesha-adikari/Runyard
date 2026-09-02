import { useState } from 'react';
import { X, RefreshCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { useGitStatus } from '../hooks/use-git';
import { useProjects } from '../hooks/use-projects';
import { useUiStore } from '../stores/ui-store';
import { cn } from '../lib/utils';

export function GitChangesPane({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  const { data: status, isLoading, refetch } = useGitStatus(project?.path || '');
  const { setBottomPanelOpen, setBottomPanelTab, setDiffTarget, diffTarget } = useUiStore();

  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [untrackedExpanded, setUntrackedExpanded] = useState(true);

  if (!project) {
    return (
      <div className="flex flex-col h-full bg-[#111] p-4 text-xs text-zinc-500">
        No project selected.
      </div>
    );
  }

  const stagedFiles = status?.staged_files || [];
  const modifiedFiles = status?.modified_files || [];
  const untrackedFiles = status?.untracked_files || [];

  const handleSelectFile = (file: string, staged: boolean) => {
    setDiffTarget({ path: file, staged });
    setBottomPanelTab('git');
    setBottomPanelOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-[#111] text-zinc-300 select-none">
      {/* Pane Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-800/80 shrink-0 bg-zinc-950">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Git Changes
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            className={cn(
              "p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors",
              isLoading && "animate-spin"
            )}
            title="Refresh Git status"
          >
            <RefreshCcw className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
            title="Close Git pane"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-y-auto py-2 text-xs">
        {!project.has_git ? (
          <div className="p-4 text-xs text-zinc-500 italic text-center">
            Not a Git repository
          </div>
        ) : status?.is_clean ? (
          <div className="p-4 text-xs text-zinc-500 italic text-center">
            Working directory clean
          </div>
        ) : (
          <div className="space-y-3">
            {/* Staged Changes */}
            {stagedFiles.length > 0 && (
              <div>
                <button
                  onClick={() => setStagedExpanded(!stagedExpanded)}
                  className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-wider"
                >
                  {stagedExpanded ? (
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-500" />
                  )}
                  <span>Staged Changes ({stagedFiles.length})</span>
                </button>
                {stagedExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {stagedFiles.map((file) => {
                      const isSelected = diffTarget?.path === file && diffTarget?.staged;
                      return (
                        <button
                          key={file}
                          onClick={() => handleSelectFile(file, true)}
                          className={cn(
                            "w-full flex items-center gap-2 px-4 py-1 text-left font-mono text-[11px] hover:bg-zinc-900 transition-colors group",
                            isSelected ? "bg-emerald-950/40 text-emerald-300" : "text-zinc-300"
                          )}
                        >
                          <span className="text-[10px] font-bold text-emerald-400 shrink-0">M</span>
                          <span className="truncate">{file}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Changes (Modified) */}
            {modifiedFiles.length > 0 && (
              <div>
                <button
                  onClick={() => setChangesExpanded(!changesExpanded)}
                  className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-wider"
                >
                  {changesExpanded ? (
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-500" />
                  )}
                  <span>Changes ({modifiedFiles.length})</span>
                </button>
                {changesExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {modifiedFiles.map((file) => {
                      const isSelected = diffTarget?.path === file && !diffTarget?.staged;
                      return (
                        <button
                          key={file}
                          onClick={() => handleSelectFile(file, false)}
                          className={cn(
                            "w-full flex items-center gap-2 px-4 py-1 text-left font-mono text-[11px] hover:bg-zinc-900 transition-colors group",
                            isSelected ? "bg-emerald-950/40 text-emerald-300" : "text-zinc-300"
                          )}
                        >
                          <span className="text-[10px] font-bold text-amber-400 shrink-0">M</span>
                          <span className="truncate">{file}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Untracked */}
            {untrackedFiles.length > 0 && (
              <div>
                <button
                  onClick={() => setUntrackedExpanded(!untrackedExpanded)}
                  className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-wider"
                >
                  {untrackedExpanded ? (
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-500" />
                  )}
                  <span>Untracked ({untrackedFiles.length})</span>
                </button>
                {untrackedExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {untrackedFiles.map((file) => {
                      const isSelected = diffTarget?.path === file && !diffTarget?.staged;
                      return (
                        <button
                          key={file}
                          onClick={() => handleSelectFile(file, false)}
                          className={cn(
                            "w-full flex items-center gap-2 px-4 py-1 text-left font-mono text-[11px] hover:bg-zinc-900 transition-colors group",
                            isSelected ? "bg-emerald-950/40 text-emerald-300" : "text-zinc-400"
                          )}
                        >
                          <span className="text-[10px] font-bold text-cyan-400 shrink-0">U</span>
                          <span className="truncate">{file}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
