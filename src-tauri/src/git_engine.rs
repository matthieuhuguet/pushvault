use std::path::Path;
use std::process::Command;

use chrono::{DateTime, TimeZone, Utc};
use git2::{DiffOptions, Repository, Signature, Sort};

/// Create a `Command` for git that hides the console window on Windows.
/// This prevents terminal windows from flashing every time a subprocess runs.
#[cfg(target_os = "windows")]
fn git_cmd() -> Command {
    use std::os::windows::process::CommandExt;
    let mut cmd = Command::new("git");
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

#[cfg(not(target_os = "windows"))]
fn git_cmd() -> Command {
    Command::new("git")
}

use crate::error::PvError;
use crate::models::{
    BisectInfo, BranchInfo, CommitInfo, ConflictFile, DiffResult, FileEntry, RepoStatus, StashEntry,
    SubmoduleInfo, SyncResult, SyncState, TagInfo, WorktreeInfo,
};

// ---------------------------------------------------------------------------
// Credentials helper
// ---------------------------------------------------------------------------

fn make_callbacks<'a>() -> git2::RemoteCallbacks<'a> {
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, username_from_url, allowed_types| {
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            let username = username_from_url.unwrap_or("git");
            git2::Cred::ssh_key_from_agent(username)
        } else if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            git2::Cred::credential_helper(
                &git2::Config::open_default()?,
                _url,
                username_from_url,
            )
            .or_else(|_| git2::Cred::default())
        } else {
            git2::Cred::default()
        }
    });
    callbacks
}

// ---------------------------------------------------------------------------
// Helpers for parsing `git status --porcelain=v2 --branch` output
// ---------------------------------------------------------------------------

#[derive(Default)]
struct PortcelainV2 {
    branch: String,
    ahead: u32,
    behind: u32,
    staged: u32,
    modified: u32,
    untracked: u32,
    deleted: u32,
    conflicts: u32,
}

fn parse_porcelain_v2(repo_path: &str) -> PortcelainV2 {
    let mut result = PortcelainV2::default();

    let output = git_cmd()
        .args(["status", "--porcelain=v2", "--branch"])
        .current_dir(repo_path)
        .output();

    let output = match output {
        Ok(o) => o,
        Err(_) => return result,
    };

    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            result.branch = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // format: "+2 -1"
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() == 2 {
                if let Some(a) = parts[0].strip_prefix('+') {
                    result.ahead = a.parse().unwrap_or(0);
                }
                if let Some(b) = parts[1].strip_prefix('-') {
                    result.behind = b.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            // Changed tracked entry: "1 XY ..."
            let parts: Vec<&str> = line.splitn(9, ' ').collect();
            if parts.len() >= 2 {
                let xy = parts[1];
                let x = xy.chars().next().unwrap_or('.');
                let y = xy.chars().nth(1).unwrap_or('.');
                // X = index (staged), Y = worktree (unstaged)
                if x != '.' && x != '?' {
                    if x == 'D' {
                        result.deleted += 1;
                    } else {
                        result.staged += 1;
                    }
                }
                if y != '.' && y != '?' {
                    if y == 'D' {
                        result.deleted += 1;
                    } else {
                        result.modified += 1;
                    }
                }
            }
        } else if line.starts_with("u ") {
            result.conflicts += 1;
        } else if line.starts_with("? ") {
            result.untracked += 1;
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Relative date helper
// ---------------------------------------------------------------------------

fn relative_time(ts: i64) -> String {
    let now = Utc::now().timestamp();
    let diff = now - ts;
    match diff {
        d if d < 60 => "just now".into(),
        d if d < 3600 => format!("{} minutes ago", d / 60),
        d if d < 86400 => format!("{} hours ago", d / 3600),
        d if d < 604800 => format!("{} days ago", d / 86400),
        d if d < 2592000 => format!("{} weeks ago", d / 604800),
        d => format!("{} months ago", d / 2592000),
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub async fn get_repo_status(repo_path: String) -> Result<RepoStatus, PvError> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&repo_path);
        if !path.exists() {
            return Err(PvError::InvalidPath(repo_path.clone()));
        }

        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        // Use porcelain v2 for branch + ahead/behind + file counts
        let pv2 = parse_porcelain_v2(&repo_path);

        // Last commit info via git2
        let (last_commit, last_commit_time) = match repo.head() {
            Ok(head) => {
                if let Some(oid) = head.target() {
                    if let Ok(commit) = repo.find_commit(oid) {
                        let msg = commit
                            .summary()
                            .unwrap_or("(no message)")
                            .to_string();
                        let ts = commit.time().seconds();
                        (msg, relative_time(ts))
                    } else {
                        ("(no commits)".into(), "".into())
                    }
                } else {
                    ("(no commits)".into(), "".into())
                }
            }
            Err(_) => ("(no commits)".into(), "".into()),
        };

        // Determine sync state
        let state = if pv2.conflicts > 0 {
            SyncState::Conflict
        } else if pv2.ahead > 0 && pv2.behind > 0 {
            SyncState::Diverged
        } else if pv2.ahead > 0 {
            SyncState::NeedsPush
        } else if pv2.behind > 0 {
            SyncState::NeedsPull
        } else if pv2.staged > 0 || pv2.modified > 0 || pv2.untracked > 0 {
            SyncState::NeedsPush
        } else {
            SyncState::Synced
        };

        Ok(RepoStatus {
            path: repo_path,
            state,
            staged: pv2.staged,
            modified: pv2.modified,
            untracked: pv2.untracked,
            deleted: pv2.deleted,
            ahead: pv2.ahead,
            behind: pv2.behind,
            current_branch: if pv2.branch.is_empty() {
                "HEAD".into()
            } else {
                pv2.branch
            },
            last_commit,
            last_commit_time,
            conflicts: pv2.conflicts,
            error: None,
        })
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn fetch_repo(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let remote_name = get_default_remote(&repo);
        let mut remote = repo.find_remote(&remote_name)?;

        let mut fo = git2::FetchOptions::new();
        fo.remote_callbacks(make_callbacks());
        fo.download_tags(git2::AutotagOption::Unspecified);
        fo.prune(git2::FetchPrune::On);

        remote.fetch(&[] as &[&str], Some(&mut fo), None)?;
        Ok(format!("Fetched from {}", remote_name))
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn pull_repo(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let remote_name = get_default_remote(&repo);
        let mut remote = repo.find_remote(&remote_name)?;

        // Fetch first
        let mut fo = git2::FetchOptions::new();
        fo.remote_callbacks(make_callbacks());
        remote.fetch(&[] as &[&str], Some(&mut fo), None)?;

        // Find upstream
        let head = repo.head()?;
        let branch_name = head
            .shorthand()
            .unwrap_or("HEAD")
            .to_string();

        let fetch_head = repo.find_reference("FETCH_HEAD")?;
        let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)?;

        // Merge analysis
        let (analysis, _) = repo.merge_analysis(&[&fetch_commit])?;

        if analysis.is_up_to_date() {
            return Ok("Already up to date".into());
        }

        if analysis.is_fast_forward() {
            let refname = format!("refs/heads/{}", branch_name);
            let mut reference = repo.find_reference(&refname)?;
            reference.set_target(fetch_commit.id(), "Fast-forward pull")?;
            repo.set_head(&refname)?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
            return Ok("Fast-forward pull successful".into());
        }

        if analysis.is_normal() {
            let head_commit = repo.reference_to_annotated_commit(&repo.head()?)?;
            normal_merge(&repo, &head_commit, &fetch_commit)?;
            return Ok("Merge pull successful".into());
        }

        Err(PvError::Git(git2::Error::from_str("Pull failed: unresolvable merge")))
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

fn normal_merge(
    repo: &Repository,
    local: &git2::AnnotatedCommit,
    remote: &git2::AnnotatedCommit,
) -> Result<(), PvError> {
    let local_tree = repo.find_commit(local.id())?.tree()?;
    let remote_tree = repo.find_commit(remote.id())?.tree()?;
    let ancestor = repo
        .find_commit(repo.merge_base(local.id(), remote.id())?)?
        .tree()?;

    let mut idx = repo.merge_trees(&ancestor, &local_tree, &remote_tree, None)?;
    if idx.has_conflicts() {
        repo.checkout_index(Some(&mut idx), None)?;
        return Err(PvError::Git(git2::Error::from_str(
            "Merge conflicts detected",
        )));
    }
    let result_tree = repo.find_tree(idx.write_tree_to(repo)?)?;
    let msg = "Merge remote tracking branch";
    let sig = repo.signature()?;
    let local_commit = repo.find_commit(local.id())?;
    let remote_commit = repo.find_commit(remote.id())?;
    let _merge_commit = repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        msg,
        &result_tree,
        &[&local_commit, &remote_commit],
    )?;
    repo.checkout_head(None)?;
    Ok(())
}

pub async fn push_repo(repo_path: String, message: String) -> Result<String, PvError> {
    // stage all, commit, push
    let rp = repo_path.clone();
    let msg = message.clone();
    stage_all(rp.clone()).await?;
    commit(rp.clone(), msg, false).await?;
    push_to_remote(rp).await
}

async fn push_to_remote(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let remote_name = get_default_remote(&repo);
        let mut remote = repo.find_remote(&remote_name)?;

        let head = repo.head()?;
        let branch = head.shorthand().unwrap_or("main").to_string();
        let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);

        let mut po = git2::PushOptions::new();
        po.remote_callbacks(make_callbacks());
        remote.push(&[&refspec], Some(&mut po))?;

        Ok(format!("Pushed branch '{}' to '{}'", branch, remote_name))
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn sync_repo(repo_path: String, message: String) -> Result<SyncResult, PvError> {
    let status = get_repo_status(repo_path.clone()).await?;

    let mut pushed = false;
    let mut pulled = false;
    let mut messages: Vec<String> = Vec::new();

    // Pull first if behind
    if status.behind > 0 {
        match pull_repo(repo_path.clone()).await {
            Ok(msg) => {
                pulled = true;
                messages.push(msg);
            }
            Err(e) => {
                return Ok(SyncResult {
                    path: repo_path,
                    success: false,
                    message: format!("Pull failed: {}", e),
                    pushed: false,
                    pulled: false,
                });
            }
        }
    }

    // Push if there are local changes or we're ahead
    if status.staged > 0
        || status.modified > 0
        || status.untracked > 0
        || status.ahead > 0
    {
        let push_msg = if message.is_empty() {
            "chore: sync via PushVault".to_string()
        } else {
            message
        };
        match push_repo(repo_path.clone(), push_msg).await {
            Ok(msg) => {
                pushed = true;
                messages.push(msg);
            }
            Err(e) => {
                return Ok(SyncResult {
                    path: repo_path,
                    success: false,
                    message: format!("Push failed: {}", e),
                    pushed: false,
                    pulled,
                });
            }
        }
    }

    if messages.is_empty() {
        messages.push("Already up to date".into());
    }

    Ok(SyncResult {
        path: repo_path,
        success: true,
        message: messages.join("; "),
        pushed,
        pulled,
    })
}

/// Convert git2 Delta status to lowercase string matching what the frontend expects.
fn delta_status_str(delta: git2::Delta) -> String {
    match delta {
        git2::Delta::Added => "added".into(),
        git2::Delta::Deleted => "deleted".into(),
        git2::Delta::Modified => "modified".into(),
        git2::Delta::Renamed => "renamed".into(),
        git2::Delta::Copied => "added".into(),
        git2::Delta::Untracked => "untracked".into(),
        git2::Delta::Conflicted => "conflict".into(),
        _ => format!("{:?}", delta).to_lowercase(),
    }
}

pub async fn get_staged_files(repo_path: String) -> Result<Vec<FileEntry>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let head_tree = repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_tree().ok());

        let mut diff_opts = DiffOptions::new();
        let diff = match &head_tree {
            Some(tree) => repo.diff_tree_to_index(Some(tree), None, Some(&mut diff_opts))?,
            None => repo.diff_tree_to_index(None, None, Some(&mut diff_opts))?,
        };

        let mut files = Vec::new();
        diff.foreach(
            &mut |delta, _| {
                let path = delta
                    .new_file()
                    .path()
                    .or_else(|| delta.old_file().path())
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                let status = delta_status_str(delta.status());
                let size = delta.new_file().size();
                files.push(FileEntry {
                    path,
                    status,
                    size,
                    is_staged: true,
                });
                true
            },
            None,
            None,
            None,
        )?;

        Ok(files)
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn get_unstaged_files(repo_path: String) -> Result<Vec<FileEntry>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let mut diff_opts = DiffOptions::new();
        let diff = repo.diff_index_to_workdir(None, Some(&mut diff_opts))?;

        let mut files = Vec::new();
        diff.foreach(
            &mut |delta, _| {
                let path = delta
                    .new_file()
                    .path()
                    .or_else(|| delta.old_file().path())
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                let status = delta_status_str(delta.status());
                let size = delta.new_file().size();
                files.push(FileEntry {
                    path,
                    status,
                    size,
                    is_staged: false,
                });
                true
            },
            None,
            None,
            None,
        )?;

        // Also include untracked files (deduplicate against diff results)
        let existing_paths: std::collections::HashSet<String> =
            files.iter().map(|f| f.path.clone()).collect();

        let statuses = repo.statuses(Some(
            git2::StatusOptions::new()
                .include_untracked(true)
                .recurse_untracked_dirs(true),
        ))?;
        for entry in statuses.iter() {
            if entry.status().contains(git2::Status::WT_NEW) {
                let path = entry
                    .path()
                    .unwrap_or("")
                    .to_string();
                if existing_paths.contains(&path) {
                    continue; // already listed from the diff
                }
                let full_path = std::path::Path::new(&repo_path).join(&path);
                let size = std::fs::metadata(&full_path).map(|m| m.len()).unwrap_or(0);
                files.push(FileEntry {
                    path,
                    status: "untracked".into(),
                    size,
                    is_staged: false,
                });
            }
        }

        Ok(files)
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn stage_file(repo_path: String, file_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo".into()))?
            .to_path_buf();

        // Use subprocess so nested repos, spaces, and special chars all work
        let output = git_cmd()
            .args(["add", "--", &file_path])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Config(format!("git add failed: {err}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

pub async fn unstage_file(repo_path: String, file_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        match repo.head() {
            Ok(head) => {
                let head_commit = head.peel_to_commit()?;
                repo.reset_default(
                    Some(head_commit.as_object()),
                    [&file_path],
                )?;
            }
            Err(_) => {
                // No HEAD — remove from index
                let mut index = repo.index()?;
                index.remove_path(Path::new(&file_path))?;
                index.write()?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn discard_file(repo_path: String, file_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo".into()))?
            .to_path_buf();

        // Determine if HEAD exists (there might be no commits yet)
        let has_head = repo.head().is_ok();
        let full_path = workdir.join(&file_path);

        if !has_head {
            // No HEAD yet — just delete the file from disk if it exists
            if full_path.exists() {
                std::fs::remove_file(&full_path).map_err(PvError::Io)?;
            }
            return Ok(());
        }

        // Check if the file is tracked in HEAD
        let head_commit = repo.head()?.peel_to_commit()?;
        let head_tree = head_commit.tree()?;
        let is_tracked = head_tree.get_path(Path::new(&file_path)).is_ok();

        if is_tracked {
            // Restore to HEAD state via subprocess
            let output = git_cmd()
                .args(["checkout", "HEAD", "--", &file_path])
                .current_dir(&workdir)
                .output()
                .map_err(PvError::Io)?;
            if !output.status.success() {
                let err = String::from_utf8_lossy(&output.stderr).to_string();
                return Err(PvError::Config(format!("git checkout failed: {err}")));
            }
        } else {
            // Untracked/new file — delete from disk
            if full_path.exists() {
                std::fs::remove_file(&full_path).map_err(PvError::Io)?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

pub async fn stage_all(repo_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo".into()))?
            .to_path_buf();

        // Use subprocess: git add --all handles nested repos, submodules,
        // special characters, and all edge cases that libgit2's add_all misses.
        let output = git_cmd()
            .args(["add", "--all"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Config(format!("git add --all failed: {err}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

pub async fn unstage_all(repo_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        match repo.head() {
            Ok(head) => {
                let head_commit = head.peel_to_commit()?;
                repo.reset_default(Some(head_commit.as_object()), ["."]) ?;
            }
            Err(_) => {
                // No commits yet — clear the index entirely
                let mut index = repo.index()?;
                index.clear()?;
                index.write()?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn commit(
    repo_path: String,
    message: String,
    amend: bool,
) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let mut index = repo.index()?;
        let tree_oid = index.write_tree()?;
        let tree = repo.find_tree(tree_oid)?;

        let sig: Signature = repo
            .signature()
            .or_else(|_| Signature::now("PushVault", "pushvault@local"))?;

        let oid = if amend {
            let head = repo.head()?.peel_to_commit()?;
            head.amend(Some("HEAD"), Some(&sig), Some(&sig), None, Some(&message), Some(&tree))?
        } else {
            let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
            let parents: Vec<&git2::Commit> = parent.iter().collect();
            repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)?
        };

        Ok(oid.to_string())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

/// Commit using a subprocess so GPG signing works with the OS GPG agent.
/// Pass `gpg_key_id = ""` to use git's configured default signing key.
pub async fn commit_signed(
    repo_path: String,
    message: String,
    amend: bool,
    gpg_key_id: String,
) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let mut args: Vec<String> = vec!["commit".into()];

        // GPG signing flags
        if !gpg_key_id.is_empty() {
            args.push(format!("--gpg-sign={}", gpg_key_id));
        } else {
            args.push("-S".into());
        }

        if amend {
            args.push("--amend".into());
            args.push("--no-edit".into());
            // Override with new message if provided
            args.push("-m".into());
            args.push(message.clone());
        } else {
            args.push("-m".into());
            args.push(message.clone());
        }

        let output = git_cmd()
            .args(&args)
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            // Extract the commit hash from the output
            // git commit outputs: "[branch abc1234] message"
            let out = String::from_utf8_lossy(&output.stdout).to_string();
            let hash = out
                .lines()
                .find(|l| l.contains('[') && l.contains(']'))
                .and_then(|l| l.find(']').map(|i| &l[..i]))
                .and_then(|l| l.rfind(' ').map(|i| l[i + 1..].trim().to_string()))
                .unwrap_or_else(|| "unknown".into());
            Ok(hash)
        } else {
            Err(PvError::Config(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

pub async fn get_diff(
    repo_path: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<DiffResult, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let mut opts = DiffOptions::new();
        if let Some(ref fp) = file_path {
            opts.pathspec(fp);
        }

        let diff = if staged {
            let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?
        } else {
            repo.diff_index_to_workdir(None, Some(&mut opts))?
        };

        let stats = diff.stats()?;
        let mut content = String::new();

        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            use git2::DiffLineType::*;
            let prefix = match line.origin_value() {
                Addition => "+",
                Deletion => "-",
                Context => " ",
                _ => "",
            };
            if let Ok(s) = std::str::from_utf8(line.content()) {
                content.push_str(prefix);
                content.push_str(s);
            }
            true
        })?;

        Ok(DiffResult {
            content,
            additions: stats.insertions() as u32,
            deletions: stats.deletions() as u32,
            file_path: file_path.unwrap_or_default(),
        })
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn get_log(repo_path: String, limit: u32) -> Result<Vec<CommitInfo>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let mut revwalk = repo.revwalk()?;
        revwalk.set_sorting(Sort::TIME)?;
        revwalk.push_head()?;

        let mut commits = Vec::new();
        let limit = limit as usize;

        for (i, oid) in revwalk.enumerate() {
            if i >= limit {
                break;
            }
            let oid = oid?;
            let commit = repo.find_commit(oid)?;

            let hash = oid.to_string();
            let short_hash = hash[..7.min(hash.len())].to_string();
            let message = commit
                .message()
                .unwrap_or("(no message)")
                .trim()
                .to_string();
            let author = commit.author().name().unwrap_or("Unknown").to_string();
            let author_email = commit.author().email().unwrap_or("").to_string();
            let ts = commit.time().seconds();
            let dt: DateTime<Utc> = Utc.timestamp_opt(ts, 0).single().unwrap_or_default();
            let date = dt.format("%Y-%m-%d %H:%M:%S UTC").to_string();
            let date_relative = relative_time(ts);

            // Diff stats (compare to first parent)
            let (insertions, deletions, files_changed) = if let Some(parent) = commit.parent(0).ok() {
                let parent_tree = parent.tree().ok();
                let this_tree = commit.tree().ok();
                if let (Some(pt), Some(tt)) = (parent_tree, this_tree) {
                    if let Ok(diff) = repo.diff_tree_to_tree(Some(&pt), Some(&tt), None) {
                        if let Ok(stats) = diff.stats() {
                            (
                                stats.insertions() as u32,
                                stats.deletions() as u32,
                                stats.files_changed() as u32,
                            )
                        } else {
                            (0, 0, 0)
                        }
                    } else {
                        (0, 0, 0)
                    }
                } else {
                    (0, 0, 0)
                }
            } else {
                (0, 0, 0)
            };

            commits.push(CommitInfo {
                hash,
                short_hash,
                message,
                author,
                author_email,
                date,
                date_relative,
                insertions,
                deletions,
                files_changed,
            });
        }

        Ok(commits)
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn get_stashes(repo_path: String) -> Result<Vec<StashEntry>, PvError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let mut stashes: Vec<StashEntry> = Vec::new();
        repo.stash_foreach(|index, message, _oid| {
            // Parse "On <branch>: <message>" format
            let (branch, clean_msg) = if let Some(rest) = message.strip_prefix("On ") {
                if let Some(colon_pos) = rest.find(':') {
                    let b = rest[..colon_pos].to_string();
                    let m = rest[colon_pos + 1..].trim().to_string();
                    (b, m)
                } else {
                    ("unknown".into(), message.to_string())
                }
            } else {
                ("unknown".into(), message.to_string())
            };

            stashes.push(StashEntry {
                index,
                message: clean_msg,
                branch,
                date: String::new(), // git2 stash_foreach doesn't expose the date easily
            });
            true
        })?;

        Ok(stashes)
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn save_stash(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let sig = repo
            .signature()
            .or_else(|_| Signature::now("PushVault", "pushvault@local"))?;

        let msg = message.as_deref().unwrap_or("WIP");
        let flags = if include_untracked {
            git2::StashFlags::INCLUDE_UNTRACKED
        } else {
            git2::StashFlags::DEFAULT
        };

        repo.stash_save(&sig, msg, Some(flags))?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn apply_stash(repo_path: String, index: usize) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        repo.stash_apply(index, None)?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn pop_stash(repo_path: String, index: usize) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        repo.stash_pop(index, None)?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn drop_stash(repo_path: String, index: usize) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let mut repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        repo.stash_drop(index)?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn clone_repo(url: String, dest_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let mut builder = git2::build::RepoBuilder::new();
        let mut fo = git2::FetchOptions::new();
        fo.remote_callbacks(make_callbacks());
        builder.fetch_options(fo);
        let repo = builder.clone(&url, Path::new(&dest_path))?;
        let name = repo
            .workdir()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| dest_path.clone());
        Ok(format!("Cloned '{}' to '{}'", name, dest_path))
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_default_remote(repo: &Repository) -> String {
    // Prefer "origin", fall back to first available remote
    if repo.find_remote("origin").is_ok() {
        return "origin".into();
    }
    repo.remotes()
        .ok()
        .and_then(|list| list.get(0).map(|s| s.to_string()))
        .unwrap_or_else(|| "origin".into())
}

pub async fn list_branches(repo_path: String) -> Result<Vec<BranchInfo>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let head_ref = repo.head().ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()));

        let mut branches = Vec::new();

        for branch_result in repo.branches(Some(git2::BranchType::Local))? {
            let (branch, _) = branch_result?;
            let name = branch.name()?.unwrap_or("").to_string();
            let is_current = Some(&name) == head_ref.as_ref();

            let (last_commit, last_commit_time) = if let Ok(commit) = branch.get().peel_to_commit() {
                let msg = commit.summary().unwrap_or("").to_string();
                let ts = commit.time().seconds();
                (msg, relative_time(ts))
            } else {
                (String::new(), String::new())
            };

            // Get ahead/behind vs upstream
            let (ahead, behind) = if let Ok(upstream) = branch.upstream() {
                if let (Some(local_oid), Some(upstream_oid)) = (
                    branch.get().target(),
                    upstream.get().target()
                ) {
                    repo.graph_ahead_behind(local_oid, upstream_oid)
                        .map(|(a, b)| (a as u32, b as u32))
                        .unwrap_or((0, 0))
                } else {
                    (0, 0)
                }
            } else {
                (0, 0)
            };

            branches.push(BranchInfo {
                name,
                is_current,
                is_remote: false,
                ahead,
                behind,
                last_commit,
                last_commit_time,
            });
        }

        // Also add remote branches
        for branch_result in repo.branches(Some(git2::BranchType::Remote))? {
            let (branch, _) = branch_result?;
            let name = branch.name()?.unwrap_or("").to_string();
            if name.ends_with("/HEAD") { continue; }

            let (last_commit, last_commit_time) = if let Ok(commit) = branch.get().peel_to_commit() {
                let msg = commit.summary().unwrap_or("").to_string();
                let ts = commit.time().seconds();
                (msg, relative_time(ts))
            } else {
                (String::new(), String::new())
            };

            branches.push(BranchInfo {
                name,
                is_current: false,
                is_remote: true,
                ahead: 0,
                behind: 0,
                last_commit,
                last_commit_time,
            });
        }

        Ok(branches)
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn create_branch(repo_path: String, name: String, from: Option<String>) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let commit = if let Some(ref from_ref) = from {
            let obj = repo.revparse_single(from_ref)?;
            obj.peel_to_commit()?
        } else {
            repo.head()?.peel_to_commit()?
        };

        repo.branch(&name, &commit, false)?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn switch_branch(repo_path: String, name: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let branch_ref = repo.find_branch(&name, git2::BranchType::Local)?;
        let tree = branch_ref.get().peel_to_tree()?;

        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.safe();
        repo.checkout_tree(tree.as_object(), Some(&mut checkout_opts))?;
        repo.set_head(&format!("refs/heads/{}", name))?;

        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn delete_branch(repo_path: String, name: String, force: bool) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let mut branch = repo.find_branch(&name, git2::BranchType::Local)?;
        branch.delete()?;
        let _ = force; // force flag reserved for future use
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn rename_branch(repo_path: String, old_name: String, new_name: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let output = git_cmd()
            .args(["branch", "-m", &old_name, &new_name])
            .current_dir(&repo_path)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            return Err(PvError::Git(git2::Error::from_str(
                &String::from_utf8_lossy(&output.stderr),
            )));
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn merge_branch(repo_path: String, branch_name: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let output = git_cmd()
            .args(["merge", "--no-ff", &branch_name, "-m", &format!("Merge branch '{}'", branch_name)])
            .current_dir(&repo_path)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Git(git2::Error::from_str(&stderr)));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn push_branch(repo_path: String, branch_name: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let output = git_cmd()
            .args(["push", "-u", "origin", &branch_name])
            .current_dir(&repo_path)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Git(git2::Error::from_str(&stderr)));
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(if stdout.is_empty() { stderr_msg } else { stdout })
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn get_conflicted_files(repo_path: String) -> Result<Vec<ConflictFile>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let index = repo.index()?;
        let mut conflicts = Vec::new();

        for conflict in index.conflicts()? {
            let conflict = conflict?;

            let path = conflict.our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref())
                .and_then(|e| std::str::from_utf8(&e.path).ok().map(|s| s.to_string()))
                .unwrap_or_default();

            let conflict_type = match (conflict.our.is_some(), conflict.their.is_some()) {
                (true, true) => "both-modified",
                (true, false) => "deleted-by-them",
                (false, true) => "deleted-by-us",
                (false, false) => "both-deleted",
            }.to_string();

            // Read file contents
            let full_path = std::path::Path::new(&repo_path).join(&path);
            let content = std::fs::read_to_string(&full_path).unwrap_or_default();

            // Split on conflict markers
            let (ours, theirs) = parse_conflict_markers(&content);

            conflicts.push(ConflictFile {
                path,
                conflict_type,
                ours,
                theirs,
            });
        }

        Ok(conflicts)
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

fn parse_conflict_markers(content: &str) -> (String, String) {
    let mut ours = String::new();
    let mut theirs = String::new();
    let mut in_ours = false;
    let mut in_theirs = false;

    for line in content.lines() {
        if line.starts_with("<<<<<<<") {
            in_ours = true;
            in_theirs = false;
        } else if line.starts_with("=======") {
            in_ours = false;
            in_theirs = true;
        } else if line.starts_with(">>>>>>>") {
            in_ours = false;
            in_theirs = false;
        } else if in_ours {
            ours.push_str(line);
            ours.push('\n');
        } else if in_theirs {
            theirs.push_str(line);
            theirs.push('\n');
        }
    }

    if ours.is_empty() && theirs.is_empty() {
        (content.to_string(), String::new())
    } else {
        (ours, theirs)
    }
}

pub async fn resolve_using_ours(repo_path: String, file_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        // Use `git checkout --ours` equivalent via Command
        let output = git_cmd()
            .args(["checkout", "--ours", "--", &file_path])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| PvError::Io(e))?;

        if !output.status.success() {
            return Err(PvError::Git(git2::Error::from_str(
                &String::from_utf8_lossy(&output.stderr)
            )));
        }

        // Stage the resolved file
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let mut index = repo.index()?;
        index.add_path(std::path::Path::new(&file_path))?;
        index.write()?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn resolve_using_theirs(repo_path: String, file_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let output = git_cmd()
            .args(["checkout", "--theirs", "--", &file_path])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| PvError::Io(e))?;

        if !output.status.success() {
            return Err(PvError::Git(git2::Error::from_str(
                &String::from_utf8_lossy(&output.stderr)
            )));
        }

        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let mut index = repo.index()?;
        index.add_path(std::path::Path::new(&file_path))?;
        index.write()?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn abort_merge(repo_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        repo.cleanup_state()?;
        // Reset to HEAD
        let head = repo.head()?.peel_to_commit()?;
        repo.reset(head.as_object(), git2::ResetType::Hard, None)?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn get_commit_diff(repo_path: String, hash: String) -> Result<DiffResult, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let oid = git2::Oid::from_str(&hash)?;
        let commit = repo.find_commit(oid)?;

        let commit_tree = commit.tree()?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

        let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None)?;
        let stats = diff.stats()?;

        let mut content = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            use git2::DiffLineType::*;
            let prefix = match line.origin_value() {
                Addition => "+",
                Deletion => "-",
                Context => " ",
                _ => "",
            };
            if let Ok(s) = std::str::from_utf8(line.content()) {
                content.push_str(prefix);
                content.push_str(s);
            }
            true
        })?;

        Ok(DiffResult {
            content,
            additions: stats.insertions() as u32,
            deletions: stats.deletions() as u32,
            file_path: hash,
        })
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn delete_untracked_file(repo_path: String, file_path: String) -> Result<(), PvError> {
    let full = std::path::Path::new(&repo_path).join(&file_path);
    tokio::fs::remove_file(full).await.map_err(PvError::Io)
}

pub async fn get_stash_diff(repo_path: String, index: usize) -> Result<DiffResult, PvError> {
    tokio::task::spawn_blocking(move || {
        let output = git_cmd()
            .args(["stash", "show", "-p", &format!("stash@{{{}}}", index)])
            .current_dir(&repo_path)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            return Err(PvError::Git(git2::Error::from_str(
                &String::from_utf8_lossy(&output.stderr),
            )));
        }

        let raw = String::from_utf8_lossy(&output.stdout);
        let mut additions: u32 = 0;
        let mut deletions: u32 = 0;

        for line in raw.lines() {
            if line.starts_with('+') && !line.starts_with("+++") {
                additions += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                deletions += 1;
            }
        }

        Ok(DiffResult {
            content: raw.into_owned(),
            additions,
            deletions,
            file_path: format!("stash@{{{}}}", index),
        })
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn list_tags(repo_path: String) -> Result<Vec<TagInfo>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let mut tags = Vec::new();
        repo.tag_foreach(|oid, name_bytes| {
            let name = String::from_utf8_lossy(name_bytes)
                .trim_start_matches("refs/tags/")
                .to_string();

            let (target_hash, message, tagger, date, is_annotated) =
                if let Ok(tag_obj) = repo.find_tag(oid) {
                    let hash = tag_obj.target_id().to_string();
                    let msg = tag_obj.message().map(|s| s.to_string());
                    let tagger_name = tag_obj.tagger()
                        .and_then(|s| s.name().map(|n| n.to_string()));
                    let date_str = tag_obj.tagger()
                        .map(|s| relative_time(s.when().seconds()));
                    (hash, msg, tagger_name, date_str, true)
                } else {
                    // Lightweight tag — points directly to a commit
                    let hash = oid.to_string();
                    (hash, None, None, None, false)
                };

            tags.push(TagInfo {
                name,
                target_hash,
                message,
                tagger,
                date,
                is_annotated,
            });
            true
        })?;

        Ok(tags)
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn create_tag(
    repo_path: String,
    name: String,
    message: Option<String>,
    target: Option<String>,
) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let obj = if let Some(ref t) = target {
            repo.revparse_single(t)?
        } else {
            repo.head()?.peel_to_commit()?.into_object()
        };

        if let Some(ref msg) = message {
            let sig = repo.signature()
                .or_else(|_| Signature::now("PushVault", "pushvault@local"))?;
            repo.tag(&name, &obj, &sig, msg, false)?;
        } else {
            repo.tag_lightweight(&name, &obj, false)?;
        }

        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn delete_tag(repo_path: String, name: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        repo.tag_delete(&name)?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn reset_repo(
    repo_path: String,
    target: String,
    mode: String, // "soft", "mixed", "hard"
) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let obj = repo.revparse_single(&target)?;
        let reset_type = match mode.as_str() {
            "soft" => git2::ResetType::Soft,
            "hard" => git2::ResetType::Hard,
            _ => git2::ResetType::Mixed,
        };

        repo.reset(&obj, reset_type, None)?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn revert_commit(repo_path: String, hash: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let oid = git2::Oid::from_str(&hash)?;
        let commit = repo.find_commit(oid)?;

        repo.revert(&commit, None)?;

        // Auto-commit the revert
        let msg = format!("Revert \"{}\"", commit.summary().unwrap_or("commit"));
        let sig = repo.signature()
            .or_else(|_| Signature::now("PushVault", "pushvault@local"))?;
        let mut index = repo.index()?;
        let tree_oid = index.write_tree()?;
        let tree = repo.find_tree(tree_oid)?;
        let parent = repo.head()?.peel_to_commit()?;
        let revert_oid = repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent])?;

        Ok(revert_oid.to_string())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn cherry_pick_commit(repo_path: String, hash: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let oid = git2::Oid::from_str(&hash)?;
        let commit = repo.find_commit(oid)?;

        let mut opts = git2::CherrypickOptions::new();
        repo.cherrypick(&commit, Some(&mut opts))?;

        // Commit the cherry-pick
        let msg = commit.message().unwrap_or("Cherry-pick").to_string();
        let sig = repo.signature()
            .or_else(|_| Signature::now("PushVault", "pushvault@local"))?;
        let mut index = repo.index()?;
        let tree_oid = index.write_tree()?;
        let tree = repo.find_tree(tree_oid)?;
        let parent = repo.head()?.peel_to_commit()?;
        let new_oid = repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent])?;

        Ok(new_oid.to_string())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

/// Get the remote URL for a repository
pub async fn get_remote_url(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let remote_name = get_default_remote(&repo);
        let remote = repo.find_remote(&remote_name)?;
        Ok(remote.url().unwrap_or("").to_string())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

// ---------------------------------------------------------------------------
// Hunk-level staging
// ---------------------------------------------------------------------------

pub async fn stage_hunk(repo_path: String, patch: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo has no workdir".into()))?
            .to_path_buf();

        let mut child = git_cmd()
            .args(["apply", "--cached", "--recount", "-"])
            .current_dir(&workdir)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(PvError::Io)?;

        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            stdin.write_all(patch.as_bytes()).map_err(PvError::Io)?;
        }

        let output = child.wait_with_output().map_err(PvError::Io)?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Config(format!("git apply --cached failed: {stderr}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

pub async fn discard_hunk(repo_path: String, patch: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let workdir = repo
            .workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo has no workdir".into()))?
            .to_path_buf();

        let mut child = git_cmd()
            .args(["apply", "--reverse", "--recount", "-"])
            .current_dir(&workdir)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(PvError::Io)?;

        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            stdin.write_all(patch.as_bytes()).map_err(PvError::Io)?;
        }

        let output = child.wait_with_output().map_err(PvError::Io)?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Config(format!("git apply --reverse failed: {stderr}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Git maintenance
// ---------------------------------------------------------------------------

/// Run `git gc --prune=now` to compact the repository and remove unreachable objects.
pub async fn git_gc(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["gc", "--prune=now", "--quiet"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Config(format!("git gc failed: {err}")));
        }
        let out = String::from_utf8_lossy(&output.stderr).to_string();
        Ok(if out.trim().is_empty() { "GC complete — nothing to clean up.".to_string() } else { out.trim().to_string() })
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Prune stale remote-tracking branches with `git remote prune <remote>`.
pub async fn remote_prune(repo_path: String, remote: String) -> Result<Vec<String>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["remote", "prune", &remote])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Config(format!("git remote prune failed: {err}")));
        }

        // Parse pruned branches from output
        let combined = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let pruned: Vec<String> = combined
            .lines()
            .filter(|l| l.contains("pruned") || l.contains("[pruned]"))
            .map(|l| l.trim().to_string())
            .collect();

        Ok(pruned)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Fetch from all remotes AND prune stale tracking branches in one pass.
pub async fn fetch_prune(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["fetch", "--all", "--prune"])
            .env("GIT_TERMINAL_PROMPT", "0")
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        let combined = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );

        if !output.status.success() {
            return Err(PvError::Config(format!("fetch --prune failed: {combined}")));
        }

        Ok(if combined.trim().is_empty() {
            "Fetch complete — already up to date.".to_string()
        } else {
            combined.trim().to_string()
        })
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Returns `(is_detached, current_commit_hash, current_commit_message)`.
pub async fn get_head_info(repo_path: String) -> Result<(bool, String, String), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;

        let head = repo.head()?;
        let is_detached = repo.head_detached()?;
        let commit = head.peel_to_commit()?;
        let hash = commit.id().to_string();
        let message = commit.summary().unwrap_or("").to_string();

        Ok((is_detached, hash, message))
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Create a new branch at the current (possibly detached) HEAD and switch to it.
pub async fn branch_from_head(repo_path: String, branch_name: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["checkout", "-b", &branch_name])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Config(format!("git checkout -b failed: {err}")));
        }
        Ok(())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Amend the last commit with a new message (leaves staged contents unchanged).
pub async fn amend_commit_message(repo_path: String, message: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::InvalidPath("bare repo".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["commit", "--amend", "--no-edit", &format!("--message={message}")])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(PvError::Config(format!("git commit --amend failed: {err}")));
        }

        // Return the new commit hash
        let hash_out = git_cmd()
            .args(["rev-parse", "HEAD"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        let hash = String::from_utf8_lossy(&hash_out.stdout).trim().to_string();
        Ok(hash)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Push all local tags to the remote (`git push --tags`).
pub async fn push_tags(repo_path: String, remote: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let workdir = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?
            .workdir()
            .ok_or_else(|| PvError::Config("Bare repo".into()))?
            .to_path_buf();

        let remote_arg = if remote.is_empty() { "origin".to_string() } else { remote };
        let output = git_cmd()
            .args(["push", &remote_arg, "--tags"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(PvError::Config(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Get the full message of the last commit (for pre-filling the amend field).
pub async fn get_last_commit_message(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let head_commit = repo.head()?.peel_to_commit()?;
        let message = head_commit.message().unwrap_or("").to_string();
        Ok(message.trim().to_string())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Worktree management
// ---------------------------------------------------------------------------

/// List all worktrees for a repository using `git worktree list --porcelain`.
pub async fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir().ok_or(PvError::Config("bare repository".into()))?.to_path_buf();

        let output = git_cmd()
            .args(["worktree", "list", "--porcelain"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        let text = String::from_utf8_lossy(&output.stdout).to_string();

        let mut worktrees: Vec<WorktreeInfo> = Vec::new();
        let mut cur_path = String::new();
        let mut cur_head = String::new();
        let mut cur_branch = String::new();
        let mut cur_locked = false;
        let mut cur_prunable = false;

        let flush = |path: &mut String,
                     head: &mut String,
                     branch: &mut String,
                     locked: &mut bool,
                     prunable: &mut bool,
                     is_main: bool,
                     out: &mut Vec<WorktreeInfo>| {
            if !path.is_empty() {
                out.push(WorktreeInfo {
                    path: std::mem::take(path),
                    head: std::mem::take(head),
                    branch: std::mem::take(branch),
                    is_main,
                    is_locked: *locked,
                    is_prunable: *prunable,
                });
                *locked = false;
                *prunable = false;
            }
        };

        for line in text.lines() {
            if line.is_empty() {
                let is_main = worktrees.is_empty();
                flush(
                    &mut cur_path,
                    &mut cur_head,
                    &mut cur_branch,
                    &mut cur_locked,
                    &mut cur_prunable,
                    is_main,
                    &mut worktrees,
                );
            } else if let Some(rest) = line.strip_prefix("worktree ") {
                cur_path = rest.to_string();
            } else if let Some(rest) = line.strip_prefix("HEAD ") {
                cur_head = rest.chars().take(8).collect();
            } else if let Some(rest) = line.strip_prefix("branch ") {
                cur_branch = rest.strip_prefix("refs/heads/")
                    .unwrap_or(rest)
                    .to_string();
            } else if line == "detached" {
                cur_branch = "(detached HEAD)".to_string();
            } else if line.starts_with("locked") {
                cur_locked = true;
            } else if line.starts_with("prunable") {
                cur_prunable = true;
            }
        }

        // Flush last block (no trailing blank line in some git versions)
        let is_main = worktrees.is_empty();
        flush(
            &mut cur_path,
            &mut cur_head,
            &mut cur_branch,
            &mut cur_locked,
            &mut cur_prunable,
            is_main,
            &mut worktrees,
        );

        Ok(worktrees)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Add a new worktree. Pass `new_branch = true` to create a fresh branch
/// at the same time (`git worktree add -b <branch> <path>`).
pub async fn add_worktree(
    repo_path: String,
    path: String,
    branch: String,
    new_branch: bool,
) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir().ok_or(PvError::Config("bare repository".into()))?.to_path_buf();

        let mut args: Vec<&str> = vec!["worktree", "add"];

        // -b flag must come before the path
        if new_branch && !branch.is_empty() {
            args.push("-b");
        }

        if !branch.is_empty() {
            args.push(branch.as_str());
        }
        args.push(path.as_str());

        // Reorder: git worktree add [-b branch] path [branch]
        // Correct order for existing branch: git worktree add <path> <branch>
        // Correct order for new branch:      git worktree add -b <branch> <path>
        let final_args: Vec<String> = if new_branch && !branch.is_empty() {
            vec![
                "worktree".into(),
                "add".into(),
                "-b".into(),
                branch.clone(),
                path.clone(),
            ]
        } else if !branch.is_empty() {
            vec![
                "worktree".into(),
                "add".into(),
                path.clone(),
                branch.clone(),
            ]
        } else {
            vec!["worktree".into(), "add".into(), path.clone()]
        };

        let output = git_cmd()
            .args(&final_args)
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(PvError::Config(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Remove a linked worktree. The main worktree cannot be removed.
pub async fn remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir().ok_or(PvError::Config("bare repository".into()))?.to_path_buf();

        let mut args = vec!["worktree".to_string(), "remove".to_string()];
        if force {
            args.push("--force".to_string());
        }
        args.push(worktree_path.clone());

        let output = git_cmd()
            .args(&args)
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            Ok(format!("Removed worktree: {}", worktree_path))
        } else {
            Err(PvError::Config(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Submodule management
// ---------------------------------------------------------------------------

/// List all submodules using `git submodule status`.
pub async fn list_submodules(repo_path: String) -> Result<Vec<SubmoduleInfo>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        // Get submodule status
        let status_out = git_cmd()
            .args(["submodule", "status"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        let status_text = String::from_utf8_lossy(&status_out.stdout).to_string();

        // Get URLs from .gitmodules via config
        let url_out = git_cmd()
            .args([
                "config",
                "--file",
                ".gitmodules",
                "--get-regexp",
                r"submodule\..*\.url",
            ])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        let url_text = String::from_utf8_lossy(&url_out.stdout).to_string();

        // Build path → URL map
        let mut url_map: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for line in url_text.lines() {
            // line: "submodule.path/to/sub.url https://github.com/..."
            let parts: Vec<&str> = line.splitn(2, ' ').collect();
            if parts.len() == 2 {
                // key like "submodule.libs/foo.url" → extract path between first "." and ".url"
                let key = parts[0]; // "submodule.libs/foo.url"
                let url = parts[1].to_string();
                if let Some(inner) = key.strip_prefix("submodule.") {
                    if let Some(sub_path) = inner.strip_suffix(".url") {
                        url_map.insert(sub_path.to_string(), url);
                    }
                }
            }
        }

        // Parse status lines
        // Format: [status_char][SHA] path (describe)
        // status_char: ' ' = clean, '-' = not init, '+' = modified, 'U' = conflict
        let mut result = Vec::new();
        for line in status_text.lines() {
            if line.is_empty() { continue; }
            let status_char = line.chars().next().unwrap_or(' ');
            let rest = &line[1..]; // after status char
            // rest = "abc1234... path (describe)"
            let parts: Vec<&str> = rest.splitn(3, ' ').collect();
            if parts.len() < 2 { continue; }
            let sha = parts[0].chars().take(8).collect::<String>();
            let path = parts[1].to_string();
            let describe = if parts.len() == 3 {
                parts[2].trim_matches(|c| c == '(' || c == ')').to_string()
            } else {
                String::new()
            };
            let status = match status_char {
                '-' => "not_init",
                '+' => "modified",
                'U' => "conflict",
                _ => "clean",
            };
            let url = url_map.get(&path).cloned().unwrap_or_default();
            result.push(SubmoduleInfo {
                path,
                url,
                head: sha,
                status: status.to_string(),
                describe,
            });
        }

        Ok(result)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Update all submodules (init + recursive).
pub async fn update_submodules(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["submodule", "update", "--init", "--recursive"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            let msg = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(if msg.is_empty() { "All submodules up to date.".to_string() } else { msg })
        } else {
            Err(PvError::Config(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Add a new submodule.
pub async fn add_submodule(repo_path: String, url: String, path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["submodule", "add", &url, &path])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            Ok(format!("Submodule '{}' added successfully.", path))
        } else {
            Err(PvError::Config(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Remove a submodule (deinit + rm + remove cached git dir).
pub async fn remove_submodule(repo_path: String, sub_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        // Step 1: deinit
        let r1 = git_cmd()
            .args(["submodule", "deinit", "-f", &sub_path])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        if !r1.status.success() {
            return Err(PvError::Config(
                String::from_utf8_lossy(&r1.stderr).to_string(),
            ));
        }

        // Step 2: git rm
        let r2 = git_cmd()
            .args(["rm", "-f", &sub_path])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        if !r2.status.success() {
            return Err(PvError::Config(
                String::from_utf8_lossy(&r2.stderr).to_string(),
            ));
        }

        // Step 3: remove cached .git/modules/<path>
        let modules_path = workdir.join(".git").join("modules").join(&sub_path);
        if modules_path.exists() {
            std::fs::remove_dir_all(&modules_path)
                .map_err(PvError::Io)?;
        }

        Ok(format!("Submodule '{}' removed successfully.", sub_path))
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Git LFS
// ---------------------------------------------------------------------------

/// Returns true if git-lfs is installed and this repo has LFS configured.
pub async fn detect_lfs(repo_path: String) -> Result<bool, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        // Check .gitattributes for any LFS filter lines
        let gitattributes = workdir.join(".gitattributes");
        if gitattributes.exists() {
            let content = std::fs::read_to_string(&gitattributes).unwrap_or_default();
            if content.contains("filter=lfs") {
                return Ok(true);
            }
        }
        // Also check if .git/lfs directory exists (lfs has been initialised)
        let lfs_dir = workdir.join(".git").join("lfs");
        Ok(lfs_dir.exists())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Returns the list of patterns currently tracked by Git LFS (`git lfs track`).
pub async fn list_lfs_tracks(repo_path: String) -> Result<Vec<String>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["lfs", "track"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        let out = String::from_utf8_lossy(&output.stdout).to_string();
        // Output format:
        //   Listing tracked patterns
        //       *.psd (.gitattributes)
        //       *.png (.gitattributes)
        let patterns: Vec<String> = out
            .lines()
            .filter(|l| l.trim_start().starts_with('*') || l.contains("("))
            .filter_map(|l| {
                let trimmed = l.trim();
                // Strip the " (.gitattributes)" suffix
                let pattern = trimmed.split(" (").next()?.trim().to_string();
                if pattern.is_empty() { None } else { Some(pattern) }
            })
            .collect();
        Ok(patterns)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Track a file pattern with Git LFS (`git lfs track "<pattern>"`).
pub async fn lfs_track(repo_path: String, pattern: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["lfs", "track", &pattern])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(PvError::Config(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Untrack a file pattern from Git LFS (`git lfs untrack "<pattern>"`).
pub async fn lfs_untrack(repo_path: String, pattern: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["lfs", "untrack", &pattern])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(PvError::Config(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Interactive Rebase
// ---------------------------------------------------------------------------

/// Returns commits between `base_commit..HEAD` in chronological order (oldest first),
/// formatted as `(hash, short_hash, message)` tuples for the rebase UI.
pub async fn get_rebase_commits(
    repo_path: String,
    base_commit: String,
) -> Result<Vec<(String, String, String)>, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let range = format!("{}..HEAD", base_commit);
        let output = git_cmd()
            .args(["log", "--reverse", "--format=%H|%h|%s", &range])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if !output.status.success() {
            return Err(PvError::Config(String::from_utf8_lossy(&output.stderr).to_string()));
        }

        let commits = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| {
                let parts: Vec<&str> = l.splitn(3, '|').collect();
                let hash = parts.first().unwrap_or(&"").to_string();
                let short = parts.get(1).unwrap_or(&"").to_string();
                let msg = parts.get(2).unwrap_or(&"").to_string();
                (hash, short, msg)
            })
            .collect();
        Ok(commits)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Start an interactive rebase by injecting a pre-built todo script.
/// Uses a temporary batch file as GIT_SEQUENCE_EDITOR to copy our todo into place.
pub async fn start_interactive_rebase(
    repo_path: String,
    base_commit: String,
    todo_content: String,
) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        // Write our todo file to a temp location
        let todo_path = std::env::temp_dir().join("pushvault_rebase_todo.txt");
        std::fs::write(&todo_path, &todo_content).map_err(PvError::Io)?;

        // Write a batch file that copies our todo to git's todo file
        let bat_path = std::env::temp_dir().join("pushvault_seq_editor.bat");
        let bat_content = format!(
            "@echo off\r\ncopy /y \"{}\" \"%~1\" >nul 2>&1\r\n",
            todo_path.display()
        );
        std::fs::write(&bat_path, bat_content).map_err(PvError::Io)?;

        let editor = bat_path.to_string_lossy().to_string();

        let output = git_cmd()
            .args(["rebase", "-i", &base_commit])
            .env("GIT_SEQUENCE_EDITOR", &editor)
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        let _ = std::fs::remove_file(&todo_path);
        let _ = std::fs::remove_file(&bat_path);

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if output.status.success() || stderr.contains("nothing to do") {
            Ok(if stdout.is_empty() { "Rebase complete.".into() } else { stdout })
        } else {
            Err(PvError::Config(stderr))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Continue a rebase in progress (after resolving conflicts).
pub async fn rebase_continue(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["rebase", "--continue"])
            .env("GIT_EDITOR", "true")
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string()
            + " " + &String::from_utf8_lossy(&output.stderr).trim().to_string();
        if output.status.success() { Ok(text.trim().to_string()) } else { Err(PvError::Config(text)) }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Abort rebase and return to the original branch state.
pub async fn rebase_abort(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["rebase", "--abort"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(PvError::Config(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Returns true if a rebase is currently in progress.
pub async fn rebase_in_progress(repo_path: String) -> Result<bool, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let merge_dir = workdir.join(".git").join("rebase-merge");
        let apply_dir = workdir.join(".git").join("rebase-apply");
        Ok(merge_dir.exists() || apply_dir.exists())
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Git Bisect
// ---------------------------------------------------------------------------

/// Returns current bisect state. Checks for .git/BISECT_HEAD to detect active session.
pub async fn bisect_status(repo_path: String) -> Result<BisectInfo, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let git_dir = workdir.join(".git");
        let bisect_head = git_dir.join("BISECT_HEAD");
        let bisect_log = git_dir.join("BISECT_LOG");

        if !bisect_head.exists() {
            return Ok(BisectInfo {
                active: false,
                current_hash: String::new(),
                current_message: String::new(),
                log: String::new(),
                steps_done: 0,
                steps_remaining: 0,
            });
        }

        // Get current HEAD info
        let head_output = git_cmd()
            .args(["log", "-1", "--format=%h %s"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        let head_line = String::from_utf8_lossy(&head_output.stdout).trim().to_string();
        let (current_hash, current_message) = head_line
            .splitn(2, ' ')
            .collect::<Vec<_>>()
            .split_first()
            .map(|(h, rest)| (h.to_string(), rest.join(" ")))
            .unwrap_or_default();

        // Read bisect log
        let log = std::fs::read_to_string(&bisect_log).unwrap_or_default();
        let steps_done = log.lines()
            .filter(|l| l.starts_with("# good") || l.starts_with("# bad"))
            .count() as u32;

        // Estimate remaining steps from git bisect visualize --stat output
        let vis_output = git_cmd()
            .args(["bisect", "visualize", "--oneline"])
            .current_dir(&workdir)
            .output()
            .ok();
        let steps_remaining = vis_output
            .as_ref()
            .map(|o| String::from_utf8_lossy(&o.stdout).lines().count() as u32)
            .unwrap_or(0);

        Ok(BisectInfo {
            active: true,
            current_hash,
            current_message,
            log: log.lines()
                .filter(|l| l.starts_with('#'))
                .take(20)
                .collect::<Vec<_>>()
                .join("\n"),
            steps_done,
            steps_remaining,
        })
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Start a bisect session: `git bisect start && git bisect bad <bad> && git bisect good <good>`
pub async fn bisect_start(
    repo_path: String,
    bad_commit: String,
    good_commit: String,
) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        // bisect start
        let out1 = git_cmd()
            .args(["bisect", "start"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        if !out1.status.success() {
            return Err(PvError::Config(String::from_utf8_lossy(&out1.stderr).to_string()));
        }

        // mark bad
        let out2 = git_cmd()
            .args(["bisect", "bad", &bad_commit])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        if !out2.status.success() {
            let _ = git_cmd().args(["bisect", "reset"]).current_dir(&workdir).output();
            return Err(PvError::Config(String::from_utf8_lossy(&out2.stderr).to_string()));
        }

        // mark good
        let out3 = git_cmd()
            .args(["bisect", "good", &good_commit])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;
        if !out3.status.success() {
            let _ = git_cmd().args(["bisect", "reset"]).current_dir(&workdir).output();
            return Err(PvError::Config(String::from_utf8_lossy(&out3.stderr).to_string()));
        }

        let out = String::from_utf8_lossy(&out3.stdout).trim().to_string();
        Ok(if out.is_empty() {
            String::from_utf8_lossy(&out2.stdout).trim().to_string()
        } else {
            out
        })
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Mark current commit as good during bisect.
pub async fn bisect_good(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["bisect", "good"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string()
            + &String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(text)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Mark current commit as bad during bisect.
pub async fn bisect_bad(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["bisect", "bad"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string()
            + &String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(text)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Skip current commit during bisect (can't test it).
pub async fn bisect_skip(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["bisect", "skip"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string()
            + &String::from_utf8_lossy(&output.stderr).trim().to_string();
        Ok(text)
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}

/// Abort bisect and return to original HEAD.
pub async fn bisect_reset(repo_path: String) -> Result<String, PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let workdir = repo.workdir()
            .ok_or_else(|| PvError::Config("bare repository".into()))?
            .to_path_buf();

        let output = git_cmd()
            .args(["bisect", "reset"])
            .current_dir(&workdir)
            .output()
            .map_err(PvError::Io)?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(PvError::Config(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    })
    .await
    .map_err(|e| PvError::Config(e.to_string()))?
}
