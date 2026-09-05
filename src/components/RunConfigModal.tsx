import React, { useState, useEffect } from 'react';
import { RunConfiguration, Service } from '../types';
import { Plus, Trash2, X, Play, ShieldAlert } from 'lucide-react';
import { CustomSelect } from './common/CustomSelect';

interface RunConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: RunConfiguration) => void;
  projectId: string;
  projectPath: string;
  services: Service[];
  existingConfig?: RunConfiguration | null;
}

export const RunConfigModal: React.FC<RunConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  projectId,
  projectPath,
  services,
  existingConfig,
}) => {
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState<string>('');
  const [command, setCommand] = useState('');
  const [argsList, setArgsList] = useState<string[]>([]);
  const [newArg, setNewArg] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (existingConfig) {
      setName(existingConfig.name);
      setServiceId(existingConfig.service_id || '');
      setCommand(existingConfig.command);
      setArgsList([...existingConfig.args]);
      setWorkingDir(existingConfig.working_dir || '');
      setEnvVars(
        Object.entries(existingConfig.env_vars || {}).map(([key, value]) => ({ key, value }))
      );
      setIsDefault(existingConfig.is_default);
    } else {
      setName('');
      setServiceId('');
      setCommand('');
      setArgsList([]);
      setNewArg('');
      setWorkingDir(projectPath);
      setEnvVars([]);
      setIsDefault(false);
    }
  }, [existingConfig, projectPath, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAddArg = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newArg.trim()) return;
    setArgsList([...argsList, newArg.trim()]);
    setNewArg('');
  };

  const handleRemoveArg = (index: number) => {
    setArgsList(argsList.filter((_, i) => i !== index));
  };

  const handleUpdateArg = (index: number, val: string) => {
    const updated = [...argsList];
    updated[index] = val;
    setArgsList(updated);
  };

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleRemoveEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleEnvVarChange = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...envVars];
    if (updated[index]) {
      updated[index][field] = val;
      setEnvVars(updated);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    const finalArgs = [...argsList];
    if (newArg.trim()) {
      finalArgs.push(newArg.trim());
    }

    const envMap: Record<string, string> = {};
    for (const item of envVars) {
      if (item.key.trim()) {
        envMap[item.key.trim()] = item.value;
      }
    }

    const config: RunConfiguration = {
      id: existingConfig ? existingConfig.id : crypto.randomUUID(),
      project_id: projectId,
      service_id: serviceId || null,
      name: name.trim(),
      command: command.trim(),
      args: finalArgs,
      working_dir: workingDir.trim() || null,
      env_file: null,
      env_vars: envMap,
      is_trusted: existingConfig?.is_trusted || false,
      trusted_fingerprint: existingConfig?.trusted_fingerprint || null,
      is_default: isDefault,
      source: existingConfig?.source || 'UserCreated',
      created_at: existingConfig ? existingConfig.created_at : new Date().toISOString(),
    };

    onSave(config);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-fast"
      onClick={onClose}
    >
      <div
        className="bg-[#111114] border border-border-card rounded-[6px] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh] menu-entrance"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-card bg-[#0c0c0e]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-[4px] text-emerald-400">
              <Play className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {existingConfig ? 'Edit Run Configuration' : 'New Run Configuration'}
              </h2>
              <p className="text-xs text-zinc-400">Configure command, arguments, cwd, and environment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 btn-tactile transition-colors duration-fast p-1 rounded-[2px]"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Configuration Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. dev-server, worker, test:watch"
              className="w-full bg-[#0c0c0e] border border-border-card rounded-[3px] px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-border-accent focus:ring-1 focus:ring-emerald-500/20 transition-all duration-fast"
            />
          </div>

          {services.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Target Service (Optional)
              </label>
              <CustomSelect
                value={serviceId}
                onChange={(val) => {
                  setServiceId(val);
                  const selected = services.find((s) => s.id === val);
                  if (selected) {
                    setWorkingDir(`${projectPath}/${selected.path}`);
                  } else {
                    setWorkingDir(projectPath);
                  }
                }}
                options={[
                  { value: '', label: `Root Project (${projectPath})` },
                  ...services.map((svc) => ({
                    value: svc.id,
                    label: svc.name,
                    secondaryLabel: svc.path,
                  })),
                ]}
                className="w-full"
                buttonClassName="w-full h-8 px-3 text-xs bg-zinc-950 border-zinc-800"
                size="md"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Executable / Command</label>
            <input
              type="text"
              required
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. npm, cargo, python3, pnpm"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Command Arguments ({argsList.length})
            </label>
            <div className="space-y-1.5 mb-2">
              {argsList.map((arg, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <span className="text-[10px] text-zinc-600 font-mono w-4">{idx + 1}.</span>
                  <input
                    type="text"
                    value={arg}
                    onChange={(e) => handleUpdateArg(idx, e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveArg(idx)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove argument"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newArg}
                onChange={(e) => setNewArg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddArg();
                  }
                }}
                placeholder="Add an argument item (e.g. run, --port, 3000)..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleAddArg()}
                disabled={!newArg.trim()}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-300 rounded-md flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            <div className="mt-2 p-2 bg-zinc-950 border border-zinc-800/80 rounded text-[11px] font-mono text-zinc-400">
              <span className="text-zinc-600 mr-1">$</span>
              <span className="text-emerald-400">{command || '<executable>'}</span>{' '}
              <span>{argsList.join(' ') || (newArg ? newArg : '')}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Working Directory</label>
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder={projectPath}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">Environment Variables</label>
              <button
                type="button"
                onClick={handleAddEnvVar}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Variable</span>
              </button>
            </div>

            {envVars.length === 0 ? (
              <p className="text-[11px] text-zinc-600 italic">No custom environment variables defined</p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {envVars.map((ev, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={ev.key}
                      onChange={(e) => handleEnvVarChange(idx, 'key', e.target.value)}
                      placeholder="KEY (e.g. PORT)"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-zinc-600 text-xs">=</span>
                    <input
                      type="text"
                      value={ev.value}
                      onChange={(e) => handleEnvVarChange(idx, 'value', e.target.value)}
                      placeholder="VALUE (e.g. 3000)"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveEnvVar(idx)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0 focus:ring-offset-0"
              />
              <span>Set as default run configuration for this project</span>
            </label>

            {existingConfig && existingConfig.is_trusted && (
              <div className="flex items-start gap-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-200/90 text-[11px] mt-1">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <p>
                  This configuration is currently trusted. Modifying its execution parameters 
                  (command, arguments, working directory, or environment variables) will require 
                  re-approving trust on the next run.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border-card">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#18181f] rounded-[3px] btn-tactile transition-colors duration-fast"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !command.trim()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white rounded-[3px] btn-tactile transition-colors duration-fast"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
