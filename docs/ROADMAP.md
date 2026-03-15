# PushVault — Feature Roadmap

## Status Legend
- [x] Shipped
- [~] In progress
- [ ] Planned

---

## Phase 1: Core Polish (v2.1) — Industrial Quality

### UI Foundations
- [x] Spotify-dark theme system (Colors, Fonts, Spacing)
- [x] Dark titlebar on Windows 11 (DWM attribute)
- [x] Repo cards with status badges and hover states
- [x] Flicker-prevention caches (skip redundant redraws)
- [~] Toast notification system (non-blocking feedback)
- [~] Smooth card animations and micro-interactions
- [~] Enhanced progress bar with segmented animation
- [~] Search/filter bar for repos
- [ ] Drag-and-drop repo reordering
- [ ] Responsive card layout (adapt to window width)

### Settings & Configuration
- [~] In-app Settings panel (edit config without JSON)
- [ ] Per-repo settings override (batch size, max file size)
- [ ] Theme selection (dark/darker/OLED black)
- [ ] Custom commit message templates
- [ ] Export/import configuration

### Git Operations
- [x] Status checking (porcelain=v2, encoding-safe)
- [x] Fetch with timeout and error messages
- [x] Pull with conflict detection
- [x] Commit & push with batch staging
- [x] Large-file chunking (49 MB parts)
- [x] Conflict resolution (side-by-side diff)
- [x] Staging area management (stage/unstage/discard)
- [~] Custom commit message input before push
- [~] Stash management (save/pop/list/drop)
- [ ] Interactive rebase UI (squash, reorder)
- [ ] Cherry-pick from other branches
- [ ] Git blame viewer

---

## Phase 2: Power Features (v2.2) — GitHub Desktop Parity

### History & Branches
- [~] Commit history viewer (per-repo git log)
- [x] Branch explorer (backend: list_remote_branches, get_files_on_branch)
- [ ] Branch switcher UI
- [ ] Branch comparison (diff between branches)
- [ ] Tag management (create/delete tags)

### GitHub Integration
- [~] Clone from URL dialog (add repos directly)
- [ ] GitHub API integration (repo creation, visibility)
- [ ] Pull request viewer (list open PRs)
- [ ] Issue tracker integration
- [ ] GitHub Actions status display

### File Management
- [x] File-level staging/unstaging
- [x] Diff preview (staged and working tree)
- [ ] Inline file editing
- [ ] File history (per-file git log)
- [ ] .gitignore editor
- [ ] File size analytics

---

## Phase 3: Premium Experience (v2.3) — Beyond GitHub Desktop

### Advanced UI
- [ ] Animated transitions between views
- [ ] Keyboard-driven command palette (Ctrl+K)
- [ ] Split view (multiple repos side by side)
- [ ] Minimap in diff viewer
- [ ] Syntax highlighting in diff (language-aware)

### Automation
- [ ] Scheduled sync (cron-like, beyond interval check)
- [ ] Webhook receiver (sync on GitHub push)
- [ ] Pre/post sync hooks (run scripts)
- [ ] Auto-resolve strategies (always-ours, always-theirs)

### Analytics & Insights
- [ ] Repository statistics dashboard (size, file count, commit frequency)
- [ ] Storage usage visualization
- [ ] Activity timeline (when did you last sync each repo)
- [ ] Bandwidth estimation for push operations

### Collaboration
- [ ] Multi-user conflict awareness
- [ ] Shared configuration profiles
- [ ] Team activity feed

---

## Architecture Decisions

### Why customtkinter over Electron/Tauri?
- **Startup time**: < 1s vs 3-5s for Electron
- **Memory**: ~50 MB vs 200+ MB for Electron
- **Distribution**: single folder, no installer needed
- **Python ecosystem**: direct git subprocess, no IPC overhead

### Why subprocess git over GitPython/pygit2?
- **No native dependencies**: works with any git installation
- **Encoding control**: explicit UTF-8/cp1252 fallback
- **Process isolation**: hung git processes can be killed cleanly
- **Feature parity**: all git features available via CLI

### Why batch staging?
- GitHub rejects pushes > 2 GB pack size
- Staging 50 files at a time keeps pack sizes manageable
- Enables progress reporting per batch

---

## Implementation Notes

### File Structure (current)
```
pushvault/
    __init__.py         # Package version
    models.py           # Data classes
    config.py           # JSON config I/O
    git_engine.py       # All git operations
    chunk_engine.py     # Large-file preprocessing
    theme.py            # Design system
    tray.py             # System tray
    ui_main.py          # Main window
    ui_card.py          # Repo cards
    ui_staging.py       # Staging panel
    ui_conflicts.py     # Conflict resolution
    ui_settings.py      # Settings panel (NEW)
    ui_history.py       # Commit history (NEW)
    ui_toast.py         # Toast notifications (NEW)
    ui_clone.py         # Clone from URL (NEW)
    ui_stash.py         # Stash manager (NEW)
```

### New files added in v2.1
- `ui_settings.py` — In-app settings editor
- `ui_history.py` — Commit history viewer
- `ui_toast.py` — Toast notification system
- `ui_clone.py` — Clone from URL dialog
- `ui_stash.py` — Stash management panel
- `docs/VISION.md` — Product vision document
- `docs/ROADMAP.md` — This file
