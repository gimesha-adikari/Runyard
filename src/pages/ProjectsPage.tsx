import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProjects, useScanProjects, useRemoveProject } from '../hooks/use-projects';
import { useScanRoots, useAddScanRoot, useRemoveScanRoot } from '../hooks/use-settings';
import { useUiStore } from '../stores/ui-store';
import { toast } from '../stores/toast-store';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectListItem } from '../components/ProjectListItem';
import { SearchInput } from '../components/SearchInput';
import { ImportProjectDialog } from '../components/ImportProjectDialog';
import { EmptyState } from '../components/EmptyState';
import { Project } from '../types';
import {
  LayoutGrid,
  List,
  RefreshCw,
  FolderPlus,
  FolderKanban,
  Settings2,
  Plus,
  Trash2,
  X,
  FolderTree,
  AlertTriangle,
  ArrowUpDown,
} from 'lucide-react';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: projects = [], isLoading } = useProjects();
  const scanProjects = useScanProjects();
  const removeProject = useRemoveProject();
  const { data: scanRoots = [] } = useScanRoots();
  const addScanRoot = useAddScanRoot();
  const removeScanRoot = useRemoveScanRoot();

  const {
    projectViewMode,
    setProjectViewMode,
    projectSortBy,
    setProjectSortBy,
  } = useUiStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showScanRootsModal, setShowScanRootsModal] = useState(false);
  const [newScanRootPath, setNewScanRootPath] = useState('');
  const [projectToRemove, setProjectToRemove] = useState<Project | null>(null);

  // Check if ?action=import is passed via URL
  useEffect(() => {
    if (searchParams.get('action') === 'import') {
      setShowImportDialog(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    projects.forEach((p) => p.tags.forEach((t) => tags.add(t)));
    return Array.from(tags);
  }, [projects]);

  const filteredAndSortedProjects = useMemo(() => {
    const filtered = projects.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.path.toLowerCase().includes(search.toLowerCase()) ||
        p.languages.some((l) => l.toLowerCase().includes(search.toLowerCase())) ||
        p.frameworks.some((f) => f.toLowerCase().includes(search.toLowerCase()));

      const matchesFilter = filter === 'all' || (filter === 'favorites' && p.is_favorite);
      const matchesTag = !selectedTag || p.tags.includes(selectedTag);

      return matchesSearch && matchesFilter && matchesTag;
    });

    return filtered.sort((a, b) => {
      if (projectSortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (projectSortBy === 'last_opened') {
        const timeA = a.last_opened ? new Date(a.last_opened).getTime() : 0;
        const timeB = b.last_opened ? new Date(b.last_opened).getTime() : 0;
        return timeB - timeA;
      }
      if (projectSortBy === 'last_run') {
        const timeA = a.last_run ? new Date(a.last_run).getTime() : 0;
        const timeB = b.last_run ? new Date(b.last_run).getTime() : 0;
        return timeB - timeA;
      }
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return timeB - timeA;
    });
  }, [projects, search, filter, selectedTag, projectSortBy]);

  const handleScan = async () => {
    try {
      await scanProjects.mutateAsync();
      toast.success('Projects scan completed');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to scan projects');
    }
  };

  const handleAddScanRoot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScanRootPath.trim()) return;
    try {
      await addScanRoot.mutateAsync(newScanRootPath.trim());
      toast.success('Added scan root');
      setNewScanRootPath('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add scan root');
    }
  };

  const handleConfirmRemove = async () => {
    if (!projectToRemove) return;
    try {
      await removeProject.mutateAsync(projectToRemove.id);
      toast.info(`Removed '${projectToRemove.name}' from Runyard`);
      setProjectToRemove(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove project');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full h-full flex flex-col space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center">
            <FolderKanban className="w-5 h-5 mr-2 text-emerald-500" />
            Projects
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'} indexed across{' '}
            {scanRoots.length} scan roots
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <div className="w-56 min-w-[180px]">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search projects, tech..."
            />
          </div>

          <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-800 p-1">
            <button
              onClick={() => setProjectViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${
                projectViewMode === 'grid'
                  ? 'bg-zinc-800 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setProjectViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                projectViewMode === 'list'
                  ? 'bg-zinc-800 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="List View"
              aria-label="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={projectSortBy}
              onChange={(e) => setProjectSortBy(e.target.value as any)}
              className="bg-transparent border-none text-zinc-300 text-xs focus:outline-none cursor-pointer"
            >
              <option value="last_opened" className="bg-zinc-900">Recently Opened</option>
              <option value="name" className="bg-zinc-900">Alphabetical</option>
              <option value="last_run" className="bg-zinc-900">Recently Run</option>
              <option value="created_at" className="bg-zinc-900">Date Added</option>
            </select>
          </div>

          <button
            onClick={() => setShowScanRootsModal(true)}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
            title="Manage Scan Roots"
            aria-label="Manage Scan Roots"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleScan}
            disabled={scanProjects.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanProjects.isPending ? 'animate-spin' : ''}`} />
            <span>Rescan</span>
          </button>

          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Import Project</span>
          </button>
        </div>
      </div>

      {/* Tabs & Tag Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-2.5">
        <div className="flex space-x-1.5">
          <button
            onClick={() => {
              setFilter('all');
              setSelectedTag(null);
            }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
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
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === 'favorites'
                ? 'bg-zinc-800 text-amber-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Favorites ({projects.filter((p) => p.is_favorite).length})
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs overflow-x-auto max-w-full">
            <span className="text-zinc-500 text-[11px] shrink-0">Tags:</span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors shrink-0 ${
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

      {/* Projects Grid/List Content */}
      <div className="flex-1 overflow-auto min-h-0 pb-6">
        {!isLoading && filteredAndSortedProjects.length === 0 ? (
          <div className="mt-16">
            <EmptyState
              icon={FolderKanban}
              title={search || selectedTag ? 'No matching projects found' : 'No projects registered'}
              description={
                search || selectedTag
                  ? 'Try adjusting your filters or search terms.'
                  : 'Add a scan root directory or import an existing project folder.'
              }
              action={
                !search && !selectedTag
                  ? { label: 'Import Project', onClick: () => setShowImportDialog(true) }
                  : undefined
              }
            />
          </div>
        ) : projectViewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAndSortedProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={(projId) => navigate(`/projects/${projId}`)}
                onRemove={(proj) => setProjectToRemove(proj)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col space-y-2">
            {filteredAndSortedProjects.map((p) => (
              <ProjectListItem
                key={p.id}
                project={p}
                onOpen={(projId) => navigate(`/projects/${projId}`)}
                onRemove={(proj) => setProjectToRemove(proj)}
              />
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
          onClick={() => setShowScanRootsModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Project Scan Roots</h3>
              </div>
              <button
                onClick={() => setShowScanRootsModal(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Directories monitored by Runyard when rescanning for developer projects.
            </p>

            <form onSubmit={handleAddScanRoot} className="flex gap-2">
              <input
                type="text"
                required
                value={newScanRootPath}
                onChange={(e) => setNewScanRootPath(e.target.value)}
                placeholder="/home/user/workspace"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={addScanRoot.isPending || !newScanRootPath.trim()}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white rounded-md flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Root</span>
              </button>
            </form>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pt-1">
              {scanRoots.length === 0 ? (
                <p className="text-xs text-zinc-500 italic p-4 text-center bg-zinc-950/60 rounded-md border border-zinc-800">
                  No scan roots configured. Add a directory path above.
                </p>
              ) : (
                scanRoots.map((root) => (
                  <div
                    key={root.id}
                    className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-md flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-zinc-300 truncate max-w-sm">{root.path}</span>
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

            <div className="flex justify-end pt-3 border-t border-zinc-800 gap-2">
              <button
                type="button"
                onClick={() => setShowScanRootsModal(false)}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 rounded-md"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowScanRootsModal(false);
                  handleScan();
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white rounded-md flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Rescan Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Remove Project Confirmation Modal */}
      {projectToRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
          onClick={() => setProjectToRemove(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-semibold text-zinc-100">Remove from Runyard</h3>
            </div>
            <p className="text-xs text-zinc-300">
              Are you sure you want to remove <span className="font-semibold text-zinc-100">'{projectToRemove.name}'</span> from Runyard?
            </p>
            <p className="text-[11px] text-zinc-400 bg-zinc-950 p-2.5 rounded border border-zinc-800">
              Note: This will only remove the project from Runyard's catalog. Your files and Git repository on disk will <span className="text-emerald-400 font-semibold">NOT</span> be deleted.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setProjectToRemove(null)}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                className="px-3.5 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-medium rounded-md"
              >
                Remove Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
