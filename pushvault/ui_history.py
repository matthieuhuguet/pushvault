"""Commit history viewer — per-repo git log with commit details.

Shows recent commits in a scrollable timeline with:
- Commit hash, message, author, relative time
- Click to expand and see full diff
- Copy commit hash
- Visual timeline with colored dots
"""

from __future__ import annotations

import tkinter as tk
from typing import Callable, Optional

import customtkinter as ctk

from .git_engine import get_log, _run
from .models import RepoConfig
from .theme import Colors, Fonts, Spacing, hex_blend


class HistoryPanel(ctk.CTkToplevel):
    """Commit history viewer for a single repository."""

    def __init__(
        self,
        parent: ctk.CTk,
        repo: RepoConfig,
        log: Optional[Callable[[str, str], None]] = None,
    ):
        super().__init__(parent)
        self.repo = repo
        self._log = log
        self._commits: list[dict] = []
        self._selected_hash: Optional[str] = None

        self.title(f"History — {repo.name}")
        self.geometry("860x640")
        self.minsize(700, 480)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Center
        self.update_idletasks()
        w, h = 860, 640
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        self._build_ui()
        self._set_dark_titlebar()
        self.focus_force()
        self.bind("<Escape>", lambda _: self.destroy())

        self.after(50, self._load_history)

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
            text=f"\u23F3  {self.repo.name} — Commit History",
            font=Fonts.HEADING,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        ).grid(row=0, column=0, sticky="w", padx=Spacing.LG, pady=Spacing.MD)

        self._count_label = ctk.CTkLabel(
            header,
            text="",
            font=Fonts.SMALL,
            text_color=Colors.TEXT_TERTIARY,
        )
        self._count_label.grid(row=0, column=1, padx=Spacing.LG)

        # ── Split view: commit list + diff ──
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.grid(row=1, column=0, sticky="nsew")
        content.grid_rowconfigure(0, weight=1)
        content.grid_columnconfigure(0, weight=0)
        content.grid_columnconfigure(1, weight=1)

        # Left: commit list
        self._list_panel = ctk.CTkFrame(content, fg_color=Colors.BG_SECONDARY, corner_radius=0, width=340)
        self._list_panel.grid(row=0, column=0, sticky="nsew")
        self._list_panel.grid_rowconfigure(0, weight=1)
        self._list_panel.grid_propagate(False)
        self._list_panel.configure(width=340)

        self._list_scroll = ctk.CTkScrollableFrame(
            self._list_panel,
            fg_color="transparent",
            scrollbar_button_color=Colors.SCROLLBAR,
            scrollbar_button_hover_color=Colors.SCROLLBAR_HOVER,
        )
        self._list_scroll.grid(row=0, column=0, sticky="nsew")
        self._list_scroll.grid_columnconfigure(0, weight=1)

        # Right: diff viewer
        self._diff_panel = ctk.CTkFrame(content, fg_color=Colors.BG_PRIMARY, corner_radius=0)
        self._diff_panel.grid(row=0, column=1, sticky="nsew")
        self._diff_panel.grid_rowconfigure(1, weight=1)
        self._diff_panel.grid_columnconfigure(0, weight=1)

        # Diff header
        diff_header = ctk.CTkFrame(self._diff_panel, fg_color=Colors.BG_TERTIARY, height=40, corner_radius=0)
        diff_header.grid(row=0, column=0, sticky="ew")
        diff_header.grid_columnconfigure(0, weight=1)

        self._diff_title = ctk.CTkLabel(
            diff_header,
            text="Select a commit to view changes",
            font=Fonts.MONO_SMALL,
            text_color=Colors.TEXT_SECONDARY,
            anchor="w",
        )
        self._diff_title.grid(row=0, column=0, sticky="w", padx=Spacing.LG, pady=Spacing.SM)

        # Diff text
        diff_container = tk.Frame(self._diff_panel, bg=Colors.BG_PRIMARY)
        diff_container.grid(row=1, column=0, sticky="nsew")
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

        # Diff tags
        self._diff_text.tag_configure("header", foreground=Colors.TEXT_TERTIARY, font=(Fonts.MONO[0], Fonts.MONO[1], "italic"))
        self._diff_text.tag_configure("hunk", foreground=Colors.INFO, background=Colors.INFO_BG)
        self._diff_text.tag_configure("add", foreground=Colors.SUCCESS, background=Colors.DIFF_ADD_BG)
        self._diff_text.tag_configure("del", foreground=Colors.ERROR, background=Colors.DIFF_DEL_BG)
        self._diff_text.tag_configure("ctx", foreground=Colors.TEXT_SECONDARY)
        self._diff_text.tag_configure("stat", foreground=Colors.WARNING)
        self._diff_text.tag_configure("empty", foreground=Colors.TEXT_TERTIARY, font=(Fonts.MONO[0], Fonts.MONO[1], "italic"))

    def _load_history(self):
        """Load commit history from git."""
        self._commits = get_log(self.repo.path, limit=50)
        self._count_label.configure(text=f"{len(self._commits)} commits")
        self._rebuild_list()

    def _rebuild_list(self):
        for w in self._list_scroll.winfo_children():
            w.destroy()

        if not self._commits:
            ctk.CTkLabel(
                self._list_scroll,
                text="No commits yet",
                font=Fonts.BODY,
                text_color=Colors.TEXT_TERTIARY,
            ).grid(row=0, column=0, pady=Spacing.XL)
            return

        for i, commit in enumerate(self._commits):
            self._create_commit_row(commit, i)

    def _create_commit_row(self, commit: dict, index: int):
        """Create a commit row in the timeline."""
        is_selected = self._selected_hash == commit["hash"]
        bg = Colors.ACCENT_BG if is_selected else Colors.BG_TERTIARY
        border = Colors.ACCENT if is_selected else Colors.BORDER_SUBTLE

        frame = ctk.CTkFrame(
            self._list_scroll,
            fg_color=bg,
            corner_radius=8,
            border_width=1 if is_selected else 0,
            border_color=border,
            cursor="hand2",
        )
        frame.grid(row=index, column=0, sticky="ew", pady=(0, Spacing.XS))
        frame.grid_columnconfigure(1, weight=1)

        # Bind click
        frame.bind("<Button-1>", lambda e, c=commit: self._select_commit(c))

        # Timeline dot
        dot_color = Colors.SUCCESS if "[PushVault]" in commit.get("subject", "") else Colors.ACCENT
        dot = ctk.CTkLabel(
            frame,
            text="\u25CF",
            font=("Segoe UI", 10),
            text_color=dot_color,
            width=20,
        )
        dot.grid(row=0, column=0, rowspan=2, padx=(Spacing.SM, Spacing.XS), pady=Spacing.SM)
        dot.bind("<Button-1>", lambda e, c=commit: self._select_commit(c))

        # Commit info
        info = ctk.CTkFrame(frame, fg_color="transparent")
        info.grid(row=0, column=1, sticky="ew", padx=(0, Spacing.SM), pady=(Spacing.SM, 0))
        info.grid_columnconfigure(0, weight=1)
        info.bind("<Button-1>", lambda e, c=commit: self._select_commit(c))

        # Subject
        subject = commit.get("subject", "")[:60]
        subj_label = ctk.CTkLabel(
            info,
            text=subject,
            font=Fonts.SMALL_BOLD,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        )
        subj_label.grid(row=0, column=0, sticky="w")
        subj_label.bind("<Button-1>", lambda e, c=commit: self._select_commit(c))

        # Hash
        hash_label = ctk.CTkLabel(
            info,
            text=commit.get("hash", ""),
            font=Fonts.MONO_SMALL,
            text_color=Colors.TEXT_TERTIARY,
        )
        hash_label.grid(row=0, column=1, padx=(Spacing.SM, 0))
        hash_label.bind("<Button-1>", lambda e, c=commit: self._select_commit(c))

        # Meta line
        meta = ctk.CTkFrame(frame, fg_color="transparent")
        meta.grid(row=1, column=1, sticky="w", padx=(0, Spacing.SM), pady=(0, Spacing.SM))
        meta.bind("<Button-1>", lambda e, c=commit: self._select_commit(c))

        ctk.CTkLabel(
            meta,
            text=f"{commit.get('author', '')}  \u00B7  {commit.get('when', '')}",
            font=Fonts.TINY,
            text_color=Colors.TEXT_TERTIARY,
            anchor="w",
        ).pack(side="left")

    def _select_commit(self, commit: dict):
        """Select a commit and show its diff."""
        self._selected_hash = commit["hash"]
        self._rebuild_list()
        self._load_commit_diff(commit)

    def _load_commit_diff(self, commit: dict):
        """Load and display the diff for a commit."""
        self._diff_title.configure(
            text=f"{commit['hash']}  {commit.get('subject', '')[:50]}"
        )

        # Get commit diff
        r = _run(
            ["git", "show", "--stat", "--patch", commit["hash"]],
            cwd=self.repo.path,
            timeout=30,
        )

        self._diff_text.configure(state="normal")
        self._diff_text.delete("1.0", "end")

        if r.returncode != 0:
            self._diff_text.insert("end", f"  Failed to load diff: {r.stderr}\n", "empty")
            self._diff_text.configure(state="disabled")
            return

        for line in r.stdout.splitlines():
            if line.startswith("diff ") or line.startswith("index ") or line.startswith("--- ") or line.startswith("+++ "):
                self._diff_text.insert("end", line + "\n", "header")
            elif line.startswith("@@"):
                self._diff_text.insert("end", line + "\n", "hunk")
            elif line.startswith("+"):
                self._diff_text.insert("end", line + "\n", "add")
            elif line.startswith("-"):
                self._diff_text.insert("end", line + "\n", "del")
            elif "|" in line and ("+" in line.split("|")[-1] or "-" in line.split("|")[-1]):
                self._diff_text.insert("end", line + "\n", "stat")
            else:
                self._diff_text.insert("end", line + "\n", "ctx")

        self._diff_text.configure(state="disabled")
        self._diff_text.yview_moveto(0)
