import { useEffect, useRef } from 'react';
import { useProcessOutput } from '../hooks/use-processes';

interface Props {
  processId: string;
}

export function LogViewer({ processId }: Props) {
  const { data: output = [] } = useProcessOutput(processId, 0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div 
      ref={containerRef}
      className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs overflow-y-auto h-64 whitespace-pre-wrap break-words"
    >
      {output.length === 0 ? (
        <div className="text-zinc-600 italic">No output yet...</div>
      ) : (
        output.map((line, idx) => (
          <div key={idx} className="flex hover:bg-zinc-900/50">
            <span className="text-zinc-600 mr-4 select-none flex-shrink-0 w-24">
              {new Date(line.timestamp).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 })}
            </span>
            <span className={line.stream === 'stderr' ? 'text-red-400' : 'text-zinc-300'}>
              {line.content}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
