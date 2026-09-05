use crate::error::{Result, RunyardError};
use crate::models::{ProcessInfo, ProcessStatus, RunConfiguration};
use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, Notify};
use tokio::time::{timeout, Duration};

const MAX_LOG_LINES: usize = 10000;
const STOP_GRACE_PERIOD: Duration = Duration::from_millis(2500);
const KILL_WAIT_TIMEOUT: Duration = Duration::from_millis(1500);

#[derive(Debug, Clone, serde::Serialize)]
pub struct OutputLine {
    pub timestamp: String,
    pub stream: String,
    pub content: String,
}

pub struct ManagedProcess {
    pub info: ProcessInfo,
    exit_notify: Arc<Notify>,
    stop_requested: Arc<AtomicBool>,
}

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<String, ManagedProcess>>>,
    output_buffers: Arc<Mutex<HashMap<String, VecDeque<OutputLine>>>>,
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            output_buffers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_process(
        &self,
        project_id: &str,
        run_config: RunConfiguration,
    ) -> Result<ProcessInfo> {
        let process_id = uuid::Uuid::new_v4().to_string();

        let working_dir = if let Some(ref wd) = run_config.working_dir {
            Path::new(wd).to_path_buf()
        } else if let Ok(project) = crate::db::get_project(project_id) {
            Path::new(&project.path).to_path_buf()
        } else {
            std::env::current_dir().unwrap_or_default()
        };

        if !working_dir.exists() || !working_dir.is_dir() {
            return Err(RunyardError::Validation(format!(
                "Working directory '{}' does not exist or is not a directory",
                working_dir.display()
            )));
        }

        let mut cmd = Command::new(&run_config.command);
        cmd.args(&run_config.args);
        cmd.current_dir(&working_dir);

        for (k, v) in &run_config.env_vars {
            cmd.env(k, v);
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = cmd.spawn().map_err(|e| {
            RunyardError::Process(format!(
                "Failed to start process '{}' in '{}': {}",
                run_config.command,
                working_dir.display(),
                e
            ))
        })?;

        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let exit_notify = Arc::new(Notify::new());
        let stop_requested = Arc::new(AtomicBool::new(false));

        let info = ProcessInfo {
            id: process_id.clone(),
            project_id: project_id.to_string(),
            service_id: run_config.service_id.clone(),
            run_config_id: run_config.id.clone(),
            run_config_name: run_config.name.clone(),
            pid,
            status: ProcessStatus::Running,
            started_at: chrono::Utc::now().to_rfc3339(),
            exit_code: None,
            pty_session_id: None,
        };

        let return_info = info.clone();

        {
            let mut procs = self.processes.lock().await;
            procs.insert(
                process_id.clone(),
                ManagedProcess {
                    info,
                    exit_notify: exit_notify.clone(),
                    stop_requested: stop_requested.clone(),
                },
            );
            let mut buffers = self.output_buffers.lock().await;
            buffers.insert(process_id.clone(), VecDeque::with_capacity(MAX_LOG_LINES));
        }

        if let Some(out) = stdout {
            let buffers_clone = self.output_buffers.clone();
            let pid_clone = process_id.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(out).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let mut buffers = buffers_clone.lock().await;
                    if let Some(buf) = buffers.get_mut(&pid_clone) {
                        if buf.len() >= MAX_LOG_LINES {
                            buf.pop_front();
                        }
                        buf.push_back(OutputLine {
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            stream: "stdout".to_string(),
                            content: line,
                        });
                    }
                }
            });
        }

        if let Some(err) = stderr {
            let buffers_clone_err = self.output_buffers.clone();
            let pid_clone_err = process_id.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(err).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let mut buffers = buffers_clone_err.lock().await;
                    if let Some(buf) = buffers.get_mut(&pid_clone_err) {
                        if buf.len() >= MAX_LOG_LINES {
                            buf.pop_front();
                        }
                        buf.push_back(OutputLine {
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            stream: "stderr".to_string(),
                            content: line,
                        });
                    }
                }
            });
        }

        let procs_clone = self.processes.clone();
        let pid_clone_wait = process_id.clone();
        tokio::spawn(async move {
            let status_res = child.wait().await;
            let is_stop = stop_requested.load(Ordering::SeqCst);
            let (final_status, exit_code) = match status_res {
                Ok(status) => {
                    let code = status.code();
                    if is_stop {
                        (ProcessStatus::Stopped, code)
                    } else {
                        (ProcessStatus::Exited, code)
                    }
                }
                Err(_) => (ProcessStatus::Failed, None),
            };

            let mut procs = procs_clone.lock().await;
            if let Some(mp) = procs.get_mut(&pid_clone_wait) {
                mp.info.status = final_status;
                mp.info.exit_code = exit_code;
            }
            drop(procs);
            exit_notify.notify_waiters();
        });

        Ok(return_info)
    }

    pub async fn stop_process(&self, process_id: &str) -> Result<()> {
        let (pid_opt, exit_notify, _stop_requested) = {
            let mut procs = self.processes.lock().await;
            let mp = match procs.get_mut(process_id) {
                Some(m) => m,
                None => {
                    return Err(RunyardError::NotFound(format!(
                        "Process {} not found",
                        process_id
                    )))
                }
            };

            if mp.info.status == ProcessStatus::Stopped
                || mp.info.status == ProcessStatus::Exited
                || mp.info.status == ProcessStatus::Failed
            {
                return Ok(());
            }

            mp.info.status = ProcessStatus::Stopping;
            mp.stop_requested.store(true, Ordering::SeqCst);
            (
                mp.info.pid,
                mp.exit_notify.clone(),
                mp.stop_requested.clone(),
            )
        };

        if let Some(pid) = pid_opt {
            #[cfg(unix)]
            {
                if pid > 1 {
                    unsafe {
                        let _ = libc::kill(-(pid as i32), libc::SIGTERM);
                        let _ = libc::kill(pid as i32, libc::SIGTERM);
                    }
                }
            }
            #[cfg(not(unix))]
            {
                stop_requested.store(true, Ordering::SeqCst);
            }

            let graceful = timeout(STOP_GRACE_PERIOD, exit_notify.notified()).await;
            if graceful.is_err() {
                #[cfg(unix)]
                {
                    if pid > 1 {
                        unsafe {
                            let _ = libc::kill(-(pid as i32), libc::SIGKILL);
                            let _ = libc::kill(pid as i32, libc::SIGKILL);
                        }
                    }
                }
                let _ = timeout(KILL_WAIT_TIMEOUT, exit_notify.notified()).await;
            }
        }

        let mut procs = self.processes.lock().await;
        if let Some(mp) = procs.get_mut(process_id) {
            mp.info.status = ProcessStatus::Stopped;
        }

        Ok(())
    }

    pub async fn shutdown_all(&self) {
        let active_ids: Vec<String> = {
            let procs = self.processes.lock().await;
            procs
                .iter()
                .filter(|(_, mp)| {
                    mp.info.status == ProcessStatus::Running
                        || mp.info.status == ProcessStatus::Starting
                        || mp.info.status == ProcessStatus::Stopping
                })
                .map(|(id, _)| id.clone())
                .collect()
        };

        for id in active_ids {
            let _ = self.stop_process(&id).await;
        }
    }

    pub async fn get_all_processes(&self) -> Vec<ProcessInfo> {
        let procs = self.processes.lock().await;
        procs.values().map(|mp| mp.info.clone()).collect()
    }

    pub async fn get_output(&self, process_id: &str, since_line: usize) -> Vec<OutputLine> {
        let buffers = self.output_buffers.lock().await;
        if let Some(buf) = buffers.get(process_id) {
            buf.iter().skip(since_line).cloned().collect()
        } else {
            Vec::new()
        }
    }

    pub async fn clear_output(&self, process_id: &str) -> Result<()> {
        let mut buffers = self.output_buffers.lock().await;
        if let Some(buf) = buffers.get_mut(process_id) {
            buf.clear();
        }
        Ok(())
    }

    pub async fn register_pty_process(
        &self,
        project_id: &str,
        run_config: &RunConfiguration,
        pid: u32,
        pty_session_id: &str,
    ) -> Result<ProcessInfo> {
        let process_id = uuid::Uuid::new_v4().to_string();

        let return_info = ProcessInfo {
            id: process_id.clone(),
            project_id: project_id.to_string(),
            service_id: run_config.service_id.clone(),
            run_config_id: run_config.id.clone(),
            run_config_name: run_config.name.clone(),
            pid: if pid > 0 { Some(pid) } else { None },
            status: ProcessStatus::Running,
            started_at: chrono::Utc::now().to_rfc3339(),
            exit_code: None,
            pty_session_id: Some(pty_session_id.to_string()),
        };

        let mp = ManagedProcess {
            info: return_info.clone(),
            exit_notify: Arc::new(Notify::new()),
            stop_requested: Arc::new(AtomicBool::new(false)),
        };

        let mut procs = self.processes.lock().await;
        procs.insert(process_id, mp);

        Ok(return_info)
    }

    pub async fn mark_process_exited(&self, process_id: &str, exit_code: i32) {
        let mut procs = self.processes.lock().await;
        if let Some(mp) = procs.get_mut(process_id) {
            if mp.info.status == ProcessStatus::Running || mp.info.status == ProcessStatus::Starting
            {
                mp.info.status = ProcessStatus::Exited;
                mp.info.exit_code = Some(exit_code);
                mp.exit_notify.notify_waiters();
            }
        }
    }
}
