use std::path::Path;
use std::process::Command as SysCommand;
use tauri::command;
use tauri::{Emitter, Manager};

/// Create a `Command` that hides the console window on Windows.
#[cfg(target_os = "windows")]
fn hidden_cmd(program: &str) -> SysCommand {
    use std::os::windows::process::CommandExt;
    let mut cmd = SysCommand::new(program);
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

#[cfg(not(target_os = "windows"))]
fn hidden_cmd(program: &str) -> SysCommand {
    SysCommand::new(program)
}

#[command]
pub async fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        SysCommand::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Reveal a specific file in Explorer (select it in its parent folder).
#[command]
pub async fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        SysCommand::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn open_in_vscode(path: String) -> Result<(), String> {
    hidden_cmd("code")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("VS Code not found. Install it or add 'code' to PATH: {}", e))?;
    Ok(())
}

#[command]
pub async fn open_in_terminal(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Try Windows Terminal first, fall back to cmd
        let wt_result = SysCommand::new("wt")
            .args(["--startingDirectory", &path])
            .spawn();
        if wt_result.is_err() {
            SysCommand::new("cmd")
                .args(["/c", "start", "cmd"])
                .current_dir(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[command]
pub async fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[command]
pub async fn show_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e: tauri::Error| e.to_string())?;
        window.set_focus().map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

/// Get current config for auto-check interval
#[command]
pub async fn get_auto_check_interval(state: tauri::State<'_, crate::state::AppState>) -> Result<u64, String> {
    let cfg = state.config.read().await;
    Ok(cfg.auto_check_interval_minutes)
}

/// Read .gitignore from a repo
#[command]
pub async fn read_gitignore(repo_path: String) -> Result<String, String> {
    let path = Path::new(&repo_path).join(".gitignore");
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

/// Write .gitignore to a repo
#[command]
pub async fn write_gitignore(repo_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&repo_path).join(".gitignore");
    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// Scan a directory recursively for git repos (max 3 levels deep)
#[command]
pub async fn scan_for_repos(dir: String) -> Result<Vec<String>, String> {
    let base = Path::new(&dir);
    if !base.exists() {
        return Err(format!("Directory not found: {}", dir));
    }

    let mut repos = Vec::new();
    scan_dir(base, 0, 3, &mut repos);
    Ok(repos)
}

fn scan_dir(path: &Path, depth: usize, max_depth: usize, repos: &mut Vec<String>) {
    if depth > max_depth { return; }

    // Check if this directory is a git repo
    if path.join(".git").exists() {
        repos.push(path.to_string_lossy().to_string());
        return; // Don't recurse into git repos
    }

    // Recurse into subdirectories
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = p.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                // Skip common non-repo directories
                if !matches!(name.as_str(),
                    "node_modules" | "target" | ".git" | "dist" |
                    "build" | "__pycache__" | ".venv" | "venv" |
                    ".cache" | "vendor"
                ) {
                    scan_dir(&p, depth + 1, max_depth, repos);
                }
            }
        }
    }
}

/// Initialize a new git repository
#[command]
pub async fn init_repo(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        git2::Repository::init(&path)
            .map(|_| format!("Initialized git repository in {}", path))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Get file content at a specific commit
#[command]
pub async fn get_file_at_commit(repo_path: String, file_path: String, hash: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::open(&repo_path)
            .map_err(|e| e.to_string())?;
        let oid = git2::Oid::from_str(&hash).map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let tree = commit.tree().map_err(|e| e.to_string())?;
        let entry = tree.get_path(Path::new(&file_path)).map_err(|e| e.to_string())?;
        let blob = repo.find_blob(entry.id()).map_err(|e| e.to_string())?;
        let content = std::str::from_utf8(blob.content())
            .unwrap_or("(binary file)")
            .to_string();
        Ok(content)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Bulk status check for multiple repos (faster than individual calls)
#[command]
pub async fn get_all_repo_statuses(
    state: tauri::State<'_, crate::state::AppState>
) -> Result<Vec<crate::models::RepoStatus>, String> {
    let repos = {
        let cfg = state.config.read().await;
        cfg.repos.clone()
    };

    let mut results = Vec::new();
    for repo in repos {
        let status = crate::git_engine::get_repo_status(repo.path.clone())
            .await
            .unwrap_or_else(|e| crate::models::RepoStatus {
                path: repo.path,
                state: crate::models::SyncState::Error,
                staged: 0, modified: 0, untracked: 0, deleted: 0,
                ahead: 0, behind: 0,
                current_branch: "?".into(),
                last_commit: String::new(),
                last_commit_time: String::new(),
                conflicts: 0,
                error: Some(e.to_string()),
            });
        results.push(status);
    }
    Ok(results)
}

/// Save window position and size to config
#[command]
pub async fn save_window_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let size = window.inner_size().map_err(|e| e.to_string())?;
        let mut cfg = state.config.write().await;
        cfg.window_width = size.width;
        cfg.window_height = size.height;
        drop(cfg);
        let read_cfg = state.config.read().await;
        crate::config::save_config(&*read_cfg)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Fetch latest GitHub Actions workflow run status for a repo.
/// Returns: "success" | "failure" | "in_progress" | "unknown"
#[command]
pub async fn get_github_ci_status(
    repo_url: String,
    token: Option<String>,
) -> Result<String, String> {
    let (owner, repo) = parse_github_url(&repo_url)
        .ok_or_else(|| "Not a GitHub URL".to_string())?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/actions/runs?per_page=1",
        owner, repo
    );

    let client = reqwest::Client::new();
    let mut req = client
        .get(&url)
        .header("User-Agent", "PushVault/4.0")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok("unknown".to_string());
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let status = json["workflow_runs"][0]["conclusion"]
        .as_str()
        .or_else(|| json["workflow_runs"][0]["status"].as_str())
        .unwrap_or("unknown");

    Ok(match status {
        "success" => "success",
        "failure" | "cancelled" | "timed_out" => "failure",
        "in_progress" | "queued" | "waiting" => "in_progress",
        _ => "unknown",
    }
    .to_string())
}

/// Fetch the last N GitHub Actions workflow runs for a repo.
#[derive(serde::Serialize)]
pub struct WorkflowRun {
    pub id: u64,
    pub name: String,
    pub status: String,       // "success" | "failure" | "in_progress" | "unknown"
    pub branch: String,
    pub commit_sha: String,
    pub url: String,
    pub created_at: String,
}

#[command]
pub async fn get_github_workflow_runs(
    repo_url: String,
    token: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<WorkflowRun>, String> {
    let (owner, repo) = parse_github_url(&repo_url)
        .ok_or_else(|| "Not a GitHub URL".to_string())?;

    let per_page = limit.unwrap_or(10).min(30);
    let url = format!(
        "https://api.github.com/repos/{}/{}/actions/runs?per_page={}",
        owner, repo, per_page
    );

    let client = reqwest::Client::new();
    let mut req = client
        .get(&url)
        .header("User-Agent", "PushVault/4.0")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let runs = json["workflow_runs"].as_array().ok_or("No runs found")?;

    let result = runs.iter().map(|r| {
        let conclusion = r["conclusion"].as_str().unwrap_or("unknown");
        let raw_status = r["status"].as_str().unwrap_or("unknown");
        let status = match conclusion {
            "success" => "success",
            "failure" | "cancelled" | "timed_out" => "failure",
            _ => match raw_status {
                "in_progress" | "queued" | "waiting" => "in_progress",
                _ => "unknown",
            },
        };
        WorkflowRun {
            id: r["id"].as_u64().unwrap_or(0),
            name: r["name"].as_str().unwrap_or("").to_string(),
            status: status.to_string(),
            branch: r["head_branch"].as_str().unwrap_or("").to_string(),
            commit_sha: r["head_sha"].as_str().unwrap_or("").chars().take(8).collect(),
            url: r["html_url"].as_str().unwrap_or("").to_string(),
            created_at: r["created_at"].as_str().unwrap_or("").to_string(),
        }
    }).collect();

    Ok(result)
}

// ---------------------------------------------------------------------------
// GitHub Pull Requests
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct GitHubPR {
    pub number: u64,
    pub title: String,
    pub state: String,      // "open" | "closed" | "merged"
    pub author: String,
    pub base_branch: String,
    pub head_branch: String,
    pub url: String,
    pub created_at: String,
    pub draft: bool,
}

#[command]
pub async fn get_github_prs(
    repo_url: String,
    token: Option<String>,
    state: Option<String>,  // "open" | "closed" | "all" — defaults to "open"
) -> Result<Vec<GitHubPR>, String> {
    let (owner, repo) = parse_github_url(&repo_url)
        .ok_or_else(|| "Not a GitHub URL".to_string())?;

    let pr_state = state.as_deref().unwrap_or("open");
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state={}&per_page=30&sort=updated&direction=desc",
        owner, repo, pr_state
    );

    let client = reqwest::Client::new();
    let mut req = client
        .get(&url)
        .header("User-Agent", "PushVault/4.0")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(t) = &token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let arr = body.as_array().ok_or_else(|| {
        body["message"].as_str().unwrap_or("GitHub API error").to_string()
    })?;

    let result = arr.iter().map(|pr| {
        let is_merged = pr["merged_at"].is_string();
        let state_str = if is_merged { "merged" } else { pr["state"].as_str().unwrap_or("open") };
        GitHubPR {
            number: pr["number"].as_u64().unwrap_or(0),
            title: pr["title"].as_str().unwrap_or("").to_string(),
            state: state_str.to_string(),
            author: pr["user"]["login"].as_str().unwrap_or("").to_string(),
            base_branch: pr["base"]["ref"].as_str().unwrap_or("").to_string(),
            head_branch: pr["head"]["ref"].as_str().unwrap_or("").to_string(),
            url: pr["html_url"].as_str().unwrap_or("").to_string(),
            created_at: pr["created_at"].as_str().unwrap_or("").to_string(),
            draft: pr["draft"].as_bool().unwrap_or(false),
        }
    }).collect();

    Ok(result)
}

// ---------------------------------------------------------------------------
// GitHub Issues
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct GitHubIssue {
    pub number: u64,
    pub title: String,
    pub state: String,      // "open" | "closed"
    pub author: String,
    pub url: String,
    pub created_at: String,
    pub labels: Vec<String>,
    pub comments: u64,
    pub is_pr: bool,
}

#[command]
pub async fn get_github_issues(
    repo_url: String,
    token: Option<String>,
    state: Option<String>,
) -> Result<Vec<GitHubIssue>, String> {
    let (owner, repo) = parse_github_url(&repo_url)
        .ok_or_else(|| "Not a GitHub URL".to_string())?;

    let issue_state = state.as_deref().unwrap_or("open");
    let url = format!(
        "https://api.github.com/repos/{}/{}/issues?state={}&per_page=30&sort=updated&direction=desc",
        owner, repo, issue_state
    );

    let client = reqwest::Client::new();
    let mut req = client
        .get(&url)
        .header("User-Agent", "PushVault/4.0")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(t) = &token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let arr = body.as_array().ok_or_else(|| {
        body["message"].as_str().unwrap_or("GitHub API error").to_string()
    })?;

    let result = arr.iter().map(|issue| {
        let labels: Vec<String> = issue["labels"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|l| l["name"].as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        let is_pr = issue["pull_request"].is_object();
        GitHubIssue {
            number: issue["number"].as_u64().unwrap_or(0),
            title: issue["title"].as_str().unwrap_or("").to_string(),
            state: issue["state"].as_str().unwrap_or("open").to_string(),
            author: issue["user"]["login"].as_str().unwrap_or("").to_string(),
            url: issue["html_url"].as_str().unwrap_or("").to_string(),
            created_at: issue["created_at"].as_str().unwrap_or("").to_string(),
            comments: issue["comments"].as_u64().unwrap_or(0),
            labels,
            is_pr,
        }
    }).filter(|i| !i.is_pr) // exclude PRs from issues list
    .collect();

    Ok(result)
}

// ---------------------------------------------------------------------------
// GitHub Releases
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, Clone)]
pub struct GitHubRelease {
    pub id: u64,
    pub tag_name: String,
    pub name: String,
    pub html_url: String,
    pub published_at: String,
    pub draft: bool,
    pub prerelease: bool,
}

/// List the latest releases for a repo.
#[command]
pub async fn list_github_releases(
    repo_url: String,
    token: Option<String>,
) -> Result<Vec<GitHubRelease>, String> {
    let (owner, repo) = parse_github_url(&repo_url)
        .ok_or_else(|| "Not a GitHub URL".to_string())?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/releases?per_page=10",
        owner, repo
    );

    let client = reqwest::Client::new();
    let mut req = client
        .get(&url)
        .header("User-Agent", "PushVault/4.0")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(t) = &token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let arr = body.as_array().ok_or_else(|| {
        body["message"].as_str().unwrap_or("GitHub API error").to_string()
    })?;

    let result = arr.iter().map(|r| GitHubRelease {
        id: r["id"].as_u64().unwrap_or(0),
        tag_name: r["tag_name"].as_str().unwrap_or("").to_string(),
        name: r["name"].as_str().unwrap_or("").to_string(),
        html_url: r["html_url"].as_str().unwrap_or("").to_string(),
        published_at: r["published_at"].as_str()
            .or_else(|| r["created_at"].as_str())
            .unwrap_or("").to_string(),
        draft: r["draft"].as_bool().unwrap_or(false),
        prerelease: r["prerelease"].as_bool().unwrap_or(false),
    }).collect();

    Ok(result)
}

/// Create a new GitHub release.
#[command]
pub async fn create_github_release(
    repo_url: String,
    token: String,
    tag_name: String,
    name: String,
    body: String,
    draft: bool,
    prerelease: bool,
) -> Result<GitHubRelease, String> {
    let (owner, repo) = parse_github_url(&repo_url)
        .ok_or_else(|| "Not a GitHub URL".to_string())?;

    let url = format!("https://api.github.com/repos/{}/{}/releases", owner, repo);

    let payload = serde_json::json!({
        "tag_name": tag_name,
        "name": name,
        "body": body,
        "draft": draft,
        "prerelease": prerelease,
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("User-Agent", "PushVault/4.0")
        .header("Accept", "application/vnd.github.v3+json")
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let http_status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if !http_status.is_success() {
        let msg = json["message"].as_str().unwrap_or("GitHub API error");
        // GitHub sometimes provides additional errors array
        let errors = json["errors"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| e["message"].as_str())
                    .collect::<Vec<_>>()
                    .join("; ")
            })
            .unwrap_or_default();
        return Err(if errors.is_empty() {
            msg.to_string()
        } else {
            format!("{}: {}", msg, errors)
        });
    }

    Ok(GitHubRelease {
        id: json["id"].as_u64().unwrap_or(0),
        tag_name: json["tag_name"].as_str().unwrap_or("").to_string(),
        name: json["name"].as_str().unwrap_or("").to_string(),
        html_url: json["html_url"].as_str().unwrap_or("").to_string(),
        published_at: json["published_at"].as_str()
            .or_else(|| json["created_at"].as_str())
            .unwrap_or("").to_string(),
        draft: json["draft"].as_bool().unwrap_or(false),
        prerelease: json["prerelease"].as_bool().unwrap_or(false),
    })
}

// ---------------------------------------------------------------------------
// Windows startup (registry)
// ---------------------------------------------------------------------------

/// Returns true if PushVault is registered for Windows startup.
#[command]
#[cfg(target_os = "windows")]
pub async fn get_launch_at_startup() -> Result<bool, String> {
    let output = hidden_cmd("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "PushVault",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(output.status.success())
}

/// Add or remove PushVault from Windows startup registry.
#[command]
#[cfg(target_os = "windows")]
pub async fn set_launch_at_startup(enable: bool) -> Result<(), String> {
    if enable {
        let exe_path = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();
        let output = hidden_cmd("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "PushVault",
                "/t",
                "REG_SZ",
                "/d",
                &exe_path,
                "/f",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
    } else {
        // Ignore error — key may not exist
        let _ = hidden_cmd("reg")
            .args([
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "PushVault",
                "/f",
            ])
            .output();
    }
    Ok(())
}

// Non-Windows stubs
#[command]
#[cfg(not(target_os = "windows"))]
pub async fn get_launch_at_startup() -> Result<bool, String> { Ok(false) }

#[command]
#[cfg(not(target_os = "windows"))]
pub async fn set_launch_at_startup(_enable: bool) -> Result<(), String> {
    Err("Startup launch only supported on Windows".to_string())
}

// ---------------------------------------------------------------------------
// Portable mode
// ---------------------------------------------------------------------------

/// Returns true when PushVault is running in portable mode
/// (a `pushvault.portable` marker file is present next to the executable).
#[command]
pub async fn get_portable_mode() -> Result<bool, String> {
    Ok(crate::config::is_portable())
}

// ---------------------------------------------------------------------------
// Windows Credential Manager — secure token storage
// ---------------------------------------------------------------------------

const KEYRING_SERVICE: &str = "PushVault";
const KEYRING_GITHUB_USER: &str = "github_token";

/// Retrieve the GitHub PAT from the OS credential store.
/// Returns an empty string if no credential is stored.
#[command]
pub async fn get_stored_token() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        match keyring::Entry::new(KEYRING_SERVICE, KEYRING_GITHUB_USER) {
            Ok(entry) => match entry.get_password() {
                Ok(token) => Ok(token),
                Err(keyring::Error::NoEntry) => Ok(String::new()),
                Err(e) => Err(e.to_string()),
            },
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Save the GitHub PAT to the OS credential store.
/// Passing an empty string deletes the stored credential.
#[command]
pub async fn store_token(token: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_GITHUB_USER)
            .map_err(|e| e.to_string())?;
        if token.is_empty() {
            // Delete — ignore "no entry" error
            let _ = entry.delete_credential();
            Ok(())
        } else {
            entry.set_password(&token).map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Delete the stored GitHub PAT from the OS credential store.
#[command]
pub async fn delete_stored_token() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        match keyring::Entry::new(KEYRING_SERVICE, KEYRING_GITHUB_USER) {
            Ok(entry) => {
                let _ = entry.delete_credential();
                Ok(())
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn parse_github_url(url: &str) -> Option<(String, String)> {
    let url = url.trim_end_matches(".git");

    if let Some(rest) = url.strip_prefix("https://github.com/") {
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Filesystem watcher
// ---------------------------------------------------------------------------

/// Start watching all provided repo paths for changes.
/// Emits `"repo-changed"` events (payload = repo path string) to the frontend.
/// Replaces any previously running watchers.
#[command]
pub async fn setup_file_watchers(
    paths: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex as StdMutex};
    use std::time::{Duration, Instant};

    let mut ws = state.watcher_state.lock().map_err(|e| e.to_string())?;
    ws.watchers.clear();

    // Shared debounce map: repo_path -> last emit time
    let last_emit: Arc<StdMutex<HashMap<String, Instant>>> =
        Arc::new(StdMutex::new(HashMap::new()));

    for repo_path in &paths {
        let path_clone = repo_path.clone();
        let app_clone = app.clone();
        let last_emit_clone = last_emit.clone();

        let callback = move |result: notify::Result<notify::Event>| {
            let event = match result {
                Ok(e) => e,
                Err(_) => return,
            };

            // Only react to content-changing events
            let is_relevant = matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
            );
            if !is_relevant {
                return;
            }

            // Filter high-noise paths
            let noisy = event.paths.iter().any(|p| {
                let s = p.to_string_lossy();
                s.contains("node_modules")
                    || s.contains(".git\\objects")
                    || s.contains(".git/objects")
                    || s.contains("target\\")
                    || s.contains("target/")
                    || s.contains(".pv_chunks")
                    || s.ends_with(".tmp")
                    || s.ends_with('~')
            });
            if noisy {
                return;
            }

            // Debounce: emit at most once per 1.5 seconds per repo
            let mut map = last_emit_clone.lock().unwrap();
            let now = Instant::now();
            let should_emit = map
                .get(&path_clone)
                .map_or(true, |last| now.duration_since(*last) > Duration::from_millis(1500));

            if should_emit {
                map.insert(path_clone.clone(), now);
                drop(map);
                let _ = app_clone.emit("repo-changed", &path_clone);
            }
        };

        let mut watcher =
            RecommendedWatcher::new(callback, Config::default()).map_err(|e| e.to_string())?;

        // Watch .git dir (non-recursive) for git-operation changes
        let git_dir = std::path::Path::new(repo_path).join(".git");
        if git_dir.exists() {
            let _ = watcher.watch(&git_dir, RecursiveMode::NonRecursive);
        }

        // Watch workdir recursively for file changes
        let workdir = std::path::Path::new(repo_path);
        if workdir.exists() {
            let _ = watcher.watch(workdir, RecursiveMode::Recursive);
        }

        ws.watchers.push(watcher);
    }

    Ok(())
}
