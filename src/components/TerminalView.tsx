import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { tauriApi } from '../lib/tauri';
import { Terminal as TermIcon, RefreshCw, Eraser, AlertCircle } from 'lucide-react';

interface TerminalViewProps {
  projectPath: string;
  className?: string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ projectPath, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const cleanupSession = async () => {
    if (sessionIdRef.current) {
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      try {
        await tauriApi.closePtySession(sid);
      } catch {
        // Ignore session already closed error
      }
    }
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }
    fitAddonRef.current = null;
  };

  const initTerminal = async () => {
    if (!containerRef.current) return;
    setIsInitializing(true);
    setError(null);

    await cleanupSession();

    try {
      const term = new Terminal({
        theme: {
          background: '#09090b',
          foreground: '#f4f4f5',
          cursor: '#10b981',
          cursorAccent: '#09090b',
          selectionBackground: '#3f3f46',
          selectionForeground: '#ffffff',
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
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.25,
        cursorBlink: true,
        convertEol: true,
        allowTransparency: false,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      containerRef.current.innerHTML = '';
      term.open(containerRef.current);

      terminalRef.current = term;
      fitAddonRef.current = fitAddon;

      // Fit after DOM render
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
        } catch {}
      });

      const cols = Math.max(20, term.cols || 80);
      const rows = Math.max(5, term.rows || 24);

      const sessionId = await tauriApi.createPtySession(projectPath, cols, rows);
      sessionIdRef.current = sessionId;

      const unlistenData: UnlistenFn = await listen<string>(`pty-data-${sessionId}`, (event) => {
        term.write(event.payload);
      });

      const unlistenExit: UnlistenFn = await listen(`pty-exit-${sessionId}`, () => {
        term.write('\r\n\x1b[33m[Session completed]\x1b[0m\r\n');
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
      term.focus();

      return () => {
        unlistenData();
        unlistenExit();
      };
    } catch (e: any) {
      setError(e?.message || String(e));
      setIsInitializing(false);
    }
  };

  const handleClear = () => {
    if (terminalRef.current) {
      terminalRef.current.clear();
      terminalRef.current.focus();
    }
  };

  useEffect(() => {
    let unlisteners: (() => void) | undefined;
    let isMounted = true;

    initTerminal().then((cleanup) => {
      if (isMounted) {
        unlisteners = cleanup;
      } else if (cleanup) {
        cleanup();
      }
    });

    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && containerRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {}
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (unlisteners) unlisteners();
      cleanupSession();
    };
  }, [projectPath]);

  return (
    <div className={`flex flex-col h-[520px] bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden ${className || ''}`}>
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <TermIcon className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-mono text-zinc-300 truncate text-[11px]">{projectPath}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors"
            title="Clear Screen"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
          <button
            onClick={initTerminal}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors"
            title="Restart Terminal Session"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Restart</span>
          </button>
        </div>
      </div>

      {/* Terminal View Body */}
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
          <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">Failed to initialize terminal session</p>
          <p className="text-xs font-mono text-zinc-500 max-w-md mb-4 break-words">{error}</p>
          <button
            onClick={initTerminal}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Shell Connection</span>
          </button>
        </div>
      ) : (
        <div className="flex-1 relative p-2 overflow-hidden">
          {isInitializing && (
            <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center z-10 text-xs text-zinc-400">
              Initializing interactive shell...
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
};
