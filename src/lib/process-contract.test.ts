import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Polyfills for Node.js test runner
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

import { useUiStore } from '../stores/ui-store.ts';
import { useToastStore, toast } from '../stores/toast-store.ts';
import { ErrorBoundary } from '../components/ErrorBoundary.ts';
import type { ProcessInfo } from '../types/index.ts';

test('ProcessInfo object contract matches Rust IPC schema', () => {
  const mockProcess: ProcessInfo = {
    id: 'proc-uuid-1234',
    project_id: 'proj-5678',
    service_id: null,
    run_config_id: 'cfg-9012',
    run_config_name: 'npm run dev',
    pid: 98765,
    status: 'Running',
    started_at: '2026-09-03T04:00:00Z',
    exit_code: null,
  };

  assert.equal(mockProcess.id, 'proc-uuid-1234');
  assert.equal(mockProcess.run_config_name, 'npm run dev');
  assert.equal(mockProcess.pid, 98765);
  assert.equal(mockProcess.status, 'Running');
  assert.equal(mockProcess.exit_code, null);
});

test('ui-store setSelectedProcessIdForLogs defends against raw object input', () => {
  const mockProcess: ProcessInfo = {
    id: 'proc-safe-id-42',
    project_id: 'proj-1',
    service_id: null,
    run_config_id: 'cfg-1',
    run_config_name: 'dev',
    pid: 1234,
    status: 'Running',
    started_at: new Date().toISOString(),
    exit_code: null,
  };

  // Passing string ID
  useUiStore.getState().setSelectedProcessIdForLogs('explicit-string-id');
  assert.equal(useUiStore.getState().selectedProcessIdForLogs, 'explicit-string-id');

  // Passing object accidentally: store must extract .id and never store raw object
  useUiStore.getState().setSelectedProcessIdForLogs(mockProcess as any);
  assert.equal(useUiStore.getState().selectedProcessIdForLogs, 'proc-safe-id-42');
  assert.equal(typeof useUiStore.getState().selectedProcessIdForLogs, 'string');

  // Reset to null
  useUiStore.getState().setSelectedProcessIdForLogs(null);
  assert.equal(useUiStore.getState().selectedProcessIdForLogs, null);
});

test('toast-store defends against raw ProcessInfo object in message', () => {
  const mockProcess: ProcessInfo = {
    id: 'proc-toast-id',
    project_id: 'proj-1',
    service_id: null,
    run_config_id: 'cfg-1',
    run_config_name: 'api-server',
    pid: 4567,
    status: 'Running',
    started_at: new Date().toISOString(),
    exit_code: null,
  };

  // Normal string toast
  useToastStore.getState().clearToasts();
  toast.success('Process started');
  let toasts = useToastStore.getState().toasts;
  assert.equal(toasts.length, 1);
  assert.equal(typeof toasts[0]!.message, 'string');
  assert.equal(toasts[0]!.message, 'Process started');

  // Accidental object passed to toast
  toast.success(mockProcess as any);
  toasts = useToastStore.getState().toasts;
  assert.equal(toasts.length, 2);
  assert.equal(typeof toasts[1]!.message, 'string');
  assert.ok(toasts[1]!.message.includes('api-server') || toasts[1]!.message.includes('proc-toast-id'));
});

test('ErrorBoundary getDerivedStateFromError and fallback UI rendering', () => {
  const err = new Error(
    'Objects are not valid as a React child (found: object with keys { id, project_id, service_id, run_config_id, run_config_name, pid, status, started_at, exit_code })'
  );

  // 1. Verify getDerivedStateFromError lifecycle
  const stateUpdate = ErrorBoundary.getDerivedStateFromError(err);
  assert.equal(stateUpdate.hasError, true);
  assert.equal(stateUpdate.error, err);

  // 2. Verify fallback UI renders error details, title, and buttons
  const boundary = new ErrorBoundary({
    fallbackTitle: 'Workspace Test Error',
    children: React.createElement('div', null, 'Normal Content'),
  });
  boundary.state = {
    hasError: true,
    error: err,
    errorInfo: { componentStack: '\n    at ProjectWorkspace\n    at DesktopLayout' },
    copied: false,
  };

  const rendered = boundary.render();
  const html = renderToString(rendered as React.ReactElement);

  assert.ok(html.includes('Workspace Test Error'));
  assert.ok(html.includes('Objects are not valid as a React child'));
  assert.ok(html.includes('Try Again'));
  assert.ok(html.includes('Reload App'));
  assert.ok(html.includes('Copy Error'));
});
