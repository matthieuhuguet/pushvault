"""PushVault — Multi-repo backup to GitHub.

Usage:
    python app.py              # Normal launch
    pythonw app.py             # Silent (no console)
"""

import sys
import ctypes
from pathlib import Path


def _setup_rendering() -> None:
    """Enable per-monitor DPI awareness for crisp font rendering.
    Must be called before any window is created."""
    if sys.platform != "win32":
        return
    try:
        # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
        ctypes.windll.user32.SetProcessDpiAwarenessContext(-4)
    except Exception:
        try:
            # Fallback: PROCESS_PER_MONITOR_DPI_AWARE = 2
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass


_setup_rendering()


def main():
    # Config path: same directory as app.py
    app_dir = Path(__file__).parent
    config_path = app_dir / "config.json"

    from pushvault.ui_main import PushVaultApp

    app = PushVaultApp(config_path)
    app.mainloop()


if __name__ == "__main__":
    main()
