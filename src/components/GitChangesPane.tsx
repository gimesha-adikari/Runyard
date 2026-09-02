import { useState } from 'react';
import { X, RefreshCcw, ChevronDown, ChevronRight, Plus, Minus, Upload } from 'lucide-react';
import {
  useGitStatus,
  useGitStageFile,
  useGitStageAll,
  useGitUnstageFile,
  useGitCommit,
  useGitPush,
} from '../hooks/use-git';
import { useProjects } from '../hooks/use-projects';
import { useUiStore } from '../stores/ui-store';
import { toast } from '../stores/toast-store';
import { cn, getErrorMessage } from '../lib/utils';

export function GitChangesPane({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  const { data: status, isLoading, refetch } = useGitStatus(project?.path || '');
  const { setBottomPanelOpen, setBottomPanelTab, setDiffTarget, diffTarget } = useUiStore();

  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [untrackedExpanded, setUntrackedExpanded] = useState(true);
  const [commitMessage, setCommitMessage] = useState('');

  const stageFileMutation = useGitStageFile();
  const stageAllMutation = useGitStageAll();
  const unstageFileMutation = useGitUnstageFile();
  const commitMutation = useGitCommit();
  const pushMutation = useGitPush();

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

  const handleStage = async (file: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project?.path) return;
    try {
      await stageFileMutation.mutateAsync({ projectPath: project.path, filePath: file });
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Failed to stage file');
    }
  };

  const handleStageAll = async () => {
    if (!project?.path) return;
    try {
      await stageAllMutation.mutateAsync(project.path);
      toast.success('Staged all changes');
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Failed to stage all');
    }
  };

  const handleUnstage = async (file: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project?.path) return;
    try {
      await unstageFileMutation.mutateAsync({ projectPath: project.path, filePath: file });
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Failed to unstage file');
    }
  };

  const handleCommit = async () => {
    if (!project?.path || !commitMessage.trim()) return;
    try {
      const res = await commitMutation.mutateAsync({
        projectPath: project.path,
        message: commitMessage.trim(),
      });
      toast.success(res || 'Changes committed successfully');
      setCommitMessage('');
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Commit failed');
    }
  };

  const handlePush = async () => {
    if (!project?.path) return;
    try {
      const res = await pushMutation.mutateAsync(project.path);
      toast.success(res || 'Pushed successfully to remote');
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Push failed');
    }
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
            onClick={handlePush}
            disabled={pushMutation.isPending}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors disabled:opacity-50"
            title="Push commits to remote"
          >
            <Upload className={cn("w-3 h-3", pushMutation.isPending && "animate-pulse text-emerald-400")} />
          </button>
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
                <div className="w-full flex items-center justify-between px-3 py-1">
                  <button
                    onClick={() => setStagedExpanded(!stagedExpanded)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-wider"
                  >
                    {stagedExpanded ? (
                      <ChevronDown className="w-3 h-3 text-zinc-500" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-zinc-500" />
                    )}
                    <span>Staged Changes ({stagedFiles.length})</span>
                  </button>
                </div>
                {stagedExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {stagedFiles.map((file) => {
                      const isSelected = diffTarget?.path === file && diffTarget?.staged;
                      return (
                        <div
                          key={file}
                          onClick={() => handleSelectFile(file, true)}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-1 text-left font-mono text-[11px] hover:bg-zinc-900 transition-colors group cursor-pointer",
                            isSelected ? "bg-emerald-950/40 text-emerald-300" : "text-zinc-300"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 truncate">
                            <span className="text-[10px] font-bold text-emerald-400 shrink-0">M</span>
                            <span className="truncate">{file}</span>
                          </div>
                          <button
                            onClick={(e) => handleUnstage(file, e)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-all"
                            title="Unstage file"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Changes (Modified) */}
            {modifiedFiles.length > 0 && (
              <div>
                <div className="w-full flex items-center justify-between px-3 py-1">
                  <button
                    onClick={() => setChangesExpanded(!changesExpanded)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-wider"
                  >
                    {changesExpanded ? (
                      <ChevronDown className="w-3 h-3 text-zinc-500" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-zinc-500" />
                    )}
                    <span>Changes ({modifiedFiles.length})</span>
                  </button>
                  <button
                    onClick={handleStageAll}
                    disabled={stageAllMutation.isPending}
                    className="text-[10px] px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded font-sans transition-colors"
                    title="Stage all changes"
                  >
                    + Stage All
                  </button>
                </div>
                {changesExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {modifiedFiles.map((file) => {
                      const isSelected = diffTarget?.path === file && !diffTarget?.staged;
                      return (
                        <div
                          key={file}
                          onClick={() => handleSelectFile(file, false)}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-1 text-left font-mono text-[11px] hover:bg-zinc-900 transition-colors group cursor-pointer",
                            isSelected ? "bg-emerald-950/40 text-emerald-300" : "text-zinc-300"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 truncate">
                            <span className="text-[10px] font-bold text-amber-400 shrink-0">M</span>
                            <span className="truncate">{file}</span>
                          </div>
                          <button
                            onClick={(e) => handleStage(file, e)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-all"
                            title="Stage file"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Untracked */}
            {untrackedFiles.length > 0 && (
              <div>
                <div className="w-full flex items-center justify-between px-3 py-1">
                  <button
                    onClick={() => setUntrackedExpanded(!untrackedExpanded)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors uppercase tracking-wider"
                  >
                    {untrackedExpanded ? (
                      <ChevronDown className="w-3 h-3 text-zinc-500" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-zinc-500" />
                    )}
                    <span>Untracked ({untrackedFiles.length})</span>
                  </button>
                </div>
                {untrackedExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {untrackedFiles.map((file) => {
                      const isSelected = diffTarget?.path === file && !diffTarget?.staged;
                      return (
                        <div
                          key={file}
                          onClick={() => handleSelectFile(file, false)}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-1 text-left font-mono text-[11px] hover:bg-zinc-900 transition-colors group cursor-pointer",
                            isSelected ? "bg-emerald-950/40 text-emerald-300" : "text-zinc-400"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 truncate">
                            <span className="text-[10px] font-bold text-cyan-400 shrink-0">U</span>
                            <span className="truncate">{file}</span>
                          </div>
                          <button
                            onClick={(e) => handleStage(file, e)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-all"
                            title="Stage untracked file"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Commit Box Footer */}
      {project.has_git && (
        <div className="p-2.5 border-t border-zinc-800/80 bg-zinc-950 flex flex-col gap-2 shrink-0">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message (Enter to commit)..."
            rows={2}
            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-xs text-zinc-200 placeholder:text-zinc-500 font-mono resize-none focus:outline-none focus:border-zinc-700"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleCommit();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500 font-mono">
              {stagedFiles.length > 0 ? `${stagedFiles.length} staged` : 'Stage files first'}
            </span>
            <button
              onClick={handleCommit}
              disabled={!commitMessage.trim() || stagedFiles.length === 0 || commitMutation.isPending}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-medium rounded transition-colors"
            >
              Commit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
