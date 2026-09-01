import React, { useState, useEffect } from 'react';
import { tauriApi } from '../lib/tauri';
import { ProjectInspection } from '../types';
import { FolderPlus, AlertCircle, Layers, GitBranch, Play, X } from 'lucide-react';

interface ImportProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (projectId: string) => void;
}

export const ImportProjectDialog: React.FC<ImportProjectDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [path, setPath] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [inspection, setInspection] = useState<ProjectInspection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPath('');
      setInspection(null);
      setError(null);
    }
  }, [isOpen]);

  const handleInspect = async (inputPath: string) => {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      setInspection(null);
      setError(null);
      return;
    }

    setIsInspecting(true);
    setError(null);

    try {
      const res = await tauriApi.inspectProjectPath(trimmed);
      setInspection(res);
    } catch (e: any) {
      setInspection(null);
      setError(e?.message || String(e));
    } finally {
      setIsInspecting(false);
    }
  };

  const handleImport = async () => {
    if (!path.trim()) return;
    setIsImporting(true);
    setError(null);

    try {
      const proj = await tauriApi.importProject(path.trim());
      onSuccess(proj.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Import Existing Project</h2>
              <p className="text-xs text-zinc-400">Specify local directory to inspect and import</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Project Directory Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInspect(path);
                }}
                onBlur={() => handleInspect(path)}
                placeholder="/home/user/projects/my-app"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <button
                type="button"
                onClick={() => handleInspect(path)}
                disabled={isInspecting || !path.trim()}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 rounded-md transition-colors"
              >
                {isInspecting ? 'Inspecting...' : 'Inspect'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-md flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {inspection && (
            <div className="space-y-3 pt-2 border-t border-zinc-800/60">
              {inspection.already_imported && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-center gap-2 text-xs text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>This project is already registered in Runyard. Importing will update its metadata.</span>
                </div>
              )}

              {/* Detected Overview */}
              <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-200">{inspection.project.name}</span>
                  {inspection.project.project_type && (
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded uppercase font-mono">
                      {inspection.project.project_type}
                    </span>
                  )}
                </div>

                {/* Tech tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {inspection.project.languages.map((l) => (
                    <span key={l} className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 text-[11px] rounded">
                      {l}
                    </span>
                  ))}
                  {inspection.project.frameworks.map((f) => (
                    <span key={f} className="px-2 py-0.5 bg-blue-950/60 border border-blue-800/50 text-blue-300 text-[11px] rounded">
                      {f}
                    </span>
                  ))}
                </div>

                {/* Git state */}
                {inspection.git_status && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400 pt-1">
                    <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                    <span>{inspection.git_status.branch || 'detached HEAD'}</span>
                    {inspection.git_status.remote_url && (
                      <span className="text-zinc-500 truncate max-w-[240px]">
                        ({inspection.git_status.remote_url})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Discovered Services */}
              {inspection.services.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 mb-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    <span>Nested Services Detected ({inspection.services.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {inspection.services.map((svc) => (
                      <div
                        key={svc.name}
                        className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-800/80 rounded flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 font-medium">{svc.name}</span>
                          <span className="font-mono text-zinc-500 text-[11px]">{svc.path}</span>
                        </div>
                        <span className="text-zinc-400 text-[11px]">{svc.languages.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discovered Run Configurations */}
              {inspection.run_configs.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 mb-1.5">
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Discovered Run Configurations ({inspection.run_configs.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {inspection.run_configs.map((cfg, idx) => (
                      <div
                        key={idx}
                        className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-800/80 rounded flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200">{cfg.name}</span>
                          {cfg.service_name && (
                            <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-400 text-[10px] rounded">
                              {cfg.service_name}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-zinc-500 text-[11px]">
                          {cfg.command} {cfg.args.join(' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-zinc-950 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!path.trim() || isImporting}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white rounded-md transition-colors flex items-center gap-1.5"
          >
            {isImporting ? 'Importing...' : 'Import Project'}
          </button>
        </div>
      </div>
    </div>
  );
};
