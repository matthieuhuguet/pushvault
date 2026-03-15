"""Large-file pre-processor — filesystem-first, git-independent.

Proactively scans the working tree for files > 49 MB (≤ 10 GB), splits them
into 49 MB zip chunks stored in .pv_chunks/, and records originals in
.gitignore so they are never enumerated by git-status.

Designed to run *before* git-status in commit_push(), which means:
  - large originals are .gitignored → invisible to git-status
  - fresh chunk zips appear as normal untracked files in git-status
  - git-status completes quickly even on repos with thousands of large files

Public API
----------
    pre_process_large_files(repo_path, log) -> PreProcessResult
    scan_large_files(repo_path, min_bytes, max_bytes, ...) -> list[Path]
"""

from __future__ import annotations

import json
import os
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

LogFn = Callable[[str, str], None]   # (level, message) -> None

# ── Thresholds ────────────────────────────────────────────────────
_CHUNK_MB: int = 49           # Each zip part is ≤ this size
_MIN_MB:   int = 49           # Chunk files strictly larger than this
_MAX_MB:   int = 10 * 1024    # Never attempt files larger than this (10 GB)

_SKIP_DIRS: frozenset[str] = frozenset({
    ".git",
    ".pv_chunks",
    ".claude",
    "downloads",  # May contain personal/sensitive files — never chunk or push
})

_SKIP_EXTENSIONS: frozenset[str] = frozenset({
    ".pts", ".las", ".laz", ".pcd", ".e57", ".ptx", ".xyb", ".xyz", ".nul",
})

_GITIGNORE_SECTION_HEADER = (
    "# PushVault — large-file originals (stored as chunks in .pv_chunks/)\n"
)


# ── Data classes ─────────────────────────────────────────────────

@dataclass
class ChunkResult:
    """Outcome of processing a single large file."""
    relative_path: str
    size_mb: float
    chunks_written: int   # 0 means cache hit — nothing re-written
    was_cached: bool


@dataclass
class PreProcessResult:
    """Aggregate result returned by pre_process_large_files()."""
    processed: list[ChunkResult] = field(default_factory=list)
    skipped_oversized: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def total_chunked(self) -> int:
        return sum(1 for r in self.processed if not r.was_cached)

    @property
    def total_cached(self) -> int:
        return sum(1 for r in self.processed if r.was_cached)


# ── Manifest I/O ─────────────────────────────────────────────────

def _load_manifest(chunks_dir: Path) -> dict:
    p = chunks_dir / "manifest.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_manifest(chunks_dir: Path, manifest: dict) -> None:
    chunks_dir.mkdir(exist_ok=True)
    (chunks_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True),
        encoding="utf-8",
    )


# ── Internal helpers ─────────────────────────────────────────────

def _safe_stem(rel_posix: str) -> str:
    """Turn a POSIX-relative path into a filesystem-safe chunk stem."""
    return (
        rel_posix
        .replace("/", "_")
        .replace("\\", "_")
        .replace(":", "_")
        .replace(" ", "_")
    )


def _collect_worktree_prefixes(repo_path: Path) -> set[str]:
    """Return POSIX-relative prefixes of linked git worktrees.

    Reads .git/worktrees/*/gitdir directly — no git subprocess needed.
    Returns an empty set when there are no linked worktrees.
    """
    worktrees_dir = repo_path / ".git" / "worktrees"
    if not worktrees_dir.is_dir():
        return set()

    repo_abs = repo_path.resolve()
    prefixes: set[str] = set()

    for gitdir_file in worktrees_dir.glob("*/gitdir"):
        try:
            # .git/worktrees/<name>/gitdir contains "<worktree_abs>/.git"
            wt_git = Path(gitdir_file.read_text(encoding="utf-8").strip())
            wt_abs = wt_git.parent.resolve()
            wt_str = str(wt_abs)
            repo_str = str(repo_abs)
            if wt_str.startswith(repo_str + os.sep):
                rel = os.path.relpath(wt_str, repo_str).replace("\\", "/")
                prefixes.add(rel)
        except (OSError, ValueError):
            pass

    return prefixes


def _is_under_worktree(rel_posix: str, worktree_prefixes: set[str]) -> bool:
    return any(
        rel_posix == wt or rel_posix.startswith(wt + "/")
        for wt in worktree_prefixes
    )


def _chunk_file(
    file_path: Path,
    chunks_dir: Path,
    manifest: dict,
    rel_str: str,
    log: Optional[LogFn] = None,
) -> ChunkResult:
    """Split *file_path* into zip parts inside *chunks_dir*.

    Updates *manifest* in-place.  Returns a :class:`ChunkResult` describing
    what was done (or skipped on a cache hit).
    """
    stat = file_path.stat()
    size, mtime = stat.st_size, stat.st_mtime
    size_mb = size / 1_048_576
    stem = _safe_stem(rel_str)
    chunk_bytes = _CHUNK_MB * 1_048_576

    # ── Cache hit: manifest entry still valid AND parts exist on disk ──
    entry = manifest.get(rel_str, {})
    if entry.get("mtime") == mtime and entry.get("size") == size:
        if list(chunks_dir.glob(f"{stem}.part*.zip")):
            return ChunkResult(rel_str, round(size_mb, 1), 0, was_cached=True)

    # ── Remove stale parts ────────────────────────────────────────
    for stale in chunks_dir.glob(f"{stem}.part*.zip"):
        try:
            stale.unlink()
        except OSError:
            pass

    # ── Write new parts ───────────────────────────────────────────
    n_parts = max(1, (size + chunk_bytes - 1) // chunk_bytes)
    if log:
        log("info", f"Chunking {rel_str} ({size_mb:.0f} MB) → {n_parts} part(s)…")

    chunks_dir.mkdir(exist_ok=True)
    with open(file_path, "rb") as fh:
        for i in range(n_parts):
            data = fh.read(chunk_bytes)
            part_name = f"{stem}.part{i + 1:03d}"
            with zipfile.ZipFile(
                chunks_dir / f"{part_name}.zip", "w", zipfile.ZIP_STORED
            ) as zf:
                zf.writestr(part_name, data)

    manifest[rel_str] = {
        "mtime": mtime,
        "size": size,
        "chunks": n_parts,
        "stem": stem,
    }
    return ChunkResult(rel_str, round(size_mb, 1), n_parts, was_cached=False)


def _update_gitignore(repo_path: Path, rel_paths: list[str]) -> None:
    """Append *rel_paths* under a PushVault section in .gitignore (idempotent)."""
    if not rel_paths:
        return

    gi_path = repo_path / ".gitignore"
    existing_text = ""
    if gi_path.exists():
        try:
            existing_text = gi_path.read_text(encoding="utf-8")
        except OSError:
            return

    # Collect all non-comment patterns already present
    already_ignored = {
        line.strip()
        for line in existing_text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    }

    new_entries = [p for p in rel_paths if p not in already_ignored]
    if not new_entries:
        return

    if existing_text and not existing_text.endswith("\n"):
        existing_text += "\n"

    existing_text += "\n" + _GITIGNORE_SECTION_HEADER
    for p in new_entries:
        existing_text += p + "\n"

    gi_path.write_text(existing_text, encoding="utf-8")


# ── Public API ───────────────────────────────────────────────────

def scan_large_files(
    repo_path: Path,
    min_bytes: int,
    max_bytes: int,
    worktree_prefixes: Optional[set[str]] = None,
) -> list[Path]:
    """Walk the working tree and return files with min_bytes < size ≤ max_bytes.

    Uses os.walk() — no git subprocess.
    Excludes: .git/, .pv_chunks/, .claude/, worktree subtrees, _SKIP_EXTENSIONS.
    """
    if worktree_prefixes is None:
        worktree_prefixes = _collect_worktree_prefixes(repo_path)

    repo_abs = repo_path.resolve()
    results: list[Path] = []

    for dirpath, dirnames, filenames in os.walk(str(repo_abs)):
        dp = Path(dirpath)
        rel_dir = os.path.relpath(dirpath, str(repo_abs)).replace("\\", "/")
        if rel_dir == ".":
            rel_dir = ""  # root — normalise for prefix comparisons

        # Prune subdirectories in-place so os.walk never descends into them
        dirnames[:] = [
            d for d in dirnames
            if d.lower() not in _SKIP_DIRS
            and not _is_under_worktree(
                (rel_dir + "/" + d).lstrip("/"), worktree_prefixes
            )
        ]

        # Skip files whose parent directory is inside a worktree
        if rel_dir and _is_under_worktree(rel_dir, worktree_prefixes):
            continue

        for fname in filenames:
            if Path(fname).suffix.lower() in _SKIP_EXTENSIONS:
                continue
            fpath = dp / fname
            try:
                sz = fpath.stat().st_size
            except OSError:
                continue
            if min_bytes < sz <= max_bytes:
                results.append(fpath)

    return results


def pre_process_large_files(
    repo_path: str,
    log: Optional[LogFn] = None,
) -> PreProcessResult:
    """Filesystem-first large-file pre-processor.

    Scans the entire working tree for files > 49 MB, creates or updates zip
    chunks in .pv_chunks/, and appends original file paths to .gitignore.

    Call this at the start of commit_push(), *before* running git-status, so:
      - large originals are .gitignored → won't be enumerated by git-status
      - fresh chunk zips are ready and will appear as new files in git-status
      - git-status is fast even on repos with thousands of large files

    Files already up-to-date (unchanged mtime + size per manifest) are skipped
    instantly — the operation is O(directory scan) on a warm run.
    """
    repo = Path(repo_path).resolve()
    chunks_dir = repo / ".pv_chunks"
    min_bytes = _MIN_MB * 1_048_576
    max_bytes = _MAX_MB * 1_048_576

    result = PreProcessResult()
    manifest = _load_manifest(chunks_dir)
    wt_prefixes = _collect_worktree_prefixes(repo)

    large_files = scan_large_files(repo, min_bytes, max_bytes, wt_prefixes)
    if not large_files:
        return result  # Fast exit — nothing to do

    if log:
        log("info", f"Pre-processing {len(large_files)} large file(s)…")

    gitignore_paths: list[str] = []

    for fpath in large_files:
        rel_str = os.path.relpath(str(fpath), str(repo)).replace("\\", "/")

        try:
            size = fpath.stat().st_size
        except OSError:
            continue

        if size > max_bytes:
            result.skipped_oversized.append(rel_str)
            if log:
                log("warning", f"Skipped (>{_MAX_MB // 1024} GB): {rel_str}")
            continue

        try:
            cr = _chunk_file(fpath, chunks_dir, manifest, rel_str, log)
            result.processed.append(cr)
            gitignore_paths.append(rel_str)
        except Exception as exc:
            result.errors.append(f"{rel_str}: {exc}")
            if log:
                log("error", f"Chunk failed for {rel_str}: {exc}")

    _save_manifest(chunks_dir, manifest)
    _update_gitignore(repo, gitignore_paths)

    if log:
        n_new = result.total_chunked
        n_cached = result.total_cached
        if n_new:
            log("success", f"Chunked {n_new} file(s), {n_cached} already current")
        elif n_cached:
            log("info", f"Large files: {n_cached} chunk(s) already up-to-date")

    return result
