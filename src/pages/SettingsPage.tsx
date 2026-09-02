import { useState, type FormEvent } from 'react';
import { useSettings, useScanRoots, useAddScanRoot, useRemoveScanRoot } from '../hooks/use-settings';
import { useDetectedIdes, useSetDefaultIde } from '../hooks/use-ides';
import { useScanProjects } from '../hooks/use-projects';
import { toast } from '../stores/toast-store';
import {
  Settings,
  FolderSearch,
  Code2,
  Trash2,
  Plus,
  Info,
  Keyboard,
  RefreshCw,
} from 'lucide-react';

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: scanRoots = [] } = useScanRoots();
  const { data: ides = [] } = useDetectedIdes();
  const addScanRoot = useAddScanRoot();
  const removeScanRoot = useRemoveScanRoot();
  const setDefaultIde = useSetDefaultIde();
  const scanProjects = useScanProjects();

  const [newRootPath, setNewRootPath] = useState('');

  const handleAddRoot = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRootPath.trim()) return;
    try {
      await addScanRoot.mutateAsync(newRootPath.trim());
      toast.success('Added scan root');
      setNewRootPath('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add scan root');
    }
  };

  const handleRemoveRoot = async (id: string) => {
    try {
      await removeScanRoot.mutateAsync(id);
      toast.info('Removed scan root');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove scan root');
    }
  };

  const handleSetDefaultIde = async (ideId: string) => {
    try {
      await setDefaultIde.mutateAsync(ideId);
      const ide = ides.find((i) => i.id === ideId);
      toast.success(ide ? `Default IDE set to ${ide.name}` : 'Default IDE updated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update default IDE');
    }
  };

  const handleRescan = async () => {
    try {
      await scanProjects.mutateAsync();
      toast.success('Projects scan completed');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to scan projects');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
      <h1 className="text-xl font-bold text-zinc-100 flex items-center">
        <Settings className="w-5 h-5 mr-2 text-zinc-400" />
        Settings
      </h1>

      {/* Project Scan Roots Section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <FolderSearch className="w-4 h-4 text-emerald-500" />
              <span>Project Scan Roots</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">Directories monitored by Runyard for local developer projects.</p>
          </div>
          <button
            onClick={handleRescan}
            disabled={scanProjects.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs font-medium rounded-md transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanProjects.isPending ? 'animate-spin' : ''}`} />
            <span>Rescan Now</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <ul className="space-y-2">
            {scanRoots.length === 0 ? (
              <li className="text-zinc-500 text-xs italic p-4 text-center bg-zinc-950/60 rounded-lg border border-zinc-800">
                No scan roots configured. Add a directory path below.
              </li>
            ) : (
              scanRoots.map((root) => (
                <li
                  key={root.id}
                  className="flex justify-between items-center p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs"
                >
                  <span className="font-mono text-zinc-200 truncate">{root.path}</span>
                  <button
                    onClick={() => handleRemoveRoot(root.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded transition-colors"
                    title="Remove scan root"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))
            )}
          </ul>

          <form onSubmit={handleAddRoot} className="flex gap-2">
            <input
              type="text"
              value={newRootPath}
              onChange={(e) => setNewRootPath(e.target.value)}
              placeholder="e.g. /home/user/workspace or /home/user/projects"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 font-mono"
            />
            <button
              type="submit"
              disabled={!newRootPath.trim() || addScanRoot.isPending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Path</span>
            </button>
          </form>
        </div>
      </section>

      {/* IDE Preferences Section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-500" />
            <span>IDE & Editor Preferences</span>
          </h2>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Default System IDE</label>
            <select
              value={settings?.default_ide || ''}
              onChange={(e) => handleSetDefaultIde(e.target.value)}
              className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">System Default</option>
              {ides.map((ide) => (
                <option key={ide.id} value={ide.id}>
                  {ide.name} ({ide.installed_via})
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="text-xs font-medium text-zinc-300 mb-2">Detected IDEs & Editors</h3>
            {ides.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                No IDEs detected on your system PATH.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ides.map((ide) => (
                  <div
                    key={ide.id}
                    className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-medium text-zinc-200">{ide.name}</div>
                      <div className="text-[11px] font-mono text-zinc-500 mt-0.5">{ide.command}</div>
                    </div>
                    <div className="text-[10px] px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded capitalize">
                      {ide.installed_via}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Keyboard Shortcuts Reference Section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-emerald-500" />
            <span>Keyboard Shortcuts</span>
          </h2>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
              <span className="text-zinc-300">Open Command Palette</span>
              <kbd className="px-2 py-1 bg-zinc-900 text-zinc-400 rounded text-[11px] font-mono border border-zinc-800">
                Ctrl + K / ⌘K
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
              <span className="text-zinc-300">Close Modals / Palettes</span>
              <kbd className="px-2 py-1 bg-zinc-900 text-zinc-400 rounded text-[11px] font-mono border border-zinc-800">
                Esc
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
              <span className="text-zinc-300">Execute Selected Action</span>
              <kbd className="px-2 py-1 bg-zinc-900 text-zinc-400 rounded text-[11px] font-mono border border-zinc-800">
                Enter ↵
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
              <span className="text-zinc-300">Navigate Results</span>
              <kbd className="px-2 py-1 bg-zinc-900 text-zinc-400 rounded text-[11px] font-mono border border-zinc-800">
                ↑ / ↓
              </kbd>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-500" />
            <span>About Runyard</span>
          </h2>
        </div>
        <div className="p-5 text-xs text-zinc-400 space-y-2">
          <div className="flex justify-between max-w-sm">
            <span>Version:</span>
            <span className="text-zinc-200 font-mono">0.1.0-alpha</span>
          </div>
          <div className="flex justify-between max-w-sm">
            <span>Architecture:</span>
            <span className="text-zinc-200 font-medium">Standalone Local-First Desktop App</span>
          </div>
          <div className="flex justify-between max-w-sm">
            <span>Runtime Engine:</span>
            <span className="text-zinc-200 font-medium">Tauri 2 + Native Rust PTY Supervisor</span>
          </div>
        </div>
      </section>
    </div>
  );
}
