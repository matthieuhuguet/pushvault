"""Branch Explorer dialog — compare remote branches and pull missing files locally."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Optional

import customtkinter as ctk

from .git_engine import (
    get_files_on_branch,
    get_local_files,
    list_remote_branches,
    pull_file_from_branch,
)
from .models import RepoConfig
from .theme import Colors, Fonts, Spacing, hex_blend

if TYPE_CHECKING:
    from .ui_main import PushVaultApp


class BranchExplorerDialog(ctk.CTkToplevel):
    """Modal-style window to browse remote branches and pull missing files."""

    def __init__(self, parent, repo: RepoConfig, app: "PushVaultApp"):
        super().__init__(parent)
        self.repo = repo
        self.app = app

        self.title(f"Branch Explorer — {repo.name}")
        self.geometry("680x600")
        self.resizable(True, True)
        self.configure(fg_color=Colors.BG_PRIMARY)

        # Lift over parent
        self.transient(parent)
        self.after(50, self.lift)

        # State
        self._branches: list[str] = []
        self._selected_branch: Optional[str] = None
        self._local_files: set[str] = set()
        self._branch_files: list[str] = []
        # {filepath: BooleanVar (checked)}
        self._row_vars: dict[str, ctk.BooleanVar] = {}
        self._loading = False

        self._build_ui()
        self._load_branches()

    # ── Layout ───────────────────────────────────────────────────

    def _build_ui(self) -> None:
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # ── Header ──
        hdr = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, corner_radius=0)
        hdr.grid(row=0, column=0, sticky="ew")
        hdr.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            hdr, text="⊕", font=(Fonts.TITLE[0], 16),
            text_color=Colors.ACCENT, width=28,
        ).grid(row=0, column=0, padx=(Spacing.LG, Spacing.SM), pady=Spacing.MD)

        ctk.CTkLabel(
            hdr, text=f"Branch Explorer  ·  {self.repo.name}",
            font=Fonts.HEADING, text_color=Colors.TEXT_PRIMARY, anchor="w",
        ).grid(row=0, column=1, sticky="w")

        ctk.CTkButton(
            hdr, text="✕", width=28, height=28,
            fg_color="transparent", hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_TERTIARY, font=Fonts.SMALL,
            command=self.destroy,
        ).grid(row=0, column=2, padx=Spacing.MD)

        # ── Branch selector row ──
        sel_frame = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, corner_radius=0)
        sel_frame.grid(row=1, column=0, sticky="ew", pady=(1, 0))
        sel_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            sel_frame, text="Branch:", font=Fonts.SMALL_BOLD,
            text_color=Colors.TEXT_SECONDARY,
        ).grid(row=0, column=0, padx=(Spacing.LG, Spacing.SM), pady=Spacing.SM)

        self._branch_var = ctk.StringVar(value="Loading…")
        self._branch_menu = ctk.CTkOptionMenu(
            sel_frame,
            variable=self._branch_var,
            values=["Loading…"],
            command=self._on_branch_selected,
            fg_color=Colors.BG_TERTIARY,
            button_color=Colors.BG_HOVER,
            button_hover_color=Colors.ACCENT_MUTED,
            text_color=Colors.TEXT_PRIMARY,
            font=Fonts.SMALL,
            height=30,
            dynamic_resizing=False,
            width=320,
        )
        self._branch_menu.grid(row=0, column=1, sticky="w", padx=(0, Spacing.SM), pady=Spacing.SM)

        self._refresh_btn = ctk.CTkButton(
            sel_frame, text="↺ Refresh", width=80, height=30,
            font=Fonts.SMALL, corner_radius=15,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            command=self._load_branches,
        )
        self._refresh_btn.grid(row=0, column=2, padx=(0, Spacing.LG), pady=Spacing.SM)

        # Status / filter bar
        filter_frame = ctk.CTkFrame(sel_frame, fg_color="transparent")
        filter_frame.grid(row=1, column=0, columnspan=3, sticky="ew",
                          padx=Spacing.LG, pady=(0, Spacing.SM))
        filter_frame.grid_columnconfigure(1, weight=1)

        self._status_label = ctk.CTkLabel(
            filter_frame, text="Select a branch to compare files.",
            font=Fonts.SMALL, text_color=Colors.TEXT_TERTIARY, anchor="w",
        )
        self._status_label.grid(row=0, column=0, sticky="w")

        self._filter_var = ctk.StringVar()
        self._filter_var.trace_add("write", self._on_filter_changed)
        self._filter_entry = ctk.CTkEntry(
            filter_frame, placeholder_text="Filter files…",
            textvariable=self._filter_var,
            fg_color=Colors.BG_INPUT, border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY, font=Fonts.SMALL,
            height=26, width=180,
        )
        self._filter_entry.grid(row=0, column=2, sticky="e")

        # ── File list ──
        list_outer = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, corner_radius=0)
        list_outer.grid(row=2, column=0, sticky="nsew", pady=(1, 0))
        list_outer.grid_rowconfigure(0, weight=1)
        list_outer.grid_columnconfigure(0, weight=1)

        self._scroll = ctk.CTkScrollableFrame(
            list_outer,
            fg_color=Colors.BG_SECONDARY,
            scrollbar_button_color=Colors.SCROLLBAR,
            scrollbar_button_hover_color=Colors.SCROLLBAR_HOVER,
        )
        self._scroll.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)
        self._scroll.grid_columnconfigure(0, weight=1)

        self._empty_label = ctk.CTkLabel(
            self._scroll, text="",
            font=Fonts.SMALL, text_color=Colors.TEXT_TERTIARY,
        )
        self._empty_label.grid(row=0, column=0, pady=Spacing.XL)

        # ── Footer ──
        footer = ctk.CTkFrame(self, fg_color=Colors.BG_SECONDARY, corner_radius=0)
        footer.grid(row=3, column=0, sticky="ew", pady=(1, 0))
        footer.grid_columnconfigure(0, weight=1)

        self._select_missing_btn = ctk.CTkButton(
            footer, text="Select Missing",
            width=120, height=32, corner_radius=16,
            font=Fonts.SMALL_BOLD,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            command=self._select_missing,
            state="disabled",
        )
        self._select_missing_btn.grid(row=0, column=0, sticky="w",
                                      padx=Spacing.LG, pady=Spacing.SM)

        self._select_all_btn = ctk.CTkButton(
            footer, text="Select All",
            width=90, height=32, corner_radius=16,
            font=Fonts.SMALL,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            command=self._select_all,
            state="disabled",
        )
        self._select_all_btn.grid(row=0, column=1, padx=(0, Spacing.SM), pady=Spacing.SM)

        self._deselect_btn = ctk.CTkButton(
            footer, text="Clear",
            width=60, height=32, corner_radius=16,
            font=Fonts.SMALL,
            fg_color=Colors.BG_TERTIARY, hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            command=self._deselect_all,
            state="disabled",
        )
        self._deselect_btn.grid(row=0, column=2, padx=(0, Spacing.LG), pady=Spacing.SM)

        self._pull_btn = ctk.CTkButton(
            footer, text="↓ Pull Selected (0)",
            height=32, corner_radius=16,
            font=Fonts.SMALL_BOLD,
            fg_color=Colors.ACCENT, hover_color=Colors.ACCENT_HOVER,
            text_color="#FFFFFF",
            command=self._pull_selected,
            state="disabled",
        )
        self._pull_btn.grid(row=0, column=3, sticky="e",
                            padx=(0, Spacing.LG), pady=Spacing.SM)

    # ── Data loading ─────────────────────────────────────────────

    def _load_branches(self) -> None:
        self._set_loading(True)
        self._status_label.configure(text="Fetching branches…", text_color=Colors.TEXT_TERTIARY)
        threading.Thread(target=self._fetch_branches_bg, daemon=True).start()

    def _fetch_branches_bg(self) -> None:
        branches = list_remote_branches(self.repo.path)
        self.after(0, self._on_branches_loaded, branches)

    def _on_branches_loaded(self, branches: list[str]) -> None:
        self._branches = branches
        self._set_loading(False)

        if not branches:
            self._status_label.configure(
                text="No remote branches found. Is the remote reachable?",
                text_color=Colors.WARNING,
            )
            self._branch_menu.configure(values=["(none)"])
            self._branch_var.set("(none)")
            return

        self._branch_menu.configure(values=branches)
        preferred = branches[0]
        self._branch_var.set(preferred)
        self._status_label.configure(
            text=f"{len(branches)} branch(es) found.",
            text_color=Colors.TEXT_TERTIARY,
        )
        self._on_branch_selected(preferred)

    def _on_branch_selected(self, branch: str) -> None:
        if branch in ("(none)", "Loading…"):
            return
        self._selected_branch = branch
        self._clear_file_list()
        self._set_loading(True)
        self._status_label.configure(
            text=f"Loading files on {branch}…",
            text_color=Colors.TEXT_TERTIARY,
        )
        threading.Thread(
            target=self._fetch_files_bg, args=(branch,), daemon=True
        ).start()

    def _fetch_files_bg(self, branch: str) -> None:
        branch_files = get_files_on_branch(self.repo.path, branch)
        local_files = get_local_files(self.repo.path)
        self.after(0, self._on_files_loaded, branch, branch_files, local_files)

    def _on_files_loaded(
        self,
        branch: str,
        branch_files: list[str],
        local_files: set[str],
    ) -> None:
        if branch != self._selected_branch:
            return  # Stale response
        self._branch_files = branch_files
        self._local_files = local_files
        self._set_loading(False)
        self._populate_file_list(branch_files, local_files)

    # ── File list rendering ───────────────────────────────────────

    def _clear_file_list(self) -> None:
        self._row_vars.clear()
        for w in self._scroll.winfo_children():
            w.destroy()
        self._empty_label = ctk.CTkLabel(
            self._scroll, text="",
            font=Fonts.SMALL, text_color=Colors.TEXT_TERTIARY,
        )
        self._empty_label.grid(row=0, column=0, pady=Spacing.XL)
        self._update_pull_btn()

    def _populate_file_list(self, branch_files: list[str], local_files: set[str]) -> None:
        self._clear_file_list()
        filter_text = self._filter_var.get().lower()

        missing = [f for f in branch_files if f not in local_files]
        present = [f for f in branch_files if f in local_files]

        total = len(branch_files)
        missing_count = len(missing)
        self._status_label.configure(
            text=f"{total} file(s) on branch · {missing_count} missing locally",
            text_color=Colors.TEXT_SECONDARY if total else Colors.TEXT_TERTIARY,
        )

        if not branch_files:
            self._empty_label.configure(text="No files found on this branch.")
            self._select_missing_btn.configure(state="disabled")
            self._select_all_btn.configure(state="disabled")
            self._deselect_btn.configure(state="disabled")
            return

        self._select_missing_btn.configure(state="normal")
        self._select_all_btn.configure(state="normal")
        self._deselect_btn.configure(state="normal")

        row_idx = 0

        def _add_section_header(title: str, count: int, color: str) -> None:
            nonlocal row_idx
            hdr = ctk.CTkFrame(self._scroll, fg_color="transparent")
            hdr.grid(row=row_idx, column=0, sticky="ew",
                     padx=Spacing.MD, pady=(Spacing.SM, Spacing.XS))
            hdr.grid_columnconfigure(1, weight=1)
            ctk.CTkLabel(
                hdr, text=title.upper(),
                font=Fonts.SMALL_BOLD, text_color=color, anchor="w",
            ).grid(row=0, column=0)
            if count:
                badge = ctk.CTkFrame(
                    hdr,
                    fg_color=hex_blend(color, Colors.BG_PRIMARY, 0.82),
                    corner_radius=8, height=18,
                )
                badge.grid(row=0, column=1, padx=(Spacing.SM, 0), sticky="w")
                ctk.CTkLabel(
                    badge, text=str(count), font=Fonts.TINY, text_color=color,
                ).pack(padx=6)
            # Separator line
            row_idx += 1
            sep = ctk.CTkFrame(self._scroll, fg_color=Colors.BORDER_SUBTLE, height=1)
            sep.grid(row=row_idx, column=0, sticky="ew", padx=Spacing.MD)
            row_idx += 1

        def _add_file_row(filepath: str, is_missing: bool) -> None:
            nonlocal row_idx
            if filter_text and filter_text not in filepath.lower():
                return
            var = ctk.BooleanVar(value=False)
            self._row_vars[filepath] = var
            var.trace_add("write", lambda *_: self._update_pull_btn())

            row_bg = Colors.BG_SECONDARY
            row_hover = Colors.BG_HOVER
            row = ctk.CTkFrame(self._scroll, fg_color=row_bg, corner_radius=6)
            row.grid(row=row_idx, column=0, sticky="ew",
                     padx=Spacing.SM, pady=1)
            row.grid_columnconfigure(1, weight=1)

            cb = ctk.CTkCheckBox(
                row, text="", variable=var,
                checkbox_width=16, checkbox_height=16,
                fg_color=Colors.ACCENT, hover_color=Colors.ACCENT_HOVER,
                border_color=Colors.BORDER,
                width=24,
            )
            cb.grid(row=0, column=0, padx=(Spacing.SM, 0), pady=Spacing.XS)

            # Status badge
            if is_missing:
                badge_color = Colors.WARNING
                badge_text = "MISSING"
                badge_bg = Colors.WARNING_BG
            else:
                badge_color = Colors.SUCCESS
                badge_text = "EXISTS"
                badge_bg = Colors.SUCCESS_BG

            badge = ctk.CTkFrame(row, fg_color=badge_bg, corner_radius=6, height=18)
            badge.grid(row=0, column=1, sticky="w", padx=(Spacing.XS, 0), pady=Spacing.XS)
            ctk.CTkLabel(
                badge, text=badge_text, font=Fonts.TINY, text_color=badge_color,
            ).pack(padx=5)

            # Filename (truncated display, full path as tooltip-like label)
            display = filepath if len(filepath) < 60 else "…" + filepath[-57:]
            ctk.CTkLabel(
                row, text=display,
                font=Fonts.MONO_SMALL,
                text_color=Colors.TEXT_PRIMARY if is_missing else Colors.TEXT_SECONDARY,
                anchor="w",
            ).grid(row=0, column=2, sticky="ew", padx=(Spacing.SM, Spacing.SM))
            row.grid_columnconfigure(2, weight=1)

            row_idx += 1

        # MISSING section first
        _add_section_header("Missing locally", len(missing), Colors.WARNING)
        if missing:
            for f in missing:
                _add_file_row(f, is_missing=True)
        else:
            no_label = ctk.CTkLabel(
                self._scroll,
                text="All branch files are present locally.",
                font=Fonts.SMALL, text_color=Colors.SUCCESS,
                anchor="w",
            )
            no_label.grid(row=row_idx, column=0, sticky="w",
                          padx=Spacing.LG, pady=Spacing.XS)
            row_idx += 1

        # PRESENT section
        _add_section_header("Present locally", len(present), Colors.SUCCESS)
        for f in present:
            _add_file_row(f, is_missing=False)

        self._update_pull_btn()

    def _on_filter_changed(self, *_) -> None:
        if self._branch_files:
            self._populate_file_list(self._branch_files, self._local_files)

    # ── Selection helpers ─────────────────────────────────────────

    def _select_missing(self) -> None:
        for filepath, var in self._row_vars.items():
            var.set(filepath not in self._local_files)

    def _select_all(self) -> None:
        for var in self._row_vars.values():
            var.set(True)

    def _deselect_all(self) -> None:
        for var in self._row_vars.values():
            var.set(False)

    def _selected_files(self) -> list[str]:
        return [fp for fp, var in self._row_vars.items() if var.get()]

    def _update_pull_btn(self) -> None:
        n = len(self._selected_files())
        if n > 0:
            self._pull_btn.configure(
                text=f"↓ Pull Selected ({n})",
                state="normal",
            )
        else:
            self._pull_btn.configure(
                text="↓ Pull Selected (0)",
                state="disabled",
            )

    # ── Pull action ───────────────────────────────────────────────

    def _pull_selected(self) -> None:
        files = self._selected_files()
        if not files or not self._selected_branch:
            return
        branch = self._selected_branch
        self._set_loading(True)
        self._status_label.configure(
            text=f"Pulling {len(files)} file(s) from {branch}…",
            text_color=Colors.INFO,
        )
        threading.Thread(
            target=self._pull_bg, args=(branch, files), daemon=True
        ).start()

    def _pull_bg(self, branch: str, files: list[str]) -> None:
        results: list[tuple[str, bool, str]] = []
        for filepath in files:
            ok, msg = pull_file_from_branch(self.repo.path, branch, filepath)
            results.append((filepath, ok, msg))
        self.after(0, self._on_pull_done, branch, results)

    def _on_pull_done(
        self, branch: str, results: list[tuple[str, bool, str]]
    ) -> None:
        self._set_loading(False)
        ok_count = sum(1 for _, ok, _ in results if ok)
        fail_count = len(results) - ok_count

        if fail_count == 0:
            self._status_label.configure(
                text=f"✓ Pulled {ok_count} file(s) from {branch}.",
                text_color=Colors.SUCCESS,
            )
        else:
            failed_names = ", ".join(fp.split("/")[-1] for fp, ok, _ in results if not ok)
            self._status_label.configure(
                text=f"✓ {ok_count} pulled · ✗ {fail_count} failed ({failed_names})",
                text_color=Colors.WARNING,
            )

        # Refresh local file set and re-render
        local_files = get_local_files(self.repo.path)
        self._local_files = local_files
        self._populate_file_list(self._branch_files, local_files)

        # Notify main app to refresh status cards
        self.after(500, lambda: self.app.refresh_repo_status(self.repo))

    # ── Utility ───────────────────────────────────────────────────

    def _set_loading(self, loading: bool) -> None:
        self._loading = loading
        state = "disabled" if loading else "normal"
        self._branch_menu.configure(state=state)
        self._refresh_btn.configure(state=state)
