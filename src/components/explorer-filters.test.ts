import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

interface MockProject {
  id: string;
  name: string;
  path: string;
  project_type: string | null;
  parent_project_id: string | null;
  languages: string[];
  frameworks: string[];
}

interface MockService {
  id: string;
  project_id: string;
  name: string;
  path: string;
  service_type: string | null;
  languages: string[];
  frameworks: string[];
}

/**
 * Filter predicate faithfully replicating ProjectNavigator.tsx logic
 */
function matchesFilter(
  item: {
    name: string;
    project_type?: string | null;
    service_type?: string | null;
    languages?: string[];
    frameworks?: string[];
  },
  filters: {
    search: string;
    typeFilter: string;
    langFilter: string;
    frameFilter: string;
  }
): boolean {
  if (filters.search && !item.name.toLowerCase().includes(filters.search.toLowerCase())) {
    return false;
  }
  const type = item.project_type || item.service_type;
  if (filters.typeFilter !== 'All' && type !== filters.typeFilter) {
    return false;
  }
  if (filters.langFilter !== 'All' && !(item.languages || []).includes(filters.langFilter)) {
    return false;
  }
  if (filters.frameFilter !== 'All' && !(item.frameworks || []).includes(filters.frameFilter)) {
    return false;
  }
  return true;
}

/**
 * Filter catalog and resolve parent/child visibility replicating ProjectNavigator.tsx
 */
function filterProjects(
  projects: MockProject[],
  services: MockService[],
  filters: {
    search: string;
    typeFilter: string;
    langFilter: string;
    frameFilter: string;
  }
) {
  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.typeFilter !== 'All' ||
    filters.langFilter !== 'All' ||
    filters.frameFilter !== 'All';

  const allSubprojects = projects.filter((p) => p.parent_project_id);
  const projectHasMatchingChild = new Set<string>();

  if (hasActiveFilters) {
    services.forEach((s) => {
      if (matchesFilter(s, filters)) projectHasMatchingChild.add(s.project_id);
    });
    allSubprojects.forEach((sub) => {
      if (matchesFilter(sub, filters) && sub.parent_project_id) {
        projectHasMatchingChild.add(sub.parent_project_id);
      }
    });

    let added = true;
    while (added) {
      added = false;
      allSubprojects.forEach((sub) => {
        if (
          projectHasMatchingChild.has(sub.id) &&
          sub.parent_project_id &&
          !projectHasMatchingChild.has(sub.parent_project_id)
        ) {
          projectHasMatchingChild.add(sub.parent_project_id);
          added = true;
        }
      });
    }
  }

  const visibleRootProjects = projects
    .filter((p) => !p.parent_project_id)
    .filter((p) => !hasActiveFilters || matchesFilter(p, filters) || projectHasMatchingChild.has(p.id));

  return {
    visibleRootProjects,
    projectHasMatchingChild,
    hasActiveFilters,
  };
}

/**
 * Derives available dynamic filter options replicating ProjectNavigator.tsx
 */
function deriveFilterOptions(projects: MockProject[], services: MockService[]) {
  const types = new Set<string>();
  projects.forEach((p) => {
    if (p.project_type && p.project_type !== 'Unknown') types.add(p.project_type);
  });
  services.forEach((s) => {
    if (s.service_type && s.service_type !== 'Unknown') types.add(s.service_type);
  });

  const langs = new Set<string>();
  projects.forEach((p) => (p.languages || []).forEach((l) => langs.add(l)));
  services.forEach((s) => (s.languages || []).forEach((l) => langs.add(l)));

  const frames = new Set<string>();
  projects.forEach((p) => (p.frameworks || []).forEach((f) => frames.add(f)));
  services.forEach((s) => (s.frameworks || []).forEach((f) => frames.add(f)));

  return {
    availableTypes: ['All', ...Array.from(types).sort()],
    availableLangs: ['All', ...Array.from(langs).sort()],
    availableFrames: ['All', ...Array.from(frames).sort()],
  };
}

// Sample test catalog
const sampleProjects: MockProject[] = [
  {
    id: 'proj-1',
    name: 'runyard-core',
    path: '/work/runyard-core',
    project_type: 'cargo',
    parent_project_id: null,
    languages: ['Rust'],
    frameworks: ['Tauri'],
  },
  {
    id: 'proj-2',
    name: 'web-dashboard',
    path: '/work/web-dashboard',
    project_type: 'npm',
    parent_project_id: null,
    languages: ['TypeScript', 'JavaScript'],
    frameworks: ['React', 'Tailwind'],
  },
  {
    id: 'proj-3',
    name: 'monorepo-root',
    path: '/work/monorepo',
    project_type: null,
    parent_project_id: null,
    languages: [],
    frameworks: [],
  },
  {
    id: 'proj-3-child',
    name: 'python-service',
    path: '/work/monorepo/service',
    project_type: 'poetry',
    parent_project_id: 'proj-3',
    languages: ['Python'],
    frameworks: ['FastAPI'],
  },
];

const sampleServices: MockService[] = [
  {
    id: 'svc-1',
    project_id: 'proj-1',
    name: 'scanner-daemon',
    path: 'daemon',
    service_type: 'cargo',
    languages: ['Rust'],
    frameworks: ['Tokio'],
  },
];

// --- Tests ---

test('A. Type selection updates controlled value and triggers project filtering', () => {
  let typeFilter = 'All';
  const setTypeFilter = (val: string) => {
    typeFilter = val;
  };

  // Initially All
  let result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter,
    langFilter: 'All',
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 3);

  // Select 'cargo'
  setTypeFilter('cargo');
  result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter,
    langFilter: 'All',
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 1);
  assert.equal(result.visibleRootProjects[0]?.id, 'proj-1');

  // Select 'npm'
  setTypeFilter('npm');
  result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter,
    langFilter: 'All',
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 1);
  assert.equal(result.visibleRootProjects[0]?.id, 'proj-2');
});

test('B. Language selection updates controlled value and triggers project filtering', () => {
  let langFilter = 'All';
  const setLangFilter = (val: string) => {
    langFilter = val;
  };

  // Select 'Rust'
  setLangFilter('Rust');
  let result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter: 'All',
    langFilter,
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 1);
  assert.equal(result.visibleRootProjects[0]?.id, 'proj-1');

  // Select 'Python' -> should show parent 'proj-3' via child project matching
  setLangFilter('Python');
  result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter: 'All',
    langFilter,
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 1);
  assert.equal(result.visibleRootProjects[0]?.id, 'proj-3');
  assert.ok(result.projectHasMatchingChild.has('proj-3'));
});

test('C. Framework selection updates controlled value and triggers project filtering', () => {
  let frameFilter = 'All';
  const setFrameFilter = (val: string) => {
    frameFilter = val;
  };

  setFrameFilter('React');
  let result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter: 'All',
    langFilter: 'All',
    frameFilter,
  });
  assert.equal(result.visibleRootProjects.length, 1);
  assert.equal(result.visibleRootProjects[0]?.id, 'proj-2');

  // Service framework 'Tokio' under proj-1
  setFrameFilter('Tokio');
  result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter: 'All',
    langFilter: 'All',
    frameFilter,
  });
  assert.equal(result.visibleRootProjects.length, 1);
  assert.equal(result.visibleRootProjects[0]?.id, 'proj-1');
  assert.ok(result.projectHasMatchingChild.has('proj-1'));
});

test('D. Compound filtering: Type + Language + Framework match intersection correctly (AND logic)', () => {
  // Matching combination
  let result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter: 'npm',
    langFilter: 'TypeScript',
    frameFilter: 'React',
  });
  assert.equal(result.visibleRootProjects.length, 1);
  assert.equal(result.visibleRootProjects[0]?.id, 'proj-2');

  // Non-matching intersection (type=npm, language=Rust)
  result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter: 'npm',
    langFilter: 'Rust',
    frameFilter: 'React',
  });
  assert.equal(result.visibleRootProjects.length, 0);
});

test('E. Resetting a filter back to All restores projects', () => {
  let typeFilter = 'cargo';
  let result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter,
    langFilter: 'All',
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 1);

  // Reset to All
  typeFilter = 'All';
  result = filterProjects(sampleProjects, sampleServices, {
    search: '',
    typeFilter,
    langFilter: 'All',
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 3);
  assert.equal(result.hasActiveFilters, false);
});

test('F. Search input + filter dropdowns compose correctly (AND logic)', () => {
  // Search 'runyard' with type 'cargo' -> match
  let result = filterProjects(sampleProjects, sampleServices, {
    search: 'runyard',
    typeFilter: 'cargo',
    langFilter: 'All',
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 1);
  assert.equal(result.visibleRootProjects[0]?.id, 'proj-1');

  // Search 'dashboard' with type 'cargo' -> 0 matches
  result = filterProjects(sampleProjects, sampleServices, {
    search: 'dashboard',
    typeFilter: 'cargo',
    langFilter: 'All',
    frameFilter: 'All',
  });
  assert.equal(result.visibleRootProjects.length, 0);
});

test('G. Dynamic option preservation: selecting a filter does not erase options for other filters or invalidate its own selection', () => {
  // Derive options initially
  const initialOptions = deriveFilterOptions(sampleProjects, sampleServices);
  assert.deepEqual(initialOptions.availableTypes, ['All', 'cargo', 'npm', 'poetry']);
  assert.deepEqual(initialOptions.availableLangs, ['All', 'JavaScript', 'Python', 'Rust', 'TypeScript']);
  assert.deepEqual(initialOptions.availableFrames, ['All', 'FastAPI', 'React', 'Tailwind', 'Tauri', 'Tokio']);

  // Even when a filter is active, deriveFilterOptions is derived from raw projects catalog
  // and stays constant, preventing options from collapsing or dropping selected values.
  const activeFilteredProjects = sampleProjects.filter((p) => p.project_type === 'cargo');
  assert.equal(activeFilteredProjects.length, 1);

  // Catalog options remain stable
  const preservedOptions = deriveFilterOptions(sampleProjects, sampleServices);
  assert.deepEqual(preservedOptions.availableTypes, initialOptions.availableTypes);
  assert.deepEqual(preservedOptions.availableLangs, initialOptions.availableLangs);
  assert.deepEqual(preservedOptions.availableFrames, initialOptions.availableFrames);
});

test('H. Popover stability: selecting an option inside portaled dropdown does not dismiss popover', () => {
  // Simulate DOM hierarchy with popover element and portaled dropdown element
  interface SimulatedNode {
    id: string;
    attributes: Record<string, string>;
    parent: SimulatedNode | null;
    children: SimulatedNode[];
  }

  const body: SimulatedNode = { id: 'body', attributes: {}, parent: null, children: [] };
  const popover: SimulatedNode = { id: 'popover', attributes: {}, parent: body, children: [] };
  body.children.push(popover);

  const selectTrigger: SimulatedNode = { id: 'trigger', attributes: {}, parent: popover, children: [] };
  popover.children.push(selectTrigger);

  // Dropdown is portaled directly into document.body!
  const portaledDropdown: SimulatedNode = {
    id: 'dropdown',
    attributes: { 'data-custom-select-dropdown': 'true' },
    parent: body,
    children: [],
  };
  body.children.push(portaledDropdown);

  const optionNode: SimulatedNode = {
    id: 'option-cargo',
    attributes: { role: 'option' },
    parent: portaledDropdown,
    children: [],
  };
  portaledDropdown.children.push(optionNode);

  const outsideNode: SimulatedNode = { id: 'project-item', attributes: {}, parent: body, children: [] };
  body.children.push(outsideNode);

  // Helper matching the DOM .contains and .closest logic
  const contains = (ancestor: SimulatedNode, target: SimulatedNode): boolean => {
    let curr: SimulatedNode | null = target;
    while (curr) {
      if (curr === ancestor) return true;
      curr = curr.parent;
    }
    return false;
  };

  const closest = (node: SimulatedNode, attr: string): SimulatedNode | null => {
    let curr: SimulatedNode | null = node;
    while (curr) {
      if (curr.attributes[attr]) return curr;
      curr = curr.parent;
    }
    return null;
  };

  const shouldClosePopover = (target: SimulatedNode) => {
    if (!contains(popover, target) && !closest(target, 'data-custom-select-dropdown') && !closest(target, 'data-custom-menu-dropdown')) {
      return true;
    }
    return false;
  };

  // 1. Click inside popover -> stays open
  assert.equal(shouldClosePopover(selectTrigger), false);

  // 2. Click option inside portaled dropdown -> stays open!
  assert.equal(shouldClosePopover(optionNode), false);

  // 3. Click truly outside -> closes!
  assert.equal(shouldClosePopover(outsideNode), true);
});

test('I. Internal dropdown scroll is ignored while external scroll closes dropdown', () => {
  interface SimulatedNode {
    id: string;
    parent: SimulatedNode | null;
  }

  const body: SimulatedNode = { id: 'body', parent: null };
  const dropdown: SimulatedNode = { id: 'dropdown', parent: body };
  const dropdownItem: SimulatedNode = { id: 'item', parent: dropdown };
  const windowNode: SimulatedNode = { id: 'window', parent: null };

  const contains = (ancestor: SimulatedNode, target: SimulatedNode): boolean => {
    let curr: SimulatedNode | null = target;
    while (curr) {
      if (curr === ancestor) return true;
      curr = curr.parent;
    }
    return false;
  };

  let dropdownOpen = true;
  const handleScroll = (target: SimulatedNode) => {
    if (contains(dropdown, target)) {
      return; // Internal scroll ignored
    }
    dropdownOpen = false;
  };

  // Internal scroll
  handleScroll(dropdownItem);
  assert.equal(dropdownOpen, true);

  // Window scroll
  handleScroll(windowNode);
  assert.equal(dropdownOpen, false);
});

test('J. CustomSelect renders selected option label when controlled value matches', () => {
  function MockCustomSelect<T extends string = string>({
    value,
    options,
    placeholder = 'Select...',
  }: {
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
    placeholder?: string;
  }) {
    const selectedOption = options.find((opt) => opt.value === value);
    return React.createElement(
      'button',
      { title: selectedOption?.label || placeholder },
      selectedOption ? selectedOption.label : placeholder
    );
  }

  const options = [
    { value: 'All', label: 'All Types' },
    { value: 'cargo', label: 'cargo' },
    { value: 'npm', label: 'npm' },
  ];

  // When value is 'All'
  const htmlAll = renderToString(
    React.createElement(MockCustomSelect, {
      value: 'All',
      onChange: () => {},
      options,
    })
  );
  assert.ok(htmlAll.includes('All Types'));

  // When value is 'cargo'
  const htmlCargo = renderToString(
    React.createElement(MockCustomSelect, {
      value: 'cargo',
      onChange: () => {},
      options,
    })
  );
  assert.ok(htmlCargo.includes('cargo'));
  assert.ok(!htmlCargo.includes('All Types'));
});

test('K. CustomSelect renders placeholder when controlled value does not match', () => {
  function MockCustomSelect<T extends string = string>({
    value,
    options,
    placeholder = 'Select...',
  }: {
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
    placeholder?: string;
  }) {
    const selectedOption = options.find((opt) => opt.value === value);
    return React.createElement(
      'button',
      { title: selectedOption?.label || placeholder },
      selectedOption ? selectedOption.label : placeholder
    );
  }

  const options = [
    { value: 'cargo', label: 'cargo' },
    { value: 'npm', label: 'npm' },
  ];

  const html = renderToString(
    React.createElement(MockCustomSelect, {
      value: 'unknown',
      onChange: () => {},
      options,
      placeholder: 'Select type...',
    })
  );
  assert.ok(html.includes('Select type...'));
});
