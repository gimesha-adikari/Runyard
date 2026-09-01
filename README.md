# Runyard

**Your local development command center.**

Runyard is a production-quality, local-first desktop application designed for developers to discover, organize, inspect, and safely run local projects and multi-service development environments.

---

## Key Features

- **Project Discovery & Scanning**: Automatically scans configured local directory roots (e.g. `~/My_Projects`) for software projects across Node.js (npm/pnpm/yarn/bun), Rust, Go, Python (uv/Poetry/pip), Java (Maven/Gradle/Spring Boot), .NET, Docker Compose, and Make. Smart filters skip dependencies (`node_modules`, `vendor`), build targets (`target`, `dist`, `build`), virtual environments (`.venv`), and internal tool directories.
- **Pre-Import Path Inspection**: Inspect discovered frameworks, languages, services, and run commands before importing into the catalog.
- **Multi-Service & Monorepo Support**: Discovers nested service components (e.g., frontend, backend, workers) within a repository and provides isolated service profiles.
- **Multi-Service Run Groups**: Define multi-service execution groups to launch, stop, and monitor complete development environments with a single click.
- **Integrated PTY Terminal**: Native PTY-backed terminal emulator powered by `portable-pty` and `@xterm/xterm` with automatic resizing and ANSI streaming.
- **Interactive Git Management**: Full Git workflow support including branch switching, branch creation, staged/modified/untracked change inspection, commit history, interactive file diffs, and safe fetch/pull actions.
- **IDE Discovery & "Open With"**: Multi-source editor detection across standard `PATH`, `.desktop` entries, JetBrains Toolbox, Flatpak, and Snap. Configure global and per-project preferred IDEs with quick "Open in IDE" and "Open With..." options.
- **Execution Safety & First-Run Trust**: Automatically detected commands require explicit user review and approval ("Run Once" or "Trust & Run") before execution. Never runs untrusted repository-controlled code automatically.
- **Structured Run Configurations**: Create, edit, duplicate, and customize run configurations with arguments arrays, custom working directories, and environment variable overrides.
- **Managed Process Lifecycle & Live Logs**: Start, stop, and restart processes with full process group termination on Unix to avoid orphaned child processes. Includes live log filtering, auto-scroll toggles, stream colorization (stdout/stderr), and output buffer clearing.
- **Command Palette (`Ctrl+K` / `Cmd+K`)**: Global keyboard navigation across projects, pages, and quick actions.
- **Local SQLite Persistence**: Persistent storage with automatic schema migrations for projects, services, run groups, favorites, tags, scan roots, IDE preferences, and trusted run configurations.

---

## Technology Stack

- **Desktop Framework**: Tauri 2 (Rust)
- **Terminal Subsystem**: `portable-pty` (Rust) + `@xterm/xterm` (React)
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
  sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev librsvg2-dev build-essential libayatana-appindicator3-dev
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

# Rust backend unit and integration tests
cd src-tauri && cargo test
```

### Build Production Binary

```bash
npm run tauri build
```
Release bundles will be produced in `src-tauri/target/release/bundle/` (.deb, .rpm, .AppImage) and `src-tauri/target/release/runyard`.
