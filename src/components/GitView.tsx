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
} from 'lucide-react';

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
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data: fileDiffData, isLoading: isLoadingDiff } = useGitDiff(
    projectPath,
    selectedFileForDiff?.path || '',
    selectedFileForDiff?.staged || false,
    !!selectedFileForDiff
  );

  const handleFetch = async () => {
    try {
      const msg = await gitFetchMutation.mutateAsync(projectPath);
      setNotification({ type: 'success', message: msg });
      setTimeout(() => setNotification(null), 4000);
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || String(e) });
    }
  };

  const handlePull = async () => {
    try {
      const msg = await gitPullMutation.mutateAsync(projectPath);
      setNotification({ type: 'success', message: msg || 'Pull completed successfully' });
      setTimeout(() => setNotification(null), 4000);
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || String(e) });
    }
  };

  const handleCheckout = async (branchName: string) => {
    try {
      await checkoutBranchMutation.mutateAsync({ projectPath, branchName });
      setNotification({ type: 'success', message: `Switched to branch '${branchName}'` });
      refetch();
      refetchBranches();
      setTimeout(() => setNotification(null), 4000);
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || String(e) });
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await createBranchMutation.mutateAsync({ projectPath, branchName: newBranchName.trim() });
      setNotification({ type: 'success', message: `Created and checked out branch '${newBranchName.trim()}'` });
      setNewBranchName('');
      setShowNewBranchModal(false);
      refetch();
      refetchBranches();
      setTimeout(() => setNotification(null), 4000);
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || String(e) });
    }
  };

  if (isLoading) {
    return <div className="text-xs text-zinc-500 py-8 text-center">Loading Git status...</div>;
  }

  if (!status) {
    return (
      <div className="text-center py-12 text-zinc-500 text-xs bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <GitBranch className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="font-medium text-zinc-400">Not a Git Repository</p>
        <p className="mt-1">Initialize or clone a repository to use Git features.</p>
      </div>
    );
  }

  const totalChanges =
    (status.modified_files?.length || 0) +
    (status.untracked_files?.length || 0) +
    (status.staged_files?.length || 0);

  return (
    <div className="space-y-4">
      {/* Action Notification */}
      {notification && (
        <div
          className={`p-3 rounded-md flex items-center justify-between text-xs ${
            notification.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
              : 'bg-red-950/60 border border-red-800/80 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="flex items-center justify-between p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-md text-xs">
            <GitBranch className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-mono text-zinc-200 font-medium">{status.branch || 'detached HEAD'}</span>
          </div>

          {status.ahead > 0 && (
            <span className="px-2 py-0.5 bg-blue-950 border border-blue-800 text-blue-300 text-xs rounded">
              ↑ {status.ahead} ahead
            </span>
          )}
          {status.behind > 0 && (
            <span className="px-2 py-0.5 bg-amber-950 border border-amber-800 text-amber-300 text-xs rounded">
              ↓ {status.behind} behind
            </span>
          )}

          {status.is_clean ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              <span>Clean working tree</span>
            </span>
          ) : (
            <span className="text-[11px] text-amber-400 font-medium">
              {totalChanges} uncommitted {totalChanges === 1 ? 'change' : 'changes'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewBranchModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md transition-colors"
            title="Create new branch"
          >
            <Plus className="w-3 h-3 text-emerald-400" />
            <span>New Branch</span>
          </button>
          <button
            onClick={handleFetch}
            disabled={gitFetchMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md transition-colors"
            title="Fetch remote"
          >
            <RefreshCw className={`w-3 h-3 ${gitFetchMutation.isPending ? 'animate-spin' : ''}`} />
            <span>Fetch</span>
          </button>
          <button
            onClick={handlePull}
            disabled={gitPullMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-800/60 text-purple-200 text-xs rounded-md transition-colors"
            title="Pull fast-forward"
          >
            <Download className="w-3 h-3 text-purple-400" />
            <span>Pull</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
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
          <span>Changes ({totalChanges})</span>
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

      {/* Changes Tab View */}
      {activeTab === 'changes' && (
        <div className="space-y-3">
          {totalChanges === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs">
              No changed files in working tree.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Staged files */}
              {status.staged_files && status.staged_files.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">
                    Staged Changes ({status.staged_files.length})
                  </h4>
                  <div className="space-y-1">
                    {status.staged_files.map((file) => (
                      <button
                        key={file}
                        onClick={() => setSelectedFileForDiff({ path: file, staged: true })}
                        className="w-full text-left px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 border border-emerald-900/40 rounded flex items-center justify-between text-xs transition-colors"
                      >
                        <span className="font-mono text-emerald-300">{file}</span>
                        <FileDiff className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Modified files */}
              {status.modified_files && status.modified_files.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
                    Modified ({status.modified_files.length})
                  </h4>
                  <div className="space-y-1">
                    {status.modified_files.map((file) => (
                      <button
                        key={file}
                        onClick={() => setSelectedFileForDiff({ path: file, staged: false })}
                        className="w-full text-left px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 rounded flex items-center justify-between text-xs transition-colors"
                      >
                        <span className="font-mono text-zinc-200">{file}</span>
                        <FileDiff className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Untracked files */}
              {status.untracked_files && status.untracked_files.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                    Untracked ({status.untracked_files.length})
                  </h4>
                  <div className="space-y-1">
                    {status.untracked_files.map((file) => (
                      <div
                        key={file}
                        className="px-3 py-1.5 bg-zinc-900/60 border border-zinc-800/80 rounded flex items-center justify-between text-xs text-zinc-400 font-mono"
                      >
                        <span>{file}</span>
                        <span className="text-[10px] text-zinc-600">new file</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History Tab View */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {status.recent_commits?.map((commit) => (
            <div
              key={commit.hash}
              className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-start justify-between text-xs gap-3"
            >
              <div className="space-y-1">
                <p className="font-medium text-zinc-200">{commit.message}</p>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="text-zinc-400">{commit.author}</span>
                  <span>•</span>
                  <span>{commit.date}</span>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 text-zinc-400 font-mono text-[11px] rounded">
                {commit.short_hash}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Branches Tab View */}
      {activeTab === 'branches' && (
        <div className="space-y-1.5">
          {branches?.map((b) => (
            <div
              key={b.name}
              className="px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <GitBranch className={`w-3.5 h-3.5 ${b.is_current ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <span className={`font-mono ${b.is_current ? 'text-emerald-300 font-bold' : 'text-zinc-300'}`}>
                  {b.name}
                </span>
                {b.is_current && (
                  <span className="px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] rounded">
                    current
                  </span>
                )}
                {b.is_remote && (
                  <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-400 text-[10px] rounded">
                    remote
                  </span>
                )}
              </div>

              {!b.is_current && !b.is_remote && (
                <button
                  onClick={() => handleCheckout(b.name)}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded transition-colors"
                >
                  Checkout
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* File Diff Modal */}
      {selectedFileForDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <FileDiff className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-xs text-zinc-200">{selectedFileForDiff.path}</span>
                {selectedFileForDiff.staged && (
                  <span className="px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] rounded">
                    staged
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedFileForDiff(null)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-zinc-950 font-mono text-xs">
              {isLoadingDiff ? (
                <p className="text-zinc-500">Loading diff...</p>
              ) : fileDiffData?.diff ? (
                <pre className="whitespace-pre-wrap">
                  {fileDiffData.diff.split('\n').map((line, i) => {
                    let className = 'text-zinc-400';
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                      className = 'text-emerald-400 bg-emerald-950/30';
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                      className = 'text-red-400 bg-red-950/30';
                    } else if (line.startsWith('@@')) {
                      className = 'text-cyan-400 font-bold';
                    }
                    return (
                      <div key={i} className={`px-2 py-0.5 ${className}`}>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              ) : (
                <p className="text-zinc-500 italic">No diff available for this file.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Branch Modal */}
      {showNewBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100">Create & Checkout Branch</h3>
            <form onSubmit={handleCreateBranch} className="space-y-3">
              <input
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
                  disabled={!newBranchName.trim()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white rounded-md transition-colors"
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
