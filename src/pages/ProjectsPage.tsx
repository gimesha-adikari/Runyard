import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useScanProjects, useImportProject } from '../hooks/use-projects';
import { useUiStore } from '../stores/ui-store';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectListItem } from '../components/ProjectListItem';
import { SearchInput } from '../components/SearchInput';
import { LayoutGrid, List, RefreshCw, FolderPlus, FolderKanban } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const scanProjects = useScanProjects();
  const importProject = useImportProject();
  const { projectViewMode, setProjectViewMode } = useUiStore();
  
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                            p.path.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || (filter === 'favorites' && p.is_favorite);
      return matchesSearch && matchesFilter;
    });
  }, [projects, search, filter]);

  const handleImport = () => {
    const path = prompt("Enter full path to import:");
    if (path) {
      importProject.mutate(path);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center">
          <FolderKanban className="w-6 h-6 mr-3 text-emerald-500" />
          Projects
        </h1>
        
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="w-64">
            <SearchInput value={search} onChange={setSearch} placeholder="Filter projects..." />
          </div>
          
          <div className="flex bg-zinc-900 rounded-md border border-zinc-800 p-1">
            <button
              onClick={() => setProjectViewMode('grid')}
              className={`p-1.5 rounded-sm transition-colors ${projectViewMode === 'grid' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setProjectViewMode('list')}
              className={`p-1.5 rounded-sm transition-colors ${projectViewMode === 'list' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => scanProjects.mutate()}
            disabled={scanProjects.isPending}
            className="flex items-center px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${scanProjects.isPending ? 'animate-spin' : ''}`} />
            Scan
          </button>
          
          <button
            onClick={handleImport}
            className="flex items-center px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            Import
          </button>
        </div>
      </div>

      <div className="flex space-x-4 mb-6 border-b border-zinc-800">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${filter === 'all' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          All Projects ({projects.length})
        </button>
        <button
          onClick={() => setFilter('favorites')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${filter === 'favorites' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          Favorites
        </button>
      </div>

      <div className="flex-1 overflow-auto min-h-0 pb-10">
        {!isLoading && filteredProjects.length === 0 ? (
          <div className="mt-20">
            <EmptyState 
              icon={FolderKanban} 
              title="No projects found" 
              description={search ? "Try adjusting your search query." : "Scan for projects or import one manually."}
              action={!search ? { label: "Scan Now", onClick: () => scanProjects.mutate() } : undefined}
            />
          </div>
        ) : (
          projectViewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map(p => (
                <ProjectCard key={p.id} project={p} onOpen={(id) => navigate(`/projects/${id}`)} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col space-y-2">
              {filteredProjects.map(p => (
                <ProjectListItem key={p.id} project={p} onOpen={(id) => navigate(`/projects/${id}`)} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
