import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useScanProjects } from '../hooks/use-projects';
import { useScanRoots, useAddScanRoot, useRemoveScanRoot } from '../hooks/use-settings';
import { useUiStore } from '../stores/ui-store';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectListItem } from '../components/ProjectListItem';
import { SearchInput } from '../components/SearchInput';
import { ImportProjectDialog } from '../components/ImportProjectDialog';
import { LayoutGrid, List, RefreshCw, FolderPlus, FolderKanban, Settings2, Plus, Trash2, X, FolderTree } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const scanProjects = useScanProjects();
  const { data: scanRoots = [] } = useScanRoots();
  const addScanRoot = useAddScanRoot();
  const removeScanRoot = useRemoveScanRoot();
  const { projectViewMode, setProjectViewMode } = useUiStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showScanRootsModal, setShowScanRootsModal] = useState(false);
  const [newScanRootPath, setNewScanRootPath] = useState('');

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    projects.forEach((p) => p.tags.forEach((t) => tags.add(t)));
    return Array.from(tags);
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.path.toLowerCase().includes(search.toLowerCase()) ||
        p.languages.some((l) => l.toLowerCase().includes(search.toLowerCase())) ||
        p.frameworks.some((f) => f.toLowerCase().includes(search.toLowerCase()));

      const matchesFilter =
        filter === 'all' || (filter === 'favorites' && p.is_favorite);

      const matchesTag = !selectedTag || p.tags.includes(selectedTag);

      return matchesSearch && matchesFilter && matchesTag;
    });
  }, [projects, search, filter, selectedTag]);

  const handleAddScanRoot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScanRootPath.trim()) return;
    addScanRoot.mutate(newScanRootPath.trim());
    setNewScanRootPath('');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center">
            <FolderKanban className="w-6 h-6 mr-3 text-emerald-500" />
            Projects
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'} indexed across {scanRoots.length} scan roots
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="w-64">
            <SearchInput value={search} onChange={setSearch} placeholder="Filter projects, tech..." />
          </div>

          <div className="flex bg-zinc-900 rounded-md border border-zinc-800 p-1">
            <button
              onClick={() => setProjectViewMode('grid')}
              className={`p-1.5 rounded-sm transition-colors ${
                projectViewMode === 'grid' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setProjectViewMode('list')}
              className={`p-1.5 rounded-sm transition-colors ${
                projectViewMode === 'list' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowScanRootsModal(true)}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium transition-colors"
            title="Manage Scan Roots"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => scanProjects.mutate()}
            disabled={scanProjects.isPending}
            className="flex items-center px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${scanProjects.isPending ? 'animate-spin' : ''}`} />
            <span>Rescan</span>
          </button>

          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            <span>Import Project</span>
          </button>
        </div>
      </div>

      {/* Tabs & Tag Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-zinc-800 pb-2">
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setFilter('all');
              setSelectedTag(null);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === 'all' && !selectedTag
                ? 'bg-zinc-800 text-emerald-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Projects ({projects.length})
          </button>
          <button
            onClick={() => {
              setFilter('favorites');
              setSelectedTag(null);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === 'favorites'
                ? 'bg-zinc-800 text-amber-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Favorites ({projects.filter((p) => p.is_favorite).length})
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-zinc-500 text-[11px]">Tags:</span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                  selectedTag === tag
                    ? 'bg-emerald-950 border border-emerald-800 text-emerald-300 font-medium'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Projects Content */}
      <div className="flex-1 overflow-auto min-h-0 pb-10">
        {!isLoading && filteredProjects.length === 0 ? (
          <div className="mt-20">
            <EmptyState
              icon={FolderKanban}
              title="No projects found"
              description={
                search || selectedTag
                  ? 'Try adjusting your filters or search query.'
                  : 'Scan configured directories or import an existing project.'
              }
              action={
                !search && !selectedTag
                  ? { label: 'Scan Configured Roots', onClick: () => scanProjects.mutate() }
                  : undefined
              }
            />
          </div>
        ) : projectViewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProjects.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={(projId) => navigate(`/projects/${projId}`)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col space-y-2">
            {filteredProjects.map((p) => (
              <ProjectListItem key={p.id} project={p} onOpen={(projId) => navigate(`/projects/${projId}`)} />
            ))}
          </div>
        )}
      </div>

      {/* Import Project Inspection Dialog */}
      <ImportProjectDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onSuccess={(projId) => navigate(`/projects/${projId}`)}
      />

      {/* Scan Roots Modal */}
      {showScanRootsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Configured Scan Roots</h3>
              </div>
              <button
                onClick={() => setShowScanRootsModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddScanRoot} className="flex gap-2">
              <input
                type="text"
                required
                value={newScanRootPath}
                onChange={(e) => setNewScanRootPath(e.target.value)}
                placeholder="/home/user/workspace"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white rounded-md flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Root</span>
              </button>
            </form>

            <div className="space-y-2 max-h-56 overflow-y-auto pt-2">
              {scanRoots.length === 0 ? (
                <p className="text-xs text-zinc-500 italic p-3 text-center">No scan roots configured.</p>
              ) : (
                scanRoots.map((root) => (
                  <div
                    key={root.id}
                    className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-md flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-zinc-300 truncate max-w-xs">{root.path}</span>
                    <button
                      onClick={() => removeScanRoot.mutate(root.id)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                      title="Remove scan root"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setShowScanRootsModal(false);
                  scanProjects.mutate();
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white rounded-md"
              >
                Rescan Roots
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
