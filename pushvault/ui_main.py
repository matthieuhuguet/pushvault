"""Main PushVault window — Spotify-identical layout V3.

Layout:
  ┌──────┬───────────────────────────────────┐
  │ Side │  Top bar (greeting + search)      │
  │ bar  ├───────────────────────────────────┤
  │      │  Filter pills                     │
  │      ├───────────────────────────────────┤
  │      │  Content grid (repo cards)        │
  │      │                                   │
  ├──────┴───────────────────────────────────┤
  │  Bottom bar (status + sync actions)      │
  └──────────────────────────────────────────┘
"""

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
from .config import load_config, save_config
from .git_engine import commit_push, fetch, get_status, pull, sync_all
from .models import AppConfig, LogEntry, RepoConfig, RepoStatus, SyncState
from .theme import Colors, Fonts, Spacing, hex_blend
from .tray import create_tray_icon, run_tray_icon, stop_tray_icon
from .ui_card import RepoCard
from .ui_clone import CloneDialog
from .ui_conflicts import ConflictDialog
from .ui_history import HistoryPanel
from .ui_settings import SettingsPanel
from .ui_staging import StagingPanel
from .ui_stash import StashPanel


_SIDEBAR_W = 64
_BOTTOM_H = 72


class PushVaultApp(ctk.CTk):
    """Main application window — Spotify layout."""

    def __init__(self, config_path: Path):
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("dark-blue")

        self.config_path = config_path
        self.cfg = load_config(config_path)

        self.title("PushVault")
        w = max(self.cfg.window_width, 560)
        h = max(min(self.cfg.window_height, 900), 500)
        self.geometry(f"{w}x{h}")
        self.minsize(500, 460)
        self.configure(fg_color=Colors.BG_BASE)

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
        self._stash_windows: dict[str, StashPanel] = {}
        self._pending_remote_checks: int = 0
        self._search_query: str = ""
        self._active_filter: str = "all"
        self._active_nav: str = "home"

        self._build_ui()
        self._flash_timer: Optional[str] = None

        self._setup_tray()
        self._start_auto_check()

        self.after(300, self._refresh_all_local)

        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.bind("<Escape>", lambda e: self._minimize_to_tray())
        self.bind("<Control-r>", lambda e: self._refresh_all_remote())
        self.bind("<Control-s>", lambda e: self._sync_all())
        self.bind("<Control-l>", lambda e: self._toggle_log())
        self.bind("<Control-k>", lambda e: self._focus_search())
        self.bind("<Control-comma>", lambda e: self._open_settings())
        self.bind("<Control-n>", lambda e: self._open_clone())

    def _set_window_icon(self) -> None:
        if not _PIL_AVAILABLE:
            return
        try:
            for path in (_ICON_256, _ICON_32):
                if path.exists():
                    img = Image.open(path).convert("RGBA").resize((32, 32), Image.LANCZOS)
                    photo = ImageTk.PhotoImage(img)
                    self.iconphoto(True, photo)
                    self._icon_photo = photo
                    break
        except Exception:
            pass

    def _set_dark_titlebar(self) -> None:
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

    # ── UI Construction ──────────────────────────────────────────

    def _build_ui(self) -> None:
        # Root layout: 1 row, 2 columns
        # col 0 = sidebar (fixed width), col 1 = right panel (expands)
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=0)
        self.grid_columnconfigure(1, weight=1)

        self._build_sidebar()

        # Right panel: holds content (top, expands) + bottom bar (fixed height)
        self._right = ctk.CTkFrame(self, fg_color=Colors.BG_BASE, corner_radius=0)
        self._right.grid(row=0, column=1, sticky="nsew")
        self._right.grid_rowconfigure(0, weight=1)
        self._right.grid_rowconfigure(1, weight=0)
        self._right.grid_columnconfigure(0, weight=1)

        self._build_content()
        self._build_bottom_bar()

    # ── Sidebar ──────────────────────────────────────────────────

    def _build_sidebar(self) -> None:
        sidebar = ctk.CTkFrame(
            self, fg_color=Colors.SIDEBAR_BG,
            corner_radius=0, width=_SIDEBAR_W,
        )
        sidebar.grid(row=0, column=0, sticky="nsew")
        sidebar.grid_propagate(False)

        # Navigation
        self._nav_btns: dict[str, ctk.CTkButton] = {}
        nav_items = [
            ("home",     "\u2302"),
            ("history",  "\u23F3"),
            ("log",      "\u2630"),
            ("settings", "\u2699"),
        ]

        for name, icon in nav_items:
            is_active = (name == "home")
            btn = ctk.CTkButton(
                sidebar,
                text=icon,
                font=("Segoe UI", 18),
                fg_color=Colors.SIDEBAR_ACTIVE if is_active else "transparent",
                hover_color=Colors.SIDEBAR_HOVER,
                text_color=Colors.SIDEBAR_ICON_ACTIVE if is_active else Colors.SIDEBAR_ICON,
                width=_SIDEBAR_W, height=48,
                corner_radius=0,
                border_width=0,
                command=lambda n=name: self._on_nav(n),
            )
            btn.pack(fill="x")
            self._nav_btns[name] = btn

        # Spacer
        ctk.CTkFrame(sidebar, fg_color="transparent").pack(fill="both", expand=True)

        # Add repo button at bottom
        ctk.CTkButton(
            sidebar,
            text="+",
            font=("Segoe UI", 20, "bold"),
            fg_color="transparent",
            hover_color=Colors.SIDEBAR_HOVER,
            text_color=Colors.SIDEBAR_ICON,
            width=_SIDEBAR_W, height=48,
            corner_radius=0,
            border_width=0,
            command=self._open_clone,
        ).pack(fill="x", side="bottom")

    def _build_fallback_logo(self, parent):
        ctk.CTkLabel(
            parent, text="PV",
            font=("Segoe UI Variable", 10, "bold"),
            fg_color=Colors.ACCENT, corner_radius=6,
            width=28, height=28, text_color="#FFFFFF",
        ).place(relx=0.5, rely=0.5, anchor="center")

    # ── Content area ─────────────────────────────────────────────

    def _build_content(self) -> None:
        content = ctk.CTkFrame(self._right, fg_color=Colors.BG_PRIMARY, corner_radius=8)
        content.grid(row=0, column=0, sticky="nsew", padx=(0, 8), pady=(8, 0))
        content.grid_rowconfigure(2, weight=1)
        content.grid_columnconfigure(0, weight=1)
        self._content = content

        # ── Row 0: Top header bar ──
        top = ctk.CTkFrame(content, fg_color="transparent")
        top.grid(row=0, column=0, sticky="ew", padx=20, pady=(16, 8))
        top.grid_columnconfigure(0, weight=1)

        # Left: title
        self._section_title = ctk.CTkLabel(
            top, text="Repositories",
            font=Fonts.SECTION,
            text_color=Colors.TEXT_PRIMARY,
            anchor="w",
        )
        self._section_title.grid(row=0, column=0, sticky="w")

        # Right: search + live
        right = ctk.CTkFrame(top, fg_color="transparent")
        right.grid(row=0, column=1, sticky="e")

        self._search_var = tk.StringVar()
        self._search_var.trace_add("write", self._on_search_change)

        self._search_entry = ctk.CTkEntry(
            right,
            textvariable=self._search_var,
            placeholder_text="\U0001F50D Search repos...",
            height=34,
            width=200,
            corner_radius=17,
            fg_color=Colors.BG_INPUT,
            text_color=Colors.TEXT_PRIMARY,
            placeholder_text_color=Colors.TEXT_TERTIARY,
            font=Fonts.SMALL,
            border_width=0,
        )
        self._search_entry.pack(side="left", padx=(0, 12))

        self._live_dot = ctk.CTkLabel(
            right, text="\u25CF",
            font=("Segoe UI", 8),
            text_color=Colors.SUCCESS, width=10,
        )
        self._live_dot.pack(side="left")

        self._live_label = ctk.CTkLabel(
            right, text="LIVE",
            font=(Fonts.TINY[0], 8, "bold"),
            text_color=Colors.SUCCESS,
        )
        self._live_label.pack(side="left", padx=(2, 0))

        # ── Row 1: Filter pills ──
        pills_row = ctk.CTkFrame(content, fg_color="transparent")
        pills_row.grid(row=1, column=0, sticky="w", padx=20, pady=(0, 8))

        self._pill_btns: dict[str, ctk.CTkButton] = {}
        filters = [
            ("all", "All"),
            ("needs_push", "Needs Push"),
            ("needs_pull", "Needs Pull"),
            ("synced", "Synced"),
            ("error", "Errors"),
        ]

        for name, label in filters:
            is_active = (name == "all")
            btn = ctk.CTkButton(
                pills_row,
                text=label,
                font=Fonts.SMALL_BOLD,
                fg_color=Colors.PILL_BG_ACTIVE if is_active else Colors.PILL_BG,
                hover_color=Colors.BG_ELEVATED,
                text_color=Colors.PILL_TEXT_ACTIVE if is_active else Colors.PILL_TEXT,
                height=28,
                corner_radius=14,
                border_width=0,
            )
            btn.configure(command=lambda n=name: self._on_filter(n))
            btn.pack(side="left", padx=(0, 8))
            self._pill_btns[name] = btn

        # ── Row 2: Cards grid ──
        self._cards_frame = ctk.CTkScrollableFrame(
            content,
            fg_color="transparent",
            scrollbar_button_color=Colors.SCROLLBAR,
            scrollbar_button_hover_color=Colors.SCROLLBAR_HOVER,
        )
        self._cards_frame.grid(row=2, column=0, sticky="nsew", padx=12, pady=(0, 8))
        self._cards_frame.grid_columnconfigure(0, weight=1)

        self._rebuild_cards()

    # ── Bottom bar ───────────────────────────────────────────────

    def _build_bottom_bar(self) -> None:
        bar = ctk.CTkFrame(
            self._right, fg_color=Colors.BOTTOM_BAR_BG,
            corner_radius=0, height=_BOTTOM_H,
        )
        bar.grid(row=1, column=0, sticky="ew")
        bar.pack_propagate(False)

        # Pack RIGHT first so buttons are never squeezed off-screen
        self._sync_btn = ctk.CTkButton(
            bar,
            text="Sync All",
            command=self._sync_all,
            fg_color=Colors.ACCENT,
            hover_color=Colors.ACCENT_HOVER,
            text_color=Colors.TEXT_INVERSE,
            height=36,
            width=106,
            corner_radius=18,
            font=Fonts.SMALL_BOLD,
            border_width=0,
        )
        self._sync_btn.pack(side="right", padx=(0, 16), pady=0)

        self._fetch_btn = ctk.CTkButton(
            bar, text="Fetch",
            command=self._refresh_all_remote,
            fg_color=Colors.BG_TERTIARY,
            hover_color=Colors.BG_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            height=32, width=72,
            corner_radius=16,
            font=Fonts.SMALL,
            border_width=0,
        )
        self._fetch_btn.pack(side="right", padx=(0, 8), pady=0)

        # Left: status dot + summary text
        self._bottom_icon = ctk.CTkLabel(
            bar, text="\u25CF",
            font=("Segoe UI", 10),
            text_color=Colors.SUCCESS,
        )
        self._bottom_icon.pack(side="left", padx=(16, 6), pady=0)

        self._summary = ctk.CTkLabel(
            bar, text="",
            font=Fonts.BODY,
            text_color=Colors.TEXT_SECONDARY,
        )
        self._summary.pack(side="left", pady=0)

        # Version label (fills remaining center space)
        ctk.CTkLabel(
            bar, text=f"PushVault v{__version__}",
            font=Fonts.TINY,
            text_color=Colors.TEXT_TERTIARY,
        ).pack(side="left", expand=True)

    def _update_greeting(self) -> None:
        hour = datetime.now().hour
        if hour < 12:
            greeting = "Good morning"
        elif hour < 18:
            greeting = "Good afternoon"
        else:
            greeting = "Good evening"
        self._section_title.configure(text=greeting)

    # ── Card grid ────────────────────────────────────────────────

    def _rebuild_cards(self) -> None:
        """Rebuild all repo cards in a 2-column grid."""
        for w in self._cards_frame.winfo_children():
            w.destroy()
        self.cards.clear()

        query = self._search_query.lower().strip()

        visible_repos = [
            r for r in self.cfg.repos
            if not query or query in r.name.lower() or query in r.path.lower()
        ]

        for i, repo in enumerate(visible_repos):
            card = RepoCard(self._cards_frame, repo, self)
            card.grid(row=i, column=0, sticky="ew", padx=0, pady=(0, 4))
            self.cards[repo.name] = card

        if not visible_repos and query:
            ctk.CTkLabel(
                self._cards_frame,
                text=f"No repos matching \"{query}\"",
                font=Fonts.BODY,
                text_color=Colors.TEXT_TERTIARY,
            ).grid(row=0, column=0, columnspan=2, pady=Spacing.XL)
        elif not visible_repos:
            ctk.CTkLabel(
                self._cards_frame,
                text="No repositories configured.\nClick + to add one.",
                font=Fonts.BODY,
                text_color=Colors.TEXT_TERTIARY,
                justify="center",
            ).grid(row=0, column=0, columnspan=2, pady=Spacing.XL)

    def _apply_filter(self) -> None:
        filt = self._active_filter
        if filt == "all":
            for card in self.cards.values():
                card.grid()
            return

        state_map = {
            "needs_push": SyncState.NEEDS_PUSH,
            "needs_pull": SyncState.NEEDS_PULL,
            "synced": SyncState.SYNCED,
            "error": SyncState.ERROR,
        }
        target = state_map.get(filt)
        for card in self.cards.values():
            if target and card.status.state == target:
                card.grid()
            elif filt == "error" and card.status.state == SyncState.CONFLICT:
                card.grid()
            else:
                card.grid_remove()

    # ── Filter pills ─────────────────────────────────────────────

    def _on_filter(self, name: str) -> None:
        self._active_filter = name
        for btn_name, btn in self._pill_btns.items():
            if btn_name == name:
                btn.configure(
                    fg_color=Colors.PILL_BG_ACTIVE,
                    text_color=Colors.PILL_TEXT_ACTIVE,
                    border_width=0,
                )
            else:
                btn.configure(
                    fg_color=Colors.PILL_BG,
                    text_color=Colors.PILL_TEXT,
                    border_width=0,
                )
        self._apply_filter()

    # ── Sidebar navigation ───────────────────────────────────────

    def _on_nav(self, name: str) -> None:
        self._active_nav = name
        for btn_name, btn in self._nav_btns.items():
            if btn_name == name:
                btn.configure(
                    text_color=Colors.SIDEBAR_ICON_ACTIVE,
                    fg_color=Colors.SIDEBAR_ACTIVE,
                )
            else:
                btn.configure(
                    text_color=Colors.SIDEBAR_ICON,
                    fg_color="transparent",
                )

        if name == "home":
            pass
        elif name == "history":
            if self.cfg.repos:
                self.show_history_panel(self.cfg.repos[0])
        elif name == "log":
            self._toggle_log()
        elif name == "settings":
            self._open_settings()

    # ── Search ────────────────────────────────────────────────────

    def _on_search_change(self, *_) -> None:
        new_query = self._search_var.get()
        if new_query != self._search_query:
            self._search_query = new_query
            self._rebuild_cards()
            self.after(50, self._refresh_visible_local)

    def _refresh_visible_local(self) -> None:
        for repo in self.cfg.repos:
            if repo.name in self.cards:
                card = self.cards[repo.name]
                card.set_checking(True)
                self.executor.submit(self._check_local, repo)

    def _focus_search(self) -> None:
        self._search_entry.focus_set()

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
        self._log_window.title("PushVault \u2014 Activity Log")
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
        self._fetch_btn.configure(state="disabled", text="\u2026")
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
            self._fetch_btn.configure(state="normal", text="Fetch")

    def _update_card(self, name: str, status: RepoStatus) -> None:
        card = self.cards.get(name)
        if card:
            card.update_status(status)
        self._update_summary()
        if self._active_filter != "all":
            self._apply_filter()

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

        n = len(self.cards)
        parts = []
        if error_repos > 0:
            parts.append(f"{error_repos} error{'s' if error_repos != 1 else ''}")
        if conflict_repos > 0:
            parts.append(f"{conflict_repos} conflict{'s' if conflict_repos != 1 else ''}")
        if total_changes > 0:
            parts.append(f"{total_changes} change{'s' if total_changes != 1 else ''}")
        if synced == n and n > 0 and not parts:
            parts = [f"All {n} repos synced"]

        summary = " \u00B7 ".join(parts) if parts else f"{n} repo{'s' if n != 1 else ''}"
        self._summary.configure(text=summary, text_color=Colors.TEXT_SECONDARY)

    def _flash_status(self, message: str, level: str = "info", duration_ms: int = 3500) -> None:
        """Show a brief status message in the bottom bar, then revert to summary."""
        color_map = {
            "success": Colors.SUCCESS,
            "error":   Colors.ERROR,
            "warning": Colors.WARNING,
            "info":    Colors.ACCENT,
        }
        color = color_map.get(level, Colors.TEXT_SECONDARY)
        self._summary.configure(text=message, text_color=color)
        if self._flash_timer:
            try:
                self.after_cancel(self._flash_timer)
            except Exception:
                pass
        self._flash_timer = self.after(duration_ms, self._update_summary)

    def _set_sync_state(self, syncing: bool) -> None:
        if syncing:
            self._live_dot.configure(text_color=Colors.WARNING)
            self._live_label.configure(text="SYNC", text_color=Colors.WARNING)
            self._bottom_icon.configure(text_color=Colors.WARNING)
        else:
            self._live_dot.configure(text_color=Colors.SUCCESS)
            self._live_label.configure(text="LIVE", text_color=Colors.SUCCESS)
            self._bottom_icon.configure(text_color=Colors.SUCCESS)

    # ── Per-repo actions ─────────────────────────────────────────

    def push_repo(self, repo: RepoConfig, custom_message: str = "") -> None:
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
                    self.after(0, self._flash_status, msg, "success")
                else:
                    self.after(0, card.set_error, msg)
                    self.after(0, self._flash_status, f"Push failed: {msg}", "error", 6000)

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
            self._flash_status("Conflicts resolved", "success")

        ConflictDialog(
            self, repo.path, repo.name,
            on_resolved=on_resolved,
            log=lambda lvl, msg: self.log(lvl, msg, repo.name),
        )

    def show_staging_panel(self, repo: RepoConfig) -> None:
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
            self, repo=repo, on_close=on_close,
            log=lambda lvl, msg: self.log(lvl, msg, repo.name),
        )
        self._staging_windows[repo.name] = panel

    def show_history_panel(self, repo: RepoConfig) -> None:
        HistoryPanel(
            self, repo=repo,
            log=lambda lvl, msg: self.log(lvl, msg, repo.name),
        )

    def show_stash_panel(self, repo: RepoConfig) -> None:
        existing = self._stash_windows.get(repo.name)
        if existing and existing.winfo_exists():
            existing.lift()
            existing.focus_force()
            return

        def on_close():
            self._stash_windows.pop(repo.name, None)
            status = get_status(repo)
            self._update_card(repo.name, status)

        panel = StashPanel(
            self, repo=repo,
            log=lambda lvl, msg: self.log(lvl, msg, repo.name),
            on_close=on_close,
        )
        self._stash_windows[repo.name] = panel

    def refresh_repo_status(self, repo: RepoConfig) -> None:
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
        self._sync_btn.configure(text="Sync All", state="normal")
        self._set_sync_state(False)
        if fail > 0:
            self.log("warning", f"Sync complete: {ok} OK, {fail} failed")
            self._flash_status(f"Sync: {ok} OK, {fail} failed", "warning")
        else:
            self.log("success", f"Sync complete: all {ok} repos backed up")
            self._flash_status(f"All {ok} repos synced", "success")

    # ── Settings ──────────────────────────────────────────────────

    def _open_settings(self) -> None:
        def on_save(new_cfg: AppConfig):
            self.cfg = new_cfg
            self._rebuild_cards()
            self.after(100, self._refresh_all_local)
            self._restart_auto_check()
            self._flash_status("Settings saved", "success")

        SettingsPanel(self, self.config_path, on_save=on_save)

    # ── Clone ─────────────────────────────────────────────────────

    def _open_clone(self) -> None:
        def on_cloned(repo: RepoConfig):
            self.cfg.repos.append(repo)
            save_config(self.config_path, self.cfg)
            self._rebuild_cards()
            self.after(100, self._refresh_all_local)
            self._flash_status(f"Cloned {repo.name}", "success")

        CloneDialog(self, on_cloned=on_cloned, log=self.log)

    # ── Auto-check ────────────────────────────────────────────────

    def _start_auto_check(self) -> None:
        interval_ms = self.cfg.auto_check_interval_minutes * 60 * 1000
        self._auto_timer = self.after(interval_ms, self._auto_check_tick)

    def _restart_auto_check(self) -> None:
        if self._auto_timer:
            self.after_cancel(self._auto_timer)
        self._start_auto_check()

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
        try:
            self.cfg.window_width = self.winfo_width()
            self.cfg.window_height = self.winfo_height()
            save_config(self.config_path, self.cfg)
        except Exception:
            pass

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
