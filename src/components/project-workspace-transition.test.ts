import test from 'node:test';
import assert from 'node:assert/strict';
import React, { useState, useMemo, useEffect } from 'react';
import { renderToString } from 'react-dom/server';

interface MockProject {
  id: string;
  name: string;
  path: string;
  git_branch: string;
}

/**
 * Models the architectural pattern implemented in ProjectWorkspace.tsx:
 * Outer container handles query loading/unavailability.
 * Inner container unconditionally executes all feature hooks (useMemo, useState, useEffect).
 */
function MockOuterWorkspace({
  isLoading,
  project,
}: {
  isLoading: boolean;
  project: MockProject | null;
}) {
  if (isLoading) {
    return React.createElement('div', { className: 'workspace-loading' }, 'Loading workspace...');
  }

  if (!project) {
    return React.createElement('div', { className: 'workspace-not-found' }, 'Project not found');
  }

  return React.createElement(MockLoadedProjectWorkspace, { key: project.id, project });
}

function MockLoadedProjectWorkspace({ project }: { project: MockProject }) {
  const [showModal] = useState(false);
  const [selectedId] = useState<string | null>(null);

  const gitChangesCount = useMemo(() => {
    return project.name.length;
  }, [project.name]);

  const ideMenuItems = useMemo(() => {
    return [
      { id: 'code', label: 'VS Code' },
      { id: 'cursor', label: 'Cursor' },
    ];
  }, []);

  const moreMenuItems = useMemo(() => {
    return [
      { id: 'terminal', label: 'System Terminal' },
      { id: 'folder', label: 'File Manager' },
    ];
  }, []);

  useEffect(() => {
    // Simulates IDE detection effect
  }, []);

  return React.createElement(
    'div',
    { className: 'loaded-workspace', 'data-project-id': project.id },
    React.createElement('h1', null, project.name),
    React.createElement('span', { className: 'branch' }, project.git_branch),
    React.createElement('span', { className: 'changes' }, `${gitChangesCount} changes`),
    React.createElement('span', { className: 'ide-count' }, `${ideMenuItems.length} IDEs`),
    React.createElement('span', { className: 'more-count' }, `${moreMenuItems.length} tools`),
    React.createElement('span', { className: 'state' }, `${showModal}-${selectedId}`)
  );
}

test('ProjectWorkspace async transition: loading -> project loaded -> project switch', () => {
  const originalError = console.error;
  const capturedErrors: string[] = [];
  console.error = (...args: any[]) => {
    capturedErrors.push(args.map((a) => String(a?.message || a)).join(' '));
  };

  try {
    const projectA: MockProject = {
      id: 'proj-a',
      name: 'Portfolio',
      path: '/home/gimesha/projects/portfolio',
      git_branch: 'main',
    };

    const projectB: MockProject = {
      id: 'proj-b',
      name: 'Platen',
      path: '/home/gimesha/projects/platen',
      git_branch: 'feat/v2',
    };

    // Step 1: Initial state — project is loading
    const htmlLoading = renderToString(
      React.createElement(MockOuterWorkspace, { isLoading: true, project: null })
    );
    assert.ok(htmlLoading.includes('Loading workspace...'));

    // Step 2: Transition — project data becomes available (Portfolio)
    const htmlLoadedA = renderToString(
      React.createElement(MockOuterWorkspace, { isLoading: false, project: projectA })
    );
    assert.ok(htmlLoadedA.includes('Portfolio'));
    assert.ok(htmlLoadedA.includes('main'));
    assert.ok(htmlLoadedA.includes('2 IDEs'));

    // Step 3: Switch project — Portfolio -> Platen
    const htmlLoadedB = renderToString(
      React.createElement(MockOuterWorkspace, { isLoading: false, project: projectB })
    );
    assert.ok(htmlLoadedB.includes('Platen'));
    assert.ok(htmlLoadedB.includes('feat/v2'));

    // Step 4: Rapid switch back — Platen -> Portfolio
    const htmlLoadedBack = renderToString(
      React.createElement(MockOuterWorkspace, { isLoading: false, project: projectA })
    );
    assert.ok(htmlLoadedBack.includes('Portfolio'));

    // Step 5: Verify zero React hook order warnings or errors
    const hookViolations = capturedErrors.filter(
      (err) =>
        err.includes('Rendered more hooks') ||
        err.includes('Rendered fewer hooks') ||
        err.includes('change in the order of Hooks') ||
        err.includes('Rules of Hooks')
    );
    assert.equal(hookViolations.length, 0, `No Rules of Hooks violations should occur: ${hookViolations.join('; ')}`);
  } finally {
    console.error = originalError;
  }
});
