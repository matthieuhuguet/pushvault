import React, { Suspense, lazy, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Header } from "./components/Header/Header";
import { Dashboard } from "./components/Dashboard/Dashboard";
import { BottomBar } from "./components/BottomBar/BottomBar";
import { ToastContainer } from "./components/Toast/ToastContainer";
import { ConfirmModal } from "./components/ConfirmModal/ConfirmModal";
import { PromptModal } from "./components/PromptModal/PromptModal";

// Lazy-loaded overlay panels (code split)
const StagingArea = lazy(() => import("./components/Staging/StagingArea").then(m => ({ default: m.StagingArea })));
const CommitHistory = lazy(() => import("./components/History/CommitHistory").then(m => ({ default: m.CommitHistory })));
const StashManager = lazy(() => import("./components/Stash/StashManager").then(m => ({ default: m.StashManager })));
const BranchManager = lazy(() => import("./components/BranchManager/BranchManager").then(m => ({ default: m.BranchManager })));
const ConflictResolver = lazy(() => import("./components/ConflictResolver/ConflictResolver").then(m => ({ default: m.ConflictResolver })));
const TagManager = lazy(() => import("./components/Tags/TagManager").then(m => ({ default: m.TagManager })));
const ActivityLog = lazy(() => import("./components/ActivityLog/ActivityLog").then(m => ({ default: m.ActivityLog })));
const Settings = lazy(() => import("./components/Settings/Settings").then(m => ({ default: m.Settings })));
const Onboarding = lazy(() => import("./components/Onboarding/Onboarding").then(m => ({ default: m.Onboarding })));
const KeyboardHelp = lazy(() => import("./components/KeyboardHelp/KeyboardHelp").then(m => ({ default: m.KeyboardHelp })));
const CloneDialog = lazy(() => import("./components/Clone/CloneDialog").then(m => ({ default: m.CloneDialog })));
const GitignoreEditor = lazy(() => import("./components/GitignoreEditor/GitignoreEditor").then(m => ({ default: m.GitignoreEditor })));
const ScanRepos = lazy(() => import("./components/ScanRepos/ScanRepos").then(m => ({ default: m.ScanRepos })));
const WorktreeManager = lazy(() => import("./components/WorktreeManager/WorktreeManager").then(m => ({ default: m.WorktreeManager })));
const SubmoduleManager = lazy(() => import("./components/SubmoduleManager/SubmoduleManager").then(m => ({ default: m.SubmoduleManager })));
const CommandPalette = lazy(() => import("./components/CommandPalette/CommandPalette").then(m => ({ default: m.CommandPalette })));
const LfsManager = lazy(() => import("./components/LfsManager/LfsManager").then(m => ({ default: m.LfsManager })));
const BisectPanel = lazy(() => import("./components/BisectPanel/BisectPanel").then(m => ({ default: m.BisectPanel })));
const RebasePanel = lazy(() => import("./components/RebasePanel/RebasePanel").then(m => ({ default: m.RebasePanel })));
const GlobalSearch = lazy(() => import("./components/GlobalSearch/GlobalSearch").then(m => ({ default: m.GlobalSearch })));
import { useRepoStore } from "./store/repoStore";
import { useUIStore } from "./store/uiStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { ipc } from "./lib/ipc";
import { useToastStore } from "./store/toastStore";
import "./styles/globals.css";

export default function App() {
  const loadConfig = useRepoStore((s) => s.loadConfig);
  const refreshAllStatuses = useRepoStore((s) => s.refreshAllStatuses);
  const config = useRepoStore((s) => s.config);
  const loading = useRepoStore((s) => s.loading);

  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  const showOnboarding = !loading && config !== null && config.repos.length === 0 && !onboardingDismissed;

  const {
    activeTab,
    setActiveTab,
    setSearchQuery,
    activePanel,
    setActivePanel,
    selectedRepoPath,
    isSyncing,
    setIsSyncing,
    setSyncProgress,
    theme,
    setTheme,
  } = useUIStore();

  const addToast = useToastStore((s) => s.add);

  // Restore theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("pushvault-theme") as "dark" | "light" | null;
    if (saved && saved !== theme) setTheme(saved);
  }, []);

  // Apply theme to DOM and persist
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pushvault-theme", theme);
  }, [theme]);

  useEffect(() => {
    loadConfig().then(() => refreshAllStatuses());
  }, []);

  // Set up filesystem watchers whenever repo list changes
  useEffect(() => {
    if (!config?.repos.length) return;
    const paths = config.repos.map((r) => r.path);
    ipc.setupFileWatchers(paths).catch(() => {/* watchers are best-effort */});
  }, [config?.repos.map((r) => r.path).join("|")]);

  useEffect(() => {
    const intervalMinutes = config?.auto_check_interval_minutes ?? 5;
    const interval = setInterval(refreshAllStatuses, intervalMinutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [config?.auto_check_interval_minutes]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("sync-progress", (event: { payload: { path: string; step: string; message: string; success?: boolean } }) => {
      setSyncProgress(event.payload.message);
      if (event.payload.step === "done") {
        setTimeout(() => setSyncProgress(""), 2000);
      }
    }).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  // Real-time status refresh via filesystem watcher events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>("repo-changed", (event) => {
      const repoPath = event.payload;
      const { refreshStatus } = useRepoStore.getState();
      refreshStatus(repoPath);
    }).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  const handleSyncAll = async () => {
    if (isSyncing) return;
    const repos = config?.repos ?? [];
    if (!repos.length) {
      addToast("info", "No repositories to sync");
      return;
    }
    setIsSyncing(true);
    setSyncProgress("Syncing all repositories…");
    try {
      const results = await ipc.syncAll();
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      setIsSyncing(false);
      setSyncProgress("");
      await refreshAllStatuses();
      if (failed === 0) {
        addToast("success", `Synced ${succeeded} repositories`);
      } else {
        addToast("warning", `Synced ${succeeded}, ${failed} failed`);
      }
    } catch (e) {
      setIsSyncing(false);
      setSyncProgress("");
      addToast("error", `Sync failed: ${e}`);
    }
  };

  useKeyboard({
    "ctrl+s": handleSyncAll,
    "ctrl+r": () => refreshAllStatuses(),
    "f5": () => refreshAllStatuses(),
    "ctrl+k": () => document.getElementById("search-input")?.focus(),
    "ctrl+,": () => setActiveTab("settings"),
    "ctrl+/": () => setShowKeyboardHelp((v) => !v),
    "ctrl+n": () => setShowClone(true),
    "ctrl+p": () => setShowCommandPalette(true),
    "ctrl+shift+p": () => setShowCommandPalette(true),
    "ctrl+shift+f": () => setShowGlobalSearch(true),
    "alt+1": () => setActiveTab("dashboard"),
    "alt+2": () => setActiveTab("history"),
    "alt+3": () => setActiveTab("activity"),
    "alt+4": () => setActiveTab("settings"),
    "escape": () => {
      const { activePanel } = useUIStore.getState();
      if (activePanel) {
        setActivePanel(null);
      } else if (activeTab === "settings") {
        setActiveTab("dashboard");
      }
    },
  });

  // Find repo config for panels
  const repoConfig = config?.repos.find((r) => r.path === selectedRepoPath);
  const repoName = repoConfig?.name;

  // Determine if any overlay panel is open (for backdrop)
  const hasOverlayPanel = activePanel !== null && (selectedRepoPath || activePanel === "scan");

  const lazyFallback = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-muted)", fontSize: 13 }}>
      Loading...
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: theme === "light" ? "var(--color-bg-primary)" : "transparent",
        color: "var(--color-text-primary)",
        fontFamily: "'Circular', 'Gotham', system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onClone={() => setShowClone(true)} />

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <Header />

        {/* Page content */}
        <main
          style={{
            flex: 1,
            overflow: "auto",
            padding: "24px",
          }}
        >
          {activeTab === "dashboard" && <Dashboard />}

          {activeTab === "history" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                flexDirection: "column",
                gap: "20px",
                color: "var(--color-text-disabled)",
              }}
            >
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "20px",
                  background: "var(--overlay-subtle)",
                  border: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
                  <circle cx="12" cy="12" r="9" stroke="var(--color-text-secondary)" strokeWidth="1.5" />
                  <polyline points="12 7 12 12 15 15" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "6px" }}>
                  Commit History
                </p>
                <p style={{ fontSize: "13px", lineHeight: 1.5, maxWidth: "320px" }}>
                  Right-click a repository and select "History" to explore commits, diffs, and more.
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "4px",
                }}
              >
                <kbd style={{
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  background: "var(--overlay-subtle)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                  padding: "4px 10px",
                }}>
                  Right-click repo card
                </kbd>
                <span style={{ color: "var(--color-text-disabled)", fontSize: "11px", lineHeight: "28px" }}>or</span>
                <kbd style={{
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  background: "var(--overlay-subtle)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                  padding: "4px 10px",
                }}>
                  Ctrl+P → History
                </kbd>
              </div>
            </div>
          )}

          {activeTab === "activity" && (
            <Suspense fallback={lazyFallback}><ActivityLog /></Suspense>
          )}

          {activeTab === "settings" && (
            <Suspense fallback={lazyFallback}>
              <Settings onClose={() => setActiveTab("dashboard")} />
            </Suspense>
          )}
        </main>

        {/* Bottom bar */}
        <BottomBar />
      </div>

      {/* Overlay panels with animated backdrop */}
      {hasOverlayPanel && (
        <div
          className="panel-backdrop-enter"
          onClick={() => setActivePanel(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-backdrop-light)",
            zIndex: 499,
          }}
        />
      )}

      <Suspense fallback={lazyFallback}>
        {activePanel === "staging" && selectedRepoPath && <StagingArea />}
        {activePanel === "history" && selectedRepoPath && (
          <CommitHistory repoPath={selectedRepoPath} repoName={repoName} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "stash" && selectedRepoPath && (
          <StashManager repoPath={selectedRepoPath} repoName={repoName} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "branches" && selectedRepoPath && (
          <BranchManager repoPath={selectedRepoPath} repoName={repoName} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "conflicts" && selectedRepoPath && (
          <ConflictResolver repoPath={selectedRepoPath} repoName={repoName} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "tags" && selectedRepoPath && (
          <TagManager repoPath={selectedRepoPath} repoName={repoName} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "gitignore" && selectedRepoPath && (
          <GitignoreEditor repoPath={selectedRepoPath} repoName={repoName} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "scan" && <ScanRepos onClose={() => setActivePanel(null)} />}
        {activePanel === "worktrees" && selectedRepoPath && (
          <WorktreeManager repoPath={selectedRepoPath} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "submodules" && selectedRepoPath && (
          <SubmoduleManager repoPath={selectedRepoPath} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "lfs" && selectedRepoPath && (
          <LfsManager repoPath={selectedRepoPath} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "bisect" && selectedRepoPath && (
          <BisectPanel repoPath={selectedRepoPath} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "rebase" && selectedRepoPath && (
          <RebasePanel repoPath={selectedRepoPath} onClose={() => setActivePanel(null)} />
        )}

        {/* Onboarding wizard */}
        {showOnboarding && (
          <Onboarding
            onComplete={() => setOnboardingDismissed(true)}
            onScan={() => { setOnboardingDismissed(true); setActivePanel("scan"); }}
          />
        )}

        {/* Keyboard shortcut help */}
        {showKeyboardHelp && (
          <KeyboardHelp onClose={() => setShowKeyboardHelp(false)} />
        )}

        {/* Clone dialog */}
        {showClone && (
          <CloneDialog onClose={() => setShowClone(false)} />
        )}

        {/* Command palette */}
        {showCommandPalette && (
          <CommandPalette
            onClose={() => setShowCommandPalette(false)}
            onShowKeyboardHelp={() => { setShowCommandPalette(false); setShowKeyboardHelp(true); }}
            onShowClone={() => { setShowCommandPalette(false); setShowClone(true); }}
            onShowScan={() => { setShowCommandPalette(false); setActivePanel("scan"); }}
            onShowGlobalSearch={() => { setShowCommandPalette(false); setShowGlobalSearch(true); }}
          />
        )}

        {/* Global search */}
        {showGlobalSearch && (
          <GlobalSearch onClose={() => setShowGlobalSearch(false)} />
        )}
      </Suspense>

      {/* Toast notifications */}
      <ToastContainer />

      {/* Destructive operation confirmation modal */}
      <ConfirmModal />
      <PromptModal />
    </div>
  );
}
