use tauri::State;
use tauri::Emitter;

use crate::{
    chunk_engine,
    git_engine,
    models::{CommitInfo, DiffResult, FileEntry, RepoStatus, StashEntry, SyncResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Status / remote
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_repo_status(path: String) -> Result<RepoStatus, String> {
    git_engine::get_repo_status(path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_repo(path: String) -> Result<String, String> {
    git_engine::fetch_repo(path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pull_repo(path: String) -> Result<String, String> {
    git_engine::pull_repo(path)
        .await
        .map_err(|e| e.to_string())
}

/// Run chunk pre-processing, then stage-all + commit + push.
#[tauri::command]
pub async fn push_repo(
    path: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let max_size_mb = {
        let cfg = state.config.read().await;
        cfg.max_file_size_mb
    };

    // Pre-process large files
    chunk_engine::preprocess_large_files(&path, max_size_mb)
        .await
        .map_err(|e| e.to_string())?;

    git_engine::push_repo(path, message)
        .await
        .map_err(|e| e.to_string())
}

/// Sync every repo registered in config.
#[tauri::command]
pub async fn sync_all(state: State<'_, AppState>) -> Result<Vec<SyncResult>, String> {
    let repos = {
        let cfg = state.config.read().await;
        cfg.repos.clone()
    };

    let mut results = Vec::with_capacity(repos.len());
    for repo in repos {
        let result = git_engine::sync_repo(repo.path, String::new())
            .await
            .unwrap_or_else(|e| SyncResult {
                path: repo.name,
                success: false,
                message: e.to_string(),
                pushed: false,
                pulled: false,
            });
        results.push(result);
    }
    Ok(results)
}

/// Sync a single repo with progress events emitted to the frontend
#[tauri::command]
pub async fn sync_repo_with_progress(
    path: String,
    message: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncResult, String> {
    let _ = app.emit("sync-progress", serde_json::json!({
        "path": &path,
        "step": "fetching",
        "message": "Fetching remote..."
    }));

    // Run fetch
    let _ = git_engine::fetch_repo(path.clone()).await;

    let _ = app.emit("sync-progress", serde_json::json!({
        "path": &path,
        "step": "checking",
        "message": "Checking status..."
    }));

    let max_size_mb = {
        let cfg = state.config.read().await;
        cfg.max_file_size_mb
    };

    // Pre-process chunks
    let _ = chunk_engine::preprocess_large_files(&path, max_size_mb).await;

    let _ = app.emit("sync-progress", serde_json::json!({
        "path": &path,
        "step": "syncing",
        "message": "Syncing..."
    }));

    let result = git_engine::sync_repo(path.clone(), message).await.unwrap_or_else(|e| {
        SyncResult {
            path: path.clone(),
            success: false,
            message: e.to_string(),
            pushed: false,
            pulled: false,
        }
    });

    let _ = app.emit("sync-progress", serde_json::json!({
        "path": &path,
        "step": "done",
        "message": &result.message,
        "success": result.success
    }));

    Ok(result)
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_staged_files(path: String) -> Result<Vec<FileEntry>, String> {
    git_engine::get_staged_files(path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_unstaged_files(path: String) -> Result<Vec<FileEntry>, String> {
    git_engine::get_unstaged_files(path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stage_file(path: String, file: String) -> Result<(), String> {
    git_engine::stage_file(path, file)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unstage_file(path: String, file: String) -> Result<(), String> {
    git_engine::unstage_file(path, file)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn discard_file(path: String, file: String) -> Result<(), String> {
    git_engine::discard_file(path, file)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stage_all(path: String) -> Result<(), String> {
    git_engine::stage_all(path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unstage_all(path: String) -> Result<(), String> {
    git_engine::unstage_all(path)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn commit_changes(
    path: String,
    message: String,
    amend: bool,
) -> Result<String, String> {
    git_engine::commit(path, message, amend)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Diff / log
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_diff(
    path: String,
    file: Option<String>,
    staged: bool,
) -> Result<DiffResult, String> {
    git_engine::get_diff(path, file, staged)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_log(path: String, limit: u32) -> Result<Vec<CommitInfo>, String> {
    git_engine::get_log(path, limit)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Stash
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_stashes(path: String) -> Result<Vec<StashEntry>, String> {
    git_engine::get_stashes(path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_stash(
    path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<(), String> {
    git_engine::save_stash(path, message, include_untracked)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_stash(path: String, index: usize) -> Result<(), String> {
    git_engine::apply_stash(path, index)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pop_stash(path: String, index: usize) -> Result<(), String> {
    git_engine::pop_stash(path, index)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_stash(path: String, index: usize) -> Result<(), String> {
    git_engine::drop_stash(path, index)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn clone_repo(url: String, dest: String) -> Result<String, String> {
    git_engine::clone_repo(url, dest)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Branch management
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Vec<crate::models::BranchInfo>, String> {
    git_engine::list_branches(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_branch(path: String, name: String, from: Option<String>) -> Result<(), String> {
    git_engine::create_branch(path, name, from).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn switch_branch(path: String, name: String) -> Result<(), String> {
    git_engine::switch_branch(path, name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    git_engine::delete_branch(path, name, force).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_conflicted_files(path: String) -> Result<Vec<crate::models::ConflictFile>, String> {
    git_engine::get_conflicted_files(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_using_ours(path: String, file: String) -> Result<(), String> {
    git_engine::resolve_using_ours(path, file).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_using_theirs(path: String, file: String) -> Result<(), String> {
    git_engine::resolve_using_theirs(path, file).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn abort_merge(path: String) -> Result<(), String> {
    git_engine::abort_merge(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_commit_diff(path: String, hash: String) -> Result<DiffResult, String> {
    git_engine::get_commit_diff(path, hash).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_untracked_file(path: String, file: String) -> Result<(), String> {
    git_engine::delete_untracked_file(path, file).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_tags(path: String) -> Result<Vec<crate::models::TagInfo>, String> {
    git_engine::list_tags(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_tag(path: String, name: String, message: Option<String>, target: Option<String>) -> Result<(), String> {
    git_engine::create_tag(path, name, message, target).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_tag(path: String, name: String) -> Result<(), String> {
    git_engine::delete_tag(path, name).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Reset / Revert / Cherry-pick
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn reset_repo(path: String, target: String, mode: String) -> Result<(), String> {
    git_engine::reset_repo(path, target, mode).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn revert_commit(path: String, hash: String) -> Result<String, String> {
    git_engine::revert_commit(path, hash).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cherry_pick_commit(path: String, hash: String) -> Result<String, String> {
    git_engine::cherry_pick_commit(path, hash).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_remote_url(path: String) -> Result<String, String> {
    git_engine::get_remote_url(path).await.map_err(|e| e.to_string())
}
