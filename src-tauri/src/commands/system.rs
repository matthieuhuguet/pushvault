use std::path::Path;
use std::process::Command as SysCommand;
use tauri::command;
use tauri::Manager;

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

#[command]
pub async fn open_in_vscode(path: String) -> Result<(), String> {
    SysCommand::new("code")
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
