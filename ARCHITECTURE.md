# Runyard Architecture & Technical Specification

This document details the architectural design, module boundaries, and execution models of the **Runyard** local development command center.

---

## 1. System Overview

Runyard follows a decoupled architecture using Tauri 2 as the native host and React with TypeScript as the frontend renderer. Privileged operations (filesystem scanning, SQLite persistence, process lifecycle management, Git inspection, and IDE launching) reside in the Rust native layer.

```
┌────────────────────────────────────────────────────────┐
│               React + TypeScript Frontend              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Pages/Views │  │  UI Zustand  │  │ TanStack Qry │  │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘  │
│         └─────────────────┬─────────────────┘          │
│                    tauriApi (IPC)                      │
└───────────────────────────┼────────────────────────────┘
                            │ Tauri IPC Commands
┌───────────────────────────┼────────────────────────────┐
│                    Rust Native Core                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Commands   │  │   Scanner    │  │   Detector   │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Process Mgr │  │ Git Service  │  │ IDE Provider │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│  ┌──────┴───────┐                                      │
│  │ SQLite DB    │                                      │
│  └──────────────┘                                      │
└────────────────────────────────────────────────────────┘
```

---

## 2. Core Modules

### 2.1 Database & Persistence (`src-tauri/src/db.rs`)
- Embeds SQLite using `rusqlite` bundled.
- Stores database at `$XDG_DATA_HOME/runyard/runyard.db` (or platform equivalent).
- Tables:
  - `projects`: Primary metadata, tags, timestamps, git and IDE preferences.
  - `scan_roots`: Configured root scan directories.
  - `run_configurations`: Runnable service commands, arguments, working directories, and trust status.
  - `app_settings`: Key-value application configuration store.
  - `schema_version`: Migration tracking.

### 2.2 Project Scanner (`src-tauri/src/scanner.rs`)
- Non-recursive symlink traversal bounded to depth 5.
- Prunes dependency directories (`node_modules`, `vendor`, `.venv`, `.git`, `target`, `build`, `dist`).
- Identifies projects by marker files: `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements.txt`, `pom.xml`, `build.gradle`, `.sln`, `.csproj`, `docker-compose.yml`, `compose.yml`, `Makefile`, `.git`.

### 2.3 Project & Runtime Detectors (`src-tauri/src/detector.rs`, `src-tauri/src/runtime_detector.rs`)
- Extracts languages and framework dependencies safely without invoking repository code.
- Generates detected `RunConfiguration` proposals (e.g. `npm run dev`, `cargo run`, `go run .`, `python manage.py runserver`, `docker compose up`).

### 2.4 Git Service (`src-tauri/src/git.rs`)
- Interfaces with the system Git binary for read-only repository inspection.
- Queries branch names, remote URLs, status porcelain counters (staged, modified, untracked), ahead/behind tracking, and recent commit log.

### 2.5 Process Manager (`src-tauri/src/process_manager.rs`)
- Manages spawned subprocesses through Tokio async tasks.
- Spawns children with `process_group(0)` on Unix, enabling clean teardown of child process trees via SIGTERM on the negative PGID.
- Captures `stdout` and `stderr` asynchronously into a bounded 10,000-line memory ring buffer.

### 2.6 IDE Service (`src-tauri/src/ide.rs`)
- Discovers installed editors across PATH and system directories.
- Launches projects into selected IDEs, default system file manager (`xdg-open`), or system terminal emulator.

---

## 3. Run Configuration & Trust Lifecycle

```
[Project Discovered / Imported]
              │
              ▼
[Runtime Detector Proposes Commands]
              │ (Source: Detected, is_trusted: false)
              ▼
    [User Clicks "Run"]
              │
    ┌─────────┴─────────┐
    │ Is config trusted?│
    └────┬─────────┬────┘
         │ No      │ Yes
         ▼         │
 [Trust Dialog]    │
  - Cancel         │
  - Run Once       │
  - Trust & Run    │
         │         │
         └─────────┼──────────┐
                   ▼          ▼
            [ProcessManager Spawns]
                   │
                   ▼
         [Stream Logs & Output]
```
