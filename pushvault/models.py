"""Data models for PushVault."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class SyncState(str, Enum):
    SYNCED = "synced"
    NEEDS_PUSH = "needs_push"
    NEEDS_PULL = "needs_pull"
    DIVERGED = "diverged"
    CONFLICT = "conflict"
    NOT_INIT = "not_init"
    CHECKING = "checking"
    ERROR = "error"


class ConflictType(str, Enum):
    TEXT = "text"          # Has conflict markers (<<<<<<, ======, >>>>>>)
    BINARY = "binary"     # Binary file, no markers — must choose ours/theirs
    ADDED_BOTH = "added_both"
    DELETED_BY_US = "deleted_by_us"
    DELETED_BY_THEM = "deleted_by_them"


class Resolution(str, Enum):
    OURS = "ours"
    THEIRS = "theirs"
    MANUAL = "manual"


@dataclass
class RepoConfig:
    name: str
    path: str
    remote: str
    icon: str = "folder"
    color: str = "#7C5CBF"


@dataclass
class RepoStatus:
    state: SyncState = SyncState.CHECKING
    label: str = "Checking..."
    untracked: int = 0
    modified: int = 0
    staged: int = 0
    deleted: int = 0
    conflicts: int = 0
    ahead: int = 0
    behind: int = 0
    branch: str = ""
    error: str = ""

    @property
    def total_changes(self) -> int:
        return self.untracked + self.modified + self.staged + self.deleted

    @property
    def has_conflicts(self) -> bool:
        return self.conflicts > 0


@dataclass
class ConflictHunk:
    """A single conflict region within a file."""
    ours_lines: list[str] = field(default_factory=list)
    theirs_lines: list[str] = field(default_factory=list)
    ours_label: str = "HEAD"
    theirs_label: str = ""
    context_before: list[str] = field(default_factory=list)
    context_after: list[str] = field(default_factory=list)


@dataclass
class ConflictFile:
    """A single conflicted file with parsed conflict data."""
    path: str
    conflict_type: ConflictType = ConflictType.TEXT
    git_status: str = "UU"  # UU, AA, DU, UD, AU, UA
    hunks: list[ConflictHunk] = field(default_factory=list)
    marker_count: int = 0
    resolution: Optional[Resolution] = None
    full_content: str = ""

    @property
    def is_resolved(self) -> bool:
        return self.resolution is not None

    @property
    def display_status(self) -> str:
        status_map = {
            "UU": "Both modified",
            "AA": "Both added",
            "DU": "Deleted by us",
            "UD": "Deleted by them",
            "AU": "Added by us",
            "UA": "Added by them",
        }
        return status_map.get(self.git_status, "Conflict")


@dataclass
class AppConfig:
    repos: list[RepoConfig] = field(default_factory=list)
    auto_check_interval_minutes: int = 5
    max_file_size_mb: int = 49
    batch_size: int = 50
    window_width: int = 400
    window_height: int = 860


@dataclass
class LogEntry:
    timestamp: str
    repo: str
    message: str
    level: str = "info"  # info, success, warning, error
