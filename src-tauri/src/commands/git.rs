use tauri::State;
use tauri::Emitter;

use crate::{
    chunk_engine,
    git_engine,
    models::{BisectInfo, BlameLine, CommitInfo, DiffResult, FileEntry, ReflogEntry, RepoStatus, StashEntry, SubmoduleInfo, SyncResult, WorktreeInfo},
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
    match git_engine::pull_repo(path.clone()).await {
        Ok(msg) => Ok(msg),
        Err(_) => {
            // Fall back to git CLI (handles credential managers libgit2 can't)
            git_engine::pull_cli(path, false)
                .await
                .map_err(|e| e.to_string())
        }
    }
}

/// Push the current branch to its remote (no staging, no commit).
/// Falls back to git CLI if libgit2 auth fails.
#[tauri::command]
pub async fn push_repo(path: String) -> Result<String, String> {
    match git_engine::push_repo(path.clone()).await {
        Ok(msg) => Ok(msg),
        Err(_) => {
            // Fall back to git CLI (handles Windows Credential Manager, etc.)
            git_engine::push_cli(path)
                .await
                .map_err(|e| e.to_string())
        }
    }
}

/// Force push the current branch (with + refspec).
#[tauri::command]
pub async fn force_push(path: String) -> Result<String, String> {
    git_engine::force_push(path)
        .await
        .map_err(|e| e.to_string())
}

/// Force push with --force-with-lease (safer than raw force push).
#[tauri::command]
pub async fn force_push_with_lease(path: String) -> Result<String, String> {
    git_engine::force_push_with_lease(path)
        .await
        .map_err(|e| e.to_string())
}

/// Pull with optional rebase mode using git CLI.
#[tauri::command]
pub async fn pull_with_rebase(path: String) -> Result<String, String> {
    git_engine::pull_cli(path, true)
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
    gpg_sign: bool,
    gpg_key_id: String,
) -> Result<String, String> {
    if gpg_sign {
        git_engine::commit_signed(path, message, amend, gpg_key_id)
            .await
            .map_err(|e| e.to_string())
    } else {
        git_engine::commit(path, message, amend)
            .await
            .map_err(|e| e.to_string())
    }
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

#[tauri::command]
pub async fn rename_branch(path: String, old_name: String, new_name: String) -> Result<(), String> {
    git_engine::rename_branch(path, old_name, new_name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn merge_branch(path: String, branch_name: String) -> Result<String, String> {
    git_engine::merge_branch(path, branch_name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn push_branch(path: String, branch_name: String) -> Result<String, String> {
    git_engine::push_branch(path, branch_name).await.map_err(|e| e.to_string())
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

#[tauri::command]
pub async fn get_stash_diff(path: String, index: usize) -> Result<DiffResult, String> {
    git_engine::get_stash_diff(path, index).await.map_err(|e| e.to_string())
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

// ---------------------------------------------------------------------------
// Hunk-level staging
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn stage_hunk(path: String, patch: String) -> Result<(), String> {
    git_engine::stage_hunk(path, patch).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn discard_hunk(path: String, patch: String) -> Result<(), String> {
    git_engine::discard_hunk(path, patch).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Git maintenance
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn git_gc(path: String) -> Result<String, String> {
    git_engine::git_gc(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remote_prune(path: String, remote: String) -> Result<Vec<String>, String> {
    git_engine::remote_prune(path, remote).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_prune(path: String) -> Result<String, String> {
    git_engine::fetch_prune(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_head_info(path: String) -> Result<serde_json::Value, String> {
    let (is_detached, hash, message) = git_engine::get_head_info(path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "is_detached": is_detached,
        "hash": hash,
        "message": message,
    }))
}

#[tauri::command]
pub async fn branch_from_head(path: String, branch_name: String) -> Result<(), String> {
    git_engine::branch_from_head(path, branch_name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn amend_commit_message(path: String, message: String) -> Result<String, String> {
    git_engine::amend_commit_message(path, message).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_last_commit_message(path: String) -> Result<String, String> {
    git_engine::get_last_commit_message(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn push_tags(path: String, remote: String) -> Result<String, String> {
    git_engine::push_tags(path, remote).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Worktree management
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_worktrees(path: String) -> Result<Vec<WorktreeInfo>, String> {
    git_engine::list_worktrees(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_worktree(
    path: String,
    worktree_path: String,
    branch: String,
    new_branch: bool,
) -> Result<String, String> {
    git_engine::add_worktree(path, worktree_path, branch, new_branch)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_worktree(
    path: String,
    worktree_path: String,
    force: bool,
) -> Result<String, String> {
    git_engine::remove_worktree(path, worktree_path, force)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Submodule management
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_submodules(path: String) -> Result<Vec<SubmoduleInfo>, String> {
    git_engine::list_submodules(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_submodules(path: String) -> Result<String, String> {
    git_engine::update_submodules(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_submodule(path: String, url: String, sub_path: String) -> Result<String, String> {
    git_engine::add_submodule(path, url, sub_path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_submodule(path: String, sub_path: String) -> Result<String, String> {
    git_engine::remove_submodule(path, sub_path).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Interactive Rebase
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_rebase_commits(path: String, base_commit: String) -> Result<Vec<(String, String, String)>, String> {
    git_engine::get_rebase_commits(path, base_commit).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_interactive_rebase(path: String, base_commit: String, todo_content: String) -> Result<String, String> {
    git_engine::start_interactive_rebase(path, base_commit, todo_content).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rebase_continue(path: String) -> Result<String, String> {
    git_engine::rebase_continue(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rebase_abort(path: String) -> Result<String, String> {
    git_engine::rebase_abort(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rebase_in_progress(path: String) -> Result<bool, String> {
    git_engine::rebase_in_progress(path).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Git LFS
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn detect_lfs(path: String) -> Result<bool, String> {
    git_engine::detect_lfs(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_lfs_tracks(path: String) -> Result<Vec<String>, String> {
    git_engine::list_lfs_tracks(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lfs_track(path: String, pattern: String) -> Result<String, String> {
    git_engine::lfs_track(path, pattern).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lfs_untrack(path: String, pattern: String) -> Result<String, String> {
    git_engine::lfs_untrack(path, pattern).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Git Bisect
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn bisect_status(path: String) -> Result<BisectInfo, String> {
    git_engine::bisect_status(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bisect_start(path: String, bad_commit: String, good_commit: String) -> Result<String, String> {
    git_engine::bisect_start(path, bad_commit, good_commit).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bisect_good(path: String) -> Result<String, String> {
    git_engine::bisect_good(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bisect_bad(path: String) -> Result<String, String> {
    git_engine::bisect_bad(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bisect_skip(path: String) -> Result<String, String> {
    git_engine::bisect_skip(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bisect_reset(path: String) -> Result<String, String> {
    git_engine::bisect_reset(path).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Blame
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn git_blame(path: String, file_path: String) -> Result<Vec<BlameLine>, String> {
    git_engine::git_blame(path, file_path).await.map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Reflog
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn git_reflog(path: String, limit: u32) -> Result<Vec<ReflogEntry>, String> {
    git_engine::git_reflog(path, limit).await.map_err(|e| e.to_string())
}
