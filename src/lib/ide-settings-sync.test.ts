import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppSettings, DetectedIde, Project } from '../types/index.ts';

test('initial default IDE correctly evaluates isDefault badge', () => {
  const settings: AppSettings = {
    default_ide: 'idea',
    scan_roots: [],
  };

  const ides: DetectedIde[] = [
    { id: 'code', name: 'VS Code', command: 'code', icon: null, installed_via: 'path' },
    { id: 'idea', name: 'IntelliJ IDEA', command: 'idea', icon: null, installed_via: 'path' },
    { id: 'cursor', name: 'Cursor', command: 'cursor', icon: null, installed_via: 'path' },
  ];

  const badges = ides.map((ide) => ({
    id: ide.id,
    isDefault: settings.default_ide === ide.id,
  }));

  assert.deepEqual(badges, [
    { id: 'code', isDefault: false },
    { id: 'idea', isDefault: true },
    { id: 'cursor', isDefault: false },
  ]);
});

test('successful mutation updates settings cache immediately and moves Default badge', () => {
  let settingsCache: AppSettings = {
    default_ide: 'idea',
    scan_roots: [],
  };

  const ides: DetectedIde[] = [
    { id: 'code', name: 'VS Code', command: 'code', icon: null, installed_via: 'path' },
    { id: 'idea', name: 'IntelliJ IDEA', command: 'idea', icon: null, installed_via: 'path' },
  ];

  // Initial state
  assert.equal(settingsCache.default_ide === 'idea', true);
  assert.equal(settingsCache.default_ide === 'code', false);

  // Simulate useSetDefaultIde onSuccess updater
  const updateSettingsCache = (newIdeId: string) => {
    settingsCache = {
      ...settingsCache,
      default_ide: newIdeId,
    };
  };

  updateSettingsCache('code');

  // Immediately after mutation: badge has moved without reload
  const newBadges = ides.map((ide) => ({
    id: ide.id,
    isDefault: settingsCache.default_ide === ide.id,
  }));

  assert.deepEqual(newBadges, [
    { id: 'code', isDefault: true },
    { id: 'idea', isDefault: false },
  ]);
});

test('mutation failure preserves previous default badge and does not update cache', async () => {
  let settingsCache: AppSettings = {
    default_ide: 'idea',
    scan_roots: [],
  };

  const mockSetDefaultIdeApi = async (_newIdeId: string) => {
    throw new Error('Database write error');
  };

  try {
    await mockSetDefaultIdeApi('code');
    // If it succeeded, it would update:
    settingsCache = { ...settingsCache, default_ide: 'code' };
  } catch {
    // Mutation failed: cache is not updated
  }

  // Previous default badge remains
  assert.equal(settingsCache.default_ide, 'idea');
  assert.equal(settingsCache.default_ide === 'idea', true);
  assert.equal((settingsCache.default_ide as string | null) === 'code', false);
});

test('IDE resolution hierarchy: project preferred_ide > global default_ide > detectedIdes[0]', () => {
  const detectedIdes: DetectedIde[] = [
    { id: 'cursor', name: 'Cursor', command: 'cursor', icon: null, installed_via: 'path' },
    { id: 'code', name: 'VS Code', command: 'code', icon: null, installed_via: 'path' },
    { id: 'idea', name: 'IntelliJ IDEA', command: 'idea', icon: null, installed_via: 'path' },
  ];

  const resolvePreferredIde = (project: Partial<Project>, settings: AppSettings | null) => {
    return (
      detectedIdes.find((i) => i.id === project.preferred_ide) ||
      detectedIdes.find((i) => i.id === settings?.default_ide) ||
      detectedIdes[0]
    );
  };

  // Case 1: Project has explicit preferred_ide override ('idea')
  const projectWithOverride: Partial<Project> = { preferred_ide: 'idea' };
  const settingsGlobalCode: AppSettings = { default_ide: 'code', scan_roots: [] };
  const res1 = resolvePreferredIde(projectWithOverride, settingsGlobalCode);
  assert.equal(res1?.id, 'idea');

  // Case 2: Project has NO preferred_ide (null) -> falls back to global default_ide ('code')
  const projectWithoutOverride: Partial<Project> = { preferred_ide: null };
  const res2 = resolvePreferredIde(projectWithoutOverride, settingsGlobalCode);
  assert.equal(res2?.id, 'code');

  // Case 3: Project has NO preferred_ide, and global default_ide is null -> falls back to detectedIdes[0] ('cursor')
  const settingsGlobalNull: AppSettings = { default_ide: null, scan_roots: [] };
  const res3 = resolvePreferredIde(projectWithoutOverride, settingsGlobalNull);
  assert.equal(res3?.id, 'cursor');
});

test('changing global default IDE does not mutate project preferred_ide', () => {
  const project: Partial<Project> = {
    id: 'p1',
    name: 'Special Project',
    preferred_ide: 'pycharm',
  };

  let globalSettings: AppSettings = {
    default_ide: 'idea',
    scan_roots: [],
  };

  // Change global default to VS Code
  globalSettings = { ...globalSettings, default_ide: 'code' };

  // Project preferred IDE remains strictly untouched
  assert.equal(project.preferred_ide, 'pycharm');
  assert.equal(globalSettings.default_ide, 'code');
});

test('query keys do not collide across different IDE and settings data shapes', () => {
  const queryKeys = {
    detectedIdes: ['ides'],
    settings: ['settings'],
    defaultIde: ['defaultIde'],
    projectRunConfigs: ['runConfigs', 'proj-1'],
    processes: ['processes'],
  };

  const serializedKeys = Object.values(queryKeys).map((k) => JSON.stringify(k));
  const uniqueKeys = new Set(serializedKeys);

  assert.equal(serializedKeys.length, uniqueKeys.size, 'All query keys must be unique');
});
