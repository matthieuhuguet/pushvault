"""Git operations engine — robust, encoding-safe, batch-aware.

Critical design rules:
- CREATE_NO_WINDOW on all subprocesses (no credential dialogs that hang)
- GIT_ASKPASS=echo (fail fast on missing creds, never block)
- commit_push() uses standard git add/commit/push to main
- All operations have explicit timeouts
"""

from __future__ import annotations

import os
import subprocess
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from .models import (
    ConflictFile,
    ConflictHunk,
    ConflictType,
    RepoConfig,
    RepoStatus,
    Resolution,
    SyncState,
)

LogFn = Callable[[str, str], None]  # (level, message) -> None

# Windows flag: never spawn a visible console window
_CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


@dataclass
class FileEntry:
    """A single file in the staging area."""
    path: str
    index_status: str = " "   # X in XY
    worktree_status: str = " " # Y in XY
    staged: bool = False
    modified: bool = False
    untracked: bool = False
    conflicted: bool = False

    @property
    def display_status(self) -> str:
        s = self.index_status + self.worktree_status
        m = {
            "M ": "Staged: modified", "A ": "Staged: added", "D ": "Staged: deleted",
            "R ": "Staged: renamed", "C ": "Staged: copied",
            " M": "Modified", " D": "Deleted", " A": "Added",
            "MM": "Staged + modified", "AM": "Added + modified",
            "??": "Untracked",
            "UU": "Both modified", "AA": "Both added", "DD": "Both deleted",
            "AU": "Added by us", "UA": "Added by them",
            "DU": "Deleted by us", "UD": "Deleted by them",
        }
        return m.get(s, s.strip() or "Changed")


@dataclass
class DetailedStatus:
    staged: list[FileEntry] = field(default_factory=list)
    unstaged: list[FileEntry] = field(default_factory=list)
    untracked: list[FileEntry] = field(default_factory=list)
    conflicted: list[FileEntry] = field(default_factory=list)

    @property
    def has_changes(self) -> bool:
        return bool(self.staged or self.unstaged or self.untracked or self.conflicted)


# ── Subprocess core ──────────────────────────────────────────────

def _run(
    args: list[str],
    cwd: str,
    timeout: int = 60,
    check: bool = False,
    extra_env: Optional[dict] = None,
) -> subprocess.CompletedProcess[str]:
    """
    Run a git command safely on Windows.
    - CREATE_NO_WINDOW: prevents credential GUI dialogs from blocking
    - GIT_TERMINAL_PROMPT=0: disables interactive prompts
    - GIT_ASKPASS=echo: returns empty string for credentials (fail fast)
    - Uses Popen.communicate(timeout=) for proper timeout handling
    """
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_ASKPASS"] = "echo"
    env["SSH_ASKPASS"] = "echo"
    env["SSH_ASKPASS_REQUIRE"] = "force"
    env["GIT_SSH_COMMAND"] = (
        "ssh -o BatchMode=yes -o ConnectTimeout=15 "
        "-o StrictHostKeyChecking=accept-new"
    )
    env["LC_ALL"] = "C.UTF-8"
    if extra_env:
        env.update(extra_env)

    def decode(b: bytes) -> str:
        try:
            return b.decode("utf-8")
        except UnicodeDecodeError:
            return b.decode("cp1252", errors="replace")

    try:
        proc = subprocess.Popen(
            args,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=_CREATE_NO_WINDOW,
        )
        try:
            stdout_b, stderr_b = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise RuntimeError(
                f"Timeout ({timeout}s): {' '.join(str(a) for a in args[:4])}"
            )

        result = subprocess.CompletedProcess(
            args, proc.returncode, decode(stdout_b), decode(stderr_b)
        )
        if check and result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode, args, result.stdout, result.stderr
            )
        return result

    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Git failed: {e}")


def _remove_stale_lock(repo_path: str) -> None:
    """Remove index.lock only if it is stale (>30 s old).

    GitHub Desktop and other git clients hold a live lock during operations.
    Deleting a live lock corrupts their transaction; we only remove truly stale
    ones left by a crashed process.
    """
    import time
    lock = Path(repo_path) / ".git" / "index.lock"
    if lock.exists():
        try:
            age = time.time() - lock.stat().st_mtime
            if age > 30:
                lock.unlink()
        except OSError:
            pass


def _ensure_identity(repo_path: str) -> None:
    r = _run(["git", "config", "user.name"], cwd=repo_path)
    if not r.stdout.strip():
        _run(["git", "config", "user.name", "PushVault"], cwd=repo_path)
        _run(["git", "config", "user.email", "pushvault@local"], cwd=repo_path)


def _default_branch(repo_path: str) -> str:
    r = _run(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], cwd=repo_path)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip().split("/")[-1]
    for name in ("main", "master"):
        r = _run(["git", "rev-parse", "--verify", f"origin/{name}"], cwd=repo_path)
        if r.returncode == 0:
            return name
    # Try local branches
    r = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo_path)
    if r.returncode == 0 and r.stdout.strip() not in ("HEAD", ""):
        return r.stdout.strip()
    return "main"


def is_git_repo(path: str) -> bool:
    r = _run(["git", "rev-parse", "--git-dir"], cwd=path, timeout=10)
    return r.returncode == 0


# ── Status ───────────────────────────────────────────────────────

def get_status(repo: RepoConfig, log: Optional[LogFn] = None) -> RepoStatus:
    """Get comprehensive repository status."""
    path = repo.path

    if not Path(path).exists():
        return RepoStatus(
            state=SyncState.ERROR,
            label="Path not found",
            error=f"Directory does not exist: {path}",
        )

    if not is_git_repo(path):
        return RepoStatus(state=SyncState.NOT_INIT, label="Not a git repo")

    _remove_stale_lock(path)

    r = _run(["git", "status", "--porcelain=v2", "-z", "--branch"], cwd=path, timeout=30)
    if r.returncode != 0:
        return RepoStatus(state=SyncState.ERROR, label="Status failed", error=r.stderr)

    status = RepoStatus()
    branch = ""
    ahead = 0
    behind = 0
    untracked = 0
    modified = 0
    staged = 0
    deleted = 0
    conflicts = 0

    entries = r.stdout.split("\0")
    i = 0
    while i < len(entries):
        line = entries[i]
        if not line:
            i += 1
            continue

        if line.startswith("# branch.head"):
            branch = line.split(" ", 2)[-1]
        elif line.startswith("# branch.ab"):
            parts = line.split(" ")
            for p in parts:
                if p.startswith("+"):
                    try:
                        ahead = int(p[1:])
                    except ValueError:
                        pass
                elif p.startswith("-"):
                    try:
                        behind = abs(int(p[1:]))
                    except ValueError:
                        pass
        elif line.startswith("1 ") or line.startswith("2 "):
            xy = line.split(" ")[1] if len(line.split(" ")) > 1 else ""
            x = xy[0] if len(xy) > 0 else " "
            y = xy[1] if len(xy) > 1 else " "
            if x == "U" or y == "U" or xy in ("AA", "DD"):
                conflicts += 1
            else:
                if x in ("M", "A", "R", "C"):
                    staged += 1
                if y == "M":
                    modified += 1
                if x == "D" or y == "D":
                    deleted += 1
            if line.startswith("2 "):
                i += 1
        elif line.startswith("? "):
            untracked += 1
        elif line.startswith("u "):
            conflicts += 1

        i += 1

    status.branch = branch
    status.ahead = ahead
    status.behind = behind
    status.untracked = untracked
    status.modified = modified
    status.staged = staged
    status.deleted = deleted
    status.conflicts = conflicts

    if conflicts > 0:
        status.state = SyncState.CONFLICT
        status.label = f"{conflicts} conflict{'s' if conflicts != 1 else ''}"
    elif ahead > 0 and behind > 0:
        status.state = SyncState.DIVERGED
        status.label = f"{ahead} ahead, {behind} behind"
    elif ahead > 0 or untracked > 0 or modified > 0 or staged > 0 or deleted > 0:
        parts = []
        if staged:
            parts.append(f"{staged} added")       # git-added (in git index)
        if modified:
            parts.append(f"{modified} modified")
        if untracked:
            parts.append(f"{untracked} new")      # new files not yet tracked
        if deleted:
            parts.append(f"{deleted} deleted")
        if ahead:
            parts.append(f"{ahead} local commits")
        status.state = SyncState.NEEDS_PUSH
        status.label = " · ".join(parts) if parts else f"{ahead} local commits"
    elif behind > 0:
        status.state = SyncState.NEEDS_PULL
        status.label = f"{behind} commit{'s' if behind != 1 else ''} behind"
    else:
        status.state = SyncState.SYNCED
        status.label = "Up to date"

    return status


def get_detailed_status(repo_path: str) -> DetailedStatus:
    """Return categorized lists of staged / unstaged / untracked / conflicted files."""
    _remove_stale_lock(repo_path)
    r = _run(["git", "status", "--porcelain=v1", "-z"], cwd=repo_path, timeout=30)

    result = DetailedStatus()
    if r.returncode != 0:
        return result

    entries = r.stdout.split("\0")
    for raw in entries:
        if not raw or len(raw) < 3:
            continue
        x = raw[0]
        y = raw[1]
        path = raw[3:]
        # Handle renames: "R old\0new" — skip old path
        if " -> " in path:
            path = path.split(" -> ")[-1]
        path = path.strip('"')

        fe = FileEntry(path=path, index_status=x, worktree_status=y)

        # Conflict states
        if x in ("U", "A", "D") and y in ("U", "A", "D") and (x == "U" or y == "U" or (x == y)):
            if x == "U" or y == "U" or (x == "A" and y == "A") or (x == "D" and y == "D"):
                fe.conflicted = True
                result.conflicted.append(fe)
                continue

        if x == "?" and y == "?":
            fe.untracked = True
            result.untracked.append(fe)
        else:
            if x not in (" ", "?"):
                fe.staged = True
                result.staged.append(fe)
            if y in ("M", "D", "A"):
                fe.modified = True
                result.unstaged.append(fe)

    return result


# ── Remote operations ────────────────────────────────────────────

def fetch(repo: RepoConfig, log: Optional[LogFn] = None) -> tuple[bool, str]:
    if not is_git_repo(repo.path):
        msg = "Not a git repository — initialize first (git init + add remote)"
        if log:
            log("error", msg)
        return False, msg

    if log:
        log("info", f"Fetching {repo.name}…")

    r = _run(["git", "fetch", "--all", "--prune"], cwd=repo.path, timeout=120)
    if r.returncode != 0:
        msg = r.stderr.strip() or "Fetch failed (check credentials)"
        if log:
            log("error", f"Fetch failed: {msg}")
        return False, msg

    if log:
        log("success", f"Fetched {repo.name}")
    return True, "OK"


def pull(repo: RepoConfig, log: Optional[LogFn] = None) -> tuple[bool, str]:
    if log:
        log("info", f"Pulling {repo.name}…")

    _remove_stale_lock(repo.path)
    branch = _default_branch(repo.path)
    r = _run(
        ["git", "pull", "origin", branch, "--no-rebase"],
        cwd=repo.path,
        timeout=300,
    )

    if r.returncode != 0:
        stderr = r.stderr.strip()
        if "CONFLICT" in stderr or "Automatic merge failed" in stderr:
            if log:
                log("warning", f"Pull created conflicts in {repo.name}")
            return False, "CONFLICT"
        if log:
            log("error", f"Pull failed: {stderr}")
        return False, stderr

    if log:
        log("success", f"Pulled {repo.name}")
    return True, "OK"


# ── Large-file chunking ──────────────────────────────────────────

# Extensions always skipped
_SKIP_EXTENSIONS: frozenset[str] = frozenset({
    # 3-D point-cloud formats
    ".pts", ".las", ".laz", ".pcd", ".e57", ".ptx", ".xyb", ".xyz",
    # Windows NUL device / null placeholder files
    ".nul",
})

# Top-level directory names whose entire subtree is always skipped
_SKIP_TOP_DIRS: frozenset[str] = frozenset({
    ".claude",   # Claude Code config, memory, worktrees
})

_CHUNK_PART_MB = 49         # Each zip chunk stays ≤ this size
_SKIP_ABOVE_MB = 10 * 1024  # 10 GB — never attempt to chunk


def _linked_worktree_prefixes(repo_path: str) -> set[str]:
    """Return relative path prefixes (POSIX, no trailing slash) of linked worktrees.

    Linked worktrees live inside the repo directory are excluded from pushes
    because they are separate working trees managed by git, not project files.
    """
    r = _run(["git", "worktree", "list", "--porcelain"], cwd=repo_path, timeout=15)
    if r.returncode != 0:
        return set()
    repo_abs = str(Path(repo_path).resolve())
    prefixes: set[str] = set()
    first = True
    for line in r.stdout.splitlines():
        if line.startswith("worktree "):
            wt_path = line[len("worktree "):].strip()
            if first:
                first = False
                continue  # Skip main worktree — it IS the repo root
            wt_abs = str(Path(wt_path).resolve())
            if wt_abs.startswith(repo_abs + os.sep):
                rel = os.path.relpath(wt_abs, repo_abs).replace("\\", "/")
                prefixes.add(rel)
    return prefixes


def _ensure_file_chunks(
    file_path: Path,
    repo_path: Path,
    chunk_mb: int = _CHUNK_PART_MB,
    log: Optional[LogFn] = None,
) -> tuple[list[str], list[str]]:
    """Create (or update) zip chunks for a large file.

    Chunks are stored in ``<repo>/.pv_chunks/`` using names derived from the
    file's relative path, e.g.::

        .pv_chunks/assets_texture.exr.part001.zip

    Returns ``(new_chunk_rel_paths, old_chunk_rel_paths_removed)``.
    Returns ``([], [])`` when existing chunks are already up-to-date (no work
    needed — the file has not changed since the last chunk run).
    """
    chunks_dir = repo_path / ".pv_chunks"
    chunks_dir.mkdir(exist_ok=True)

    # Build a filesystem-safe stem from the relative path
    rel_path = file_path.relative_to(repo_path)
    safe_stem = str(rel_path).replace(os.sep, "_").replace("/", "_").replace(":", "_")

    chunk_size = chunk_mb * 1_048_576
    file_mtime = file_path.stat().st_mtime

    # Check whether existing chunks are still current
    existing = sorted(chunks_dir.glob(f"{safe_stem}.part*.zip"))
    if existing:
        newest_chunk_mtime = max(c.stat().st_mtime for c in existing)
        if file_mtime <= newest_chunk_mtime:
            return [], []  # Already up-to-date — nothing to do

    # Remove stale chunks from disk and record their repo-relative paths
    old_rel_paths = [str(c.relative_to(repo_path)) for c in existing]
    for c in existing:
        try:
            c.unlink()
        except OSError:
            pass

    # Split file into fixed-size chunks, each wrapped in a zip archive
    file_size = file_path.stat().st_size
    n_parts = max(1, (file_size + chunk_size - 1) // chunk_size)

    if log:
        log("info", f"Chunking {rel_path} ({file_size // 1_048_576} MB) → {n_parts} part(s)…")

    new_rel_paths: list[str] = []
    with open(file_path, "rb") as fh:
        for i in range(n_parts):
            data = fh.read(chunk_size)
            part_name = f"{safe_stem}.part{i + 1:03d}"
            chunk_zip = chunks_dir / f"{part_name}.zip"
            with zipfile.ZipFile(chunk_zip, "w", zipfile.ZIP_STORED) as zf:
                zf.writestr(part_name, data)
            new_rel_paths.append(str(chunk_zip.relative_to(repo_path)))

    if log:
        log("info", f"  → {n_parts} chunk(s) written to .pv_chunks/")

    return new_rel_paths, old_rel_paths


# ── Push — safe temp-index approach ─────────────────────────────

def _collect_eligible_files(
    path: str, max_bytes: int, log: Optional[LogFn] = None
) -> tuple[list[str], int, list[str]]:
    """Return (eligible_paths, skipped_count, stale_chunk_paths_to_remove).

    Rules applied to each file:
    - Empty (0-byte) files are silently skipped.
    - Point-cloud file types (.pts, .las, .laz, .pcd, …) are silently skipped.
    - Files ≤ max_bytes are eligible as-is.
    - Files between max_bytes and 15 GB are split into zip chunks stored in
      ``.pv_chunks/``; the chunk paths are added to ``eligible``.
    - Files > 15 GB are always skipped.
    """
    r = _run(["git", "status", "--porcelain=v1", "-z", "-uall"], cwd=path, timeout=300)
    if r.returncode != 0:
        return [], 0, []

    eligible: list[str] = []
    skipped = 0
    chunks_to_remove: list[str] = []
    skip_above_bytes = _SKIP_ABOVE_MB * 1_048_576

    # Build worktree prefix set once (cheap git call)
    worktree_prefixes = _linked_worktree_prefixes(path)

    for raw in r.stdout.split("\0"):
        if not raw or len(raw) < 3:
            continue
        xy = raw[:2]
        x, y = xy[0], xy[1]

        # Skip unmerged (conflict) files
        if x == "U" or y == "U" or xy in ("AA", "DD"):
            continue

        filepath = raw[3:].strip().strip('"')
        if " -> " in filepath:
            filepath = filepath.split(" -> ")[-1]

        # ── Skip .claude/ and other blacklisted top-level dirs ──
        top = filepath.split("/")[0].split("\\")[0]
        if top in _SKIP_TOP_DIRS:
            continue

        # ── Skip files inside linked worktrees ──────────────────
        fp_posix = filepath.replace("\\", "/")
        if any(fp_posix == wt or fp_posix.startswith(wt + "/") for wt in worktree_prefixes):
            continue

        full = Path(path) / filepath
        if not full.exists():
            eligible.append(filepath)  # Deleted file — track removal
            continue

        if not full.is_file():
            continue

        try:
            size = full.stat().st_size
        except OSError:
            eligible.append(filepath)
            continue

        # ── Skip empty files ────────────────────────────────────
        if size == 0:
            if log:
                log("warning", f"Skipped (empty): {filepath}")
            continue

        # ── Skip blacklisted extensions ─────────────────────────
        if full.suffix.lower() in _SKIP_EXTENSIONS:
            if log:
                log("warning", f"Skipped ({full.suffix}): {filepath}")
            continue

        # ── Normal push (under size limit) ──────────────────────
        if size <= max_bytes:
            eligible.append(filepath)
            continue

        # ── Too large to ever handle ─────────────────────────────
        if size > skip_above_bytes:
            skipped += 1
            if log:
                log("warning", f"Skipped (>15 GB): {filepath}")
            continue

        # ── Split into zip chunks (max_bytes < size ≤ 15 GB) ────
        new_chunks, old_chunks = _ensure_file_chunks(full, Path(path), _CHUNK_PART_MB, log)
        eligible.extend(new_chunks)
        chunks_to_remove.extend(old_chunks)
        if not new_chunks and log:
            log("info", f"Already chunked (unchanged): {filepath}")

    return eligible, skipped, chunks_to_remove


def commit_push(
    repo: RepoConfig,
    max_file_size_mb: int = 49,
    batch_size: int = 50,
    log: Optional[LogFn] = None,
    progress: Optional[Callable[[int, int, str], None]] = None,
) -> tuple[bool, str]:
    """
    Single-branch push to the default branch (main/master).

    Flow:
      1. Ensure checked-out on default branch
      2. Fetch remote
      3. Pull if behind (fail fast on conflict)
      4. Stage eligible files in batches
      5. Commit
      6. Push to origin/<default>

    Files above max_file_size_mb are split into 49 MB zip chunks in .pv_chunks/
    (max ~200 parts per file for a 10 GB limit).
    """
    path = repo.path

    if not is_git_repo(path):
        msg = "Not a git repository — run 'git init' then add a remote"
        if log:
            log("error", msg)
        return False, msg

    _remove_stale_lock(path)
    _ensure_identity(path)

    default = _default_branch(path)

    # ── 1. Ensure on default branch ───────────────────────────────
    cur_branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=path, timeout=10).stdout.strip()
    if cur_branch != default:
        r = _run(["git", "checkout", default], cwd=path, timeout=30)
        if r.returncode != 0:
            r = _run(["git", "checkout", "-b", default, f"origin/{default}"], cwd=path, timeout=30)
        if r.returncode != 0:
            err = r.stderr.strip()
            if log:
                log("error", f"Cannot switch to {default}: {err}")
            return False, f"Cannot switch to {default}: {err}"

    # ── 2. Fetch ──────────────────────────────────────────────────
    _run(["git", "fetch", "origin", "--prune"], cwd=path, timeout=120)

    # ── 3. Pull if behind ─────────────────────────────────────────
    status_r = _run(["git", "status", "--porcelain=v2", "-z", "--branch"], cwd=path, timeout=30)
    behind = 0
    for seg in status_r.stdout.split("\0"):
        if seg.startswith("# branch.ab"):
            for p in seg.split():
                if p.startswith("-"):
                    try:
                        behind = abs(int(p[1:]))
                    except ValueError:
                        pass

    if behind > 0:
        if log:
            log("info", f"Pulling {behind} commit(s) from origin/{default}…")
        pull_r = _run(["git", "pull", "origin", default, "--no-rebase"], cwd=path, timeout=300)
        if pull_r.returncode != 0:
            stderr = pull_r.stderr.strip()
            if "CONFLICT" in stderr or "Automatic merge failed" in stderr:
                if log:
                    log("warning", "Pull created conflicts — resolve before pushing")
                return False, "CONFLICT"
            if log:
                log("warning", f"Pull warning: {stderr[:120]}")

    # ── 4. Reset index ────────────────────────────────────────────
    _run(["git", "reset", "HEAD"], cwd=path, timeout=60)

    # ── 5. Collect eligible files ─────────────────────────────────
    max_bytes = max_file_size_mb * 1_048_576
    eligible, skipped, chunks_to_remove = _collect_eligible_files(path, max_bytes, log)

    for stale in chunks_to_remove:
        _run(["git", "rm", "--cached", "--ignore-unmatch", "--", stale], cwd=path, timeout=30)

    if not eligible:
        msg = "Nothing to push" if not skipped else f"All {skipped} files exceed {max_file_size_mb} MB"
        if log:
            log("info", f"{repo.name}: {msg}")
        _run(["git", "push", "-u", "origin", default], cwd=path, timeout=300)
        return True, msg

    total = len(eligible)
    if log:
        log("info", f"{repo.name}: staging {total} file(s)…")

    # ── 6. Stage in batches ───────────────────────────────────────
    total_batches = (total + batch_size - 1) // batch_size
    for i in range(total_batches):
        start = i * batch_size
        batch = eligible[start : start + batch_size]
        if progress:
            progress(start + len(batch), total, f"Staging {i + 1}/{total_batches}")

        to_add    = [f for f in batch if (Path(path) / f).exists()]
        to_remove = [f for f in batch if not (Path(path) / f).exists()]

        if to_add:
            r = _run(["git", "add", "--"] + to_add, cwd=path, timeout=120)
            if r.returncode != 0 and log:
                log("warning", f"Some files not staged: {r.stderr[:200]}")

        for f in to_remove:
            _run(["git", "rm", "--cached", "--ignore-unmatch", "--", f], cwd=path, timeout=30)

    # ── 7. Commit ─────────────────────────────────────────────────
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    commit_msg = f"[PushVault] {now_str} — {total} file(s)"
    if skipped:
        commit_msg += f" ({skipped} oversized skipped)"

    if progress:
        progress(total, total, "Committing…")

    r = _run(["git", "commit", "-m", commit_msg], cwd=path, timeout=60)
    if r.returncode != 0:
        stderr = r.stderr.strip() or r.stdout.strip()
        if "nothing to commit" not in stderr and "nothing added" not in stderr:
            if log:
                log("error", f"Commit failed: {stderr}")
            return False, stderr
        if log:
            log("info", "Nothing new to commit — pushing existing commits")

    # ── 8. Push ───────────────────────────────────────────────────
    if log:
        log("info", f"Pushing to {default}…")
    if progress:
        progress(total, total, "Pushing to remote…")

    r = _run(["git", "push", "-u", "origin", default], cwd=path, timeout=600)
    if r.returncode != 0:
        msg = r.stderr.strip() or "Push failed"
        if "could not read Username" in msg or "Authentication failed" in msg:
            msg = "Auth failed — check git credentials"
        elif "repository not found" in msg or "does not exist" in msg:
            msg = "Remote repository not found — check config.json"
        elif "Permission denied" in msg:
            msg = "Permission denied — check SSH key or HTTPS token"
        elif "rejected" in msg and "fetch first" in msg:
            msg = "Remote has new commits — run Fetch All first"
        if log:
            log("error", f"Push failed: {msg}")
        return False, msg

    result_msg = f"Pushed {total} file(s) → {default}"
    if log:
        log("success", result_msg)
    return True, result_msg


# ── Staging area operations ──────────────────────────────────────

def stage_file(repo_path: str, filepath: str, log: Optional[LogFn] = None) -> tuple[bool, str]:
    """Stage a file."""
    r = _run(["git", "add", "--", filepath], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()
    if log:
        log("info", f"Staged: {filepath}")
    return True, "OK"


def unstage_file(repo_path: str, filepath: str, log: Optional[LogFn] = None) -> tuple[bool, str]:
    """Unstage a file (remove from index, keep working tree)."""
    # Try modern syntax first
    r = _run(["git", "restore", "--staged", "--", filepath], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        # Fallback for older git
        r = _run(["git", "reset", "HEAD", "--", filepath], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()
    if log:
        log("info", f"Unstaged: {filepath}")
    return True, "OK"


def discard_file(repo_path: str, filepath: str, log: Optional[LogFn] = None) -> tuple[bool, str]:
    """Discard working tree changes (restore from HEAD). Destructive!"""
    r = _run(["git", "restore", "--", filepath], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        r = _run(["git", "checkout", "HEAD", "--", filepath], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()
    if log:
        log("warning", f"Discarded changes: {filepath}")
    return True, "OK"


def delete_untracked(repo_path: str, filepath: str, log: Optional[LogFn] = None) -> tuple[bool, str]:
    """Delete an untracked file from disk."""
    full = Path(repo_path) / filepath
    try:
        if full.is_file():
            full.unlink()
        elif full.is_dir():
            import shutil
            shutil.rmtree(str(full))
        if log:
            log("warning", f"Deleted untracked: {filepath}")
        return True, "OK"
    except OSError as e:
        return False, str(e)


def get_diff(repo_path: str, filepath: str, staged: bool = False) -> str:
    """Get the diff for a single file (staged or working tree)."""
    args = ["git", "diff"]
    if staged:
        args.append("--cached")
    args += ["--", filepath]
    r = _run(args, cwd=repo_path, timeout=30)
    return r.stdout if r.returncode == 0 else r.stderr


def stage_all(repo_path: str, log: Optional[LogFn] = None) -> tuple[bool, str]:
    """Stage all changes (equivalent to git add -A)."""
    r = _run(["git", "add", "-A"], cwd=repo_path, timeout=60)
    if r.returncode != 0:
        return False, r.stderr.strip()
    if log:
        log("info", "Staged all changes")
    return True, "OK"


def unstage_all(repo_path: str, log: Optional[LogFn] = None) -> tuple[bool, str]:
    """Unstage all staged files."""
    r = _run(["git", "reset", "HEAD"], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()
    if log:
        log("info", "Unstaged all files")
    return True, "OK"


# ── Conflict resolution ──────────────────────────────────────────

def get_conflicted_files(repo_path: str) -> list[ConflictFile]:
    r = _run(["git", "status", "--porcelain=v1", "-z"], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return []

    conflicts: list[ConflictFile] = []
    for raw in r.stdout.split("\0"):
        if not raw or len(raw) < 3:
            continue
        xy = raw[:2]
        x, y = xy[0], xy[1]
        filepath = raw[3:].strip('"')

        is_conflict = (
            x == "U" or y == "U"
            or xy == "AA"
            or xy == "DD"
        )
        if not is_conflict:
            continue

        cf = ConflictFile(path=filepath, git_status=xy)
        full_path = Path(repo_path) / filepath

        if not full_path.exists():
            cf.conflict_type = (
                ConflictType.DELETED_BY_US if x == "D" else ConflictType.DELETED_BY_THEM
            )
        else:
            try:
                content = full_path.read_text(encoding="utf-8", errors="replace")
                cf.full_content = content
                if "<<<<<<< " in content and "=======" in content and ">>>>>>> " in content:
                    cf.conflict_type = ConflictType.TEXT
                    cf.hunks = _parse_conflict_markers(content)
                    cf.marker_count = content.count("<<<<<<< ")
                else:
                    cf.conflict_type = ConflictType.BINARY
            except Exception:
                cf.conflict_type = ConflictType.BINARY

        conflicts.append(cf)

    return conflicts


def _parse_conflict_markers(content: str) -> list[ConflictHunk]:
    hunks: list[ConflictHunk] = []
    lines = content.splitlines(keepends=True)
    i = 0
    context_before: list[str] = []

    while i < len(lines):
        line = lines[i]
        if line.startswith("<<<<<<< "):
            hunk = ConflictHunk()
            hunk.context_before = context_before[-3:]
            hunk.ours_label = line.strip().replace("<<<<<<< ", "")
            context_before = []
            i += 1
            while i < len(lines) and not lines[i].startswith("======="):
                hunk.ours_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            while i < len(lines) and not lines[i].startswith(">>>>>>> "):
                hunk.theirs_lines.append(lines[i])
                i += 1
            if i < len(lines):
                hunk.theirs_label = lines[i].strip().replace(">>>>>>> ", "")
                i += 1
            ctx_after: list[str] = []
            j = i
            while j < len(lines) and not lines[j].startswith("<<<<<<< ") and len(ctx_after) < 3:
                ctx_after.append(lines[j])
                j += 1
            hunk.context_after = ctx_after
            hunks.append(hunk)
        else:
            context_before.append(line)
            i += 1

    return hunks


def resolve_file(
    repo_path: str,
    filepath: str,
    resolution: Resolution,
    log: Optional[LogFn] = None,
) -> tuple[bool, str]:
    if resolution == Resolution.OURS:
        r = _run(["git", "checkout", "--ours", "--", filepath], cwd=repo_path, timeout=30)
    elif resolution == Resolution.THEIRS:
        r = _run(["git", "checkout", "--theirs", "--", filepath], cwd=repo_path, timeout=30)
    elif resolution == Resolution.MANUAL:
        r = _run(["git", "add", "--", filepath], cwd=repo_path, timeout=30)
        if r.returncode == 0:
            return True, "Staged manually resolved file"
        return False, r.stderr.strip()
    else:
        return False, f"Unknown resolution: {resolution}"

    if r.returncode != 0:
        msg = r.stderr.strip() or "Resolution failed"
        if log:
            log("error", msg)
        return False, msg

    r = _run(["git", "add", "--", filepath], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()

    if log:
        log("success", f"Resolved {filepath} → {resolution.value}")
    return True, "OK"


def resolve_all_and_commit(
    repo_path: str,
    resolutions: dict[str, Resolution],
    log: Optional[LogFn] = None,
) -> tuple[bool, str]:
    for filepath, resolution in resolutions.items():
        ok, msg = resolve_file(repo_path, filepath, resolution, log)
        if not ok:
            return False, f"Failed to resolve {filepath}: {msg}"

    remaining = get_conflicted_files(repo_path)
    if remaining:
        return False, f"{len(remaining)} conflict(s) still unresolved"

    r = _run(
        ["git", "commit", "--no-edit", "-m", "[PushVault] Resolve merge conflicts"],
        cwd=repo_path,
        timeout=60,
    )
    if r.returncode != 0:
        stderr = r.stderr.strip()
        if "nothing to commit" in r.stdout or "nothing to commit" in stderr:
            return True, "Nothing to commit — conflicts already resolved"
        return False, stderr

    if log:
        log("success", "Merge commit created")
    return True, "Conflicts resolved and committed"


def abort_merge(repo_path: str, log: Optional[LogFn] = None) -> tuple[bool, str]:
    r = _run(["git", "merge", "--abort"], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        r = _run(["git", "rebase", "--abort"], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip() or "Abort failed"
    if log:
        log("info", "Merge aborted")
    return True, "Merge aborted"


def get_file_at_ref(repo_path: str, filepath: str, ref: str) -> str:
    """Get file content at a specific git stage (ours=2, theirs=3, base=1)."""
    stage_map = {"base": "1", "ours": "2", "theirs": "3"}
    stage = stage_map.get(ref, ref)
    # Use :N:path syntax — properly handles paths with spaces
    r = _run(["git", "show", f":{stage}:{filepath}"], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return ""
    return r.stdout


def fix_staging(repo_path: str, log: Optional[LogFn] = None) -> tuple[bool, str]:
    _remove_stale_lock(repo_path)
    r = _run(["git", "reset", "HEAD"], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()
    if log:
        log("info", "Staging area cleared")
    return True, "Staging cleared"


def force_pull(repo: RepoConfig, log: Optional[LogFn] = None) -> tuple[bool, str]:
    path = repo.path
    branch = _default_branch(path)
    _run(["git", "fetch", "origin"], cwd=path, timeout=120)
    r = _run(["git", "reset", "--hard", f"origin/{branch}"], cwd=path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()
    if log:
        log("warning", f"Force-pulled {repo.name} → origin/{branch}")
    return True, "Force-pulled"


def get_log(repo_path: str, limit: int = 20) -> list[dict]:
    """Return recent commits as list of dicts."""
    r = _run(
        ["git", "log", f"-{limit}", "--pretty=format:%h|%s|%an|%ar"],
        cwd=repo_path,
        timeout=15,
    )
    if r.returncode != 0:
        return []
    commits = []
    for line in r.stdout.strip().splitlines():
        parts = line.split("|", 3)
        if len(parts) == 4:
            commits.append({
                "hash": parts[0],
                "subject": parts[1],
                "author": parts[2],
                "when": parts[3],
            })
    return commits


def sync_all(
    repos: list[RepoConfig],
    max_file_size_mb: int = 49,
    batch_size: int = 50,
    log: Optional[LogFn] = None,
    progress: Optional[Callable[[int, int, str], None]] = None,
) -> tuple[int, int]:
    """Sync all repos via commit_push (fetch → pull → stage → commit → push)."""
    ok_count = 0
    fail_count = 0

    for i, repo in enumerate(repos):
        if progress:
            progress(i, len(repos), f"Syncing {repo.name}…")
        if log:
            log("info", f"Syncing {repo.name}…")

        success, _ = commit_push(repo, max_file_size_mb, batch_size, log, progress)
        if success:
            ok_count += 1
        else:
            fail_count += 1

    return ok_count, fail_count


# ── Branch Explorer ───────────────────────────────────────────────

def list_remote_branches(repo_path: str) -> list[str]:
    """Return all remote branches as short names (e.g. 'archive/2026-03-12').

    Runs ``git fetch --prune`` first so the list is always fresh.
    Returns [] on error.
    """
    _run(["git", "fetch", "--prune", "origin"], cwd=repo_path, timeout=120)
    r = _run(["git", "branch", "-r", "--format=%(refname:short)"], cwd=repo_path, timeout=15)
    if r.returncode != 0:
        return []
    branches: list[str] = []
    for line in r.stdout.splitlines():
        name = line.strip()
        if not name or name.endswith("/HEAD"):
            continue
        # Strip the "origin/" prefix — keep just the branch path
        if name.startswith("origin/"):
            name = name[len("origin/"):]
        branches.append(name)
    return branches


def get_files_on_branch(repo_path: str, branch: str) -> list[str]:
    """Return all file paths tracked on the given remote branch.

    Uses ``git ls-tree -r --name-only origin/<branch>`` so it never
    checks out anything.  Returns [] on error.
    """
    r = _run(
        ["git", "ls-tree", "-r", "--name-only", f"origin/{branch}"],
        cwd=repo_path,
        timeout=60,
    )
    if r.returncode != 0:
        # Branch may only exist locally — try without the origin/ prefix
        r = _run(
            ["git", "ls-tree", "-r", "--name-only", branch],
            cwd=repo_path,
            timeout=60,
        )
    if r.returncode != 0:
        return []
    return [p for p in r.stdout.splitlines() if p.strip()]


def get_local_files(repo_path: str) -> set[str]:
    """Return all file paths currently tracked in the working tree HEAD.

    Falls back to an empty set when the repo has no commits yet.
    """
    r = _run(
        ["git", "ls-tree", "-r", "--name-only", "HEAD"],
        cwd=repo_path,
        timeout=30,
    )
    if r.returncode != 0:
        return set()
    return {p for p in r.stdout.splitlines() if p.strip()}


def pull_file_from_branch(
    repo_path: str,
    branch: str,
    filepath: str,
    log: Optional[LogFn] = None,
) -> tuple[bool, str]:
    """Checkout a single file from a remote branch into the working tree.

    Uses ``git checkout origin/<branch> -- <file>`` which copies the blob
    directly into the working directory (and stages it) without switching
    branches.  Falls back to the bare branch name if the origin/ variant
    fails.
    """
    _run(["git", "fetch", "origin", branch], cwd=repo_path, timeout=120)

    r = _run(
        ["git", "checkout", f"origin/{branch}", "--", filepath],
        cwd=repo_path,
        timeout=60,
    )
    if r.returncode != 0:
        r = _run(
            ["git", "checkout", branch, "--", filepath],
            cwd=repo_path,
            timeout=60,
        )
    if r.returncode != 0:
        msg = r.stderr.strip() or "checkout failed"
        if log:
            log("error", f"Failed to pull {filepath} from {branch}: {msg}")
        return False, msg

    if log:
        log("success", f"Pulled {filepath} from {branch}")
    return True, "OK"
