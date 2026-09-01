import React, { useEffect, useRef, useState } from 'react';
import { useProcessOutput, useClearProcessOutput } from '../hooks/use-processes';
import { Search, ArrowDown, Trash2 } from 'lucide-react';

interface LogViewerProps {
  processId: string;
}

export const LogViewer: React.FC<LogViewerProps> = ({ processId }) => {
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: logs, isLoading } = useProcessOutput(processId, 0);
  const clearMutation = useClearProcessOutput();

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    setAutoScroll(isAtBottom);
  };

  const filteredLogs = logs?.filter((l) =>
    filter ? l.content.toLowerCase().includes(filter.toLowerCase()) : true
  );

  return (
    <div className="flex flex-col h-80 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs">
      {/* Controls toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-zinc-400">
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
              autoScroll
                ? 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-400'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Auto-scroll to latest output"
          >
            <ArrowDown className="w-3 h-3" />
            <span>Auto-scroll</span>
          </button>

          <button
            onClick={() => clearMutation.mutate(processId)}
            className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
            title="Clear output buffer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Log lines */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-0.5"
      >
        {isLoading && !logs ? (
          <div className="text-zinc-600 italic">Connecting to process output...</div>
        ) : !filteredLogs || filteredLogs.length === 0 ? (
          <div className="text-zinc-600 italic">No output received yet.</div>
        ) : (
          filteredLogs.map((line, idx) => (
            <div key={idx} className="flex items-start gap-2 leading-relaxed hover:bg-zinc-900/40 px-1 rounded">
              <span className="text-[10px] text-zinc-600 select-none shrink-0 font-sans pt-0.5">
                {line.timestamp ? line.timestamp.substring(11, 19) : ''}
              </span>
              <span
                className={`whitespace-pre-wrap break-all ${
                  line.stream === 'stderr' ? 'text-red-400' : 'text-zinc-300'
                }`}
              >
                {line.content}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
