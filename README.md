# PushVault v4.0.0

**Multi-repository Git manager built for creatives and engineers.**
Track, sync, and push all your projects from one beautiful Spotify-dark dashboard.

---

## Architecture

**PushVault v4** is a complete rewrite using **Tauri 2.0 + Rust + React/TypeScript**.

```
┌─────────────────────────────────────────────┐
│  React 18 + TypeScript (WebView frontend)   │
│  Zustand state · Vite bundler               │
├─────────────────────────────────────────────┤
│         Tauri 2.0 IPC Bridge                │
│  50+ typed commands · progress events       │
├─────────────────────────────────────────────┤
│     Rust Backend (src-tauri/src/)           │
│  libgit2 (git2 crate) · tokio async         │
│  spawn_blocking for all git ops             │
└─────────────────────────────────────────────┘
```

## Features

### Core Git Engine (Rust + libgit2)
- **Status**: Full porcelain v2 parsing — staged, modified, untracked, deleted, ahead/behind, conflicts
- **Fetch / Pull / Push** with credential helper & SSH agent support
- **Sync All**: parallel sync with Tauri progress events
- **Staging**: stage/unstage/discard by file or all; status icons per type
- **Commit**: amend, conventional commits autocomplete, secret detection
- **Diff**: staged or working-tree; unified format with stats
- **History**: full log with inline diffs, cherry-pick, revert, reset
- **Stash**: save (with message + untracked), apply, pop, drop, clear
- **Clone**: with progress and auto-add to config

### Branch Management
- List local + remote branches with ahead/behind counts
- Create, switch, delete branches

### Conflict Resolution
- Detect conflict type (both-modified, deleted-by-us/them)
- Use Ours / Use Theirs per file · Abort merge · Commit merge

### Tag Management
- List lightweight and annotated tags
- Create / delete tags

### Advanced Git Operations
- **Reset**: soft / mixed / hard to any commit
- **Revert**: create revert commit
- **Cherry-pick**: apply single commit
- **Remote URL**: detect GitHub URL for "View on GitHub"

### Multi-Repo Dashboard
- Spotify-style album card grid, responsive columns
- Live status: staged/modified/untracked/deleted counts, ahead/behind
- Human-readable status text
- Filter pills: All · Needs Push · Needs Pull · Synced · Conflicts · Errors
- Search by repo name · right-click context menu

### GitHub Integration
- Connect with Personal Access Token (PAT)
- View account info and all repos · filter and search
- One-click Clone + auto-add to PushVault

### File Management
- Large files auto-chunked into 49 MB zip parts (`.pv_chunks/`)
- SHA-256 integrity per chunk
- Secret detection in commit messages (API keys, tokens, passwords)

### User Interface
- **Spotify-dark** design: `#000` sidebar · `#121212` content · `#1DB954` green
- Onboarding wizard for first run
- Keyboard shortcuts (Ctrl+S sync, Ctrl+K search, Ctrl+/ help)
- Conventional commits autocomplete
- Toast notifications · Activity log
- Branch manager · Conflict resolver · Stash manager · Tag manager
- `.gitignore` editor with quick-add patterns
- Scan folder for repos (bulk add)
- Clone dialog · Settings

### System Integration
- **System tray**: minimize to tray, toggle show/hide
- **Auto-fetch** at configurable interval (1–60 min)
- **Config migration** from Python v3 `config.json`
- Open in Explorer / VS Code / Terminal
- Windows Credential Manager (via git credential helper)

## Build

**Prerequisites:** Rust 1.70+ · Node.js 18+ · Git

```bash
npm install
npm run tauri dev      # development (hot reload)
npm run tauri build    # production — MSI + NSIS installers
```

**Output:** `src-tauri/target/release/bundle/`

## Config

Stored at `%AppData%\pushvault\config.json`. Legacy Python config auto-migrated on first launch.

## Project Structure

```
├── src/                    # React/TypeScript frontend
│   ├── App.tsx             # Root, keyboard bindings, overlay routing
│   ├── components/         # 25+ UI modules
│   ├── store/              # Zustand stores
│   ├── lib/ipc.ts          # 50+ typed Tauri commands
│   └── types/index.ts      # Shared TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── git_engine.rs   # All git ops (libgit2, 1000+ lines)
│   │   ├── chunk_engine.rs # Large file chunking
│   │   ├── config.rs       # JSON config + legacy migration
│   │   ├── models.rs       # Data structures
│   │   ├── commands/       # Tauri IPC (git, config, system)
│   │   └── lib.rs          # Tauri builder, tray, window events
│   └── tauri.conf.json
├── pushvault/              # Legacy Python v3 (reference)
└── docs/                   # VISION.md, ROADMAP.md
```

---

*PushVault v4.0.0 — Tauri 2.0 · Rust · React/TypeScript · libgit2*
