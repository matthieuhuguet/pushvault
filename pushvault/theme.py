"""Design system — Spotify-identical premium dark theme V3."""

from __future__ import annotations

import sys
from pathlib import Path

_GT_WALSHEIM_PATH = str(Path(__file__).parent.parent / "assets" / "fonts" / "GT-Walsheim-Bold.ttf")
_GT_WALSHEIM_LOADED = False


def _load_gt_walsheim() -> str | None:
    """Register GT Walsheim with Windows GDI. Returns family name or None."""
    if sys.platform != "win32":
        return None
    global _GT_WALSHEIM_LOADED
    if _GT_WALSHEIM_LOADED:
        return "GT Walsheim Bold"
    try:
        import ctypes
        FR_PRIVATE = 0x10
        n = ctypes.windll.gdi32.AddFontResourceExW(_GT_WALSHEIM_PATH, FR_PRIVATE, 0)
        if n > 0:
            _GT_WALSHEIM_LOADED = True
            return "GT Walsheim Bold"
    except Exception:
        pass
    return None


def _best_font() -> str:
    gt = _load_gt_walsheim()
    if gt:
        return gt
    if sys.platform == "win32":
        return "Segoe UI Variable"
    return "SF Pro Text"


def _mono_font() -> str:
    if sys.platform == "win32":
        return "Cascadia Code"
    return "SF Mono"


class Colors:
    # Backgrounds
    BG_BASE      = "#000000"
    BG_PRIMARY   = "#121212"
    BG_SECONDARY = "#181818"
    BG_TERTIARY  = "#282828"
    BG_HOVER     = "#2A2A2A"
    BG_INPUT     = "#2A2A2A"
    BG_ELEVATED  = "#333333"

    # Borders
    BORDER        = "#333333"
    BORDER_SUBTLE = "#222222"
    BORDER_FOCUS  = "#1DB954"

    # Text
    TEXT_PRIMARY   = "#FFFFFF"
    TEXT_SECONDARY = "#B3B3B3"
    TEXT_TERTIARY  = "#535353"
    TEXT_INVERSE   = "#000000"

    # Accent — Spotify green
    ACCENT       = "#1DB954"
    ACCENT_HOVER = "#1ED760"
    ACCENT_MUTED = "#169C46"
    ACCENT_BG    = "#0A2E1A"

    # Status
    SUCCESS    = "#1DB954"
    SUCCESS_BG = "#0A2E1A"
    WARNING    = "#F5A623"
    WARNING_BG = "#2E1F08"
    ERROR      = "#E8525A"
    ERROR_BG   = "#2A0D0F"
    INFO       = "#4687D6"
    INFO_BG    = "#0D1A2A"

    # Diff viewer
    DIFF_OURS_BG     = "#191919"
    DIFF_OURS_LINE   = "#222222"
    DIFF_THEIRS_BG   = "#1c1c1c"
    DIFF_THEIRS_LINE = "#282828"
    DIFF_CONTEXT_BG  = "#181818"
    DIFF_MARKER_BG   = "#202020"
    DIFF_ADD_BG      = "#0A2E1A"
    DIFF_DEL_BG      = "#2A0D0F"
    DIFF_GUTTER      = "#242424"
    DIFF_LINE_NUM    = "#535353"

    # Specific
    SCROLLBAR       = "#333333"
    SCROLLBAR_HOVER = "#555555"
    BADGE_BG        = "#282828"

    # Sidebar
    SIDEBAR_BG          = "#000000"
    SIDEBAR_ACTIVE      = "#282828"
    SIDEBAR_HOVER       = "#1A1A1A"
    SIDEBAR_ICON        = "#B3B3B3"
    SIDEBAR_ICON_ACTIVE = "#FFFFFF"

    # Bottom bar
    BOTTOM_BAR_BG   = "#000000"

    # Card grid
    CARD_BG         = "#181818"
    CARD_HOVER      = "#282828"

    # Pill buttons
    PILL_BG         = "#232323"
    PILL_BG_ACTIVE  = "#FFFFFF"
    PILL_TEXT        = "#B3B3B3"
    PILL_TEXT_ACTIVE = "#000000"


class Spacing:
    XS  = 4
    SM  = 8
    MD  = 12
    LG  = 16
    XL  = 24
    XXL = 32


FONT_FAMILY = _best_font()
MONO_FAMILY = _mono_font()


class Fonts:
    TITLE      = (FONT_FAMILY, 14, "bold")
    HEADING    = (FONT_FAMILY, 12, "bold")
    BODY       = (FONT_FAMILY, 11)
    BODY_BOLD  = (FONT_FAMILY, 11, "bold")
    SMALL      = (FONT_FAMILY, 10)
    SMALL_BOLD = (FONT_FAMILY, 10, "bold")
    TINY       = (FONT_FAMILY, 9)
    MONO       = (MONO_FAMILY, 10)
    MONO_SMALL = (MONO_FAMILY, 9)

    # Spotify-specific
    CARD_TITLE = (FONT_FAMILY, 11, "bold")
    CARD_SUB   = (FONT_FAMILY, 10)
    NAV_LABEL  = (FONT_FAMILY, 9, "bold")
    BOTTOM_BAR = (FONT_FAMILY, 10)
    SECTION    = (FONT_FAMILY, 16, "bold")


# ── Status mappings ──────────────────────────────────────────────

STATUS_COLORS = {
    "synced":     Colors.SUCCESS,
    "needs_push": Colors.WARNING,
    "needs_pull": Colors.INFO,
    "diverged":   Colors.WARNING,
    "conflict":   Colors.ERROR,
    "not_init":   Colors.TEXT_TERTIARY,
    "checking":   Colors.TEXT_SECONDARY,
    "error":      Colors.ERROR,
}

STATUS_ICONS = {
    "synced":     "\u2713",   # ✓
    "needs_push": "\u2191",   # ↑
    "needs_pull": "\u2193",   # ↓
    "diverged":   "\u21C5",   # ⇅
    "conflict":   "\u26A0",   # ⚠
    "not_init":   "\u2014",   # —
    "checking":   "\u00B7",   # ·
    "error":      "\u2717",   # ✗
}

REPO_ICONS = {
    "brain":     "\U0001F9E0",
    "camera":    "\U0001F4F7",
    "download":  "\U0001F4E5",
    "portfolio": "\U0001F4BC",
    "folder":    "\U0001F4C1",
    "code":      "\U0001F4BB",
    "art":       "\U0001F3A8",
    "music":     "\U0001F3B5",
    "video":     "\U0001F3AC",
    "game":      "\U0001F3AE",
    "book":      "\U0001F4DA",
    "star":      "\u2B50",
    "rocket":    "\U0001F680",
    "gear":      "\u2699",
    "shield":    "\U0001F6E1",
    "world":     "\U0001F30D",
    "cloud":     "\u2601",
    "fire":      "\U0001F525",
    "lab":       "\U0001F9EA",
    "robot":     "\U0001F916",
}


def hex_blend(color1: str, color2: str, alpha: float = 0.5) -> str:
    """Blend two hex colors together."""
    r1, g1, b1 = int(color1[1:3], 16), int(color1[3:5], 16), int(color1[5:7], 16)
    r2, g2, b2 = int(color2[1:3], 16), int(color2[3:5], 16), int(color2[5:7], 16)
    r = int(r1 * (1 - alpha) + r2 * alpha)
    g = int(g1 * (1 - alpha) + g2 * alpha)
    b = int(b1 * (1 - alpha) + b2 * alpha)
    return f"#{r:02x}{g:02x}{b:02x}"


# Default accent colors for repo cards (Spotify-like vivid palette)
CARD_COLORS = [
    "#1DB954",  # Spotify green
    "#E13300",  # Vibrant red-orange
    "#8C67AB",  # Purple
    "#509BF5",  # Blue
    "#F037A5",  # Pink
    "#E8115B",  # Red
    "#FF6437",  # Orange
    "#FFC864",  # Gold
    "#27856A",  # Teal
    "#A0C3D2",  # Light blue
    "#BA5D07",  # Amber
    "#1E3264",  # Navy
]
