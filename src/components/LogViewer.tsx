import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useProcessOutput, useClearProcessOutput } from '../hooks/use-processes';
import { toast } from '../stores/toast-store';
import {
  Search,
  ArrowDown,
  Trash2,
  Copy,
  WrapText,
  Check,
} from 'lucide-react';
import { getErrorMessage, cn } from '../lib/utils';
import { open as openUrl } from '@tauri-apps/plugin-shell';

const URL_REGEX = /(https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|[a-zA-Z0-9.-]+)(?::\d+)?(?:\/[^\s"']*)?)/g;

function renderLogContent(text: unknown) {
  const content = typeof text === 'string' ? text : String(text ?? '');
  const parts = content.split(URL_REGEX);
  if (parts.length === 1) return content;

  return parts.map((part, index) => {
    if (part.match(URL_REGEX)) {
      return (
        <a
          key={index}
          href={part}
          onClick={(e) => {
            e.preventDefault();
            openUrl(part).catch((err) => console.error('Failed to open URL:', err));
          }}
          className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer font-semibold transition-colors"
          title={`Click to open ${part} in browser`}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

interface LogViewerProps {
  processId: string;
  className?: string;
}

export const LogViewer: React.FC<LogViewerProps> = ({ processId, className }) => {
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);

  const { data: logs = [], isLoading } = useProcessOutput(processId, 0);
  const clearMutation = useClearProcessOutput();

  useEffect(() => {
    if (autoScroll && containerRef.current && !isUserScrollingRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
    
    if (isAtBottom !== autoScroll) {
      setAutoScroll(isAtBottom);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!filter.trim()) return logs;
    const q = filter.toLowerCase();
    return logs.filter((l) => l.content.toLowerCase().includes(q));
  }, [logs, filter]);

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.stream}] ${l.content}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Logs copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error('Failed to copy logs');
    });
  };

  const handleClearLogs = async () => {
    try {
      await clearMutation.mutateAsync(processId);
      toast.info('Process output buffer cleared');
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Failed to clear logs');
    }
  };

  return (
    <div className={cn("flex flex-col h-80 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs select-text", className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-zinc-400 gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter log output..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded pl-8 pr-16 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            {filter && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-sans">
                {filteredLogs.length} found
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={cn(
              'px-2 py-1 rounded text-[11px] flex items-center gap-1 transition-colors font-sans',
              wordWrap
                ? 'bg-zinc-800 text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
            )}
            title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
          >
            <WrapText className="w-3.5 h-3.5" />
            <span>Wrap</span>
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'px-2 py-1 rounded text-[11px] flex items-center gap-1 transition-colors font-sans',
              autoScroll
                ? 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-400'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            )}
            title="Auto-scroll to latest logs"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Auto-scroll</span>
          </button>

          <button
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="p-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 rounded transition-colors"
            title="Copy all logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleClearLogs}
            disabled={logs.length === 0}
            className="p-1 bg-zinc-800 hover:bg-red-900/60 disabled:opacity-40 text-zinc-400 hover:text-red-300 rounded transition-colors"
            title="Clear output buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-0.5 leading-relaxed"
      >
        {isLoading && logs.length === 0 ? (
          <div className="text-zinc-600 italic">Connecting to process stream...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-zinc-600 italic">
            {filter ? `No log lines matching "${filter}"` : 'No output received yet.'}
          </div>
        ) : (
          filteredLogs.map((line, idx) => {
            const isStderr = line.stream === 'stderr';
            return (
              <div
                key={idx}
                className={cn(
                  'flex items-start gap-2.5 px-1 py-0.5 rounded transition-colors hover:bg-zinc-900/60',
                  isStderr && 'bg-red-950/20'
                )}
              >
                <span className="text-[10px] text-zinc-600 select-none shrink-0 font-sans pt-0.5 w-14">
                  {line.timestamp ? line.timestamp.substring(11, 19) : ''}
                </span>

                <span
                  className={cn(
                    'flex-1',
                    wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto',
                    isStderr ? 'text-red-400' : 'text-zinc-300'
                  )}
                >
                  {renderLogContent(line.content)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
