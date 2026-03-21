import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";
import { useActivityStore } from "../../store/activityStore";
import { useConfirmStore } from "../../store/confirmStore";
import { usePromptStore } from "../../store/promptStore";
import { DiffViewer } from "../Diff/DiffViewer";
import { ReflogPanel } from "../ReflogPanel/ReflogPanel";
import { computeGraphLanes, getLaneColor, type GraphNode } from "../../lib/commitGraph";
import type { CommitInfo, DiffResult } from "../../types";

interface CommitHistoryProps {
  repoPath: string;
  onClose: () => void;
  repoName?: string;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  });
}

/** Convert a git remote URL to a GitHub web URL base */
function remoteToGitHubBase(remote: string): string | null {
  // SSH: git@github.com:user/repo.git
  const sshMatch = remote.match(/git@github\.com[:/](.+?)(?:\.git)?$/);
  if (sshMatch) return `https://github.com/${sshMatch[1]}`;
  // HTTPS: https://github.com/user/repo.git
  const httpsMatch = remote.match(/https?:\/\/github\.com\/(.+?)(?:\.git)?$/);
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}`;
  return null;
}

/* ── Context menu for commit rows ───────────────────────────── */
interface CommitContextMenuProps {
  x: number;
  y: number;
  commit: CommitInfo;
  repoPath: string;
  onClose: () => void;
  onRefresh: () => void;
}

function CommitContextMenu({ x, y, commit, repoPath, onClose, onRefresh }: CommitContextMenuProps) {
  const addToast = useToastStore((s) => s.add);
  const logActivity = useActivityStore((s) => s.addEntry);
  const requestConfirm = useConfirmStore((s) => s.request);
  const rName = repoPath.split(/[/\\]/).pop() ?? "Repo";
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

  const menuWidth = 240;
  const menuHeight = 300;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

  const menuItem = (
    label: string,
    icon: string,
    onClick: () => void,
    danger = false
  ) => (
    <button
      key={label}
      onClick={() => { onClose(); onClick(); }}
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
        color: danger ? "var(--color-error)" : "var(--color-text-secondary)",
        textAlign: "left",
        transition: "background 100ms ease, color 100ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = danger
          ? "var(--color-error-dim)"
          : "var(--overlay-light)";
        (e.currentTarget as HTMLButtonElement).style.color = danger ? "var(--color-error)" : "var(--color-text-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
        (e.currentTarget as HTMLButtonElement).style.color = danger ? "var(--color-error)" : "var(--color-text-secondary)";
      }}
    >
      <span style={{ fontSize: "14px", width: "16px", textAlign: "center", flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );

  const divider = () => (
    <div style={{ height: "1px", background: "var(--overlay-subtle)", margin: "4px 0" }} />
  );

  const handleCopyHash = () => {
    copyToClipboard(commit.hash);
    addToast("success", `Copied hash ${commit.short_hash}`);
  };

  const handleRevert = async () => {
    try {
      const newHash = await ipc.revertCommit(repoPath, commit.hash);
      addToast("success", `Reverted: ${newHash.slice(0, 7)}`);
      logActivity({ repoName: rName, operation: "Revert Commit", success: true, message: `Reverted ${commit.short_hash}: ${commit.message.slice(0, 50)}`, isDestructive: true });
      onRefresh();
    } catch (e) {
      addToast("error", `Revert failed: ${e}`);
      logActivity({ repoName: rName, operation: "Revert Commit", success: false, message: String(e), isDestructive: true });
    }
  };

  const handleCherryPick = async () => {
    try {
      const newHash = await ipc.cherryPickCommit(repoPath, commit.hash);
      addToast("success", `Cherry-picked: ${newHash.slice(0, 7)}`);
      logActivity({ repoName: rName, operation: "Cherry-pick", success: true, message: `Picked ${commit.short_hash}: ${commit.message.slice(0, 50)}`, isDestructive: false });
      onRefresh();
    } catch (e) {
      addToast("error", `Cherry-pick failed: ${e}`);
      logActivity({ repoName: rName, operation: "Cherry-pick", success: false, message: String(e), isDestructive: false });
    }
  };

  const handleCreateBranch = async () => {
    const name = await usePromptStore.getState().request({
      title: "Create branch",
      description: `Create a new branch from commit ${commit.short_hash}`,
      placeholder: "feature/my-branch",
      confirmLabel: "Create",
    });
    if (!name?.trim()) return;
    try {
      await ipc.createBranch(repoPath, name.trim(), commit.hash);
      addToast("success", `Branch "${name.trim()}" created from ${commit.short_hash}`);
    } catch (e) {
      addToast("error", `Create branch failed: ${e}`);
    }
  };

  const handleCreateTag = async () => {
    const name = await usePromptStore.getState().request({
      title: "Create tag",
      description: `Create a new tag at commit ${commit.short_hash}`,
      placeholder: "v1.0.0",
      confirmLabel: "Create",
    });
    if (!name?.trim()) return;
    try {
      await ipc.createTag(repoPath, name.trim(), null, commit.hash);
      addToast("success", `Tag "${name.trim()}" created at ${commit.short_hash}`);
    } catch (e) {
      addToast("error", `Create tag failed: ${e}`);
    }
  };

  const handleResetSoft = async () => {
    try {
      await ipc.resetRepo(repoPath, commit.hash, "soft");
      addToast("success", `Soft reset to ${commit.short_hash}`);
      logActivity({ repoName: rName, operation: "Reset (soft)", success: true, message: `Reset HEAD to ${commit.short_hash}`, isDestructive: true });
      onRefresh();
    } catch (e) {
      addToast("error", `Reset failed: ${e}`);
      logActivity({ repoName: rName, operation: "Reset (soft)", success: false, message: String(e), isDestructive: true });
    }
  };

  const handleResetHard = async () => {
    const ok = await requestConfirm({
      title: `Hard reset to ${commit.short_hash}`,
      description: `This will permanently discard ALL uncommitted changes in the working tree and staging area. The repository will be reset to commit: "${commit.message.slice(0, 80)}".`,
      danger: true,
      confirmPhrase: "HARD RESET",
      confirmLabel: "Hard Reset",
    });
    if (!ok) return;
    try {
      await ipc.resetRepo(repoPath, commit.hash, "hard");
      addToast("success", `Hard reset to ${commit.short_hash}`);
      logActivity({ repoName: rName, operation: "Reset (hard)", success: true, message: `Hard reset to ${commit.short_hash} — all changes discarded`, isDestructive: true });
      onRefresh();
    } catch (e) {
      addToast("error", `Reset failed: ${e}`);
      logActivity({ repoName: rName, operation: "Reset (hard)", success: false, message: String(e), isDestructive: true });
    }
  };

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
        zIndex: 9999,
        minWidth: menuWidth + "px",
        animation: "fade-in 100ms ease both",
      }}
    >
      {/* Commit summary header */}
      <div style={{
        padding: "8px 16px 6px",
        borderBottom: "1px solid var(--color-border-subtle)",
        marginBottom: "4px",
      }}>
        <div style={{
          fontFamily: "monospace",
          fontSize: "11px",
          color: "var(--color-info)",
          marginBottom: "2px",
        }}>
          {commit.short_hash}
        </div>
        <div style={{
          fontSize: "12px",
          color: "var(--color-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: menuWidth - 32 + "px",
        }}>
          {commit.message}
        </div>
      </div>

      {menuItem("Copy Hash", "⎘", handleCopyHash)}
      {divider()}
      {menuItem("Revert this commit", "⟲", handleRevert)}
      {menuItem("Cherry-pick to current branch", "✦", handleCherryPick)}
      {divider()}
      {menuItem("Create branch from here", "⎇", handleCreateBranch)}
      {menuItem("Create tag here", "🏷", handleCreateTag)}
      {divider()}
      {menuItem("Reset to here (soft)", "↩", handleResetSoft)}
      {menuItem("Reset to here (hard)", "⚠ Hard Reset", handleResetHard, true)}
    </div>
  );
}

/* ── Main CommitHistory ─────────────────────────────────────── */
export function CommitHistory({ repoPath, onClose, repoName }: CommitHistoryProps) {
  const addToast = useToastStore((s) => s.add);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    commit: CommitInfo;
  } | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(0);

  const [showGraph, setShowGraph] = useState(true);
  const [showReflog, setShowReflog] = useState(false);

  const filteredCommits = searchQuery.trim()
    ? commits.filter(
        (c) =>
          c.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.hash.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.author.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : commits;

  // Compute graph lanes (only when not filtering — graph requires full commit chain)
  const graphNodes = useMemo(
    () => (showGraph && !searchQuery.trim() ? computeGraphLanes(filteredCommits) : []),
    [filteredCommits, showGraph, searchQuery]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ipc.getLog(repoPath, limit);
      setCommits(data);
    } catch (e) {
      addToast("error", `Failed to load history: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [repoPath, limit]);

  useEffect(() => { load(); }, [load]);

  // Fetch remote URL for GitHub link
  useEffect(() => {
    ipc.getRemoteUrl(repoPath)
      .then((url) => setRemoteUrl(url))
      .catch(() => setRemoteUrl(null));
  }, [repoPath]);

  const handleExpand = async (commit: CommitInfo) => {
    if (expandedHash === commit.hash) {
      setExpandedHash(null);
      setDiff(null);
      return;
    }
    setExpandedHash(commit.hash);
    setDiffLoading(true);
    try {
      const d = await ipc.getCommitDiff(repoPath, commit.hash);
      setDiff(d);
    } catch {
      setDiff(null);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleCopy = (hash: string) => {
    copyToClipboard(hash);
    addToast("success", `Copied hash ${hash.slice(0, 7)}`);
  };

  const handleContextMenu = (e: React.MouseEvent, commit: CommitInfo) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, commit });
  };

  const gitHubBase = remoteUrl ? remoteToGitHubBase(remoteUrl) : null;

  // Keyboard navigation for commits
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in search
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, filteredCommits.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const commit = filteredCommits[focusedIdx];
        if (commit) handleExpand(commit);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredCommits, focusedIdx]);

  const handleViewOnGitHub = (hash: string) => {
    if (!gitHubBase) return;
    const url = `${gitHubBase}/commit/${hash}`;
    // Use Tauri shell open if available, otherwise window.open
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shell = (window as any).__TAURI__?.shell ?? (window as any).__TAURI_INTERNALS__?.plugins?.shell;
      if (shell?.open) {
        shell.open(url);
        return;
      }
    } catch {
      // fall through
    }
    window.open(url, "_blank");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-bg-primary)",
        backdropFilter: "blur(24px) saturate(1.5)",
        WebkitBackdropFilter: "blur(24px) saturate(1.5)",
        zIndex: 600,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "52px",
          background: "var(--color-bg-card)",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: "16px",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="var(--color-accent)" strokeWidth="2" />
          <polyline points="12 7 12 12 15 15" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", flexShrink: 0 }}>
          {repoName ?? "Repo"}
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 400, marginLeft: "10px" }}>
            Commit History
          </span>
        </h2>

        {/* Search bar */}
        <div style={{ flex: 1, maxWidth: "300px", position: "relative" }}>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-disabled)", pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commits…"
            style={{
              width: "100%",
              padding: "6px 10px 6px 28px",
              background: "var(--overlay-subtle)",
              border: "1px solid var(--color-border)",
              borderRadius: "20px",
              color: "var(--color-text-primary)",
              fontSize: "12px",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent-border)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--overlay-light)")}
          />
          {searchQuery && (
            <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: "var(--color-text-disabled)" }}>
              {filteredCommits.length}
            </span>
          )}
        </div>

        {/* Graph toggle */}
        <button
          title={showGraph ? "Hide graph" : "Show graph"}
          onClick={() => setShowGraph((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "5px 10px",
            background: showGraph ? "var(--color-accent-dim)" : "var(--overlay-subtle)",
            border: `1px solid ${showGraph ? "var(--color-accent-border)" : "var(--color-border)"}`,
            borderRadius: "20px",
            color: showGraph ? "var(--color-accent)" : "var(--color-text-secondary)",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 120ms ease",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
            <circle cx="18" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
            <circle cx="6" cy="18" r="2.5" stroke="currentColor" strokeWidth="2" />
            <path d="M6 8.5v7M8.5 6h7l-9.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Graph
        </button>

        {/* Reflog toggle */}
        <button
          title={showReflog ? "Hide reflog" : "Show reflog"}
          onClick={() => setShowReflog((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "5px 10px",
            background: showReflog ? "var(--color-warning-dim)" : "var(--overlay-subtle)",
            border: `1px solid ${showReflog ? "var(--color-warning-border)" : "var(--color-border)"}`,
            borderRadius: "20px",
            color: showReflog ? "var(--color-warning)" : "var(--color-text-secondary)",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 120ms ease",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M3 12a9 9 0 1 0 9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M3 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Reflog
        </button>

        {/* View on GitHub + New PR buttons */}
        {gitHubBase && (
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={() => {
                if (expandedHash) {
                  handleViewOnGitHub(expandedHash);
                } else if (commits.length > 0) {
                  handleViewOnGitHub(commits[0].hash);
                }
              }}
              title="View on GitHub"
              style={{
                height: "32px",
                padding: "0 14px",
                borderRadius: "16px",
                background: "var(--overlay-subtle)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-medium)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }}
            >
              {/* GitHub icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </button>

            <button
              onClick={() => {
                const url = `${gitHubBase}/compare`;
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const shell = (window as any).__TAURI__?.shell ?? (window as any).__TAURI_INTERNALS__?.plugins?.shell;
                  if (shell?.open) { shell.open(url); return; }
                } catch { /* fall through */ }
                window.open(url, "_blank");
              }}
              title="Open GitHub Pull Request comparison page"
              style={{
                height: "32px",
                padding: "0 14px",
                borderRadius: "16px",
                background: "var(--color-success-dim)",
                border: "1px solid var(--color-success-border)",
                color: "var(--color-accent)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent-dim)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-accent-border)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-success-dim)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-success-border)";
              }}
            >
              {/* PR icon (merge) */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="18" cy="6" r="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
                <path d="M6 9v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M18 9a6 6 0 0 1-6 6H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              New PR
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "var(--overlay-light)",
            border: "none",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            transition: "background 120ms ease, color 120ms ease",
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-strong)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
          }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Commit list */}
        <div
          style={{
            width: expandedHash ? "40%" : "100%",
            minWidth: "300px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRight: expandedHash ? "1px solid var(--overlay-subtle)" : "none",
            transition: "width 250ms ease",
          }}
        >
          {loading ? (
            <div
              style={{
                padding: "48px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                color: "var(--color-text-muted)",
                fontSize: "13px",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="var(--overlay-medium)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Loading history…
            </div>
          ) : commits.length === 0 ? (
            <div
              style={{
                padding: "64px 32px",
                textAlign: "center",
                color: "var(--color-text-disabled)",
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                style={{ display: "block", margin: "0 auto 16px", opacity: 0.3 }}
              >
                <circle cx="12" cy="12" r="9" stroke="var(--color-text-secondary)" strokeWidth="2" />
                <polyline points="12 7 12 12 15 15" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "6px" }}>
                No commits yet
              </p>
              <p style={{ fontSize: "13px" }}>
                Make your first commit to see history here.
              </p>
            </div>
          ) : filteredCommits.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--color-text-disabled)" }}>
              <p style={{ fontSize: "13px" }}>No commits match "{searchQuery}"</p>
            </div>
          ) : (
            <Virtuoso
              style={{ flex: 1 }}
              data={filteredCommits}
              endReached={() => !searchQuery && setLimit((l) => l + 50)}
              itemContent={(idx, commit) => {
                const isExpanded = expandedHash === commit.hash;
                const isFocused = idx === focusedIdx;
                const gn = graphNodes[idx];
                const hasGraph = showGraph && gn && !searchQuery.trim();
                const LANE_W = 16;
                const graphWidth = hasGraph ? Math.max((gn.maxLane + 2) * LANE_W, 40) : 40;
                return (
                  <div
                    style={{
                      position: "relative",
                      paddingLeft: `${graphWidth}px`,
                      animation: "fade-in 200ms ease both",
                      outline: isFocused ? "1px solid var(--color-info-border)" : "none",
                      outlineOffset: "-1px",
                      borderRadius: "4px",
                    }}
                  >
                    {hasGraph ? (
                      /* Graph SVG lanes */
                      <svg
                        width={graphWidth}
                        height="100%"
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          height: "100%",
                          overflow: "visible",
                        }}
                      >
                        {/* Connection lines going down */}
                        {gn.connectionsDown.map((conn, ci) => {
                          const x1 = conn.fromLane * LANE_W + LANE_W / 2 + 4;
                          const x2 = conn.toLane * LANE_W + LANE_W / 2 + 4;
                          const lineColor = getLaneColor(conn.toLane);
                          return conn.fromLane === conn.toLane ? (
                            <line
                              key={ci}
                              x1={x1} y1="0" x2={x2} y2="100%"
                              stroke={lineColor}
                              strokeWidth="1.5"
                              strokeOpacity="0.6"
                            />
                          ) : (
                            <path
                              key={ci}
                              d={`M${x1},20 C${x1},36 ${x2},36 ${x2},52`}
                              stroke={lineColor}
                              strokeWidth="1.5"
                              strokeOpacity="0.6"
                              fill="none"
                            />
                          );
                        })}
                        {/* Commit node */}
                        {gn.isMerge ? (
                          /* Merge: diamond */
                          <g transform={`translate(${gn.lane * LANE_W + LANE_W / 2 + 4}, 20)`}>
                            <rect
                              x="-5" y="-5" width="10" height="10"
                              rx="2"
                              transform="rotate(45)"
                              fill={isExpanded ? "var(--color-accent)" : getLaneColor(gn.lane)}
                              stroke={isExpanded ? "var(--color-accent)" : "var(--color-bg-card)"}
                              strokeWidth="1.5"
                            />
                          </g>
                        ) : (
                          /* Normal: circle */
                          <circle
                            cx={gn.lane * LANE_W + LANE_W / 2 + 4}
                            cy={20}
                            r={isExpanded ? 5 : 4}
                            fill={isExpanded ? "var(--color-accent)" : getLaneColor(gn.lane)}
                            stroke={isExpanded ? "var(--color-accent)" : "var(--color-bg-card)"}
                            strokeWidth="1.5"
                          />
                        )}
                      </svg>
                    ) : (
                      <>
                        {/* Simple timeline line */}
                        <div
                          style={{
                            position: "absolute",
                            left: "18px",
                            top: "28px",
                            height: "100%",
                            width: "1px",
                            background: "var(--overlay-light)",
                          }}
                        />
                        {/* Simple timeline dot */}
                        <div
                          style={{
                            position: "absolute",
                            left: "13px",
                            top: "16px",
                            width: "11px",
                            height: "11px",
                            borderRadius: "50%",
                            background: isExpanded ? "var(--color-accent)" : isFocused ? "var(--color-info)" : "var(--color-bg-elevated)",
                            border: `2px solid ${isExpanded ? "var(--color-accent)" : isFocused ? "var(--color-info)" : "var(--overlay-strong)"}`,
                            transition: "all 150ms ease",
                            zIndex: 1,
                            boxShadow: isExpanded
                              ? "0 0 8px var(--color-accent-border)"
                              : isFocused
                              ? "0 0 6px var(--color-info-border)"
                              : "none",
                          }}
                        />
                      </>
                    )}

                    {/* Commit row */}
                    <div
                      onClick={() => { setFocusedIdx(idx); handleExpand(commit); }}
                      onContextMenu={(e) => handleContextMenu(e, commit)}
                      style={{
                        padding: "12px 20px 12px 4px",
                        cursor: "pointer",
                        borderLeft: isExpanded
                          ? "2px solid var(--color-accent)"
                          : isFocused
                          ? "2px solid var(--color-info-border)"
                          : "2px solid transparent",
                        background: isExpanded
                          ? "var(--color-accent-dim)"
                          : isFocused
                          ? "var(--color-info-dim)"
                          : "transparent",
                        transition: "background 120ms ease, border-color 120ms ease",
                        userSelect: "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded && !isFocused)
                          (e.currentTarget as HTMLDivElement).style.background =
                            "var(--overlay-soft)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded && !isFocused)
                          (e.currentTarget as HTMLDivElement).style.background =
                            "transparent";
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "12px",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {commit.message}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--color-text-disabled)", flexShrink: 0 }}>
                          {commit.date_relative}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopy(commit.hash); }}
                          title="Copy full hash"
                          style={{
                            fontFamily: '"Cascadia Code", "Fira Code", monospace',
                            fontSize: "10px",
                            color: "var(--color-info)",
                            background: "var(--color-info-dim)",
                            border: "1px solid var(--color-info-border)",
                            borderRadius: "6px",
                            padding: "1px 7px",
                            cursor: "pointer",
                            transition: "background 100ms ease",
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--color-info-border)")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--color-info-dim)")}
                        >
                          {commit.short_hash}
                        </button>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{commit.author}</span>
                        {commit.files_changed > 0 && (
                          <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>
                            {commit.files_changed} {commit.files_changed === 1 ? "file" : "files"}
                          </span>
                        )}
                        {commit.insertions > 0 && (
                          <span style={{ fontSize: "11px", color: "var(--color-success)", fontWeight: 600 }}>
                            +{commit.insertions}
                          </span>
                        )}
                        {commit.deletions > 0 && (
                          <span style={{ fontSize: "11px", color: "var(--color-error)", fontWeight: 600 }}>
                            -{commit.deletions}
                          </span>
                        )}
                        {gitHubBase && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewOnGitHub(commit.hash); }}
                            title="View on GitHub"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--color-text-disabled)",
                              fontSize: "11px",
                              padding: "0 2px",
                              transition: "color 100ms ease",
                              lineHeight: 1,
                            }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-disabled)")}
                          >
                            ↗
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>

        {/* Reflog panel (replaces diff when active) */}
        {showReflog && (
          <div style={{ flex: 1, overflow: "hidden", minHeight: 200 }}>
            <ReflogPanel
              repoPath={repoPath}
              onClose={() => setShowReflog(false)}
              onCheckout={async (hash) => {
                const ok = await useConfirmStore.getState().request({
                  title: "Reset to this commit?",
                  description: `Reset HEAD to ${hash.slice(0, 8)}? This moves HEAD but keeps your working directory (mixed reset).`,
                  danger: true,
                  confirmLabel: "Reset",
                });
                if (!ok) return;
                try {
                  await ipc.resetRepo(repoPath, hash, "mixed");
                  addToast("success", `Reset to ${hash.slice(0, 8)}`);
                  load();
                } catch (e) {
                  addToast("error", `Reset failed: ${e}`);
                }
              }}
            />
          </div>
        )}

        {/* Diff panel */}
        {!showReflog && expandedHash && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <DiffViewer diff={diff} loading={diffLoading} repoPath={repoPath} />
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <CommitContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          commit={contextMenu.commit}
          repoPath={repoPath}
          onClose={() => setContextMenu(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
