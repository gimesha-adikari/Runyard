use crate::error::{Result, RunyardError};
use crate::models::{Project, RunConfigSource, RunConfiguration, Service};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScanState {
    Idle,
    Queued,
    Scanning,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub root_id: String,
    pub root_path: String,
    pub state: ScanState,
    pub directories_inspected: usize,
    pub projects_found: usize,
    pub services_found: usize,
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

struct RootScanState {
    _id: String,
    path: String,
    state: ScanState,
    generation: u64,
    cancellation_token: Arc<AtomicBool>,
    progress: ScanProgress,
}

struct ScanRequest {
    root_id: String,
    root_path: String,
    generation: u64,
    cancellation_token: Arc<AtomicBool>,
    app_handle: Option<AppHandle>,
}

pub const SCAN_QUEUE_CAPACITY: usize = 16;

pub struct ScanCoordinator {
    states: Arc<std::sync::Mutex<HashMap<String, RootScanState>>>,
    tx: mpsc::Sender<ScanRequest>,
    rx: std::sync::Mutex<Option<mpsc::Receiver<ScanRequest>>>,
    started: AtomicBool,
    app_handle: std::sync::Mutex<Option<AppHandle>>,
}

fn emit_progress(app_handle: Option<&AppHandle>, progress: &ScanProgress) {
    if let Some(app) = app_handle {
        let _ = app.emit("scan-progress", progress);
    }
}

impl Default for ScanCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

impl ScanCoordinator {
    /// Synchronous and cheap. Must NOT spawn any Tokio task or require a running reactor.
    pub fn new() -> Self {
        Self::with_capacity(SCAN_QUEUE_CAPACITY)
    }

    /// Creates a coordinator with a specific bounded queue capacity.
    pub fn with_capacity(capacity: usize) -> Self {
        let states = Arc::new(std::sync::Mutex::new(HashMap::new()));
        let (tx, rx) = mpsc::channel::<ScanRequest>(capacity);

        Self {
            states,
            tx,
            rx: std::sync::Mutex::new(Some(rx)),
            started: AtomicBool::new(false),
            app_handle: std::sync::Mutex::new(None),
        }
    }

    /// Total bounded queue capacity.
    pub fn queue_capacity(&self) -> usize {
        self.tx.max_capacity()
    }

    /// Remaining available queue slots.
    pub fn remaining_capacity(&self) -> usize {
        self.tx.capacity()
    }

    /// Check if the coordinator worker has been started.
    pub fn is_started(&self) -> bool {
        self.started.load(Ordering::SeqCst)
    }

    /// Starts the coordinator worker on Tauri's async runtime.
    /// Idempotent: Calling start multiple times will NEVER launch multiple worker loops.
    pub fn start(&self, app_handle: Option<AppHandle>) {
        if let Some(app) = app_handle.clone() {
            if let Ok(mut h_lock) = self.app_handle.lock() {
                *h_lock = Some(app);
            }
        }

        // Idempotently ensure only one worker loop is ever spawned
        if self
            .started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let mut rx = match self.rx.lock().unwrap().take() {
            Some(r) => r,
            None => return,
        };

        let states_worker = self.states.clone();
        let fallback_app = app_handle;

        tauri::async_runtime::spawn(async move {
            while let Some(req) = rx.recv().await {
                // Check if cancelled before starting
                if req.cancellation_token.load(Ordering::SeqCst) {
                    continue;
                }

                // Check generation & update to scanning
                {
                    let mut lock = states_worker.lock().unwrap();
                    if let Some(st) = lock.get_mut(&req.root_id) {
                        if st.generation != req.generation || st.state == ScanState::Cancelled {
                            continue;
                        }
                        st.state = ScanState::Scanning;
                        st.progress.state = ScanState::Scanning;
                        let target_app = req.app_handle.as_ref().or(fallback_app.as_ref());
                        emit_progress(target_app, &st.progress);
                    }
                }

                // Run scan in blocking task (concurrency = 1 since we await each)
                let req_root_id = req.root_id.clone();
                let req_root_path = req.root_path.clone();
                let req_generation = req.generation;
                let token = req.cancellation_token.clone();
                let app_handle_clone = req.app_handle.clone().or_else(|| fallback_app.clone());
                let states_for_scan = states_worker.clone();

                let scan_result = tauri::async_runtime::spawn_blocking(move || {
                    execute_root_scan(
                        &req_root_id,
                        &req_root_path,
                        req_generation,
                        &token,
                        app_handle_clone.as_ref(),
                        states_for_scan,
                    )
                })
                .await;

                // Finalize state
                let mut lock = states_worker.lock().unwrap();
                if let Some(st) = lock.get_mut(&req.root_id) {
                    if st.generation == req.generation {
                        let target_app = req.app_handle.as_ref().or(fallback_app.as_ref());
                        match scan_result {
                            Ok(Ok(final_progress)) => {
                                if st.state != ScanState::Cancelled {
                                    st.state = ScanState::Completed;
                                    st.progress = final_progress;
                                    st.progress.state = ScanState::Completed;
                                    emit_progress(target_app, &st.progress);
                                }
                            }
                            Ok(Err(err)) => {
                                if st.state != ScanState::Cancelled {
                                    st.state = ScanState::Failed;
                                    st.progress.state = ScanState::Failed;
                                    st.progress.error = Some(err.to_string());
                                    emit_progress(target_app, &st.progress);
                                }
                            }
                            Err(join_err) => {
                                if st.state != ScanState::Cancelled {
                                    st.state = ScanState::Failed;
                                    st.progress.state = ScanState::Failed;
                                    st.progress.error = Some(join_err.to_string());
                                    emit_progress(target_app, &st.progress);
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    /// Request a scan for a specific root.
    /// If root is already Queued or Scanning, coalesces request and returns false.
    /// Otherwise enqueues scan and returns true.
    pub async fn request_scan(
        &self,
        root_id: &str,
        root_path: &str,
        app_handle: Option<AppHandle>,
    ) -> bool {
        // Ensure worker is running if inside an async runtime
        if !self.is_started() {
            self.start(app_handle.clone());
        }

        let mut lock = self.states.lock().unwrap();
        if let Some(existing) = lock.get_mut(root_id) {
            if existing.state == ScanState::Queued || existing.state == ScanState::Scanning {
                // Coalesce! Already queued or active.
                return false;
            }
        }

        let target_app = app_handle.clone();
        let (generation, token) = if let Some(existing) = lock.get_mut(root_id) {
            existing.generation += 1;
            existing.cancellation_token = Arc::new(AtomicBool::new(false));
            existing.path = root_path.to_string();
            (existing.generation, existing.cancellation_token.clone())
        } else {
            (1, Arc::new(AtomicBool::new(false)))
        };

        let req = ScanRequest {
            root_id: root_id.to_string(),
            root_path: root_path.to_string(),
            generation,
            cancellation_token: token.clone(),
            app_handle,
        };

        // Try to send into bounded queue without blocking!
        match self.tx.try_send(req) {
            Ok(()) => {
                let progress = ScanProgress {
                    root_id: root_id.to_string(),
                    root_path: root_path.to_string(),
                    state: ScanState::Queued,
                    directories_inspected: 0,
                    projects_found: 0,
                    services_found: 0,
                    elapsed_ms: 0,
                    error: None,
                };
                emit_progress(target_app.as_ref(), &progress);

                if let Some(existing) = lock.get_mut(root_id) {
                    existing.state = ScanState::Queued;
                    existing.progress = progress;
                } else {
                    lock.insert(
                        root_id.to_string(),
                        RootScanState {
                            _id: root_id.to_string(),
                            path: root_path.to_string(),
                            state: ScanState::Queued,
                            generation,
                            cancellation_token: token,
                            progress,
                        },
                    );
                }
                true
            }
            Err(mpsc::error::TrySendError::Full(_)) => {
                let error_msg = format!(
                    "Scan queue is full (capacity {}). Wait for running scans to finish.",
                    self.tx.max_capacity()
                );
                log::warn!("Scan request for root '{}' rejected: queue full", root_id);

                let progress = ScanProgress {
                    root_id: root_id.to_string(),
                    root_path: root_path.to_string(),
                    state: ScanState::Failed,
                    directories_inspected: 0,
                    projects_found: 0,
                    services_found: 0,
                    elapsed_ms: 0,
                    error: Some(error_msg),
                };
                emit_progress(target_app.as_ref(), &progress);

                if let Some(existing) = lock.get_mut(root_id) {
                    existing.state = ScanState::Failed;
                    existing.progress = progress;
                } else {
                    lock.insert(
                        root_id.to_string(),
                        RootScanState {
                            _id: root_id.to_string(),
                            path: root_path.to_string(),
                            state: ScanState::Failed,
                            generation,
                            cancellation_token: token,
                            progress,
                        },
                    );
                }
                false
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {
                let error_msg = "Scan coordinator worker channel is closed".to_string();
                log::error!(
                    "Scan request for root '{}' rejected: channel closed",
                    root_id
                );

                let progress = ScanProgress {
                    root_id: root_id.to_string(),
                    root_path: root_path.to_string(),
                    state: ScanState::Failed,
                    directories_inspected: 0,
                    projects_found: 0,
                    services_found: 0,
                    elapsed_ms: 0,
                    error: Some(error_msg),
                };
                emit_progress(target_app.as_ref(), &progress);

                if let Some(existing) = lock.get_mut(root_id) {
                    existing.state = ScanState::Failed;
                    existing.progress = progress;
                } else {
                    lock.insert(
                        root_id.to_string(),
                        RootScanState {
                            _id: root_id.to_string(),
                            path: root_path.to_string(),
                            state: ScanState::Failed,
                            generation,
                            cancellation_token: token,
                            progress,
                        },
                    );
                }
                false
            }
        }
    }

    /// Cancels in-flight scan for root and invalidates any pending results.
    pub async fn cancel_root_scan(&self, root_id: &str, app_handle: Option<&AppHandle>) {
        let mut lock = self.states.lock().unwrap();
        if let Some(existing) = lock.get_mut(root_id) {
            existing.cancellation_token.store(true, Ordering::SeqCst);
            existing.generation += 1;
            existing.state = ScanState::Cancelled;
            existing.progress.state = ScanState::Cancelled;
            emit_progress(app_handle, &existing.progress);
        }
    }

    /// Returns current progress for all known roots.
    pub async fn get_all_progress(&self) -> HashMap<String, ScanProgress> {
        let lock = self.states.lock().unwrap();
        lock.iter()
            .map(|(k, v)| (k.clone(), v.progress.clone()))
            .collect()
    }

    /// Returns whether any scan is currently queued or active.
    pub async fn is_any_scanning(&self) -> bool {
        let lock = self.states.lock().unwrap();
        lock.values()
            .any(|s| s.state == ScanState::Queued || s.state == ScanState::Scanning)
    }

    /// Wait until all queued/active scans finish (useful for integration tests).
    pub async fn wait_for_idle(&self, timeout: Duration) -> bool {
        let start = Instant::now();
        loop {
            if !self.is_any_scanning().await {
                return true;
            }
            if start.elapsed() > timeout {
                return false;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    }
}

fn execute_root_scan(
    root_id: &str,
    root_path: &str,
    generation: u64,
    cancellation_token: &AtomicBool,
    app_handle: Option<&AppHandle>,
    states: Arc<std::sync::Mutex<HashMap<String, RootScanState>>>,
) -> Result<ScanProgress> {
    let start_time = Instant::now();
    let p = Path::new(root_path);

    if !p.exists() || !p.is_dir() {
        return Err(RunyardError::Validation(format!(
            "Scan root path '{}' does not exist or is not a directory",
            root_path
        )));
    }

    let mut last_emit = Instant::now();
    let throttle_interval = Duration::from_millis(150);

    let progress_cell = std::sync::Mutex::new(ScanProgress {
        root_id: root_id.to_string(),
        root_path: root_path.to_string(),
        state: ScanState::Scanning,
        directories_inspected: 0,
        projects_found: 0,
        services_found: 0,
        elapsed_ms: 0,
        error: None,
    });

    // Single-pass streaming scan
    let scanned_projects = crate::scanner::scan_directory_streaming(
        root_path,
        cancellation_token,
        |dirs_inspected, projects_count, services_count| {
            let mut curr = progress_cell.lock().unwrap();
            curr.directories_inspected = dirs_inspected;
            curr.projects_found = projects_count;
            curr.services_found = services_count;
            curr.elapsed_ms = start_time.elapsed().as_millis() as u64;

            let now = Instant::now();
            if now.duration_since(last_emit) >= throttle_interval {
                last_emit = now;
                emit_progress(app_handle, &curr);

                // Update coordinator state snapshot synchronously without spawning any task!
                if let Ok(mut lock) = states.lock() {
                    if let Some(st) = lock.get_mut(root_id) {
                        if st.generation == generation && st.state == ScanState::Scanning {
                            st.progress = curr.clone();
                        }
                    }
                }
            }
        },
    )?;

    if cancellation_token.load(Ordering::SeqCst) {
        return Err(RunyardError::Validation("Scan was cancelled".to_string()));
    }

    // Connect to database and verify scan root still exists and is enabled
    let mut conn = crate::db::get_connection()?;

    let root_valid: bool = conn
        .query_row(
            "SELECT count(*) FROM scan_roots WHERE id = ? AND enabled = 1",
            [root_id],
            |r| r.get(0),
        )
        .unwrap_or(0)
        > 0;

    if !root_valid || cancellation_token.load(Ordering::SeqCst) {
        // Discard results! Root was removed while scan was in progress.
        return Err(RunyardError::Validation(
            "Scan root was removed during scan; discarding results".to_string(),
        ));
    }

    // Commit discovered projects and nested services in a clean transaction
    let mut total_services = 0;
    {
        let tx = conn.transaction()?;

        for sp in &scanned_projects {
            if cancellation_token.load(Ordering::SeqCst) {
                return Err(RunyardError::Validation("Scan was cancelled".to_string()));
            }

            let p_path = Path::new(&sp.path);
            let name = p_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| sp.path.clone());

            let det = crate::detector::detect_project_type(&sp.path);
            let git_status = if sp.has_git {
                crate::git::get_git_status(&sp.path).ok()
            } else {
                None
            };

            let existing = crate::db::get_project_by_path_with_conn(&tx, &sp.path)?;
            let project_id = existing
                .as_ref()
                .map(|proj| proj.id.clone())
                .unwrap_or_else(|| Uuid::new_v4().to_string());

            let project = Project {
                id: project_id.clone(),
                name,
                path: sp.path.clone(),
                project_type: det.project_type,
                languages: det.languages,
                frameworks: det.frameworks,
                has_git: sp.has_git,
                git_branch: git_status.as_ref().and_then(|g| g.branch.clone()),
                git_remote: git_status.as_ref().and_then(|g| g.remote_url.clone()),
                preferred_ide: existing.as_ref().and_then(|e| e.preferred_ide.clone()),
                default_run_config_id: existing
                    .as_ref()
                    .and_then(|e| e.default_run_config_id.clone()),
                is_favorite: existing.as_ref().map(|e| e.is_favorite).unwrap_or(false),
                tags: existing
                    .as_ref()
                    .map(|e| e.tags.clone())
                    .unwrap_or_default(),
                last_opened: existing.as_ref().and_then(|e| e.last_opened.clone()),
                last_run: existing.as_ref().and_then(|e| e.last_run.clone()),
                source: existing
                    .as_ref()
                    .map(|e| e.source.clone())
                    .unwrap_or(crate::models::ProjectSource::Discovered),
                parent_project_id: None,
                is_runnable: false,
                is_archived: false,
                created_at: existing
                    .as_ref()
                    .map(|e| e.created_at.clone())
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            };

            crate::db::upsert_project_with_conn(&tx, &project)?;

            // Save detected services with stable IDs and prune stale ones
            let mut valid_service_paths = Vec::new();
            for svc in &sp.services {
                total_services += 1;
                valid_service_paths.push(svc.relative_path.clone());
                let existing_svc =
                    crate::db::find_service_by_path_with_conn(&tx, &project_id, &svc.relative_path)
                        .ok()
                        .flatten();
                let svc_id = existing_svc
                    .map(|s| s.id)
                    .unwrap_or_else(|| Uuid::new_v4().to_string());
                let service = Service {
                    is_runnable: false,
                    id: svc_id,
                    project_id: project_id.clone(),
                    name: svc.name.clone(),
                    path: svc.relative_path.clone(),
                    service_type: svc.service_type.clone(),
                    languages: svc.languages.clone(),
                    frameworks: svc.frameworks.clone(),
                    source: crate::models::ServiceSource::Detected,
                    created_at: chrono::Utc::now().to_rfc3339(),
                };
                let _ = crate::db::upsert_service_with_conn(&tx, &service);
            }

            let _ = crate::db::prune_stale_detected_services_with_conn(
                &tx,
                &project_id,
                &valid_service_paths,
            );

            // Populate detected run configs
            let detected_configs = crate::runtime_detector::detect_run_configs(&sp.path);
            let parent_path_buf = Path::new(&sp.path);
            let mut all_detected = Vec::new();
            for cfg in detected_configs {
                all_detected.push((cfg, None));
            }
            for svc in &sp.services {
                let svc_path = parent_path_buf.join(&svc.relative_path);
                let svc_configs =
                    crate::runtime_detector::detect_run_configs(&svc_path.to_string_lossy());
                let svc_id = crate::db::get_services_with_conn(&tx, &project_id)
                    .ok()
                    .unwrap_or_default()
                    .into_iter()
                    .find(|s| s.name == svc.name)
                    .map(|s| s.id);
                for mut cfg in svc_configs {
                    cfg.name = format!("[{}] {}", svc.name, cfg.name);
                    cfg.working_dir = Some(svc_path.to_string_lossy().to_string());
                    all_detected.push((cfg, svc_id.clone()));
                }
            }

            let existing_configs =
                crate::db::get_run_configs_with_conn(&tx, &project_id).unwrap_or_default();
            for (cfg, svc_id) in all_detected {
                let already_exists = existing_configs.iter().any(|ec| {
                    ec.service_id == svc_id && ec.name == cfg.name && ec.command == cfg.command
                });
                if !already_exists {
                    let run_config = RunConfiguration {
                        id: Uuid::new_v4().to_string(),
                        project_id: project_id.clone(),
                        service_id: svc_id,
                        name: cfg.name,
                        command: cfg.command,
                        args: cfg.args,
                        working_dir: cfg.working_dir,
                        env_file: None,
                        env_vars: HashMap::new(),
                        is_trusted: false,
                        trusted_fingerprint: None,
                        is_default: false,
                        source: RunConfigSource::Detected,
                        created_at: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = crate::db::save_run_config_with_conn(&tx, &run_config);
                }
            }
        }

        // Final verification before commit
        let root_still_valid: bool = tx
            .query_row(
                "SELECT count(*) FROM scan_roots WHERE id = ? AND enabled = 1",
                [root_id],
                |r| r.get(0),
            )
            .unwrap_or(0)
            > 0;

        if !root_still_valid || cancellation_token.load(Ordering::SeqCst) {
            return Err(RunyardError::Validation(
                "Scan root was removed during scan; rolling back".to_string(),
            ));
        }

        tx.commit()?;
    }

    // Reconcile catalog
    let _ = crate::reconcile::reconcile_catalog_with_conn(&mut conn);

    let mut final_progress = progress_cell.into_inner().unwrap();
    final_progress.projects_found = scanned_projects.len();
    final_progress.services_found = total_services;
    final_progress.elapsed_ms = start_time.elapsed().as_millis() as u64;
    final_progress.state = ScanState::Completed;

    Ok(final_progress)
}
