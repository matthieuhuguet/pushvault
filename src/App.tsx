import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Header } from "./components/Header/Header";
import { Dashboard } from "./components/Dashboard/Dashboard";
import { BottomBar } from "./components/BottomBar/BottomBar";
import { ToastContainer } from "./components/Toast/ToastContainer";
import { StagingArea } from "./components/Staging/StagingArea";
import { CommitHistory } from "./components/History/CommitHistory";
import { StashManager } from "./components/Stash/StashManager";
import { BranchManager } from "./components/BranchManager/BranchManager";
import { ConflictResolver } from "./components/ConflictResolver/ConflictResolver";
import { TagManager } from "./components/Tags/TagManager";
import { ActivityLog } from "./components/ActivityLog/ActivityLog";
import { Settings } from "./components/Settings/Settings";
import { Onboarding } from "./components/Onboarding/Onboarding";
import { KeyboardHelp } from "./components/KeyboardHelp/KeyboardHelp";
import { CloneDialog } from "./components/Clone/CloneDialog";
import { GitignoreEditor } from "./components/GitignoreEditor/GitignoreEditor";
import { ScanRepos } from "./components/ScanRepos/ScanRepos";
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
  } = useUIStore();

  const addToast = useToastStore((s) => s.add);

  useEffect(() => {
    loadConfig().then(() => refreshAllStatuses());
  }, []);

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
    "ctrl+k": () => document.getElementById("search-input")?.focus(),
    "ctrl+,": () => setActiveTab("settings"),
    "ctrl+/": () => setShowKeyboardHelp((v) => !v),
    "ctrl+n": () => setShowClone(true),
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

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#121212",
        color: "#fff",
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
            background: "#121212",
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
                gap: "16px",
                color: "#535353",
              }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
                <circle cx="12" cy="12" r="9" stroke="#b3b3b3" strokeWidth="2" />
                <polyline points="12 7 12 12 15 15" stroke="#b3b3b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
                Global History
              </p>
              <p style={{ fontSize: "13px" }}>
                Select a repository from the Dashboard to view its history.
              </p>
            </div>
          )}

          {activeTab === "activity" && <ActivityLog />}

          {activeTab === "settings" && (
            <Settings onClose={() => setActiveTab("dashboard")} />
          )}
        </main>

        {/* Bottom bar */}
        <BottomBar />
      </div>

      {/* Overlay panels */}
      {activePanel === "staging" && selectedRepoPath && (
        <StagingArea />
      )}

      {activePanel === "history" && selectedRepoPath && (
        <CommitHistory
          repoPath={selectedRepoPath}
          repoName={repoName}
          onClose={() => setActivePanel(null)}
        />
      )}

      {activePanel === "stash" && selectedRepoPath && (
        <StashManager
          repoPath={selectedRepoPath}
          repoName={repoName}
          onClose={() => setActivePanel(null)}
        />
      )}

      {activePanel === "branches" && selectedRepoPath && (
        <BranchManager
          repoPath={selectedRepoPath}
          repoName={repoName}
          onClose={() => setActivePanel(null)}
        />
      )}

      {activePanel === "conflicts" && selectedRepoPath && (
        <ConflictResolver
          repoPath={selectedRepoPath}
          repoName={repoName}
          onClose={() => setActivePanel(null)}
        />
      )}

      {activePanel === "tags" && selectedRepoPath && (
        <TagManager
          repoPath={selectedRepoPath}
          repoName={repoName}
          onClose={() => setActivePanel(null)}
        />
      )}

      {activePanel === "gitignore" && selectedRepoPath && (
        <GitignoreEditor
          repoPath={selectedRepoPath}
          repoName={repoName}
          onClose={() => setActivePanel(null)}
        />
      )}

      {activePanel === "scan" && (
        <ScanRepos onClose={() => setActivePanel(null)} />
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

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
