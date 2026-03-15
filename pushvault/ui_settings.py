"""In-app settings panel — edit configuration without touching JSON.

Features:
- General settings (auto-check interval, max file size, batch size)
- Repo management (add, remove, edit, reorder repos)
- Theme preview
- Save/cancel with validation
- Live config reload
"""

from __future__ import annotations

import json
import tkinter as tk
from pathlib import Path
from typing import Callable, Optional

import customtkinter as ctk

from .config import load_config, save_config
from .models import AppConfig, RepoConfig
from .theme import Colors, Fonts, Spacing, REPO_ICONS, hex_blend


class SettingsPanel(ctk.CTkToplevel):
    """Full settings editor window."""

    def __init__(
        self,
        parent: ctk.CTk,
        config_path: Path,
        on_save: Optional[Callable[[AppConfig], None]] = None,
    ):
        super().__init__(parent)
        self._config_path = config_path
        self._on_save = on_save
        self._cfg = load_config(config_path)
        self._dirty = False

        self.title("PushVault — Settings")
        self.geometry("640x720")
        self.minsize(540, 560)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Center
        self.update_idletasks()
        w, h = 640, 720
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        self._build_ui()
        self._set_dark_titlebar()
        self.focus_force()
        self.bind("<Escape>", lambda _: self._close())
        self.protocol("WM_DELETE_WINDOW", self._close)

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
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)

        # ── Header ──
        header = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, height=52, corner_radius=0)
        header.grid(row=0, column=0, sticky="ew")
        header.grid_columnconfigure(0, weight=1)
        header.grid_propagate(False)

        ctk.CTkLabel(
            header,
            text="\u2699  Settings",
            font=Fonts.HEADING,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        ).grid(row=0, column=0, sticky="w", padx=Spacing.LG, pady=Spacing.MD)

        # ── Scrollable content ──
        self._scroll = ctk.CTkScrollableFrame(
            self,
            fg_color="transparent",
            scrollbar_button_color=Colors.SCROLLBAR,
            scrollbar_button_hover_color=Colors.SCROLLBAR_HOVER,
        )
        self._scroll.grid(row=1, column=0, sticky="nsew", padx=Spacing.LG, pady=Spacing.MD)
        self._scroll.grid_columnconfigure(0, weight=1)

        row = 0

        # ── Section: General ──
        row = self._section_header(row, "General")

        row = self._setting_row(
            row, "Auto-check interval",
            "How often to automatically refresh repo status (minutes)",
        )
        self._interval_var = tk.StringVar(value=str(self._cfg.auto_check_interval_minutes))
        self._interval_entry = self._number_input(row - 1, self._interval_var, 1, 60)

        row = self._setting_row(
            row, "Max file size",
            "Files larger than this (MB) are split into chunks. GitHub limit is 100 MB.",
        )
        self._maxsize_var = tk.StringVar(value=str(self._cfg.max_file_size_mb))
        self._maxsize_entry = self._number_input(row - 1, self._maxsize_var, 1, 99)

        row = self._setting_row(
            row, "Batch size",
            "Number of files staged per commit batch. Lower = more granular progress.",
        )
        self._batch_var = tk.StringVar(value=str(self._cfg.batch_size))
        self._batch_entry = self._number_input(row - 1, self._batch_var, 5, 500)

        # ── Section: Window ──
        row = self._section_header(row, "Window")

        row = self._setting_row(
            row, "Window width",
            "Default window width in pixels",
        )
        self._width_var = tk.StringVar(value=str(self._cfg.window_width))
        self._width_entry = self._number_input(row - 1, self._width_var, 300, 1920)

        row = self._setting_row(
            row, "Window height",
            "Default window height in pixels",
        )
        self._height_var = tk.StringVar(value=str(self._cfg.window_height))
        self._height_entry = self._number_input(row - 1, self._height_var, 400, 1080)

        # ── Section: Repositories ──
        row = self._section_header(row, "Repositories")

        self._repos_frame = ctk.CTkFrame(self._scroll, fg_color="transparent")
        self._repos_frame.grid(row=row, column=0, sticky="ew", pady=(0, Spacing.MD))
        self._repos_frame.grid_columnconfigure(0, weight=1)
        row += 1

        self._rebuild_repo_list()

        # Add repo button
        add_btn = ctk.CTkButton(
            self._scroll,
            text="+  Add Repository",
            command=self._add_repo,
            fg_color=Colors.BG_TERTIARY,
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            height=36,
            corner_radius=10,
            font=Fonts.SMALL_BOLD,
            border_width=1,
            border_color=Colors.BORDER_SUBTLE,
        )
        add_btn.grid(row=row, column=0, sticky="ew", pady=(0, Spacing.XL))
        row += 1

        # ── Footer: Save / Cancel ──
        footer = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, height=56, corner_radius=0)
        footer.grid(row=2, column=0, sticky="ew")
        footer.grid_columnconfigure(0, weight=1)

        btn_frame = ctk.CTkFrame(footer, fg_color="transparent")
        btn_frame.grid(row=0, column=0, sticky="e", padx=Spacing.LG, pady=Spacing.MD)

        ctk.CTkButton(
            btn_frame,
            text="Cancel",
            command=self._close,
            fg_color="transparent",
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            border_width=1,
            border_color=Colors.BORDER,
            height=32,
            width=80,
            corner_radius=8,
            font=Fonts.SMALL_BOLD,
        ).pack(side="left", padx=(0, Spacing.SM))

        ctk.CTkButton(
            btn_frame,
            text="Save Settings",
            command=self._save,
            fg_color=Colors.SUCCESS,
            hover_color=hex_blend(Colors.SUCCESS, "#FFFFFF", 0.15),
            text_color="#000000",
            height=32,
            width=120,
            corner_radius=8,
            font=Fonts.SMALL_BOLD,
        ).pack(side="left")

    def _section_header(self, row: int, title: str) -> int:
        """Add a section header and return the next row."""
        frame = ctk.CTkFrame(self._scroll, fg_color="transparent")
        frame.grid(row=row, column=0, sticky="ew", pady=(Spacing.LG, Spacing.SM))

        ctk.CTkLabel(
            frame,
            text=title.upper(),
            font=Fonts.SMALL_BOLD,
            text_color=Colors.TEXT_TERTIARY,
            anchor="w",
        ).pack(side="left")

        # Separator line
        sep = ctk.CTkFrame(frame, fg_color=Colors.BORDER_SUBTLE, height=1)
        sep.pack(side="left", fill="x", expand=True, padx=(Spacing.SM, 0))

        return row + 1

    def _setting_row(self, row: int, label: str, description: str) -> int:
        """Add a setting label + description and return the next row."""
        frame = ctk.CTkFrame(self._scroll, fg_color=Colors.BG_SECONDARY, corner_radius=10)
        frame.grid(row=row, column=0, sticky="ew", pady=(0, Spacing.SM))
        frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            frame,
            text=label,
            font=Fonts.BODY_BOLD,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        ).grid(row=0, column=0, sticky="w", padx=Spacing.MD, pady=(Spacing.SM, 0))

        ctk.CTkLabel(
            frame,
            text=description,
            font=Fonts.TINY,
            text_color=Colors.TEXT_TERTIARY,
            anchor="w",
            wraplength=360,
        ).grid(row=1, column=0, sticky="w", padx=Spacing.MD, pady=(0, Spacing.SM))

        # Store frame ref for placing input widget
        self._current_setting_frame = frame

        return row + 1

    def _number_input(self, row: int, var: tk.StringVar, min_val: int, max_val: int) -> ctk.CTkEntry:
        """Place a number input on the right side of the current setting frame."""
        entry = ctk.CTkEntry(
            self._current_setting_frame,
            textvariable=var,
            width=80,
            height=32,
            corner_radius=8,
            fg_color=Colors.BG_INPUT,
            border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY,
            font=Fonts.BODY,
            justify="center",
        )
        entry.grid(row=0, column=1, rowspan=2, padx=Spacing.MD, pady=Spacing.SM)
        return entry

    # ── Repo List ──

    def _rebuild_repo_list(self):
        for w in self._repos_frame.winfo_children():
            w.destroy()

        for i, repo in enumerate(self._cfg.repos):
            self._create_repo_item(repo, i)

    def _create_repo_item(self, repo: RepoConfig, index: int):
        """Create an editable repo row."""
        # Get emoji for icon
        icon_emoji = REPO_ICONS.get(repo.icon, REPO_ICONS["folder"])

        frame = ctk.CTkFrame(
            self._repos_frame,
            fg_color=Colors.BG_SECONDARY,
            corner_radius=10,
            border_width=1,
            border_color=Colors.BORDER_SUBTLE,
        )
        frame.grid(row=index, column=0, sticky="ew", pady=(0, Spacing.SM))
        frame.grid_columnconfigure(1, weight=1)

        # Color dot
        ctk.CTkLabel(
            frame,
            text=icon_emoji,
            font=("Segoe UI", 14),
            width=28,
        ).grid(row=0, column=0, rowspan=2, padx=(Spacing.MD, Spacing.XS), pady=Spacing.SM)

        # Name
        ctk.CTkLabel(
            frame,
            text=repo.name,
            font=Fonts.BODY_BOLD,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        ).grid(row=0, column=1, sticky="w", padx=Spacing.XS, pady=(Spacing.SM, 0))

        # Path
        ctk.CTkLabel(
            frame,
            text=repo.path,
            font=Fonts.TINY,
            text_color=Colors.TEXT_TERTIARY,
            anchor="w",
        ).grid(row=1, column=1, sticky="w", padx=Spacing.XS, pady=(0, Spacing.SM))

        # Edit button
        ctk.CTkButton(
            frame,
            text="\u270E",
            command=lambda r=repo, idx=index: self._edit_repo(r, idx),
            fg_color="transparent",
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_TERTIARY,
            width=28,
            height=28,
            corner_radius=6,
            font=("Segoe UI", 12),
            border_width=0,
        ).grid(row=0, column=2, rowspan=2, padx=(Spacing.XS, 0))

        # Remove button
        ctk.CTkButton(
            frame,
            text="\u2715",
            command=lambda idx=index: self._remove_repo(idx),
            fg_color="transparent",
            hover_color=Colors.ERROR_BG,
            text_color=Colors.TEXT_TERTIARY,
            width=28,
            height=28,
            corner_radius=6,
            font=("Segoe UI", 11),
            border_width=0,
        ).grid(row=0, column=3, rowspan=2, padx=(0, Spacing.SM))

    def _add_repo(self):
        """Open dialog to add a new repo."""
        dialog = _RepoEditDialog(self, title="Add Repository")
        self.wait_window(dialog)
        if dialog.result:
            self._cfg.repos.append(dialog.result)
            self._rebuild_repo_list()
            self._dirty = True

    def _edit_repo(self, repo: RepoConfig, index: int):
        """Open dialog to edit an existing repo."""
        dialog = _RepoEditDialog(self, title="Edit Repository", repo=repo)
        self.wait_window(dialog)
        if dialog.result:
            self._cfg.repos[index] = dialog.result
            self._rebuild_repo_list()
            self._dirty = True

    def _remove_repo(self, index: int):
        """Remove a repo from the configuration."""
        if 0 <= index < len(self._cfg.repos):
            self._cfg.repos.pop(index)
            self._rebuild_repo_list()
            self._dirty = True

    # ── Save / Close ──

    def _save(self):
        """Validate and save settings."""
        try:
            interval = int(self._interval_var.get())
            max_size = int(self._maxsize_var.get())
            batch = int(self._batch_var.get())
            width = int(self._width_var.get())
            height = int(self._height_var.get())
        except ValueError:
            return  # Invalid input, don't save

        # Clamp values
        self._cfg.auto_check_interval_minutes = max(1, min(60, interval))
        self._cfg.max_file_size_mb = max(1, min(99, max_size))
        self._cfg.batch_size = max(5, min(500, batch))
        self._cfg.window_width = max(300, min(1920, width))
        self._cfg.window_height = max(400, min(1080, height))

        save_config(self._config_path, self._cfg)

        if self._on_save:
            self._on_save(self._cfg)

        self.destroy()

    def _close(self):
        self.destroy()


class _RepoEditDialog(ctk.CTkToplevel):
    """Dialog for adding or editing a repository configuration."""

    def __init__(self, parent, title: str = "Repository", repo: Optional[RepoConfig] = None):
        super().__init__(parent)
        self.result: Optional[RepoConfig] = None

        self.title(title)
        self.geometry("480x420")
        self.resizable(False, False)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Center
        self.update_idletasks()
        w, h = 480, 420
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        self.transient(parent)
        self.grab_set()

        self._repo = repo
        self._build_ui()
        self._set_dark_titlebar()

        self.bind("<Escape>", lambda _: self.destroy())
        self.bind("<Return>", lambda _: self._save())

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
        self.grid_rowconfigure(6, weight=1)
        self.grid_columnconfigure(0, weight=1)

        pad = Spacing.LG

        # Name
        ctk.CTkLabel(
            self, text="Name", font=Fonts.SMALL_BOLD, text_color=Colors.TEXT_SECONDARY,
        ).grid(row=0, column=0, sticky="w", padx=pad, pady=(pad, Spacing.XS))

        self._name_var = tk.StringVar(value=self._repo.name if self._repo else "")
        ctk.CTkEntry(
            self, textvariable=self._name_var, height=36, corner_radius=8,
            fg_color=Colors.BG_INPUT, border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY, font=Fonts.BODY,
            placeholder_text="My Project",
        ).grid(row=1, column=0, sticky="ew", padx=pad)

        # Path
        ctk.CTkLabel(
            self, text="Local Path", font=Fonts.SMALL_BOLD, text_color=Colors.TEXT_SECONDARY,
        ).grid(row=2, column=0, sticky="w", padx=pad, pady=(Spacing.MD, Spacing.XS))

        self._path_var = tk.StringVar(value=self._repo.path if self._repo else "")
        path_frame = ctk.CTkFrame(self, fg_color="transparent")
        path_frame.grid(row=3, column=0, sticky="ew", padx=pad)
        path_frame.grid_columnconfigure(0, weight=1)

        ctk.CTkEntry(
            path_frame, textvariable=self._path_var, height=36, corner_radius=8,
            fg_color=Colors.BG_INPUT, border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY, font=Fonts.MONO_SMALL,
            placeholder_text="C:\\Users\\you\\Projects\\MyProject",
        ).grid(row=0, column=0, sticky="ew")

        ctk.CTkButton(
            path_frame, text="\u2026", width=36, height=36, corner_radius=8,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY, font=("Segoe UI", 14),
            command=self._browse_path, border_width=0,
        ).grid(row=0, column=1, padx=(Spacing.XS, 0))

        # Remote
        ctk.CTkLabel(
            self, text="Remote URL", font=Fonts.SMALL_BOLD, text_color=Colors.TEXT_SECONDARY,
        ).grid(row=4, column=0, sticky="w", padx=pad, pady=(Spacing.MD, Spacing.XS))

        self._remote_var = tk.StringVar(value=self._repo.remote if self._repo else "")
        ctk.CTkEntry(
            self, textvariable=self._remote_var, height=36, corner_radius=8,
            fg_color=Colors.BG_INPUT, border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY, font=Fonts.MONO_SMALL,
            placeholder_text="https://github.com/you/my-project.git",
        ).grid(row=5, column=0, sticky="ew", padx=pad)

        # Icon & Color row
        opts = ctk.CTkFrame(self, fg_color="transparent")
        opts.grid(row=6, column=0, sticky="ew", padx=pad, pady=(Spacing.MD, 0))
        opts.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            opts, text="Icon", font=Fonts.SMALL_BOLD, text_color=Colors.TEXT_SECONDARY,
        ).grid(row=0, column=0, sticky="w")

        icon_names = list(REPO_ICONS.keys())
        self._icon_var = tk.StringVar(value=self._repo.icon if self._repo else "folder")
        self._icon_menu = ctk.CTkOptionMenu(
            opts,
            values=icon_names,
            variable=self._icon_var,
            fg_color=Colors.BG_TERTIARY,
            button_color=Colors.BG_HOVER,
            button_hover_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY,
            dropdown_fg_color=Colors.BG_SECONDARY,
            dropdown_hover_color=Colors.BG_HOVER,
            dropdown_text_color=Colors.TEXT_PRIMARY,
            height=32,
            width=120,
            corner_radius=8,
            font=Fonts.SMALL,
        )
        self._icon_menu.grid(row=0, column=1, sticky="w", padx=Spacing.MD)

        ctk.CTkLabel(
            opts, text="Color", font=Fonts.SMALL_BOLD, text_color=Colors.TEXT_SECONDARY,
        ).grid(row=0, column=2)

        self._color_var = tk.StringVar(value=self._repo.color if self._repo else "#7C5CBF")
        ctk.CTkEntry(
            opts, textvariable=self._color_var, width=90, height=32, corner_radius=8,
            fg_color=Colors.BG_INPUT, border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY, font=Fonts.MONO_SMALL,
        ).grid(row=0, column=3, padx=(Spacing.SM, 0))

        # Buttons
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.grid(row=7, column=0, sticky="e", padx=pad, pady=pad)

        ctk.CTkButton(
            btn_frame, text="Cancel", command=self.destroy,
            fg_color="transparent", hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY, border_width=1, border_color=Colors.BORDER,
            height=32, width=80, corner_radius=8, font=Fonts.SMALL_BOLD,
        ).pack(side="left", padx=(0, Spacing.SM))

        ctk.CTkButton(
            btn_frame, text="Save", command=self._save,
            fg_color=Colors.ACCENT, hover_color=Colors.ACCENT_HOVER,
            text_color="#FFFFFF", height=32, width=80, corner_radius=8,
            font=Fonts.SMALL_BOLD,
        ).pack(side="left")

    def _browse_path(self):
        from tkinter import filedialog
        path = filedialog.askdirectory(title="Select repository folder")
        if path:
            self._path_var.set(path)

    def _save(self):
        name = self._name_var.get().strip()
        path = self._path_var.get().strip()
        remote = self._remote_var.get().strip()

        if not name or not path:
            return

        self.result = RepoConfig(
            name=name,
            path=path,
            remote=remote,
            icon=self._icon_var.get(),
            color=self._color_var.get(),
        )
        self.destroy()
