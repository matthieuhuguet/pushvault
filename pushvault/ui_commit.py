"""Commit message dialog — custom message input before push.

Quick dialog that appears when the user wants to write a custom commit
message instead of the auto-generated PushVault timestamp message.
Supports Shift+Enter for multi-line messages.
"""

from __future__ import annotations

import tkinter as tk
from typing import Callable, Optional

import customtkinter as ctk

from .theme import Colors, Fonts, Spacing, hex_blend


class CommitMessageDialog(ctk.CTkToplevel):
    """Modal dialog for entering a custom commit message before push."""

    def __init__(
        self,
        parent: ctk.CTk,
        repo_name: str,
        file_count: int = 0,
        on_confirm: Optional[Callable[[str], None]] = None,
    ):
        super().__init__(parent)
        self._on_confirm = on_confirm
        self.result: Optional[str] = None

        self.title(f"Commit — {repo_name}")
        self.geometry("440x280")
        self.resizable(False, False)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Center
        self.update_idletasks()
        w, h = 440, 280
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        self.transient(parent)
        self.grab_set()

        self._build_ui(repo_name, file_count)
        self._set_dark_titlebar()
        self.focus_force()

        self.bind("<Escape>", lambda _: self._cancel())

    def _set_dark_titlebar(self):
        try:
            import ctypes
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, 20, ctypes.byref(ctypes.c_int(1)), ctypes.sizeof(ctypes.c_int)
            )
        except Exception:
            pass

    def _build_ui(self, repo_name: str, file_count: int):
        pad = Spacing.LG

        # Header
        header = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, height=44, corner_radius=0)
        header.pack(fill="x")

        ctk.CTkLabel(
            header,
            text=f"\u270E  Commit to {repo_name}",
            font=Fonts.BODY_BOLD,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        ).pack(side="left", padx=pad, pady=Spacing.MD)

        if file_count > 0:
            ctk.CTkLabel(
                header,
                text=f"{file_count} file{'s' if file_count != 1 else ''}",
                font=Fonts.TINY,
                text_color=Colors.TEXT_TERTIARY,
            ).pack(side="right", padx=pad)

        # Message input
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.pack(fill="both", expand=True, padx=pad, pady=pad)

        ctk.CTkLabel(
            content,
            text="Commit message",
            font=Fonts.SMALL_BOLD,
            text_color=Colors.TEXT_SECONDARY,
        ).pack(anchor="w", pady=(0, Spacing.XS))

        self._text = ctk.CTkTextbox(
            content,
            height=100,
            corner_radius=8,
            fg_color=Colors.BG_INPUT,
            border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY,
            font=Fonts.BODY,
            border_width=1,
            wrap="word",
        )
        self._text.pack(fill="both", expand=True)
        self._text.focus_set()

        # Bind Ctrl+Enter to confirm
        self._text.bind("<Control-Return>", lambda _: self._confirm())

        ctk.CTkLabel(
            content,
            text="Ctrl+Enter to commit  \u00B7  Esc to cancel",
            font=Fonts.TINY,
            text_color=Colors.TEXT_TERTIARY,
        ).pack(anchor="w", pady=(Spacing.XS, 0))

        # Footer buttons
        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.pack(fill="x", padx=pad, pady=(0, pad))

        ctk.CTkButton(
            footer, text="Cancel", command=self._cancel,
            fg_color="transparent", hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY, border_width=1, border_color=Colors.BORDER,
            height=32, width=80, corner_radius=8, font=Fonts.SMALL_BOLD,
        ).pack(side="right", padx=(Spacing.SM, 0))

        ctk.CTkButton(
            footer, text="\u2191  Commit & Push", command=self._confirm,
            fg_color=Colors.ACCENT, hover_color=hex_blend(Colors.ACCENT, "#FFFFFF", 0.15),
            text_color=Colors.TEXT_INVERSE,
            height=32, width=140, corner_radius=8, font=Fonts.SMALL_BOLD,
        ).pack(side="right")

        # Auto-push (skip message)
        ctk.CTkButton(
            footer, text="Auto", command=self._auto_push,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_TERTIARY,
            height=32, width=50, corner_radius=8, font=Fonts.SMALL,
            border_width=0,
        ).pack(side="left")

    def _confirm(self):
        msg = self._text.get("1.0", "end").strip()
        self.result = msg if msg else None
        if self._on_confirm:
            self._on_confirm(msg)
        self.destroy()

    def _auto_push(self):
        """Push with auto-generated message."""
        self.result = ""
        if self._on_confirm:
            self._on_confirm("")
        self.destroy()

    def _cancel(self):
        self.result = None
        self.destroy()
