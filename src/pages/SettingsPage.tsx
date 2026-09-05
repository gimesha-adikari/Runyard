import { getErrorMessage } from '../lib/utils';
import { useState, useEffect, type FormEvent } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { pickDirectory } from '../lib/picker';
import {
  useSettings,
  useScanRoots,
  useAddScanRoot,
  useRemoveScanRoot,
} from '../hooks/use-settings';
import { useDetectedIdes, useSetDefaultIde } from '../hooks/use-ides';
import { useScanProjects } from '../hooks/use-projects';
import { useScanProgress } from '../hooks/use-scan-progress';
import { toast } from '../stores/toast-store';
import {
  FolderSearch,
  Code2,
  Trash2,
  Plus,
  Info,
  Keyboard,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../lib/utils';

type SettingsTab = 'scan_roots' | 'ides' | 'shortcuts' | 'about';

export function SettingsPage() {
  const [appVersion, setAppVersion] = useState('0.2.2');
  const [activeTab, setActiveTab] = useState<SettingsTab>('scan_roots');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('0.2.2'));
  }, []);

  const { data: settings } = useSettings();
  const { data: scanRoots = [] } = useScanRoots();
  const { data: ides = [] } = useDetectedIdes();
  const addScanRoot = useAddScanRoot();
  const removeScanRoot = useRemoveScanRoot();
  const setDefaultIde = useSetDefaultIde();
  const scanProjects = useScanProjects();
  const { isAnyScanning, getRootProgress, rescanRoot, rescanAll } = useScanProgress();

  const [newRootPath, setNewRootPath] = useState('');

  const handleAddRoot = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRootPath.trim()) return;
    const path = newRootPath.trim();
    setNewRootPath('');
    try {
      await addScanRoot.mutateAsync(path);
      toast.success('Added scan root');
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Failed to add scan root');
    }
  };

  const handleRemoveRoot = async (id: string) => {
    try {
      await removeScanRoot.mutateAsync(id);
      toast.info('Removed scan root');
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Failed to remove scan root');
    }
  };

  const handleSetDefaultIde = async (ideId: string) => {
    try {
      await setDefaultIde.mutateAsync(ideId);
      const ide = ides.find((i) => i.id === ideId);
      toast.success(ide ? `Default IDE set to ${ide.name}` : 'Default IDE updated');
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Failed to update default IDE');
    }
  };

  const handleRescan = async () => {
    try {
      await rescanAll();
      toast.info('Scan started');
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Failed to scan projects');
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'scan_roots', label: 'Scan Roots', icon: FolderSearch },
    { id: 'ides', label: 'IDE & Editors', icon: Code2 },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
    { id: 'about', label: 'About Runyard', icon: Info },
  ];

  return (
    <div className="flex h-full bg-[#0a0a0c] text-zinc-300 font-sans select-none">
      {/* Settings Navigation Sidebar */}
      <aside className="w-48 sm:w-56 border-r border-[#1b1b20] p-3 sm:p-4 space-y-1 bg-[#0c0c0e] shrink-0">
        <div className="pb-3 px-2 border-b border-[#1b1b20] mb-3">
          <h1 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <span>Settings</span>
          </h1>
        </div>

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-3 py-1.5 rounded-[3px] text-xs transition-colors duration-fast whitespace-nowrap btn-tactile',
                isActive
                  ? 'bg-[#18181f] text-emerald-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141418]'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-emerald-500 rounded-r" />
              )}
              <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-emerald-400' : 'text-zinc-500')} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </aside>

      {/* Settings Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#0a0a0c]">
        <div className="max-w-3xl space-y-6">
          {activeTab === 'scan_roots' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#1b1b20]">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">Scan Roots</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Directories monitored by Runyard for local projects.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRescan}
                  disabled={isAnyScanning || scanProjects.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[#141418] hover:bg-zinc-800 border border-zinc-800 rounded-[3px] text-xs text-zinc-300 font-mono btn-tactile transition-colors duration-fast disabled:opacity-50"
                >
                  <RefreshCw className={cn('w-3 h-3', (isAnyScanning || scanProjects.isPending) && 'animate-spin text-emerald-400')} />
                  <span>{isAnyScanning ? 'Scanning...' : 'Rescan Now'}</span>
                </button>
              </div>

              <div className="border border-border-card rounded-[4px] bg-[#0c0c0e] divide-y divide-border-card overflow-hidden">
                {scanRoots.length === 0 ? (
                  <div className="p-4 text-xs text-zinc-500 italic text-center">
                    No scan roots configured yet. Add a directory path below.
                  </div>
                ) : (
                  scanRoots.map((root) => {
                    const prog = getRootProgress(root.id);
                    const isScanningThis = prog?.state === 'scanning' || prog?.state === 'queued';

                    return (
                      <div
                        key={root.id}
                        className="flex items-center justify-between px-3.5 py-2 hover:bg-[#141418] transition-colors duration-fast"
                      >
                        <div className="flex flex-col min-w-0 mr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-zinc-300 truncate">
                              {root.path}
                            </span>
                            {prog?.state === 'scanning' && (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded-[2px]">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin text-emerald-400 shrink-0" />
                                <span>
                                  Scanning… {prog.projects_found} {prog.projects_found === 1 ? 'project' : 'projects'}
                                  {prog.services_found > 0 ? ` · ${prog.services_found} svc` : ''}
                                  {prog.elapsed_ms > 0 ? ` (${(prog.elapsed_ms / 1000).toFixed(1)}s)` : ''}
                                </span>
                              </span>
                            )}
                            {prog?.state === 'queued' && (
                              <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800/50 px-1.5 py-0.5 rounded-[2px]">
                                Queued…
                              </span>
                            )}
                            {prog?.state === 'completed' && (
                              <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800/30 px-1.5 py-0.5 rounded-[2px]">
                                ✓ {prog.projects_found} {prog.projects_found === 1 ? 'project' : 'projects'}
                                {prog.services_found > 0 ? ` · ${prog.services_found} svc` : ''}
                                {prog.elapsed_ms > 0 ? ` · ${(prog.elapsed_ms / 1000).toFixed(1)}s` : ''}
                              </span>
                            )}
                            {prog?.state === 'failed' && (
                              <span
                                className="text-[10px] text-red-400 font-mono bg-red-950/40 border border-red-800/40 px-1.5 py-0.5 rounded-[2px]"
                                title={prog.error || undefined}
                              >
                                ⚠ Scan failed
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => rescanRoot(root.id)}
                            disabled={isScanningThis}
                            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-[2px] btn-tactile transition-colors duration-fast disabled:opacity-40"
                            title={isScanningThis ? 'Scanning in progress' : 'Rescan this root'}
                          >
                            <RefreshCw className={cn('w-3.5 h-3.5', isScanningThis && 'animate-spin text-emerald-400')} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRoot(root.id)}
                            className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-950/40 rounded-[2px] btn-tactile transition-colors duration-fast"
                            title="Remove scan root"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={handleAddRoot} className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newRootPath}
                  onChange={(e) => setNewRootPath(e.target.value)}
                  placeholder="e.g. /home/user/projects"
                  className="flex-1 bg-[#0c0c0e] border border-border-card rounded-[3px] px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-border-accent focus:ring-1 focus:ring-emerald-500/20 transition-all duration-fast font-mono"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const selected = await pickDirectory({ title: 'Select Scan Root Directory' });
                      if (selected) {
                        setNewRootPath(selected);
                      }
                    } catch {
                      // Error feedback is already surfaced via toast by pickDirectory
                    }
                  }}
                  className="px-3 py-1.5 bg-[#141418] hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 rounded-[3px] btn-tactile transition-colors duration-fast"
                >
                  Browse...
                </button>
                <button
                  type="submit"
                  disabled={!newRootPath.trim() || addScanRoot.isPending}
                  className="px-3.5 py-1.5 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 text-xs font-medium rounded-[3px] btn-tactile transition-colors duration-fast flex items-center gap-1 shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Root</span>
                </button>
              </form>
            </div>
          )}

          {activeTab === 'ides' && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-[#1b1b20]">
                <h2 className="text-sm font-semibold text-zinc-200">Installed Editors & IDEs</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Select your preferred default editor for opening projects.
                </p>
              </div>

              <div className="border border-border-card rounded-[4px] bg-[#0c0c0e] divide-y divide-border-card overflow-hidden">
                {ides.length === 0 ? (
                  <div className="p-4 text-xs text-zinc-500 italic text-center">
                    No IDEs auto-detected on your system PATH or Flatpak.
                  </div>
                ) : (
                  ides.map((ide) => {
                    const isDefault = settings?.default_ide === ide.id;
                    return (
                      <div
                        key={ide.id}
                        className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#141418] transition-colors duration-fast"
                      >
                        <div className="flex items-center gap-2.5">
                          <Code2 className="w-4 h-4 text-emerald-400" />
                          <div>
                            <div className="text-xs font-medium text-zinc-200 flex items-center gap-2">
                              <span>{ide.name}</span>
                              {isDefault && (
                                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1 rounded-[2px]">
                                  Default
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500">{ide.command}</div>
                          </div>
                        </div>

                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultIde(ide.id)}
                            className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 rounded-[3px] btn-tactile transition-colors duration-fast"
                          >
                            Set Default
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-[#1b1b20]">
                <h2 className="text-sm font-semibold text-zinc-200">Keyboard Shortcuts</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Default keyboard shortcuts for high-velocity workspace navigation.
                </p>
              </div>

              <div className="border border-border-card rounded-[4px] bg-[#0c0c0e] divide-y divide-border-card text-xs font-mono">
                <div className="flex items-center justify-between px-3.5 py-2">
                  <span className="text-zinc-300">Command Palette</span>
                  <kbd className="px-2 py-0.5 bg-[#141418] border border-border-card rounded-[3px] text-zinc-300 text-[11px]">
                    Ctrl+K / Cmd+K
                  </kbd>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2">
                  <span className="text-zinc-300">Toggle Bottom Panel</span>
                  <kbd className="px-2 py-0.5 bg-[#141418] border border-border-card rounded-[3px] text-zinc-300 text-[11px]">
                    Ctrl+` / Cmd+`
                  </kbd>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2">
                  <span className="text-zinc-300">Toggle Explorer Sidebar</span>
                  <kbd className="px-2 py-0.5 bg-[#141418] border border-border-card rounded-[3px] text-zinc-300 text-[11px]">
                    Ctrl+B / Cmd+B
                  </kbd>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-[#1b1b20]">
                <h2 className="text-sm font-semibold text-zinc-200">About Runyard</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Native developer workspace orchestrator.
                </p>
              </div>

              <div className="border border-border-card rounded-[4px] bg-[#0c0c0e] p-4 text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 font-mono">Version:</span>
                  <span className="font-semibold text-zinc-200 font-mono">v{appVersion}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 font-mono">Stack:</span>
                  <span className="text-zinc-300 font-mono">
                    Tauri 2 • WebKitGTK / GDK • React 19 • TailwindCSS
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 font-mono">License:</span>
                  <span className="text-zinc-300 font-mono">MIT</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
