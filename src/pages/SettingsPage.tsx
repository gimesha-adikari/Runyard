import { useState, type FormEvent } from 'react';
import { useSettings, useScanRoots, useAddScanRoot, useRemoveScanRoot } from '../hooks/use-settings';
import { useDetectedIdes, useSetDefaultIde } from '../hooks/use-ides';
import { Settings, FolderSearch, Code2, Trash2, Plus, Info } from 'lucide-react';

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: scanRoots = [] } = useScanRoots();
  const { data: ides = [] } = useDetectedIdes();
  const addScanRoot = useAddScanRoot();
  const removeScanRoot = useRemoveScanRoot();
  const setDefaultIde = useSetDefaultIde();

  const [newRootPath, setNewRootPath] = useState('');

  const handleAddRoot = (e: FormEvent) => {
    e.preventDefault();
    if (newRootPath.trim()) {
      addScanRoot.mutate(newRootPath.trim());
      setNewRootPath('');
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
      <h1 className="text-2xl font-bold text-zinc-100 flex items-center mb-8">
        <Settings className="w-6 h-6 mr-3 text-zinc-400" />
        Settings
      </h1>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-lg font-semibold text-zinc-200 flex items-center">
            <FolderSearch className="w-5 h-5 mr-2 text-emerald-500" />
            Project Scan Roots
          </h2>
          <p className="text-sm text-zinc-500 mt-1">Directories where Runyard will look for projects when scanning.</p>
        </div>
        <div className="p-6 space-y-6">
          <ul className="space-y-3">
            {scanRoots.length === 0 ? (
              <li className="text-zinc-500 text-sm italic">No scan roots configured.</li>
            ) : (
              scanRoots.map(root => (
                <li key={root.id} className="flex justify-between items-center p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <span className="font-mono text-sm text-zinc-300">{root.path}</span>
                  <button 
                    onClick={() => removeScanRoot.mutate(root.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))
            )}
          </ul>

          <form onSubmit={handleAddRoot} className="flex gap-3">
            <input
              type="text"
              value={newRootPath}
              onChange={(e) => setNewRootPath(e.target.value)}
              placeholder="e.g. /home/user/Projects"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
            <button 
              type="submit"
              disabled={!newRootPath.trim() || addScanRoot.isPending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Path
            </button>
          </form>
        </div>
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-lg font-semibold text-zinc-200 flex items-center">
            <Code2 className="w-5 h-5 mr-2 text-emerald-500" />
            IDE Preferences
          </h2>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Default IDE</label>
            <select
              value={settings?.default_ide || ''}
              onChange={(e) => setDefaultIde.mutate(e.target.value)}
              className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-md px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">System Default</option>
              {ides.map(ide => (
                <option key={ide.id} value={ide.id}>{ide.name}</option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Detected IDEs</h3>
            {ides.length === 0 ? (
              <p className="text-sm text-zinc-500">No IDEs detected on your system.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ides.map(ide => (
                  <div key={ide.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-medium text-zinc-200 text-sm">{ide.name}</div>
                      <div className="text-xs font-mono text-zinc-500 mt-0.5">{ide.command}</div>
                    </div>
                    <div className="text-xs px-2 py-1 bg-zinc-900 text-zinc-400 rounded">
                      {ide.installed_via}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-lg font-semibold text-zinc-200 flex items-center">
            <Info className="w-5 h-5 mr-2 text-emerald-500" />
            About Runyard
          </h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col space-y-2 text-sm text-zinc-400">
            <div className="flex justify-between max-w-sm">
              <span>Version:</span>
              <span className="text-zinc-200 font-medium">0.1.0-alpha</span>
            </div>
            <div className="flex justify-between max-w-sm">
              <span>Platform:</span>
              <span className="text-zinc-200 font-medium">Linux</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
