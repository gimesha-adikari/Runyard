import React, { useState, useEffect } from 'react';
import { RunConfiguration, Service } from '../types';
import { Plus, Trash2, X, Play } from 'lucide-react';

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
  const [argsStr, setArgsStr] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (existingConfig) {
      setName(existingConfig.name);
      setServiceId(existingConfig.service_id || '');
      setCommand(existingConfig.command);
      setArgsStr(existingConfig.args.join(' '));
      setWorkingDir(existingConfig.working_dir || '');
      setEnvVars(
        Object.entries(existingConfig.env_vars || {}).map(([key, value]) => ({ key, value }))
      );
      setIsDefault(existingConfig.is_default);
    } else {
      setName('');
      setServiceId('');
      setCommand('');
      setArgsStr('');
      setWorkingDir(projectPath);
      setEnvVars([]);
      setIsDefault(false);
    }
  }, [existingConfig, projectPath, isOpen]);

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

    const parsedArgs = argsStr
      .trim()
      .split(/\s+/)
      .filter((a) => a.length > 0);

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
      args: parsedArgs,
      working_dir: workingDir.trim() || null,
      env_file: null,
      env_vars: envMap,
      is_trusted: existingConfig ? existingConfig.is_trusted : true,
      is_default: isDefault,
      source: existingConfig ? existingConfig.source : 'UserCreated',
      created_at: existingConfig ? existingConfig.created_at : new Date().toISOString(),
    };

    onSave(config);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Play className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {existingConfig ? 'Edit Run Configuration' : 'New Run Configuration'}
              </h2>
              <p className="text-xs text-zinc-400">Configure command, service, arguments and environment</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Configuration Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. dev-server, worker-task"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {services.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Target Service (Optional)</label>
              <select
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  const selected = services.find((s) => s.id === e.target.value);
                  if (selected) {
                    setWorkingDir(`${projectPath}/${selected.path}`);
                  }
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Root Project</option>
                {services.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name} ({svc.path})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-zinc-300 mb-1">Executable</label>
              <input
                type="text"
                required
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. npm, cargo"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-300 mb-1">Arguments</label>
              <input
                type="text"
                value={argsStr}
                onChange={(e) => setArgsStr(e.target.value)}
                placeholder="e.g. run dev -- --port 3000"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Working Directory</label>
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder={projectPath}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Environment Variables */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">Environment Overrides</label>
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
                      placeholder="KEY"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-zinc-600 text-xs">=</span>
                    <input
                      type="text"
                      value={ev.value}
                      onChange={(e) => handleEnvVarChange(idx, 'value', e.target.value)}
                      placeholder="VALUE"
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

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0 focus:ring-offset-0"
              />
              <span>Set as default run configuration for this project</span>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white rounded-md transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
