use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncState {
    Synced,
    NeedsPush,
    NeedsPull,
    Diverged,
    Conflict,
    NotInit,
    Checking,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoConfig {
    pub name: String,
    pub path: String,
    pub remote: String,
    pub icon: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoStatus {
    pub path: String,
    pub state: SyncState,
    pub staged: u32,
    pub modified: u32,
    pub untracked: u32,
    pub deleted: u32,
    pub ahead: u32,
    pub behind: u32,
    pub current_branch: String,
    pub last_commit: String,
    pub last_commit_time: String,
    pub conflicts: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub status: String,
    pub size: u64,
    pub is_staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub content: String,
    pub additions: u32,
    pub deletions: u32,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub date_relative: String,
    pub insertions: u32,
    pub deletions: u32,
    pub files_changed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
    pub branch: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub path: String,
    pub success: bool,
    pub message: String,
    pub pushed: bool,
    pub pulled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub repos: Vec<RepoConfig>,
    pub auto_check_interval_minutes: u64,
    pub max_file_size_mb: u64,
    pub batch_size: usize,
    pub window_width: u32,
    pub window_height: u32,
    #[serde(default)]
    pub gpg_sign_commits: bool,
    #[serde(default)]
    pub gpg_key_id: String,
    #[serde(default)]
    pub github_token: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            repos: Vec::new(),
            auto_check_interval_minutes: 5,
            max_file_size_mb: 49,
            batch_size: 50,
            window_width: 1200,
            window_height: 750,
            gpg_sign_commits: false,
            gpg_key_id: String::new(),
            github_token: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub ahead: u32,
    pub behind: u32,
    pub last_commit: String,
    pub last_commit_time: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConflictFile {
    pub path: String,
    pub conflict_type: String, // "both-modified", "deleted-by-us", "deleted-by-them", "both-added"
    pub ours: String,
    pub theirs: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub name: String,
    pub target_hash: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub date: Option<String>,
    pub is_annotated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub head: String,       // short SHA (8 chars)
    pub branch: String,     // branch name or "(detached HEAD)"
    pub is_main: bool,
    pub is_locked: bool,
    pub is_prunable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubmoduleInfo {
    pub path: String,
    pub url: String,
    pub head: String,       // short SHA (8 chars)
    pub status: String,     // "clean" | "not_init" | "modified" | "conflict"
    pub describe: String,   // optional tag/description from git describe
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BisectInfo {
    pub active: bool,
    pub current_hash: String,    // current HEAD short SHA
    pub current_message: String, // current HEAD commit message
    pub log: String,             // contents of BISECT_LOG (trimmed)
    pub steps_done: u32,         // lines in BISECT_LOG that are good/bad marks
    pub steps_remaining: u32,    // estimated from log (2^n search, rough estimate)
}
