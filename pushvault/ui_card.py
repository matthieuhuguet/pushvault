"""Repo card widget — repository status, actions, and error display."""

from __future__ import annotations

import subprocess
import tkinter as tk
from typing import TYPE_CHECKING, Optional

import customtkinter as ctk

from .models import RepoConfig, RepoStatus, SyncState
from .theme import (
    Colors,
    Fonts,
    REPO_ICONS,
    STATUS_COLORS,
    STATUS_ICONS,
    Spacing,
    hex_blend,
)

if TYPE_CHECKING:
    from .ui_main import PushVaultApp


class PillBadge(ctk.CTkFrame):
    def __init__(self, parent, text: str, color: str, **kwargs):
        super().__init__(parent, fg_color=Colors.BADGE_BG, corner_radius=10, height=20, **kwargs)
        ctk.CTkLabel(self, text=text, font=Fonts.TINY, text_color=color, height=18).pack(padx=8, pady=1)


class RepoCard(ctk.CTkFrame):
    """Repository card with status, actions, inline error, and staging button."""

    def __init__(self, parent, repo: RepoConfig, app: "PushVaultApp", **kwargs):
        super().__init__(
            parent,
            fg_color=Colors.BG_SECONDARY,
            corner_radius=16,
            border_width=0,
            **kwargs,
        )
        self.repo = repo
        self.app = app
        self.status = RepoStatus()
        self._checking = False
        self._spinner_angle = 0
        self._spinner_after_id: Optional[str] = None
        self._error_msg: str = ""

        # Flicker-prevention caches — skip re-layout when nothing changed
        self._last_btn_key: Optional[tuple] = None
        self._last_badges: Optional[list] = None
        self._status_frame_visible: Optional[bool] = None

        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)
        self._build_ui()

    def _on_enter(self, _=None):
        if self.status.state != SyncState.CHECKING:
            self.configure(fg_color=Colors.BG_HOVER)

    def _on_leave(self, _=None):
        self.configure(fg_color=Colors.BG_SECONDARY)

    def _apply_border_for_state(self):
        pass  # Borderless Spotify design — depth from bg color hierarchy

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)

        # ── Row 0: Icon + Name + Branch + Status icon ──
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", padx=Spacing.LG, pady=(Spacing.SM, Spacing.XS))
        header.grid_columnconfigure(1, weight=1)

        self._accent_dot = ctk.CTkLabel(
            header, text="●", font=("Segoe UI", 12),
            text_color=Colors.TEXT_TERTIARY, width=16,
        )
        self._accent_dot.grid(row=0, column=0, padx=(0, Spacing.SM))

        self._name_label = ctk.CTkLabel(
            header, text=self.repo.name,
            font=Fonts.BODY_BOLD, text_color=Colors.TEXT_PRIMARY, anchor="w",
        )
        self._name_label.grid(row=0, column=1, sticky="w")

        self._branch_label = ctk.CTkLabel(
            header, text="",
            font=Fonts.TINY, text_color=Colors.TEXT_TERTIARY,
        )
        self._branch_label.grid(row=0, column=2, padx=(Spacing.SM, 0))

        self._status_icon_label = ctk.CTkLabel(
            header, text="", font=Fonts.SMALL,
            text_color=Colors.TEXT_TERTIARY, width=20,
        )
        self._status_icon_label.grid(row=0, column=3, padx=(Spacing.XS, 0))

        # ── Row 1: Status label + badges (hidden when synced) ──
        self._status_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._status_frame.grid(row=1, column=0, sticky="ew", padx=Spacing.LG, pady=(0, Spacing.XS))

        self._status_label = ctk.CTkLabel(
            self._status_frame, text="Checking…",
            font=Fonts.SMALL, text_color=Colors.TEXT_SECONDARY, anchor="w",
        )
        self._status_label.pack(side="left")

        self._badges_frame = ctk.CTkFrame(self._status_frame, fg_color="transparent")
        self._badges_frame.pack(side="right")

        # ── Row 2: Action buttons ──
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.grid(row=2, column=0, sticky="ew", padx=Spacing.LG, pady=(0, Spacing.MD))

        btn_kw = dict(height=30, corner_radius=20, font=Fonts.SMALL_BOLD, border_width=0)

        self._push_btn = ctk.CTkButton(
            btn_frame, text="↑ Push",
            command=self._on_push,
            fg_color="#cd1504",
            hover_color="#a81003",
            text_color="#FFFFFF",
            width=76, **btn_kw,
        )
        self._push_btn.pack(side="left", padx=(0, Spacing.XS))

        self._pull_btn = ctk.CTkButton(
            btn_frame, text="↓ Pull",
            command=self._on_pull,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            width=68, **btn_kw,
        )
        self._pull_btn.pack(side="left", padx=(0, Spacing.XS))

        self._changes_btn = ctk.CTkButton(
            btn_frame, text="≡ Changes",
            command=self._on_changes,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            width=88, **btn_kw,
        )
        self._changes_btn.pack(side="left", padx=(0, Spacing.XS))

        self._conflict_btn = ctk.CTkButton(
            btn_frame, text="⚠ Resolve Conflicts",
            command=self._on_resolve,
            fg_color=Colors.ERROR_BG,
            hover_color=hex_blend(Colors.ERROR_BG, Colors.ERROR, 0.2),
            text_color=Colors.ERROR,
            width=152, **btn_kw,
        )
        # Hidden by default

        self._folder_btn = ctk.CTkButton(
            btn_frame, text="↗",
            command=self._on_open_folder,
            fg_color="transparent", hover_color=Colors.BG_TERTIARY,
            text_color=Colors.TEXT_TERTIARY,
            width=30, height=30, corner_radius=15,
            font=("Segoe UI", 12), border_width=0,
        )
        self._folder_btn.pack(side="right")

        # ── Row 3: Inline error message (hidden by default) ──
        self._error_frame = ctk.CTkFrame(
            self, fg_color=Colors.ERROR_BG,
            corner_radius=8, border_width=0,
        )
        self._error_label = ctk.CTkLabel(
            self._error_frame, text="",
            font=Fonts.SMALL, text_color=Colors.ERROR, anchor="w",
            wraplength=320,
        )
        self._error_label.pack(fill="x", padx=Spacing.SM, pady=Spacing.XS)

        # ── Row 4: Progress bar (hidden by default) ──
        self._progress = ctk.CTkProgressBar(
            self,
            fg_color=Colors.BG_PRIMARY,
            progress_color=Colors.SUCCESS,
            height=2, corner_radius=1,
        )
        self._progress.set(0)

    def update_status(self, status: RepoStatus) -> None:
        self.status = status
        state = status.state.value
        color = STATUS_COLORS.get(state, Colors.TEXT_TERTIARY)

        self._status_icon_label.configure(
            text=STATUS_ICONS.get(state, ""),
            text_color=color,
        )

        if status.branch:
            self._branch_label.configure(
                text=f"  {status.branch}",
                text_color=Colors.TEXT_TERTIARY,
            )

        # Status frame: only toggle grid when visibility actually changes
        should_show = (state != "synced")
        if should_show != self._status_frame_visible:
            self._status_frame_visible = should_show
            if should_show:
                self._status_frame.grid(row=1, column=0, sticky="ew", padx=Spacing.LG, pady=(0, Spacing.XS))
            else:
                self._status_frame.grid_remove()

        if should_show:
            if state == "conflict":
                self._status_label.configure(
                    text=f"{status.conflicts} conflict{'s' if status.conflicts != 1 else ''}",
                    text_color=Colors.ERROR,
                )
            elif state == "error":
                short_err = (status.error or status.label)[:80]
                self._status_label.configure(text=short_err, text_color=Colors.ERROR)
            elif state == "not_init":
                self._status_label.configure(
                    text="Not a git repo — run git init + add remote",
                    text_color=Colors.TEXT_TERTIARY,
                )
            else:
                self._status_label.configure(text=status.label or "", text_color=Colors.TEXT_SECONDARY)

        self._update_badges(status)
        self._update_button_layout(state, status.has_conflicts)

        # Accent dot color
        dot_color_map = {
            "synced":     Colors.SUCCESS,
            "conflict":   Colors.ERROR,
            "error":      Colors.ERROR,
            "needs_push": Colors.WARNING,
            "diverged":   Colors.WARNING,
            "needs_pull": Colors.ACCENT,
        }
        self._accent_dot.configure(
            text="●",
            text_color=dot_color_map.get(state, Colors.TEXT_TERTIARY),
        )

        self._apply_border_for_state()

        if state != "checking":
            self._stop_spinner()

        # Clear old inline error if status changed
        if state not in ("error",) and self._error_msg:
            self.set_error("")

    def _update_badges(self, status: RepoStatus) -> None:
        badges: list[tuple[str, str]] = []
        if status.staged > 0:
            badges.append((f"↑{status.staged}", Colors.ACCENT))
        if status.untracked > 0:
            badges.append((f"+{status.untracked}", Colors.SUCCESS))
        if status.modified > 0:
            badges.append((f"~{status.modified}", Colors.WARNING))
        if status.deleted > 0:
            badges.append((f"-{status.deleted}", Colors.ERROR))
        if status.ahead > 0:
            badges.append((f"↑{status.ahead}↑", Colors.INFO))
        if status.behind > 0:
            badges.append((f"↓{status.behind}", Colors.INFO))

        # Skip rebuild if badges haven't changed
        if self._last_badges == badges:
            return
        self._last_badges = badges

        for w in self._badges_frame.winfo_children():
            w.destroy()
        for text, color in badges:
            PillBadge(self._badges_frame, text, color).pack(side="left", padx=(Spacing.XS, 0))

    def _update_button_layout(self, state: str, has_conflicts: bool) -> None:
        key = (state, has_conflicts)

        # Skip re-layout if button config hasn't changed
        if self._last_btn_key == key:
            return
        self._last_btn_key = key

        self._push_btn.pack_forget()
        self._pull_btn.pack_forget()
        self._changes_btn.pack_forget()
        self._conflict_btn.pack_forget()

        if has_conflicts:
            self._conflict_btn.pack(side="left", padx=(0, Spacing.XS))
            self._changes_btn.pack(side="left", padx=(0, Spacing.XS))
        else:
            self._push_btn.pack(side="left", padx=(0, Spacing.XS))
            self._pull_btn.pack(side="left", padx=(0, Spacing.XS))
            self._changes_btn.pack(side="left", padx=(0, Spacing.XS))

    def set_push_success(self, msg: str) -> None:
        """Show a temporary success banner on the card for ~8 seconds."""
        self._status_label.configure(text=f"✓  {msg}", text_color=Colors.SUCCESS)
        self._accent_dot.configure(text="●", text_color=Colors.SUCCESS)
        # Restore real status after 8 s
        self.after(8000, self._restore_status_display)

    def _restore_status_display(self) -> None:
        """Revert the card display back to the cached git status."""
        # Reset caches so update_status re-applies everything cleanly after the banner
        self._last_btn_key = None
        self._last_badges = None
        self._status_frame_visible = None
        self.update_status(self.status)

    def set_error(self, msg: str) -> None:
        """Show or hide the inline error banner."""
        self._error_msg = msg
        if msg:
            self._error_label.configure(text=f"✗  {msg[:120]}")
            self._error_frame.grid(row=3, column=0, sticky="ew", padx=Spacing.MD, pady=(0, Spacing.XS))
        else:
            self._error_frame.grid_forget()

    def show_progress(self, value: float) -> None:
        if not self._progress.winfo_ismapped():
            self._progress.grid(row=4, column=0, sticky="ew", padx=0, pady=0)
        self._progress.set(value)

    def hide_progress(self) -> None:
        if self._progress.winfo_ismapped():
            self._progress.grid_forget()

    def set_checking(self, checking: bool) -> None:
        self._checking = checking
        if checking:
            self._start_spinner()
            self._status_label.configure(text="Checking…", text_color=Colors.TEXT_SECONDARY)
            # Clear badges only if there are any to avoid unnecessary redraws
            if self._badges_frame.winfo_children():
                for w in self._badges_frame.winfo_children():
                    w.destroy()
                self._last_badges = []
        else:
            self._stop_spinner()

    def _start_spinner(self) -> None:
        if self._spinner_after_id:
            self.after_cancel(self._spinner_after_id)
        frames = ["●", "○", "●", "○"]
        self._spinner_angle = (self._spinner_angle + 1) % len(frames)
        self._accent_dot.configure(text=frames[self._spinner_angle], text_color=Colors.ACCENT)
        self._spinner_after_id = self.after(400, self._start_spinner)

    def _stop_spinner(self) -> None:
        if self._spinner_after_id:
            self.after_cancel(self._spinner_after_id)
            self._spinner_after_id = None
        self._accent_dot.configure(text="●")

    def _on_push(self) -> None:
        self.app.push_repo(self.repo)

    def _on_pull(self) -> None:
        self.app.pull_repo(self.repo)

    def _on_changes(self) -> None:
        self.app.show_staging_panel(self.repo)

    def _on_resolve(self) -> None:
        self.app.show_conflict_dialog(self.repo)

    def _on_open_folder(self) -> None:
        try:
            subprocess.Popen(["explorer", self.repo.path], creationflags=0x08000000)
        except Exception:
            pass
