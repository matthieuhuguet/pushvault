import React, { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";
import { DiffViewer } from "../Diff/DiffViewer";
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
        color: danger ? "#e5534b" : "#b3b3b3",
        textAlign: "left",
        transition: "background 100ms ease, color 100ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = danger
          ? "rgba(229,83,75,0.1)"
          : "rgba(255,255,255,0.08)";
        (e.currentTarget as HTMLButtonElement).style.color = danger ? "#e5534b" : "#fff";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
        (e.currentTarget as HTMLButtonElement).style.color = danger ? "#e5534b" : "#b3b3b3";
      }}
    >
      <span style={{ fontSize: "14px", width: "16px", textAlign: "center", flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );

  const divider = () => (
    <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
  );

  const handleCopyHash = () => {
    copyToClipboard(commit.hash);
    addToast("success", `Copied hash ${commit.short_hash}`);
  };

  const handleRevert = async () => {
    try {
      const newHash = await ipc.revertCommit(repoPath, commit.hash);
      addToast("success", `Reverted: ${newHash.slice(0, 7)}`);
      onRefresh();
    } catch (e) {
      addToast("error", `Revert failed: ${e}`);
    }
  };

  const handleCherryPick = async () => {
    try {
      const newHash = await ipc.cherryPickCommit(repoPath, commit.hash);
      addToast("success", `Cherry-picked: ${newHash.slice(0, 7)}`);
      onRefresh();
    } catch (e) {
      addToast("error", `Cherry-pick failed: ${e}`);
    }
  };

  const handleCreateBranch = async () => {
    const name = prompt(`Branch name (from ${commit.short_hash}):`);
    if (!name?.trim()) return;
    try {
      await ipc.createBranch(repoPath, name.trim(), commit.hash);
      addToast("success", `Branch "${name.trim()}" created from ${commit.short_hash}`);
    } catch (e) {
      addToast("error", `Create branch failed: ${e}`);
    }
  };

  const handleCreateTag = async () => {
    const name = prompt(`Tag name (at ${commit.short_hash}):`);
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
      onRefresh();
    } catch (e) {
      addToast("error", `Reset failed: ${e}`);
    }
  };

  const handleResetHard = async () => {
    if (!confirm(`Hard reset to ${commit.short_hash}?\n\nThis will DISCARD all local changes and cannot be undone.`)) return;
    try {
      await ipc.resetRepo(repoPath, commit.hash, "hard");
      addToast("success", `Hard reset to ${commit.short_hash}`);
      onRefresh();
    } catch (e) {
      addToast("error", `Reset failed: ${e}`);
    }
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: adjustedY,
        left: adjustedX,
        background: "#282828",
        border: "1px solid rgba(255,255,255,0.1)",
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
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        marginBottom: "4px",
      }}>
        <div style={{
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#3d9be9",
          marginBottom: "2px",
        }}>
          {commit.short_hash}
        </div>
        <div style={{
          fontSize: "12px",
          color: "#fff",
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
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(6px)",
        zIndex: 600,
        display: "flex",
        flexDirection: "column",
        animation: "fade-in 150ms ease both",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "56px",
          background: "#1a1a1a",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: "16px",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#1DB954" strokeWidth="2" />
          <polyline points="12 7 12 12 15 15" stroke="#1DB954" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#fff", flex: 1 }}>
          {repoName ?? "Repo"}
          <span style={{ fontSize: "12px", color: "#6a6a6a", fontWeight: 400, marginLeft: "10px" }}>
            Commit History
          </span>
        </h2>

        {/* View on GitHub button */}
        {gitHubBase && (
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
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#b3b3b3",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 150ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
            }}
          >
            {/* GitHub icon */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            View on GitHub
          </button>
        )}

        <button
          onClick={onClose}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            color: "#b3b3b3",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            transition: "background 120ms ease, color 120ms ease",
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)";
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
            (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
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
            overflowY: "auto",
            borderRight: expandedHash ? "1px solid rgba(255,255,255,0.06)" : "none",
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
                color: "#6a6a6a",
                fontSize: "13px",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#1DB954" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Loading history…
            </div>
          ) : commits.length === 0 ? (
            <div
              style={{
                padding: "64px 32px",
                textAlign: "center",
                color: "#535353",
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                style={{ display: "block", margin: "0 auto 16px", opacity: 0.3 }}
              >
                <circle cx="12" cy="12" r="9" stroke="#b3b3b3" strokeWidth="2" />
                <polyline points="12 7 12 12 15 15" stroke="#b3b3b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
                No commits yet
              </p>
              <p style={{ fontSize: "13px" }}>
                Make your first commit to see history here.
              </p>
            </div>
          ) : (
            <div style={{ padding: "8px 0" }}>
              {commits.map((commit, idx) => {
                const isExpanded = expandedHash === commit.hash;
                return (
                  <div
                    key={commit.hash}
                    style={{
                      position: "relative",
                      paddingLeft: "40px",
                      animation: `fade-in 200ms ease ${idx * 20}ms both`,
                    }}
                  >
                    {/* Timeline line */}
                    {idx < commits.length - 1 && (
                      <div
                        style={{
                          position: "absolute",
                          left: "18px",
                          top: "28px",
                          bottom: "-4px",
                          width: "1px",
                          background: "rgba(255,255,255,0.08)",
                        }}
                      />
                    )}

                    {/* Timeline dot */}
                    <div
                      style={{
                        position: "absolute",
                        left: "13px",
                        top: "16px",
                        width: "11px",
                        height: "11px",
                        borderRadius: "50%",
                        background: isExpanded ? "#1DB954" : "#282828",
                        border: `2px solid ${isExpanded ? "#1DB954" : "rgba(255,255,255,0.15)"}`,
                        transition: "all 150ms ease",
                        zIndex: 1,
                        boxShadow: isExpanded ? "0 0 8px rgba(29,185,84,0.6)" : "none",
                      }}
                    />

                    {/* Commit row */}
                    <div
                      onClick={() => handleExpand(commit)}
                      onContextMenu={(e) => handleContextMenu(e, commit)}
                      style={{
                        padding: "12px 20px 12px 4px",
                        cursor: "pointer",
                        borderLeft: isExpanded
                          ? "2px solid #1DB954"
                          : "2px solid transparent",
                        background: isExpanded
                          ? "rgba(29,185,84,0.06)"
                          : "transparent",
                        transition: "background 120ms ease, border-color 120ms ease",
                        userSelect: "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded)
                          (e.currentTarget as HTMLDivElement).style.background =
                            "rgba(255,255,255,0.03)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded)
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
                        {/* Message */}
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#fff",
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {commit.message}
                        </span>

                        {/* Relative time */}
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#535353",
                            flexShrink: 0,
                          }}
                        >
                          {commit.date_relative}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        {/* Short hash */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(commit.hash);
                          }}
                          title="Copy full hash"
                          style={{
                            fontFamily:
                              '"Cascadia Code", "Fira Code", monospace',
                            fontSize: "10px",
                            color: "#3d9be9",
                            background: "rgba(61,155,233,0.1)",
                            border: "1px solid rgba(61,155,233,0.2)",
                            borderRadius: "6px",
                            padding: "1px 7px",
                            cursor: "pointer",
                            transition: "background 100ms ease",
                          }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.background =
                              "rgba(61,155,233,0.2)")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.background =
                              "rgba(61,155,233,0.1)")
                          }
                        >
                          {commit.short_hash}
                        </button>

                        {/* Author */}
                        <span
                          style={{ fontSize: "11px", color: "#6a6a6a" }}
                        >
                          {commit.author}
                        </span>

                        {/* Stats */}
                        {commit.files_changed > 0 && (
                          <span
                            style={{ fontSize: "11px", color: "#535353" }}
                          >
                            {commit.files_changed}{" "}
                            {commit.files_changed === 1 ? "file" : "files"}
                          </span>
                        )}
                        {commit.insertions > 0 && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#1DB954",
                              fontWeight: 600,
                            }}
                          >
                            +{commit.insertions}
                          </span>
                        )}
                        {commit.deletions > 0 && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#e5534b",
                              fontWeight: 600,
                            }}
                          >
                            -{commit.deletions}
                          </span>
                        )}

                        {/* View on GitHub (per row, only if base is known) */}
                        {gitHubBase && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewOnGitHub(commit.hash);
                            }}
                            title="View on GitHub"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#535353",
                              fontSize: "11px",
                              padding: "0 2px",
                              transition: "color 100ms ease",
                              lineHeight: 1,
                            }}
                            onMouseEnter={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3")
                            }
                            onMouseLeave={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.color = "#535353")
                            }
                          >
                            ↗
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Load more */}
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                }}
              >
                <button
                  onClick={() => setLimit((l) => l + 50)}
                  style={{
                    padding: "8px 24px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "20px",
                    color: "#b3b3b3",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(255,255,255,0.1)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(255,255,255,0.06)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
                  }}
                >
                  Load more
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Diff panel */}
        {expandedHash && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <DiffViewer diff={diff} loading={diffLoading} />
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
