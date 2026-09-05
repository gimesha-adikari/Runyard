import { useProjects } from '../hooks/use-projects';
import { useScanRoots } from '../hooks/use-settings';
import { useScanProgress } from '../hooks/use-scan-progress';
import { useUiStore } from '../stores/ui-store';
import { useProcesses } from '../hooks/use-processes';
import {
  Folder,
  FolderOpen,
  Play,
  Code,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Box,
  Filter,
  FilterX,
  X,
} from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { cn, isPathAncestorOrEqual } from '../lib/utils';
import { Project, Service, ScanRoot } from '../types';
import { tauriApi } from '../lib/tauri';
import { useQuery } from '@tanstack/react-query';
import { CustomSelect } from './common/CustomSelect';

export function ProjectNavigator() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: scanRoots, isLoading: rootsLoading } = useScanRoots();
  const { getRootProgress } = useScanProgress();
  const { data: processes } = useProcesses();
  const { activeProjectId, setActiveProjectId, explorerWidth } = useUiStore();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-expand ancestors of activeProjectId so active subprojects stay visible in the tree
  useEffect(() => {
    if (!activeProjectId || !projects) return;
    const ancestorsToExpand: string[] = [];
    let current = projects.find((p) => p.id === activeProjectId);
    while (current?.parent_project_id) {
      ancestorsToExpand.push(current.parent_project_id);
      current = projects.find((p) => p.id === current?.parent_project_id);
    }
    if (ancestorsToExpand.length > 0) {
      setExpandedNodes((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of ancestorsToExpand) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [activeProjectId, projects]);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [langFilter, setLangFilter] = useState('All');
  const [frameFilter, setFrameFilter] = useState('All');
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // Close filter popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(target) &&
        !target.closest('[data-custom-select-dropdown]') &&
        !target.closest('[data-custom-menu-dropdown]')
      ) {
        setShowFilterPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close filter popover on Escape if no custom dropdown is open
  useEffect(() => {
    if (!showFilterPopover) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!document.querySelector('[data-custom-select-dropdown]')) {
          setShowFilterPopover(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFilterPopover]);

  const { data: allServices = [] } = useQuery({
    queryKey: ['allServices'],
    queryFn: async () => {
      const svcs: Service[] = [];
      const projs = await tauriApi.getProjects();
      for (const p of projs) {
        const pSvcs = await tauriApi.getProjectServices(p.id);
        svcs.push(...pSvcs);
      }
      return svcs;
    },
    enabled: !!projects,
  });

  const toggleNode = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('All');
    setLangFilter('All');
    setFrameFilter('All');
  };

  const activeFilterCount =
    (typeFilter !== 'All' ? 1 : 0) +
    (langFilter !== 'All' ? 1 : 0) +
    (frameFilter !== 'All' ? 1 : 0);
  const hasActiveFilters = search || activeFilterCount > 0;

  // Dynamic filter lists
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    projects?.forEach((p) => {
      if (p.project_type && p.project_type !== 'Unknown') types.add(p.project_type);
    });
    allServices.forEach((s) => {
      if (s.service_type && s.service_type !== 'Unknown') types.add(s.service_type);
    });
    return ['All', ...Array.from(types).sort()];
  }, [projects, allServices]);

  const availableLangs = useMemo(() => {
    const langs = new Set<string>();
    projects?.forEach((p) => (p.languages || []).forEach((l) => langs.add(l)));
    allServices.forEach((s) => (s.languages || []).forEach((l) => langs.add(l)));
    return ['All', ...Array.from(langs).sort()];
  }, [projects, allServices]);

  const availableFrames = useMemo(() => {
    const frames = new Set<string>();
    projects?.forEach((p) => (p.frameworks || []).forEach((f) => frames.add(f)));
    allServices.forEach((s) => (s.frameworks || []).forEach((f) => frames.add(f)));
    return ['All', ...Array.from(frames).sort()];
  }, [projects, allServices]);

  const runningProjectIds = useMemo(() => {
    const running = new Set<string>();
    processes?.forEach((proc) => {
      if (proc.status === 'Running' || proc.status === 'Starting') {
        running.add(proc.project_id);
      }
    });
    return running;
  }, [processes]);

  if (projectsLoading || rootsLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-500">
        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
        <span className="text-xs font-mono">Scanning...</span>
      </div>
    );
  }

  const matchesFilter = (item: {
    name: string;
    project_type?: string | null;
    service_type?: string | null;
    languages?: string[];
    frameworks?: string[];
  }) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    const type = item.project_type || item.service_type;
    if (typeFilter !== 'All' && type !== typeFilter) return false;
    if (langFilter !== 'All' && !(item.languages || []).includes(langFilter)) return false;
    if (frameFilter !== 'All' && !(item.frameworks || []).includes(frameFilter)) return false;
    return true;
  };

  // Group by roots and handle parent/child
  const rootGroups: Record<string, Project[]> = {};
  const ungrouped: Project[] = [];

  const allSubprojects = projects?.filter((p) => p.parent_project_id) || [];
  const projectHasMatchingChild = new Set<string>();

  if (hasActiveFilters) {
    allServices.forEach((s) => {
      if (matchesFilter(s)) projectHasMatchingChild.add(s.project_id);
    });
    allSubprojects.forEach((sub) => {
      if (matchesFilter(sub) && sub.parent_project_id) {
        projectHasMatchingChild.add(sub.parent_project_id);
      }
    });
    // Bubble up to any ancestor projects
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

  projects
    ?.filter((p) => !p.parent_project_id)
    .forEach((p) => {
      if (!matchesFilter(p) && !projectHasMatchingChild.has(p.id)) return;

      let matchedRoot = false;
      for (const root of scanRoots || []) {
        if (isPathAncestorOrEqual(root.path, p.path)) {
          if (!rootGroups[root.id]) rootGroups[root.id] = [];
          rootGroups[root.id]!.push(p);
          matchedRoot = true;
          break;
        }
      }
      if (!matchedRoot && p.source === 'Manual') {
        ungrouped.push(p);
      }
    });

  const isNarrow = explorerWidth < 255;

  const renderServiceNode = (svc: Service, depth: number = 1) => {
    if (hasActiveFilters && !matchesFilter(svc)) return null;
    return (
      <div
        key={svc.id}
        title={svc.name}
        style={{ paddingLeft: `${8 + depth * 14 + 14}px` }}
        className="w-full flex items-center gap-1.5 pr-2 py-1 text-xs text-left text-zinc-400 group hover:bg-[#141418] hover:text-zinc-200 transition-colors duration-fast cursor-default select-none"
      >
        {svc.is_runnable ? (
          <Play className="w-3 h-3 shrink-0 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
        ) : (
          <Box className="w-3 h-3 shrink-0 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
        )}
        <span className="truncate flex-1 text-[11px] font-mono text-zinc-400 group-hover:text-zinc-200">
          {svc.name}
        </span>
        {svc.service_type && svc.service_type !== 'Unknown' && (
          <span className="text-[9px] text-zinc-500 border border-zinc-800/80 px-1 rounded-[2px] truncate max-w-[55px] shrink-0 font-mono">
            {svc.service_type}
          </span>
        )}
      </div>
    );
  };

  const renderProjectNode = (p: Project, depth: number = 0) => {
    if (hasActiveFilters && !matchesFilter(p) && !projectHasMatchingChild.has(p.id)) {
      return null;
    }

    const isActive = activeProjectId === p.id;
    const isRunning = runningProjectIds.has(p.id);
    const pSubprojs = allSubprojects.filter((sub) => sub.parent_project_id === p.id);
    const pSvcs = allServices.filter((s) => s.project_id === p.id);

    // De-duplicate: only filter out services that correspond to the exact same filesystem module as a subproject
    const normalizePath = (pStr: string) =>
      pStr.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');

    const filteredSvcs = pSvcs.filter((svc) => {
      const normParent = normalizePath(p.path);
      const normSvc = svc.path.startsWith('/')
        ? normalizePath(svc.path)
        : normalizePath(`${normParent}/${svc.path}`);

      return !pSubprojs.some((sub) => {
        const normSub = normalizePath(sub.path);
        return normSub === normSvc || normSub.endsWith('/' + normalizePath(svc.path));
      });
    });

    const hasChildren = filteredSvcs.length > 0 || pSubprojs.length > 0;
    const isExpanded = expandedNodes.has(p.id);

    if (hasActiveFilters && projectHasMatchingChild.has(p.id) && !expandedNodes.has(p.id)) {
      setTimeout(() => setExpandedNodes((prev) => new Set(prev).add(p.id)), 0);
    }

    return (
      <div key={p.id} className="w-full flex flex-col">
        <div
          style={{ paddingLeft: `${6 + depth * 14}px` }}
          className={cn(
            'relative w-full flex items-center gap-1 py-0.5 text-xs transition-colors duration-fast select-none group',
            isActive
              ? 'bg-[#18181e] text-emerald-300 font-medium'
              : 'text-zinc-300 hover:bg-[#141418] hover:text-zinc-100'
          )}
        >
          {/* Active project left accent bar */}
          {isActive && (
            <span className="absolute left-0 top-0.5 bottom-0.5 w-[2px] bg-emerald-500 rounded-r" />
          )}

          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => toggleNode(p.id, e)}
              className="p-0.5 hover:bg-zinc-800/80 rounded-[2px] text-zinc-500 hover:text-zinc-300 shrink-0 transition-colors focus:outline-none"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronRight
                className={cn(
                  'w-3 h-3 transition-transform duration-fast ease-standard',
                  isExpanded && 'rotate-90 text-zinc-300'
                )}
              />
            </button>
          ) : (
            <div className="w-4 h-4 shrink-0" />
          )}

          <button
            type="button"
            onClick={() => setActiveProjectId(p.id)}
            title={`${p.name} (${p.path})`}
            className="flex-1 flex items-center gap-1.5 min-w-0 py-0.5 pr-2 text-left focus:outline-none cursor-pointer"
          >
            {/* Running status indicator */}
            {isRunning ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            ) : (
              <Code
                className={cn(
                  'w-3.5 h-3.5 shrink-0 transition-colors',
                  isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-400'
                )}
              />
            )}

            <span className="truncate flex-1 text-[12px]">{p.name}</span>

            <div className="flex items-center gap-1 shrink-0">
              {p.has_git && (
                <span className="text-[9px] text-purple-400/90 border border-purple-900/50 px-1 rounded-[2px] font-mono">
                  Git
                </span>
              )}
              {p.project_type && p.project_type !== 'Unknown' && (
                <span className="text-[9px] text-zinc-500 border border-zinc-800/80 px-1 rounded-[2px] truncate max-w-[50px] font-mono">
                  {p.project_type}
                </span>
              )}
            </div>
          </button>
        </div>

        {isExpanded && hasChildren && (
          <div className="flex flex-col">
            {pSubprojs.map((sub) => renderProjectNode(sub, depth + 1))}
            {filteredSvcs.map((svc) => renderServiceNode(svc, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden bg-[#0e0e11] text-zinc-300 select-none">
      {/* Search & Filter Header */}
      <div className="p-2 border-b border-[#1b1b20] bg-[#0c0c0e] sticky top-0 z-10 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          <span>Explorer</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 bg-zinc-800/80 hover:bg-zinc-800 px-1.5 py-0.5 rounded-[2px] btn-tactile transition-colors duration-fast"
            >
              <FilterX className="w-2.5 h-2.5" /> Clear
            </button>
          )}
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#141418] border border-zinc-800/80 rounded-[3px] px-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all duration-fast"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1.5 text-zinc-500 hover:text-zinc-300 btn-tactile transition-colors duration-fast"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Responsive Filters: Wide vs Narrow Popover */}
        {isNarrow ? (
          <div className="relative" ref={filterPopoverRef}>
            <button
              type="button"
              onClick={() => setShowFilterPopover(!showFilterPopover)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1 bg-[#141418] hover:bg-[#1b1b22] border rounded-[3px] text-[11px] btn-tactile transition-colors duration-fast',
                activeFilterCount > 0
                  ? 'border-emerald-500/50 text-emerald-400'
                  : 'border-zinc-800 text-zinc-400'
              )}
            >
              <div className="flex items-center gap-1.5">
                <Filter className="w-3 h-3" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="px-1 py-0.2 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-mono">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showFilterPopover && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#141418] border border-zinc-700/80 rounded-[4px] shadow-2xl p-2.5 z-50 flex flex-col gap-2 text-xs menu-entrance">
                <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
                  <span className="font-semibold text-zinc-300 text-[11px]">Filter By</span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="text-emerald-400 hover:text-emerald-300 text-[10px]"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Type</label>
                  <CustomSelect
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={availableTypes.map((t) => ({
                      value: t,
                      label: t === 'All' ? 'All Types' : t,
                    }))}
                    placeholder="All Types"
                    className="w-full"
                    buttonClassName="w-full bg-[#0c0c0e]"
                    size="sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Language</label>
                  <CustomSelect
                    value={langFilter}
                    onChange={setLangFilter}
                    options={availableLangs.map((l) => ({
                      value: l,
                      label: l === 'All' ? 'All Languages' : l,
                    }))}
                    placeholder="All Languages"
                    className="w-full"
                    buttonClassName="w-full bg-[#0c0c0e]"
                    size="sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Framework</label>
                  <CustomSelect
                    value={frameFilter}
                    onChange={setFrameFilter}
                    options={availableFrames.map((f) => ({
                      value: f,
                      label: f === 'All' ? 'All Frameworks' : f,
                    }))}
                    placeholder="All Frameworks"
                    className="w-full"
                    buttonClassName="w-full bg-[#0c0c0e]"
                    size="sm"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            <CustomSelect
              value={typeFilter}
              onChange={setTypeFilter}
              options={availableTypes.map((t) => ({
                value: t,
                label: t === 'All' ? 'Type' : t,
              }))}
              placeholder="Type"
              className="w-full"
              buttonClassName={cn(
                'w-full px-1 text-[10px] h-6.5 justify-between',
                typeFilter !== 'All' ? 'border-emerald-500/50 text-emerald-400 font-medium' : ''
              )}
              size="xs"
            />

            <CustomSelect
              value={langFilter}
              onChange={setLangFilter}
              options={availableLangs.map((l) => ({
                value: l,
                label: l === 'All' ? 'Lang' : l,
              }))}
              placeholder="Lang"
              className="w-full"
              buttonClassName={cn(
                'w-full px-1 text-[10px] h-6.5 justify-between',
                langFilter !== 'All' ? 'border-emerald-500/50 text-emerald-400 font-medium' : ''
              )}
              size="xs"
            />

            <CustomSelect
              value={frameFilter}
              onChange={setFrameFilter}
              options={availableFrames.map((f) => ({
                value: f,
                label: f === 'All' ? 'Frame' : f,
              }))}
              placeholder="Frame"
              className="w-full"
              buttonClassName={cn(
                'w-full px-1 text-[10px] h-6.5 justify-between',
                frameFilter !== 'All' ? 'border-emerald-500/50 text-emerald-400 font-medium' : ''
              )}
              size="xs"
            />
          </div>
        )}
      </div>

      {/* Tree Content */}
      <div className="py-1">
        {scanRoots?.map((root: ScanRoot) => {
          const rootProjects = rootGroups[root.id] || [];
          const prog = getRootProgress(root.id);
          const isScanningThis = prog?.state === 'scanning' || prog?.state === 'queued';

          if (rootProjects.length === 0 && hasActiveFilters && !isScanningThis) return null;

          const isExpanded = expandedNodes.has(root.id);
          const rootName = root.path.split(/[\\/]/).pop() || root.path;

          return (
            <div key={root.id} className="mb-0.5">
              <button
                type="button"
                onClick={(e) => toggleNode(root.id, e)}
                title={root.path}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-[#141418] transition-colors duration-fast select-none group"
              >
                <ChevronRight
                  className={cn(
                    'w-3.5 h-3.5 shrink-0 transition-transform duration-fast ease-standard text-zinc-500 group-hover:text-zinc-400',
                    isExpanded && 'rotate-90 text-zinc-300'
                  )}
                />
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 shrink-0 text-emerald-400/90 transition-colors duration-fast" />
                ) : (
                  <Folder className="w-3.5 h-3.5 shrink-0 text-zinc-500 transition-colors duration-fast" />
                )}
                <span className="truncate uppercase text-[10px] tracking-wider font-mono text-zinc-400 group-hover:text-zinc-200">
                  {rootName}
                </span>
                {isScanningThis && (
                  <span className="ml-auto mr-1 flex items-center gap-1 text-[9px] text-emerald-400 font-mono">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin text-emerald-400" />
                    <span>{prog?.state === 'queued' ? 'QUEUED' : `${prog?.projects_found || 0}`}</span>
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="flex flex-col py-0.5">
                  {isScanningThis && (
                    <div className="flex items-center gap-1.5 px-6 py-1 text-[10px] text-emerald-400 font-mono bg-emerald-950/20 border-b border-emerald-900/20 mb-0.5">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-emerald-400 shrink-0" />
                      <span>
                        {prog?.state === 'queued'
                          ? 'Queued for scanning…'
                          : `Scanning… ${prog?.projects_found || 0} found`}
                      </span>
                    </div>
                  )}
                  {rootProjects.length === 0 && !isScanningThis ? (
                    <div className="px-6 py-1 text-[11px] text-zinc-500 italic">
                      No projects found
                    </div>
                  ) : (
                    rootProjects.map((p) => renderProjectNode(p, 0))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div className="mt-3">
            <div className="px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
              Other Projects
            </div>
            <div className="flex flex-col">
              {ungrouped.map((p) => renderProjectNode(p, 0))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
