"""Toast notification system — non-blocking, auto-dismissing feedback.

Toasts slide in from the bottom-right of the main window, stack vertically,
and auto-dismiss after a configurable duration. Supports success, error,
warning, and info levels with matching colors and icons.
"""

from __future__ import annotations

import tkinter as tk
from typing import Optional

import customtkinter as ctk

from .theme import Colors, Fonts, Spacing


class _Toast(ctk.CTkFrame):
    """A single toast notification widget."""

    LEVEL_CONFIG = {
        "success": {"icon": "\u2713", "color": Colors.SUCCESS, "bg": Colors.SUCCESS_BG},
        "error":   {"icon": "\u2717", "color": Colors.ERROR,   "bg": Colors.ERROR_BG},
        "warning": {"icon": "\u26A0", "color": Colors.WARNING, "bg": Colors.WARNING_BG},
        "info":    {"icon": "\u2139", "color": Colors.ACCENT,  "bg": Colors.ACCENT_BG},
    }

    def __init__(
        self,
        parent,
        message: str,
        level: str = "info",
        duration_ms: int = 4000,
        on_dismiss: Optional[callable] = None,
    ):
        cfg = self.LEVEL_CONFIG.get(level, self.LEVEL_CONFIG["info"])

        super().__init__(
            parent,
            fg_color=cfg["bg"],
            corner_radius=12,
            border_width=1,
            border_color=cfg["color"],
        )

        self._on_dismiss = on_dismiss
        self._duration_ms = duration_ms
        self._fade_after_id: Optional[str] = None
        self._alpha = 1.0

        # Layout
        self.grid_columnconfigure(1, weight=1)

        # Icon
        ctk.CTkLabel(
            self,
            text=cfg["icon"],
            font=("Segoe UI", 14, "bold"),
            text_color=cfg["color"],
            width=24,
        ).grid(row=0, column=0, padx=(Spacing.MD, Spacing.SM), pady=Spacing.SM)

        # Message
        ctk.CTkLabel(
            self,
            text=message,
            font=Fonts.SMALL,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
            wraplength=280,
        ).grid(row=0, column=1, sticky="w", padx=(0, Spacing.SM), pady=Spacing.SM)

        # Close button
        close_btn = ctk.CTkButton(
            self,
            text="\u2715",
            command=self.dismiss,
            fg_color="transparent",
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_TERTIARY,
            width=24,
            height=24,
            corner_radius=6,
            font=("Segoe UI", 10),
            border_width=0,
        )
        close_btn.grid(row=0, column=2, padx=(0, Spacing.SM), pady=Spacing.SM)

        # Auto-dismiss timer
        if duration_ms > 0:
            self._fade_after_id = self.after(duration_ms, self._start_fade)

    def _start_fade(self) -> None:
        """Begin fade-out animation."""
        self._alpha -= 0.15
        if self._alpha <= 0:
            self.dismiss()
            return
        # Simulate fade by progressively dimming
        try:
            self.configure(border_width=0)
            self._fade_after_id = self.after(50, self._start_fade)
        except Exception:
            self.dismiss()

    def dismiss(self) -> None:
        """Remove this toast."""
        if self._fade_after_id:
            try:
                self.after_cancel(self._fade_after_id)
            except Exception:
                pass
            self._fade_after_id = None
        if self._on_dismiss:
            self._on_dismiss(self)
        try:
            self.destroy()
        except Exception:
            pass


class ToastManager:
    """Manages toast notifications for the main window.

    Usage:
        toasts = ToastManager(main_window)
        toasts.show("File pushed successfully", "success")
        toasts.show("Connection failed", "error", duration_ms=6000)
    """

    MAX_VISIBLE = 5

    def __init__(self, parent: ctk.CTk):
        self._parent = parent
        self._toasts: list[_Toast] = []

        # Container frame positioned at bottom-right
        self._container = ctk.CTkFrame(parent, fg_color="transparent")
        self._container.place(relx=1.0, rely=1.0, anchor="se", x=-Spacing.MD, y=-Spacing.XL)

    def show(
        self,
        message: str,
        level: str = "info",
        duration_ms: int = 4000,
    ) -> None:
        """Show a toast notification."""
        # Limit visible toasts
        while len(self._toasts) >= self.MAX_VISIBLE:
            oldest = self._toasts[0]
            oldest.dismiss()

        toast = _Toast(
            self._container,
            message=message,
            level=level,
            duration_ms=duration_ms,
            on_dismiss=self._on_toast_dismiss,
        )
        toast.pack(side="bottom", pady=(0, Spacing.XS), fill="x")
        self._toasts.append(toast)

        # Configure minimum width
        toast.configure(width=320)

    def _on_toast_dismiss(self, toast: _Toast) -> None:
        """Handle toast dismissal."""
        if toast in self._toasts:
            self._toasts.remove(toast)

    def clear_all(self) -> None:
        """Dismiss all visible toasts."""
        for toast in list(self._toasts):
            toast.dismiss()
