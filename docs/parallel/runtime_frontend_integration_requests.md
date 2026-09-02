# Runtime Frontend Integration Requests & Notes

This document describes additive native runtime improvements and API contracts established in Track A (Native Runtime Hardening) for future frontend integration (Track B).

---

## 1. Trust Fingerprint Security Model (Additive Field)

### Background
Trust is now cryptographically bound to the execution semantics of the run configuration rather than merely a database row ID. If the command, arguments, working directory, environment variables, or env file are edited, the configuration automatically becomes untrusted until explicitly approved by the user.

### Additive Field on `RunConfiguration`
- `trusted_fingerprint: Option<String>`: Contains the SHA-256 hash of the trusted execution parameters.
  - Defaults to `null` on new / detected configurations.
  - When calling `trust_run_config(id)`, the backend computes the fingerprint and persists it alongside `is_trusted = true`.
  - If the user saves modifications to a previously trusted configuration via `save_run_config(config)`, the backend automatically resets `is_trusted = false` and `trusted_fingerprint = null` if the execution parameters no longer match the fingerprint.

### Frontend Integration Recommendation
- If a user modifies command/args/env/cwd in the Run Configuration Modal, the UI can inform the user: *"Modifying execution commands will require re-approving trust."*
- To re-trust an edited configuration, invoke `trust_run_config(id)`.

---

## 2. Additive Command: `run_untrusted_once`

### Purpose
Allows executing a configuration for a single run without persisting persistent trust in the SQLite database.

### IPC Command Signature
```ts
invoke<string>('run_untrusted_once', { runConfigId: string })
```
- Returns the generated `process_id: string`.
- Does not persist `is_trusted = true` to the database.

---

## 3. Accurate Process Lifecycle Statuses

### Available States in `ProcessStatus`
- `"Starting"`: Child process is spawning.
- `"Running"`: Child process is actively executing.
- `"Stopping"`: Stop signal has been sent to process group; waiting for graceful termination.
- `"Stopped"`: Process was terminated by user or shutdown.
- `"Exited"`: Process completed execution naturally. `exit_code: number | null` contains the return code (0 for success, non-zero for natural failure).
- `"Failed"`: Process failed to spawn or encountered abnormal error.

---

## 4. PTY UTF-8 Streaming & Resizing

- Multi-byte UTF-8 sequences (emojis, Unicode symbols) are now streamed cleanly across chunk boundaries without generating replacement characters (`\u{FFFD}`).
- `resize_pty_session` and `write_pty_session` return structured errors if an invalid `session_id` is passed.
- PTY child shell processes are automatically reaped when terminal tabs close or when Runyard exits.
