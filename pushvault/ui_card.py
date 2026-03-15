"""Repo card widget — clean utility card."""

from __future__ import annotations

import colorsys
import subprocess
import tkinter as tk
from typing import TYPE_CHECKING, Optional

import customtkinter as ctk

from .models import RepoConfig, RepoStatus, SyncState
from .theme import Colors, Fonts, REPO_ICONS, STATUS_ICONS, Spacing


def _gradient_pair(hex_color: str) -> tuple[str, str]:
    """Derive (top_color, bottom_color) gradient pair from a base hex color."""
    r = int(hex_color[1:3], 16) / 255.0
    g = int(hex_color[3:5], 16) / 255.0
    b = int(hex_color[5:7], 16) / 255.0
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    # Top: lighter, slightly desaturated, minor hue shift left
    h1 = (h - 0.03) % 1.0
    r1, g1, b1 = colorsys.hsv_to_rgb(h1, s * 0.60, min(v * 1.35, 1.0))
    # Bottom: darker, more saturated, minor hue shift right
    h2 = (h + 0.08) % 1.0
    r2, g2, b2 = colorsys.hsv_to_rgb(h2, min(s * 1.1, 1.0), v * 0.58)
    c1 = f"#{int(r1*255):02x}{int(g1*255):02x}{int(b1*255):02x}"
    c2 = f"#{int(r2*255):02x}{int(g2*255):02x}{int(b2*255):02x}"
    return c1, c2

if TYPE_CHECKING:
    from .ui_main import PushVaultApp


class RepoCard(ctk.CTkFrame):
    """Clean utility-style horizontal repo card."""

    CARD_H = 76
    ICON_W = 76
    BTN_W  = 88

    def __init__(self, parent, repo: RepoConfig, app: "PushVaultApp", **kwargs):
        super().__init__(
            parent,
            fg_color=Colors.CARD_BG,
            corner_radius=8,
            height=self.CARD_H,
            **kwargs,
        )
        self.repo   = repo
        self.app    = app
        self.status = RepoStatus()

        self._checking          = False
        self._spinner_angle     = 0
        self._spinner_after_id: Optional[str] = None
        self._error_msg: str    = ""

        self.pack_propagate(False)
        self.bind("<Enter>",    self._on_enter)
        self.bind("<Leave>",    self._on_leave)
        self.bind("<Button-3>", self._show_context_menu)
        self.bind("<Button-1>", self._on_click)
        self._build_ui()

    # ── Hover ─────────────────────────────────────────────────────

    def _on_enter(self, _=None):
        self.configure(fg_color=Colors.CARD_HOVER)

    def _on_leave(self, _=None):
        self.configure(fg_color=Colors.CARD_BG)

    # ── Layout ────────────────────────────────────────────────────

    def _build_ui(self):
        accent = self.repo.color or Colors.ACCENT

        # ── Left: gradient icon block ──────────────────────────────
        c1, c2 = _gradient_pair(accent)
        r1, g1, b1 = int(c1[1:3], 16), int(c1[3:5], 16), int(c1[5:7], 16)
        r2, g2, b2 = int(c2[1:3], 16), int(c2[3:5], 16), int(c2[5:7], 16)

        thumb = tk.Canvas(
            self,
            width=self.ICON_W, height=self.CARD_H,
            highlightthickness=0, bd=0,
            bg=Colors.CARD_BG,
        )
        # place() not pack() — pixel-perfect flush positioning at (0,0)
        thumb.place(x=0, y=0, width=self.ICON_W, height=self.CARD_H)

        # 45° diagonal gradient: lines where x+y = d
        n = self.ICON_W  # square (ICON_W == CARD_H)
        total = 2 * (n - 1)
        for d in range(total + 1):
            t = d / total
            rv = int(r1 + (r2 - r1) * t)
            gv = int(g1 + (g2 - g1) * t)
            bv = int(b1 + (b2 - b1) * t)
            color = f"#{rv:02x}{gv:02x}{bv:02x}"
            if d < n:
                thumb.create_line(0, d, d, 0, fill=color)
            else:
                thumb.create_line(d - n + 1, n - 1, n - 1, d - n + 1, fill=color)

        # Round left corners to match CTkFrame corner_radius=8
        cr = 8
        # Top-left
        thumb.create_rectangle(0, 0, cr, cr, fill=Colors.CARD_BG, outline="")
        thumb.create_arc(0, 0, cr * 2, cr * 2, start=90, extent=90, fill=c1, outline=c1)
        # Bottom-left
        thumb.create_rectangle(0, self.CARD_H - cr, cr, self.CARD_H, fill=Colors.CARD_BG, outline="")
        thumb.create_arc(0, self.CARD_H - cr * 2, cr * 2, self.CARD_H, start=180, extent=90, fill=c2, outline=c2)

        initial = (self.repo.name[0].upper()) if self.repo.name else "?"
        thumb.create_text(
            self.ICON_W // 2, self.CARD_H // 2,
            text=initial,
            font=("Segoe UI Variable", 30, "bold"),
            fill="#FFFFFF",
            anchor="center",
        )

        for ev, fn in [("<Enter>", self._on_enter), ("<Button-1>", self._on_click),
                       ("<Button-3>", self._show_context_menu)]:
            thumb.bind(ev, fn)

        # ── Right: action button (always visible) ─────────────────
        self._action_btn = ctk.CTkButton(
            self,
            text="↑ Push",
            font=Fonts.SMALL_BOLD,
            fg_color=Colors.ACCENT,
            hover_color=Colors.ACCENT_HOVER,
            text_color=Colors.TEXT_INVERSE,
            width=90, height=34,
            corner_radius=8,
            border_width=0,
            command=self._on_action,
        )
        self._action_btn.pack(side="right", padx=(8, 14))

        # ── Middle: text info ──────────────────────────────────────
        info = ctk.CTkFrame(self, fg_color="transparent")
        info.pack(side="left", fill="both", expand=True, padx=(self.ICON_W + 12, 4))
        for ev, fn in [("<Enter>", self._on_enter), ("<Button-1>", self._on_click)]:
            info.bind(ev, fn)

        # Name
        self._name_label = ctk.CTkLabel(
            info, text=self.repo.name,
            font=Fonts.BODY_BOLD,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        )
        self._name_label.pack(fill="x", pady=(10, 2))
        self._name_label.bind("<Enter>",    self._on_enter)
        self._name_label.bind("<Button-1>", self._on_click)

        # Status + meta row
        status_row = ctk.CTkFrame(info, fg_color="transparent")
        status_row.pack(fill="x")
        status_row.bind("<Enter>", self._on_enter)

        self._status_label = ctk.CTkLabel(
            status_row, text="Checking…",
            font=Fonts.SMALL,
            text_color=Colors.TEXT_SECONDARY,
            anchor="w",
        )
        self._status_label.pack(side="left")

        self._meta_label = ctk.CTkLabel(
            status_row, text="",
            font=Fonts.TINY,
            text_color=Colors.TEXT_TERTIARY,
            anchor="w",
        )
        self._meta_label.pack(side="left", padx=(10, 0))

        # ── Error bar (hidden) ────────────────────────────────────
        self._error_frame = ctk.CTkFrame(
            self, fg_color=Colors.ERROR_BG, corner_radius=0,
        )
        self._error_label = ctk.CTkLabel(
            self._error_frame, text="",
            font=Fonts.TINY, text_color=Colors.ERROR, anchor="w",
        )
        self._error_label.pack(fill="x", padx=8, pady=2)

        # ── Progress bar (hidden) ─────────────────────────────────
        self._progress = ctk.CTkProgressBar(
            self,
            fg_color=Colors.BG_PRIMARY,
            progress_color=Colors.ACCENT,
            height=2, corner_radius=0,
        )
        self._progress.set(0)

    # ── Status update ─────────────────────────────────────────────

    def update_status(self, status: RepoStatus) -> None:
        self.status = status
        state = status.state.value

        # Meta line: branch · last commit
        meta_parts = []
        if status.branch:
            meta_parts.append(status.branch)
        if status.last_commit_time:
            meta_parts.append(status.last_commit_time)
        self._meta_label.configure(text="  ·  ".join(meta_parts))

        icon = STATUS_ICONS.get(state, "")

        if state == "synced":
            self._status_label.configure(
                text=f"{icon} Synced", text_color=Colors.SUCCESS)
            self._action_btn.configure(
                text="↑ Push",
                fg_color=Colors.BG_ELEVATED,
                hover_color=Colors.BG_TERTIARY,
            )

        elif state == "needs_push":
            detail = status.label or "pending changes"
            self._status_label.configure(
                text=f"{icon} {detail}", text_color=Colors.WARNING)
            self._action_btn.configure(
                text="↑ Push",
                fg_color=Colors.ACCENT,
                hover_color=Colors.ACCENT_HOVER,
            )

        elif state == "needs_pull":
            detail = status.label or f"{status.behind} behind"
            self._status_label.configure(
                text=f"{icon} {detail}", text_color=Colors.INFO)
            self._action_btn.configure(
                text="↓ Pull",
                fg_color=Colors.INFO,
                hover_color="#3A6EA8",
            )

        elif state == "diverged":
            detail = status.label or "diverged"
            self._status_label.configure(
                text=f"{icon} {detail}", text_color=Colors.WARNING)
            self._action_btn.configure(
                text="↑ Push",
                fg_color=Colors.WARNING,
                hover_color="#C48820",
            )

        elif state == "conflict":
            n = status.conflicts
            self._status_label.configure(
                text=f"{icon} {n} conflict{'s' if n != 1 else ''}",
                text_color=Colors.ERROR,
            )
            self._action_btn.configure(
                text="⚠ Resolve",
                fg_color=Colors.ERROR,
                hover_color="#C04040",
            )

        elif state == "error":
            short = (status.error or status.label)[:60]
            self._status_label.configure(
                text=f"{icon} {short}", text_color=Colors.ERROR)
            self._action_btn.configure(
                text="↑ Push",
                fg_color=Colors.BG_ELEVATED,
                hover_color=Colors.BG_TERTIARY,
            )

        elif state == "not_init":
            self._status_label.configure(
                text="Not initialized", text_color=Colors.TEXT_TERTIARY)
            self._action_btn.configure(
                text="Init",
                fg_color=Colors.BG_ELEVATED,
                hover_color=Colors.BG_TERTIARY,
            )

        else:
            self._status_label.configure(
                text=status.label or "Checking…",
                text_color=Colors.TEXT_SECONDARY,
            )

        if state != "checking":
            self._stop_spinner()
        if state not in ("error",) and self._error_msg:
            self.set_error("")

    def set_push_success(self, msg: str) -> None:
        self._status_label.configure(text=f"✓ {msg}", text_color=Colors.SUCCESS)
        self.after(8000, self._restore_status)

    def _restore_status(self) -> None:
        self.update_status(self.status)

    def set_error(self, msg: str) -> None:
        self._error_msg = msg
        if msg:
            self._error_label.configure(text=msg[:100])
            self._error_frame.pack(side="bottom", fill="x")
            self.configure(height=self.CARD_H + 20)
        else:
            self._error_frame.pack_forget()
            self.configure(height=self.CARD_H)

    def show_progress(self, value: float) -> None:
        if not self._progress.winfo_ismapped():
            self._progress.pack(side="bottom", fill="x")
        self._progress.set(value)

    def hide_progress(self) -> None:
        if self._progress.winfo_ismapped():
            self._progress.pack_forget()

    def set_checking(self, checking: bool) -> None:
        self._checking = checking
        if checking:
            self._start_spinner()
            self._status_label.configure(
                text="Checking…", text_color=Colors.TEXT_SECONDARY)
        else:
            self._stop_spinner()

    def _start_spinner(self) -> None:
        if self._spinner_after_id:
            self.after_cancel(self._spinner_after_id)
        chars = ["·", "•", "●", "•"]
        self._spinner_angle = (self._spinner_angle + 1) % len(chars)
        self._status_label.configure(
            text=f"{chars[self._spinner_angle]} Checking…",
            text_color=Colors.TEXT_SECONDARY,
        )
        self._spinner_after_id = self.after(350, self._start_spinner)

    def _stop_spinner(self) -> None:
        if self._spinner_after_id:
            self.after_cancel(self._spinner_after_id)
            self._spinner_after_id = None

    # ── Actions ───────────────────────────────────────────────────

    def _on_action(self) -> None:
        state = self.status.state
        if state == SyncState.NEEDS_PULL:
            self.app.pull_repo(self.repo)
        elif state == SyncState.CONFLICT:
            self.app.show_conflict_dialog(self.repo)
        else:
            self.app.push_repo(self.repo)

    def _on_click(self, _=None) -> None:
        self.app.show_staging_panel(self.repo)

    def _on_open_folder(self) -> None:
        try:
            subprocess.Popen(["explorer", self.repo.path], creationflags=0x08000000)
        except Exception:
            pass

    # ── Context menu ──────────────────────────────────────────────

    def _show_context_menu(self, event=None) -> None:
        menu = tk.Menu(
            self, tearoff=0,
            bg=Colors.BG_ELEVATED, fg=Colors.TEXT_PRIMARY,
            activebackground=Colors.ACCENT, activeforeground="#FFFFFF",
            font=("Segoe UI Variable", 10), relief="flat", bd=0,
        )
        menu.add_command(label="↑  Push",        command=lambda: self.app.push_repo(self.repo))
        menu.add_command(label="↓  Pull",        command=lambda: self.app.pull_repo(self.repo))
        menu.add_separator()
        menu.add_command(label="≡  View Changes",   command=lambda: self.app.show_staging_panel(self.repo))
        menu.add_command(label="⏳  History",        command=lambda: self.app.show_history_panel(self.repo))
        menu.add_command(label="📦  Stash",          command=lambda: self.app.show_stash_panel(self.repo))
        menu.add_separator()
        menu.add_command(label="↗  Open Folder",    command=self._on_open_folder)
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()
