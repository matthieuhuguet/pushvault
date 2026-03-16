import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RepoConfig, RepoStatus, SyncState } from "../../types";
import { useUIStore } from "../../store/uiStore";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
import { useGitHubStore } from "../../store/githubStore";
import { useActivityStore } from "../../store/activityStore";
import { useConfirmStore } from "../../store/confirmStore";
import { ipc } from "../../lib/ipc";
import { WorkflowRunsModal } from "../GitHub/WorkflowRunsModal";
import { GitHubPRsModal } from "../GitHub/GitHubPRsModal";
import { GitHubIssuesModal } from "../GitHub/GitHubIssuesModal";
import { GitHubReleaseModal } from "../GitHub/GitHubReleaseModal";

/* ── Icon map ───────────────────────────────────────────────── */
function RepoIcon({ name, size = 28 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    brain: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 5C10 5 8 6.5 8 9c0 1 .4 2 1 2.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 5c2 0 4 1.5 4 4 0 1-.4 2-1 2.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 9c-1.5 0-3 1.2-3 3 0 1.5 1 2.7 2.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 9c1.5 0 3 1.2 3 3 0 1.5-1 2.7-2.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7.5 15C7 16 7 17 8 18c.8.8 2 1 3 .8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.5 15c.5 1 .5 2-.5 3-.8.8-2 1-3 .8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    camera: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    code: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <polyline points="16 18 22 12 16 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="8 6 2 12 8 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    folder: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    star: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    rocket: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" stroke="currentColor" strokeWidth="1.8" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    book: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    music: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    cube: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <line x1="12" y1="22.08" x2="12" y2="12" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    download: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    portfolio: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="2" y1="13" x2="22" y2="13" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="13" r="1.5" fill="currentColor" />
      </svg>
    ),
    globe: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
        <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    shield: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    terminal: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <polyline points="4 17 10 11 4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="19" x2="20" y2="19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    heart: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    zap: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    git: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="6" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.5v4.5l-6 4.5M12 12l6 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  };

  return (
    <span style={{ color: "var(--color-icon-default)", display: "inline-flex" }}>
      {icons[name] ?? icons["folder"]}
    </span>
  );
}

/* ── State helpers ──────────────────────────────────────────── */
function getStateLabel(state: SyncState): string {
  switch (state) {
    case "SYNCED":    return "Synced";
    case "NEEDS_PUSH": return "Needs Push";
    case "NEEDS_PULL": return "Needs Pull";
    case "DIVERGED":  return "Diverged";
    case "CONFLICT":  return "Conflict";
    case "NOT_INIT":  return "Not Initialized";
    case "CHECKING":  return "Checking…";
    case "ERROR":     return "Error";
  }
}

function getStateDot(state: SyncState): string {
  switch (state) {
    case "SYNCED":     return "#1DB954";
    case "NEEDS_PUSH": return "#3d9be9";
    case "NEEDS_PULL": return "#f59b00";
    case "DIVERGED":   return "#ff7b00";
    case "CONFLICT":   return "#e5534b";
    case "ERROR":      return "#e5534b";
    case "NOT_INIT":   return "#535353";
    case "CHECKING":   return "#b3b3b3";
  }
}

function buildStatusText(status: RepoStatus): string {
  const parts: string[] = [];

  // Local changes
  if (status.modified > 0) parts.push(`${status.modified} modified`);
  if (status.untracked > 0) parts.push(`${status.untracked} new`);
  if (status.deleted > 0)  parts.push(`${status.deleted} deleted`);
  if (status.staged > 0)   parts.push(`${status.staged} staged`);
  if (status.conflicts > 0) parts.push(`${status.conflicts} conflicts`);

  // Sync state summary
  if (status.ahead > 0 && status.behind > 0) {
    parts.push(`↑${status.ahead} ↓${status.behind} diverged`);
  } else if (status.ahead > 0) {
    parts.push(`↑${status.ahead} ahead · needs push`);
  } else if (status.behind > 0) {
    parts.push(`↓${status.behind} behind · needs pull`);
  }

  if (parts.length === 0) {
    return status.state === "SYNCED" ? "synced" : "nothing to commit";
  }

  return parts.join(" · ");
}

/* ── Context menu ───────────────────────────────────────────── */
interface ContextMenuProps {
  x: number;
  y: number;
  repoPath: string;
  repoName: string;
  conflictsCount: number;
  remoteUrl?: string | null;
  onClose: () => void;
  onShowPRs?: () => void;
  onShowWorkflowRuns?: () => void;
  onShowIssues?: () => void;
  onShowRelease?: () => void;
}

export function RepoContextMenu({ x, y, repoPath, repoName, conflictsCount, remoteUrl, onClose, onShowPRs, onShowWorkflowRuns, onShowIssues, onShowRelease }: ContextMenuProps) {
  const { setSelectedRepoPath, setActivePanel } = useUIStore();
  const removeRepo = useRepoStore((s) => s.removeRepo);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const addToast = useToastStore((s) => s.add);
  const logActivity = useActivityStore((s) => s.addEntry);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleEsc);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const openPanel = (panel: "staging" | "history" | "stash" | "branches" | "conflicts" | "tags" | "gitignore" | "worktrees" | "submodules" | "lfs" | "bisect" | "rebase") => {
    setSelectedRepoPath(repoPath);
    setActivePanel(panel);
    onClose();
  };

  const handleOpenExplorer = async () => {
    onClose();
    try {
      await ipc.openInExplorer(repoPath);
    } catch (e) {
      addToast("error", `Failed to open explorer: ${e}`);
    }
  };

  const handleOpenVscode = async () => {
    onClose();
    try {
      await ipc.openInVscode(repoPath);
    } catch (e) {
      addToast("error", `Failed to open VS Code: ${e}`);
    }
  };

  const handleOpenTerminal = async () => {
    onClose();
    try {
      await ipc.openInTerminal(repoPath);
    } catch (e) {
      addToast("error", `Failed to open terminal: ${e}`);
    }
  };

  const handleSync = async () => {
    onClose();
    try {
      addToast("info", "Syncing…");
      const result = await ipc.syncRepoWithProgress(repoPath, "");
      if (result.success) {
        const actions = [result.pulled && "pulled", result.pushed && "pushed"].filter(Boolean).join(" + ");
        addToast("success", `Synced${actions ? ` (${actions})` : ""}`);
        logActivity({ repoName, operation: "Sync", success: true, message: actions ? `Pulled + pushed` : "Already in sync", isDestructive: false });
      } else {
        addToast("warning", result.message || "Sync had issues");
        logActivity({ repoName, operation: "Sync", success: false, message: result.message || "Sync had issues", isDestructive: false });
      }
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Sync failed: ${e}`);
      logActivity({ repoName, operation: "Sync", success: false, message: String(e), isDestructive: false });
    }
  };

  const handlePush = async () => {
    onClose();
    try {
      await ipc.pushRepo(repoPath, "");
      addToast("success", "Pushed successfully");
      logActivity({ repoName, operation: "Push", success: true, message: "Pushed to remote", isDestructive: false });
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Push failed: ${e}`);
      logActivity({ repoName, operation: "Push", success: false, message: String(e), isDestructive: false });
    }
  };

  const handlePull = async () => {
    onClose();
    try {
      await ipc.pullRepo(repoPath);
      addToast("success", "Pulled successfully");
      logActivity({ repoName, operation: "Pull", success: true, message: "Pulled from remote", isDestructive: false });
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Pull failed: ${e}`);
      logActivity({ repoName, operation: "Pull", success: false, message: String(e), isDestructive: false });
    }
  };

  const handleFetch = async () => {
    onClose();
    try {
      await ipc.fetchRepo(repoPath);
      addToast("info", "Fetched remote");
      logActivity({ repoName, operation: "Fetch", success: true, message: "Fetched remote refs", isDestructive: false });
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Fetch failed: ${e}`);
      logActivity({ repoName, operation: "Fetch", success: false, message: String(e), isDestructive: false });
    }
  };

  const handleRemove = async () => {
    onClose();
    const ok = await useConfirmStore.getState().request({
      title: "Remove repository?",
      description: `Remove "${repoPath}" from PushVault?\n\nThis will not delete any files.`,
      danger: true,
      confirmLabel: "Remove",
    });
    if (ok) {
      await removeRepo(repoPath);
      addToast("info", "Repo removed from PushVault");
    }
  };

  const handleGitGc = async () => {
    onClose();
    try {
      addToast("info", "Running Git GC…");
      const result = await ipc.gitGc(repoPath);
      addToast("success", `GC done: ${result || "clean"}`);
    } catch (e) {
      addToast("error", `Git GC failed: ${e}`);
    }
  };

  const handleFetchPrune = async () => {
    onClose();
    try {
      addToast("info", "Fetching & pruning…");
      const result = await ipc.fetchPrune(repoPath);
      addToast("success", result || "Fetch & prune done");
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Fetch & prune failed: ${e}`);
    }
  };

  const handleRemotePrune = async () => {
    onClose();
    try {
      const pruned = await ipc.remotePrune(repoPath, "origin");
      if (pruned.length === 0) {
        addToast("info", "No stale remote-tracking branches found");
      } else {
        addToast("success", `Pruned: ${pruned.join(", ")}`);
        refreshStatus(repoPath);
      }
    } catch (e) {
      addToast("error", `Remote prune failed: ${e}`);
    }
  };

  const handleCopyRemoteUrl = () => {
    if (!remoteUrl) return;
    navigator.clipboard.writeText(remoteUrl).catch(() => {});
    onClose();
    addToast("info", `Copied: ${remoteUrl}`);
  };

  const handleOpenRemoteUrl = () => {
    if (!remoteUrl) return;
    // Convert SSH URL to HTTPS for browser navigation
    let webUrl = remoteUrl.replace(/\.git$/, "");
    if (webUrl.startsWith("git@github.com:")) {
      webUrl = "https://github.com/" + webUrl.slice("git@github.com:".length);
    } else if (webUrl.startsWith("git@")) {
      // other SSH: git@host:user/repo → https://host/user/repo
      webUrl = webUrl.replace(/^git@([^:]+):/, "https://$1/");
    }
    window.open(webUrl, "_blank", "noopener noreferrer");
    onClose();
  };

  // Adjust position to stay within viewport
  const menuWidth = 220;
  const menuHeight = remoteUrl ? 748 : 568;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

  const item = (
    label: string,
    icon: string,
    onClick: () => void,
    danger = false
  ) => (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "8px 16px",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: "13px",
        color: danger ? "#e5534b" : "#b3b3b3",
        textAlign: "left",
        transition: "background 100ms ease, color 100ms ease",
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = danger
          ? "rgba(229,83,75,0.1)"
          : "var(--overlay-light)";
        (e.currentTarget as HTMLButtonElement).style.color = danger ? "#e5534b" : "#fff";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
        (e.currentTarget as HTMLButtonElement).style.color = danger
          ? "#e5534b"
          : "#b3b3b3";
      }}
    >
      <span style={{ fontSize: "14px", width: "16px", textAlign: "center" }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: adjustedY,
        left: adjustedX,
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "10px",
        padding: "4px 0",
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        zIndex: 9998,
        minWidth: menuWidth + "px",
        animation: "fade-in 100ms ease both",
      }}
    >
      {item("Sync (Pull + Push)", "⇅", handleSync)}
      {item("Push", "↑", handlePush)}
      {item("Pull", "↓", handlePull)}
      {item("Fetch", "⟳", handleFetch)}
      <div style={{ height: "1px", background: "var(--overlay-subtle)", margin: "4px 0" }} />
      {item("Changes", "±", () => openPanel("staging"))}
      {item("History", "◷", () => openPanel("history"))}
      {item("Stash", "📦", () => openPanel("stash"))}
      {item("Manage Branches", "⎇", () => openPanel("branches"))}
      {item("Worktrees", "⊞", () => openPanel("worktrees"))}
      {item("Submodules", "⊂", () => openPanel("submodules"))}
      {item("Git LFS", "📦", () => openPanel("lfs"))}
      {item("Bisect", "🔍", () => openPanel("bisect"))}
      {item("Rebase", "↕", () => openPanel("rebase"))}
      {item("Manage Tags", "🏷", () => openPanel("tags"))}
      {item("Edit .gitignore", "⊘", () => openPanel("gitignore"))}
      {conflictsCount > 0 && item("Resolve Conflicts", "⚡", () => openPanel("conflicts"))}
      <div style={{ height: "1px", background: "var(--overlay-subtle)", margin: "4px 0" }} />
      {item("Open in Explorer", "📁", handleOpenExplorer)}
      {item("Open in VS Code", "⎈", handleOpenVscode)}
      {item("Open in Terminal", ">_", handleOpenTerminal)}
      <div style={{ height: "1px", background: "var(--overlay-subtle)", margin: "4px 0" }} />
      {item("Git GC / Clean up", "🔧", handleGitGc)}
      {item("Fetch & Prune", "🌿", handleFetchPrune)}
      {item("Remote Prune", "✂", handleRemotePrune)}
      {remoteUrl && (
        <>
          <div style={{ height: "1px", background: "var(--overlay-subtle)", margin: "4px 0" }} />
          {item("Open on GitHub", "⎋", handleOpenRemoteUrl)}
          {item("Copy Remote URL", "⎘", handleCopyRemoteUrl)}
          {onShowPRs && item("Pull Requests", "⇌", () => { onClose(); onShowPRs(); })}
          {onShowIssues && item("Issues", "◎", () => { onClose(); onShowIssues(); })}
          {onShowWorkflowRuns && item("GitHub Actions", "⏱", () => { onClose(); onShowWorkflowRuns(); })}
          {onShowRelease && item("Create Release", "🚀", () => { onClose(); onShowRelease(); })}
        </>
      )}
      <div style={{ height: "1px", background: "var(--overlay-subtle)", margin: "4px 0" }} />
      {item("Remove", "✕", handleRemove, true)}
    </div>
  );
}

/* ── CI badge ───────────────────────────────────────────────── */
interface CiBadgeProps {
  status: "success" | "failure" | "in_progress";
  onClick?: () => void;
}

function CiBadge({ status, onClick }: CiBadgeProps) {
  const colorMap = {
    success: "#1DB954",
    failure: "#e5534b",
    in_progress: "#f59b00",
  };
  const labelMap = {
    success: "CI passed — click for details",
    failure: "CI failed — click for details",
    in_progress: "CI running — click for details",
  };
  const color = colorMap[status];

  return (
    <span
      title={labelMap[status]}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        flexShrink: 0,
        cursor: onClick ? "pointer" : "default",
        padding: "1px 5px",
        borderRadius: "8px",
        background: `${color}18`,
        border: `1px solid ${color}44`,
        transition: "all 120ms ease",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 4px ${color}bb`,
          animation: status === "in_progress" ? "pulse 1.4s ease-in-out infinite" : undefined,
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: "9px", fontWeight: 700, color }}>
        {status === "success" ? "CI" : status === "failure" ? "✕" : "⟳"}
      </span>
    </span>
  );
}

/* ── Skeleton card ──────────────────────────────────────────── */
export function RepoCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--color-bg-card)",
        borderRadius: "12px",
        overflow: "hidden",
        minWidth: "200px",
      }}
    >
      <div
        className="skeleton"
        style={{ height: "120px", borderRadius: 0 }}
      />
      <div style={{ padding: "16px" }}>
        <div className="skeleton" style={{ height: "16px", width: "70%", marginBottom: "8px" }} />
        <div className="skeleton" style={{ height: "12px", width: "50%", marginBottom: "12px" }} />
        <div className="skeleton" style={{ height: "12px", width: "90%" }} />
      </div>
    </div>
  );
}

/* ── RepoCard ───────────────────────────────────────────────── */
interface RepoCardProps {
  repo: RepoConfig;
  status?: RepoStatus;
  index: number;
}

export function RepoCard({ repo, status, index }: RepoCardProps) {
  const { setSelectedRepoPath, setActivePanel } = useUIStore();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [showWorkflowRuns, setShowWorkflowRuns] = useState(false);
  const [showPRs, setShowPRs] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [showRelease, setShowRelease] = useState(false);

  const ciStatuses = useGitHubStore((s) => s.ciStatuses);
  const fetchCiStatus = useGitHubStore((s) => s.fetchCiStatus);

  // Lazily load remote URL once per session, then fetch CI status
  useEffect(() => {
    let cancelled = false;
    ipc.getRemoteUrl(repo.path).then((url) => {
      if (cancelled || !url) return;
      setRemoteUrl(url);
      if (!(url in ciStatuses)) {
        fetchCiStatus(url);
      }
    }).catch(() => {/* no remote — ignore */});
    return () => { cancelled = true; };
  // Only run on mount (repo.path is stable per card instance)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.path]);

  const ciStatus = remoteUrl ? ciStatuses[remoteUrl] : undefined;

  const state: SyncState = status?.state ?? "CHECKING";
  const dotColor = getStateDot(state);
  const stateLabel = getStateLabel(state);

  // Card border based on state
  const getBorderColor = (): string => {
    if (state === "CONFLICT") return "rgba(232,82,90,0.5)";
    if (state === "ERROR") return "rgba(232,82,90,0.3)";
    if (state === "NEEDS_PUSH" || state === "NEEDS_PULL" || state === "DIVERGED") return "rgba(29,185,84,0.2)";
    if (state === "SYNCED") return "var(--overlay-soft)";
    if (hovered) return "rgba(29,185,84,0.4)";
    return "var(--overlay-subtle)";
  };

  const handleClick = () => {
    setSelectedRepoPath(repo.path);
    setActivePanel("staging");
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Parse color for gradient (support hex, named, etc.)
  const gradientBase = repo.color || "#1DB954";
  const hasChanges = (status?.staged ?? 0) + (status?.modified ?? 0) + (status?.untracked ?? 0) > 0;

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        style={{
          background: "var(--color-bg-card)",
          borderRadius: "12px",
          overflow: "hidden",
          border: `1px solid ${getBorderColor()}`,
          cursor: "pointer",
          transition: "all 0.2s ease",
          transform: pressed
            ? "scale(0.975)"
            : hovered
            ? "translateY(-2px)"
            : "none",
          boxShadow: hovered
            ? `0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px ${gradientBase}22`
            : "0 2px 8px rgba(0,0,0,0.3)",
          animationDelay: `${index * 40}ms`,
          animation: "fade-in 300ms ease both",
          minWidth: "200px",
          userSelect: "none",
          position: "relative",
        }}
        className="fade-in"
      >
        {/* Header gradient area */}
        <div
          style={{
            height: "120px",
            background: `linear-gradient(145deg, ${gradientBase}dd 0%, ${gradientBase}88 45%, ${gradientBase}22 80%, transparent 100%), #1a1a1a`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Background radial glow */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse at 20% 50%, ${gradientBase}55 0%, transparent 65%), radial-gradient(circle at 80% 20%, ${gradientBase}20 0%, transparent 50%)`,
            }}
          />

          {/* Icon */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              transition: "transform 200ms ease",
              transform: hovered ? "scale(1.1) rotate(-2deg)" : "scale(1)",
            }}
          >
            <RepoIcon name={repo.icon} size={36} />
          </div>

          {/* Hover push button */}
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              right: "12px",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "#1DB954",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              opacity: hovered ? 1 : 0,
              transform: hovered ? "translateY(0) scale(1)" : "translateY(6px) scale(0.8)",
              transition: "opacity 200ms ease, transform 200ms ease",
              zIndex: 2,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRepoPath(repo.path);
              setActivePanel("staging");
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 19V5M5 12l7-7 7 7"
                stroke="#000"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* State dot */}
          <div
            title={
              state === "ERROR" && status?.error
                ? `Error: ${status.error}`
                : state === "CONFLICT"
                ? "Merge conflicts detected"
                : undefined
            }
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              borderRadius: "20px",
              padding: "3px 8px",
              zIndex: 2,
              cursor: state === "ERROR" ? "help" : "default",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: dotColor,
                boxShadow:
                  state === "CHECKING"
                    ? undefined
                    : `0 0 6px ${dotColor}cc`,
                animation: state === "CHECKING" ? "pulse 2s ease-in-out infinite" : undefined,
              }}
            />
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: dotColor,
                letterSpacing: "0.04em",
              }}
            >
              {stateLabel}
            </span>
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: "14px 16px 16px" }}>
          {/* Repo name */}
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: "4px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {repo.name}
          </h3>

          {/* Branch + CI badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              marginBottom: "10px",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <circle cx="6" cy="6" r="3" stroke="#b3b3b3" strokeWidth="2" />
              <circle cx="6" cy="18" r="3" stroke="#b3b3b3" strokeWidth="2" />
              <circle cx="18" cy="9" r="3" stroke="#b3b3b3" strokeWidth="2" />
              <path d="M6 9v6M6 9c0-2 3-3 6-3h3" stroke="#b3b3b3" strokeWidth="1.5" />
            </svg>
            <span
              style={{
                fontSize: "11px",
                color: "var(--color-text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "120px",
              }}
            >
              {status?.current_branch ?? "—"}
            </span>
            {ciStatus && ciStatus !== "unknown" && (
              <CiBadge status={ciStatus} onClick={() => setShowWorkflowRuns(true)} />
            )}
          </div>

          {/* Status counts row */}
          {status && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
              {status.staged > 0 && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "10px",
                    background: "rgba(29,185,84,0.15)",
                    color: "#1DB954",
                  }}
                >
                  {status.staged} staged
                </span>
              )}
              {status.modified > 0 && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "10px",
                    background: "rgba(61,155,233,0.15)",
                    color: "#3d9be9",
                  }}
                >
                  {status.modified} modified
                </span>
              )}
              {status.untracked > 0 && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "10px",
                    background: "var(--overlay-light)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {status.untracked} new
                </span>
              )}
              {status.conflicts > 0 && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "10px",
                    background: "rgba(229,83,75,0.15)",
                    color: "#e5534b",
                  }}
                >
                  {status.conflicts} conflicts
                </span>
              )}
            </div>
          )}

          {/* Status text line */}
          <p
            style={{
              fontSize: "11px",
              color: "var(--color-text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {status ? buildStatusText(status) : "Loading…"}
          </p>

          {/* Ahead/Behind bar */}
          {status && (status.ahead > 0 || status.behind > 0) && (
            <div
              style={{
                marginTop: "10px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {status.ahead > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    fontSize: "10px",
                    color: "#3d9be9",
                  }}
                >
                  <span>↑</span>
                  <span>{status.ahead}</span>
                </div>
              )}
              {status.behind > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    fontSize: "10px",
                    color: "#f59b00",
                  }}
                >
                  <span>↓</span>
                  <span>{status.behind}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error overlay tint */}
        {(state === "ERROR" || state === "CONFLICT") && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(229,83,75,0.04)",
              pointerEvents: "none",
              borderRadius: "12px",
            }}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <RepoContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          repoPath={repo.path}
          repoName={repo.name}
          conflictsCount={status?.conflicts ?? 0}
          remoteUrl={remoteUrl}
          onClose={() => setContextMenu(null)}
          onShowPRs={remoteUrl ? () => setShowPRs(true) : undefined}
          onShowIssues={remoteUrl ? () => setShowIssues(true) : undefined}
          onShowWorkflowRuns={remoteUrl ? () => setShowWorkflowRuns(true) : undefined}
          onShowRelease={remoteUrl ? () => setShowRelease(true) : undefined}
        />
      )}

      {/* GitHub Actions workflow runs modal */}
      {showWorkflowRuns && remoteUrl && (
        <WorkflowRunsModal
          repoUrl={remoteUrl}
          repoName={repo.name}
          onClose={() => setShowWorkflowRuns(false)}
        />
      )}

      {/* GitHub PRs modal */}
      {showPRs && remoteUrl && (
        <GitHubPRsModal
          repoUrl={remoteUrl}
          repoName={repo.name}
          onClose={() => setShowPRs(false)}
        />
      )}

      {/* GitHub Issues modal */}
      {showIssues && remoteUrl && (
        <GitHubIssuesModal
          repoUrl={remoteUrl}
          repoName={repo.name}
          onClose={() => setShowIssues(false)}
        />
      )}

      {/* GitHub Release modal */}
      {showRelease && remoteUrl && (
        <GitHubReleaseModal
          repoUrl={remoteUrl}
          repoName={repo.name}
          onClose={() => setShowRelease(false)}
        />
      )}
    </>
  );
}
