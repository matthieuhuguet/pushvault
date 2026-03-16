# PushVault Architecture

## Overview

PushVault v4 is a desktop application built with Tauri 2.0, consisting of:
- **Rust backend** (src-tauri/src/) — git operations, file system, config
- **React frontend** (src/) — UI, state management, user interaction
- **Tauri IPC bridge** — typed commands connecting frontend to backend

## Backend Architecture (Rust)

### Module Structure

```
src-tauri/src/
├── main.rs           Entry point (windows_subsystem = "windows")
├── lib.rs            Tauri Builder setup, tray, window events, command registration
├── error.rs          PvError — unified error type (thiserror)
├── models.rs         All data structures (Serde serialize/deserialize)
├── state.rs          AppState — Arc<RwLock<AppConfig>> shared state
├── config.rs         JSON load/save/migrate (AppData + legacy migration)
├── git_engine.rs     All git operations via libgit2 (~1000 lines)
├── chunk_engine.rs   Large file preprocessing (zip chunks, SHA-256)
└── commands/
    ├── mod.rs        Module exports
    ├── git.rs        ~45 #[tauri::command] git wrappers
    ├── config.rs     5 config commands
    └── system.rs     System utilities (shell, scan, init, CI status)
```

### Threading Model

All blocking operations run in `tokio::task::spawn_blocking`:
- git2 operations are synchronous — wrapped in spawn_blocking
- I/O operations use tokio::fs async variants
- State mutations use Arc<RwLock<>> — read() for queries, write() for mutations
- The Tauri runtime manages its own tokio executor

### Git Engine (git2 / libgit2)

**Status parsing** uses `git status --porcelain=v2 --branch` via std::process::Command for ahead/behind counts (git2 doesn't expose these easily), combined with git2's native status API for file-level information.

**Credential handling**:
1. SSH: `git2::Cred::ssh_key_from_agent(username)`
2. HTTPS: `git2::Cred::credential_helper(config, url, username)` → falls back to `git2::Cred::default()`

**Pull strategy**: fetch → merge analysis → fast-forward if possible → normal merge → error on conflict.

**Push flow**: chunk preprocessing → stage all → commit → push to origin/<branch>.

### Chunk Engine

Files exceeding `max_file_size_mb` (default 49 MB) are split into zip archives:
1. Scan worktree via walkdir, skip excluded paths/extensions
2. Split into N × 49 MB zip chunks in `.pv_chunks/`
3. Generate SHA-256 manifest in `.pv_chunks/manifest.json`
4. Append original paths to `.gitignore` (under `# PushVault managed` section)
5. Chunks appear as normal untracked files to git

Skip patterns: `.pts .las .laz .pcd .e57 .ptx .xyb .xyz` (point clouds)
Skip dirs: `.git .claude downloads node_modules target`

### Config

**Primary path**: `%AppData%\pushvault\config.json`
**Legacy migration**: reads `config.json` from project root (Python v3 format), maps `window.{width,height}` → `window_{width,height}`
**Backup**: `.json.bak` created before each write

## Frontend Architecture (React/TypeScript)

### Component Tree

```
App
├── Sidebar                    Navigation (Dashboard/History/Activity/Settings)
├── Header                     Greeting + Search + Version badge
├── main
│   ├── Dashboard              Responsive card grid
│   │   ├── FilterPills        All/NeedsPush/NeedsPull/Synced/Conflicts/Errors
│   │   └── RepoCard × N       Album-card style with context menu
│   ├── CommitHistory          History tab (per-repo)
│   ├── ActivityLog            Operation log with filter/export
│   └── Settings               General/Repos/Appearance/GitHub tabs
├── BottomBar                  Sync status + Fetch All + Sync All
│
├── [Overlays — conditional]
│   ├── StagingArea            4-section file manager + DiffViewer + CommitInput
│   ├── BranchManager          Local/remote branches with create/switch/delete
│   ├── ConflictResolver       3-panel ours/base/theirs
│   ├── StashManager           Stash list + save/apply/pop/drop
│   ├── TagManager             Tag list + create/delete
│   ├── GitignoreEditor        .gitignore textarea + quick-add
│   ├── ScanRepos              Folder scanner → bulk add
│   ├── CloneDialog            URL input + folder picker
│   ├── Onboarding             First-run wizard
│   ├── KeyboardHelp           Shortcut reference
│   └── CommandPalette         VS Code-style fuzzy command search
│
└── ToastContainer             Fixed bottom-right notification stack
```

### State Management (Zustand)

| Store | Purpose |
|-------|---------|
| `repoStore` | AppConfig, repo statuses, CRUD operations |
| `uiStore` | Active tab, active panel, selected repo, search, sync state |
| `toastStore` | Toast queue with auto-dismiss |
| `activityStore` | Operation log (last 200 entries) |
| `githubStore` | GitHub token, user, repos, CI statuses |

### IPC Layer (src/lib/ipc.ts)

All Tauri invoke() calls are wrapped in typed functions:
- Input/output types match Rust models exactly
- Rust errors map to `Result<T, String>` → rejected Promise
- 50+ commands organized by domain

### Event System

Backend → Frontend events via `tauri::Emitter`:
- `sync-progress`: `{ path, step, message, success? }` — emitted during sync operations

Frontend subscribes via `@tauri-apps/api/event listen()`.

## Data Flow

### Sync All flow
```
User clicks Sync All
  → App.tsx handleSyncAll()
    → ipc.syncAll()
      → Rust commands::git::sync_all()
        → for each repo: git_engine::sync_repo()
          → fetch_repo() + pull_repo() + push_repo()
          → Emits "sync-progress" events
      → Returns Vec<SyncResult>
    → refreshAllStatuses() (bulk)
    → addToast(success/warning)
```

### Status refresh flow
```
Timer fires (every N minutes)
  → repoStore.refreshAllStatuses()
    → ipc.getAllRepoStatuses()
      → Rust commands::system::get_all_repo_statuses()
        → for each config.repo: git_engine::get_repo_status()
          → git status --porcelain=v2 (Command)
          → git2 last commit info
        → Returns Vec<RepoStatus>
    → set({ statuses }) — single Zustand update
    → Dashboard re-renders (only changed cards)
```

## Security

- Credentials stored via system git credential helper (Windows Credential Manager)
- SSH key via ssh-agent (Pageant, OpenSSH)
- GitHub token stored in localStorage (browser storage, not disk plaintext)
- `GIT_TERMINAL_PROMPT=0` prevents credential prompts from blocking
- `GIT_ASKPASS=echo` fails fast on missing credentials
- WebView CSP: `null` (permissive for local content only)
- No external scripts loaded
- Secrets detected in commit messages before commit (regex patterns)

## Performance

| Operation | Target | Mechanism |
|-----------|--------|-----------|
| Startup | < 500ms | Lazy config load, no pre-fetching |
| Status (all repos) | < 200ms | Bulk IPC + parallel git calls |
| Single diff | < 50ms | git2 native diff, streaming |
| Bundle size | < 15 MB | Tauri (no Electron), LTO, strip |

## Build System

- `vite build` compiles React → `dist/`
- `cargo build` compiles Rust → `pushvault.exe`
- `tauri build` bundles both → MSI + NSIS installers
- WiX Toolset (MSI) + NSIS auto-downloaded by Tauri CLI

## Configuration Reference

```json
{
  "repos": [{
    "name": "string",
    "path": "absolute path",
    "remote": "https://github.com/...",
    "icon": "brain|camera|code|art|music|video|game|book|star|folder|portfolio|download",
    "color": "#hex"
  }],
  "auto_check_interval_minutes": 1-60,
  "max_file_size_mb": 1-99,
  "batch_size": 5-500,
  "window_width": number,
  "window_height": number
}
```
