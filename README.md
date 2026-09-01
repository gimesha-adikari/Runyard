# Runyard

**Your local development command center.**

Runyard is a production-quality, local-first desktop application designed for developers to discover, organize, inspect, and safely run local projects and multi-service development environments.

---

## Key Features

- **Project Discovery & Scanning**: Automatically scans configured local directory roots (e.g. `~/My_Projects`) for software projects across Node.js, Rust, Go, Python, Java (Maven/Gradle), .NET, Docker Compose, and Make. Skips dependencies (`node_modules`, `vendor`), build directories (`target`, `dist`, `build`), virtual environments (`.venv`), and internal tool directories.
- **Explicit Project Import**: Manually import any folder on your machine as a project.
- **Git State Inspection**: Real-time read-only Git status including current branch, upstream tracking, ahead/behind commit counts, dirty file counters (modified, staged, untracked), and recent commit log.
- **IDE & Editor Integration**: Detects installed editors (VS Code, Cursor, Zed, Neovim, IntelliJ IDEA, Sublime Text, Antigravity) across standard `PATH`, Snap, and Flatpak installations. Offers one-click "Open in IDE", "Open Folder", and "Open Terminal".
- **Runtime & Run-Command Suggestions**: Suggests executable development scripts without automatic execution.
- **Execution Safety & First-Run Trust**: Automatically detected commands require explicit user review and approval ("Run Once" or "Trust & Run") before execution. Never runs untrusted repository-controlled code automatically.
- **Managed Process Lifecycle**: Start, stop, and restart project services with process group termination on Unix to avoid orphaned child processes.
- **Real-Time Streamed Logs**: Bounded ring buffer log streaming for process stdout and stderr with timestamping and stream categorization.
- **Command Palette (`Ctrl+K` / `Cmd+K`)**: Rapid global keyboard search across projects and actions.
- **Local SQLite Persistence**: Persistent storage for projects, favorites, tags, scan roots, IDE preferences, and trusted run configurations.

---

## Technology Stack

- **Desktop Framework**: Tauri 2 (Rust)
- **Frontend UI**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4 (Zinc dark theme with Emerald accent)
- **Icons**: Lucide React
- **State Management**: TanStack Query v5 + Zustand
- **Database**: SQLite (via `rusqlite` bundled)

---

## Security Model

1. **Local-First & Zero Telemetry**: Runyard runs strictly on your machine. No accounts, cloud telemetry, or external network requests.
2. **Execution Trust Boundary**: The frontend cannot invoke arbitrary shell strings. All executions pass through validated run configurations with explicit user trust verification.
3. **Restricted Tauri Permissions**: Capabilities strictly restrict filesystem and IPC invocations to application-owned commands.
4. **Child Process Group Termination**: Processes are spawned in dedicated process groups to ensure complete cleanup on stop or restart.

---

## Development & Building

### Prerequisites

- **Node.js**: v18+ (tested on Node v24)
- **Rust**: 1.80+ (stable toolchain)
- **System Libraries (Linux / Ubuntu)**:
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev librsvg2-dev build-essential
  ```

### Install Dependencies

```bash
npm install
```

### Run in Development Mode

```bash
npm run tauri dev
```

### Run Tests

```bash
# Frontend typecheck & build
npm run build

# Rust backend tests
cd src-tauri && cargo test
```

### Build Production Binary

```bash
npm run tauri build
```
