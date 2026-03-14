# PushVault

**Windows utility widget — automatic multi-repo backup to GitHub**

---

> One badly phrased prompt can erase weeks of work.
> While editing a file with an AI coding agent, I lost an entire project tree — PNG and JPEG assets, gone, unrecoverable.
> If you work with AI agents on heavy projects (3D assets, EXR textures, Houdini / UE5 pipelines), this tool is for you.

---

## What it does

A minimal Windows widget that monitors multiple local folders and syncs them to GitHub — fetch, pull, push — all from a single interface.

- **Multi-repo** — watch several folders simultaneously, unlike GitHub Desktop
- **One-click sync** — push everything at once with Sync All
- **Daily archive branches** — each day creates a new `archive/YYYY-MM-DD` branch automatically, giving you granular history
- **Built for heavy assets** — 80 MB per-file limit, enough for EXR and large textures while staying under GitHub's rejection threshold
- **Batch push** — large folders are split into 50-file commits to avoid timeouts and pack-size errors
- **Conflict resolution** — GitHub Desktop-grade merge conflict UI with side-by-side diff viewer
- **Encoding-safe** — handles accented filenames and non-ASCII paths correctly on French/European Windows
- **System tray** — lives in the taskbar, launches at startup, stays out of the way

---

## Architecture

```
pushvault/
    __init__.py         # Package version
    models.py           # Data classes (RepoConfig, RepoStatus, ConflictFile, etc.)
    config.py           # JSON config loader/validator
    git_engine.py       # All git operations (status, fetch, pull, push, conflicts)
    theme.py            # Design system (colors, fonts, spacing)
    tray.py             # System tray integration (pystray)
    ui_main.py          # Main window — repo dashboard
    ui_card.py          # Repo card widget with status badges
    ui_conflicts.py     # Conflict resolution dialog + side-by-side diff viewer
app.py                  # Entry point
config.json             # Repo configuration
launch.bat              # Silent launcher
```

---

## Setup — under 10 minutes

### Prerequisites

- Python 3.10+
- Git installed and on PATH
- A GitHub account with repos already created for each folder you want to sync

### Install dependencies

```bash
pip install customtkinter pillow pystray
```

### Configure

Edit `config.json` to point to your folders:

```json
{
  "repos": [
    {
      "name": "MyProject",
      "path": "C:\\Users\\you\\Projects\\MyProject",
      "remote": "https://github.com/you/my-project.git",
      "icon": "brain",
      "color": "#A78BFA"
    }
  ],
  "auto_check_interval_minutes": 5,
  "max_file_size_mb": 80,
  "batch_size": 50,
  "window": {
    "width": 400,
    "height": 860
  }
}
```

Each folder must already be initialized as a git repo with a remote set:

```bash
cd C:\Users\you\Projects\MyProject
git init
git remote add origin https://github.com/you/my-project.git
```

### Run

```bash
python app.py
```

Or double-click `launch.bat` to run silently in the background.

### Auto-start with Windows

Drop a shortcut to `launch.bat` in:

```
C:\Users\<you>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+S` | Sync All repos |
| `Ctrl+R` | Refresh all statuses |
| `Ctrl+L` | Toggle activity log |
| `Escape` | Minimize to tray |

---

## Conflict Resolution

When a pull creates merge conflicts, the **Resolve** button appears on the affected repo card. Clicking it opens a full conflict resolution dialog inspired by GitHub Desktop:

- **File list** on the left shows all conflicted files with type badges
- **Side-by-side diff viewer** on the right shows ours vs theirs with color-coded highlights
- **Per-file resolution**: Use Ours / Use Theirs / Open in Editor / Mark Resolved
- **Undo** any resolution before committing
- **Commit Resolution** when all conflicts are resolved
- **Abort Merge** to cancel the entire merge

---

## Config reference

| Key | Default | Description |
|-----|---------|-------------|
| `name` | — | Display name in the widget |
| `path` | — | Absolute path to the local folder |
| `remote` | — | GitHub remote URL (HTTPS or SSH) |
| `icon` | `"folder"` | Badge icon: `brain`, `camera`, `download`, `portfolio`, `code`, `art`, `music`, `video`, `game`, `book`, `star` |
| `color` | `"#7C5CBF"` | Accent color for the card |
| `auto_check_interval_minutes` | `5` | How often to auto-refresh status |
| `max_file_size_mb` | `80` | Files larger than this are skipped |
| `batch_size` | `50` | Files per commit during batch push |

---

## How push works

1. Detects all untracked and modified files under the size limit
2. Splits them into batches of 50 files
3. Commits and pushes each batch to `archive/YYYY-MM-DD` on the remote
4. If the daily branch already exists, force-pushes the new batch on top

Your `main` branch stays clean. Archive branches hold daily snapshots.

---

## Known limitations

- Windows only (uses `explorer.exe` for folder opening, tray relies on `pystray`)
- Requires git to be configured with credentials (HTTPS token or SSH key) before first push
- Files above 80 MB are silently skipped — GitHub rejects individual files above 100 MB

---

## AI-assisted setup

Open this folder in **Claude Code**, **Cursor**, or **Windsurf** and ask the agent to configure it:

```
Set up PushVault for my environment. I want to track these folders: [list them].
Create the git repos on GitHub and configure config.json.
```

---

## License

MIT — do whatever you want with it.

---

*Built after losing a full UE5 project to an AI agent mishap. Back up your assets.*
