"""PushVault — Multi-repo backup to GitHub.

Usage:
    python app.py              # Normal launch
    pythonw app.py             # Silent (no console)
"""

import sys
from pathlib import Path

def main():
    # Config path: same directory as app.py
    app_dir = Path(__file__).parent
    config_path = app_dir / "config.json"

    from pushvault.ui_main import PushVaultApp

    app = PushVaultApp(config_path)
    app.mainloop()


if __name__ == "__main__":
    main()
