import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { tauriApi } from '../lib/tauri';
import { Terminal as TermIcon, RefreshCw } from 'lucide-react';

interface TerminalViewProps {
  projectPath: string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ projectPath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const initTerminal = async () => {
    if (!containerRef.current) return;
    setIsInitializing(true);
    setError(null);

    // Clean up previous
    if (sessionIdRef.current) {
      tauriApi.closePtySession(sessionIdRef.current).catch(() => {});
      sessionIdRef.current = null;
    }
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }

    try {
      const term = new Terminal({
        theme: {
          background: '#09090b', // zinc-950
          foreground: '#f4f4f5', // zinc-100
          cursor: '#10b981', // emerald-500
          selectionBackground: '#27272a',
          black: '#18181b',
          red: '#ef4444',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#d946ef',
          cyan: '#06b6d4',
          white: '#f4f4f5',
          brightBlack: '#71717a',
          brightRed: '#f87171',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#e879f9',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff',
        },
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: true,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      containerRef.current.innerHTML = '';
      term.open(containerRef.current);
      fitAddon.fit();

      terminalRef.current = term;
      fitAddonRef.current = fitAddon;

      const cols = term.cols || 80;
      const rows = term.rows || 24;

      const sessionId = await tauriApi.createPtySession(projectPath, cols, rows);
      sessionIdRef.current = sessionId;

      const unlistenData: UnlistenFn = await listen<string>(`pty-data-${sessionId}`, (event) => {
        term.write(event.payload);
      });

      const unlistenExit: UnlistenFn = await listen(`pty-exit-${sessionId}`, () => {
        term.write('\r\n\x1b[33m[Process completed]\x1b[0m\r\n');
      });

      term.onData((data) => {
        if (sessionIdRef.current) {
          tauriApi.writePtySession(sessionIdRef.current, data).catch(() => {});
        }
      });

      term.onResize((size) => {
        if (sessionIdRef.current) {
          tauriApi.resizePtySession(sessionIdRef.current, size.cols, size.rows).catch(() => {});
        }
      });

      setIsInitializing(false);

      return () => {
        unlistenData();
        unlistenExit();
      };
    } catch (e: any) {
      setError(e?.message || String(e));
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    let cleanupListeners: (() => void) | undefined;
    initTerminal().then((cleanup) => {
      cleanupListeners = cleanup;
    });

    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (cleanupListeners) cleanupListeners();
      if (sessionIdRef.current) {
        tauriApi.closePtySession(sessionIdRef.current).catch(() => {});
        sessionIdRef.current = null;
      }
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, [projectPath]);

  return (
    <div className="flex flex-col h-[500px] bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <TermIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono">{projectPath}</span>
        </div>
        <button
          onClick={initTerminal}
          className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
          title="Restart Terminal Session"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Restart</span>
        </button>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
          <p className="text-red-400 font-medium mb-2">Failed to start terminal session</p>
          <p className="text-xs font-mono text-zinc-500 max-w-md mb-4">{error}</p>
          <button
            onClick={initTerminal}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex-1 relative p-2 overflow-hidden">
          {isInitializing && (
            <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center z-10 text-xs text-zinc-400">
              Initializing shell...
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
};
