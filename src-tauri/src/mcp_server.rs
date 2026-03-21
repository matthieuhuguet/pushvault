//! Built-in MCP (Model Context Protocol) server for PushVault.
//!
//! When invoked via `pushvault.exe --mcp`, the binary runs a JSON-RPC 2.0
//! server over stdin/stdout that exposes PushVault's git operations as MCP
//! tools.  Claude Code, Cursor, or any MCP-compatible client can connect.
//!
//! Protocol: newline-delimited JSON-RPC 2.0 over stdio.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

use crate::config;
use crate::git_engine;

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[allow(dead_code)]
struct RpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct RpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Serialize)]
struct RpcError {
    code: i32,
    message: String,
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

fn tool_definitions() -> Value {
    json!({
        "tools": [
            {
                "name": "list_repos",
                "description": "List all repositories managed by PushVault with their paths and config.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "repo_status",
                "description": "Get the full status of a git repository: branch, ahead/behind, staged/modified/untracked counts, last commit, sync state.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "get_diff",
                "description": "Get the diff for a repository. Can show staged or unstaged changes, optionally for a specific file.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "file": { "type": "string", "description": "Optional: specific file path to diff" },
                        "staged": { "type": "boolean", "description": "If true, show staged (index) diff. Default: false (working tree)" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "get_log",
                "description": "Get the commit history for a repository.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "limit": { "type": "integer", "description": "Number of commits to return (default: 20)" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "stage_files",
                "description": "Stage specific files or all files in a repository.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "files": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "List of file paths to stage. If empty, stages all changes."
                        }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "commit",
                "description": "Create a commit in the repository with the given message.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "message": { "type": "string", "description": "Commit message" },
                        "amend": { "type": "boolean", "description": "If true, amend the last commit" }
                    },
                    "required": ["path", "message"]
                }
            },
            {
                "name": "push",
                "description": "Push the current branch to its remote.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "pull",
                "description": "Pull changes from the remote. Optionally uses rebase strategy.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "rebase": { "type": "boolean", "description": "If true, pull with --rebase" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "get_branches",
                "description": "List all branches in a repository.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "switch_branch",
                "description": "Switch to a different branch.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "branch": { "type": "string", "description": "Branch name to switch to" }
                    },
                    "required": ["path", "branch"]
                }
            },
            {
                "name": "create_branch",
                "description": "Create a new branch, optionally from a specific base.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "name": { "type": "string", "description": "Name for the new branch" },
                        "from": { "type": "string", "description": "Optional: base branch or commit to branch from" }
                    },
                    "required": ["path", "name"]
                }
            },
            {
                "name": "get_staged_files",
                "description": "List all staged files in a repository.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "get_unstaged_files",
                "description": "List all unstaged (modified, untracked, deleted) files in a repository.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "sync_repo",
                "description": "Full sync: stage, commit, pull, push. Use for quick one-click sync.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "message": { "type": "string", "description": "Commit message (default: 'chore: sync via PushVault')" }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "get_github_issues",
                "description": "List GitHub issues for a repository. Requires the repo to have a GitHub remote.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the git repository" },
                        "state": { "type": "string", "description": "Issue state filter: 'open', 'closed', 'all' (default: 'open')" }
                    },
                    "required": ["path"]
                }
            }
        ]
    })
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async fn handle_tool_call(name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "list_repos" => {
            let cfg = config::load_config();
            let repos: Vec<Value> = cfg
                .repos
                .iter()
                .map(|r| {
                    json!({
                        "name": r.name,
                        "path": r.path,
                        "remote": r.remote,
                        "icon": r.icon,
                        "color": r.color,
                    })
                })
                .collect();
            Ok(json!({ "repos": repos }))
        }

        "repo_status" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let status = git_engine::get_repo_status(path.to_string())
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(&status).unwrap_or(json!(null)))
        }

        "get_diff" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let file = args["file"].as_str().map(|s| s.to_string());
            let staged = args["staged"].as_bool().unwrap_or(false);
            let diff = git_engine::get_diff(path.to_string(), file, staged)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(&diff).unwrap_or(json!(null)))
        }

        "get_log" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let limit = args["limit"].as_u64().unwrap_or(20) as u32;
            let log = git_engine::get_log(path.to_string(), limit)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(&log).unwrap_or(json!(null)))
        }

        "stage_files" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let files = args["files"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            if files.is_empty() {
                git_engine::stage_all(path.to_string())
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(json!({ "message": "All files staged" }))
            } else {
                for file in &files {
                    git_engine::stage_file(path.to_string(), file.clone())
                        .await
                        .map_err(|e| e.to_string())?;
                }
                Ok(json!({ "message": format!("{} files staged", files.len()) }))
            }
        }

        "commit" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let message = args["message"].as_str().ok_or("Missing 'message'")?;
            let amend = args["amend"].as_bool().unwrap_or(false);
            let hash = git_engine::commit(path.to_string(), message.to_string(), amend)
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({ "hash": hash, "message": "Committed successfully" }))
        }

        "push" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            // Try libgit2 first, fall back to CLI
            match git_engine::push_repo(path.to_string()).await {
                Ok(msg) => Ok(json!({ "message": msg })),
                Err(_) => {
                    let msg = git_engine::push_cli(path.to_string())
                        .await
                        .map_err(|e| e.to_string())?;
                    Ok(json!({ "message": msg }))
                }
            }
        }

        "pull" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let rebase = args["rebase"].as_bool().unwrap_or(false);
            if rebase {
                let msg = git_engine::pull_cli(path.to_string(), true)
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(json!({ "message": msg }))
            } else {
                match git_engine::pull_repo(path.to_string()).await {
                    Ok(msg) => Ok(json!({ "message": msg })),
                    Err(_) => {
                        let msg = git_engine::pull_cli(path.to_string(), false)
                            .await
                            .map_err(|e| e.to_string())?;
                        Ok(json!({ "message": msg }))
                    }
                }
            }
        }

        "get_branches" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let branches = git_engine::list_branches(path.to_string())
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(&branches).unwrap_or(json!(null)))
        }

        "switch_branch" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let branch = args["branch"].as_str().ok_or("Missing 'branch'")?;
            git_engine::switch_branch(path.to_string(), branch.to_string())
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({ "message": format!("Switched to branch '{}'", branch) }))
        }

        "create_branch" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let name = args["name"].as_str().ok_or("Missing 'name'")?;
            let from = args["from"].as_str().map(String::from);
            git_engine::create_branch(path.to_string(), name.to_string(), from)
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({ "message": format!("Created branch '{}'", name) }))
        }

        "get_staged_files" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let files = git_engine::get_staged_files(path.to_string())
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(&files).unwrap_or(json!(null)))
        }

        "get_unstaged_files" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let files = git_engine::get_unstaged_files(path.to_string())
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(&files).unwrap_or(json!(null)))
        }

        "sync_repo" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let message = args["message"].as_str().unwrap_or("").to_string();
            let result = git_engine::sync_repo(path.to_string(), message)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(&result).unwrap_or(json!(null)))
        }

        "get_github_issues" => {
            let path = args["path"].as_str().ok_or("Missing 'path'")?;
            let state = args["state"].as_str().unwrap_or("open");
            // Get remote URL to determine GitHub repo
            let remote_url = git_engine::get_remote_url(path.to_string())
                .await
                .map_err(|e| e.to_string())?;

            // Parse owner/repo from URL
            let clean = remote_url.trim().trim_end_matches(".git").to_string();
            let (owner, repo_name) = if clean.contains("github.com/") {
                let parts: Vec<&str> = clean.rsplitn(3, '/').collect();
                if parts.len() >= 2 {
                    (parts[1].to_string(), parts[0].to_string())
                } else {
                    return Err("Cannot parse GitHub URL".into());
                }
            } else if clean.contains("github.com:") {
                let after = clean.split("github.com:").nth(1).unwrap_or("");
                let parts: Vec<&str> = after.splitn(2, '/').collect();
                if parts.len() == 2 {
                    (parts[0].to_string(), parts[1].to_string())
                } else {
                    return Err("Cannot parse GitHub SSH URL".into());
                }
            } else {
                return Err("Not a GitHub repository".into());
            };

            let token = get_github_token();
            let url = format!(
                "https://api.github.com/repos/{}/{}/issues?state={}&per_page=30&sort=updated",
                owner, repo_name, state
            );
            let client = reqwest::Client::new();
            let mut req = client.get(&url)
                .header("User-Agent", "PushVault/4.5")
                .header("Accept", "application/vnd.github.v3+json");
            if let Some(t) = &token {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
            let resp = req.send().await.map_err(|e| e.to_string())?;
            let body: Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(body)
        }

        _ => Err(format!("Unknown tool: {}", name)),
    }
}

fn get_github_token() -> Option<String> {
    // Try keyring first
    if let Ok(entry) = keyring::Entry::new("pushvault", "github_token") {
        if let Ok(token) = entry.get_password() {
            if !token.is_empty() {
                return Some(token);
            }
        }
    }
    // Try config
    let cfg = config::load_config();
    let token = cfg.github_token.clone();
    if !token.is_empty() {
        Some(token)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Main MCP server loop
// ---------------------------------------------------------------------------

pub async fn run_mcp_server() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdout = stdout.lock();

    // Read line by line (newline-delimited JSON-RPC)
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let request: RpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let err_resp = json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": { "code": -32700, "message": format!("Parse error: {}", e) }
                });
                let _ = writeln!(stdout, "{}", err_resp);
                let _ = stdout.flush();
                continue;
            }
        };

        let id = request.id.clone().unwrap_or(json!(null));

        let response = match request.method.as_str() {
            "initialize" => {
                RpcResponse {
                    jsonrpc: "2.0".into(),
                    id,
                    result: Some(json!({
                        "protocolVersion": "2024-11-05",
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "pushvault-mcp",
                            "version": "4.5.0"
                        }
                    })),
                    error: None,
                }
            }

            "notifications/initialized" => {
                // No response needed for notifications
                continue;
            }

            "tools/list" => {
                RpcResponse {
                    jsonrpc: "2.0".into(),
                    id,
                    result: Some(tool_definitions()),
                    error: None,
                }
            }

            "tools/call" => {
                let tool_name = request.params["name"].as_str().unwrap_or("");
                let arguments = &request.params["arguments"];

                match handle_tool_call(tool_name, arguments).await {
                    Ok(result) => RpcResponse {
                        jsonrpc: "2.0".into(),
                        id,
                        result: Some(json!({
                            "content": [{
                                "type": "text",
                                "text": serde_json::to_string_pretty(&result).unwrap_or_default()
                            }]
                        })),
                        error: None,
                    },
                    Err(e) => RpcResponse {
                        jsonrpc: "2.0".into(),
                        id,
                        result: Some(json!({
                            "content": [{
                                "type": "text",
                                "text": format!("Error: {}", e)
                            }],
                            "isError": true
                        })),
                        error: None,
                    },
                }
            }

            _ => {
                RpcResponse {
                    jsonrpc: "2.0".into(),
                    id,
                    result: None,
                    error: Some(RpcError {
                        code: -32601,
                        message: format!("Method not found: {}", request.method),
                    }),
                }
            }
        };

        let json_out = serde_json::to_string(&response).unwrap_or_default();
        let _ = writeln!(stdout, "{}", json_out);
        let _ = stdout.flush();
    }
}
