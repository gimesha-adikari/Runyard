import { Component, createElement as h, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCw, RefreshCcw, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Runyard ErrorBoundary caught exception]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = `Error: ${error?.message || 'Unknown error'}\n\nStack:\n${error?.stack || ''}\n\nComponent Stack:\n${errorInfo?.componentStack || ''}`;
    navigator.clipboard?.writeText?.(text);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const { error, errorInfo, copied } = this.state;
      const title = this.props.fallbackTitle || 'Component Error';

      return h(
        'div',
        {
          className:
            'flex flex-col items-center justify-center h-full w-full p-6 bg-[#0a0a0c] text-zinc-300 font-sans select-none min-h-[240px]',
        },
        h(
          'div',
          {
            className:
              'max-w-md w-full bg-[#111115] border border-red-500/30 rounded-lg p-5 shadow-2xl flex flex-col gap-4',
          },
          h(
            'div',
            { className: 'flex items-start gap-3' },
            h(
              'div',
              {
                className:
                  'p-2 rounded-md bg-red-950/40 border border-red-800/40 text-red-400 shrink-0 mt-0.5',
              },
              h(AlertOctagon, { className: 'w-5 h-5' })
            ),
            h(
              'div',
              { className: 'min-w-0 flex-1' },
              h('h3', { className: 'text-sm font-semibold text-zinc-100' }, title),
              h(
                'p',
                { className: 'text-xs text-zinc-400 mt-1 leading-relaxed' },
                'An unexpected error occurred while rendering this interface.'
              )
            )
          ),
          error &&
            h(
              'div',
              {
                className:
                  'bg-[#08080a] border border-zinc-800/80 rounded p-2.5 max-h-36 overflow-y-auto',
              },
              h(
                'div',
                { className: 'font-mono text-[11px] text-red-400 font-medium break-words' },
                error.message
              ),
              errorInfo?.componentStack &&
                h(
                  'pre',
                  {
                    className:
                      'font-mono text-[10px] text-zinc-500 mt-2 whitespace-pre-wrap leading-tight',
                  },
                  errorInfo.componentStack.trim().split('\n').slice(0, 4).join('\n')
                )
            ),
          h(
            'div',
            {
              className:
                'flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/60',
            },
            h(
              'button',
              {
                type: 'button',
                onClick: this.handleCopyError,
                className:
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded transition-colors',
                title: 'Copy error details to clipboard',
              },
              copied
                ? [
                    h(Check, { key: 'chk', className: 'w-3.5 h-3.5 text-emerald-400' }),
                    h('span', { key: 'lbl', className: 'text-emerald-400' }, 'Copied'),
                  ]
                : [
                    h(Copy, { key: 'cp', className: 'w-3.5 h-3.5' }),
                    h('span', { key: 'lbl' }, 'Copy Error'),
                  ]
            ),
            h(
              'div',
              { className: 'flex items-center gap-2' },
              h(
                'button',
                {
                  type: 'button',
                  onClick: this.handleReset,
                  className:
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1a1a22] hover:bg-[#22222c] text-zinc-200 border border-zinc-700/60 rounded transition-colors',
                },
                h(RotateCw, { className: 'w-3.5 h-3.5 text-zinc-400' }),
                h('span', null, 'Try Again')
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: this.handleReload,
                  className:
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded transition-colors',
                },
                h(RefreshCcw, { className: 'w-3.5 h-3.5' }),
                h('span', null, 'Reload App')
              )
            )
          )
        )
      );
    }

    return this.props.children;
  }
}
