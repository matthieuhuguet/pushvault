use thiserror::Error;

#[derive(Debug, Error)]
pub enum PvError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Chunk error: {0}")]
    ChunkError(String),

    #[error("Not a git repository: {0}")]
    NotGitRepo(String),
}

impl serde::Serialize for PvError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
