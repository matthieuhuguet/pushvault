# PushVault — Product Vision

## Initial Prompt (2026-03-14)

> Take PushVault2 to the next level. It's a multi-repo tool accessible via a premium UI for
> users to push/pull files with intelligent versioning. Develop maximum smart features for
> commercialization. Stop the rough prototype feel. Reach real industrial quality — think
> Spotify-level UI. Finalize all existing features, add animations, make the interface
> seductive and impactful. Add 20-50 missing features inspired by GitHub Desktop, GitLab, etc.
> Features like: direct folder retrieval without going through GitHub, integrated GitHub
> interface, working stash and fetch, in-app settings editor with local save, smoother push
> with better progress bars. Create comprehensive documentation for resilience across AI tools.

## Product Identity

**PushVault** is a Windows desktop utility for automated multi-repository backup to GitHub.
Built for creatives and engineers working with heavy assets (3D, EXR, UE5, Houdini pipelines)
who need reliable, one-click multi-repo sync without the complexity of full Git GUIs.

### Core Value Proposition

1. **Multi-repo in one view** — unlike GitHub Desktop (one repo at a time)
2. **One-click sync** — fetch + pull + stage + commit + push, automated
3. **Heavy-asset aware** — large-file chunking, batch staging, point-cloud skipping
4. **Zero-config git** — handles identity, branch detection, lock cleanup automatically
5. **Always-on** — system tray resident, auto-check intervals

## Design Philosophy

- **Spotify-dark aesthetic**: #121212 primary, card hierarchy, pill buttons, subtle borders
- **Information density over chrome**: show status at a glance, hide complexity
- **Non-blocking operations**: all git operations in ThreadPoolExecutor, UI always responsive
- **Fail-safe**: never hang on credential prompts, never corrupt live locks, graceful degradation

## Target Users

1. **Solo creators** with multiple asset repos (3D artists, game devs, photographers)
2. **Small teams** needing simple multi-repo backup without CI/CD complexity
3. **AI-assisted developers** who need to protect work from accidental AI agent deletions

## Technology Stack

- **Python 3.10+** with **customtkinter** (modern dark-themed tkinter wrapper)
- **Git subprocess** with robust error handling and encoding safety
- **pystray** for Windows system tray integration
- **Pillow** for image/icon handling

## What Success Looks Like

- Launch the app → all repos visible with live status in < 2 seconds
- One click → everything synced, progress visible, no errors swallowed
- Conflicts → GitHub Desktop-grade resolution UI
- Settings → editable in-app, saved locally, no JSON editing required
- History → see commits, browse branches, pull individual files
- Feel → smooth animations, responsive hover states, toast feedback
