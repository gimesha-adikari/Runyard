# Frontend -> Runtime Integration Requests & Observations

This document records runtime capabilities, additive APIs, and integration observations identified during Track B (Frontend/Product UX) development.

---

### Request 1: Native Folder Picker Dialog for Project Import & Scan Roots
- **Required Behavior**: Enable users to click "Browse..." to select a local folder via the native OS file picker dialog instead of manual text entry.
- **Existing API**: Currently requires string paths passed to `inspect_project_path` and `add_scan_root`.
- **Desired Additive API**: Tauri dialog plugin (`@tauri-apps/plugin-dialog`) permission / command or custom command `pick_directory() -> Option<String>`.
- **Why It Is Needed**: Greatly speeds up project imports and directory configuration on Linux desktop environments.
- **Affected Components**: `ImportProjectDialog.tsx`, `SettingsPage.tsx`, `ProjectsPage.tsx`.

---

### Request 2: Listening Port Extraction on Supervised Processes
- **Required Behavior**: Expose active listening TCP port(s) for a running process in `ProcessInfo`.
- **Existing API**: `ProcessInfo` contains `pid`, `status`, `started_at`, `exit_code`.
- **Desired Additive API**: Add optional `listening_ports: Vec<u16>` or `port: Option<u16>` to `ProcessInfo`.
- **Why It Is Needed**: Allows the frontend to render direct clickable `http://localhost:<port>` links on Running and Project Detail multi-service views.
- **Affected Components**: `RunningPage.tsx`, `ProjectDetailPage.tsx`, `OverviewPage.tsx`.

---

### Request 3: Batch Git Status Query for Project Catalog
- **Required Behavior**: Batch query or include cached dirty/clean Git status and uncommitted change counts across all indexed projects.
- **Existing API**: `get_git_status(project_path)` takes a single project path at a time.
- **Desired Additive API**: `get_all_git_statuses() -> HashMap<String, GitSummary>` or include summary in `get_projects()`.
- **Why It Is Needed**: Displays real-time dirty status badges and uncommitted change counters on `ProjectsPage` cards without triggering N separate IPC calls.
- **Affected Components**: `ProjectsPage.tsx`, `ProjectCard.tsx`, `ProjectListItem.tsx`.

---

### Request 4: Process Resource Usage (CPU & Memory)
- **Required Behavior**: Provide lightweight snapshot of CPU % and RSS memory (MB) for active processes.
- **Existing API**: None.
- **Desired Additive API**: Add `cpu_percent: Option<f32>` and `memory_rss_bytes: Option<u64>` to `ProcessInfo` in `get_processes()`.
- **Why It Is Needed**: Empowers developers to detect runaway processes and memory leaks directly from the Runyard supervisor dashboard.
- **Affected Components**: `RunningPage.tsx`, `OverviewPage.tsx`.
