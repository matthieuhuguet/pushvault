# PushVault Roadmap

## v4.0.0 — Current (Tauri 2.0 Rewrite)

### Foundation
- [x] Tauri 2.0 + Rust + React/TypeScript scaffold
- [x] libgit2 git engine (git2 crate)
- [x] tokio async, spawn_blocking for all git ops
- [x] Spotify-dark design system
- [x] System tray (minimize to tray, tray menu)
- [x] Config migration from Python v3

### Git Operations
- [x] Status (porcelain v2, ahead/behind, conflicts)
- [x] Fetch / Pull (fast-forward + merge) / Push
- [x] Sync All with progress events
- [x] Stage / Unstage / Discard (file and all)
- [x] Commit with amend support
- [x] Diff (staged, working tree, commit)
- [x] Commit history with inline diffs
- [x] Stash (save, apply, pop, drop, clear)
- [x] Clone with folder picker
- [x] Branch management (list, create, switch, delete)
- [x] Conflict resolution (ours/theirs/abort/commit)
- [x] Tag management (list, create, delete)
- [x] Reset (soft/mixed/hard)
- [x] Revert commit
- [x] Cherry-pick commit
- [x] Remote URL detection
- [x] .gitignore editor

### Multi-Repo Dashboard
- [x] Spotify-style album card grid
- [x] Live status badges (staged/modified/untracked/deleted/ahead/behind)
- [x] Human-readable status text
- [x] Filter pills with counts
- [x] Search by repo name
- [x] Right-click context menu (full)
- [x] Scan folder to bulk-add repos
- [x] Onboarding wizard (first run)

### UI Panels
- [x] Staging area (4-section file manager + diff viewer)
- [x] Commit input with conventional commits autocomplete
- [x] Secret detection in commit messages
- [x] Branch manager overlay
- [x] Conflict resolver (3-panel)
- [x] Stash manager
- [x] Tag manager
- [x] Commit history with context menu (revert, cherry-pick, reset, tag)
- [x] Clone dialog
- [x] Settings (General / Repos / Appearance / Security / GitHub)
- [x] Keyboard shortcuts help
- [x] Command palette (Ctrl+P)
- [x] Activity log

### System
- [x] Open in Explorer / VS Code / Terminal
- [x] Auto-fetch interval (configurable)
- [x] Toast notifications (4 levels, auto-dismiss)
- [x] Keyboard shortcuts (Ctrl+S/R/K/P/N/,)
- [x] Bulk status endpoint (performance)

### GitHub Integration
- [x] PAT authentication
- [x] List user repos (search + filter)
- [x] One-click clone + auto-add
- [x] CI status fetch (latest workflow run)

### Large Files
- [x] Auto-chunking > 49 MB (zip, SHA-256)
- [x] Skip patterns (point clouds, node_modules)
- [x] .gitignore auto-management

## v4.1.0 — Iteration 9 & 10 Additions

### Git Advanced (Completed)
- [x] Hunk-level staging (`+ Stage` / `✕ Discard` buttons per diff hunk)
- [x] Hunk-level discard (reverse-apply via `git apply --reverse`)
- [x] Add repository via native folder picker (Settings > Repositories)

### UI Polish (Completed)
- [x] Virtual scrolling for commit history (react-virtuoso, infinite scroll)
- [x] List / Grid view toggle on Dashboard
- [x] Side-by-side diff mode (toggle in DiffViewer stats bar)

### Performance (Completed)
- [x] Filesystem watcher (notify crate, debounced, real-time status refresh)
- [x] `repo-changed` Tauri events replace polling-only model

## v4.2.0 — Iteration 11 Additions (Current)

### Bug Fixes
- [x] Stage all / stage file / discard file now use subprocess git (fixes nested-repo "invalid path" error)
- [x] Amend commit: allow 0 staged files (message-only amend)
- [x] File context menu "Open in Editor" uses absolute path (was relative — bug)
- [x] Delete untracked file uses correct IPC (deleteUntrackedFile vs discardFile)

### Git Maintenance
- [x] Git GC (`git gc --prune=now`) — in context menu + command palette
- [x] Fetch & Prune (`git fetch --all --prune`) — in context menu + command palette
- [x] Remote Prune (`git remote prune origin`) — in context menu + BranchManager
- [x] Detached HEAD detection + "Create Branch Here" banner in BranchManager
- [x] Amend commit message workflow (auto-populates last commit message)
- [x] Get/set HEAD info (hash, message, detached state)

### UI / UX Improvements
- [x] Open in VS Code from DiffViewer stats bar (⎈ Open button)
- [x] Copy file path from DiffViewer stats bar (⎘ Copy path button)
- [x] Copy path from StagingArea file context menu
- [x] Diff search (Ctrl+F): highlights matches, dims non-matching lines
- [x] Create PR button in StagingArea header (GitHub repos only)
- [x] Amend/Commit button label changes based on mode ("Amend" vs "Commit")
- [x] Amend + Push button in amend mode
- [x] Windows startup launch toggle (Settings > General)
- [x] F5 global keyboard shortcut for refresh
- [x] Maintenance items in command palette (GC, Fetch & Prune per repo)
- [x] Updated keyboard shortcuts help (Ctrl+F, right-click, Ctrl+P)

## v4.3.0 — Iteration 12 (Current)

### GitHub API (Deeper)
- [x] GitHub Actions workflow runs UI (per-repo badge + WorkflowRunsModal detail view)
- [x] "View on GitHub" + "New PR" buttons in CommitHistory header
- [x] PR list view per repo (GitHubPRsModal: open/closed filter, draft badge, head→base branch)
- [x] Issue list view per repo (GitHubIssuesModal: labels with colors, comment count, state filter)
- [x] All GitHub modals accessible from repo right-click menu (Pull Requests / Issues / Actions)
- [x] Release creation

### Git Advanced
- [x] Stash diff view (inline diff expansion with ▼ Diff button per stash entry)
- [x] Merge branch into current (BranchManager "Merge" button with confirmation)
- [x] Push branch to remote with --set-upstream (BranchManager "Push" button)
- [x] Rename branch (BranchManager "Rename" with inline prompt)
- [x] Interactive rebase (squash, fixup, reorder)
- [x] Submodule management
- [x] Worktree management
- [x] Git LFS integration (detect, list tracks, track/untrack patterns, quick-add suggestions panel)
- [x] Bisect workflow (BisectPanel: start with good/bad, mark good/bad/skip, progress bar, log view, reset)

### UI Polish
- [x] Drag-and-drop to reorder repo cards (HTML5 native DnD)
- [x] Stats summary bar on Dashboard (total / with changes / needs push / issues)
- [x] Minimap scrollbar in DiffViewer (canvas-based, click-to-jump)
- [x] CommitHistory: search bar + keyboard navigation (↑↓ / Enter) + blue focus highlight
- [x] ActivityLog: relative timestamps (e.g. "2m ago") with 30s auto-refresh
- [x] RepoCard context menu: "Sync", "Open on GitHub", "Copy Remote URL", "Reveal in Explorer"
- [x] Right-click context menu on list-view rows in Dashboard
- [x] Keyboard shortcuts: Ctrl+A (stage all), Ctrl+Shift+U (unstage all), Ctrl+Enter (commit)
- [x] Reveal in Explorer from StagingArea file context menu
- [x] BranchManager: color-coded remote (blue) vs local, "current" badge, Merge/Push/Rename/Delete
- [x] CommandPalette: Pull / Sync / Open in Terminal / Open in Explorer per repo
- [x] Dark title bar (Windows 11 Mica effect via window-vibrancy, transparent window)
- [x] Animated card transitions (staggered scale+fade, list row slide-in)

### System
- [ ] Auto-update (Tauri updater, Ed25519 signature)
- [ ] Silent install / MSI enterprise deployment
- [x] Portable mode (config next to exe — drop pushvault.portable marker file)
- [ ] Crash reporting (minidump)

### Security
- [x] Windows Credential Manager for token storage (keyring crate, mirrors to OS keychain on save)
- [x] GPG commit signing (subprocess-based, OS GPG agent compatible, Settings > Security)
- [x] Audit log for destructive operations
- [x] Lock screen for destructive ops (ConfirmModal with phrase-typing for hard reset + branch delete)

## v5.0.0 — Future

- [ ] GitLab support
- [ ] Bitbucket support
- [ ] Plugin system (WASM)
- [ ] AI commit messages (local LLM)
- [ ] Team features (live collaborator activity)
- [ ] Mobile companion app (repo status on phone)
- [ ] macOS + Linux builds
