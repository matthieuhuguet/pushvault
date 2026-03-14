"""Main PushVault window — multi-repo backup dashboard."""

from __future__ import annotations

import tkinter as tk
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Optional

import customtkinter as ctk

try:
    from PIL import Image, ImageTk
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

_ASSETS_DIR = Path(__file__).parent.parent / "assets"
_ICON_256 = _ASSETS_DIR / "icon_256.png"
_ICON_32  = _ASSETS_DIR / "icon_32.png"

from . import __version__
from .config import load_config
from .git_engine import commit_push, fetch, get_status, pull, sync_all
from .models import AppConfig, LogEntry, RepoConfig, RepoStatus, SyncState
from .theme import Colors, Fonts, Spacing, hex_blend
from .tray import create_tray_icon, run_tray_icon, stop_tray_icon
from .ui_card import RepoCard
from .ui_conflicts import ConflictDialog
from .ui_staging import StagingPanel


class PushVaultApp(ctk.CTk):
    """Main application window."""

    def __init__(self, config_path: Path):
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("dark-blue")

        self.config_path = config_path
        self.cfg = load_config(config_path)

        self.title("PushVault")
        self.geometry(f"{self.cfg.window_width}x{self.cfg.window_height}")
        self.minsize(360, 600)
        self.configure(fg_color=Colors.BG_PRIMARY)

        self._set_window_icon()
        self.after(10, self._set_dark_titlebar)

        # State
        self.cards: dict[str, RepoCard] = {}
        self.logs: list[LogEntry] = []
        self.executor = ThreadPoolExecutor(max_workers=4)
        self._auto_timer: Optional[str] = None
        self._tray_icon = None
        self._is_syncing = False
        self._log_window: Optional[ctk.CTkToplevel] = None
        self._staging_windows: dict[str, StagingPanel] = {}
        self._pending_remote_checks: int = 0

        self._build_ui()
        self._setup_tray()
        self._start_auto_check()

        self.after(300, self._refresh_all_local)

        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.bind("<Escape>", lambda e: self._minimize_to_tray())
        self.bind("<Control-r>", lambda e: self._refresh_all_remote())
        self.bind("<Control-s>", lambda e: self._sync_all())
        self.bind("<Control-l>", lambda e: self._toggle_log())

    def _set_window_icon(self) -> None:
        """Set the window icon from the ZenRay PNG asset."""
        if not _PIL_AVAILABLE:
            return
        try:
            for path in (_ICON_256, _ICON_32):
                if path.exists():
                    img = Image.open(path).convert("RGBA").resize((32, 32), Image.LANCZOS)
                    photo = ImageTk.PhotoImage(img)
                    self.iconphoto(True, photo)
                    self._icon_photo = photo  # prevent GC
                    break
        except Exception:
            pass

    def _set_dark_titlebar(self) -> None:
        """Apply Windows 11 dark titlebar without the withdraw/deiconify flash."""
        try:
            import ctypes
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
            if hwnd:
                ctypes.windll.dwmapi.DwmSetWindowAttribute(
                    hwnd, 20,
                    ctypes.byref(ctypes.c_int(1)), ctypes.sizeof(ctypes.c_int)
                )
        except Exception:
            pass

    def _build_ui(self) -> None:
        self.grid_rowconfigure(2, weight=1)
        self.grid_columnconfigure(0, weight=1)

        # ── Header ──
        header = ctk.CTkFrame(self, fg_color=Colors.BG_PRIMARY, corner_radius=0, height=52)
        header.grid(row=0, column=0, sticky="ew")
        header.grid_columnconfigure(1, weight=1)
        header.grid_propagate(False)

        title_frame = ctk.CTkFrame(header, fg_color="transparent")
        title_frame.grid(row=0, column=0, padx=Spacing.LG, pady=Spacing.SM, sticky="w")

        # Header logo — ZenRay icon if available, fallback to "PV" badge
        if _PIL_AVAILABLE and _ICON_32.exists():
            _logo_ctk = ctk.CTkImage(
                light_image=Image.open(_ICON_32).convert("RGBA"),
                dark_image=Image.open(_ICON_32).convert("RGBA"),
                size=(32, 32),
            )
            ctk.CTkLabel(
                title_frame,
                image=_logo_ctk,
                text="",
                width=32, height=32,
            ).pack(side="left", padx=(0, Spacing.SM))
        else:
            ctk.CTkLabel(
                title_frame,
                text="PV",
                font=("Segoe UI Variable", 12, "bold"),
                fg_color=Colors.ACCENT,
                corner_radius=8,
                width=32,
                height=32,
                text_color="#FFFFFF",
            ).pack(side="left", padx=(0, Spacing.SM))

        ctk.CTkLabel(
            title_frame,
            text="PushVault",
            font=(Fonts.BODY_BOLD[0], 13, "bold"),
            text_color=Colors.TEXT_PRIMARY,
        ).pack(side="left")

        # Live indicator
        self._live_dot = ctk.CTkLabel(
            header, text="●",
            font=("Segoe UI", 7),
            text_color=Colors.SUCCESS, width=10,
        )
        self._live_dot.grid(row=0, column=1, sticky="e")

        self._live_label = ctk.CTkLabel(
            header, text="LIVE",
            font=(Fonts.TINY[0], 8, "bold"),
            text_color=Colors.SUCCESS,
            width=30,
        )
        self._live_label.grid(row=0, column=2, sticky="e")

        self._log_btn = ctk.CTkButton(
            header, text="☰",
            command=self._toggle_log,
            fg_color="transparent", hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_TERTIARY,
            width=36, height=36, corner_radius=8,
            font=("Segoe UI", 15), border_width=0,
        )
        self._log_btn.grid(row=0, column=3, padx=(0, Spacing.SM))

        # ── Action bar — Sync All as a big green pill ──
        action = ctk.CTkFrame(self, fg_color=Colors.BG_PRIMARY, corner_radius=0, height=64)
        action.grid(row=1, column=0, sticky="ew")
        action.grid_columnconfigure(0, weight=1)
        action.grid_propagate(False)

        inner = ctk.CTkFrame(action, fg_color="transparent")
        inner.grid(row=0, column=0, sticky="ew", padx=Spacing.LG, pady=Spacing.MD)
        inner.grid_columnconfigure(0, weight=1)

        self._sync_btn = ctk.CTkButton(
            inner,
            text="↑↓  Sync All",
            command=self._sync_all,
            fg_color=Colors.SUCCESS,
            hover_color=hex_blend(Colors.SUCCESS, "#FFFFFF", 0.15),
            text_color="#000000",
            height=40,
            corner_radius=20,
            font=(Fonts.BODY_BOLD[0], 12, "bold"),
        )
        self._sync_btn.grid(row=0, column=0, sticky="ew")

        self._fetch_btn = ctk.CTkButton(
            inner,
            text="↓",
            command=self._refresh_all_remote,
            fg_color=Colors.BG_TERTIARY,
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            height=40,
            width=44,
            corner_radius=20,
            font=("Segoe UI", 14),
            border_width=0,
        )
        self._fetch_btn.grid(row=0, column=1, padx=(Spacing.SM, 0))

        # ── Repo cards ──
        self._cards_frame = ctk.CTkScrollableFrame(
            self,
            fg_color="transparent",
            scrollbar_button_color=Colors.SCROLLBAR,
            scrollbar_button_hover_color=Colors.SCROLLBAR_HOVER,
        )
        self._cards_frame.grid(row=2, column=0, sticky="nsew", padx=Spacing.MD, pady=(0, 0))
        self._cards_frame.grid_columnconfigure(0, weight=1)

        for i, repo in enumerate(self.cfg.repos):
            card = RepoCard(self._cards_frame, repo, self)
            card.grid(row=i, column=0, sticky="ew", pady=(0, Spacing.SM))
            self.cards[repo.name] = card

        # ── Footer — minimal summary bar ──
        footer = ctk.CTkFrame(self, fg_color=Colors.BG_PRIMARY, corner_radius=0, height=32)
        footer.grid(row=3, column=0, sticky="ew")
        footer.grid_columnconfigure(0, weight=1)
        footer.grid_propagate(False)

        self._summary = ctk.CTkLabel(
            footer, text="",
            font=Fonts.TINY,
            text_color=Colors.TEXT_TERTIARY,
            anchor="center",
        )
        self._summary.grid(row=0, column=0, sticky="ew", padx=Spacing.LG)

    # ── Logging ──────────────────────────────────────────────────

    def log(self, level: str, message: str, repo: str = "") -> None:
        entry = LogEntry(
            timestamp=datetime.now().strftime("%H:%M:%S"),
            repo=repo,
            message=message,
            level=level,
        )
        self.logs.append(entry)
        if len(self.logs) > 1000:
            self.logs = self.logs[-1000:]
        if self._log_window and self._log_window.winfo_exists():
            self._append_log_entry(entry)

    def _toggle_log(self) -> None:
        if self._log_window and self._log_window.winfo_exists():
            self._log_window.destroy()
            self._log_window = None
            return

        self._log_window = ctk.CTkToplevel(self)
        self._log_window.title("PushVault — Activity Log")
        self._log_window.geometry("700x480")
        self._log_window.configure(fg_color=Colors.BG_PRIMARY)
        self._log_window.transient(self)
        self._log_window.after(10, lambda: self._set_dark_titlebar_for(self._log_window))

        lh = ctk.CTkFrame(self._log_window, fg_color=Colors.BG_SECONDARY, height=40, corner_radius=0)
        lh.pack(fill="x")

        ctk.CTkLabel(lh, text="Activity Log", font=Fonts.BODY_BOLD, text_color=Colors.TEXT_PRIMARY).pack(
            side="left", padx=Spacing.LG, pady=Spacing.SM)

        ctk.CTkButton(
            lh, text="Clear", command=self._clear_log,
            fg_color="transparent", hover_color=Colors.BG_HOVER, text_color=Colors.TEXT_SECONDARY,
            height=24, width=50, corner_radius=6, font=Fonts.SMALL, border_width=0,
        ).pack(side="right", padx=Spacing.LG, pady=Spacing.XS)

        self._log_text = tk.Text(
            self._log_window, wrap="word",
            font=(Fonts.MONO[0], Fonts.MONO[1]),
            bg=Colors.BG_PRIMARY, fg=Colors.TEXT_SECONDARY,
            insertbackground=Colors.TEXT_PRIMARY,
            relief="flat", borderwidth=0, padx=12, pady=8, state="disabled",
        )
        self._log_text.pack(fill="both", expand=True)

        self._log_text.tag_configure("time", foreground=Colors.TEXT_TERTIARY)
        self._log_text.tag_configure("info", foreground=Colors.TEXT_SECONDARY)
        self._log_text.tag_configure("success", foreground=Colors.SUCCESS)
        self._log_text.tag_configure("warning", foreground=Colors.WARNING)
        self._log_text.tag_configure("error", foreground=Colors.ERROR)
        self._log_text.tag_configure("repo", foreground=Colors.ACCENT)

        for entry in self.logs[-200:]:
            self._append_log_entry(entry)
        self._log_window.bind("<Escape>", lambda e: self._log_window.destroy())

    def _set_dark_titlebar_for(self, window: ctk.CTkToplevel) -> None:
        try:
            import ctypes
            hwnd = ctypes.windll.user32.GetParent(window.winfo_id())
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, 20, ctypes.byref(ctypes.c_int(1)), ctypes.sizeof(ctypes.c_int)
            )
        except Exception:
            pass

    def _append_log_entry(self, entry: LogEntry) -> None:
        if not self._log_window or not self._log_window.winfo_exists():
            return
        self._log_text.configure(state="normal")
        self._log_text.insert("end", f"[{entry.timestamp}] ", "time")
        if entry.repo:
            self._log_text.insert("end", f"{entry.repo} ", "repo")
        self._log_text.insert("end", f"{entry.message}\n", entry.level)
        self._log_text.see("end")
        self._log_text.configure(state="disabled")

    def _clear_log(self) -> None:
        self.logs.clear()
        if self._log_window and self._log_window.winfo_exists():
            self._log_text.configure(state="normal")
            self._log_text.delete("1.0", "end")
            self._log_text.configure(state="disabled")

    # ── Repo operations ───────────────────────────────────────────

    def _refresh_all_local(self) -> None:
        for repo in self.cfg.repos:
            card = self.cards.get(repo.name)
            if card:
                card.set_checking(True)
            self.executor.submit(self._check_local, repo)

    def _refresh_all_remote(self) -> None:
        self._set_sync_state(True)
        self._fetch_btn.configure(state="disabled", text="Fetching…")
        self._pending_remote_checks = len(self.cfg.repos)
        for repo in self.cfg.repos:
            card = self.cards.get(repo.name)
            if card:
                card.set_checking(True)
            self.executor.submit(self._check_remote, repo)

    def _check_local(self, repo: RepoConfig) -> None:
        try:
            status = get_status(repo)
        except Exception as e:
            status = RepoStatus(state=SyncState.ERROR, label="Check failed", error=str(e))
        self.after(0, self._update_card, repo.name, status)

    def _check_remote(self, repo: RepoConfig) -> None:
        try:
            ok, msg = fetch(repo, log=lambda lvl, m: self.after(0, self.log, lvl, m, repo.name))
            if not ok:
                self.after(0, self.log, "error", f"Fetch failed: {msg}", repo.name)
            status = get_status(repo)
        except Exception as e:
            status = RepoStatus(state=SyncState.ERROR, label="Fetch failed", error=str(e))
        self.after(0, self._update_card, repo.name, status)
        self.after(0, self._update_summary)
        self.after(0, self._on_remote_check_done)

    def _on_remote_check_done(self):
        self._pending_remote_checks = max(0, self._pending_remote_checks - 1)
        if self._pending_remote_checks == 0:
            self._set_sync_state(False)
            self._fetch_btn.configure(state="normal", text="↓ Fetch All")

    def _update_card(self, name: str, status: RepoStatus) -> None:
        card = self.cards.get(name)
        if card:
            card.update_status(status)
        self._update_summary()

    def _update_summary(self) -> None:
        total_changes = 0
        conflict_repos = 0
        synced = 0
        error_repos = 0
        for card in self.cards.values():
            s = card.status
            total_changes += s.total_changes
            if s.has_conflicts:
                conflict_repos += 1
            if s.state == SyncState.SYNCED:
                synced += 1
            if s.state == SyncState.ERROR:
                error_repos += 1

        parts = []
        if error_repos > 0:
            parts.append(f"{error_repos} error{'s' if error_repos != 1 else ''}")
        if conflict_repos > 0:
            parts.append(f"{conflict_repos} conflict{'s' if conflict_repos != 1 else ''}")
        if total_changes > 0:
            parts.append(f"{total_changes} changes")
        if synced == len(self.cards) and not parts:
            parts = ["All repos synced ✓"]

        now = datetime.now().strftime("%H:%M")
        summary = " · ".join(parts) if parts else ""
        self._summary.configure(text=f"{summary}  {now}" if summary else now)

    def _set_sync_state(self, syncing: bool) -> None:
        if syncing:
            self._live_dot.configure(text_color=Colors.WARNING)
            self._live_label.configure(text="SYNC", text_color=Colors.WARNING)
        else:
            self._live_dot.configure(text_color=Colors.SUCCESS)
            self._live_label.configure(text="LIVE", text_color=Colors.SUCCESS)

    # ── Per-repo actions ─────────────────────────────────────────

    def push_repo(self, repo: RepoConfig) -> None:
        card = self.cards.get(repo.name)
        if card:
            card.set_checking(True)
            card.set_error("")

        def _do():
            def _progress(done, total, msg):
                if card:
                    self.after(0, card.show_progress, done / max(total, 1))
                self.after(0, self.log, "info", msg, repo.name)

            _log = lambda lvl, m: self.after(0, self.log, lvl, m, repo.name)
            success, msg = commit_push(
                repo,
                self.cfg.max_file_size_mb,
                self.cfg.batch_size,
                log=_log,
                progress=_progress,
            )
            status = get_status(repo)
            self.after(0, self._update_card, repo.name, status)
            if card:
                self.after(0, card.hide_progress)
                if success:
                    self.after(0, card.set_push_success, msg)
                else:
                    self.after(0, card.set_error, msg)

        self.executor.submit(_do)

    def pull_repo(self, repo: RepoConfig) -> None:
        card = self.cards.get(repo.name)
        if card:
            card.set_checking(True)
            card.set_error("")

        def _do():
            success, msg = pull(
                repo,
                log=lambda lvl, m: self.after(0, self.log, lvl, m, repo.name),
            )
            if not success and msg == "CONFLICT":
                self.after(0, self.show_conflict_dialog, repo)
            elif not success and card:
                self.after(0, card.set_error, msg)
            status = get_status(repo)
            self.after(0, self._update_card, repo.name, status)

        self.executor.submit(_do)

    def show_conflict_dialog(self, repo: RepoConfig) -> None:
        def on_resolved():
            status = get_status(repo)
            self._update_card(repo.name, status)
            self.log("success", "Conflicts resolved", repo.name)

        ConflictDialog(
            self,
            repo.path,
            repo.name,
            on_resolved=on_resolved,
            log=lambda lvl, msg: self.log(lvl, msg, repo.name),
        )

    def show_staging_panel(self, repo: RepoConfig) -> None:
        """Open (or raise) the staging area panel for a repo."""
        existing = self._staging_windows.get(repo.name)
        if existing and existing.winfo_exists():
            existing.lift()
            existing.focus_force()
            return

        def on_close():
            self._staging_windows.pop(repo.name, None)
            status = get_status(repo)
            self._update_card(repo.name, status)

        panel = StagingPanel(
            self,
            repo=repo,
            on_close=on_close,
            log=lambda lvl, msg: self.log(lvl, msg, repo.name),
        )
        self._staging_windows[repo.name] = panel

    def refresh_repo_status(self, repo: RepoConfig) -> None:
        """Re-check and refresh the card for a single repo (e.g. after a pull)."""
        def _do():
            status = get_status(repo)
            self.after(0, self._update_card, repo.name, status)

        self.executor.submit(_do)

    def _sync_all(self) -> None:
        if self._is_syncing:
            return
        self._is_syncing = True
        self._sync_btn.configure(text="Syncing…", state="disabled")
        self._set_sync_state(True)

        for card in self.cards.values():
            card.set_checking(True)
            card.set_error("")

        def _do():
            ok, fail = sync_all(
                self.cfg.repos,
                self.cfg.max_file_size_mb,
                self.cfg.batch_size,
                log=lambda lvl, msg: self.after(0, self.log, lvl, msg),
            )
            for repo in self.cfg.repos:
                try:
                    status = get_status(repo)
                    self.after(0, self._update_card, repo.name, status)
                except Exception:
                    pass
            self.after(0, self._sync_done, ok, fail)

        self.executor.submit(_do)

    def _sync_done(self, ok: int, fail: int) -> None:
        self._is_syncing = False
        self._sync_btn.configure(text="↻  Sync All", state="normal")
        self._set_sync_state(False)
        if fail > 0:
            self.log("warning", f"Sync complete: {ok} OK, {fail} failed — check log for details")
        else:
            self.log("success", f"Sync complete: all {ok} repos backed up")

    # ── Auto-check ────────────────────────────────────────────────

    def _start_auto_check(self) -> None:
        interval_ms = self.cfg.auto_check_interval_minutes * 60 * 1000
        self._auto_timer = self.after(interval_ms, self._auto_check_tick)

    def _auto_check_tick(self) -> None:
        try:
            self._refresh_all_remote()
        except Exception:
            pass
        finally:
            self._start_auto_check()

    # ── System tray ───────────────────────────────────────────────

    def _setup_tray(self) -> None:
        self._tray_icon = create_tray_icon(
            on_show=lambda: self.after(0, self._show_from_tray),
            on_sync=lambda: self.after(0, self._sync_all),
            on_quit=lambda: self.after(0, self._quit_app),
        )
        if self._tray_icon:
            run_tray_icon(self._tray_icon)

    def _minimize_to_tray(self) -> None:
        self.withdraw()

    def _show_from_tray(self) -> None:
        self.deiconify()
        self.lift()
        self.focus_force()

    def _on_close(self) -> None:
        if self._tray_icon:
            self._minimize_to_tray()
        else:
            self._quit_app()

    def _quit_app(self) -> None:
        if self._auto_timer:
            self.after_cancel(self._auto_timer)
        stop_tray_icon(self._tray_icon)
        self.executor.shutdown(wait=False)
        self.destroy()
