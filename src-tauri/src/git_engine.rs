use std::path::Path;
use std::process::Command;

use chrono::{DateTime, TimeZone, Utc};
use git2::{DiffOptions, Repository, Signature, Sort};

use crate::error::PvError;
use crate::models::{
    BranchInfo, CommitInfo, ConflictFile, DiffResult, FileEntry, RepoStatus, StashEntry,
    SyncResult, SyncState, TagInfo,
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

    let output = Command::new("git")
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
                let status = format!("{:?}", delta.status());
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
                let status = format!("{:?}", delta.status());
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

        // Also include untracked files
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
                let full_path = std::path::Path::new(&repo_path).join(&path);
                let size = std::fs::metadata(&full_path).map(|m| m.len()).unwrap_or(0);
                files.push(FileEntry {
                    path,
                    status: "Untracked".into(),
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
        let mut index = repo.index()?;
        index.add_path(Path::new(&file_path))?;
        index.write()?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
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
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.path(&file_path).force();
        repo.checkout_head(Some(&mut checkout))?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
}

pub async fn stage_all(repo_path: String) -> Result<(), PvError> {
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)
            .map_err(|_| PvError::NotGitRepo(repo_path.clone()))?;
        let mut index = repo.index()?;
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
        index.write()?;
        Ok(())
    })
    .await
    .map_err(|e| PvError::Git(git2::Error::from_str(&e.to_string())))?
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
        let output = Command::new("git")
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
        let output = Command::new("git")
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
