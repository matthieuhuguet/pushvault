import React, { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { useToastStore } from "../../store/toastStore";
import { DiffViewer } from "../Diff/DiffViewer";
import { CommitInput } from "../CommitInput/CommitInput";
import type { DiffResult, FileEntry } from "../../types";

/* ── File status helpers ────────────────────────────────────── */
function statusColor(status: string): string {
  if (status === "M" || status === "modified") return "#3d9be9";
  if (status === "A" || status === "added") return "#1DB954";
  if (status === "D" || status === "deleted") return "#e5534b";
  if (status === "?" || status === "untracked") return "#b3b3b3";
  if (status === "C" || status === "conflict") return "#ff7b00";
  if (status === "R" || status === "renamed") return "#f59b00";
  return "#b3b3b3";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    M: "M", modified: "M",
    A: "A", added: "A",
    D: "D", deleted: "D",
    "?": "?", untracked: "?",
    U: "!", conflict: "!",
    R: "R", renamed: "R",
  };
  return map[status] ?? status.charAt(0).toUpperCase();
}

function StatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s.includes("added") || s.includes("new") || s === "a") return <span style={{ color: "#1DB954", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>A</span>;
  if (s.includes("deleted") || s === "d") return <span style={{ color: "#E8525A", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>D</span>;
  if (s.includes("modified") || s === "m") return <span style={{ color: "#4687D6", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>M</span>;
  if (s.includes("renamed") || s === "r") return <span style={{ color: "#F5A623", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>R</span>;
  if (s.includes("untracked") || s === "?") return <span style={{ color: "#B3B3B3", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>?</span>;
  if (s.includes("conflict") || s === "u" || s === "!") return <span style={{ color: "#E8525A", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>!</span>;
  return <span style={{ color: "#535353", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>·</span>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/* ── File context menu ──────────────────────────────────────── */
interface FileContextMenuProps {
  x: number;
  y: number;
  file: FileEntry;
  isStaged: boolean;
  repoPath: string;
  onClose: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onDelete?: () => void;
}

function FileContextMenu({
  x, y, file, isStaged, onClose, onStage, onUnstage, onDiscard, onDelete,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const addToast = useToastStore((s) => s.add);

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

  const menuWidth = 200;
  const menuHeight = 180;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

  const isUntracked = file.status === "?" || file.status === "untracked";

  const menuItem = (label: string, onClick: () => void, danger = false) => (
    <button
      key={label}
      onClick={() => { onClick(); onClose(); }}
      style={{
        display: "block",
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
      {label}
    </button>
  );

  const handleOpenInEditor = async () => {
    onClose();
    try {
      await ipc.openInVscode(file.path);
    } catch (e) {
      addToast("error", `Failed to open in editor: ${e}`);
    }
  };

  const handleDiscard = () => {
    if (confirm(`Discard changes to "${file.path}"? This cannot be undone.`)) {
      onDiscard?.();
    }
  };

  const handleDelete = () => {
    if (confirm(`Delete "${file.path}"? This will permanently remove the file.`)) {
      onDelete?.();
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
      {!isStaged && onStage && menuItem("Stage", onStage)}
      {isStaged && onUnstage && menuItem("Unstage", onUnstage)}
      {!isStaged && !isUntracked && onDiscard && menuItem("Discard Changes", handleDiscard, true)}
      {isUntracked && onDelete && menuItem("Delete File", handleDelete, true)}
      <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
      {menuItem("Open in Editor", handleOpenInEditor)}
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────── */
interface SectionHeaderProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  accent?: string;
  actions?: React.ReactNode;
}

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
  accent = "#b3b3b3",
  actions,
}: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px 8px 16px",
        cursor: "pointer",
        userSelect: "none",
        background: "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
            color: "#6a6a6a",
          }}
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: "11px", fontWeight: 700, color: accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {title}
        </span>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: "8px",
            background: "rgba(255,255,255,0.08)",
            color: "#b3b3b3",
          }}
        >
          {count}
        </span>
      </div>
      {actions && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", gap: "4px" }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/* ── Action mini-button ─────────────────────────────────────── */
function MiniBtn({
  label,
  title,
  onClick,
  color = "#b3b3b3",
}: {
  label: string;
  title: string;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        padding: "2px 8px",
        fontSize: "10px",
        fontWeight: 600,
        color,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "background 100ms ease, color 100ms ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
        (e.currentTarget as HTMLButtonElement).style.color = "#fff";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
        (e.currentTarget as HTMLButtonElement).style.color = color;
      }}
    >
      {label}
    </button>
  );
}

/* ── File row ───────────────────────────────────────────────── */
interface FileRowProps {
  file: FileEntry;
  selected: boolean;
  isStaged: boolean;
  repoPath: string;
  onSelect: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onDelete?: () => void;
}

function FileRow({ file, selected, isStaged, repoPath, onSelect, onStage, onUnstage, onDiscard, onDelete }: FileRowProps) {
  const [hovered, setHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const filename = file.path.split(/[/\\]/).pop() ?? file.path;
  const dir = file.path.includes("/") || file.path.includes("\\")
    ? file.path.replace(/[/\\][^/\\]+$/, "")
    : "";

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px 6px 16px",
          cursor: "pointer",
          background: selected
            ? "rgba(29,185,84,0.12)"
            : hovered
            ? "rgba(255,255,255,0.04)"
            : "transparent",
          borderLeft: selected ? "2px solid #1DB954" : "2px solid transparent",
          transition: "background 100ms ease",
          userSelect: "none",
        }}
      >
        {/* Status icon */}
        <span
          style={{
            width: "18px",
            height: "18px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "3px",
            background: `${statusColor(file.status)}22`,
            flexShrink: 0,
          }}
        >
          <StatusIcon status={file.status} />
        </span>

        {/* Filename + path */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {filename}
          </div>
          {dir && (
            <div
              style={{
                fontSize: "10px",
                color: "#535353",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {dir}
            </div>
          )}
        </div>

        {/* File size */}
        {file.size > 0 && (
          <span style={{ fontSize: "10px", color: "#535353", flexShrink: 0 }}>
            {formatSize(file.size)}
          </span>
        )}

        {/* Action buttons — visible on hover */}
        {hovered && (
          <div
            style={{
              display: "flex",
              gap: "3px",
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {onStage && (
              <button
                title="Stage"
                onClick={onStage}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "4px",
                  background: "rgba(29,185,84,0.2)",
                  border: "none",
                  color: "#1DB954",
                  cursor: "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 100ms ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(29,185,84,0.35)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(29,185,84,0.2)")
                }
              >
                +
              </button>
            )}
            {onUnstage && (
              <button
                title="Unstage"
                onClick={onUnstage}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "4px",
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#b3b3b3",
                  cursor: "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 100ms ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.15)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.08)")
                }
              >
                −
              </button>
            )}
            {onDiscard && (
              <button
                title="Discard changes"
                onClick={() => {
                  if (confirm(`Discard changes to "${file.path}"? This cannot be undone.`)) {
                    onDiscard!();
                  }
                }}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "4px",
                  background: "rgba(229,83,75,0.15)",
                  border: "none",
                  color: "#e5534b",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 100ms ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(229,83,75,0.3)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(229,83,75,0.15)")
                }
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={file}
          isStaged={isStaged}
          repoPath={repoPath}
          onClose={() => setContextMenu(null)}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

/* ── Main StagingArea ───────────────────────────────────────── */
export function StagingArea() {
  const { selectedRepoPath, setActivePanel } = useUIStore();
  const { config, refreshStatus } = useRepoStore();
  const addToast = useToastStore((s) => s.add);

  const repoPath = selectedRepoPath ?? "";
  const repoConfig = config?.repos.find((r) => r.path === repoPath);

  // File lists
  const [staged, setStaged] = useState<FileEntry[]>([]);
  const [unstaged, setUnstaged] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    staged: boolean;
  } | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [showAmend, setShowAmend] = useState(false);

  // Section expand state
  const [expandConflicts, setExpandConflicts] = useState(true);
  const [expandStaged, setExpandStaged] = useState(true);
  const [expandModified, setExpandModified] = useState(true);
  const [expandUntracked, setExpandUntracked] = useState(true);

  // Derived file groups
  const conflicts = unstaged.filter(
    (f) => f.status === "U" || f.status === "conflict"
  );
  const modified = unstaged.filter(
    (f) => f.status !== "U" && f.status !== "conflict" && f.status !== "?" && f.status !== "untracked"
  );
  const untracked = unstaged.filter(
    (f) => f.status === "?" || f.status === "untracked"
  );

  const loadFiles = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const [s, u] = await Promise.all([
        ipc.getStagedFiles(repoPath),
        ipc.getUnstagedFiles(repoPath),
      ]);
      setStaged(s);
      setUnstaged(u);
    } catch (e) {
      addToast("error", `Failed to load files: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Keyboard Delete key to discard selected file
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedFile && !selectedFile.staged) {
        const allUnstaged = [...modified, ...untracked];
        const file = allUnstaged.find((f) => f.path === selectedFile.path);
        if (file) {
          const isUntracked = file.status === "?" || file.status === "untracked";
          const action = isUntracked ? "Delete" : "Discard changes to";
          if (confirm(`${action} "${selectedFile.path}"? This cannot be undone.`)) {
            handleDiscardFile(selectedFile.path);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedFile, modified, untracked]);

  // Load diff when file selected
  useEffect(() => {
    if (!selectedFile) {
      setDiff(null);
      return;
    }
    setDiffLoading(true);
    ipc
      .getDiff(repoPath, selectedFile.path, selectedFile.staged)
      .then((d) => {
        setDiff(d);
        setDiffLoading(false);
      })
      .catch(() => {
        setDiffLoading(false);
      });
  }, [selectedFile, repoPath]);

  const handleStageFile = async (file: string) => {
    try {
      await ipc.stageFile(repoPath, file);
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Stage failed: ${e}`);
    }
  };

  const handleUnstageFile = async (file: string) => {
    try {
      await ipc.unstageFile(repoPath, file);
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Unstage failed: ${e}`);
    }
  };

  const handleDiscardFile = async (file: string) => {
    try {
      await ipc.discardFile(repoPath, file);
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Discard failed: ${e}`);
    }
  };

  const handleDeleteFile = async (file: string) => {
    try {
      await ipc.discardFile(repoPath, file);
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Delete failed: ${e}`);
    }
  };

  const handleStageAll = async () => {
    try {
      await ipc.stageAll(repoPath);
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Stage all failed: ${e}`);
    }
  };

  const handleUnstageAll = async () => {
    try {
      await ipc.unstageAll(repoPath);
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Unstage all failed: ${e}`);
    }
  };

  const handleCommit = async (andPush = false) => {
    if (!commitMsg.trim()) {
      addToast("warning", "Commit message is required");
      return;
    }
    if (staged.length === 0) {
      addToast("warning", "Nothing staged to commit");
      return;
    }
    setIsCommitting(true);
    try {
      const hash = await ipc.commitChanges(repoPath, commitMsg.trim(), showAmend);
      setCommitMsg("");
      addToast("success", `Committed ${hash.slice(0, 7)}: ${commitMsg.slice(0, 40)}`);
      if (andPush) {
        await ipc.pushRepo(repoPath, "");
        addToast("success", "Pushed to remote");
      }
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Commit failed: ${e}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const repoName = repoConfig?.name ?? repoPath.split(/[/\\]/).pop() ?? "Repo";

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
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#1DB954",
            boxShadow: "0 0 8px rgba(29,185,84,0.6)",
            flexShrink: 0,
          }}
        />
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#fff",
            flex: 1,
          }}
        >
          {repoName}
          <span style={{ fontSize: "12px", color: "#6a6a6a", fontWeight: 400, marginLeft: "10px" }}>
            Changes
          </span>
        </h2>

        <button
          onClick={loadFiles}
          title="Refresh"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            border: "none",
            color: "#b3b3b3",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 120ms ease",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.12)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.06)")
          }
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          onClick={() => setActivePanel(null)}
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

      {/* Body: left panel + right panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left panel: file sections */}
        <div
          style={{
            width: "40%",
            minWidth: "280px",
            maxWidth: "480px",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
            background: "#161616",
            overflow: "hidden",
          }}
        >
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div
                style={{
                  padding: "32px",
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
                Loading files…
              </div>
            ) : (
              <>
                {/* Conflicts section */}
                {conflicts.length > 0 && (
                  <div>
                    <SectionHeader
                      title="Conflicted"
                      count={conflicts.length}
                      expanded={expandConflicts}
                      onToggle={() => setExpandConflicts((v) => !v)}
                      accent="#e5534b"
                    />
                    {expandConflicts &&
                      conflicts.map((f) => (
                        <FileRow
                          key={f.path}
                          file={f}
                          selected={selectedFile?.path === f.path}
                          isStaged={false}
                          repoPath={repoPath}
                          onSelect={() =>
                            setSelectedFile({ path: f.path, staged: false })
                          }
                        />
                      ))}
                  </div>
                )}

                {/* Staged section */}
                <div>
                  <SectionHeader
                    title="Staged"
                    count={staged.length}
                    expanded={expandStaged}
                    onToggle={() => setExpandStaged((v) => !v)}
                    accent="#1DB954"
                    actions={
                      staged.length > 0 ? (
                        <MiniBtn
                          label="Unstage all"
                          title="Unstage all changes"
                          onClick={handleUnstageAll}
                          color="#b3b3b3"
                        />
                      ) : undefined
                    }
                  />
                  {expandStaged && staged.length === 0 && (
                    <div
                      style={{
                        padding: "10px 16px",
                        fontSize: "11px",
                        color: "#535353",
                        fontStyle: "italic",
                      }}
                    >
                      Nothing staged
                    </div>
                  )}
                  {expandStaged &&
                    staged.map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        selected={selectedFile?.path === f.path && selectedFile.staged}
                        isStaged={true}
                        repoPath={repoPath}
                        onSelect={() =>
                          setSelectedFile({ path: f.path, staged: true })
                        }
                        onUnstage={() => handleUnstageFile(f.path)}
                      />
                    ))}
                </div>

                {/* Modified section */}
                <div>
                  <SectionHeader
                    title="Modified"
                    count={modified.length}
                    expanded={expandModified}
                    onToggle={() => setExpandModified((v) => !v)}
                    accent="#3d9be9"
                    actions={
                      modified.length > 0 ? (
                        <MiniBtn
                          label="Stage all"
                          title="Stage all modified files"
                          onClick={handleStageAll}
                          color="#1DB954"
                        />
                      ) : undefined
                    }
                  />
                  {expandModified && modified.length === 0 && (
                    <div
                      style={{
                        padding: "10px 16px",
                        fontSize: "11px",
                        color: "#535353",
                        fontStyle: "italic",
                      }}
                    >
                      No modifications
                    </div>
                  )}
                  {expandModified &&
                    modified.map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        selected={selectedFile?.path === f.path && !selectedFile.staged}
                        isStaged={false}
                        repoPath={repoPath}
                        onSelect={() =>
                          setSelectedFile({ path: f.path, staged: false })
                        }
                        onStage={() => handleStageFile(f.path)}
                        onDiscard={() => handleDiscardFile(f.path)}
                      />
                    ))}
                </div>

                {/* Untracked section */}
                <div>
                  <SectionHeader
                    title="Untracked"
                    count={untracked.length}
                    expanded={expandUntracked}
                    onToggle={() => setExpandUntracked((v) => !v)}
                    accent="#b3b3b3"
                  />
                  {expandUntracked && untracked.length === 0 && (
                    <div
                      style={{
                        padding: "10px 16px",
                        fontSize: "11px",
                        color: "#535353",
                        fontStyle: "italic",
                      }}
                    >
                      No untracked files
                    </div>
                  )}
                  {expandUntracked &&
                    untracked.map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        selected={selectedFile?.path === f.path && !selectedFile.staged}
                        isStaged={false}
                        repoPath={repoPath}
                        onSelect={() =>
                          setSelectedFile({ path: f.path, staged: false })
                        }
                        onStage={() => handleStageFile(f.path)}
                        onDelete={() => handleDeleteFile(f.path)}
                      />
                    ))}
                </div>

                {staged.length === 0 &&
                  modified.length === 0 &&
                  untracked.length === 0 &&
                  conflicts.length === 0 && (
                    <div
                      style={{
                        padding: "48px 24px",
                        textAlign: "center",
                        color: "#535353",
                      }}
                    >
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ margin: "0 auto 12px", display: "block", opacity: 0.4 }}
                      >
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="#1DB954"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <p style={{ fontSize: "13px" }}>Working tree clean</p>
                      <p style={{ fontSize: "11px", marginTop: "4px" }}>
                        Nothing to commit
                      </p>
                    </div>
                  )}
              </>
            )}
          </div>

          {/* Commit area */}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              padding: "14px 16px",
              background: "#161616",
              flexShrink: 0,
            }}
          >
            <CommitInput
              value={commitMsg}
              onChange={setCommitMsg}
              onCommit={() => handleCommit(false)}
              onCommitAndPush={() => handleCommit(true)}
              disabled={isCommitting}
              amend={showAmend}
              onAmendChange={setShowAmend}
              stagedCount={staged.length}
            />
          </div>
        </div>

        {/* Right panel: diff viewer */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <DiffViewer diff={diff} loading={diffLoading} />
        </div>
      </div>
    </div>
  );
}
