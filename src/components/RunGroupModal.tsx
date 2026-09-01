import React, { useState, useEffect } from 'react';
import { RunConfiguration, RunGroup } from '../types';
import { Layers, X } from 'lucide-react';

interface RunGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (group: RunGroup) => void;
  projectId: string;
  runConfigs: RunConfiguration[];
  existingGroup?: RunGroup | null;
}

export const RunGroupModal: React.FC<RunGroupModalProps> = ({
  isOpen,
  onClose,
  onSave,
  projectId,
  runConfigs,
  existingGroup,
}) => {
  const [name, setName] = useState('');
  const [selectedConfigIds, setSelectedConfigIds] = useState<string[]>([]);

  useEffect(() => {
    if (existingGroup) {
      setName(existingGroup.name);
      setSelectedConfigIds(existingGroup.member_config_ids);
    } else {
      setName('');
      setSelectedConfigIds([]);
    }
  }, [existingGroup, isOpen]);

  const toggleConfig = (id: string) => {
    if (selectedConfigIds.includes(id)) {
      setSelectedConfigIds(selectedConfigIds.filter((c) => c !== id));
    } else {
      setSelectedConfigIds([...selectedConfigIds, id]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedConfigIds.length === 0) return;

    const group: RunGroup = {
      id: existingGroup ? existingGroup.id : crypto.randomUUID(),
      project_id: projectId,
      name: name.trim(),
      member_config_ids: selectedConfigIds,
      created_at: existingGroup ? existingGroup.created_at : new Date().toISOString(),
    };

    onSave(group);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {existingGroup ? 'Edit Run Group' : 'New Multi-Service Run Group'}
              </h2>
              <p className="text-xs text-zinc-400">Group multiple services to start and stop together</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Group Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Full Local Stack, Backend & Worker"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Select Services / Configurations ({selectedConfigIds.length} selected)
            </label>
            {runConfigs.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-3 bg-zinc-950 rounded border border-zinc-800">
                No run configurations available in this project yet.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {runConfigs.map((cfg) => {
                  const isChecked = selectedConfigIds.includes(cfg.id);
                  return (
                    <label
                      key={cfg.id}
                      className={`flex items-center justify-between p-2.5 rounded border transition-colors cursor-pointer text-xs ${
                        isChecked
                          ? 'bg-blue-950/40 border-blue-800/80 text-blue-200'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleConfig(cfg.id)}
                          className="rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="font-medium">{cfg.name}</span>
                      </div>
                      <span className="font-mono text-zinc-500 text-[11px]">
                        {cfg.command} {cfg.args.join(' ')}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
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
              disabled={!name.trim() || selectedConfigIds.length === 0}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium text-white rounded-md transition-colors"
            >
              Save Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
