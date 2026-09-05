import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRelativeTime,
  formatElapsedDuration,
  truncatePath,
  getStatusColor,
  cn,
  isPathAncestorOrEqual,
} from './utils.ts';

test('formatElapsedDuration formats seconds, minutes, hours correctly', () => {
  const now = Date.now();
  
  assert.equal(formatElapsedDuration(null), '0s');
  
  // 45 seconds ago
  const t45s = new Date(now - 45 * 1000).toISOString();
  assert.equal(formatElapsedDuration(t45s), '45s');

  // 3 minutes 12 seconds ago
  const t3m = new Date(now - (3 * 60 + 12) * 1000).toISOString();
  assert.equal(formatElapsedDuration(t3m), '3m 12s');

  // 2 hours 15 minutes 30 seconds ago
  const t2h = new Date(now - (2 * 3600 + 15 * 60 + 30) * 1000).toISOString();
  assert.equal(formatElapsedDuration(t2h), '2h 15m 30s');
});

test('truncatePath preserves head and tail with ellipsis', () => {
  const shortPath = '/home/user/project';
  assert.equal(truncatePath(shortPath, 40), shortPath);

  const longPath = '/home/user/workspace/development/rust/my-awesome-desktop-app';
  const truncated = truncatePath(longPath, 30);
  assert.ok(truncated.includes('...'));
  assert.ok(truncated.endsWith('my-awesome-desktop-app'));
});

test('formatRelativeTime handles null and recent dates', () => {
  assert.equal(formatRelativeTime(null), 'Never');
  
  const now = new Date().toISOString();
  assert.equal(formatRelativeTime(now), 'Just now');
});

test('getStatusColor returns appropriate tailwind class', () => {
  assert.equal(getStatusColor('Running'), 'bg-emerald-500');
  assert.equal(getStatusColor('Failed'), 'bg-red-500');
  assert.equal(getStatusColor('Starting'), 'bg-amber-400 animate-pulse');
  assert.equal(getStatusColor('Stopping'), 'bg-amber-600 animate-pulse');
  assert.equal(getStatusColor('Exited'), 'bg-blue-500');
  assert.equal(getStatusColor('Stopped'), 'bg-zinc-500');
});

test('cn merges classes cleanly', () => {
  assert.equal(cn('px-2', 'py-1', { 'text-red-500': true, 'text-blue-500': false }), 'px-2 py-1 text-red-500');
});

test('isPathAncestorOrEqual correctly identifies path ancestry and rejects prefix traps', () => {
  // Direct equals
  assert.equal(isPathAncestorOrEqual('/tmp/foo', '/tmp/foo'), true);
  assert.equal(isPathAncestorOrEqual('/tmp/foo/', '/tmp/foo'), true);
  assert.equal(isPathAncestorOrEqual('/tmp/foo', '/tmp/foo/'), true);

  // Legitimate child
  assert.equal(isPathAncestorOrEqual('/tmp/foo', '/tmp/foo/child'), true);
  assert.equal(isPathAncestorOrEqual('/tmp/foo', '/tmp/foo/child/grandchild'), true);

  // String prefix trap (e.g. /tmp/foobar must NOT be considered under /tmp/foo)
  assert.equal(isPathAncestorOrEqual('/tmp/foo', '/tmp/foobar'), false);
  assert.equal(isPathAncestorOrEqual('/tmp/foo', '/tmp/foobar/child'), false);

  // Unrelated paths
  assert.equal(isPathAncestorOrEqual('/tmp/workspace', '/var/workspace'), false);

  // Windows-style backslashes
  assert.equal(isPathAncestorOrEqual('C:\\projects\\app', 'C:\\projects\\app\\sub'), true);
  assert.equal(isPathAncestorOrEqual('C:\\projects\\app', 'C:\\projects\\app-backup'), false);
});

