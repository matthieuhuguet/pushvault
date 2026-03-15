"""
fix_branches.py — Switch all 4 repos to today's pv/YYYY-MM-DD branch.

Run once: python fix_branches.py
"""

import subprocess
import sys
import io
from datetime import datetime
from pathlib import Path

# Force UTF-8 output on Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

REPOS = [
    {"name": "Memory",      "path": r"E:\Create\Build\Memory"},
    {"name": "Screenshots", "path": r"C:\Users\matth\Pictures\Screenshots"},
    {"name": "Downloads",   "path": r"C:\Users\matth\Downloads"},
    {"name": "Portfolio",   "path": r"E:\Create\Build\PortfolioShare"},
]

TODAY = datetime.now().strftime("%Y-%m-%d")
DAILY = f"pv/{TODAY}"
CREATE_NO_WINDOW = 0x08000000

def run(args, cwd, timeout=60):
    import os
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_ASKPASS"] = "echo"
    proc = subprocess.run(
        args, cwd=cwd, env=env, capture_output=True,
        timeout=timeout, creationflags=CREATE_NO_WINDOW,
    )
    # Decode manually to handle Windows encodings
    def dec(b):
        try: return b.decode("utf-8")
        except: return b.decode("cp1252", errors="replace")
    proc.stdout = dec(proc.stdout)
    proc.stderr = dec(proc.stderr)
    return proc

def fix_repo(name, path):
    print(f"\n── {name} ({path}) ──")

    if not Path(path).exists():
        print(f"  SKIP: path does not exist")
        return

    r = run(["git", "rev-parse", "--git-dir"], cwd=path, timeout=10)
    if r.returncode != 0:
        print(f"  SKIP: not a git repo")
        return

    # Current branch
    r = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=path)
    cur = r.stdout.strip()
    print(f"  current branch: {cur}")

    if cur == DAILY:
        print(f"  already on {DAILY} ✓")
        return

    # Check if daily branch already exists locally
    exists = run(["git", "rev-parse", "--verify", DAILY], cwd=path).returncode == 0

    if exists:
        r = run(["git", "checkout", DAILY], cwd=path)
        if r.returncode == 0:
            print(f"  switched to existing {DAILY} ✓")
        else:
            print(f"  ERROR switching: {r.stderr.strip()}")
        return

    # Find most recent pv/ branch
    r = run(["git", "branch", "--list", "pv/*", "--sort=-refname"], cwd=path)
    pv_branches = [l.strip().lstrip("* ") for l in r.stdout.strip().splitlines() if l.strip()]
    parent = pv_branches[0] if pv_branches else None

    if parent:
        print(f"  creating {DAILY} from {parent}…")
        r = run(["git", "checkout", "-b", DAILY, parent], cwd=path)
    else:
        # First time: fetch origin and create from origin/main
        print(f"  no previous pv/ branch — fetching origin…")
        run(["git", "fetch", "origin"], cwd=path, timeout=60)
        # Try origin/main, then origin/master
        for base in ("origin/main", "origin/master"):
            r = run(["git", "checkout", "-b", DAILY, base], cwd=path)
            if r.returncode == 0:
                parent = base
                break
        else:
            # Last resort: branch from current HEAD
            r = run(["git", "checkout", "-b", DAILY], cwd=path)
            parent = cur

    if r.returncode == 0:
        print(f"  created {DAILY} from {parent or cur} ✓")
    else:
        print(f"  ERROR: {r.stderr.strip()}")

    # Show new status
    r = run(["git", "status", "--short", "--branch"], cwd=path)
    for line in r.stdout.strip().splitlines()[:5]:
        print(f"  {line}")

if __name__ == "__main__":
    print(f"Switching all repos to {DAILY}\n")
    for repo in REPOS:
        try:
            fix_repo(repo["name"], repo["path"])
        except Exception as e:
            print(f"  EXCEPTION: {e}")
    print("\nDone. Restart PushVault to see updated branches.")
