"""Staging area management panel — GitHub Desktop-style file status viewer.

Shows 4 sections:
  STAGED     — files in index, ready to commit
  MODIFIED   — tracked files with unstaged changes
  UNTRACKED  — new files not in index
  CONFLICTED — merge conflicts (links to ConflictDialog)

Per-file actions: Stage / Unstage / Discard / Open in editor
"""

from __future__ import annotations

import os
import subprocess
import tkinter as tk
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Optional

import customtkinter as ctk

from .git_engine import (
    DetailedStatus,
    FileEntry,
    delete_untracked,
    discard_file,
    get_detailed_status,
    get_diff,
    stage_all,
    stage_file,
    unstage_all,
    unstage_file,
)
from .models import RepoConfig
from .theme import Colors, Fonts, Spacing, hex_blend

if TYPE_CHECKING:
    from .ui_main import PushVaultApp


class _SectionHeader(ctk.CTkFrame):
    """Collapsible section header with file count badge."""

    def __init__(self, parent, title: str, count: int, color: str,
                 collapsed: bool = False, on_toggle: Optional[Callable] = None):
        super().__init__(parent, fg_color="transparent", height=28)
        self.grid_columnconfigure(1, weight=1)
        self._collapsed = collapsed
        self._on_toggle = on_toggle

        self._arrow = ctk.CTkLabel(
            self,
            text="▾" if not collapsed else "▸",
            font=Fonts.SMALL,
            text_color=Colors.TEXT_TERTIARY,
            width=16,
            cursor="hand2",
        )
        self._arrow.grid(row=0, column=0, padx=(0, Spacing.XS))

        ctk.CTkLabel(
            self,
            text=title.upper(),
            font=Fonts.SMALL_BOLD,
            text_color=color,
            anchor="w",
        ).grid(row=0, column=1, sticky="w")

        if count > 0:
            badge_bg = hex_blend(color, Colors.BG_PRIMARY, 0.8)
            badge = ctk.CTkFrame(self, fg_color=badge_bg, corner_radius=8, height=18)
            badge.grid(row=0, column=2, padx=Spacing.SM)
            ctk.CTkLabel(badge, text=str(count), font=Fonts.TINY, text_color=color).pack(padx=6)

        self._arrow.bind("<Button-1>", self._toggle)
        self.bind("<Button-1>", self._toggle)

    def _toggle(self, _=None):
        self._collapsed = not self._collapsed
        self._arrow.configure(text="▸" if self._collapsed else "▾")
        if self._on_toggle:
            self._on_toggle(self._collapsed)


class _FileRow(ctk.CTkFrame):
    """One file row with icon, path, action buttons."""

    def __init__(self, parent, fe: FileEntry, repo_path: str,
                 on_action: Callable[[str, FileEntry], None],
                 on_preview: Callable[[FileEntry, bool], None],
                 section: str):
        super().__init__(
            parent,
            fg_color=Colors.BG_TERTIARY,
            corner_radius=6,
            border_width=0,
        )
        self.grid_columnconfigure(1, weight=1)
        self._fe = fe
        self._repo_path = repo_path
        self._on_action = on_action
        self._on_preview = on_preview
        self._section = section

        self.bind("<Enter>", self._hover_on)
        self.bind("<Leave>", self._hover_off)
        self.bind("<Button-1>", self._click)

        self._build()

    def _hover_on(self, _=None):
        self.configure(fg_color=Colors.BG_HOVER)

    def _hover_off(self, _=None):
        self.configure(fg_color=Colors.BG_TERTIARY)

    def _click(self, _=None):
        staged = self._section == "staged"
        self._on_preview(self._fe, staged)

    def _build(self):
        fe = self._fe
        # Icon based on status
        icon_map = {
            "M": ("\u270E", Colors.WARNING),   # ✎ modified
            "A": ("+", Colors.SUCCESS),
            "D": ("-", Colors.ERROR),
            "R": ("\u21B5", Colors.INFO),      # ↵ renamed
            "?": ("\u25CB", Colors.TEXT_TERTIARY),  # ○ untracked
            "U": ("\u26A0", Colors.ERROR),     # ⚠ conflict
        }
        xy = fe.index_status + fe.worktree_status
        # Pick the most meaningful char
        char = fe.index_status if fe.index_status not in (" ", "?") else fe.worktree_status
        icon_text, icon_color = icon_map.get(char, ("\u25A1", Colors.TEXT_TERTIARY))

        ctk.CTkLabel(
            self,
            text=icon_text,
            font=Fonts.SMALL_BOLD,
            text_color=icon_color,
            width=18,
        ).grid(row=0, column=0, padx=(Spacing.SM, Spacing.XS), pady=4)

        # File path — basename bold, dirname dim
        dirname = os.path.dirname(fe.path)
        basename = os.path.basename(fe.path)
        path_text = f"{basename}  {dirname}" if dirname else basename

        path_lbl = ctk.CTkLabel(
            self,
            text=path_text,
            font=Fonts.SMALL,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
            cursor="hand2",
        )
        path_lbl.grid(row=0, column=1, sticky="w", padx=Spacing.XS)
        path_lbl.bind("<Button-1>", self._click)

        # Action buttons (shown on hover via frame)
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.grid(row=0, column=2, padx=(0, Spacing.XS))

        kw = dict(height=22, corner_radius=5, font=Fonts.TINY, border_width=0)

        if self._section == "staged":
            ctk.CTkButton(
                btn_frame, text="Unstage",
                command=lambda: self._on_action("unstage", fe),
                fg_color=Colors.BG_HOVER, hover_color=Colors.BORDER,
                text_color=Colors.TEXT_SECONDARY, width=58, **kw,
            ).pack(side="left", padx=2)

        elif self._section == "unstaged":
            ctk.CTkButton(
                btn_frame, text="Stage",
                command=lambda: self._on_action("stage", fe),
                fg_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.7),
                hover_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.5),
                text_color=Colors.SUCCESS, width=50, **kw,
            ).pack(side="left", padx=2)
            ctk.CTkButton(
                btn_frame, text="Discard",
                command=lambda: self._on_action("discard", fe),
                fg_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.8),
                hover_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.6),
                text_color=Colors.ERROR, width=56, **kw,
            ).pack(side="left", padx=2)

        elif self._section == "untracked":
            ctk.CTkButton(
                btn_frame, text="Stage",
                command=lambda: self._on_action("stage", fe),
                fg_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.7),
                hover_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.5),
                text_color=Colors.SUCCESS, width=50, **kw,
            ).pack(side="left", padx=2)
            ctk.CTkButton(
                btn_frame, text="Delete",
                command=lambda: self._on_action("delete_untracked", fe),
                fg_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.8),
                hover_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.6),
                text_color=Colors.ERROR, width=50, **kw,
            ).pack(side="left", padx=2)

        elif self._section == "conflicted":
            ctk.CTkButton(
                btn_frame, text="Resolve",
                command=lambda: self._on_action("resolve_conflict", fe),
                fg_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.7),
                hover_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.5),
                text_color=Colors.ERROR, width=62, **kw,
            ).pack(side="left", padx=2)

        # Open in editor button
        ctk.CTkButton(
            btn_frame, text="\u2197",
            command=lambda: self._open_in_editor(),
            fg_color="transparent", hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_TERTIARY, width=26, height=22,
            corner_radius=5, font=("Segoe UI", 11), border_width=0,
        ).pack(side="left", padx=1)

    def _open_in_editor(self):
        full = Path(self._repo_path) / self._fe.path
        if full.exists():
            try:
                os.startfile(str(full))
            except Exception:
                subprocess.Popen(["notepad", str(full)], creationflags=0x08000000)


class StagingPanel(ctk.CTkToplevel):
    """
    Full staging area management window.
    Shows staged / unstaged / untracked / conflicted files
    with per-file and bulk actions. Diff preview on right panel.
    """

    def __init__(
        self,
        parent,
        repo: RepoConfig,
        on_close: Optional[Callable] = None,
        log: Optional[Callable[[str, str], None]] = None,
    ):
        super().__init__(parent)
        self.repo = repo
        self._on_close = on_close
        self._log = log
        self._status: Optional[DetailedStatus] = None

        self.title(f"Changes — {repo.name}")
        self.geometry("920x680")
        self.minsize(700, 500)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Center
        self.update_idletasks()
        w, h = 920, 680
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        self._build_ui()
        self._set_dark_titlebar()
        self.focus_force()
        self.bind("<Escape>", lambda _: self.destroy())
        self.bind("<F5>", lambda _: self._refresh())
        self.protocol("WM_DELETE_WINDOW", self._close)

        self.after(50, self._refresh)

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
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=0)
        self.grid_columnconfigure(1, weight=1)

        # ── Left: file list ──
        self._left = ctk.CTkFrame(
            self, fg_color=Colors.BG_SECONDARY, corner_radius=0, width=340
        )
        self._left.grid(row=0, column=0, sticky="nsew")
        self._left.grid_rowconfigure(1, weight=1)
        self._left.grid_propagate(False)
        self._left.configure(width=340)

        # Left header
        lh = ctk.CTkFrame(self._left, fg_color=Colors.BG_TERTIARY, height=44, corner_radius=0)
        lh.grid(row=0, column=0, sticky="ew")
        lh.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            lh,
            text=f"{self.repo.name}  Changes",
            font=Fonts.BODY_BOLD,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        ).grid(row=0, column=0, sticky="w", padx=Spacing.LG, pady=Spacing.MD)

        self._refresh_btn = ctk.CTkButton(
            lh,
            text="\u21BB",
            command=self._refresh,
            fg_color="transparent",
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            width=28, height=28, corner_radius=6, font=("Segoe UI", 13), border_width=0,
        )
        self._refresh_btn.grid(row=0, column=1, padx=(0, Spacing.MD))

        # Scrollable file list
        self._list_scroll = ctk.CTkScrollableFrame(
            self._left,
            fg_color="transparent",
            scrollbar_button_color=Colors.SCROLLBAR,
            scrollbar_button_hover_color=Colors.SCROLLBAR_HOVER,
        )
        self._list_scroll.grid(row=1, column=0, sticky="nsew")
        self._list_scroll.grid_columnconfigure(0, weight=1)

        # Left footer: bulk actions
        lf = ctk.CTkFrame(self._left, fg_color=Colors.BG_TERTIARY, height=44, corner_radius=0)
        lf.grid(row=2, column=0, sticky="ew")

        kw_bulk = dict(height=26, corner_radius=6, font=Fonts.SMALL, border_width=0)
        ctk.CTkButton(
            lf, text="Stage All",
            command=self._stage_all,
            fg_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.7),
            hover_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.5),
            text_color=Colors.SUCCESS, width=80, **kw_bulk,
        ).pack(side="left", padx=(Spacing.MD, Spacing.XS), pady=Spacing.SM)

        ctk.CTkButton(
            lf, text="Unstage All",
            command=self._unstage_all,
            fg_color="transparent",
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY, width=80, **kw_bulk,
        ).pack(side="left", padx=Spacing.XS)

        # ── Right: diff viewer ──
        self._right = ctk.CTkFrame(
            self, fg_color=Colors.BG_PRIMARY, corner_radius=0
        )
        self._right.grid(row=0, column=1, sticky="nsew")
        self._right.grid_rowconfigure(1, weight=1)
        self._right.grid_columnconfigure(0, weight=1)

        # Diff header
        dh = ctk.CTkFrame(self._right, fg_color=Colors.BG_TERTIARY, height=44, corner_radius=0)
        dh.grid(row=0, column=0, sticky="ew")
        dh.grid_columnconfigure(0, weight=1)

        self._diff_path_label = ctk.CTkLabel(
            dh,
            text="Select a file to preview changes",
            font=Fonts.MONO_SMALL,
            text_color=Colors.TEXT_SECONDARY,
            anchor="w",
        )
        self._diff_path_label.grid(row=0, column=0, sticky="w", padx=Spacing.LG)

        self._staged_toggle_var = tk.BooleanVar(value=False)
        self._staged_toggle = ctk.CTkCheckBox(
            dh,
            text="Staged",
            variable=self._staged_toggle_var,
            command=self._toggle_staged_diff,
            font=Fonts.SMALL,
            text_color=Colors.TEXT_SECONDARY,
            checkmark_color=Colors.SUCCESS,
            fg_color=Colors.ACCENT,
            hover_color=Colors.ACCENT_HOVER,
            width=16, height=16,
        )
        self._staged_toggle.grid(row=0, column=1, padx=Spacing.MD)

        # Diff text widget
        diff_container = tk.Frame(self._right, bg=Colors.BG_PRIMARY)
        diff_container.grid(row=1, column=0, sticky="nsew")

        self._right.grid_rowconfigure(1, weight=1)

        diff_container.rowconfigure(0, weight=1)
        diff_container.columnconfigure(0, weight=1)

        self._diff_text = tk.Text(
            diff_container,
            wrap="none",
            font=(Fonts.MONO[0], Fonts.MONO[1]),
            bg=Colors.DIFF_CONTEXT_BG,
            fg=Colors.TEXT_SECONDARY,
            insertbackground=Colors.TEXT_PRIMARY,
            selectbackground=Colors.ACCENT_MUTED,
            relief="flat",
            borderwidth=0,
            padx=10,
            pady=6,
            state="disabled",
            cursor="arrow",
        )
        vsb = tk.Scrollbar(diff_container, orient="vertical", command=self._diff_text.yview)
        hsb = tk.Scrollbar(diff_container, orient="horizontal", command=self._diff_text.xview)
        self._diff_text.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")
        self._diff_text.grid(row=0, column=0, sticky="nsew")

        # Configure diff tags
        self._diff_text.tag_configure("header", foreground=Colors.TEXT_TERTIARY, font=(Fonts.MONO[0], Fonts.MONO[1], "italic"))
        self._diff_text.tag_configure("hunk", foreground=Colors.INFO, background=Colors.INFO_BG)
        self._diff_text.tag_configure("add", foreground=Colors.SUCCESS, background=Colors.DIFF_ADD_BG)
        self._diff_text.tag_configure("del", foreground=Colors.ERROR, background=Colors.DIFF_DEL_BG)
        self._diff_text.tag_configure("ctx", foreground=Colors.TEXT_SECONDARY)
        self._diff_text.tag_configure("empty", foreground=Colors.TEXT_TERTIARY, font=(Fonts.MONO[0], Fonts.MONO[1], "italic"))

        self._current_fe: Optional[FileEntry] = None
        self._current_staged: bool = False

    # ── Refresh ──────────────────────────────────────────────────

    def _refresh(self):
        self._refresh_btn.configure(text="…", state="disabled")
        self.after(10, self._do_refresh)

    def _do_refresh(self):
        try:
            self._status = get_detailed_status(self.repo.path)
        except Exception as e:
            if self._log:
                self._log("error", f"Status failed: {e}")
            self._status = DetailedStatus()
        self._rebuild_list()
        self._refresh_btn.configure(text="\u21BB", state="normal")

    def _rebuild_list(self):
        for w in self._list_scroll.winfo_children():
            w.destroy()

        if not self._status:
            return

        row = 0
        s = self._status

        def add_section(title, items, color, section_key, collapsed=False):
            nonlocal row
            if not items:
                return
            header = _SectionHeader(
                self._list_scroll, title, len(items), color,
                collapsed=collapsed,
            )
            header.grid(row=row, column=0, sticky="ew", pady=(Spacing.MD if row > 0 else Spacing.XS, Spacing.XS))
            row += 1

            container = ctk.CTkFrame(self._list_scroll, fg_color="transparent")
            container.grid(row=row, column=0, sticky="ew")
            container.grid_columnconfigure(0, weight=1)
            row += 1

            # If section starts collapsed, hide container immediately
            if collapsed:
                container.grid_remove()

            header._on_toggle = lambda c: container.grid_remove() if c else container.grid()

            for idx, fe in enumerate(items):
                fr = _FileRow(
                    container, fe, self.repo.path,
                    on_action=self._on_file_action,
                    on_preview=self._preview_file,
                    section=section_key,
                )
                fr.grid(row=idx, column=0, sticky="ew", pady=(0, 2))

        add_section("Conflicted", s.conflicted, Colors.ERROR, "conflicted")
        add_section("Staged", s.staged, Colors.SUCCESS, "staged")
        add_section("Modified", s.unstaged, Colors.WARNING, "unstaged")
        add_section("Untracked", s.untracked, Colors.TEXT_TERTIARY, "untracked", collapsed=len(s.untracked) > 10)

        if not s.has_changes:
            ctk.CTkLabel(
                self._list_scroll,
                text="Working directory clean\nNothing to stage or commit",
                font=Fonts.BODY,
                text_color=Colors.TEXT_TERTIARY,
                justify="center",
            ).grid(row=row, column=0, pady=Spacing.XXL)

    # ── File actions ─────────────────────────────────────────────

    def _on_file_action(self, action: str, fe: FileEntry):
        repo_path = self.repo.path

        if action == "stage":
            ok, msg = stage_file(repo_path, fe.path, self._log)
        elif action == "unstage":
            ok, msg = unstage_file(repo_path, fe.path, self._log)
        elif action == "discard":
            if not self._confirm_discard(fe.path):
                return
            ok, msg = discard_file(repo_path, fe.path, self._log)
        elif action == "delete_untracked":
            if not self._confirm_delete(fe.path):
                return
            ok, msg = delete_untracked(repo_path, fe.path, self._log)
        elif action == "resolve_conflict":
            self._open_conflict_dialog()
            return
        else:
            return

        if not ok and self._log:
            self._log("error", f"Action '{action}' failed on {fe.path}: {msg}")

        self._refresh()

    def _confirm_discard(self, filepath: str) -> bool:
        result = ctk.CTkInputDialog(
            text=f"Discard changes to:\n{filepath}\n\nThis cannot be undone. Type 'yes' to confirm:",
            title="Confirm Discard",
        ).get_input()
        return result and result.lower() == "yes"

    def _confirm_delete(self, filepath: str) -> bool:
        result = ctk.CTkInputDialog(
            text=f"Delete untracked file:\n{filepath}\n\nThis cannot be undone. Type 'yes' to confirm:",
            title="Confirm Delete",
        ).get_input()
        return result and result.lower() == "yes"

    def _stage_all(self):
        stage_all(self.repo.path, self._log)
        self._refresh()

    def _unstage_all(self):
        unstage_all(self.repo.path, self._log)
        self._refresh()

    def _open_conflict_dialog(self):
        from .ui_conflicts import ConflictDialog
        ConflictDialog(
            self,
            repo_path=self.repo.path,
            repo_name=self.repo.name,
            on_resolved=self._refresh,
            log=self._log,
        )

    # ── Diff preview ─────────────────────────────────────────────

    def _preview_file(self, fe: FileEntry, staged: bool):
        self._current_fe = fe
        self._current_staged = staged
        self._staged_toggle_var.set(staged)
        self._diff_path_label.configure(text=fe.path)
        self._load_diff(fe, staged)

    def _toggle_staged_diff(self):
        if self._current_fe:
            self._load_diff(self._current_fe, self._staged_toggle_var.get())

    def _load_diff(self, fe: FileEntry, staged: bool):
        diff = get_diff(self.repo.path, fe.path, staged=staged)

        self._diff_text.configure(state="normal")
        self._diff_text.delete("1.0", "end")

        if not diff:
            self._diff_text.insert("end", "\n  (No diff available — binary file or untracked)\n", "empty")
            self._diff_text.configure(state="disabled")
            return

        for line in diff.splitlines():
            if line.startswith("diff ") or line.startswith("index ") or line.startswith("--- ") or line.startswith("+++ "):
                self._diff_text.insert("end", line + "\n", "header")
            elif line.startswith("@@"):
                self._diff_text.insert("end", line + "\n", "hunk")
            elif line.startswith("+"):
                self._diff_text.insert("end", line + "\n", "add")
            elif line.startswith("-"):
                self._diff_text.insert("end", line + "\n", "del")
            else:
                self._diff_text.insert("end", line + "\n", "ctx")

        self._diff_text.configure(state="disabled")
        self._diff_text.yview_moveto(0)

    # ── Window lifecycle ─────────────────────────────────────────

    def _close(self):
        if self._on_close:
            self._on_close()
        self.destroy()
