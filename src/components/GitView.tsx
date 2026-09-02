import React, { useState } from 'react';
import {
  useGitStatus,
  useGitBranches,
  useGitFetch,
  useGitPull,
  useGitCheckoutBranch,
  useGitCreateBranch,
  useGitDiff,
} from '../hooks/use-git';
import { toast } from '../stores/toast-store';
import {
  GitBranch,
  GitCommit as CommitIcon,
  RefreshCw,
  Download,
  Plus,
  FileCode,
  CheckCircle2,
  AlertCircle,
  FileDiff,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { getErrorMessage, cn } from '../lib/utils';

interface GitViewProps {
  projectPath: string;
}

export const GitView: React.FC<GitViewProps> = ({ projectPath }) => {
  const { data: status, isLoading, refetch } = useGitStatus(projectPath);
  const { data: branches, refetch: refetchBranches } = useGitBranches(projectPath);
  const gitFetchMutation = useGitFetch();
  const gitPullMutation = useGitPull();
  const checkoutBranchMutation = useGitCheckoutBranch();
  const createBranchMutation = useGitCreateBranch();

  const [activeTab, setActiveTab] = useState<'changes' | 'history' | 'branches'>('changes');
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<{ path: string; staged: boolean } | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranchModal, setShowNewBranchModal] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const { data: fileDiffData, isLoading: isLoadingDiff } = useGitDiff(
    projectPath,
    selectedFileForDiff?.path || '',
    selectedFileForDiff?.staged || false,
    !!selectedFileForDiff
  );

  const handleFetch = async () => {
    try {
      const msg = await gitFetchMutation.mutateAsync(projectPath);
      toast.success(msg || 'Fetch completed successfully');
      refetch();
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Git fetch failed');
    }
  };

  const handlePull = async () => {
    try {
      const msg = await gitPullMutation.mutateAsync(projectPath);
      toast.success(msg || 'Pull completed successfully');
      refetch();
      refetchBranches();
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Git pull failed');
    }
  };

  const handleCheckout = async (branchName: string) => {
    try {
      await checkoutBranchMutation.mutateAsync({ projectPath, branchName });
      toast.success(`Switched to branch '${branchName}'`);
      refetch();
      refetchBranches();
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Failed to checkout branch');
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await createBranchMutation.mutateAsync({ projectPath, branchName: newBranchName.trim() });
      toast.success(`Created & checked out branch '${newBranchName.trim()}'`);
      setNewBranchName('');
      setShowNewBranchModal(false);
      refetch();
      refetchBranches();
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Failed to create branch');
    }
  };

  const handleCopyCommitHash = (hash: string) => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopiedHash(hash);
      toast.info('Commit hash copied');
      setTimeout(() => setCopiedHash(null), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-zinc-500">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-emerald-500" />
        <span>Loading Git repository status...</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-12 text-zinc-500 text-xs bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <GitBranch className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="font-semibold text-zinc-300 text-sm">Not a Git Repository</p>
        <p className="mt-1 text-zinc-500">Initialize a repository with git init to use version control features.</p>
      </div>
    );
  }

  const totalChanges =
    (status.modified_files?.length || 0) +
    (status.untracked_files?.length || 0) +
    (status.staged_files?.length || 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-md text-xs">
            <GitBranch className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-mono text-zinc-200 font-semibold">
              {status.branch || 'detached HEAD'}
            </span>
          </div>

          {status.ahead > 0 && (
            <span className="px-2 py-0.5 bg-blue-950 border border-blue-800 text-blue-300 text-xs rounded font-mono">
              ↑ {status.ahead} ahead
            </span>
          )}
          {status.behind > 0 && (
            <span className="px-2 py-0.5 bg-amber-950 border border-amber-800 text-amber-300 text-xs rounded font-mono">
              ↓ {status.behind} behind
            </span>
          )}

          {status.is_clean ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Clean working tree</span>
            </span>
          ) : (
            <span className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{totalChanges} uncommitted {totalChanges === 1 ? 'change' : 'changes'}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewBranchModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md transition-colors"
            title="Create new branch"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>New Branch</span>
          </button>
          <button
            onClick={handleFetch}
            disabled={gitFetchMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs rounded-md transition-colors"
            title="Fetch from remote"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${gitFetchMutation.isPending ? 'animate-spin' : ''}`} />
            <span>Fetch</span>
          </button>
          <button
            onClick={handlePull}
            disabled={gitPullMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-950/60 hover:bg-purple-900/80 disabled:opacity-50 border border-purple-800/60 text-purple-200 text-xs rounded-md transition-colors"
            title="Pull fast-forward changes"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Pull</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-zinc-800 text-xs">
        <button
          onClick={() => setActiveTab('changes')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'changes'
              ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Working Changes ({totalChanges})</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <CommitIcon className="w-3.5 h-3.5" />
          <span>Commit History ({status.recent_commits?.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('branches')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'branches'
              ? 'border-emerald-500 text-emerald-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Branches ({branches?.length || 0})</span>
        </button>
      </div>

      {activeTab === 'changes' && (
        <div className="space-y-4">
          {totalChanges === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs bg-zinc-900/40 rounded-xl border border-zinc-800/60 flex flex-col items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mb-2" />
              <p className="font-medium text-zinc-300">Working directory clean</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">No uncommitted files or modifications.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {status.staged_files && status.staged_files.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Staged Changes ({status.staged_files.length})</span>
                  </div>
                  <div className="space-y-1">
                    {status.staged_files.map((file) => (
                      <button
                        key={file}
                        onClick={() => setSelectedFileForDiff({ path: file, staged: true })}
                        className="w-full text-left px-3 py-2 bg-zinc-950 hover:bg-zinc-900 border border-emerald-900/40 rounded-lg flex items-center justify-between text-xs transition-colors group"
                      >
                        <span className="font-mono text-emerald-300 truncate">{file}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-emerald-500 font-mono">staged</span>
                          <FileDiff className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {status.modified_files && status.modified_files.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Modified Files ({status.modified_files.length})</span>
                  </div>
                  <div className="space-y-1">
                    {status.modified_files.map((file) => (
                      <button
                        key={file}
                        onClick={() => setSelectedFileForDiff({ path: file, staged: false })}
                        className="w-full text-left px-3 py-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between text-xs transition-colors group"
                      >
                        <span className="font-mono text-zinc-200 truncate">{file}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-amber-500 font-mono">modified</span>
                          <FileDiff className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {status.untracked_files && status.untracked_files.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-zinc-500" />
                    <span>Untracked Files ({status.untracked_files.length})</span>
                  </div>
                  <div className="space-y-1">
                    {status.untracked_files.map((file) => (
                      <div
                        key={file}
                        className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between text-xs text-zinc-400 font-mono"
                      >
                        <span className="truncate">{file}</span>
                        <span className="text-[10px] text-zinc-600 font-mono shrink-0">untracked</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-2">
          {status.recent_commits?.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-6 text-center">No commits recorded yet.</p>
          ) : (
            status.recent_commits?.map((commit) => (
              <div
                key={commit.hash}
                className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-start justify-between text-xs gap-3 hover:border-zinc-700 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold text-zinc-200 truncate">{commit.message}</p>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="text-zinc-400">{commit.author}</span>
                    <span>•</span>
                    <span>{commit.date}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleCopyCommitHash(commit.hash)}
                  className="flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 font-mono text-[11px] rounded transition-colors shrink-0"
                  title="Copy full commit hash"
                >
                  {copiedHash === commit.hash ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{commit.short_hash}</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'branches' && (
        <div className="space-y-1.5">
          {branches?.map((b) => (
            <div
              key={b.name}
              className={cn(
                'px-3 py-2.5 rounded-lg border flex items-center justify-between text-xs transition-colors',
                b.is_current
                  ? 'bg-emerald-950/30 border-emerald-800/60'
                  : 'bg-zinc-950 border-zinc-800'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch
                  className={cn(
                    'w-4 h-4 shrink-0',
                    b.is_current ? 'text-emerald-400' : 'text-zinc-500'
                  )}
                />
                <span
                  className={cn(
                    'font-mono truncate',
                    b.is_current ? 'text-emerald-300 font-bold' : 'text-zinc-300'
                  )}
                >
                  {b.name}
                </span>
                {b.is_current && (
                  <span className="px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] rounded font-mono font-bold">
                    current
                  </span>
                )}
                {b.is_remote && (
                  <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-400 text-[10px] rounded font-mono">
                    remote
                  </span>
                )}
              </div>

              {!b.is_current && !b.is_remote && (
                <button
                  onClick={() => handleCheckout(b.name)}
                  disabled={checkoutBranchMutation.isPending}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs rounded transition-colors"
                >
                  Checkout
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedFileForDiff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
          onClick={() => setSelectedFileForDiff(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800">
              <div className="flex items-center gap-2 min-w-0">
                <FileDiff className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-mono text-xs text-zinc-200 truncate">{selectedFileForDiff.path}</span>
                {selectedFileForDiff.staged && (
                  <span className="px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] rounded font-mono">
                    staged
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedFileForDiff(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-zinc-950 font-mono text-xs select-text">
              {isLoadingDiff ? (
                <div className="flex items-center justify-center py-10 text-zinc-500">
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin text-emerald-500" />
                  <span>Loading diff...</span>
                </div>
              ) : fileDiffData?.diff ? (
                <pre className="whitespace-pre font-mono leading-relaxed">
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
                      <div key={i} className={`px-2 py-0.2 ${className}`}>
                        {line || ' '}
                      </div>
                    );
                  })}
                </pre>
              ) : (
                <p className="text-zinc-500 italic py-6 text-center">No diff changes detected for this file.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showNewBranchModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
          onClick={() => setShowNewBranchModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-zinc-100">Create & Checkout Branch</h3>
              <button
                onClick={() => setShowNewBranchModal(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-3">
              <input
                autoFocus
                type="text"
                required
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/my-new-feature"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewBranchModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newBranchName.trim() || createBranchMutation.isPending}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white rounded-md transition-colors"
                >
                  Create Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
