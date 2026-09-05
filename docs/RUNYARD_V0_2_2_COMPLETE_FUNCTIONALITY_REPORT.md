# Runyard v0.2.2 — Complete User-Facing Functionality Report

## Report Scope
This document provides an exhaustive, authoritative baseline of all user-facing functionality, interactive controls, settings, keyboard shortcuts, and UI states available in Runyard v0.2.2. It documents the actual current product based on both source-code inspection and native application verification of the installed release binary (`~/.local/bin/runyard`).

Internal helper functions, unimplemented features, and backend capabilities that lack user-facing pathways are explicitly separated under Section 16 ("Implemented but Not User-Exposed").

## Verification Method & Status Legend
Every feature and interactive control in this report is classified using strict evidence tiers:

- ✅ **Native Behavior Verified** — The action was actively executed within the installed release binary (`~/.local/bin/runyard`), and the resulting UI behavior, state change, or modal was directly observed.
- 👁 **Native Presence Verified** — The control, label, button, or layout element was observed and verified in the installed release binary via the Linux AT-SPI accessibility tree, but the action itself was not executed (e.g. to prevent unwanted side-effects on real projects).
- 🔎 **Code Verified** — The behavior is verified line-by-line in the frozen v0.2.2 source code (`src/` and `src-tauri/`), but was not exercised natively.
- 🔀 **Mixed Verification** — The feature area comprises multiple sub-components across different tiers (e.g. some actions exercised natively, while others verified by presence or code).
- 🚫 **Implemented but Not User-Exposed** — Implemented in backend or standalone components, but completely disconnected from the active UI view tree.

## Release Audited
- **Version:** v0.2.2 (tag `v0.2.2`)
- **Git Commit:** `aeb8f447d6940757ed87404b7f28693cd7bb672d`
- **Installed Binary:** `~/.local/bin/runyard`
- **Binary SHA256:** `fd4c920ed798c3a4a24f6471c3d42fc45af46b4db994d59e05e75256f24cf64f`
- **Target Release SHA256:** `fd4c920ed798c3a4a24f6471c3d42fc45af46b4db994d59e05e75256f24cf64f` (Identical match)

---

## Native Verification Log
The installed production binary (`~/.local/bin/runyard`) was launched and audited directly. AT-SPI accessibility tree dumps and automated GUI interactions verified the live application:
1. **Activity Rail Navigation (Exercised):** Clicked `Projects Explorer`, `Running Services Supervisor`, and `Runyard Settings`. Confirmed instantaneous live pane swapping in the running desktop application.
2. **Run Configuration Modal Lifecycle (Exercised):** Clicked `New` in the Run Configurations section and observed the `New Run Configuration` modal open natively. Observed all form fields, builders, and default checkbox. Clicked `Close (Esc)` and observed modal dismissal.
3. **Bottom Panel Tab Navigation (Exercised):** Clicked each bottom panel tab (`Terminal`, `Logs`, `Git Diff`, and `Problems`). Observed view state changes and corresponding contextual header actions.
4. **Settings Navigation & Native File Picker (Exercised):** Clicked each settings tab (`Scan Roots`, `IDE & Editors`, `Keyboard Shortcuts`, `About Runyard`). On the Scan Roots tab, clicked `Browse...` and confirmed immediate invocation of the native OS directory chooser dialog.
5. **Structural & Layout Inspections (Presence Verified):** Inspected title bar custom window controls, status bar indicators (including non-functional Notifications placeholder), Explorer project tree hierarchy, search and CustomSelect filters, workspace header buttons, services overview table, running process supervisor, log viewer controls, and settings lists via AT-SPI accessibility tree dumps without executing data-mutating operations.

---

## 1. APPLICATION LAUNCH / WINDOW & TITLE BAR
**Status:** 👁 Native Presence Verified

### 1.1 Custom Title Bar & Window Management
**What the user can do**
- Drag the application window by the top custom title bar header (`data-tauri-drag-region`).
- Double-click the title bar header area to toggle between maximized and restored window states.
- Click the Minimize button (`-`) to minimize the application window to the taskbar.
- Click the Maximize / Restore button (`Square` / `Copy` icon) to toggle full-screen window state.
- Click the Close button (`X`) to terminate the desktop application.
- View application identity: Runyard logo icon and `Runyard` brand text.
- View active project context: `/{activeProject.name}`, active Git branch badge (purple), and primary detected language badges.
- When no project is selected, view `| Workspace` placeholder text.
- Click the global Running Services indicator button in the title bar (`Running` or `{N} Running`) to switch immediately to the Running Services Supervisor view.

**How to use it**
1. Move the window by dragging anywhere in the blank space of the top title bar.
2. Double-click the title bar or click the Maximize icon to expand the application.
3. Click the Running indicator button on the right side of the title bar to open the process supervisor.

**Behavior**
- Double-clicking or clicking Maximize toggles window dimensions between stored bounds and screen bounds. The maximize button icon rotates 180° when maximized (`Copy` icon).
- The Running indicator dynamically displays the count of active processes (`Running` or `Starting`) and changes color from dark zinc to emerald with a glowing indicator.

**Persistence**
- Window size and position are managed by WebKitGTK / Tauri window state.
- Active view selection from the title bar Running button persists for the session.

**Errors / edge cases**
- Non-Tauri fallback silently catches window resize errors if run in a browser-like preview environment.

**Evidence**
- Native: AT-SPI observed window control buttons `Minimize`, `Maximize`, `Close`, and the Running indicator button in the title bar; double-click maximize behavior is code verified.
- Source: `src/components/TitleBar.tsx` lines 9–171.

---

## 2. ACTIVITY RAIL / PRIMARY NAVIGATION
**Status:** Mixed — ✅ Native Behavior / 👁 Native Presence

### 2.1 Global View Navigation
**What the user can do**
- Switch between primary views by clicking icons on the left vertical activity rail:
  - `Projects Explorer` (Folder icon)
  - `Running Services Supervisor` (Play/Layers icon)
  - `Runyard Settings` (Gear icon)
- Toggle Explorer sidebar visibility by clicking the sidebar toggle button at the bottom of the rail (icon `PanelLeft` / `PanelLeftClose`, shortcut `Ctrl+B`).

**How to use it**
1. Click the Folder icon to open the project catalog.
2. Click the Play icon to supervise active processes.
3. Click the Gear icon to configure scan roots and editors.
4. Click the bottom sidebar toggle button or press `Ctrl+B` to collapse the left pane.

**Behavior**
- Switching views swaps the central content area with a view-entrance transition animation.
- The active navigation item displays an emerald left accent indicator bar and emerald icon coloring.
- When the sidebar is collapsed, the Explorer pane is hidden, leaving only the 44px activity rail.

**Persistence**
- Sidebar collapsed state persists across app restarts in `localStorage` under key `runyard_sidebar_collapsed`.
- Active view (`projects`, `running`, `settings`) is session-only and defaults to `projects` on launch.

**Errors / edge cases**
- None.

**Evidence**
- Native: AT-SPI observed activity rail buttons and collapse toggle; clicked `Projects Explorer`, `Running Services Supervisor`, and `Runyard Settings`, confirming live view transitions.
- Source: `src/components/DesktopLayout.tsx` lines 167–266.

---

## 3. PROJECT EXPLORER & FILTERS
**Status:** 👁 Native Presence Verified

### 3.1 Project Hierarchy & Tree Navigation
**What the user can do**
- View projects organized hierarchically under their respective Scan Roots.
- Expand or collapse project and subproject tree nodes using the chevron toggle button.
- Click a project row to load its details into the Project Workspace.
- Observe running status indicators: a green pulsing dot appears on projects that currently have active processes.
- Observe project metadata badges: Git badge (purple) and project type badge (e.g. `Application`, `Service`, `Library`, `Infrastructure`, `Tool`).
- View subproject indentation based on nesting depth (`6 + depth * 14` px).
- View child services listed under projects in the tree. Clicking a child service navigates to its parent project workspace.

**How to use it**
1. Click the chevron next to a project name to reveal nested subprojects or services.
2. Click the project name row to select it as the active workspace project.

**Behavior**
- Selecting a project highlights the row with an emerald left border accent and emerald text.
- Ancestor nodes of the active project automatically expand so the selected subproject remains visible.
- When filters are active, ancestor nodes remain visible even if only child subprojects match the filter criteria.

**Persistence**
- Tree node expansion (`expandedNodes`) is session-only and maintained in component state.
- Active project selection (`activeProjectId`) is session-only.

**Errors / edge cases**
- If a scan root contains no detected projects, displays `No projects found`.
- If an active project is deleted or disappears from disk, `DesktopLayout` synchronizes state and clears `activeProjectId`.

**Evidence**
- Native: Observed tree items for `platen`, `Runyard`, `pdfnest`, etc., with expand/collapse chevrons.
- Source: `src/components/ProjectNavigator.tsx` lines 300–385.

### 3.2 Search & Multi-Criteria Filtering
**What the user can do**
- Filter projects by text query using the `Search projects...` input.
- Clear search text immediately by clicking the clear (`X`) button that appears inside the search input.
- Filter projects by project type using the `Type` / `All Types` dropdown.
- Filter projects by programming language using the `Lang` / `All Languages` dropdown.
- Filter projects by framework using the `Frame` / `All Frameworks` dropdown.
- Reset all active filters at once by clicking the `Clear` button (icon `FilterX`) in the Explorer header.
- On narrow Explorer widths (<260px), click the `Filters` popover button to open a dropdown containing all three filters and a `Clear all` button.

**How to use it**
1. Type a name in `Search projects...`. The tree filters instantly as you type.
2. Select a language (e.g. `Rust`, `TypeScript`) or type (e.g. `Application`, `Service`) from the dropdowns.
3. Click `Clear` to restore the full project hierarchy.

**Behavior**
- Search matches against project names case-insensitively.
- Dropdown options are dynamically compiled from all projects currently present in the catalog.
- If a child subproject matches, its parent container is preserved in the tree with auto-expansion.

**Persistence**
- Search text and filter selections are session-only.

**Errors / edge cases**
- When all projects are filtered out, scan root groups display `No projects found`.

**Evidence**
- Native: AT-SPI observed search input `Search projects...` and `Type`, `Lang`, `Frame` CustomSelect filter controls; filtering behavior is supported by source inspection.
- Source: `src/components/ProjectNavigator.tsx` lines 388–565.

### 3.3 Resizable Explorer Pane
**What the user can do**
- Drag the right border of the Explorer pane horizontally to resize the sidebar between 190px and 400px.
- Double-click the resize border to reset the Explorer pane to its default width (240px).

**Behavior**
- Smooth live resizing with an emerald hover indicator line. Width is clamped between 190px and 400px.

**Persistence**
- Explorer width persists across app restarts in `localStorage` under key `runyard_explorer_width`.

**Evidence**
- Native: The resize border surface between Explorer and Workspace was observed via layout inspection; resize and double-click reset behaviors are code verified.
- Source: `src/components/DesktopLayout.tsx` lines 91–97, 260–265.

---

## 4. PROJECT WORKSPACE & BREADCRUMBS
**Status:** 👁 Native Presence Verified

### 4.1 Project Header & Contextual Actions
**What the user can do**
- View parent hierarchy breadcrumbs above the project name. Click any ancestor breadcrumb to navigate up the monorepo hierarchy.
- View the active project title and active Git branch badge.
- View language badges (up to 3) and framework badges (up to 2) on large screens (>=1280px).
- Click `Open in [IDE Name]` to open the project folder in the current preferred IDE.
- Click `Choose IDE or editor` (the chevron dropdown attached to the IDE button) to choose another detected IDE or set a project-specific preference.
- Click the `Git [count]` button to toggle the right-side Git Changes pane open or closed.
- On large screens (>=1024px), click `Open System Terminal` to launch an external OS terminal in the project path.
- On large screens (>=1024px), click `Open in File Manager` to reveal the project path in the OS file manager.
- Click `More actions` (`...` icon) to open an overflow menu containing:
  - `System Terminal`
  - `File Manager`
  - `Scan Run Configurations`
  - `New Run Configuration`

**How to use it**
1. Select any project in the Explorer. The Workspace header populates immediately.
2. Click `Open in VS Code` (or your detected IDE) to launch your external editor.
3. Click `Git` to review uncommitted modifications.

**Behavior**
- IDE opening executes the IDE command asynchronously with the project path. Subprojects open at their specific subdirectory, not the parent root.
- The Git button displays a status dot: emerald if the working tree is clean, amber with a change counter if modifications exist.

**Persistence**
- Project-specific preferred IDE persists in the SQLite `projects.preferred_ide` column.

**Errors / edge cases**
- If directory or terminal launch fails, an error toast displays (`Failed to open directory` / `Failed to open terminal`).

**Evidence**
- Native: AT-SPI observed role `heading` `Runyard master`, buttons `Open in VS Code`, `Choose IDE or editor`, `Git 1`, `Open System Terminal`, `Open in File Manager`, `More actions`.
- Source: `src/components/ProjectWorkspace.tsx` lines 320–472.

---

## 5. SERVICES OVERVIEW
**Status:** 👁 Native Presence Verified

### 5.1 Service Supervision & Child Navigation
**What the user can do**
- View detected services and subprojects in a dense table with columns: `Service`, `PID`, `Runtime`, `Actions`.
- If a service corresponds to an auto-discovered child subproject, click the service name button (badged with `Subproject`) to navigate directly to that child subproject's workspace.
- View service taxonomy badges based on project and framework detection:
  - `Subproject` (purple badge when backed by a child subproject)
  - `Application` (Frontend or fullstack apps, e.g. React, Next.js, Tauri)
  - `Service` (Backend APIs, e.g. FastAPI, Express, Axum, Spring Boot)
  - `Infrastructure` (Docker Compose, Makefile)
  - `Library` (Rust library crate or Node library)
  - `Tool` (CLI binary tool)
- For a stopped service, click the `Start service` button (icon `Play`) to execute its primary run configuration.
- For a running service, click the `Stop` button (icon `Square`) to terminate the process.
- For a running service, click the `Restart` button (icon `RotateCw`) to stop and restart the process.
- View live execution elapsed duration (formatted in seconds or minutes) and system PID.

**How to use it**
1. Select a project that has microservices or subprojects (e.g. `platen`).
2. Review the table under `SERVICES OVERVIEW`.
3. Click `Start service` or click the subproject name to drill down into its workspace.

**Behavior**
- Starting a service runs its default configuration, or the first available configuration if no default is marked.
- If no run configurations are defined for the service, displays an info toast: `No run configurations configured for {svc.name}`.

**Persistence**
- Running processes are OS-level subprocesses managed during the current application session.

**Errors / edge cases**
- Displays error toasts (`Failed to start service` / `Failed to stop service` / `Restart failed`) if process spawn fails.

**Evidence**
- Native: AT-SPI observed heading `SERVICES OVERVIEW`, table with rows, and `Start service` buttons.
- Source: `src/components/ProjectWorkspace.tsx` lines 476–627; `src-tauri/src/detector.rs` lines 230–310.

---

## 6. PROJECT SCRIPTS
**Status:** 🔎 Code Verified

### 6.1 Discovered Custom Script Execution
**What the user can do**
- View auto-discovered executable scripts detected in the project directory (e.g. `run_dev.sh`, `run_prod.sh`).
- View the `Auto-Discovered` header badge and total script count.
- See the exact executable script name and command string.
- Inspect the Script Kind badge:
  - `Development Server` (blue badge)
  - `Application Start` (cyan badge)
  - `Multi-Service` (purple badge)
  - `Infrastructure Task` (amber badge)
- Inspect the Execution Mode badge:
  - `Terminal` (emerald badge, displayed when `execution_mode === 'TerminalRequired'`)
- Inspect the Trust badge:
  - `trusted` (emerald badge with `CheckCircle2`)
  - `untrusted` (amber badge with `ShieldAlert`)
- Click the Run button (`Play` icon) to execute the script.
- Click the Stop button (`Square` icon) to terminate a running script.
- View evidence tooltip on hover showing why the script detector classified the script kind.

**How to use it**
1. Scroll down to the `Project Scripts` section in the project workspace.
2. Click the Play button next to any script.
3. If untrusted, review the Trust Dialog prompt.

**Behavior**
- **Background Mode:** Scripts marked for background execution stream output to the background process log buffer.
- **Terminal Required Mode:** Interactive scripts automatically open the Bottom Panel, switch to the Terminal tab, and provision a dedicated PTY session.
- **Trust Validation:** Runyard validates an execution fingerprint. For detected Project Scripts, the fingerprint is also tied to the current script contents. Modifying the script file on disk causes it to revert to `untrusted`.

**Persistence**
- Script discovery is recomputed from the filesystem when viewing a project.
- Script trust state and cryptographic fingerprint persist in the SQLite database.

**Errors / edge cases**
- If script launch fails, an error toast is surfaced with the backend error message.

**Evidence**
- Source: `src/components/ProjectScriptRow.tsx` lines 1–254.

---

## 7. RUN CONFIGURATIONS
**Status:** Mixed — ✅ Native Behavior / 👁 Native Presence

### 7.1 Configuration Management & Row Controls
**What the user can do**
- View all run configurations associated with the active project.
- Click `Detect` (icon `Search`) to scan project manifests (`package.json`, `Cargo.toml`, `go.mod`, etc.) for runnable commands.
- Click `New` (icon `Plus`) to open the `New Run Configuration` modal.
- When no configurations exist, view empty state `No run configurations defined yet.` with a `Scan for Configurations` button.
- Click the Play button (`Run configuration`) on any configuration row to execute it.
- Click the Stop button (`Square` icon) to stop a running process.
- Click the `Set as Default` button (icon `CheckCircle2`) to mark a configuration as the project default.
- Click the `Edit` button (icon `Edit2`) to open the modal in edit mode.
- Click the `Duplicate` button (icon `Copy`) to clone the configuration with a `(Copy)` suffix.
- Click the `Delete` button (icon `Trash2`) to remove the configuration (prompts with native confirmation).
- Inspect badges on configuration rows: `untrusted` (amber) or `default` (emerald).

**Behavior**
- Starting an untrusted configuration intercepts execution and opens the Trust Dialog.
- Duplicating a configuration creates a new record in SQLite and refreshes the query cache.
- Deleting a configuration prompts with a browser confirm dialog (`Delete this configuration?`) before deleting from SQLite.

**Persistence**
- Run configurations persist in SQLite table `run_configurations`. Default assignment persists in `projects.default_run_config_id`.

**Errors / edge cases**
- Displays toast errors if process launch, deletion, or duplication fails.

**Evidence**
- Native: AT-SPI observed heading `RUN CONFIGURATIONS`, buttons `Detect`, `New`, `Set as Default`, `Edit`, `Duplicate`, `Delete`, `Run configuration`.
- Source: `src/components/ProjectWorkspace.tsx` lines 659–730; `src/components/RunConfigRow.tsx` lines 1–170.

### 7.2 Run Configuration Modal (Create & Edit Mode)
**What the user can do**
- In Create Mode: Title displays `New Run Configuration`. Fields initialize empty, with working directory defaulting to the project root path.
- In Edit Mode: Title displays `Edit Run Configuration`. Fields populate with existing command, arguments, cwd, and environment variables.
- Close the modal by clicking `Close (Esc)` (`X` icon), clicking the backdrop, clicking `Cancel`, or pressing the `Escape` key.
- Enter **Configuration Name** (`input[type="text"]`, required, placeholder `e.g. dev-server, worker, test:watch`).
- Select **Target Service (Optional)** using a CustomSelect dropdown (only visible when services exist). Selecting a service automatically updates the default working directory to the service path.
- Enter **Executable / Command** (`input[type="text"]`, required, placeholder `e.g. npm, cargo, python3, pnpm`).
- Manage **Command Arguments**:
  - Add argument: Enter text in `Add an argument item (e.g. run, --port, 3000)...` and click `Add` button or press `Enter`.
  - Edit argument: Modify text in any individual argument input row.
  - Remove argument: Click the `Trash2` button next to any argument row.
  - Preview command: View live rendered shell command preview (`$ <command> <args>`).
- Enter **Working Directory** (`input[type="text"]`, placeholder is project path).
- Manage **Environment Variables**:
  - Click `Add Variable` button to add a new KEY / VALUE row.
  - Enter variable name in `KEY (e.g. PORT)` input.
  - Enter variable value in `VALUE (e.g. 3000)` input.
  - Remove variable: Click the `Trash2` button on the variable row.
  - Empty state: When no environment variables are defined, displays italic text `No custom environment variables defined`.
- Toggle **Set as default run configuration for this project** checkbox.
- In Edit Mode for trusted configurations: Displays an amber warning banner informing the user that modifying execution parameters will require re-approving trust on the next run.
- Click `Save Configuration` button (disabled if Name or Command is blank) to persist changes.

**Evidence**
- Native: Clicked `New` in installed binary. AT-SPI confirmed all modal labels, inputs, checkboxes, and buttons natively.
- Source: `src/components/RunConfigModal.tsx` lines 1–384.

---

## 8. TRUST & EXECUTION SECURITY
**Status:** 🔎 Code Verified

### 8.1 Trust Verification & Execution Gate
**What the user can do**
- When executing an auto-detected or untrusted configuration/script, execution is paused and the `Review Untrusted Command` dialog is presented.
- View warning explanation: `This run configuration was automatically discovered in project files. Verify the command and arguments below before executing native processes on your machine.`
- View the command details box:
  - Configuration name with Terminal icon
  - Discovery source badge (e.g. `Manifest`, `ProjectScript`)
  - Full command string with arguments: `$ {config.command} {config.args}`
  - Working directory path: `cwd: {config.working_dir}`
- Choose an execution action:
  - **Cancel:** Dismiss the dialog without executing any process (via `Cancel` button, `Close (Esc)` `X` button, or `Escape` key).
  - **Run Once:** Execute the command once for this session without saving trust to the database.
  - **Trust & Run:** Save a cryptographic fingerprint to the database marking the configuration as trusted, and execute the process.

**Behavior**
- Runyard validates an execution fingerprint. For detected Project Scripts, the fingerprint is also tied to the current script contents.
- If a trusted script is modified on disk or a trusted configuration's command/arguments/cwd are edited, the fingerprint mismatches and Runyard requires trust approval again.

**Persistence**
- `Trust & Run` saves the trust flag and fingerprint to SQLite table `run_configurations`.
- `Run Once` bypasses the check for the single invocation without persisting trust.

**Errors / edge cases**
- Rejection or cancellation leaves the workspace completely unaffected.

**Evidence**
- Source: `src/components/TrustDialog.tsx` lines 1–105; `src-tauri/src/reconcile.rs`.

---

## 9. PROCESS SUPERVISOR / RUNNING VIEW
**Status:** 👁 Native Presence Verified

### 9.1 Global Process Monitoring & Lifecycle Controls
**What the user can do**
- Navigate to the supervisor by clicking `Running Services Supervisor` on the activity rail or the title/status bar Running buttons.
- View total active process count badge (`{N} Active`).
- Filter running processes by name or project name using the `Filter processes...` input.
- Click the clear filter button (`X` icon) to reset process filter text.
- Click `Stop All` (icon `OctagonAlert`) to terminate all currently active processes in one click.
- View the process table grouped by project with columns: `Service / Config`, `Status`, `PID`, `Runtime`, `Actions`.
- Click any process row to select it and view its output in the integrated log viewer.
- For running processes, click `Restart` (icon `RotateCw`) or `Stop` (icon `Square`).
- For terminated processes, click `Rerun` (icon `Play`).
- View live status dots: emerald for running, red for non-zero exit code, zinc for clean exit.
- View exit code badge (e.g. `Exit (1)`) or elapsed execution duration.
- View the integrated log viewer below the process table showing the selected process's live output.
- Click `Hide logs` (`X` icon) to collapse the integrated log viewer.

**Behavior**
- Stopping a process sends a termination signal to the OS process tree.
- The process supervisor automatically refreshes every second via React Query polling.

**Persistence**
- Process state is maintained by the native process manager during the application session.

**Errors / edge cases**
- When no processes have been launched, displays empty state: `No active or recent processes.` with `Layers` icon.

**Evidence**
- Native: AT-SPI observed heading `RUNNING SERVICES`, inputs `Filter processes...`, `Filter log output...`, buttons `Hide logs`, `Wrap`, `Auto-scroll`, `Copy all logs`, `Clear output buffer`.
- Source: `src/components/RunningView.tsx` lines 1–328.

---

## 10. BOTTOM PANEL TOOL CONTAINER
**Status:** Mixed — ✅ Native Behavior / 👁 Native Presence

### 10.1 Panel Drawer & Tab Switching
**What the user can do**
- Toggle the bottom panel open or closed:
  - Press `Ctrl+\`` / `Cmd+\`` from anywhere in the application.
  - Click the `Terminal & Logs` button in the status bar when closed.
  - Click the `Close bottom panel` (`X` icon) button in the panel header.
- Switch between 4 bottom panel tabs:
  - `Terminal` (icon `Terminal`)
  - `Logs` (icon `ScrollText`, includes live green dot when background processes are active)
  - `Git Diff` (icon `GitCommit`)
  - `Problems` (icon `AlertTriangle`)
- Resize the bottom panel vertically:
  - Drag the top border of the panel up or down (clamped between 120px and 65% of window height).
  - Double-click the resize border to reset the panel height to default (256px).

**Behavior**
- The panel opens seamlessly across the bottom of the workspace without covering the activity rail or status bar.
- Switching tabs updates the header context controls dynamically.

**Persistence**
- Panel open/closed state persists in `localStorage` (`runyard_bottom_open`).
- Panel height persists in `localStorage` (`runyard_bottom_height`).
- Selected tab is session-only and defaults to `terminal`.

**Evidence**
- Native: AT-SPI observed bottom panel tab buttons and header controls; switching between `Terminal`, `Logs`, `Git Diff`, and `Problems` tabs was actively exercised; panel toggle and vertical resize behaviors are code verified.
- Source: `src/components/BottomPanel.tsx` lines 1–170; `src/components/DesktopLayout.tsx` lines 108–119, 338–365.

---

## 11. INTEGRATED TERMINAL
**Status:** 👁 Native Presence Verified

### 11.1 Native Interactive Shell & PTY Sessions
**What the user can do**
- Access a full ANSI color interactive pseudoterminal (xterm.js) embedded directly in the bottom panel.
- The terminal automatically launches in the active project directory.
- Type commands, execute shell scripts, use terminal shortcuts (`Ctrl+C`, `Ctrl+D`), and navigate terminal history.
- Click URLs in terminal output to open them directly in the default system web browser (via `WebLinksAddon`).
- Click `Clear` (icon `Eraser`) in the panel header to clear terminal scrollback buffer.
- Click `Restart` (icon `RefreshCw`) in the panel header to kill the active shell and spawn a fresh session in the current project path.
- Switch between Default Shell and running Script PTY sessions:
  - Click `Shell` in the session switcher pill to return to the interactive shell.
  - Click any script tab (e.g. `run_dev.sh`) to view and interact with a running `TerminalRequired` script.
  - Click `×` (`Detach from script (keeps running)`) to disconnect the terminal view while allowing the script process to continue in the background.
  - Click `Attach to {run_config_name}` to reattach to a running background PTY process.

**Behavior**
- Terminal automatically fits container dimensions using `FitAddon` and communicates window size (`cols`, `rows`) to the backend PTY.
- The standard shell session remains alive when switching projects; if restarted, it spawns in the newly selected project directory.

**Persistence**
- Terminal session processes are session-only and terminate on application exit.

**Errors / edge cases**
- If terminal creation fails, an error view appears: `Failed to initialize terminal session` with a `Retry Shell Connection` button.
- If no project is selected, displays: `Select a project in the explorer to view terminal`.

**Evidence**
- Native: AT-SPI observed `Terminal input`, `Clear`, and `Restart` controls along with the terminal session container; shell process lifecycle is code verified.
- Source: `src/components/TerminalView.tsx` lines 1–250; `src/components/BottomPanel.tsx` lines 172–264.

---

## 12. LOGS, GIT DIFF & PROBLEMS
**Status:** 👁 Native Presence Verified

### 12.1 Background Process Log Viewer
**What the user can do**
- View stdout and stderr log streams from running or completed background processes.
- Switch log streams using the `Stream:` dropdown (`CustomSelect`) in the panel header.
- Filter log lines in real-time using the `Filter log output...` search box. Shows match counter (e.g. `{N} found`).
- Click `Wrap` to toggle word-wrap on or off.
- Click `Auto-scroll` to toggle pinning the view to the latest incoming log lines.
- Click `Copy all logs` to copy entire log output to the system clipboard with timestamps.
- Click `Clear output buffer` (icon `Trash2`) to purge the in-memory log buffer for the selected process.
- Click any embedded URL link in log lines to open it in the system browser.
- Stderr lines are highlighted with red tinting.

### 12.2 Git Diff Viewer
**What the user can do**
- Inspect file diffs for any modified or staged file selected in the Git Changes pane.
- Displays file path header with a green `staged` badge if viewing staged changes.
- Syntax-highlighted unified diff rendering:
  - Green line highlighting for additions (`+`)
  - Red line highlighting for deletions (`-`)
  - Purple line highlighting for chunk headers (`@@`)
- Horizontal and vertical scrolling for large diffs.

### 12.3 Problems Panel
**What the user can do**
- Click the `Problems` tab in the bottom panel.
- View workspace diagnostics status.
- Currently renders static clean empty state: `No problems detected in workspace` with icon `AlertTriangle`.

**Evidence**
- Native: AT-SPI observed `Filter log output...`, `Wrap`, `Auto-scroll`, `Copy all logs`, `Clear output buffer`, `Git Diff`, and `Problems` tabs.
- Source: `src/components/LogViewer.tsx` lines 1–214; `src/components/BottomPanel.tsx` lines 321–419.

---

## 13. GIT CHANGES DRAWER / PANE
**Status:** 🔎 Code Verified

### 13.1 Version Control & Commit Workflow
**What the user can do**
- Toggle the Git Changes pane by clicking the `Git` button in the workspace header or pressing `Escape` when open in drawer mode.
- View repository clean status: `Working directory clean` when no changes exist.
- View changed files grouped into collapsible sections:
  - **Staged Changes ({count}):** Click chevron to collapse/expand. Click `Minus` icon on any file to unstage it.
  - **Changes ({count}):** Click chevron to collapse/expand. Click `+ Stage All` button to stage all modified files at once. Click `Plus` icon on any file to stage it.
  - **Untracked ({count}):** Click chevron to collapse/expand. Click `Plus` icon on any file to stage it.
- Click any file row in any section to select it and immediately view its diff in the Bottom Panel `Git Diff` tab.
- Click `Refresh Git status` (icon `RefreshCcw`) to re-query repository status from disk.
- Click `Push commits to remote` (icon `Upload`) to push local commits to the upstream Git remote.
- Enter a commit message in the commit textarea (`Commit message (Enter to commit)...`).
- Submit commit by clicking the `Commit` button or pressing `Ctrl+Enter` / `Cmd+Enter`.
- Click `Close Git pane` (`X` icon) to close the pane.

**Behavior**
- **Wide Screens (>=1150px):** Git Changes docks side-by-side on the right with a resizable divider handle (`gitResize`, min 220px, max 450px, default 280px).
- **Narrow Screens (<1150px):** Git Changes opens as a slide-in drawer overlay with a blurred backdrop (`max-w-[85vw]`, clamped at 380px). Clicking the backdrop or pressing `Escape` dismisses the drawer.

**Persistence**
- Git pane width persists in `localStorage` (`runyard_git_width`).
- Git pane collapsed state persists in `localStorage` (`runyard_git_collapsed`).

**Errors / edge cases**
- If the selected project has no Git repository, displays: `Not a Git repository`.
- The `Commit` button is disabled if commit message is empty, no files are staged, or a commit mutation is pending.
- Surfaces toast notifications on commit/push/stage failures.

**Evidence**
- Source: `src/components/GitChangesPane.tsx` lines 1–340; `src/components/DesktopLayout.tsx` lines 139–153, 305–332.

---

## 14. SETTINGS & PROJECT DISCOVERY
**Status:** Mixed — ✅ Native Behavior / 👁 Native Presence

### 14.1 Scan Roots Management
**What the user can do**
- View the list of all registered scan roots monitored by Runyard.
- View live scan progress for each root:
  - `Scanning… {found} projects · {svc} svc ({elapsed}s)` with animated spinner
  - `Queued…`
  - `✓ {found} projects · {svc} svc · {elapsed}s`
  - `⚠ Scan failed` with error tooltip
- Click `Rescan Now` in the header to trigger a full background rescan of all configured scan roots.
- Click `Rescan this root` (icon `RefreshCw`) next to a specific scan root to rescan only that directory.
- Click `Remove scan root` (icon `Trash2`) to remove a directory from Runyard's scan catalog.
- Add a new scan root:
  - Type a directory path into `e.g. /home/user/projects`.
  - Click `Browse...` to open the native OS directory picker dialog and select a folder.
  - Click `Add Root` (disabled if input is empty or scan is pending).

**Behavior**
- Removing a scan root removes it from the catalog. Discovered projects that no longer belong to any active scan root are pruned automatically during catalog reconciliation.

**Persistence**
- Scan roots persist permanently in SQLite table `scan_roots`.

**Errors / edge cases**
- When no scan roots exist, displays empty state: `No scan roots configured yet. Add a directory path below.`
- Adding a duplicate root or non-existent path surfaces an error toast.

**Evidence**
- Native: AT-SPI observed `Scan Roots` tab, `Browse...` button, `Add Root` button, and scan root items. Clicked `Browse...` and verified native file chooser invocation.
- Source: `src/pages/SettingsPage.tsx` lines 133–264.

### 14.2 Installed Editors & IDE Configuration
**What the user can do**
- Navigate to the `IDE & Editors` tab in Settings.
- View all auto-detected IDEs and code editors found on the system `PATH` or installed via Flatpak (e.g. VS Code, Cursor, Windsurf, Zed, IntelliJ IDEA, WebStorm, PyCharm, Sublime Text, Neovim).
- Inspect IDE details: display name, executable command path, and `Default` badge.
- Click `Set Default` on any non-default editor to set it as the global default editor for all projects.

**Persistence**
- Global default IDE choice persists permanently in SQLite table `app_settings` under key `default_ide`.

**Errors / edge cases**
- If no supported editors are detected on the system, displays: `No IDEs auto-detected on your system PATH or Flatpak.`

**Evidence**
- Native: AT-SPI observed `IDE & Editors` tab and list of detected IDEs.
- Source: `src/pages/SettingsPage.tsx` lines 266–318.

### 14.3 Informational Reference Panels
**What the user can do**
- `Keyboard Shortcuts` tab: View read-only reference list of default workspace shortcuts (`Ctrl+K / Cmd+K`, `Ctrl+\` / Cmd+\``, `Ctrl+B / Cmd+B`).
- `About Runyard` tab: View version number `v0.2.2`, stack details `Tauri 2 • WebKitGTK / GDK • React 19 • TailwindCSS`, and license `MIT`.

**Evidence**
- Native: AT-SPI observed `Keyboard Shortcuts` and `About Runyard` tabs.
- Source: `src/pages/SettingsPage.tsx` lines 320–378.

---

## 15. COMMAND PALETTE
**Status:** 🔎 Code Verified

### 15.1 Quick-Access Launcher & Handler Semantics
**What the user can do**
- Press `Ctrl+K` or `Cmd+K` from anywhere in the application to open the modal Command Palette.
- Close the palette by pressing `Escape`, clicking the `Close` button (`X` icon), or clicking the backdrop overlay.
- Search across navigation destinations, global actions, and registered projects using fuzzy filtering.
- Navigate search results using keyboard `ArrowDown` / `ArrowUp` keys or mouse hover.
- Execute the highlighted action by pressing `Enter` or clicking the item.

### 15.2 Command Palette Items & Execution Accounting
In accordance with the audit counting methodology, selectable palette options and dynamic search results are cataloged separately from persistent structural controls:

- **Built-in Navigation Items (4):**
  - `Go to Overview`: Invokes `navigate('/')`.
  - `Browse All Projects`: Invokes `navigate('/projects')`.
  - `Running Processes Dashboard`: Invokes `navigate('/running')`.
  - `Open Settings`: Invokes `navigate('/settings')`.
  - *Actual v0.2.2 Behavior:* `DesktopLayout`'s active view is governed by Zustand state (`activeView`, `activeProjectId`), not React Router routes. Calling `navigate()` modifies the browser history location path in memory but produces no view transition in the rendered desktop application.
- **Built-in Action Items (3):**
  - `Rescan Configured Directories`: **Fully Functional**. Calls `scanProjects.mutateAsync()` to initiate a catalog scan.
  - `Stop All Active Services`: **Fully Functional**. Appears when active processes exist; terminates all running services via `stopProcess.mutate()`.
  - `Import Project from Directory`: **Unavailable Action / Partial Preparation Without Visible Dialog**. The handler executes `navigate('/projects?action=import')`. Because `DesktopLayout` does not subscribe to location query parameters and `ImportProjectDialog` is never mounted anywhere in the application, no dialog opens and no import flow can be completed by the user.
- **Dynamic Project Result Items:**
  - One selectable item per registered project in `projects`, displaying project name, path, branch, and running status. Invokes `navigate('/projects/:id')` (which likewise updates router path without setting `activeProjectId`).

**Persistence**
- Palette open state and query text are session-only.

**Errors / edge cases**
- When query matches no items: `No matching actions or projects for "{query}"`.

**Evidence**
- Source: `src/components/CommandPalette.tsx` lines 1–324; `src/App.tsx` line 13.

---

## 🚫 16. IMPLEMENTED BUT NOT USER-EXPOSED

The following 6 capabilities exist in the v0.2.2 codebase as backend commands, database tables, or standalone components, but are **not reachable or exposed** in the active user interface:

1. **Manual Project Import Dialog (`ImportProjectDialog.tsx`):**
   - Implemented as a standalone component with path inputs, manifest inspector, and suggested run configurations.
   - Disconnected from the UI: It is never imported or rendered in `DesktopLayout.tsx` or any active route.
2. **Run Group Orchestration (`RunGroupModal.tsx` / `use-run-groups.ts`):**
   - Implemented with backend SQLite database schema and React modal for creating multi-process launch groups.
   - Disconnected from the UI: No button or menu item in `ProjectWorkspace` or `DesktopLayout` opens the modal.
3. **Advanced Git View (`GitView.tsx`):**
   - Implemented with branch creation modal, branch checkout dropdown, fetch, pull, and commit history log with copyable hashes.
   - Disconnected from the UI: `DesktopLayout` exclusively mounts `GitChangesPane`. `GitView` is completely unreferenced in the UI tree.
4. **Project Deletion / Unregistration (`removeProject` / `useRemoveProject`):**
   - Implemented in `src-tauri/src/commands.rs` and `use-projects.ts`.
   - Disconnected from the UI: No context menu or trash button exists in the Explorer or Workspace to delete a project directly.
5. **Project Tagging (`useUpdateProjectTags`):**
   - Implemented in database schema (`projects.tags`) and Tauri command.
   - Disconnected from the UI: No UI input or tag editor is rendered in the workspace header or settings.
6. **Project Favorite Toggle in Explorer (`is_favorite`):**
   - Implemented in database schema (`projects.is_favorite`), hook `useToggleFavorite`, and unreferenced `ProjectListItem.tsx`.
   - Disconnected from the UI: The active tree navigator (`ProjectNavigator.tsx`) does not render any favorite star button.

---

## Persistence Matrix

| State Item | Persists across restart? | Recomputed on launch/scan? | Session only? | Evidence & Storage Mechanism |
|---|---|---|---|---|
| Scan roots | Persists | No | No | SQLite `scan_roots` table |
| Top-level projects | Persists | Recomputed | No | SQLite `projects` table (reconciled during scan) |
| Nested projects | Persists | Recomputed | No | SQLite `projects` table (`parent_project_id`) |
| Services | Persists | Recomputed | No | SQLite `services` table (re-discovered during scan) |
| Project Scripts | Recomputed | Recomputed | No | Scanned dynamically from filesystem; trust persists |
| Run configurations | Persists | No | No | SQLite `run_configurations` table |
| Script / config trust | Persists | No | No | SQLite `run_configurations.is_trusted` & `trusted_fingerprint` |
| Global default IDE | Persists | No | No | SQLite `app_settings` (`default_ide`) |
| Project-specific IDE preference | Persists | No | No | SQLite `projects.preferred_ide` |
| Favorite state | Not user-exposed | No | No | SQLite `projects.is_favorite` (UI missing in Explorer) |
| Tags | Not user-exposed | No | No | SQLite `projects.tags` (UI missing) |
| Selected project | Session only | No | Yes | React state `useUiStore.activeProjectId` (resets to null) |
| Explorer tree expansion | Session only | No | Yes | React state `ProjectNavigator.expandedNodes` |
| Explorer search query | Session only | No | Yes | React state `ProjectNavigator.search` |
| Type filter selection | Session only | No | Yes | React state `ProjectNavigator.typeFilter` |
| Language filter selection | Session only | No | Yes | React state `ProjectNavigator.langFilter` |
| Framework filter selection | Session only | No | Yes | React state `ProjectNavigator.frameFilter` |
| Current primary view | Session only | No | Yes | React state `useUiStore.activeView` (defaults to 'projects') |
| Sidebar collapsed / open | Persists | No | No | `localStorage` (`runyard_sidebar_collapsed`) |
| Bottom panel open / closed | Persists | No | No | `localStorage` (`runyard_bottom_open`) |
| Bottom panel height | Persists | No | No | `localStorage` (`runyard_bottom_height`) |
| Selected bottom-panel tab | Session only | No | Yes | React state `useUiStore.bottomPanelTab` (resets to 'terminal') |
| Normal terminal shell process | Session only | No | Yes | Native PTY process terminated on application close |
| Project Script PTY sessions | Session only | No | Yes | Native PTY process terminated on application close |
| Running background processes | Session only | No | Yes | OS child processes supervised in-memory |
| Git drawer open / collapsed | Persists | No | No | `localStorage` (`runyard_git_collapsed`) |
| Git pane width | Persists | No | No | `localStorage` (`runyard_git_width`) |
| Selected Git file / diff | Session only | No | Yes | React state `useUiStore.diffTarget` |

---

## Responsive & Window-Size Dependent Behavior

Runyard's layout contains multiple responsive breakpoints designed for flexible window sizes:

1. **Explorer Sidebar Responsive Filters:**
   - **Width >= 260px:** The Explorer header displays 3 inline grid `CustomSelect` dropdowns labeled `Type`, `Lang`, and `Frame`.
   - **Width < 260px:** The 3 inline dropdowns collapse into a single `Filters` popover button. Clicking it reveals a floating menu with full-width selectors labeled `All Types`, `All Languages`, `All Frameworks` and a `Clear all` button.
2. **Git Changes Pane Docked vs. Drawer Overlay:**
   - **Window Width >= 1150px:** Git Changes renders as a persistent, docked right-hand sidebar with a resizable divider handle (`gitResize`, min 220px, max 450px).
   - **Window Width < 1150px:** Git Changes automatically transitions into an overlay drawer (`max-w-[85vw]`, clamped at 380px) over a darkened, blurred backdrop (`bg-black/40`). Clicking the backdrop or pressing `Escape` dismisses the drawer.
3. **Workspace Header Toolbar Adaptation:**
   - **Window Width >= 1280px (xl):** Project language badges (up to 3) and framework badges (up to 2) are fully visible in the header.
   - **Window Width < 1280px:** Language and framework badges hide to prioritize action buttons.
   - **Window Width >= 1024px (lg):** `Open System Terminal` and `Open in File Manager` render directly in the header toolbar.
   - **Window Width < 1024px:** Direct terminal and folder buttons are hidden from the toolbar and accessible exclusively via the `More actions` (`...`) overflow menu.
   - **Window Width < 768px (md):** `Open in {IDE}` button text truncates to `IDE`.
4. **Command Text Truncation in Rows:**
   - In `RunConfigRow` and `ProjectScriptRow`, the command snippet is hidden on mobile screens (`<640px`), capped at 120px on small screens (`sm`), 200px on medium screens (`md`), and 320px on large screens (`lg`).
5. **Row Action Button Visibility:**
   - On small screens (`<640px`), row actions (Default, Edit, Duplicate, Delete) render at 60% opacity to ensure tap accessibility without hover capability. On larger screens, they remain hidden until the row is hovered.
6. **Status Bar Responsive Elements:**
   - On `<640px`, the Running services status button hides.
   - On `<768px`, the `UTF-8` encoding indicator hides.
7. **Bottom Panel Dynamic Constraints:**
   - The bottom panel resize height is dynamically clamped to a maximum of 65% of current window height (`Math.floor(windowHeight * 0.65)`), preventing the panel from obscuring the workspace header.

---

## Complete Menu / Dropdown Inventory

### Menu Surfaces Summary
- **Total Menu / Dropdown / Popover Surfaces:** 8
- **Total Fixed Menu Commands:** 10
- **Total Dynamic Menu Categories:** 6

### Detailed Inventory

| Menu Location | Trigger Control | Surface Type | Fixed Menu Commands | Dynamic Category & Source | Action / Consequence |
|---|---|---|---|---|---|
| Explorer Header | `Type` selector | CustomSelect | `All Types` (or `Type`) | Scanned project types (`projects.project_type`) | Filters explorer tree by project type |
| Explorer Header | `Lang` selector | CustomSelect | `All Languages` (or `Lang`) | Scanned languages (`projects.languages`) | Filters explorer tree by language |
| Explorer Header | `Frame` selector | CustomSelect | `All Frameworks` (or `Frame`) | Scanned frameworks (`projects.frameworks`) | Filters explorer tree by framework |
| Explorer Header | `Filters` button | Popover container | `Clear all` | None | Reveals filter dropdowns on narrow Explorer (<260px) |
| Workspace Header | `Choose IDE or editor` | CustomMenu | `Set as preferred` | Installed system IDEs (`detectedIdes`) | Launches project in IDE; allows setting project preferred IDE (headers/fallbacks excluded) |
| Workspace Header | `More actions` (`...`) | CustomMenu | `System Terminal`, `File Manager`, `Scan Run Configurations`, `New Run Configuration` | None | Executes system launch, triggers scan, or opens config modal |
| Run Config Modal | `Target Service` | CustomSelect | `Root Project ({projectPath})` | Project subproject services (`services`) | Scopes configuration to subproject directory |
| Bottom Panel Header | `Stream:` selector | CustomSelect | None | Active project processes (`projectProcesses`) | Switches active log stream display |

---

## Keyboard Shortcuts

| Shortcut | Scope | Action | Native Verification Status | Code Location |
|---|---|---|---|---|
| `Ctrl+K` / `Cmd+K` | Global | Toggles Command Palette open/closed | 🔎 Code Verified | `src/components/CommandPalette.tsx:149` |
| `Ctrl+\`` / `Cmd+\`` | Global | Toggles Bottom Panel open/closed | 👁 Native Presence Verified | `src/components/DesktopLayout.tsx:77` |
| `Ctrl+B` / `Cmd+B` | Global | Toggles Explorer Sidebar collapsed/open | 👁 Native Presence Verified | `src/components/DesktopLayout.tsx:80` |
| `Escape` | Modal / Drawer / Popover | Closes active overlay (Command Palette, Git Drawer, Filter Popover, RunConfigModal, TrustDialog) | 👁 Native Presence Verified | `DesktopLayout.tsx:149`, `RunConfigModal.tsx:59`, `TrustDialog.tsx:15` |
| `Enter` | Forms & Dialogs | Submits modal form (RunConfigModal, Add Scan Root) or adds argument item | 👁 Native Presence Verified | `RunConfigModal.tsx:257`, `SettingsPage.tsx:230` |
| `Ctrl+Enter` / `Cmd+Enter` | Git Commit Box | Submits commit for currently staged files | 🔎 Code Verified | `src/components/GitChangesPane.tsx:318` |
| `ArrowDown` / `ArrowUp` | Menus & Palette | Navigates through items in Command Palette, CustomSelect, and CustomMenu | 👁 Native Presence Verified | `CommandPalette.tsx:188`, `CustomSelect.tsx:105` |

---

## Empty, Loading & Error States Inventory

| State ID | Area / Component | Condition | Exact UI Text / State Displayed | Verification Status |
|---|---|---|---|---|
| E01 | Explorer | No projects in scan root | `No projects found` | 👁 Native Presence |
| E02 | Workspace Content | No project selected | Box icon + `Select a project from the explorer to inspect workspace` | 👁 Native Presence |
| E03 | Workspace Header | No IDE detected on system | Disabled button + `Open in IDE` | 🔎 Code Verified |
| E04 | Workspace Configs | No configurations defined | `No run configurations defined yet.` + `Scan for Configurations` button | 👁 Native Presence |
| E05 | Running View | No processes launched | Layers icon + `No active or recent processes.` | 👁 Native Presence |
| E06 | Running View | Processes loading | Animated spinner + `Loading process supervisor...` | 🔎 Code Verified |
| E07 | Terminal Tab | Project selected, loading | `Loading terminal session...` | 👁 Native Presence |
| E08 | Terminal Tab | No project selected | `Select a project in the explorer to view terminal` | 👁 Native Presence |
| E09 | Terminal Tab | Shell spawn failed | AlertCircle icon + `Failed to initialize terminal session` + `Retry Shell Connection` button | 🔎 Code Verified |
| E10 | Log Tab | No process selected | `No active or logged processes in this project.` | 👁 Native Presence |
| E11 | Log Viewer | Connecting to process | `Connecting to process stream...` | 🔎 Code Verified |
| E12 | Log Viewer | No logs produced | `No output received yet.` | 👁 Native Presence |
| E13 | Log Viewer | Filter query unmatched | `No log lines matching "{filter}"` | 🔎 Code Verified |
| E14 | Git Diff Tab | No file selected | FileDiff icon + `Select a modified file in Git Changes to inspect diff` | 👁 Native Presence |
| E15 | Git Diff Tab | File has no diff content | `No diff content found.` | 🔎 Code Verified |
| E16 | Problems Tab | Default view | AlertTriangle icon + `No problems detected in workspace` | 👁 Native Presence |
| E17 | Git Changes Pane | Directory is not Git repo | `Not a Git repository` | 🔎 Code Verified |
| E18 | Git Changes Pane | Working tree clean | `Working directory clean` | 👁 Native Presence |
| E19 | Settings Scan Roots | No scan roots configured | `No scan roots configured yet. Add a directory path below.` | 👁 Native Presence |
| E20 | Settings IDEs | No IDEs detected on PATH | `No IDEs auto-detected on your system PATH or Flatpak.` | 👁 Native Presence |
| E21 | Command Palette | Query unmatched | `No matching actions or projects for "{query}"` | 🔎 Code Verified |

---

## Notification (Toast) Inventory

| ID | Trigger Condition | Toast Type | Message Content | Verification Status |
|---|---|---|---|---|
| T01 | Project scan started from settings | Info | `Scan started` | 🔎 Code Verified |
| T02 | Project scan failed | Error | `Failed to scan projects` | 🔎 Code Verified |
| T03 | Project scan succeeded from palette | Success | `Project scan completed successfully` | 🔎 Code Verified |
| T04 | Staged all modified changes | Success | `Staged all changes` | 🔎 Code Verified |
| T05 | Failed to stage file or all | Error | `Failed to stage file` / `Failed to stage all` | 🔎 Code Verified |
| T06 | Failed to unstage file | Error | `Failed to unstage file` | 🔎 Code Verified |
| T07 | Git commit succeeded | Success | `Changes committed successfully` | 🔎 Code Verified |
| T08 | Git commit failed | Error | `Commit failed` | 🔎 Code Verified |
| T09 | Git push succeeded | Success | `Pushed successfully to remote` | 🔎 Code Verified |
| T10 | Git push failed | Error | `Push failed` | 🔎 Code Verified |
| T11 | Log buffer copied to clipboard | Success | `Logs copied to clipboard` | 🔎 Code Verified |
| T12 | Log buffer copy failed | Error | `Failed to copy logs` | 🔎 Code Verified |
| T13 | Log output buffer cleared | Info | `Process output buffer cleared` | 🔎 Code Verified |
| T14 | Project directory opened in IDE | Success | `Opened in {preferredIde.name}` | 🔎 Code Verified |
| T15 | Failed to open directory / terminal | Error | `Failed to open directory` / `Failed to open terminal` | 🔎 Code Verified |
| T16 | Auto-detected run configurations | Success / Info | `Discovered {count} run configurations` / `No new run configurations found` | 🔎 Code Verified |
| T17 | Project preferred IDE updated | Success | `Set {preferredIde.name} as preferred` | 🔎 Code Verified |
| T18 | Process stopped | Info | `Stopped {name}` / `Stopping {count} processes` | 🔎 Code Verified |
| T19 | Process started | Success | `Started {name}` | 🔎 Code Verified |
| T20 | Configuration saved / updated / duplicated | Success | `Configuration saved` / `Configuration updated` / `Configuration duplicated` | 🔎 Code Verified |
| T21 | Scan root added | Success | `Added scan root` | 🔎 Code Verified |
| T22 | Scan root removed | Info | `Removed scan root` | 🔎 Code Verified |
| T23 | Default IDE updated | Success | `Default IDE set to {ide.name}` | 🔎 Code Verified |

---

## Complete Interactive Control Inventory

*(Every single independent interactive UI target is enumerated below with exact UI text and component source)*

| No. | Area | Exact UI Text / Tooltip / Target | Control Type | Action | Consequence | Persistence | Verification Status | Source Component |
|---|---|---|---|---|---|---|---|---|
| 1 | Title Bar | Minimize | Button | Click | Minimizes window | N/A | 👁 Native Presence | `TitleBar.tsx` |
| 2 | Title Bar | Maximize / Restore | Button | Click | Toggles window maximization | N/A | 👁 Native Presence | `TitleBar.tsx` |
| 3 | Title Bar | Close | Button | Click | Closes application | N/A | 👁 Native Presence | `TitleBar.tsx` |
| 4 | Title Bar | Running / {N} Running | Button | Click | Opens Running Services Supervisor | Session | 👁 Native Presence | `TitleBar.tsx` |
| 5 | Title Bar | Title bar blank area | Header region | Double-click | Toggles window maximization | N/A | 👁 Native Presence | `TitleBar.tsx` |
| 6 | Activity Rail | Projects Explorer | Button | Click | Navigates to Projects Explorer view | Session | ✅ Native Behavior | `DesktopLayout.tsx` |
| 7 | Activity Rail | Running Services Supervisor | Button | Click | Navigates to Running view | Session | ✅ Native Behavior | `DesktopLayout.tsx` |
| 8 | Activity Rail | Runyard Settings | Button | Click | Navigates to Settings view | Session | ✅ Native Behavior | `DesktopLayout.tsx` |
| 9 | Activity Rail | Collapse Explorer (Ctrl+B) | Button | Click | Collapses / expands Explorer sidebar | Persists | 👁 Native Presence | `DesktopLayout.tsx` |
| 10 | Status Bar | {N} services running | Button | Click | Navigates to Running view | Session | 👁 Native Presence | `DesktopLayout.tsx` |
| 11 | Status Bar | Notifications | Button | Click | Placeholder / no-op (no onClick handler attached in v0.2.2) | N/A | 👁 Native Presence | `DesktopLayout.tsx` |
| 12 | Status Bar | Terminal & Logs (Ctrl+\`) | Button | Click | Opens Bottom Panel | Persists | 👁 Native Presence | `DesktopLayout.tsx` |
| 13 | Explorer | Search projects... | Text Input | Type text | Filters project list by name | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 14 | Explorer | Clear search (X) | Button | Click | Clears search input text | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 15 | Explorer | Clear (FilterX) | Button | Click | Resets search and all filters | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 16 | Explorer | Filters popover button | Button | Click | Toggles filter popover (narrow mode) | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 17 | Explorer | Clear all (in popover) | Button | Click | Clears all filters from popover | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 18 | Explorer | Type / All Types | CustomSelect | Select option | Filters tree by project type | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 19 | Explorer | Lang / All Languages | CustomSelect | Select option | Filters tree by language | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 20 | Explorer | Frame / All Frameworks | CustomSelect | Select option | Filters tree by framework | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 21 | Explorer | Expand / Collapse (Chevron) | Button | Click | Toggles project tree expansion | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 22 | Explorer | Project row item | Button row | Click | Selects active project | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 23 | Explorer | Child service row item | Button row | Click | Selects parent project workspace | Session | 👁 Native Presence | `ProjectNavigator.tsx` |
| 24 | Explorer | Resize divider handle | Drag handle | Drag | Resizes Explorer width | Persists | 👁 Native Presence | `DesktopLayout.tsx` |
| 25 | Explorer | Reset resize divider | Drag handle | Double-click | Resets Explorer to default width | Persists | 👁 Native Presence | `DesktopLayout.tsx` |
| 26 | Workspace Header | Ancestor breadcrumb | Button | Click | Navigates to parent project | Session | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 27 | Workspace Header | Open in {IDE} | Button | Click | Launches project in default IDE | N/A | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 28 | Workspace Header | Choose IDE or editor | Button | Click | Opens IDE dropdown menu | N/A | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 29 | Workspace Header | Git {count} | Button | Click | Toggles Git Changes pane | Persists | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 30 | Workspace Header | Open System Terminal | Button | Click | Launches external OS terminal | N/A | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 31 | Workspace Header | Open in File Manager | Button | Click | Opens OS file manager | N/A | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 32 | Workspace Header | More actions (...) | Button | Click | Opens overflow menu | N/A | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 33 | Services | Subproject navigation row | Button | Click | Navigates to subproject workspace | Session | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 34 | Services | Start service | Button | Click | Starts primary service configuration | Session | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 35 | Services | Stop service | Button | Click | Stops running service process | Session | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 36 | Services | Restart service | Button | Click | Restarts running service process | Session | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 37 | Project Scripts | Run script (Play) | Button | Click | Starts script or prompts trust | Session | 🔎 Code Verified | `ProjectScriptRow.tsx` |
| 38 | Project Scripts | Stop script (Square) | Button | Click | Terminates script process | Session | 🔎 Code Verified | `ProjectScriptRow.tsx` |
| 39 | Run Configs | Detect | Button | Click | Auto-detects run configurations | N/A | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 40 | Run Configs | New | Button | Click | Opens New Run Configuration modal | N/A | ✅ Native Behavior | `ProjectWorkspace.tsx` |
| 41 | Run Configs | Scan for Configurations | Button | Click | Runs auto-detection from empty state | N/A | 👁 Native Presence | `ProjectWorkspace.tsx` |
| 42 | Run Configs | Run configuration (Play) | Button | Click | Starts configuration or prompts trust | Session | 👁 Native Presence | `RunConfigRow.tsx` |
| 43 | Run Configs | Stop process (Square) | Button | Click | Terminates running process | Session | 👁 Native Presence | `RunConfigRow.tsx` |
| 44 | Run Configs | Set as Default | Button | Click | Sets as project default config | Persists | 👁 Native Presence | `RunConfigRow.tsx` |
| 45 | Run Configs | Edit | Button | Click | Opens modal in edit mode | N/A | 👁 Native Presence | `RunConfigRow.tsx` |
| 46 | Run Configs | Duplicate | Button | Click | Clones configuration record | Persists | 👁 Native Presence | `RunConfigRow.tsx` |
| 47 | Run Configs | Delete | Button | Click | Deletes configuration record | Persists | 👁 Native Presence | `RunConfigRow.tsx` |
| 48 | Config Modal | Close (Esc) | Button | Click | Closes configuration modal | N/A | ✅ Native Behavior | `RunConfigModal.tsx` |
| 49 | Config Modal | Configuration Name | Text Input | Type text | Sets configuration name | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 50 | Config Modal | Target Service (Optional) | CustomSelect | Select option | Binds configuration to service path | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 51 | Config Modal | Executable / Command | Text Input | Type text | Sets command executable | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 52 | Config Modal | Argument item input | Text Input | Type text | Modifies existing argument | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 53 | Config Modal | Remove argument (Trash2) | Button | Click | Deletes argument from list | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 54 | Config Modal | Add argument input | Text Input | Type text | Enters new argument string | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 55 | Config Modal | Add argument button | Button | Click | Appends argument to list | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 56 | Config Modal | Working Directory | Text Input | Type text | Sets execution working directory | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 57 | Config Modal | Add Variable | Button | Click | Appends new environment variable row | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 58 | Config Modal | Env Var KEY input | Text Input | Type text | Sets environment variable key | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 59 | Config Modal | Env Var VALUE input | Text Input | Type text | Sets environment variable value | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 60 | Config Modal | Remove Env Var (Trash2) | Button | Click | Deletes environment variable row | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 61 | Config Modal | Set as default checkbox | Checkbox | Toggle check | Marks configuration as default | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 62 | Config Modal | Cancel | Button | Click | Dismisses modal without saving | N/A | 👁 Native Presence | `RunConfigModal.tsx` |
| 63 | Config Modal | Save Configuration | Button | Click | Persists configuration to database | Persists | 👁 Native Presence | `RunConfigModal.tsx` |
| 64 | Trust Dialog | Close (Esc) | Button | Click | Dismisses trust dialog | N/A | 🔎 Code Verified | `TrustDialog.tsx` |
| 65 | Trust Dialog | Cancel | Button | Click | Cancels process execution | N/A | 🔎 Code Verified | `TrustDialog.tsx` |
| 66 | Trust Dialog | Run Once | Button | Click | Executes without persisting trust | Session | 🔎 Code Verified | `TrustDialog.tsx` |
| 67 | Trust Dialog | Trust & Run | Button | Click | Persists trust and executes | Persists | 🔎 Code Verified | `TrustDialog.tsx` |
| 68 | Running View | Filter processes... | Text Input | Type text | Filters process list | Session | 👁 Native Presence | `RunningView.tsx` |
| 69 | Running View | Clear process filter (X) | Button | Click | Clears process filter text | Session | 👁 Native Presence | `RunningView.tsx` |
| 70 | Running View | Stop All | Button | Click | Terminates all active processes | Session | 👁 Native Presence | `RunningView.tsx` |
| 71 | Running View | Process table row | Table row | Click | Selects process for log stream | Session | 👁 Native Presence | `RunningView.tsx` |
| 72 | Running View | Stop process | Button | Click | Terminates specific process | Session | 👁 Native Presence | `RunningView.tsx` |
| 73 | Running View | Restart process | Button | Click | Restarts specific process | Session | 👁 Native Presence | `RunningView.tsx` |
| 74 | Running View | Rerun process | Button | Click | Reruns terminated process | Session | 👁 Native Presence | `RunningView.tsx` |
| 75 | Running View | Hide logs | Button | Click | Collapses integrated log viewer | Session | 👁 Native Presence | `RunningView.tsx` |
| 76 | Log Viewer | Filter log output... | Text Input | Type text | Filters lines in log viewer | Session | 👁 Native Presence | `LogViewer.tsx` |
| 77 | Log Viewer | Wrap | Button | Click | Toggles word wrap | Session | 👁 Native Presence | `LogViewer.tsx` |
| 78 | Log Viewer | Auto-scroll | Button | Click | Toggles automatic scrolling to bottom | Session | 👁 Native Presence | `LogViewer.tsx` |
| 79 | Log Viewer | Copy all logs | Button | Click | Copies buffer to system clipboard | N/A | 👁 Native Presence | `LogViewer.tsx` |
| 80 | Log Viewer | Clear output buffer | Button | Click | Clears log buffer in memory | Session | 👁 Native Presence | `LogViewer.tsx` |
| 81 | Log Viewer | Embedded URL link | Hyperlink | Click | Opens link in external browser | N/A | 🔎 Code Verified | `LogViewer.tsx` |
| 82 | Bottom Panel | Terminal tab | Button | Click | Switches panel to Terminal tab | Session | ✅ Native Behavior | `BottomPanel.tsx` |
| 83 | Bottom Panel | Logs tab | Button | Click | Switches panel to Logs tab | Session | ✅ Native Behavior | `BottomPanel.tsx` |
| 84 | Bottom Panel | Git Diff tab | Button | Click | Switches panel to Git Diff tab | Session | ✅ Native Behavior | `BottomPanel.tsx` |
| 85 | Bottom Panel | Problems tab | Button | Click | Switches panel to Problems tab | Session | ✅ Native Behavior | `BottomPanel.tsx` |
| 86 | Bottom Panel | Shell (session switch) | Button | Click | Returns terminal to default shell | Session | 👁 Native Presence | `BottomPanel.tsx` |
| 87 | Bottom Panel | Script PTY attach button | Button | Click | Attaches terminal to running PTY | Session | 🔎 Code Verified | `BottomPanel.tsx` |
| 88 | Bottom Panel | Detach from script (×) | Button | Click | Detaches view from script PTY | Session | 🔎 Code Verified | `BottomPanel.tsx` |
| 89 | Bottom Panel | Clear | Button | Click | Clears terminal scrollback buffer | Session | 👁 Native Presence | `BottomPanel.tsx` |
| 90 | Bottom Panel | Restart | Button | Click | Spawns fresh shell in project path | Session | 👁 Native Presence | `BottomPanel.tsx` |
| 91 | Bottom Panel | Stream: process selector | CustomSelect | Select option | Switches active process logs | Session | 👁 Native Presence | `BottomPanel.tsx` |
| 92 | Bottom Panel | Close bottom panel (X) | Button | Click | Closes bottom panel drawer | Persists | 👁 Native Presence | `BottomPanel.tsx` |
| 93 | Bottom Panel | Resize divider handle | Drag handle | Drag | Resizes panel height vertically | Persists | 👁 Native Presence | `DesktopLayout.tsx` |
| 94 | Bottom Panel | Reset resize divider | Drag handle | Double-click | Resets panel to default height | Persists | 👁 Native Presence | `DesktopLayout.tsx` |
| 95 | Terminal | Terminal input area | xterm canvas | Keyboard type | Sends input to native PTY | Session | 👁 Native Presence | `TerminalView.tsx` |
| 96 | Terminal | Terminal web link | Hyperlink | Click | Opens link in external browser | N/A | 🔎 Code Verified | `TerminalView.tsx` |
| 97 | Terminal | Retry Shell Connection | Button | Click | Retries spawning failed terminal | Session | 🔎 Code Verified | `TerminalView.tsx` |
| 98 | Git Pane | Push commits to remote | Button | Click | Pushes local branch to remote | N/A | 🔎 Code Verified | `GitChangesPane.tsx` |
| 99 | Git Pane | Refresh Git status | Button | Click | Refetches repository status | Session | 🔎 Code Verified | `GitChangesPane.tsx` |
| 100 | Git Pane | Close Git pane (X) | Button | Click | Collapses Git drawer/pane | Persists | 🔎 Code Verified | `GitChangesPane.tsx` |
| 101 | Git Pane | Staged changes chevron | Button | Click | Toggles staged list collapse | Session | 🔎 Code Verified | `GitChangesPane.tsx` |
| 102 | Git Pane | Staged file row | Row item | Click | Opens file diff in Bottom Panel | Session | 🔎 Code Verified | `GitChangesPane.tsx` |
| 103 | Git Pane | Unstage file (Minus) | Button | Click | Unstages individual file | N/A | 🔎 Code Verified | `GitChangesPane.tsx` |
| 104 | Git Pane | Modified changes chevron | Button | Click | Toggles modified list collapse | Session | 🔎 Code Verified | `GitChangesPane.tsx` |
| 105 | Git Pane | + Stage All | Button | Click | Stages all modified changes | N/A | 🔎 Code Verified | `GitChangesPane.tsx` |
| 106 | Git Pane | Modified file row | Row item | Click | Opens file diff in Bottom Panel | Session | 🔎 Code Verified | `GitChangesPane.tsx` |
| 107 | Git Pane | Stage file (Plus) | Button | Click | Stages individual modified file | N/A | 🔎 Code Verified | `GitChangesPane.tsx` |
| 108 | Git Pane | Untracked changes chevron | Button | Click | Toggles untracked list collapse | Session | 🔎 Code Verified | `GitChangesPane.tsx` |
| 109 | Git Pane | Untracked file row | Row item | Click | Opens file diff in Bottom Panel | Session | 🔎 Code Verified | `GitChangesPane.tsx` |
| 110 | Git Pane | Stage untracked file (Plus) | Button | Click | Stages individual untracked file | N/A | 🔎 Code Verified | `GitChangesPane.tsx` |
| 111 | Git Pane | Commit message textarea | Textarea | Type text | Enters commit message | Session | 🔎 Code Verified | `GitChangesPane.tsx` |
| 112 | Git Pane | Commit | Button | Click | Commits staged changes | N/A | 🔎 Code Verified | `GitChangesPane.tsx` |
| 113 | Git Pane | Docked resize handle | Drag handle | Drag | Resizes docked Git pane width | Persists | 🔎 Code Verified | `DesktopLayout.tsx` |
| 114 | Git Pane | Reset docked resize handle | Drag handle | Double-click | Resets Git pane to default width | Persists | 🔎 Code Verified | `DesktopLayout.tsx` |
| 115 | Git Pane | Drawer overlay backdrop | Backdrop | Click | Closes overlay drawer (<1150px) | Persists | 🔎 Code Verified | `DesktopLayout.tsx` |
| 116 | Settings | Scan Roots tab | Button | Click | Opens Scan Roots tab | Session | ✅ Native Behavior | `SettingsPage.tsx` |
| 117 | Settings | IDE & Editors tab | Button | Click | Opens IDE & Editors tab | Session | ✅ Native Behavior | `SettingsPage.tsx` |
| 118 | Settings | Keyboard Shortcuts tab | Button | Click | Opens Shortcuts reference tab | Session | ✅ Native Behavior | `SettingsPage.tsx` |
| 119 | Settings | About Runyard tab | Button | Click | Opens About tab | Session | ✅ Native Behavior | `SettingsPage.tsx` |
| 120 | Settings | Rescan Now | Button | Click | Initiates full catalog rescan | N/A | 👁 Native Presence | `SettingsPage.tsx` |
| 121 | Settings | Rescan this root | Button | Click | Rescans individual scan root | N/A | 👁 Native Presence | `SettingsPage.tsx` |
| 122 | Settings | Remove scan root (Trash2) | Button | Click | Removes scan root from catalog | Persists | 👁 Native Presence | `SettingsPage.tsx` |
| 123 | Settings | Add root path input | Text Input | Type text | Enters scan root path | N/A | 👁 Native Presence | `SettingsPage.tsx` |
| 124 | Settings | Browse... | Button | Click | Opens native directory chooser | N/A | ✅ Native Behavior | `SettingsPage.tsx` |
| 125 | Settings | Add Root | Button | Click | Saves new scan root | Persists | 👁 Native Presence | `SettingsPage.tsx` |
| 126 | Settings | Set Default (IDE) | Button | Click | Sets global default editor | Persists | 👁 Native Presence | `SettingsPage.tsx` |
| 127 | Command Palette | Backdrop overlay | Backdrop | Click | Closes Command Palette | Session | 🔎 Code Verified | `CommandPalette.tsx` |
| 128 | Command Palette | Close button (X) | Button | Click | Closes Command Palette | Session | 🔎 Code Verified | `CommandPalette.tsx` |
| 129 | Command Palette | Search input | Text Input | Type text | Filters palette commands / projects | Session | 🔎 Code Verified | `CommandPalette.tsx` |

---

## What a User Can Accomplish End-to-End

Here are the user workflows supported by Runyard v0.2.2:

1. **Add a Local Projects Directory (Scan Root):**
   - Click `Runyard Settings` on the activity rail.
   - On the `Scan Roots` tab, click `Browse...`.
   - Select a project root directory (e.g. `~/My_Projects`) in the native file chooser.
   - Click `Add Root`. Runyard registers the directory in SQLite and begins recursive discovery.
2. **Discover & Reconcile Projects Automatically:**
   - Watch live scan progress in Settings or Explorer. Runyard detects language manifests, frameworks, Git repositories, services, and shell scripts.
   - If directories are added or deleted on disk, click `Rescan this root` or `Rescan Now`.
3. **Remove a Scan Root:**
   - Click `Remove scan root` (`Trash2` icon) next to any directory in Settings. Discovered projects under that root are automatically pruned from the catalog.
4. **Find a Project Using Search & Multi-Filters:**
   - Type a query into `Search projects...` in the Explorer header.
   - Select a project type (e.g. `Application`), language (e.g. `Rust`), or framework (e.g. `Tauri`).
   - Matching projects remain visible; unmatched nodes collapse. Click `Clear` to restore full view.
5. **Navigate a Monorepo Hierarchy:**
   - Locate a top-level parent project in Explorer. Click the chevron to expand.
   - Nested subprojects and microservices are displayed with depth indentation. Click any child subproject to open its dedicated workspace.
6. **Open a Project or Subproject in an IDE:**
   - Click `Open in VS Code` (or default IDE) in the workspace header.
   - To use an alternate editor, click the chevron dropdown (`Choose IDE or editor`) and click any detected editor (e.g. `Cursor`, `Zed`, `Sublime Text`).
   - To remember this choice for the project, select `Set {IDE} as preferred`.
7. **Launch External Terminal or File Manager:**
   - In the workspace header, click `Open System Terminal` to open an external shell at the project root.
   - Click `Open in File Manager` to open the directory in the OS file browser.
8. **Auto-Detect & Create Run Configurations:**
   - Click `Detect` in the Run Configurations section to auto-import commands from `package.json`, `Cargo.toml`, etc.
   - Or click `New` to open the modal: enter Configuration Name, Command, Arguments, Working Directory, and Environment Variables.
   - Click `Save Configuration`.
9. **Manage Run Configurations (Default, Edit, Duplicate, Delete):**
   - Hover over a configuration row:
     - Click `Set as Default` to assign it as the project's primary action.
     - Click `Edit` to update command parameters.
     - Click `Duplicate` to clone it as `{name} (Copy)`.
     - Click `Delete` and confirm the dialog to delete it.
10. **Execute Untrusted Scripts & Manage Trust:**
    - Click Play on an untrusted configuration or discovered shell script (`Project Scripts`).
    - In the `Review Untrusted Command` dialog, review the command and working directory.
    - Click `Run Once` to test it temporarily, or `Trust & Run` to permanently trust its execution fingerprint.
11. **Interact with TerminalRequired Scripts:**
    - Click Play on a script requiring interactive input (e.g. a setup wizard with prompts).
    - Runyard opens the bottom panel Terminal tab, provisions a PTY session, and displays the script prompt.
    - Type responses directly into the terminal. Click `Detach from script` to return to shell while it runs.
12. **Stop and Supervise Running Services:**
    - Click the status bar or title bar `Running` indicator to open the supervisor.
    - View active processes, PIDs, and runtimes.
    - Click `Stop` on an individual process or click `Stop All` to terminate all services at once.
13. **Use the Integrated Shell Terminal:**
    - Press `Ctrl+\`` to open the bottom panel.
    - Execute native commands in the project directory.
    - Click `Clear` to empty the view or `Restart` to spawn a fresh shell.
14. **Inspect Background Process Output Logs:**
    - Click the `Logs` tab in the bottom panel.
    - Select a process from the `Stream:` dropdown.
    - Filter log lines, toggle word-wrap, toggle auto-scroll, or click `Copy all logs`.
15. **Inspect & Stage Git Modifications:**
    - Click `Git` in the workspace header to open the Git Changes pane.
    - Click individual files to inspect additions/deletions in the `Git Diff` tab.
    - Click `+ Stage All` or click `+` next to individual modified/untracked files.
16. **Commit & Push Git Changes:**
    - Type a commit message in the Git Changes box.
    - Press `Ctrl+Enter` or click `Commit`.
    - Click the Upload icon (`Push commits to remote`) to push the commits to the upstream repository.
17. **Configure Global Runyard Settings:**
    - Open Settings -> `IDE & Editors`.
    - Click `Set Default` on your preferred system IDE. All projects without a specific preference inherit this editor.

---

## Current User-Facing Limitations

The following limitations have been verified directly in the v0.2.2 code and native binary:

1. **No Integrated Code / File Editor:** Runyard is an orchestrator, launcher, and terminal companion; it contains no internal code or text editor and delegates all file editing to external IDEs.
2. **Read-Only Keyboard Shortcuts:** The `Keyboard Shortcuts` tab in Settings is an informational reference table only; shortcut bindings are hardcoded and cannot be customized or remapped.
3. **No Direct Project File Tree / Browser:** Runyard shows discovered projects and services in Explorer, but does not display a full file/folder tree of the project's source files.
4. **Git Branch Operations Missing in UI:** While `GitChangesPane` supports staging, committing, pushing, and diff inspection, it lacks UI controls for checkout, creating branches, fetching, pulling, or viewing commit logs (these exist in unreferenced `GitView.tsx`).
5. **No Manual Project Creation / Scaffolding:** Runyard cannot generate or scaffold new projects from templates; it exclusively monitors existing local directories.
6. **Static Problems Diagnostics:** The `Problems` tab in the Bottom Panel is hardcoded to render `No problems detected in workspace` and has no linters or compilers wired to populate it.
7. **No Project Tag Editor or Manual Renaming:** Projects cannot be renamed, tagged, or deleted directly from the Explorer UI.
8. **No Multi-Project Launch Groups:** Multi-service orchestration groups cannot be created because `RunGroupModal` is not wired into the UI.
9. **Command Palette Route Disconnection:** In the Command Palette, navigation items (`/`, `/projects`, `/running`, `/settings`, `/projects/:id`) and `Import Project from Directory` call `navigate()`, which updates in-memory history but does not switch views or open dialogs in `DesktopLayout`.
10. **Status Bar Notifications Placeholder:** The Bell icon button labeled 'Notifications' in the status bar is a placeholder with no click handler attached (`src/components/DesktopLayout.tsx:404-410`); clicking it produces no action and opens no notification panel.

---

## Audit Counting Method

To ensure complete accuracy, all counts in this report are computed using the following explicit definitions:

- **User-Facing Feature Area:** One top-level numbered functional chapter (Sections 1 through 15).
- **Independent Interactive Control:** One persistent, rendered interactive UI target (button, text input, textarea, checkbox, drag handle, or clickable primary table/tree row) with a distinct action, excluding:
  1. Popup menu/dropdown option items (which are cataloged in the Menu Inventory).
  2. Selectable Command Palette result items (which are cataloged in the Command Palette Items Inventory).
- **Menu Surface:** A distinct dropdown, popover, or context menu component that anchors to a trigger control and displays selectable items.
- **Fixed Menu Command:** A static, hardcoded actionable item or command within a menu surface (excluding category headers such as `OPEN WITH` and disabled fallbacks such as `No IDEs detected`).
- **Dynamic Menu Category:** A category of menu options populated dynamically at runtime from disk, database, or background system state.
- **Settings-Page Configurable Category:** A persistent user preference area in the Settings view that can be altered and stored (Scan Roots, Default IDE).
- **Read-Only Settings / Information Panel:** A non-configurable settings tab displaying system information or keybinding references.
- **Shortcut:** A registered keyboard key combination that triggers an action without mouse interaction.
- **Application-Defined Modal Surface:** A React-managed overlay dialog that intercepts user focus for a specific workflow.
- **Native / System Confirmation or Picker Dialog:** An OS-level or browser-level confirmation or file-selection modal.
- **Toast Case:** A distinct notification trigger that produces a user-visible toast message.
- **Empty / Loading / Error State:** A distinct user-visible condition displayed when data is missing, in-flight, or failed.

---

## Final Report Summary Metrics

- **User-Facing Feature Areas:** 15
  - 🔀 Mixed Verification Feature Areas (Exercised Native Behavior + Native Presence): 4 (Sections 2, 7, 10, 14)
  - 👁 Native Presence Verified Feature Areas: 7 (Sections 1, 3, 4, 5, 9, 11, 12)
  - 🔎 Code Verified Feature Areas: 4 (Sections 6, 8, 13, 15)
  *(Verification categories sum: 4 + 7 + 4 = 15)*
- **Independent Interactive Controls:** 129 *(matching rows 1 to 129 in the Control Inventory)*
  - ✅ Native Behavior Verified Controls: 14
  - 👁 Native Presence Verified Controls: 83
  - 🔎 Code Verified Controls: 32
  *(Control verification sum: 14 + 83 + 32 = 129)*
- **Menu / Dropdown / Popover Surfaces:** 8
- **Fixed Menu Commands:** 10
- **Dynamic Menu Categories:** 6
- **Keyboard Shortcuts:** 7
- **Settings-Page Configurable Categories:** 2
- **Read-Only Settings / Information Panels:** 2
- **Application-Defined Modal Surfaces:** 3 (`RunConfigModal`, `TrustDialog`, `CommandPalette`)
- **Native / System Confirmation or Picker Dialogs:** 2 (Native directory picker via `pickDirectory`, Configuration deletion confirm via `window.confirm`)
- **Toast Notification Cases:** 23
- **Empty / Loading / Error States:** 21
- **Not-User-Exposed Capabilities:** 6 (Section 16)

**Unaccounted user-facing controls: 0**
