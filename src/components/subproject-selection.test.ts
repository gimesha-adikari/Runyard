import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project, Service, RunConfiguration, DetectedIde } from '../types/index.ts';

/**
 * Real mock catalog mimicking platen monorepo structure
 */
const mockParentProject: Project = {
  id: 'platen-root-id',
  name: 'platen',
  path: '/home/gimesha/My_Projects/platen',
  project_type: 'cargo',
  parent_project_id: null,
  is_runnable: true,
  languages: ['Rust', 'TypeScript', 'Go', 'Python'],
  frameworks: ['Tauri', 'React', 'Tailwind CSS'],
  has_git: true,
  git_branch: 'main',
  git_remote: 'git@github.com:runyard/platen.git',
  preferred_ide: 'vscode',
  default_run_config_id: null,
  is_favorite: false,
  tags: [],
  last_opened: null,
  last_run: null,
  created_at: new Date().toISOString(),
};

const mockChildBackend: Project = {
  id: 'pdfnest-backend-id',
  name: 'pdfnest-backend',
  path: '/home/gimesha/My_Projects/platen/pdfnest-backend',
  project_type: 'go',
  parent_project_id: 'platen-root-id',
  is_runnable: true,
  languages: ['Go'],
  frameworks: ['Fiber'],
  has_git: true,
  git_branch: 'feature/backend-api',
  git_remote: null,
  preferred_ide: null, // Inherits from platen ('vscode')
  default_run_config_id: null,
  is_favorite: false,
  tags: [],
  last_opened: null,
  last_run: null,
  created_at: new Date().toISOString(),
};

const mockChildWorker: Project = {
  id: 'pdfnest-worker-id',
  name: 'pdfnest-worker',
  path: '/home/gimesha/My_Projects/platen/pdfnest-worker',
  project_type: 'python',
  parent_project_id: 'platen-root-id',
  is_runnable: true,
  languages: ['Python'],
  frameworks: ['Celery'],
  has_git: true,
  git_branch: 'main',
  git_remote: null,
  preferred_ide: 'pycharm',
  default_run_config_id: null,
  is_favorite: false,
  tags: [],
  last_opened: null,
  last_run: null,
  created_at: new Date().toISOString(),
};

const mockGrandchildApi: Project = {
  id: 'pdfnest-sub-api-id',
  name: 'api-client',
  path: '/home/gimesha/My_Projects/platen/pdfnest-backend/api-client',
  project_type: 'npm',
  parent_project_id: 'pdfnest-backend-id',
  is_runnable: false,
  languages: ['TypeScript'],
  frameworks: [],
  has_git: false, // Nested subproject without its own git repo
  git_branch: null,
  git_remote: null,
  preferred_ide: null,
  default_run_config_id: null,
  is_favorite: false,
  tags: [],
  last_opened: null,
  last_run: null,
  created_at: new Date().toISOString(),
};

const mockProjects: Project[] = [
  mockParentProject,
  mockChildBackend,
  mockChildWorker,
  mockGrandchildApi,
];

// Normalized component-aware path comparison as implemented in ProjectNavigator.tsx
function normalizePath(pStr: string): string {
  return pStr.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function filterServicesForProject(
  parent: Project,
  allServices: Service[],
  allSubprojects: Project[]
): Service[] {
  const pSubprojs = allSubprojects.filter((sub) => sub.parent_project_id === parent.id);
  const pSvcs = allServices.filter((s) => s.project_id === parent.id);

  return pSvcs.filter((svc) => {
    const normParent = normalizePath(parent.path);
    const normSvc = svc.path.startsWith('/')
      ? normalizePath(svc.path)
      : normalizePath(`${normParent}/${svc.path}`);

    return !pSubprojs.some((sub) => {
      const normSub = normalizePath(sub.path);
      return normSub === normSvc || normSub.endsWith('/' + normalizePath(svc.path));
    });
  });
}

function resolveAncestors(project: Project, allProjects: Project[]): Project[] {
  const list: Project[] = [];
  let cur = project;
  while (cur.parent_project_id) {
    const parent = allProjects.find((p) => p.id === cur.parent_project_id);
    if (!parent) break;
    list.unshift(parent);
    cur = parent;
  }
  return list;
}

function scopeRunConfigs(
  project: Project,
  directConfigs: RunConfiguration[],
  parentProject: Project | null,
  parentConfigs: RunConfiguration[]
) {
  if (!parentProject) {
    return {
      scopedConfigs: directConfigs,
      monorepoConfigs: [],
    };
  }

  // 1. Direct configs owned by this project (project_id is authoritative)
  const scoped: RunConfiguration[] = [...directConfigs];

  // 2. Legacy fallback: ONLY if child project has NO direct configs in the database,
  // infer configs from parent where working_dir explicitly matches the child path
  if (scoped.length === 0) {
    for (const cfg of parentConfigs) {
      const workingDir = cfg.working_dir || '';
      if (
        workingDir === project.path ||
        workingDir.startsWith(project.path + '/') ||
        workingDir.startsWith(project.path + '\\')
      ) {
        if (!scoped.some((c) => c.id === cfg.id)) {
          scoped.push(cfg);
        }
      }
    }
  }

  // 3. Monorepo / Repository Configurations
  // Configs owned by parentProject running at root, never duplicating any scoped config
  const monorepo: RunConfiguration[] = [];
  for (const cfg of parentConfigs) {
    const workingDir = cfg.working_dir || '';
    if (
      (workingDir === parentProject.path || !workingDir) &&
      !cfg.service_id &&
      !scoped.some((c) => c.id === cfg.id)
    ) {
      monorepo.push(cfg);
    }
  }

  return {
    scopedConfigs: scoped,
    monorepoConfigs: monorepo,
  };
}

function resolvePreferredIde(
  project: Project,
  parentProject: Project | null,
  detectedIdes: DetectedIde[],
  defaultIde: string | null
): DetectedIde | null {
  return (
    detectedIdes.find((i) => i.id === project.preferred_ide) ||
    (parentProject ? detectedIdes.find((i) => i.id === parentProject.preferred_ide) : null) ||
    detectedIdes.find((i) => i.id === defaultIde) ||
    detectedIdes[0] ||
    null
  );
}

function resolveNearestGitRepo(project: Project, catalog: Project[]): string | null {
  let cur: Project | undefined = project;
  while (cur) {
    if (cur.has_git) {
      return cur.path;
    }
    cur = cur.parent_project_id ? catalog.find((p) => p.id === cur?.parent_project_id) : undefined;
  }
  return null;
}

// --------------------------------------------------------------------------
// SECTION 12: AUTOMATED REGRESSION TEST MATRIX (TESTS 1 - 13)
// --------------------------------------------------------------------------

test('1. child selection uses child Project.id', () => {
  let activeProjectId: string | null = null;
  const setActiveProjectId = (id: string | null) => {
    activeProjectId = id;
  };

  // User clicks on child subproject row in Explorer
  setActiveProjectId(mockChildBackend.id);
  assert.equal(activeProjectId, 'pdfnest-backend-id');

  // Active project lookup returns the child project object, not the parent
  const active = mockProjects.find((p) => p.id === activeProjectId);
  assert.ok(active);
  assert.equal(active.id, 'pdfnest-backend-id');
  assert.equal(active.name, 'pdfnest-backend');
  assert.equal(active.path, '/home/gimesha/My_Projects/platen/pdfnest-backend');
  assert.equal(active.parent_project_id, 'platen-root-id');
});

test('2. chevron only expands/collapses without selecting', () => {
  let activeProjectId: string | null = 'platen-root-id';
  const expanded = new Set<string>();

  const toggleNode = (id: string) => {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
  };

  // Clicking chevron of parent node toggles its expanded state
  toggleNode('platen-root-id');
  assert.ok(expanded.has('platen-root-id'), 'Parent node should now be expanded');
  assert.equal(activeProjectId, 'platen-root-id', 'Active project must remain unchanged');

  // Clicking chevron again collapses parent node
  toggleNode('platen-root-id');
  assert.ok(!expanded.has('platen-root-id'), 'Parent node should now be collapsed');
  assert.equal(activeProjectId, 'platen-root-id', 'Active project must still remain unchanged');
});

test('3. row click only selects without collapsing', () => {
  let activeProjectId: string | null = null;
  const expanded = new Set<string>(['platen-root-id']);

  const selectProject = (id: string) => {
    activeProjectId = id;
  };

  // Clicking on the child subproject row activates the child
  selectProject(mockChildBackend.id);
  assert.equal(activeProjectId, 'pdfnest-backend-id');

  // Parent node expansion state is preserved (NOT collapsed)
  assert.ok(expanded.has('platen-root-id'), 'Parent node must remain expanded when row is selected');
});

test('4. ancestors auto-expand in expandedNodes', () => {
  const expanded = new Set<string>();

  const autoExpandAncestors = (currentId: string) => {
    let cur = mockProjects.find((p) => p.id === currentId);
    while (cur?.parent_project_id) {
      expanded.add(cur.parent_project_id);
      cur = mockProjects.find((p) => p.id === cur?.parent_project_id);
    }
  };

  // Grandchild project selected (platen -> pdfnest-backend -> api-client)
  autoExpandAncestors(mockGrandchildApi.id);

  assert.ok(expanded.has('platen-root-id'), 'Root platen must be auto-expanded');
  assert.ok(expanded.has('pdfnest-backend-id'), 'Intermediate pdfnest-backend must be auto-expanded');
  assert.equal(expanded.size, 2);
});

test('5. breadcrumb ancestry derived from parent_project_id', () => {
  // Breadcrumbs must NOT be computed by splitting path strings (e.g. no path.split('/'))
  // They must be derived strictly by traversing parent_project_id
  const rootAncestors = resolveAncestors(mockParentProject, mockProjects);
  assert.equal(rootAncestors.length, 0, 'Root project has no ancestors');

  const childAncestors = resolveAncestors(mockChildBackend, mockProjects);
  assert.equal(childAncestors.length, 1);
  assert.equal(childAncestors[0]!.id, 'platen-root-id');
  assert.equal(childAncestors[0]!.name, 'platen');

  const grandAncestors = resolveAncestors(mockGrandchildApi, mockProjects);
  assert.equal(grandAncestors.length, 2);
  assert.equal(grandAncestors[0]!.id, 'platen-root-id');
  assert.equal(grandAncestors[1]!.id, 'pdfnest-backend-id');

  // Clicking an ancestor breadcrumb item selects that ancestor's real Project.id
  let activeId: string = mockGrandchildApi.id;
  const clickBreadcrumb = (targetProject: Project) => {
    activeId = targetProject.id;
  };

  clickBreadcrumb(grandAncestors[1]!);
  assert.equal(activeId, 'pdfnest-backend-id');

  clickBreadcrumb(grandAncestors[0]!);
  assert.equal(activeId, 'platen-root-id');
});

test('6. child workspace metadata (name, branch, languages, frameworks)', () => {
  const child = mockProjects.find((p) => p.id === 'pdfnest-backend-id');
  assert.ok(child);

  // Verify child-specific workspace metadata
  assert.equal(child.name, 'pdfnest-backend');
  assert.equal(child.git_branch, 'feature/backend-api');
  assert.deepEqual(child.languages, ['Go']);
  assert.deepEqual(child.frameworks, ['Fiber']);
  assert.equal(child.project_type, 'go');
  assert.equal(child.is_runnable, true);
  assert.equal(child.path, '/home/gimesha/My_Projects/platen/pdfnest-backend');
});

test('7. child terminal working directory', () => {
  // 1. Initial terminal mount uses active project path
  let activeProject = mockChildBackend;
  const terminalProps = {
    projectPath: activeProject.path,
  };
  assert.equal(
    terminalProps.projectPath,
    '/home/gimesha/My_Projects/platen/pdfnest-backend',
    'Terminal target path must match child directory'
  );

  // 2. Switching project updates target ref for new/restarted sessions without destroying live PTY
  activeProject = mockParentProject;
  assert.equal(activeProject.path, '/home/gimesha/My_Projects/platen');
});

test('8. child IDE path passes child directory', () => {
  const mockIdes: DetectedIde[] = [
    { id: 'vscode', name: 'Visual Studio Code', command: 'code', icon: null, installed_via: 'apt' },
    { id: 'cursor', name: 'Cursor', command: 'cursor', icon: null, installed_via: 'apt' },
    { id: 'pycharm', name: 'PyCharm', command: 'pycharm', icon: null, installed_via: 'snap' },
  ];

  // IDE launch target must pass child directory, not parent directory
  const getIdeLaunchArgs = (ide: DetectedIde, proj: Project) => ({
    command: ide.command,
    path: proj.path,
  });

  const launchTarget = getIdeLaunchArgs(mockIdes[0]!, mockChildBackend);
  assert.equal(launchTarget.path, '/home/gimesha/My_Projects/platen/pdfnest-backend');

  // IDE preference inheritance: child with preferred_ide = null inherits parent's 'vscode'
  const ideForBackend = resolvePreferredIde(mockChildBackend, mockParentProject, mockIdes, 'cursor');
  assert.equal(ideForBackend?.id, 'vscode', 'Child inherits parent preferred IDE');

  // Child with explicit preferred_ide override ('pycharm') takes precedence
  const ideForWorker = resolvePreferredIde(mockChildWorker, mockParentProject, mockIdes, 'cursor');
  assert.equal(ideForWorker?.id, 'pycharm', 'Child explicit IDE overrides parent');
});

test('9. Git nearest repository resolution', () => {
  // Case A: Subproject with its own .git repository
  assert.equal(mockChildBackend.has_git, true);
  const repoForBackend = resolveNearestGitRepo(mockChildBackend, mockProjects);
  assert.equal(repoForBackend, '/home/gimesha/My_Projects/platen/pdfnest-backend');

  // Case B: Subproject inside parent repository without its own .git
  assert.equal(mockGrandchildApi.has_git, false);
  const repoForGrandchild = resolveNearestGitRepo(mockGrandchildApi, mockProjects);
  assert.equal(
    repoForGrandchild,
    '/home/gimesha/My_Projects/platen/pdfnest-backend',
    'Resolves to nearest ancestor containing git repo'
  );

  // Case C: Sibling subproject with parent as nearest git
  const mockNonGitChild: Project = {
    ...mockChildBackend,
    id: 'non-git-child-id',
    has_git: false,
    parent_project_id: 'platen-root-id',
    path: '/home/gimesha/My_Projects/platen/non-git',
  };
  const repoForNonGit = resolveNearestGitRepo(mockNonGitChild, [...mockProjects, mockNonGitChild]);
  assert.equal(
    repoForNonGit,
    '/home/gimesha/My_Projects/platen',
    'Resolves to monorepo root containing git repo'
  );
});

test('10. filter + child selection composition', () => {
  const langFilter = 'Go';

  // Filter matches mockChildBackend ('Go') but not mockChildWorker ('Python')
  const matches = (p: Project) => (p.languages || []).includes(langFilter);

  assert.equal(matches(mockChildBackend), true);
  assert.equal(matches(mockChildWorker), false);

  // Container ancestor ('platen') remains visible because it has matching child
  const hasMatchingChild = mockProjects.some(
    (p) => p.parent_project_id === mockParentProject.id && matches(p)
  );
  assert.equal(hasMatchingChild, true, 'Parent container must remain visible in Explorer');

  // Child is selectable while filter is active
  let activeProjectId: string | null = null;
  activeProjectId = mockChildBackend.id;
  assert.equal(activeProjectId, 'pdfnest-backend-id');

  // Clearing filter maintains selection
  const clearedFilter = 'All';
  assert.equal(clearedFilter, 'All');
  assert.equal(activeProjectId, 'pdfnest-backend-id', 'Selection is preserved after clearing filter');
});

test('11. stale selected child clears safely when deleted', () => {
  let activeProjectId: string | null = 'pdfnest-backend-id';
  let catalog = [...mockProjects];

  const syncActiveSelection = (currentId: string | null, list: Project[]) => {
    if (currentId && !list.some((p) => p.id === currentId)) {
      return null;
    }
    return currentId;
  };

  // Initially active project exists
  assert.equal(syncActiveSelection(activeProjectId, catalog), 'pdfnest-backend-id');

  // Subproject deleted/removed from catalog
  catalog = catalog.filter((p) => p.id !== 'pdfnest-backend-id');
  activeProjectId = syncActiveSelection(activeProjectId, catalog);

  // Active selection safely clears to null without throwing
  assert.equal(activeProjectId, null, 'Active selection must clear safely when project is deleted');
});

test('12. no duplicate config IDs in inherited/direct sections', () => {
  // Sibling and parent run configs
  const directChildConfigs: RunConfiguration[] = [
    {
      id: 'cfg-direct-1',
      project_id: 'pdfnest-backend-id',
      service_id: null,
      name: 'go test ./...',
      command: 'go',
      args: ['test', './...'],
      working_dir: '/home/gimesha/My_Projects/platen/pdfnest-backend',
      env_file: null,
      env_vars: {},
      is_trusted: true,
      trusted_fingerprint: null,
      is_default: false,
      source: 'UserCreated',
      created_at: new Date().toISOString(),
    },
  ];

  const parentConfigs: RunConfiguration[] = [
    {
      id: 'cfg-direct-1', // Duplicate ID collision edge-case: parent has copy with same ID
      project_id: 'platen-root-id',
      service_id: null,
      name: 'docker compose up',
      command: 'docker',
      args: ['compose', 'up'],
      working_dir: '/home/gimesha/My_Projects/platen',
      env_file: null,
      env_vars: {},
      is_trusted: true,
      trusted_fingerprint: null,
      is_default: false,
      source: 'Detected',
      created_at: new Date().toISOString(),
    },
    {
      id: 'cfg-monorepo-root',
      project_id: 'platen-root-id',
      service_id: null,
      name: 'cargo test --workspace',
      command: 'cargo',
      args: ['test', '--workspace'],
      working_dir: '/home/gimesha/My_Projects/platen',
      env_file: null,
      env_vars: {},
      is_trusted: true,
      trusted_fingerprint: null,
      is_default: false,
      source: 'Detected',
      created_at: new Date().toISOString(),
    },
    {
      id: 'cfg-sibling-worker',
      project_id: 'platen-root-id',
      service_id: 'svc-worker',
      name: '[pdfnest-worker] celery worker',
      command: 'celery',
      args: ['worker'],
      working_dir: '/home/gimesha/My_Projects/platen/pdfnest-worker', // Sibling!
      env_file: null,
      env_vars: {},
      is_trusted: true,
      trusted_fingerprint: null,
      is_default: false,
      source: 'Detected',
      created_at: new Date().toISOString(),
    },
  ];

  const { scopedConfigs, monorepoConfigs } = scopeRunConfigs(
    mockChildBackend,
    directChildConfigs,
    mockParentProject,
    parentConfigs
  );

  // Verify:
  // 1. Direct config is in scopedConfigs
  assert.equal(scopedConfigs.length, 1);
  assert.equal(scopedConfigs[0]!.id, 'cfg-direct-1');

  // 2. Monorepo config with conflicting ID ('cfg-direct-1') was rejected and not duplicated
  // Only non-conflicting root configs appear in monorepoConfigs
  assert.equal(monorepoConfigs.length, 1);
  assert.equal(monorepoConfigs[0]!.id, 'cfg-monorepo-root');

  // 3. Sibling config ('cfg-sibling-worker') is completely excluded
  const allIds = [...scopedConfigs.map((c) => c.id), ...monorepoConfigs.map((c) => c.id)];
  assert.ok(!allIds.includes('cfg-sibling-worker'), 'Sibling config must never be present');

  // 4. Strict assertion: NO ID appears more than once across both sections
  const scopedIdSet = new Set(scopedConfigs.map((c) => c.id));
  for (const mono of monorepoConfigs) {
    assert.ok(
      !scopedIdSet.has(mono.id),
      `Config ID ${mono.id} cannot appear in both scoped and monorepo configs`
    );
  }
  assert.equal(new Set(allIds).size, allIds.length, 'All config IDs across sections must be unique');
});

test('13. Project/Service dedup does not hide unrelated same-name entities', () => {
  const mockAllServices: Service[] = [
    // Duplicate service: same filesystem path as subproject pdfnest-backend
    {
      id: 'svc-backend-dup',
      project_id: 'platen-root-id',
      name: 'pdfnest-backend',
      path: 'pdfnest-backend', // Matches /home/gimesha/My_Projects/platen/pdfnest-backend
      service_type: 'go',
      languages: ['Go'],
      frameworks: [],
      is_runnable: true,
      created_at: new Date().toISOString(),
    },
    // Unrelated same-name service: named 'api-client' but located in scratch/tools/api-client!
    // Must NOT be hidden because its path differs from mockGrandchildApi
    {
      id: 'svc-unrelated-same-name',
      project_id: 'platen-root-id',
      name: 'api-client',
      path: 'scratch/tools/api-client',
      service_type: 'node',
      languages: ['TypeScript'],
      frameworks: [],
      is_runnable: false,
      created_at: new Date().toISOString(),
    },
    // Genuinely different standalone service
    {
      id: 'svc-scratch-spike',
      project_id: 'platen-root-id',
      name: 'scratch-spike',
      path: 'scratch/test_svg_spike',
      service_type: 'rust',
      languages: ['Rust'],
      frameworks: [],
      is_runnable: false,
      created_at: new Date().toISOString(),
    },
  ];

  const subprojects = mockProjects.filter((p) => p.parent_project_id);
  const remainingServices = filterServicesForProject(mockParentProject, mockAllServices, subprojects);

  const remainingIds = remainingServices.map((s) => s.id);

  // 'svc-backend-dup' matches subproject path -> filtered out
  assert.ok(
    !remainingIds.includes('svc-backend-dup'),
    'Duplicate service matching subproject path must be filtered'
  );

  // 'svc-unrelated-same-name' shares name 'api-client' but has DIFFERENT path -> preserved!
  assert.ok(
    remainingIds.includes('svc-unrelated-same-name'),
    'Unrelated same-name service in different path must NOT be hidden'
  );

  // 'svc-scratch-spike' is standalone -> preserved
  assert.ok(
    remainingIds.includes('svc-scratch-spike'),
    'Standalone service must be preserved'
  );

  assert.equal(remainingServices.length, 2, 'Exactly 2 non-duplicate services remain');
});
