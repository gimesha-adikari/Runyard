import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDirectory } from './picker.ts';
import { useToastStore } from '../stores/toast-store.ts';

// Provide window polyfill for Node.js test environment
(globalThis as any).window = globalThis;

test('pickDirectory returns null and informs user when not running inside Tauri', async () => {
  // Ensure non-Tauri environment
  const origTauri = (globalThis as any).__TAURI_INTERNALS__;
  delete (globalThis as any).__TAURI_INTERNALS__;

  useToastStore.getState().clearToasts();

  const result = await pickDirectory({ title: 'Test Picker' });

  assert.equal(result, null);
  const toasts = useToastStore.getState().toasts;
  assert.ok(toasts.length > 0);
  const lastToast = toasts[toasts.length - 1];
  assert.ok(lastToast?.message.includes('Runyard desktop app'));

  if (origTauri) {
    (globalThis as any).__TAURI_INTERNALS__ = origTauri;
  }
});

test('pickDirectory returns selected path when user selects a directory', async () => {
  const mockPath = '/home/gimesha/My_Projects';
  (globalThis as any).isTauri = true;
  (globalThis as any).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === 'plugin:dialog|open') return mockPath;
      return null;
    },
  };

  useToastStore.getState().clearToasts();

  const result = await pickDirectory({ title: 'Select Projects' });
  assert.equal(result, mockPath);
  assert.equal(useToastStore.getState().toasts.length, 0);

  delete (globalThis as any).isTauri;
  delete (globalThis as any).__TAURI_INTERNALS__;
});

test('pickDirectory returns null and shows no error toast when user cancels', async () => {
  (globalThis as any).isTauri = true;
  (globalThis as any).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === 'plugin:dialog|open') return null;
      return null;
    },
  };

  useToastStore.getState().clearToasts();

  const result = await pickDirectory({ title: 'Select Projects' });
  assert.equal(result, null);
  // Must NOT show error toast on normal cancellation
  const errorToasts = useToastStore.getState().toasts.filter((t) => t.type === 'error');
  assert.equal(errorToasts.length, 0);

  delete (globalThis as any).isTauri;
  delete (globalThis as any).__TAURI_INTERNALS__;
});

test('pickDirectory throws and displays error toast on plugin failure', async () => {
  (globalThis as any).isTauri = true;
  (globalThis as any).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string) => {
      if (cmd === 'plugin:dialog|open') {
        throw new Error('Permission denied: dialog:allow-open not granted');
      }
      return null;
    },
  };

  useToastStore.getState().clearToasts();

  await assert.rejects(
    async () => {
      await pickDirectory({ title: 'Select Projects' });
    },
    /Permission denied/
  );

  const errorToasts = useToastStore.getState().toasts.filter((t) => t.type === 'error');
  assert.equal(errorToasts.length, 1);
  const firstError = errorToasts[0];
  assert.ok(firstError?.message.includes('Permission denied'));

  delete (globalThis as any).isTauri;
  delete (globalThis as any).__TAURI_INTERNALS__;
});
