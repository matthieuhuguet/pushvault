"""Clone from URL dialog — add repos directly from a GitHub URL.

Features:
- Paste a GitHub URL and auto-detect repo name
- Choose local destination folder
- Clone with progress
- Auto-add to PushVault config on success
"""

from __future__ import annotations

import os
import re
import tkinter as tk
from pathlib import Path
from typing import Callable, Optional

import customtkinter as ctk

from .git_engine import _run
from .models import RepoConfig
from .theme import Colors, Fonts, Spacing, hex_blend


class CloneDialog(ctk.CTkToplevel):
    """Dialog for cloning a repository from a URL."""

    def __init__(
        self,
        parent: ctk.CTk,
        default_parent_dir: str = "",
        on_cloned: Optional[Callable[[RepoConfig], None]] = None,
        log: Optional[Callable[[str, str], None]] = None,
    ):
        super().__init__(parent)
        self._on_cloned = on_cloned
        self._log = log
        self._default_parent = default_parent_dir or str(Path.home() / "Projects")
        self._cloning = False

        self.title("Clone Repository")
        self.geometry("520x380")
        self.resizable(False, False)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Center
        self.update_idletasks()
        w, h = 520, 380
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        self.transient(parent)
        self.grab_set()

        self._build_ui()
        self._set_dark_titlebar()
        self.focus_force()

        self.bind("<Escape>", lambda _: self.destroy())

    def _set_dark_titlebar(self):
        try:
            import ctypes
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, 20, ctypes.byref(ctypes.c_int(1)), ctypes.sizeof(ctypes.c_int)
            )
        except Exception:
            pass

    def _build_ui(self):
        pad = Spacing.LG

        # Header
        header = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, height=52, corner_radius=0)
        header.pack(fill="x")

        ctk.CTkLabel(
            header,
            text="\u2913  Clone Repository",
            font=Fonts.HEADING,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        ).pack(side="left", padx=pad, pady=Spacing.MD)

        # Content
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.pack(fill="both", expand=True, padx=pad, pady=pad)

        # URL
        ctk.CTkLabel(
            content, text="Repository URL",
            font=Fonts.SMALL_BOLD, text_color=Colors.TEXT_SECONDARY,
        ).pack(anchor="w", pady=(0, Spacing.XS))

        self._url_var = tk.StringVar()
        self._url_var.trace_add("write", self._on_url_change)

        ctk.CTkEntry(
            content, textvariable=self._url_var, height=36, corner_radius=8,
            fg_color=Colors.BG_INPUT, border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY, font=Fonts.MONO_SMALL,
            placeholder_text="https://github.com/user/repo.git",
        ).pack(fill="x")

        # Auto-detected name
        self._name_label = ctk.CTkLabel(
            content, text="",
            font=Fonts.TINY, text_color=Colors.TEXT_TERTIARY,
        )
        self._name_label.pack(anchor="w", pady=(Spacing.XS, Spacing.MD))

        # Destination
        ctk.CTkLabel(
            content, text="Clone into",
            font=Fonts.SMALL_BOLD, text_color=Colors.TEXT_SECONDARY,
        ).pack(anchor="w", pady=(0, Spacing.XS))

        dest_frame = ctk.CTkFrame(content, fg_color="transparent")
        dest_frame.pack(fill="x")
        dest_frame.grid_columnconfigure(0, weight=1)

        self._dest_var = tk.StringVar(value=self._default_parent)
        ctk.CTkEntry(
            dest_frame, textvariable=self._dest_var, height=36, corner_radius=8,
            fg_color=Colors.BG_INPUT, border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY, font=Fonts.MONO_SMALL,
        ).grid(row=0, column=0, sticky="ew")

        ctk.CTkButton(
            dest_frame, text="\u2026", width=36, height=36, corner_radius=8,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY, font=("Segoe UI", 14),
            command=self._browse_dest, border_width=0,
        ).grid(row=0, column=1, padx=(Spacing.XS, 0))

        # Status
        self._status_label = ctk.CTkLabel(
            content, text="",
            font=Fonts.SMALL, text_color=Colors.TEXT_TERTIARY,
        )
        self._status_label.pack(anchor="w", pady=(Spacing.MD, 0))

        # Progress
        self._progress = ctk.CTkProgressBar(
            content,
            fg_color=Colors.BG_TERTIARY,
            progress_color=Colors.ACCENT,
            height=3,
            corner_radius=2,
        )
        self._progress.set(0)

        # Footer
        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.pack(fill="x", padx=pad, pady=(0, pad))

        ctk.CTkButton(
            footer, text="Cancel", command=self.destroy,
            fg_color="transparent", hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY, border_width=1, border_color=Colors.BORDER,
            height=36, width=80, corner_radius=8, font=Fonts.SMALL_BOLD,
        ).pack(side="right", padx=(Spacing.SM, 0))

        self._clone_btn = ctk.CTkButton(
            footer, text="Clone", command=self._start_clone,
            fg_color=Colors.SUCCESS,
            hover_color=hex_blend(Colors.SUCCESS, "#FFFFFF", 0.15),
            text_color="#000000",
            height=36, width=100, corner_radius=8, font=Fonts.BODY_BOLD,
        )
        self._clone_btn.pack(side="right")

    def _on_url_change(self, *_):
        """Auto-detect repo name from URL."""
        url = self._url_var.get().strip()
        name = self._extract_repo_name(url)
        if name:
            self._name_label.configure(
                text=f"\u2192  Will clone as: {name}",
                text_color=Colors.SUCCESS,
            )
        else:
            self._name_label.configure(text="", text_color=Colors.TEXT_TERTIARY)

    @staticmethod
    def _extract_repo_name(url: str) -> str:
        """Extract repository name from a git URL."""
        # HTTPS: https://github.com/user/repo.git
        # SSH: git@github.com:user/repo.git
        match = re.search(r"[/:]([^/:]+?)(?:\.git)?/?$", url)
        return match.group(1) if match else ""

    def _browse_dest(self):
        from tkinter import filedialog
        path = filedialog.askdirectory(title="Select destination folder")
        if path:
            self._dest_var.set(path)

    def _start_clone(self):
        if self._cloning:
            return

        url = self._url_var.get().strip()
        dest = self._dest_var.get().strip()
        name = self._extract_repo_name(url)

        if not url or not dest or not name:
            self._status_label.configure(text="Please enter a valid URL and destination", text_color=Colors.ERROR)
            return

        clone_path = str(Path(dest) / name)
        if Path(clone_path).exists():
            self._status_label.configure(text=f"Directory already exists: {name}", text_color=Colors.ERROR)
            return

        self._cloning = True
        self._clone_btn.configure(state="disabled", text="Cloning...")
        self._status_label.configure(text="Cloning...", text_color=Colors.ACCENT)
        self._progress.pack(fill="x", pady=(Spacing.XS, 0))
        self._progress.set(0)

        # Start clone in background
        import threading
        threading.Thread(
            target=self._do_clone,
            args=(url, clone_path, name),
            daemon=True,
        ).start()

    def _do_clone(self, url: str, clone_path: str, name: str):
        """Run git clone in a background thread."""
        # Ensure parent dir exists
        Path(clone_path).parent.mkdir(parents=True, exist_ok=True)

        r = _run(
            ["git", "clone", "--progress", url, clone_path],
            cwd=str(Path(clone_path).parent),
            timeout=600,
        )

        if r.returncode == 0:
            repo = RepoConfig(
                name=name,
                path=clone_path,
                remote=url,
                icon="folder",
                color="#7C5CBF",
            )
            self.after(0, self._clone_success, repo)
        else:
            error = r.stderr.strip()[:200]
            self.after(0, self._clone_failed, error)

    def _clone_success(self, repo: RepoConfig):
        self._cloning = False
        self._status_label.configure(text=f"\u2713  Cloned successfully!", text_color=Colors.SUCCESS)
        self._progress.set(1)
        self._clone_btn.configure(state="normal", text="Clone")

        if self._on_cloned:
            self._on_cloned(repo)

        if self._log:
            self._log("success", f"Cloned {repo.name} to {repo.path}")

        # Close after brief delay
        self.after(1500, self.destroy)

    def _clone_failed(self, error: str):
        self._cloning = False
        self._status_label.configure(text=f"\u2717  Clone failed: {error}", text_color=Colors.ERROR)
        self._progress.pack_forget()
        self._clone_btn.configure(state="normal", text="Clone")

        if self._log:
            self._log("error", f"Clone failed: {error}")
