"""System tray integration using pystray."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Callable, Optional

try:
    from PIL import Image, ImageDraw, ImageFont
    import pystray
    HAS_TRAY = True
except ImportError:
    HAS_TRAY = False

# Assets directory relative to this module
_ASSETS_DIR = Path(__file__).parent.parent / "assets"
_ICON_64 = _ASSETS_DIR / "icon_64.png"


def _load_tray_image() -> "Image.Image":
    """Load the ZenRay logo for the tray, falling back to a drawn icon."""
    if _ICON_64.exists():
        img = Image.open(_ICON_64).convert("RGBA")
        return img.resize((64, 64), Image.LANCZOS)

    # Fallback: drawn "PV" circle
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([2, 2, 62, 62], fill=(124, 92, 191))
    try:
        font = ImageFont.truetype("segoeui.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    draw.text((14, 16), "PV", fill=(255, 255, 255), font=font)
    return img


def create_tray_icon(
    on_show: Callable[[], None],
    on_sync: Callable[[], None],
    on_quit: Callable[[], None],
    label: str = "PushVault",
) -> Optional[object]:
    """Create and return a system tray icon. Returns None if pystray unavailable."""
    if not HAS_TRAY:
        return None

    img = _load_tray_image()

    menu = pystray.Menu(
        pystray.MenuItem("Show PushVault", on_show, default=True),
        pystray.MenuItem("Sync All", on_sync),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", on_quit),
    )

    icon = pystray.Icon("pushvault", img, label, menu)
    return icon


def run_tray_icon(icon: object) -> None:
    """Run the tray icon in a background thread."""
    if icon is None:
        return
    thread = threading.Thread(target=icon.run, daemon=True)
    thread.start()


def stop_tray_icon(icon: object) -> None:
    """Stop the tray icon."""
    if icon is None:
        return
    try:
        icon.stop()
    except Exception:
        pass
