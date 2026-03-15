import React, { useEffect, useState } from "react";
import { useUIStore } from "../../store/uiStore";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
import { ipc } from "../../lib/ipc";

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

  const repoCount = config?.repos.length ?? 0;

  return (
    <div
      style={{
        height: "64px",
        background: "#000000",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        paddingLeft: "24px",
        paddingRight: "20px",
        gap: "16px",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
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
              color: "#1DB954",
            }}
          >
            <div style={{
              width: "7px", height: "7px", borderRadius: "50%",
              background: "#1DB954",
              boxShadow: "0 0 6px #1DB954",
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
            <span style={{ fontSize: "12px", color: "#6a6a6a" }}>
              {lastSynced
                ? `Last synced: ${lastSyncedText}`
                : "Not synced yet"}
            </span>
            {lastSynced && lastSyncedCount !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#1DB954" }} />
                <span style={{ fontSize: "10px", color: "#535353" }}>
                  {lastSyncedCount} {lastSyncedCount === 1 ? "repo" : "repos"} synced
                </span>
              </div>
            )}
            {!lastSynced && repoCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "1px" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#1DB954" }} />
                <span style={{ fontSize: "10px", color: "#535353" }}>
                  {repoCount} {repoCount === 1 ? "repo" : "repos"} tracked
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: progress bar */}
      <div style={{ flex: 1, maxWidth: "400px", margin: "0 auto" }}>
        {(isSyncing || progress > 0) && (
          <div
            style={{
              height: "3px",
              background: "rgba(255,255,255,0.08)",
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
                    ? "#1DB954"
                    : "linear-gradient(90deg, #1DB954, #1ed760)",
                borderRadius: "2px",
                transition:
                  progress === 100
                    ? "width 400ms ease, background 400ms ease"
                    : "width 300ms ease",
                boxShadow: "0 0 8px rgba(29,185,84,0.6)",
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

        {/* Fetch All */}
        <button
          onClick={handleFetchAll}
          disabled={isFetching || isSyncing || repoCount === 0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 16px",
            background: "rgba(255,255,255,0.06)",
            color: isFetching ? "#6a6a6a" : "#b3b3b3",
            border: "1px solid rgba(255,255,255,0.1)",
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
                "rgba(255,255,255,0.1)";
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
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
            background: isSyncing ? "rgba(29,185,84,0.5)" : "#1DB954",
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
              : "0 2px 12px rgba(29,185,84,0.35)",
          }}
          onMouseEnter={(e) => {
            if (!isSyncing && repoCount > 0) {
              (e.currentTarget as HTMLButtonElement).style.background = "#1ed760";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.03)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSyncing) {
              (e.currentTarget as HTMLButtonElement).style.background = "#1DB954";
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
