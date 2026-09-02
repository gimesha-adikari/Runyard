import { useProjects } from '../hooks/use-projects';
import { useScanRoots } from '../hooks/use-settings';
import { useUiStore } from '../stores/ui-store';
import { Folder, FolderOpen, Play, Code, ChevronRight, ChevronDown, RefreshCw, Box, FilterX, Settings } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import { Project, Service, ScanRoot } from '../types';
import { tauriApi } from '../lib/tauri';
import { useQuery } from '@tanstack/react-query';

export function ProjectNavigator() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: scanRoots, isLoading: rootsLoading } = useScanRoots();
  const { activeProjectId, setActiveProjectId, activeView, setActiveView } = useUiStore();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [langFilter, setLangFilter] = useState('All');
  const [frameFilter, setFrameFilter] = useState('All');

  const { data: allServices = [] } = useQuery({
    queryKey: ['allServices'],
    queryFn: async () => {
      let svcs: Service[] = [];
      const projs = await tauriApi.getProjects();
      for (const p of projs) {
        const pSvcs = await tauriApi.getProjectServices(p.id);
        svcs.push(...pSvcs);
      }
      return svcs;
    },
    enabled: !!projects
  });

  const toggleNode = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNodes(prev => {
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

  const hasActiveFilters = search || typeFilter !== 'All' || langFilter !== 'All' || frameFilter !== 'All';

  // Dynamic filter lists
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    projects?.forEach(p => { if (p.project_type && p.project_type !== 'Unknown') types.add(p.project_type); });
    allServices.forEach(s => { if (s.service_type && s.service_type !== 'Unknown') types.add(s.service_type); });
    return ['All', ...Array.from(types).sort()];
  }, [projects, allServices]);

  const availableLangs = useMemo(() => {
    const langs = new Set<string>();
    projects?.forEach(p => p.languages.forEach(l => langs.add(l)));
    allServices.forEach(s => s.languages.forEach(l => langs.add(l)));
    return ['All', ...Array.from(langs).sort()];
  }, [projects, allServices]);

  const availableFrames = useMemo(() => {
    const frames = new Set<string>();
    projects?.forEach(p => p.frameworks.forEach(f => frames.add(f)));
    allServices.forEach(s => s.frameworks.forEach(f => frames.add(f)));
    return ['All', ...Array.from(frames).sort()];
  }, [projects, allServices]);

  if (projectsLoading || rootsLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-500">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">Loading...</span>
      </div>
    );
  }

  const matchesFilter = (item: { name: string, project_type?: string | null, service_type?: string | null, languages: string[], frameworks: string[] }) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    const type = item.project_type || item.service_type;
    if (typeFilter !== 'All' && type !== typeFilter) return false;
    if (langFilter !== 'All' && !item.languages.includes(langFilter)) return false;
    if (frameFilter !== 'All' && !item.frameworks.includes(frameFilter)) return false;
    return true;
  };

  // Group by roots and handle parent/child
  const rootGroups: Record<string, Project[]> = {};
  const ungrouped: Project[] = [];
  
  // First, map which projects have children that match the filter so we can keep the parent visible
  const projectHasMatchingChild = new Set<string>();
  const allSubprojects = projects?.filter(p => p.parent_project_id) || [];
  
  // check services
  allServices.forEach(s => {
    if (matchesFilter(s)) {
      projectHasMatchingChild.add(s.project_id);
    }
  });
  // check subprojects
  allSubprojects.forEach(sub => {
    if (matchesFilter(sub) || projectHasMatchingChild.has(sub.id)) {
      if (sub.parent_project_id) projectHasMatchingChild.add(sub.parent_project_id);
    }
  });

  const topLevelProjects = projects?.filter(p => !p.parent_project_id) || [];

  topLevelProjects.forEach(p => {
    // If there is an active filter, hide non-matching projects UNLESS they have a matching child
    if (hasActiveFilters && !matchesFilter(p) && !projectHasMatchingChild.has(p.id)) return;

    const root = scanRoots?.find((r: ScanRoot) => p.path.startsWith(r.path));
    if (root) {
      if (!rootGroups[root.id]) rootGroups[root.id] = [];
      rootGroups[root.id]!.push(p);
      // Auto-expand roots if filtering
      if (hasActiveFilters && !expandedNodes.has(root.id)) {
        setExpandedNodes(prev => new Set(prev).add(root.id));
      }
    } else {
      ungrouped.push(p);
    }
    // Auto-expand project if it has matching children
    if (hasActiveFilters && projectHasMatchingChild.has(p.id) && !expandedNodes.has(p.id)) {
      setExpandedNodes(prev => new Set(prev).add(p.id));
    }
  });

  const renderServiceNode = (svc: Service) => {
    if (hasActiveFilters && !matchesFilter(svc)) return null;
    return (
      <div key={svc.id} className="w-full flex items-center gap-2 px-2 py-1 text-xs text-left text-zinc-400 pl-8 group hover:bg-zinc-800/50 transition-colors cursor-default">
        {svc.is_runnable ? <Play className="w-3.5 h-3.5 shrink-0 opacity-50 group-hover:opacity-100 text-emerald-500" /> : <Box className="w-3.5 h-3.5 shrink-0 opacity-50 group-hover:opacity-100" />}
        <span className="truncate flex-1">{svc.name}</span>
        {svc.service_type && svc.service_type !== 'Unknown' && (
            <span className="text-[9px] text-zinc-500 border border-zinc-800 px-1 rounded truncate max-w-[60px]">{svc.service_type}</span>
        )}
      </div>
    );
  };

  const renderProjectNode = (p: Project, depth: number = 0) => {
    if (hasActiveFilters && !matchesFilter(p) && !projectHasMatchingChild.has(p.id)) return null;

    const isActive = activeProjectId === p.id;
    const pSvcs = allServices.filter(s => s.project_id === p.id);
    const pSubprojs = allSubprojects.filter(sub => sub.parent_project_id === p.id);
    const hasChildren = pSvcs.length > 0 || pSubprojs.length > 0;
    const isExpanded = expandedNodes.has(p.id);

    // Auto-expand subprojects if they have matching children
    if (hasActiveFilters && projectHasMatchingChild.has(p.id) && !expandedNodes.has(p.id)) {
       setTimeout(() => setExpandedNodes(prev => new Set(prev).add(p.id)), 0);
    }

    const pl = depth === 0 ? "pl-2" : "pl-6";

    return (
      <div key={p.id} className="w-full flex flex-col">
        <button
          onClick={() => setActiveProjectId(p.id)}
          className={cn(
            "w-full flex items-center gap-1.5 py-1 text-xs text-left transition-colors",
            pl,
            isActive ? "bg-emerald-900/30 text-emerald-400" : "text-zinc-300 hover:bg-zinc-800"
          )}
        >
          {hasChildren ? (
            <div onClick={(e) => toggleNode(p.id, e)} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200">
               {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </div>
          ) : (
            <div className="w-4 h-4" />
          )}
          {p.is_runnable ? <Play className="w-3 h-3 shrink-0 opacity-70 text-emerald-500" /> : <Code className="w-3.5 h-3.5 shrink-0 opacity-70" />}
          <span className="truncate flex-1 font-medium">{p.name}</span>
          <div className="flex gap-1 pr-2">
            {p.has_git && <span className="text-[9px] text-purple-400 border border-purple-900/50 px-1 rounded">Git</span>}
            {p.project_type && p.project_type !== 'Unknown' && <span className="text-[9px] text-zinc-500 border border-zinc-800 px-1 rounded truncate max-w-[50px]">{p.project_type}</span>}
          </div>
        </button>
        {isExpanded && hasChildren && (
            <div className="flex flex-col">
                {pSubprojs.map(sub => renderProjectNode(sub, depth + 1))}
                {pSvcs.map(renderServiceNode)}
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden bg-[#111]">
      {/* Top Activity Icons */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-zinc-800/80 bg-zinc-950 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveView('projects')} className={`p-1.5 rounded transition-colors ${activeView === 'projects' ? 'text-emerald-400 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'}`} title="Projects">
            <Folder className="w-4 h-4" />
          </button>
          <button onClick={() => setActiveView('running')} className={`p-1.5 rounded transition-colors ${activeView === 'running' ? 'text-emerald-400 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'}`} title="Running">
            <Play className="w-4 h-4" />
          </button>
        </div>
        <button onClick={() => setActiveView('settings')} className={`p-1.5 rounded transition-colors ${activeView === 'settings' ? 'text-emerald-400 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'}`} title="Settings">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/50 sticky top-0 z-10 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          <span>Explorer</span>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 bg-zinc-800 px-1.5 py-0.5 rounded">
              <FilterX className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
        
        <input 
          type="text" 
          placeholder="Search projects..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none">
            {availableTypes.map(t => <option key={t} value={t}>{t === 'All' ? 'Type' : t}</option>)}
          </select>
          <select value={langFilter} onChange={e => setLangFilter(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none">
            {availableLangs.map(l => <option key={l} value={l}>{l === 'All' ? 'Lang' : l}</option>)}
          </select>
          <select value={frameFilter} onChange={e => setFrameFilter(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none">
            {availableFrames.map(f => <option key={f} value={f}>{f === 'All' ? 'Frame' : f}</option>)}
          </select>
        </div>
      </div>
      
      <div className="py-2">
        {scanRoots?.map((root: ScanRoot) => {
          const rootProjects = rootGroups[root.id] || [];
          if (rootProjects.length === 0 && hasActiveFilters) return null;
          
          const isExpanded = expandedNodes.has(root.id);
          const rootName = root.path.split(/[\\/]/).pop() || root.path;
          
          return (
            <div key={root.id}>
              <button
                onClick={(e) => toggleNode(root.id, e)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                {isExpanded ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-emerald-500" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-zinc-500" />}
                <span className="truncate uppercase text-[10px] tracking-wider">{rootName}</span>
              </button>
              
              {isExpanded && (
                <div className="flex flex-col py-0.5">
                  {rootProjects.length === 0 ? (
                    <div className="px-6 py-1 text-[10px] text-zinc-500 italic">No projects found</div>
                  ) : (
                    rootProjects.map(p => renderProjectNode(p, 0))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div className="mt-4">
            <div className="px-4 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Other Projects
            </div>
            <div className="flex flex-col">
              {ungrouped.map(p => renderProjectNode(p, 0))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
