import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useUiStore } from '../stores/ui-store.ts';

interface ProjectStub {
  id: string;
  name: string;
  path: string;
}

/**
 * Models DesktopLayout.tsx active project workspace rendering & state synchronization:
 * 1. Checks if activeProject exists in projects.
 * 2. Renders ProjectWorkspace only if both activeProject and activeProjectId exist.
 * 3. Renders empty workspace state otherwise.
 * 4. Cleans up stale activeProjectId and associated UI state when project is missing.
 */
function renderWorkspaceView({
  projects,
  activeProjectId,
}: {
  projects: ProjectStub[] | undefined;
  activeProjectId: string | null;
}) {
  const activeProject = projects?.find((p) => p.id === activeProjectId);

  if (activeProject && activeProjectId) {
    return React.createElement('div', { id: 'workspace' }, `Loaded: ${activeProject.name}`);
  }

  return React.createElement('div', { id: 'empty-workspace' }, 'Select a project from the explorer to inspect workspace');
}

function syncActiveProjectEffect(
  activeProjectId: string | null,
  projects: ProjectStub[] | undefined,
  actions: {
    setActiveProjectId: (id: string | null) => void;
    setSelectedProcessIdForLogs: (id: string | null) => void;
    setDiffTarget: (target: any) => void;
  }
) {
  if (activeProjectId && projects && !projects.some((p) => p.id === activeProjectId)) {
    actions.setActiveProjectId(null);
    actions.setSelectedProcessIdForLogs(null);
    actions.setDiffTarget(null);
  }
}

test('Active project synchronization: active project renders when project exists in catalog', () => {
  const projects: ProjectStub[] = [
    { id: 'p-1', name: 'App One', path: '/tmp/workspace/app-one' },
    { id: 'p-2', name: 'App Two', path: '/tmp/workspace/app-two' },
  ];

  const html = renderToString(renderWorkspaceView({ projects, activeProjectId: 'p-1' }));
  assert.ok(html.includes('Loaded: App One'));
});

test('Active project synchronization: removes stale activeProjectId and renders empty state immediately', () => {
  useUiStore.getState().setActiveProjectId('p-removed');
  useUiStore.getState().setSelectedProcessIdForLogs('proc-123');
  useUiStore.getState().setDiffTarget({ path: '/tmp/workspace/file.rs', staged: false });

  assert.equal(useUiStore.getState().activeProjectId, 'p-removed');
  assert.equal(useUiStore.getState().selectedProcessIdForLogs, 'proc-123');

  // Catalog after scan root removal: p-removed is gone!
  const projects: ProjectStub[] = [
    { id: 'p-other', name: 'Other App', path: '/tmp/other/app' },
  ];

  // 1. Render check: must NOT render workspace for p-removed, must render empty workspace immediately
  const html = renderToString(renderWorkspaceView({
    projects,
    activeProjectId: useUiStore.getState().activeProjectId,
  }));
  assert.ok(html.includes('Select a project from the explorer to inspect workspace'));
  assert.ok(!html.includes('Loaded:'));

  // 2. Synchronize store state (effect execution in DesktopLayout)
  syncActiveProjectEffect(
    useUiStore.getState().activeProjectId,
    projects,
    useUiStore.getState()
  );

  const updatedState = useUiStore.getState();
  assert.equal(updatedState.activeProjectId, null);
  assert.equal(updatedState.selectedProcessIdForLogs, null);
  assert.equal(updatedState.diffTarget, null);
});

test('Active project synchronization: handles completely empty catalog without errors', () => {
  const emptyProjects: ProjectStub[] = [];

  const html = renderToString(renderWorkspaceView({ projects: emptyProjects, activeProjectId: 'p-gone' }));
  assert.ok(html.includes('Select a project from the explorer to inspect workspace'));
  assert.ok(!html.includes('Loaded:'));
});
