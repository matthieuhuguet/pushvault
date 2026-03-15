"""Stash manager panel — save, list, apply, pop, and drop stashes.

Provides a clean UI for git stash operations:
- Save current changes with optional message
- List all stashes with preview
- Apply or pop a stash
- Drop individual stashes
- Clear all stashes
"""

from __future__ import annotations

import tkinter as tk
from typing import Callable, Optional

import customtkinter as ctk

from .git_engine import _run
from .models import RepoConfig
from .theme import Colors, Fonts, Spacing, hex_blend


def _stash_list(repo_path: str) -> list[dict]:
    """Get list of stashes with index, message, and date."""
    r = _run(
        ["git", "stash", "list", "--pretty=format:%gd|%gs|%ar"],
        cwd=repo_path,
        timeout=15,
    )
    if r.returncode != 0:
        return []
    stashes = []
    for line in r.stdout.strip().splitlines():
        if not line:
            continue
        parts = line.split("|", 2)
        if len(parts) >= 2:
            stashes.append({
                "ref": parts[0],
                "message": parts[1] if len(parts) > 1 else "",
                "when": parts[2] if len(parts) > 2 else "",
            })
    return stashes


def _stash_save(repo_path: str, message: str = "") -> tuple[bool, str]:
    """Save current changes to stash."""
    args = ["git", "stash", "push"]
    if message:
        args += ["-m", message]
    r = _run(args, cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip() or "Stash failed"
    out = r.stdout.strip()
    if "No local changes" in out:
        return False, "No changes to stash"
    return True, out


def _stash_apply(repo_path: str, ref: str = "stash@{0}") -> tuple[bool, str]:
    """Apply a stash without removing it."""
    r = _run(["git", "stash", "apply", ref], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()
    return True, "Applied"


def _stash_pop(repo_path: str, ref: str = "stash@{0}") -> tuple[bool, str]:
    """Apply and remove a stash."""
    r = _run(["git", "stash", "pop", ref], cwd=repo_path, timeout=30)
    if r.returncode != 0:
        return False, r.stderr.strip()
    return True, "Popped"


def _stash_drop(repo_path: str, ref: str = "stash@{0}") -> tuple[bool, str]:
    """Drop a single stash."""
    r = _run(["git", "stash", "drop", ref], cwd=repo_path, timeout=15)
    if r.returncode != 0:
        return False, r.stderr.strip()
    return True, "Dropped"


def _stash_clear(repo_path: str) -> tuple[bool, str]:
    """Clear all stashes."""
    r = _run(["git", "stash", "clear"], cwd=repo_path, timeout=15)
    if r.returncode != 0:
        return False, r.stderr.strip()
    return True, "All stashes cleared"


def _stash_show(repo_path: str, ref: str = "stash@{0}") -> str:
    """Get diff preview for a stash."""
    r = _run(["git", "stash", "show", "-p", ref], cwd=repo_path, timeout=30)
    return r.stdout if r.returncode == 0 else r.stderr


class StashPanel(ctk.CTkToplevel):
    """Stash management panel."""

    def __init__(
        self,
        parent: ctk.CTk,
        repo: RepoConfig,
        log: Optional[Callable[[str, str], None]] = None,
        on_close: Optional[Callable] = None,
    ):
        super().__init__(parent)
        self.repo = repo
        self._log = log
        self._on_close = on_close
        self._stashes: list[dict] = []
        self._selected_ref: Optional[str] = None

        self.title(f"Stash — {repo.name}")
        self.geometry("780x560")
        self.minsize(600, 420)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Center
        self.update_idletasks()
        w, h = 780, 560
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        self._build_ui()
        self._set_dark_titlebar()
        self.focus_force()
        self.bind("<Escape>", lambda _: self._close())
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
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)

        # ── Header with stash save ──
        header = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, height=96, corner_radius=0)
        header.grid(row=0, column=0, sticky="ew")
        header.grid_columnconfigure(0, weight=1)
        header.grid_propagate(False)

        # Title
        ctk.CTkLabel(
            header,
            text=f"\U0001F4E6  Stash — {self.repo.name}",
            font=Fonts.HEADING,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        ).grid(row=0, column=0, columnspan=2, sticky="w", padx=Spacing.LG, pady=(Spacing.MD, Spacing.XS))

        # Save stash row
        save_frame = ctk.CTkFrame(header, fg_color="transparent")
        save_frame.grid(row=1, column=0, columnspan=2, sticky="ew", padx=Spacing.LG, pady=(0, Spacing.MD))
        save_frame.grid_columnconfigure(0, weight=1)

        self._msg_entry = ctk.CTkEntry(
            save_frame,
            placeholder_text="Stash message (optional)",
            height=32,
            corner_radius=8,
            fg_color=Colors.BG_INPUT,
            border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY,
            font=Fonts.SMALL,
        )
        self._msg_entry.grid(row=0, column=0, sticky="ew")
        self._msg_entry.bind("<Return>", lambda _: self._save_stash())

        ctk.CTkButton(
            save_frame,
            text="Stash Changes",
            command=self._save_stash,
            fg_color=Colors.ACCENT,
            hover_color=Colors.ACCENT_HOVER,
            text_color="#FFFFFF",
            height=32,
            width=120,
            corner_radius=8,
            font=Fonts.SMALL_BOLD,
        ).grid(row=0, column=1, padx=(Spacing.SM, 0))

        # ── Content: stash list + diff preview ──
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.grid(row=1, column=0, sticky="nsew")
        content.grid_rowconfigure(0, weight=1)
        content.grid_columnconfigure(0, weight=0)
        content.grid_columnconfigure(1, weight=1)

        # Left: stash list
        left = ctk.CTkFrame(content, fg_color=Colors.BG_SECONDARY, corner_radius=0, width=280)
        left.grid(row=0, column=0, sticky="nsew")
        left.grid_rowconfigure(0, weight=1)
        left.grid_propagate(False)
        left.configure(width=280)

        self._list_scroll = ctk.CTkScrollableFrame(
            left,
            fg_color="transparent",
            scrollbar_button_color=Colors.SCROLLBAR,
            scrollbar_button_hover_color=Colors.SCROLLBAR_HOVER,
        )
        self._list_scroll.grid(row=0, column=0, sticky="nsew")
        self._list_scroll.grid_columnconfigure(0, weight=1)

        # Left footer
        lf = ctk.CTkFrame(left, fg_color=Colors.BG_TERTIARY, height=40, corner_radius=0)
        lf.grid(row=1, column=0, sticky="ew")

        ctk.CTkButton(
            lf,
            text="Clear All",
            command=self._clear_all,
            fg_color="transparent",
            hover_color=Colors.ERROR_BG,
            text_color=Colors.ERROR,
            height=26,
            width=80,
            corner_radius=6,
            font=Fonts.SMALL,
            border_width=0,
        ).pack(side="right", padx=Spacing.MD, pady=Spacing.SM)

        self._stash_count = ctk.CTkLabel(
            lf, text="", font=Fonts.TINY, text_color=Colors.TEXT_TERTIARY,
        )
        self._stash_count.pack(side="left", padx=Spacing.MD)

        # Right: diff preview
        right = ctk.CTkFrame(content, fg_color=Colors.BG_PRIMARY, corner_radius=0)
        right.grid(row=0, column=1, sticky="nsew")
        right.grid_rowconfigure(0, weight=1)
        right.grid_columnconfigure(0, weight=1)

        diff_container = tk.Frame(right, bg=Colors.BG_PRIMARY)
        diff_container.grid(row=0, column=0, sticky="nsew")
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
        self._diff_text.tag_configure("header", foreground=Colors.TEXT_TERTIARY)
        self._diff_text.tag_configure("hunk", foreground=Colors.INFO, background=Colors.INFO_BG)
        self._diff_text.tag_configure("add", foreground=Colors.SUCCESS, background=Colors.DIFF_ADD_BG)
        self._diff_text.tag_configure("del", foreground=Colors.ERROR, background=Colors.DIFF_DEL_BG)
        self._diff_text.tag_configure("ctx", foreground=Colors.TEXT_SECONDARY)
        self._diff_text.tag_configure("empty", foreground=Colors.TEXT_TERTIARY, font=(Fonts.MONO[0], Fonts.MONO[1], "italic"))

    def _refresh(self):
        """Reload stash list."""
        self._stashes = _stash_list(self.repo.path)
        self._stash_count.configure(text=f"{len(self._stashes)} stash(es)")
        self._rebuild_list()

    def _rebuild_list(self):
        for w in self._list_scroll.winfo_children():
            w.destroy()

        if not self._stashes:
            ctk.CTkLabel(
                self._list_scroll,
                text="No stashes\n\nStash your changes to save\nthem temporarily",
                font=Fonts.BODY,
                text_color=Colors.TEXT_TERTIARY,
                justify="center",
            ).grid(row=0, column=0, pady=Spacing.XL)
            return

        for i, stash in enumerate(self._stashes):
            self._create_stash_row(stash, i)

    def _create_stash_row(self, stash: dict, index: int):
        is_selected = self._selected_ref == stash["ref"]
        bg = Colors.ACCENT_BG if is_selected else Colors.BG_TERTIARY

        frame = ctk.CTkFrame(
            self._list_scroll,
            fg_color=bg,
            corner_radius=8,
            cursor="hand2",
        )
        frame.grid(row=index, column=0, sticky="ew", pady=(0, Spacing.XS))
        frame.grid_columnconfigure(0, weight=1)

        frame.bind("<Button-1>", lambda e, s=stash: self._select_stash(s))

        # Top row: message
        msg = stash.get("message", stash["ref"])
        msg_label = ctk.CTkLabel(
            frame,
            text=msg[:50],
            font=Fonts.SMALL_BOLD,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        )
        msg_label.grid(row=0, column=0, sticky="w", padx=Spacing.MD, pady=(Spacing.SM, 0))
        msg_label.bind("<Button-1>", lambda e, s=stash: self._select_stash(s))

        # Bottom row: ref + time + actions
        meta_frame = ctk.CTkFrame(frame, fg_color="transparent")
        meta_frame.grid(row=1, column=0, sticky="ew", padx=Spacing.MD, pady=(0, Spacing.SM))
        meta_frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            meta_frame,
            text=f"{stash['ref']}  \u00B7  {stash.get('when', '')}",
            font=Fonts.TINY,
            text_color=Colors.TEXT_TERTIARY,
        ).grid(row=0, column=0, sticky="w")

        # Action buttons
        btn_kw = dict(height=22, corner_radius=5, font=Fonts.TINY, border_width=0, width=48)

        ctk.CTkButton(
            meta_frame,
            text="Apply",
            command=lambda s=stash: self._apply_stash(s["ref"]),
            fg_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.7),
            hover_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.5),
            text_color=Colors.SUCCESS,
            **btn_kw,
        ).grid(row=0, column=1, padx=(Spacing.XS, 0))

        ctk.CTkButton(
            meta_frame,
            text="Pop",
            command=lambda s=stash: self._pop_stash(s["ref"]),
            fg_color=hex_blend(Colors.ACCENT, Colors.BG_PRIMARY, 0.7),
            hover_color=hex_blend(Colors.ACCENT, Colors.BG_PRIMARY, 0.5),
            text_color=Colors.ACCENT,
            **btn_kw,
        ).grid(row=0, column=2, padx=(Spacing.XS, 0))

        ctk.CTkButton(
            meta_frame,
            text="Drop",
            command=lambda s=stash: self._drop_stash(s["ref"]),
            fg_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.8),
            hover_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.6),
            text_color=Colors.ERROR,
            **btn_kw,
        ).grid(row=0, column=3, padx=(Spacing.XS, 0))

    def _select_stash(self, stash: dict):
        self._selected_ref = stash["ref"]
        self._rebuild_list()
        self._show_stash_diff(stash["ref"])

    def _show_stash_diff(self, ref: str):
        diff = _stash_show(self.repo.path, ref)
        self._diff_text.configure(state="normal")
        self._diff_text.delete("1.0", "end")

        if not diff:
            self._diff_text.insert("end", "  (No diff available)\n", "empty")
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

    def _save_stash(self):
        msg = self._msg_entry.get().strip()
        ok, result = _stash_save(self.repo.path, msg)
        if ok:
            self._msg_entry.delete(0, "end")
            if self._log:
                self._log("success", f"Stashed: {result}")
        else:
            if self._log:
                self._log("warning", result)
        self._refresh()

    def _apply_stash(self, ref: str):
        ok, msg = _stash_apply(self.repo.path, ref)
        if self._log:
            self._log("success" if ok else "error", f"Stash apply: {msg}")
        self._refresh()

    def _pop_stash(self, ref: str):
        ok, msg = _stash_pop(self.repo.path, ref)
        if self._log:
            self._log("success" if ok else "error", f"Stash pop: {msg}")
        self._refresh()

    def _drop_stash(self, ref: str):
        ok, msg = _stash_drop(self.repo.path, ref)
        if self._log:
            self._log("success" if ok else "error", f"Stash drop: {msg}")
        self._selected_ref = None
        self._refresh()

    def _clear_all(self):
        ok, msg = _stash_clear(self.repo.path)
        if self._log:
            self._log("success" if ok else "error", msg)
        self._selected_ref = None
        self._refresh()

    def _close(self):
        if self._on_close:
            self._on_close()
        self.destroy()
