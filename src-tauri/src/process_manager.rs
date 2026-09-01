use crate::error::{Result, RunyardError};
use crate::models::{ProcessInfo, ProcessStatus, RunConfiguration};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(Debug, Clone, serde::Serialize)]
pub struct OutputLine {
    pub timestamp: String,
    pub stream: String,
    pub content: String,
}

pub struct ManagedProcess {
    pub child: Option<tokio::process::Child>,
    pub info: ProcessInfo,
}

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<String, ManagedProcess>>>,
    output_buffers: Arc<Mutex<HashMap<String, VecDeque<OutputLine>>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            output_buffers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_process(&self, project_id: &str, run_config: RunConfiguration) -> Result<String> {
        let process_id = uuid::Uuid::new_v4().to_string();
        
        let mut cmd = Command::new(&run_config.command);
        cmd.args(&run_config.args);
        
        if let Some(wd) = &run_config.working_dir {
            cmd.current_dir(wd);
        } else if let Ok(project) = crate::db::get_project(project_id) {
            cmd.current_dir(project.path);
        }

        // Apply custom environment variables
        for (k, v) in &run_config.env_vars {
            cmd.env(k, v);
        }
        
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = cmd.spawn().map_err(|e| RunyardError::Process(format!("Failed to start process '{}': {}", run_config.command, e)))?;
        let pid = child.id();
        
        let stdout = child.stdout.take().expect("Failed to open stdout");
        let stderr = child.stderr.take().expect("Failed to open stderr");
        
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
        };

        {
            let mut procs = self.processes.lock().await;
            procs.insert(process_id.clone(), ManagedProcess {
                child: Some(child),
                info,
            });
            let mut buffers = self.output_buffers.lock().await;
            buffers.insert(process_id.clone(), VecDeque::with_capacity(10000));
        }

        let buffers_clone = self.output_buffers.clone();
        let pid_clone = process_id.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let mut buffers = buffers_clone.lock().await;
                if let Some(buf) = buffers.get_mut(&pid_clone) {
                    if buf.len() >= 10000 { buf.pop_front(); }
                    buf.push_back(OutputLine {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        stream: "stdout".to_string(),
                        content: line,
                    });
                }
            }
        });

        let buffers_clone_err = self.output_buffers.clone();
        let pid_clone_err = process_id.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let mut buffers = buffers_clone_err.lock().await;
                if let Some(buf) = buffers.get_mut(&pid_clone_err) {
                    if buf.len() >= 10000 { buf.pop_front(); }
                    buf.push_back(OutputLine {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        stream: "stderr".to_string(),
                        content: line,
                    });
                }
            }
        });

        let procs_clone = self.processes.clone();
        let pid_clone_wait = process_id.clone();
        tokio::spawn(async move {
            let mut procs = procs_clone.lock().await;
            if let Some(mp) = procs.get_mut(&pid_clone_wait) {
                if let Some(mut child) = mp.child.take() {
                    drop(procs);
                    let status = child.wait().await;
                    let (proc_status, exit_code) = match status {
                        Ok(s) => (
                            if s.success() { ProcessStatus::Stopped } else { ProcessStatus::Failed },
                            s.code(),
                        ),
                        Err(_) => (ProcessStatus::Failed, None),
                    };
                    let mut procs = procs_clone.lock().await;
                    if let Some(mp) = procs.get_mut(&pid_clone_wait) {
                        mp.info.status = proc_status;
                        mp.info.exit_code = exit_code;
                    }
                }
            }
        });

        Ok(process_id)
    }

    pub async fn stop_process(&self, process_id: &str) -> Result<()> {
        let mut procs = self.processes.lock().await;
        if let Some(mp) = procs.get_mut(process_id) {
            mp.info.status = ProcessStatus::Stopping;
            if let Some(pid) = mp.info.pid {
                #[cfg(unix)]
                {
                    unsafe { libc::kill(-(pid as i32), libc::SIGTERM); }
                }
                #[cfg(not(unix))]
                {
                    if let Some(child) = &mut mp.child {
                        let _ = child.start_kill();
                    }
                }
            }
            mp.info.status = ProcessStatus::Stopped;
        }
        Ok(())
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
}
