import test from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).window = globalThis;

import { useScanStore } from './scan-store.ts';

test('useScanStore manages progress map and scanning state correctly', () => {
  const store = useScanStore.getState();

  assert.equal(store.isAnyScanning(), false);
  assert.equal(store.getRootProgress('root-1'), undefined);

  // Update root 1 to queued
  useScanStore.getState().updateProgress({
    root_id: 'root-1',
    root_path: '/path/to/1',
    state: 'queued',
    directories_inspected: 0,
    projects_found: 0,
    services_found: 0,
    elapsed_ms: 0,
    error: null,
  });

  assert.equal(useScanStore.getState().isAnyScanning(), true);
  assert.equal(useScanStore.getState().getRootProgress('root-1')?.state, 'queued');

  // Update root 1 to scanning
  useScanStore.getState().updateProgress({
    root_id: 'root-1',
    root_path: '/path/to/1',
    state: 'scanning',
    directories_inspected: 15,
    projects_found: 2,
    services_found: 1,
    elapsed_ms: 350,
    error: null,
  });

  assert.equal(useScanStore.getState().isAnyScanning(), true);
  const p1 = useScanStore.getState().getRootProgress('root-1');
  assert.equal(p1?.state, 'scanning');
  assert.equal(p1?.projects_found, 2);
  assert.equal(p1?.services_found, 1);

  // Update root 2 to completed
  useScanStore.getState().updateProgress({
    root_id: 'root-2',
    root_path: '/path/to/2',
    state: 'completed',
    directories_inspected: 40,
    projects_found: 5,
    services_found: 2,
    elapsed_ms: 1200,
    error: null,
  });

  // Still scanning because root 1 is scanning
  assert.equal(useScanStore.getState().isAnyScanning(), true);

  // Now complete root 1
  useScanStore.getState().updateProgress({
    root_id: 'root-1',
    root_path: '/path/to/1',
    state: 'completed',
    directories_inspected: 15,
    projects_found: 2,
    services_found: 1,
    elapsed_ms: 500,
    error: null,
  });

  // Both completed -> isAnyScanning should be false
  assert.equal(useScanStore.getState().isAnyScanning(), false);
  assert.equal(useScanStore.getState().getRootProgress('root-1')?.state, 'completed');
  assert.equal(useScanStore.getState().getRootProgress('root-2')?.state, 'completed');
});
