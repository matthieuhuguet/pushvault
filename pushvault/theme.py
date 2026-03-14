"""Design system — Spotify-premium dark theme."""

from __future__ import annotations

import sys


def _best_font() -> str:
    if sys.platform == "win32":
        return "Segoe UI Variable"
    return "SF Pro Text"


def _mono_font() -> str:
    if sys.platform == "win32":
        return "Cascadia Code"
    return "SF Mono"


# ── Palette ──────────────────────────────────────────────────────

class Colors:
    # Backgrounds — Spotify palette
    BG_PRIMARY   = "#121212"    # Spotify black
    BG_SECONDARY = "#181818"    # Card / elevated surface
    BG_TERTIARY  = "#242424"    # Further elevated
    BG_HOVER     = "#2A2A2A"    # Hover state
    BG_INPUT     = "#1A1A1A"    # Input fields

    # Borders — very subtle, almost invisible
    BORDER        = "#333333"
    BORDER_SUBTLE = "#222222"
    BORDER_FOCUS  = "#4bb560"   # Green focus ring

    # Text
    TEXT_PRIMARY  = "#FFFFFF"   # Pure white
    TEXT_SECONDARY = "#B3B3B3"  # Spotify secondary grey
    TEXT_TERTIARY  = "#535353"  # Dark grey
    TEXT_INVERSE   = "#121212"

    # Accent — deep blue (primary action)
    ACCENT       = "#1913be"
    ACCENT_HOVER = "#2520d4"
    ACCENT_MUTED = "#0d0b6e"
    ACCENT_BG    = "#0a0a2a"

    # Status
    SUCCESS    = "#4bb560"      # Green
    SUCCESS_BG = "#0d1f12"
    WARNING    = "#c7b468"      # Golden
    WARNING_BG = "#1e1a08"
    ERROR      = "#E8525A"      # Soft red
    ERROR_BG   = "#2A0D0F"
    INFO       = "#1913be"      # Blue (same as accent)
    INFO_BG    = "#0a0a2a"

    # Diff viewer
    DIFF_OURS_BG     = "#191919"
    DIFF_OURS_LINE   = "#222222"
    DIFF_THEIRS_BG   = "#1c1c1c"
    DIFF_THEIRS_LINE = "#282828"
    DIFF_CONTEXT_BG  = "#181818"
    DIFF_MARKER_BG   = "#202020"
    DIFF_ADD_BG      = "#0d1f12"
    DIFF_DEL_BG      = "#2A0D0F"
    DIFF_GUTTER      = "#242424"
    DIFF_LINE_NUM    = "#535353"

    # Specific
    SCROLLBAR       = "#333333"
    SCROLLBAR_HOVER = "#555555"
    BADGE_BG        = "#282828"


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
}


def hex_blend(color1: str, color2: str, alpha: float = 0.5) -> str:
    """Blend two hex colors together."""
    r1, g1, b1 = int(color1[1:3], 16), int(color1[3:5], 16), int(color1[5:7], 16)
    r2, g2, b2 = int(color2[1:3], 16), int(color2[3:5], 16), int(color2[5:7], 16)
    r = int(r1 * (1 - alpha) + r2 * alpha)
    g = int(g1 * (1 - alpha) + g2 * alpha)
    b = int(b1 * (1 - alpha) + b2 * alpha)
    return f"#{r:02x}{g:02x}{b:02x}"
