"""Conflict resolution dialog — GitHub Desktop-grade merge conflict UI.

Features:
- File list with conflict type detection (text markers vs binary)
- Side-by-side diff viewer with syntax-highlighted conflict hunks
- Per-file resolution: Use Ours / Use Theirs / Mark as Resolved
- Undo resolution support
- Commit merge when all resolved
- Abort merge option
"""

from __future__ import annotations

import os
import subprocess
import tkinter as tk
from pathlib import Path
from typing import Callable, Optional

import customtkinter as ctk

from .git_engine import (
    abort_merge,
    get_conflicted_files,
    get_file_at_ref,
    resolve_all_and_commit,
    resolve_file,
)
from .models import ConflictFile, ConflictHunk, ConflictType, Resolution
from .theme import Colors, Fonts, Spacing, hex_blend


class ConflictDialog(ctk.CTkToplevel):
    """Full-screen conflict resolution dialog."""

    def __init__(
        self,
        parent: ctk.CTk,
        repo_path: str,
        repo_name: str,
        on_resolved: Optional[Callable[[], None]] = None,
        log: Optional[Callable[[str, str], None]] = None,
    ):
        super().__init__(parent)
        self.repo_path = repo_path
        self.repo_name = repo_name
        self.on_resolved = on_resolved
        self.log = log

        self.title(f"Resolve Conflicts — {repo_name}")
        self.geometry("1100x750")
        self.minsize(900, 600)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Center on screen
        self.update_idletasks()
        w, h = 1100, 750
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        # State
        self.conflicts: list[ConflictFile] = []
        self.resolutions: dict[str, Resolution] = {}
        self.selected_file: Optional[ConflictFile] = None

        self._build_ui()
        self._load_conflicts()

        # Dark titlebar on Windows 11
        self.after(10, self._set_dark_titlebar)

        # Focus
        self.focus_force()
        self.grab_set()

    def _set_dark_titlebar(self) -> None:
        try:
            import ctypes
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, 20, ctypes.byref(ctypes.c_int(1)), ctypes.sizeof(ctypes.c_int)
            )
        except Exception:
            pass

    def _build_ui(self) -> None:
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)

        # ── Header Banner ──
        self._banner = ctk.CTkFrame(
            self,
            fg_color=Colors.WARNING_BG,
            corner_radius=0,
            height=48,
        )
        self._banner.grid(row=0, column=0, sticky="ew")
        self._banner.grid_columnconfigure(1, weight=1)

        self._banner_icon = ctk.CTkLabel(
            self._banner,
            text="\u26A0",
            font=Fonts.HEADING,
            text_color=Colors.WARNING,
        )
        self._banner_icon.grid(row=0, column=0, padx=(Spacing.LG, Spacing.SM), pady=Spacing.MD)

        self._banner_text = ctk.CTkLabel(
            self._banner,
            text="Resolve all conflicts to complete the merge",
            font=Fonts.BODY,
            text_color=Colors.WARNING,
            anchor="w",
        )
        self._banner_text.grid(row=0, column=1, sticky="w")

        self._banner_count = ctk.CTkLabel(
            self._banner,
            text="",
            font=Fonts.SMALL_BOLD,
            text_color=Colors.WARNING,
        )
        self._banner_count.grid(row=0, column=2, padx=Spacing.LG)

        # ── Main Content: File List (left) + Diff Viewer (right) ──
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.grid(row=1, column=0, sticky="nsew", padx=0, pady=0)
        content.grid_rowconfigure(0, weight=1)
        content.grid_columnconfigure(1, weight=1)

        # Left panel: file list
        self._file_panel = ctk.CTkFrame(
            content,
            fg_color=Colors.BG_SECONDARY,
            width=300,
            corner_radius=0,
            border_width=0,
        )
        self._file_panel.grid(row=0, column=0, sticky="ns")
        self._file_panel.grid_rowconfigure(1, weight=1)
        self._file_panel.grid_propagate(False)
        self._file_panel.configure(width=300)

        # File list header
        fl_header = ctk.CTkFrame(self._file_panel, fg_color="transparent")
        fl_header.grid(row=0, column=0, sticky="ew", padx=Spacing.MD, pady=Spacing.MD)

        ctk.CTkLabel(
            fl_header,
            text="Conflicted Files",
            font=Fonts.BODY_BOLD,
            text_color=Colors.TEXT_PRIMARY,
        ).pack(anchor="w")

        # Scrollable file list
        self._file_list = ctk.CTkScrollableFrame(
            self._file_panel,
            fg_color="transparent",
            scrollbar_button_color=Colors.SCROLLBAR,
            scrollbar_button_hover_color=Colors.SCROLLBAR_HOVER,
        )
        self._file_list.grid(row=1, column=0, sticky="nsew", padx=Spacing.XS, pady=0)
        self._file_list.grid_columnconfigure(0, weight=1)

        # Right panel: diff viewer
        self._diff_panel = ctk.CTkFrame(
            content,
            fg_color=Colors.BG_PRIMARY,
            corner_radius=0,
        )
        self._diff_panel.grid(row=0, column=1, sticky="nsew")
        self._diff_panel.grid_rowconfigure(1, weight=1)
        self._diff_panel.grid_columnconfigure(0, weight=1)

        # Diff header (file path + actions)
        self._diff_header = ctk.CTkFrame(
            self._diff_panel,
            fg_color=Colors.BG_TERTIARY,
            height=44,
            corner_radius=0,
        )
        self._diff_header.grid(row=0, column=0, sticky="ew")
        self._diff_header.grid_columnconfigure(0, weight=1)

        self._diff_filepath = ctk.CTkLabel(
            self._diff_header,
            text="Select a file to view conflicts",
            font=Fonts.MONO_SMALL,
            text_color=Colors.TEXT_SECONDARY,
            anchor="w",
        )
        self._diff_filepath.grid(row=0, column=0, sticky="w", padx=Spacing.LG, pady=Spacing.SM)

        # Action buttons in diff header
        self._diff_actions = ctk.CTkFrame(self._diff_header, fg_color="transparent")
        self._diff_actions.grid(row=0, column=1, padx=Spacing.MD, pady=Spacing.XS)

        btn_kw = dict(height=28, corner_radius=6, font=Fonts.SMALL_BOLD, border_width=1)

        self._btn_ours = ctk.CTkButton(
            self._diff_actions,
            text="Use Ours",
            command=lambda: self._resolve_selected(Resolution.OURS),
            fg_color=Colors.DIFF_OURS_LINE,
            hover_color=hex_blend(Colors.DIFF_OURS_LINE, Colors.INFO, 0.3),
            text_color=Colors.INFO,
            border_color=hex_blend(Colors.INFO, Colors.BG_PRIMARY, 0.5),
            width=80,
            **btn_kw,
        )
        self._btn_ours.grid(row=0, column=0, padx=(0, Spacing.XS))

        self._btn_theirs = ctk.CTkButton(
            self._diff_actions,
            text="Use Theirs",
            command=lambda: self._resolve_selected(Resolution.THEIRS),
            fg_color=Colors.DIFF_THEIRS_LINE,
            hover_color=hex_blend(Colors.DIFF_THEIRS_LINE, Colors.ACCENT, 0.3),
            text_color=Colors.ACCENT,
            border_color=hex_blend(Colors.ACCENT, Colors.BG_PRIMARY, 0.5),
            width=86,
            **btn_kw,
        )
        self._btn_theirs.grid(row=0, column=1, padx=(0, Spacing.XS))

        self._btn_editor = ctk.CTkButton(
            self._diff_actions,
            text="Open in Editor",
            command=self._open_in_editor,
            fg_color="transparent",
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            border_color=Colors.BORDER,
            width=100,
            **btn_kw,
        )
        self._btn_editor.grid(row=0, column=2, padx=(0, Spacing.XS))

        self._btn_mark = ctk.CTkButton(
            self._diff_actions,
            text="Mark Resolved",
            command=lambda: self._resolve_selected(Resolution.MANUAL),
            fg_color="transparent",
            hover_color=Colors.BG_HOVER,
            text_color=Colors.SUCCESS,
            border_color=hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.5),
            width=106,
            **btn_kw,
        )
        self._btn_mark.grid(row=0, column=3)

        # Diff content area
        self._diff_content = ctk.CTkFrame(
            self._diff_panel,
            fg_color=Colors.BG_PRIMARY,
        )
        self._diff_content.grid(row=1, column=0, sticky="nsew")
        self._diff_content.grid_rowconfigure(1, weight=1)  # row 1 = text widgets
        self._diff_content.grid_columnconfigure(0, weight=1)
        self._diff_content.grid_columnconfigure(1, weight=1)

        # Side-by-side diff viewers
        self._build_diff_viewer()

        # ── Footer: Commit / Abort ──
        footer = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, height=56, corner_radius=0)
        footer.grid(row=2, column=0, sticky="ew")
        footer.grid_columnconfigure(0, weight=1)

        footer_left = ctk.CTkFrame(footer, fg_color="transparent")
        footer_left.grid(row=0, column=0, sticky="w", padx=Spacing.LG, pady=Spacing.MD)

        self._btn_abort = ctk.CTkButton(
            footer_left,
            text="Abort Merge",
            command=self._on_abort,
            fg_color="transparent",
            hover_color=Colors.ERROR_BG,
            text_color=Colors.ERROR,
            border_color=hex_blend(Colors.ERROR, Colors.BG_PRIMARY, 0.5),
            border_width=1,
            height=32,
            corner_radius=8,
            font=Fonts.SMALL_BOLD,
            width=110,
        )
        self._btn_abort.pack(side="left")

        footer_right = ctk.CTkFrame(footer, fg_color="transparent")
        footer_right.grid(row=0, column=1, sticky="e", padx=Spacing.LG, pady=Spacing.MD)

        self._btn_commit = ctk.CTkButton(
            footer_right,
            text="Commit Resolution",
            command=self._on_commit,
            fg_color=Colors.ACCENT,
            hover_color=Colors.ACCENT_HOVER,
            text_color="#FFFFFF",
            height=32,
            corner_radius=8,
            font=Fonts.BODY_BOLD,
            width=160,
            state="disabled",
        )
        self._btn_commit.pack(side="right")

    def _build_diff_viewer(self) -> None:
        """Build side-by-side diff viewer using tk.Text widgets."""
        # Labels row
        labels_frame = ctk.CTkFrame(self._diff_content, fg_color=Colors.BG_TERTIARY, height=28, corner_radius=0)
        labels_frame.grid(row=0, column=0, columnspan=2, sticky="ew")
        labels_frame.grid_columnconfigure(0, weight=1)
        labels_frame.grid_columnconfigure(1, weight=1)

        self._ours_label = ctk.CTkLabel(
            labels_frame,
            text="  OURS (HEAD)",
            font=Fonts.SMALL_BOLD,
            text_color=Colors.INFO,
            anchor="w",
        )
        self._ours_label.grid(row=0, column=0, sticky="w", padx=Spacing.SM)

        self._theirs_label = ctk.CTkLabel(
            labels_frame,
            text="  THEIRS (incoming)",
            font=Fonts.SMALL_BOLD,
            text_color=Colors.ACCENT,
            anchor="w",
        )
        self._theirs_label.grid(row=0, column=1, sticky="w", padx=Spacing.SM)

        # Ours text widget
        ours_frame = tk.Frame(self._diff_content, bg=Colors.DIFF_CONTEXT_BG)
        ours_frame.grid(row=1, column=0, sticky="nsew", padx=(0, 1))

        self._ours_text = tk.Text(
            ours_frame,
            wrap="none",
            font=(Fonts.MONO[0], Fonts.MONO[1]),
            bg=Colors.DIFF_CONTEXT_BG,
            fg=Colors.TEXT_PRIMARY,
            insertbackground=Colors.TEXT_PRIMARY,
            selectbackground=Colors.ACCENT_MUTED,
            selectforeground=Colors.TEXT_PRIMARY,
            relief="flat",
            borderwidth=0,
            padx=8,
            pady=4,
            state="disabled",
            cursor="arrow",
        )
        ours_scroll = tk.Scrollbar(ours_frame, orient="vertical", command=self._sync_scroll_ours)
        self._ours_text.configure(yscrollcommand=ours_scroll.set)
        ours_scroll.pack(side="right", fill="y")
        self._ours_text.pack(side="left", fill="both", expand=True)

        # Theirs text widget
        theirs_frame = tk.Frame(self._diff_content, bg=Colors.DIFF_CONTEXT_BG)
        theirs_frame.grid(row=1, column=1, sticky="nsew")

        self._theirs_text = tk.Text(
            theirs_frame,
            wrap="none",
            font=(Fonts.MONO[0], Fonts.MONO[1]),
            bg=Colors.DIFF_CONTEXT_BG,
            fg=Colors.TEXT_PRIMARY,
            insertbackground=Colors.TEXT_PRIMARY,
            selectbackground=Colors.ACCENT_MUTED,
            selectforeground=Colors.TEXT_PRIMARY,
            relief="flat",
            borderwidth=0,
            padx=8,
            pady=4,
            state="disabled",
            cursor="arrow",
        )
        theirs_scroll = tk.Scrollbar(theirs_frame, orient="vertical", command=self._sync_scroll_theirs)
        self._theirs_text.configure(yscrollcommand=theirs_scroll.set)
        theirs_scroll.pack(side="right", fill="y")
        self._theirs_text.pack(side="left", fill="both", expand=True)

        # Horizontal scrollbar (shared)
        hscroll = tk.Scrollbar(self._diff_content, orient="horizontal", command=self._sync_hscroll)
        hscroll.grid(row=2, column=0, columnspan=2, sticky="ew")
        self._ours_text.configure(xscrollcommand=hscroll.set)
        self._theirs_text.configure(xscrollcommand=hscroll.set)

        # Configure text tags
        for widget in (self._ours_text, self._theirs_text):
            widget.tag_configure("context", foreground=Colors.TEXT_SECONDARY)
            widget.tag_configure("added", background=Colors.DIFF_ADD_BG, foreground=Colors.SUCCESS)
            widget.tag_configure("deleted", background=Colors.DIFF_DEL_BG, foreground=Colors.ERROR)
            widget.tag_configure("conflict_ours", background=Colors.DIFF_OURS_BG, foreground=Colors.TEXT_PRIMARY)
            widget.tag_configure("conflict_theirs", background=Colors.DIFF_THEIRS_BG, foreground=Colors.TEXT_PRIMARY)
            widget.tag_configure("marker", background=Colors.DIFF_MARKER_BG, foreground=Colors.ERROR)
            widget.tag_configure("line_num", foreground=Colors.DIFF_LINE_NUM)
            widget.tag_configure("empty", background=Colors.DIFF_GUTTER, foreground=Colors.DIFF_GUTTER)
            widget.tag_configure("resolved", background=Colors.SUCCESS_BG, foreground=Colors.SUCCESS)

        # Bind mousewheel for synchronized scrolling
        self._ours_text.bind("<MouseWheel>", self._on_mousewheel)
        self._theirs_text.bind("<MouseWheel>", self._on_mousewheel)

        # Empty state
        self._diff_empty = ctk.CTkLabel(
            self._diff_content,
            text="Select a conflicted file from the list\nto view and resolve conflicts",
            font=Fonts.BODY,
            text_color=Colors.TEXT_TERTIARY,
            justify="center",
        )
        self._diff_empty.grid(row=1, column=0, columnspan=2)

    def _sync_scroll_ours(self, *args) -> None:
        self._ours_text.yview(*args)
        self._theirs_text.yview(*args)

    def _sync_scroll_theirs(self, *args) -> None:
        self._theirs_text.yview(*args)
        self._ours_text.yview(*args)

    def _sync_hscroll(self, *args) -> None:
        self._ours_text.xview(*args)
        self._theirs_text.xview(*args)

    def _on_mousewheel(self, event: tk.Event) -> str:
        delta = -1 * (event.delta // 120)
        self._ours_text.yview_scroll(delta, "units")
        self._theirs_text.yview_scroll(delta, "units")
        return "break"

    # ── Load & Display ──────────────────────────────────────────

    def _load_conflicts(self) -> None:
        """Load conflicted files from the repository."""
        self.conflicts = get_conflicted_files(self.repo_path)
        self._update_file_list()
        self._update_banner()

        if self.conflicts:
            self._select_file(self.conflicts[0])

    def _update_file_list(self) -> None:
        """Rebuild the file list widgets."""
        for widget in self._file_list.winfo_children():
            widget.destroy()

        if not self.conflicts:
            ctk.CTkLabel(
                self._file_list,
                text="No conflicts found",
                font=Fonts.BODY,
                text_color=Colors.TEXT_TERTIARY,
            ).grid(row=0, column=0, pady=Spacing.XL)
            return

        for i, cf in enumerate(self.conflicts):
            self._create_file_item(cf, i)

    def _create_file_item(self, cf: ConflictFile, index: int) -> None:
        """Create a single file item in the conflict list."""
        is_selected = self.selected_file and self.selected_file.path == cf.path
        is_resolved = cf.path in self.resolutions

        if is_resolved:
            bg = Colors.SUCCESS_BG
            border = hex_blend(Colors.SUCCESS, Colors.BG_PRIMARY, 0.6)
        elif is_selected:
            bg = Colors.ACCENT_BG
            border = Colors.ACCENT
        else:
            bg = Colors.BG_TERTIARY
            border = Colors.BORDER_SUBTLE

        item = ctk.CTkFrame(
            self._file_list,
            fg_color=bg,
            corner_radius=8,
            border_width=1,
            border_color=border,
            cursor="hand2",
        )
        item.grid(row=index, column=0, sticky="ew", pady=(0, Spacing.XS))
        item.grid_columnconfigure(0, weight=1)

        # Bind click to entire frame
        item.bind("<Button-1>", lambda e, c=cf: self._select_file(c))

        # File icon
        if is_resolved:
            icon = "\u2713"
            icon_color = Colors.SUCCESS
        elif cf.conflict_type == ConflictType.TEXT:
            icon = "\u2261"  # ≡ (text)
            icon_color = Colors.WARNING
        else:
            icon = "\u25A0"  # ■ (binary)
            icon_color = Colors.ERROR

        row = ctk.CTkFrame(item, fg_color="transparent")
        row.pack(fill="x", padx=Spacing.SM, pady=Spacing.SM)
        row.bind("<Button-1>", lambda e, c=cf: self._select_file(c))

        icon_label = ctk.CTkLabel(
            row,
            text=icon,
            font=Fonts.BODY_BOLD,
            text_color=icon_color,
            width=20,
        )
        icon_label.pack(side="left", padx=(0, Spacing.SM))
        icon_label.bind("<Button-1>", lambda e, c=cf: self._select_file(c))

        # File info
        info = ctk.CTkFrame(row, fg_color="transparent")
        info.pack(side="left", fill="x", expand=True)
        info.bind("<Button-1>", lambda e, c=cf: self._select_file(c))

        # Filename (just the basename for readability)
        filename = os.path.basename(cf.path)
        dirname = os.path.dirname(cf.path)

        name_lbl = ctk.CTkLabel(
            info,
            text=filename,
            font=Fonts.SMALL_BOLD,
            text_color=Colors.TEXT_PRIMARY if not is_resolved else Colors.SUCCESS,
            anchor="w",
        )
        name_lbl.pack(anchor="w")
        name_lbl.bind("<Button-1>", lambda e, c=cf: self._select_file(c))

        if dirname:
            dir_lbl = ctk.CTkLabel(
                info,
                text=dirname,
                font=Fonts.TINY,
                text_color=Colors.TEXT_TERTIARY,
                anchor="w",
            )
            dir_lbl.pack(anchor="w")
            dir_lbl.bind("<Button-1>", lambda e, c=cf: self._select_file(c))

        # Status / resolution badge
        if is_resolved:
            res = self.resolutions[cf.path]
            badge_text = f"→ {res.value}"
            badge_color = Colors.SUCCESS
        else:
            badge_text = cf.display_status
            if cf.conflict_type == ConflictType.TEXT and cf.marker_count > 0:
                badge_text += f" ({cf.marker_count} conflict{'s' if cf.marker_count != 1 else ''})"
            badge_color = Colors.TEXT_TERTIARY

        badge = ctk.CTkLabel(
            row,
            text=badge_text,
            font=Fonts.TINY,
            text_color=badge_color,
        )
        badge.pack(side="right", padx=(Spacing.SM, 0))
        badge.bind("<Button-1>", lambda e, c=cf: self._select_file(c))

        # Undo button for resolved files
        if is_resolved:
            undo_btn = ctk.CTkButton(
                row,
                text="Undo",
                command=lambda p=cf.path: self._undo_resolution(p),
                fg_color="transparent",
                hover_color=Colors.BG_HOVER,
                text_color=Colors.TEXT_SECONDARY,
                border_width=1,
                border_color=Colors.BORDER,
                width=48,
                height=24,
                corner_radius=6,
                font=Fonts.TINY,
            )
            undo_btn.pack(side="right", padx=(Spacing.XS, 0))

    def _select_file(self, cf: ConflictFile) -> None:
        """Select a file and show its diff."""
        self.selected_file = cf
        self._update_file_list()
        self._show_diff(cf)
        self._diff_filepath.configure(text=cf.path)

        # Update labels
        if cf.hunks:
            self._ours_label.configure(text=f"  OURS ({cf.hunks[0].ours_label})")
            self._theirs_label.configure(text=f"  THEIRS ({cf.hunks[0].theirs_label})")
        else:
            self._ours_label.configure(text="  OURS (HEAD)")
            self._theirs_label.configure(text="  THEIRS (incoming)")

    def _show_diff(self, cf: ConflictFile) -> None:
        """Display the conflict diff for a file."""
        # Hide empty state
        self._diff_empty.grid_forget()

        # Enable writing
        self._ours_text.configure(state="normal")
        self._theirs_text.configure(state="normal")
        self._ours_text.delete("1.0", "end")
        self._theirs_text.delete("1.0", "end")

        if cf.conflict_type == ConflictType.BINARY:
            self._show_binary_conflict(cf)
        elif cf.conflict_type in (ConflictType.DELETED_BY_US, ConflictType.DELETED_BY_THEM):
            self._show_deletion_conflict(cf)
        else:
            self._show_text_conflict(cf)

        # Disable editing
        self._ours_text.configure(state="disabled")
        self._theirs_text.configure(state="disabled")

        # Scroll to top
        self._ours_text.yview_moveto(0)
        self._theirs_text.yview_moveto(0)

    def _show_text_conflict(self, cf: ConflictFile) -> None:
        """Render side-by-side text conflict with highlighted hunks."""
        # Get full content from both sides
        ours_content = get_file_at_ref(self.repo_path, cf.path, "ours")
        theirs_content = get_file_at_ref(self.repo_path, cf.path, "theirs")

        if ours_content and theirs_content:
            # Show full side-by-side content
            ours_lines = ours_content.splitlines()
            theirs_lines = theirs_content.splitlines()

            max_lines = max(len(ours_lines), len(theirs_lines))

            for i in range(max_lines):
                ours_line = ours_lines[i] if i < len(ours_lines) else ""
                theirs_line = theirs_lines[i] if i < len(theirs_lines) else ""

                line_num = f"{i + 1:4d}  "
                self._ours_text.insert("end", line_num, "line_num")
                self._theirs_text.insert("end", line_num, "line_num")

                if i >= len(ours_lines):
                    self._ours_text.insert("end", "\n", "empty")
                    self._theirs_text.insert("end", theirs_line + "\n", "conflict_theirs")
                elif i >= len(theirs_lines):
                    self._ours_text.insert("end", ours_line + "\n", "conflict_ours")
                    self._theirs_text.insert("end", "\n", "empty")
                elif ours_line != theirs_line:
                    self._ours_text.insert("end", ours_line + "\n", "conflict_ours")
                    self._theirs_text.insert("end", theirs_line + "\n", "conflict_theirs")
                else:
                    self._ours_text.insert("end", ours_line + "\n", "context")
                    self._theirs_text.insert("end", theirs_line + "\n", "context")
        else:
            # Fallback: parse conflict markers from working copy
            self._show_marker_conflict(cf)

    def _show_marker_conflict(self, cf: ConflictFile) -> None:
        """Show conflict using parsed markers from the working copy."""
        lines = cf.full_content.splitlines()
        in_ours = False
        in_theirs = False
        line_num_ours = 0
        line_num_theirs = 0

        for line in lines:
            if line.startswith("<<<<<<< "):
                in_ours = True
                # Show marker
                self._ours_text.insert("end", f"{'':4s}  {line}\n", "marker")
                self._theirs_text.insert("end", f"{'':4s}  {line}\n", "marker")
                continue
            elif line.startswith("======="):
                in_ours = False
                in_theirs = True
                self._ours_text.insert("end", f"{'':4s}  {'=' * 40}\n", "marker")
                self._theirs_text.insert("end", f"{'':4s}  {'=' * 40}\n", "marker")
                continue
            elif line.startswith(">>>>>>> "):
                in_theirs = False
                self._ours_text.insert("end", f"{'':4s}  {line}\n", "marker")
                self._theirs_text.insert("end", f"{'':4s}  {line}\n", "marker")
                continue

            if in_ours:
                line_num_ours += 1
                self._ours_text.insert("end", f"{line_num_ours:4d}  {line}\n", "conflict_ours")
                self._theirs_text.insert("end", f"{'':4s}  \n", "empty")
            elif in_theirs:
                line_num_theirs += 1
                self._ours_text.insert("end", f"{'':4s}  \n", "empty")
                self._theirs_text.insert("end", f"{line_num_theirs:4d}  {line}\n", "conflict_theirs")
            else:
                line_num_ours += 1
                line_num_theirs += 1
                self._ours_text.insert("end", f"{line_num_ours:4d}  {line}\n", "context")
                self._theirs_text.insert("end", f"{line_num_theirs:4d}  {line}\n", "context")

    def _show_binary_conflict(self, cf: ConflictFile) -> None:
        """Show binary conflict (no diff possible)."""
        msg = (
            "This is a binary file conflict.\n\n"
            "Binary files cannot be merged automatically.\n"
            "Choose 'Use Ours' or 'Use Theirs' to resolve.\n\n"
            f"File: {cf.path}\n"
            f"Status: {cf.display_status}"
        )
        self._ours_text.insert("end", msg, "context")
        self._theirs_text.insert("end", msg, "context")

    def _show_deletion_conflict(self, cf: ConflictFile) -> None:
        """Show deletion conflict."""
        if cf.conflict_type == ConflictType.DELETED_BY_US:
            msg_ours = "This file was DELETED in our branch."
            msg_theirs = "This file was MODIFIED in their branch."
        else:
            msg_ours = "This file was MODIFIED in our branch."
            msg_theirs = "This file was DELETED in their branch."

        self._ours_text.insert("end", f"\n  {msg_ours}\n", "deleted")
        self._theirs_text.insert("end", f"\n  {msg_theirs}\n", "deleted")

    # ── Resolution Actions ──────────────────────────────────────

    def _resolve_selected(self, resolution: Resolution) -> None:
        """Resolve the currently selected file."""
        if not self.selected_file:
            return

        path = self.selected_file.path
        ok, msg = resolve_file(self.repo_path, path, resolution, self.log)

        if ok:
            self.resolutions[path] = resolution
            self._update_file_list()
            self._update_banner()

            # Auto-advance to next unresolved file
            self._advance_to_next()
        else:
            if self.log:
                self.log("error", f"Resolution failed: {msg}")
            # Show error in banner
            self._banner.configure(fg_color=Colors.ERROR_BG)
            self._banner_icon.configure(text="\u2717", text_color=Colors.ERROR)
            self._banner_text.configure(
                text=f"Failed to resolve {path}: {msg}",
                text_color=Colors.ERROR,
            )
            # Reset banner after 3 seconds
            self.after(3000, self._update_banner)

    def _undo_resolution(self, path: str) -> None:
        """Undo a resolution."""
        if path in self.resolutions:
            del self.resolutions[path]
            # Re-checkout the conflicted version
            from .git_engine import _run
            _run(["git", "checkout", "--merge", "--", path], cwd=self.repo_path)
            # Reload conflicts
            self._load_conflicts()

    def _advance_to_next(self) -> None:
        """Advance to the next unresolved file."""
        for cf in self.conflicts:
            if cf.path not in self.resolutions:
                self._select_file(cf)
                return

    def _update_banner(self) -> None:
        """Update the banner to reflect resolution progress."""
        total = len(self.conflicts)
        resolved = len(self.resolutions)
        remaining = total - resolved

        if remaining == 0 and total > 0:
            self._banner.configure(fg_color=Colors.SUCCESS_BG)
            self._banner_icon.configure(text="\u2713", text_color=Colors.SUCCESS)
            self._banner_text.configure(
                text="All conflicts resolved — ready to commit",
                text_color=Colors.SUCCESS,
            )
            self._banner_count.configure(text=f"{resolved}/{total}", text_color=Colors.SUCCESS)
            self._btn_commit.configure(state="normal")
        else:
            self._banner.configure(fg_color=Colors.WARNING_BG)
            self._banner_icon.configure(text="\u26A0", text_color=Colors.WARNING)
            self._banner_text.configure(
                text=f"Resolve all conflicts to complete the merge ({remaining} remaining)",
                text_color=Colors.WARNING,
            )
            self._banner_count.configure(text=f"{resolved}/{total}", text_color=Colors.WARNING)
            self._btn_commit.configure(state="disabled")

    def _open_in_editor(self) -> None:
        """Open the selected file in the default editor."""
        if not self.selected_file:
            return
        filepath = Path(self.repo_path) / self.selected_file.path
        if filepath.exists():
            try:
                os.startfile(str(filepath))
            except Exception:
                subprocess.Popen(["notepad", str(filepath)])

    def _on_commit(self) -> None:
        """Commit the merge resolution."""
        ok, msg = resolve_all_and_commit(self.repo_path, self.resolutions, self.log)

        if ok:
            if self.on_resolved:
                self.on_resolved()
            self.destroy()
        else:
            # Show error in banner
            self._banner.configure(fg_color=Colors.ERROR_BG)
            self._banner_icon.configure(text="\u2717", text_color=Colors.ERROR)
            self._banner_text.configure(text=f"Commit failed: {msg}", text_color=Colors.ERROR)

    def _on_abort(self) -> None:
        """Abort the merge."""
        ok, msg = abort_merge(self.repo_path, self.log)
        if ok:
            if self.on_resolved:
                self.on_resolved()
            self.destroy()
