use crate::error::{Result, RunyardError};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
}

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_session(
        &self,
        app_handle: AppHandle,
        project_path: &str,
        cols: u16,
        rows: u16,
    ) -> Result<String> {
        let p = Path::new(project_path);
        if !p.exists() || !p.is_dir() {
            return Err(RunyardError::Validation(format!(
                "Project path '{}' does not exist or is not a directory",
                project_path
            )));
        }

        let session_id = uuid::Uuid::new_v4().to_string();
        let pty_system = native_pty_system();
        let size = PtySize {
            rows: if rows == 0 { 24 } else { rows },
            cols: if cols == 0 { 80 } else { cols },
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| RunyardError::Process(format!("Failed to open PTY: {}", e)))?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| {
            if Path::new("/bin/bash").exists() {
                "/bin/bash".to_string()
            } else {
                "/bin/sh".to_string()
            }
        });

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(project_path);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| RunyardError::Process(format!("Failed to spawn shell: {}", e)))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| RunyardError::Process(format!("Failed to clone PTY reader: {}", e)))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| RunyardError::Process(format!("Failed to get PTY writer: {}", e)))?;

        let session = PtySession {
            master: pair.master,
            writer,
            child,
        };

        // Insert synchronously so subsequent calls find the session immediately
        {
            let mut s = self.sessions.lock().unwrap();
            s.insert(session_id.clone(), session);
        }

        let sid = session_id.clone();
        let sessions_weak = Arc::downgrade(&self.sessions);

        std::thread::spawn(move || {
            let mut carryover: Vec<u8> = Vec::with_capacity(4);
            let mut buf = [0u8; 4096];

            loop {
                let n = match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };

                let mut chunk = std::mem::take(&mut carryover);
                chunk.extend_from_slice(&buf[..n]);

                let mut valid_up_to = chunk.len();
                while valid_up_to > 0 {
                    match std::str::from_utf8(&chunk[..valid_up_to]) {
                        Ok(_) => break,
                        Err(e) => {
                            let valid = e.valid_up_to();
                            if let Some(err_len) = e.error_len() {
                                valid_up_to = valid + err_len;
                            } else {
                                valid_up_to = valid;
                                break;
                            }
                        }
                    }
                }

                if valid_up_to > 0 {
                    let valid_str = String::from_utf8_lossy(&chunk[..valid_up_to]).to_string();
                    let event_name = format!("pty-data-{}", sid);
                    if app_handle.emit(&event_name, valid_str).is_err() {
                        break;
                    }
                }

                if valid_up_to < chunk.len() {
                    carryover.extend_from_slice(&chunk[valid_up_to..]);
                }
            }

            if !carryover.is_empty() {
                let valid_str = String::from_utf8_lossy(&carryover).to_string();
                let _ = app_handle.emit(&format!("pty-data-{}", sid), valid_str);
            }

            let _ = app_handle.emit(&format!("pty-exit-{}", sid), ());

            if let Some(sessions_arc) = sessions_weak.upgrade() {
                let mut s = sessions_arc.lock().unwrap();
                s.remove(&sid);
            }
        });

        Ok(session_id)
    }

    pub async fn write_session(&self, session_id: &str, data: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(session_id).ok_or_else(|| {
            RunyardError::NotFound(format!("PTY session {} not found", session_id))
        })?;

        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| RunyardError::Io(e.to_string()))?;
        session
            .writer
            .flush()
            .map_err(|e| RunyardError::Io(e.to_string()))?;
        Ok(())
    }

    pub async fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(session_id).ok_or_else(|| {
            RunyardError::NotFound(format!("PTY session {} not found", session_id))
        })?;

        let size = PtySize {
            rows: if rows == 0 { 24 } else { rows },
            cols: if cols == 0 { 80 } else { cols },
            pixel_width: 0,
            pixel_height: 0,
        };
        session
            .master
            .resize(size)
            .map_err(|e| RunyardError::Process(format!("Failed to resize PTY: {}", e)))?;
        Ok(())
    }

    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        let mut session = {
            let mut sessions = self.sessions.lock().unwrap();
            sessions.remove(session_id).ok_or_else(|| {
                RunyardError::NotFound(format!("PTY session {} not found", session_id))
            })?
        };

        let _ = session.child.kill();
        Ok(())
    }

    pub fn shutdown_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for (_, mut session) in sessions.drain() {
            let _ = session.child.kill();
        }
    }
}
