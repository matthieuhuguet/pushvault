import React, { useEffect, useState } from "react";
import { useUIStore } from "../../store/uiStore";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
import { ipc } from "../../lib/ipc";
import type { BranchInfo } from "../../types";

function ScanIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hour ago";
  return `${diffHr} hours ago`;
}

function FetchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="7 10 12 15 17 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="15"
        x2="12"
        y2="3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      style={{
        animation: spinning ? "spin 0.8s linear infinite" : undefined,
      }}
    >
      <polyline
        points="1 4 1 10 7 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="23 20 23 14 17 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BottomBar() {
  const { isSyncing, setIsSyncing, syncProgress, setSyncProgress, setActivePanel } =
    useUIStore();
  const refreshAllStatuses = useRepoStore((s) => s.refreshAllStatuses);
  const config = useRepoStore((s) => s.config);
  const addToast = useToastStore((s) => s.add);

  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [lastSyncedText, setLastSyncedText] = useState<string>("Never");
  const [lastSyncedCount, setLastSyncedCount] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isFetching, setIsFetching] = useState(false);

  // Update "X minutes ago" every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastSynced) {
        setLastSyncedText(timeAgo(lastSynced));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [lastSynced]);

  useEffect(() => {
    if (lastSynced) {
      setLastSyncedText(timeAgo(lastSynced));
    }
  }, [lastSynced]);

  // Animate progress bar during sync
  useEffect(() => {
    if (isSyncing) {
      setProgress(0);
      const steps = [10, 25, 45, 65, 80, 92];
      let i = 0;
      const advance = setInterval(() => {
        if (i < steps.length) {
          setProgress(steps[i]);
          i++;
        } else {
          clearInterval(advance);
        }
      }, 300);
      return () => clearInterval(advance);
    } else {
      setProgress(100);
      const reset = setTimeout(() => setProgress(0), 600);
      return () => clearTimeout(reset);
    }
  }, [isSyncing]);

  const handleFetchAll = async () => {
    if (isFetching || isSyncing) return;
    const repos = config?.repos ?? [];
    if (!repos.length) return;

    setIsFetching(true);
    let ok = 0;
    let fail = 0;
    for (const repo of repos) {
      try {
        await ipc.fetchRepo(repo.path);
        ok++;
      } catch {
        fail++;
      }
    }
    setIsFetching(false);
    await refreshAllStatuses();

    if (fail === 0) {
      addToast("success", `Fetched ${ok} repositories`);
    } else {
      addToast("warning", `Fetched ${ok} repos, ${fail} failed`);
    }
  };

  const handleSyncAll = async () => {
    if (isSyncing) return;
    const repos = config?.repos ?? [];
    if (!repos.length) return;

    setIsSyncing(true);
    setSyncProgress("Syncing repositories…");

    try {
      const results = await ipc.syncAll();
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      setLastSynced(new Date());
      setLastSyncedCount(succeeded);
      setSyncProgress("");
      setIsSyncing(false);
      await refreshAllStatuses();

      if (failed === 0) {
        addToast("success", `Synced ${succeeded} repositories`);
      } else {
        addToast(
          "warning",
          `Synced ${succeeded} repos, ${failed} failed`,
          {
            label: "View details",
            onClick: () => {
              const failures = results
                .filter((r) => !r.success)
                .map((r) => `${r.path}: ${r.message}`)
                .join("\n");
              console.error(failures);
            },
          }
        );
      }
    } catch (e) {
      setIsSyncing(false);
      setSyncProgress("");
      addToast("error", `Sync failed: ${e}`);
    }
  };

  const [isGcRunning, setIsGcRunning] = useState(false);

  const handleGcAll = async () => {
    if (isGcRunning || isSyncing) return;
    const repos = config?.repos ?? [];
    if (!repos.length) return;

    setIsGcRunning(true);
    addToast("info", "Running GC & Prune on all repos…");
    let ok = 0;
    let fail = 0;
    for (const repo of repos) {
      try {
        await ipc.gitGc(repo.path);
        ok++;
      } catch {
        fail++;
      }
    }
    setIsGcRunning(false);
    if (fail === 0) {
      addToast("success", `GC & Prune complete on ${ok} repos`);
    } else {
      addToast("warning", `GC done on ${ok} repos, ${fail} failed`);
    }
  };

  const repoCount = config?.repos.length ?? 0;

  // Branch quick-switch state
  const { selectedRepoPath } = useUIStore();
  const statuses = useRepoStore((s) => s.statuses);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const selectedStatus = selectedRepoPath ? statuses[selectedRepoPath] : null;
  const currentBranch = selectedStatus?.current_branch;
  const selectedRepoName = config?.repos.find((r) => r.path === selectedRepoPath)?.name;
  const [branchDropdown, setBranchDropdown] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [switching, setSwitching] = useState(false);

  const handleOpenBranches = async () => {
    if (!selectedRepoPath || branchDropdown) {
      setBranchDropdown(false);
      return;
    }
    try {
      const data = await ipc.listBranches(selectedRepoPath);
      setBranches(data.filter((b: BranchInfo) => !b.is_remote));
      setBranchDropdown(true);
    } catch {
      setBranchDropdown(false);
    }
  };

  const handleSwitchBranch = async (name: string) => {
    if (!selectedRepoPath || switching) return;
    setSwitching(true);
    setBranchDropdown(false);
    try {
      await ipc.switchBranch(selectedRepoPath, name);
      addToast("success", `Switched to ${name}`);
      refreshStatus(selectedRepoPath);
    } catch (e) {
      addToast("error", `Switch failed: ${e}`);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      style={{
        height: "56px",
        background: "var(--color-bg-base)",
        borderTop: "1px solid var(--color-border-subtle)",
        display: "flex",
        alignItems: "center",
        paddingLeft: "24px",
        paddingRight: "20px",
        gap: "16px",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
      }}
    >
      {/* Left: sync status */}
      <div style={{ flex: "0 0 auto", minWidth: "200px" }}>
        {isSyncing ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--color-accent)",
            }}
          >
            <div style={{
              width: "7px", height: "7px", borderRadius: "50%",
              background: "var(--color-accent)",
              boxShadow: "0 0 6px var(--color-accent)",
              animation: "pulse 1s ease-in-out infinite",
              flexShrink: 0,
            }} />
            <SyncIcon spinning={true} />
            <span style={{ fontSize: "12px", fontWeight: 500 }}>
              {syncProgress || "Syncing…"}
            </span>
          </div>
        ) : (
          <div>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              {lastSynced
                ? `Last synced: ${lastSyncedText}`
                : "Not synced yet"}
            </span>
            {lastSynced && lastSyncedCount !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--color-accent)" }} />
                <span style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>
                  {lastSyncedCount} {lastSyncedCount === 1 ? "repo" : "repos"} synced
                </span>
              </div>
            )}
            {!lastSynced && repoCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--color-accent)" }} />
                <span style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>
                  {repoCount} {repoCount === 1 ? "repo" : "repos"} tracked
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Branch quick-switch */}
      {selectedRepoPath && currentBranch && (
        <div style={{ position: "relative", flex: "0 0 auto", display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={handleOpenBranches}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              background: branchDropdown ? "var(--color-accent-dim)" : "var(--overlay-subtle)",
              border: `1px solid ${branchDropdown ? "var(--color-accent-border)" : "var(--color-border-subtle)"}`,
              borderRadius: "14px",
              color: branchDropdown ? "var(--color-accent)" : "var(--color-text-secondary)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 120ms ease",
              maxWidth: "200px",
            }}
            onMouseEnter={(e) => {
              if (!branchDropdown) {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!branchDropdown) {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2" />
              <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
              <circle cx="18" cy="9" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M6 9v6M6 9c0-2 3-3 6-3h3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentBranch}
            </span>
            {selectedRepoName && (
              <span style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginLeft: "2px" }}>
                ({selectedRepoName})
              </span>
            )}
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* Ahead / Behind indicator */}
          {selectedStatus && (selectedStatus.ahead > 0 || selectedStatus.behind > 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 600 }}>
              {selectedStatus.ahead > 0 && (
                <span title={`${selectedStatus.ahead} commit${selectedStatus.ahead > 1 ? "s" : ""} ahead of remote`} style={{ color: "var(--color-info)", display: "flex", alignItems: "center", gap: "2px" }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {selectedStatus.ahead}
                </span>
              )}
              {selectedStatus.behind > 0 && (
                <span title={`${selectedStatus.behind} commit${selectedStatus.behind > 1 ? "s" : ""} behind remote`} style={{ color: "var(--color-warning)", display: "flex", alignItems: "center", gap: "2px" }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 3v6M3 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {selectedStatus.behind}
                </span>
              )}
            </div>
          )}
          {branchDropdown && (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: "6px",
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "10px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                minWidth: "180px",
                maxHeight: "240px",
                overflowY: "auto",
                padding: "4px 0",
                zIndex: 100,
              }}
            >
              {branches.map((b) => (
                <button
                  key={b.name}
                  onClick={() => handleSwitchBranch(b.name)}
                  disabled={b.is_current}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "7px 14px",
                    background: b.is_current ? "var(--color-accent-dim)" : "none",
                    border: "none",
                    cursor: b.is_current ? "default" : "pointer",
                    fontSize: "12px",
                    color: b.is_current ? "var(--color-accent)" : "var(--color-text-secondary)",
                    fontWeight: b.is_current ? 700 : 400,
                    textAlign: "left",
                    transition: "background 100ms ease",
                    borderRadius: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!b.is_current) (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
                  }}
                  onMouseLeave={(e) => {
                    if (!b.is_current) (e.currentTarget as HTMLButtonElement).style.background = "none";
                  }}
                >
                  {b.is_current && <span style={{ fontSize: "10px" }}>●</span>}
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.name}
                  </span>
                  {b.ahead > 0 && <span style={{ fontSize: "9px", color: "var(--color-info)" }}>↑{b.ahead}</span>}
                  {b.behind > 0 && <span style={{ fontSize: "9px", color: "var(--color-warning)" }}>↓{b.behind}</span>}
                </button>
              ))}
              {branches.length === 0 && (
                <div style={{ padding: "12px", textAlign: "center", fontSize: "11px", color: "var(--color-text-disabled)" }}>
                  No local branches
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Center: progress bar */}
      <div style={{ flex: 1, maxWidth: "400px", margin: "0 auto" }}>
        {(isSyncing || progress > 0) && (
          <div
            style={{
              height: "3px",
              background: "var(--overlay-light)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background:
                  progress === 100
                    ? "var(--color-accent)"
                    : "linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))",
                borderRadius: "2px",
                transition:
                  progress === 100
                    ? "width 400ms ease, background 400ms ease"
                    : "width 300ms ease",
                boxShadow: "0 0 8px var(--color-accent-dim)",
              }}
            />
          </div>
        )}
      </div>

      {/* Right: action buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flex: "0 0 auto",
        }}
      >
        {/* Scan for repos — shown when no repos configured */}
        {repoCount === 0 && (
          <button
            onClick={() => setActivePanel("scan")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 16px",
              background: "rgba(167,139,250,0.12)",
              color: "#A78BFA",
              border: "1px solid rgba(167,139,250,0.3)",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 150ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(167,139,250,0.2)";
              (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(167,139,250,0.12)";
              (e.currentTarget as HTMLButtonElement).style.color = "#A78BFA";
            }}
          >
            <ScanIcon />
            Scan for repos
          </button>
        )}

        {/* GC & Prune All */}
        <button
          onClick={handleGcAll}
          disabled={isGcRunning || isSyncing || repoCount === 0}
          title="Run git gc --prune=now on all repositories"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 16px",
            background: "var(--overlay-subtle)",
            color: isGcRunning ? "var(--color-text-disabled)" : "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: isGcRunning || isSyncing || repoCount === 0 ? "not-allowed" : "pointer",
            opacity: repoCount === 0 ? 0.4 : 1,
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!isGcRunning && !isSyncing && repoCount > 0) {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {isGcRunning ? "Running GC…" : "GC & Prune"}
        </button>

        {/* Fetch All */}
        <button
          onClick={handleFetchAll}
          disabled={isFetching || isSyncing || repoCount === 0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 16px",
            background: "var(--overlay-subtle)",
            color: isFetching ? "var(--color-text-disabled)" : "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: isFetching || isSyncing || repoCount === 0 ? "not-allowed" : "pointer",
            opacity: repoCount === 0 ? 0.4 : 1,
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!isFetching && !isSyncing && repoCount > 0) {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--overlay-light)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--overlay-subtle)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
          }}
        >
          <FetchIcon />
          {isFetching ? "Fetching…" : "Fetch All"}
        </button>

        {/* Sync All */}
        <button
          onClick={handleSyncAll}
          disabled={isSyncing || repoCount === 0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 20px",
            background: isSyncing ? "var(--color-accent-dim)" : "var(--color-accent)",
            color: "#000",
            border: "none",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: 700,
            cursor: isSyncing || repoCount === 0 ? "not-allowed" : "pointer",
            opacity: repoCount === 0 ? 0.4 : 1,
            transition: "all 150ms ease",
            boxShadow: isSyncing
              ? "none"
              : "0 2px 12px var(--color-accent-dim)",
          }}
          onMouseEnter={(e) => {
            if (!isSyncing && repoCount > 0) {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent-hover)";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.03)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSyncing) {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent)";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }
          }}
        >
          <SyncIcon spinning={isSyncing} />
          {isSyncing ? "Syncing…" : "Sync All"}
        </button>
      </div>
    </div>
  );
}
