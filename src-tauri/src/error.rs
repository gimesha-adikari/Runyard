use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RunyardError {
    #[error("Database error: {0}")]
    Database(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("Git error: {0}")]
    Git(String),
    #[error("Process error: {0}")]
    Process(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
}

impl Serialize for RunyardError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

impl From<rusqlite::Error> for RunyardError {
    fn from(err: rusqlite::Error) -> Self {
        RunyardError::Database(err.to_string())
    }
}

impl From<std::io::Error> for RunyardError {
    fn from(err: std::io::Error) -> Self {
        RunyardError::Io(err.to_string())
    }
}

impl From<serde_json::Error> for RunyardError {
    fn from(err: serde_json::Error) -> Self {
        RunyardError::Serialization(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, RunyardError>;
