use crate::error::{Result, RunyardError};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
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
        let session_id = uuid::Uuid::new_v4().to_string();
        let pty_system = native_pty_system();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| RunyardError::Process(format!("Failed to open PTY: {}", e)))?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(project_path);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let _child = pair
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

        let sid = session_id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                let event_name = format!("pty-data-{}", sid);
                if app_handle.emit(&event_name, data).is_err() {
                    break;
                }
            }
            let exit_event = format!("pty-exit-{}", sid);
            let _ = app_handle.emit(&exit_event, ());
        });

        let session = PtySession {
            master: pair.master,
            writer,
        };

        let sessions_clone = self.sessions.clone();
        let sid_insert = session_id.clone();
        tokio::spawn(async move {
            let mut s = sessions_clone.lock().await;
            s.insert(sid_insert, session);
        });

        Ok(session_id)
    }

    pub async fn write_session(&self, session_id: &str, data: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session
                .writer
                .write_all(data.as_bytes())
                .map_err(|e| RunyardError::Io(e.to_string()))?;
            session
                .writer
                .flush()
                .map_err(|e| RunyardError::Io(e.to_string()))?;
        }
        Ok(())
    }

    pub async fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get_mut(session_id) {
            let size = PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            };
            session
                .master
                .resize(size)
                .map_err(|e| RunyardError::Process(format!("Failed to resize PTY: {}", e)))?;
        }
        Ok(())
    }

    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(session_id);
        Ok(())
    }
}
