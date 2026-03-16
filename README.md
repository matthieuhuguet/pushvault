# PushVault v4.3

**Multi-repository Git manager built for creatives and engineers.**
Track, sync, stage, and ship all your projects from one Spotify-dark dashboard.

> **Tech stack:** Tauri 2.0 · Rust (libgit2) · React 18 + TypeScript · Zustand · Vite

---

## What was built vs the original scope

| Area | v4.0 (initial scope) | v4.3 (current — added in sessions) |
|------|----------------------|-------------------------------------|
| Git engine | Status, fetch/pull/push, stage, commit, diff, log, stash, clone | + Hunk-level staging/discard, amend message, GPG signing, interactive rebase, bisect, LFS, worktrees, submodules |
| Branch management | List, create, switch, delete | + Rename, merge, push upstream, detached HEAD detection, remote prune |
| Dashboard | Card grid, filter pills, search | + List/grid toggle, drag-to-reorder cards, stats bar, animated transitions |
| Diff viewer | Unified diff, staged/unstaged | + Side-by-side mode, diff search (Ctrl+F), canvas minimap, hunk stage/discard buttons |
| Commit history | Log with inline diffs | + Virtual scroll (react-virtuoso), search + keyboard nav, cherry-pick/revert/reset context menu, cherry-pick/tag from history |
| GitHub integration | PAT auth, repo list, one-click clone | + CI/Actions workflow runs, PR list, Issue list, Release creation |
| Settings | General, Repos, Appearance | + Security (GPG signing, keychain token), GitHub section, portable mode indicator, startup toggle |
| Security | — | GPG commit signing, ConfirmModal (phrase-typing for hard reset), audit log, Windows Credential Manager |
| System | Tray, auto-fetch, Explorer/VSCode/Terminal | + Filesystem watcher (real-time refresh), command palette (Ctrl+P), git GC/fetch-prune/remote-prune, portable mode, Windows startup toggle |
| UI/UX | Onboarding, keyboard shortcuts, toasts | + KeyboardHelp overlay, command palette, context menus everywhere, Mica dark title bar (Windows 11) |

---

## Full Feature List

### Git Operations
- Status (porcelain v2 — staged / modified / untracked / deleted / ahead / behind / conflicts)
- Fetch · Pull (fast-forward + merge) · Push
- Sync All with real-time progress events
- Stage / Unstage / Discard — by file, all, or **individual hunk**
- Commit with amend, conventional-commits autocomplete, secret detection
- **GPG commit signing** (subprocess, OS GPG agent, key ID configurable)
- Diff — staged, working-tree, commit; side-by-side mode; Ctrl+F search; canvas minimap
- Commit history — virtual scroll, search, keyboard nav, context menu (revert/cherry-pick/reset/tag)
- Stash — save (message + untracked), apply, pop, drop, diff view
- Clone with folder picker + auto-add
- .gitignore editor with quick-add patterns

### Branch & Advanced Git
- Branch manager — list local/remote, create, switch, delete, rename, merge, push upstream, remote prune
- Detached HEAD detection with "Create Branch Here" banner
- Conflict resolver — Use Ours / Use Theirs per file, abort merge, commit merge
- Tag manager — list, create (lightweight + annotated), delete, push tags
- **Interactive rebase** — drag-to-reorder, pick / squash / fixup / reword / drop / edit, in-progress conflict handling
- **Git bisect** — setup, mark good/bad/skip, progress bar, log view, reset
- **Worktree manager** — list, add, remove
- **Submodule manager** — list, update, add, remove
- **Git LFS** — detect, list tracks, track/untrack patterns, 12 quick-add suggestions
- Reset (soft / mixed / hard), revert, cherry-pick
- Git GC, fetch & prune, remote prune, amend commit message

### Multi-Repo Dashboard
- Spotify-style album card grid with animated enter transitions (stagger)
- List view toggle with slide-in animations
- Drag-and-drop to reorder repo cards
- Live status badges — staged / modified / untracked / deleted / ahead / behind
- Stats summary bar — total repos / with changes / needs push / issues
- Filter pills with counts · Search by repo name
- Right-click context menu (grid + list view)
- Scan folder to bulk-add repos · Onboarding wizard

### GitHub Integration
- PAT authentication stored in **Windows Credential Manager** (OS keychain)
- GitHub repo browser — search, filter, one-click clone
- CI / Actions workflow runs per repo (status badge + detail modal)
- Pull Request list (open/closed/merged filter, draft badge, head→base)
- Issue list (labels with colors, comment count, state filter)
- Release creation (draft, prerelease, tag picker)

### User Interface
- **Spotify-dark** design system — `#000` sidebar · `#121212` content · `#1DB954` green
- **Windows 11 Mica** dark title bar (window-vibrancy, transparent window, rgba overlay)
- Command palette (Ctrl+P) — repo actions, git ops, navigation
- Keyboard shortcuts — Ctrl+S sync, Ctrl+R refresh, F5, Ctrl+K search, Ctrl+N clone, Ctrl+P palette, Ctrl+A stage all, Ctrl+Shift+U unstage all, Ctrl+Enter commit, Ctrl+/ help
- Keyboard shortcut help overlay
- Toast notifications (4 levels, auto-dismiss)
- Activity log with relative timestamps ("2m ago")
- ConfirmModal — phrase-typing confirmation for destructive operations (hard reset, force delete)
- Settings — General / Repositories / Appearance / Security / GitHub

### System
- System tray — minimize to tray, toggle show/hide, Sync All menu item
- Filesystem watcher (notify crate) — real-time status refresh, debounced
- Auto-fetch at configurable interval
- Window state persistence (size saved on close)
- Windows startup launch toggle (registry)
- **Portable mode** — drop `pushvault.portable` next to the exe → config stored alongside executable
- Open in Explorer / VS Code / Terminal
- Large file auto-chunking (> 49 MB → zip parts + SHA-256)

---

## What Remains (v5.0)

| Item | Effort | Notes |
|------|--------|-------|
| Auto-update | Medium | Tauri updater plugin + Ed25519 key; needs a hosted update endpoint (GitHub Releases works) |
| MSI enterprise / silent install | Small | WiX config in tauri.conf.json |
| Crash reporting | Medium | `sentry-rust` or `minidump-writer` crate |
| GitLab support | Large | New API module, same pattern as GitHub |
| AI commit messages | Small | HTTP call to local `ollama` or Claude API |
| macOS / Linux builds | Medium | Code is mostly cross-platform; needs platform-specific paths + tray behaviour |
| Plugin system (WASM) | Large | Architecture change |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  React 18 + TypeScript (WebView2 frontend)          │
│  Zustand stores · Vite · react-virtuoso             │
├─────────────────────────────────────────────────────┤
│         Tauri 2.0 IPC Bridge                        │
│  80+ typed commands · Tauri events (progress/watch) │
├─────────────────────────────────────────────────────┤
│     Rust Backend  (src-tauri/src/)                  │
│  libgit2 (git2) · tokio · spawn_blocking            │
│  window-vibrancy · keyring · notify · reqwest       │
└─────────────────────────────────────────────────────┘
```

## Build

**Prerequisites:** Rust 1.70+ · Node.js 18+ · Git · Windows 10/11

```bash
npm install
npm run tauri dev      # development (hot reload)
npm run tauri build    # production — MSI + NSIS installers in src-tauri/target/release/bundle/
```

## Config

- **Standard mode:** `%AppData%\pushvault\config.json`
- **Portable mode:** drop `pushvault.portable` next to the exe → `config.json` lives alongside it
- GitHub token is mirrored to the **Windows Credential Manager** on every save
- Legacy Python v3 `config.json` auto-migrated on first launch

## Project Structure

```
src/
├── App.tsx                    # Root, keyboard bindings, overlay routing
├── components/                # 35+ UI modules
│   ├── Dashboard/             # Card grid + list view
│   ├── Staging/               # 4-section file manager + diff
│   ├── History/               # Virtual-scroll commit log
│   ├── BranchManager/         # Full branch lifecycle
│   ├── RebasePanel/           # Drag-to-reorder interactive rebase
│   ├── BisectPanel/           # Binary search debug workflow
│   ├── LfsManager/            # Git LFS track/untrack
│   ├── WorktreeManager/       # Linked worktrees
│   ├── SubmoduleManager/      # Submodule lifecycle
│   ├── GitHub/                # Actions / PRs / Issues / Releases
│   ├── CommandPalette/        # Ctrl+P quick actions
│   ├── ConfirmModal/          # Destructive-op gating
│   └── Settings/              # 5-section settings panel
├── store/                     # Zustand (repo, ui, toast, activity, github, confirm)
├── lib/ipc.ts                 # 80+ typed Tauri IPC wrappers
└── types/index.ts             # Shared TypeScript types

src-tauri/src/
├── git_engine.rs              # All git ops (libgit2 + subprocess, ~1500 lines)
├── chunk_engine.rs            # Large file chunking (zip + SHA-256)
├── config.rs                  # JSON config, portable mode, legacy migration
├── models.rs                  # Rust data structures
├── commands/git.rs            # ~60 Tauri git commands
├── commands/system.rs         # ~25 Tauri system commands (GitHub API, keyring, tray)
├── commands/config.rs         # Config CRUD commands
└── lib.rs                     # Tauri builder, Mica setup, tray, window events
```

---

*PushVault v4.3 — Tauri 2.0 · Rust · React/TypeScript · libgit2*
