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
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (existingGroup) {
      setName(existingGroup.name);
      setSelectedConfigIds(existingGroup.member_config_ids);
    } else {
      setName('');
      setSelectedConfigIds([]);
    }
    setFilter('');
  }, [existingGroup, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleConfig = (id: string) => {
    if (selectedConfigIds.includes(id)) {
      setSelectedConfigIds(selectedConfigIds.filter((c) => c !== id));
    } else {
      setSelectedConfigIds([...selectedConfigIds, id]);
    }
  };

  const handleSelectAll = () => {
    setSelectedConfigIds(runConfigs.map((c) => c.id));
  };

  const handleDeselectAll = () => {
    setSelectedConfigIds([]);
  };

  const filteredConfigs = runConfigs.filter((cfg) => {
    const q = filter.toLowerCase();
    return (
      cfg.name.toLowerCase().includes(q) ||
      cfg.command.toLowerCase().includes(q) ||
      cfg.args.some((a) => a.toLowerCase().includes(q))
    );
  });

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {existingGroup ? 'Edit Run Group' : 'New Multi-Service Run Group'}
              </h2>
              <p className="text-xs text-zinc-400">Bundle services to launch and stop simultaneously</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Group Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Local Dev Stack, API + Worker, Frontend & Microservices"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-zinc-300">
                Select Member Configurations ({selectedConfigIds.length} selected)
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Select All
                </button>
                <span className="text-zinc-600">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {runConfigs.length > 5 && (
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter configurations..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-600 mb-2 focus:outline-none focus:border-zinc-600"
              />
            )}

            {runConfigs.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-4 bg-zinc-950 rounded border border-zinc-800 text-center">
                No run configurations available in this project yet. Create run configurations first.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {filteredConfigs.map((cfg) => {
                  const isChecked = selectedConfigIds.includes(cfg.id);
                  return (
                    <div
                      key={cfg.id}
                      onClick={() => toggleConfig(cfg.id)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer text-xs select-none ${
                        isChecked
                          ? 'bg-blue-950/40 border-blue-800/80 text-blue-200'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-zinc-100">{cfg.name}</span>
                          <div className="font-mono text-zinc-500 text-[11px] truncate">
                            {cfg.command} {cfg.args.join(' ')}
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded font-mono shrink-0 ml-2">
                        {cfg.source}
                      </span>
                    </div>
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
              Save Run Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
