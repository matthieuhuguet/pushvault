import React, { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { useToastStore } from "../../store/toastStore";
import { useActivityStore } from "../../store/activityStore";
import { useConfirmStore } from "../../store/confirmStore";
import { DiffViewer } from "../Diff/DiffViewer";
import { BlameViewer } from "../BlameViewer/BlameViewer";
import { CommitInput } from "../CommitInput/CommitInput";
import type { DiffResult, FileEntry } from "../../types";

/* ── File status helpers ────────────────────────────────────── */
function statusColor(status: string): string {
  if (status === "M" || status === "modified") return "var(--color-info)";
  if (status === "A" || status === "added") return "var(--color-success)";
  if (status === "D" || status === "deleted") return "var(--color-error)";
  if (status === "?" || status === "untracked") return "var(--color-text-secondary)";
  if (status === "C" || status === "conflict") return "var(--color-conflict)";
  if (status === "R" || status === "renamed") return "var(--color-warning)";
  return "var(--color-text-secondary)";
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
  if (s.includes("added") || s.includes("new") || s === "a") return <span style={{ color: "var(--color-success)", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>A</span>;
  if (s.includes("deleted") || s === "d") return <span style={{ color: "var(--color-error)", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>D</span>;
  if (s.includes("modified") || s === "m") return <span style={{ color: "var(--color-info)", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>M</span>;
  if (s.includes("renamed") || s === "r") return <span style={{ color: "var(--color-warning)", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>R</span>;
  if (s.includes("untracked") || s === "?") return <span style={{ color: "var(--color-text-secondary)", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>?</span>;
  if (s.includes("conflict") || s === "u" || s === "!") return <span style={{ color: "var(--color-error)", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>!</span>;
  return <span style={{ color: "var(--color-text-disabled)", fontWeight: 700, fontFamily: "monospace", fontSize: "12px" }}>·</span>;
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
  onBlame?: () => void;
}

function FileContextMenu({
  x, y, file, isStaged, repoPath, onClose, onStage, onUnstage, onDiscard, onDelete, onBlame,
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
  const menuHeight = 210;
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
      {label}
    </button>
  );

  const handleOpenInEditor = async () => {
    onClose();
    try {
      // Construct absolute path from repo root + relative file path
      const sep = repoPath.includes("\\") ? "\\" : "/";
      const absolutePath = `${repoPath}${sep}${file.path}`;
      await ipc.openInVscode(absolutePath);
    } catch (e) {
      addToast("error", `Failed to open in editor: ${e}`);
    }
  };

  const handleRevealInExplorer = async () => {
    onClose();
    try {
      const sep = repoPath.includes("\\") ? "\\" : "/";
      const absolutePath = `${repoPath}${sep}${file.path}`;
      await ipc.revealInExplorer(absolutePath);
    } catch (e) {
      addToast("error", `Failed to reveal in Explorer: ${e}`);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(file.path).catch(() => {});
    onClose();
    addToast("info", `Copied: ${file.path}`);
  };

  const handleDiscard = async () => {
    const ok = await useConfirmStore.getState().request({
      title: "Discard changes?",
      description: `Discard changes to "${file.path}"? This cannot be undone.`,
      danger: true,
      confirmLabel: "Discard",
    });
    if (ok) onDiscard?.();
  };

  const handleDelete = async () => {
    const ok = await useConfirmStore.getState().request({
      title: "Delete file?",
      description: `Delete "${file.path}"? This will permanently remove the file.`,
      danger: true,
      confirmLabel: "Delete",
    });
    if (ok) onDelete?.();
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
      {!isStaged && onStage && menuItem("Stage", onStage)}
      {isStaged && onUnstage && menuItem("Unstage", onUnstage)}
      {!isStaged && !isUntracked && onDiscard && menuItem("Discard Changes", handleDiscard, true)}
      {isUntracked && onDelete && menuItem("Delete File", handleDelete, true)}
      <div style={{ height: "1px", background: "var(--overlay-subtle)", margin: "4px 0" }} />
      {menuItem("Open in Editor", handleOpenInEditor)}
      {menuItem("Reveal in Explorer", handleRevealInExplorer)}
      {menuItem("Copy Path", handleCopyPath)}
      {onBlame && !isUntracked && menuItem("Blame", onBlame)}
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
  accent = "var(--color-text-secondary)",
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
        background: "var(--overlay-soft)",
        borderBottom: "1px solid var(--overlay-soft)",
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
            color: "var(--color-text-muted)",
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
            background: "var(--overlay-light)",
            color: "var(--color-text-secondary)",
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
  color = "var(--color-text-secondary)",
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
        background: "var(--overlay-subtle)",
        border: "1px solid var(--overlay-light)",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "background 100ms ease, color 100ms ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-medium)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
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
  maxFileSizeMb?: number;
  onSelect: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onDelete?: () => void;
  onBlame?: () => void;
}

function FileRow({ file, selected, isStaged, repoPath, maxFileSizeMb, onSelect, onStage, onUnstage, onDiscard, onDelete, onBlame }: FileRowProps) {
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
            ? "var(--color-success-dim)"
            : hovered
            ? "var(--overlay-soft)"
            : "transparent",
          borderLeft: selected ? "2px solid var(--color-accent)" : "2px solid transparent",
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
              color: "var(--color-text-primary)",
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
                color: "var(--color-text-disabled)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {dir}
            </div>
          )}
        </div>

        {/* File size — with large file warning */}
        {file.size > 0 && (() => {
          const limitBytes = (maxFileSizeMb ?? 50) * 1024 * 1024;
          const isLarge = file.size > limitBytes;
          const isWarn = !isLarge && file.size > limitBytes * 0.5;
          return (
            <span
              title={isLarge ? `File exceeds ${maxFileSizeMb ?? 50} MB limit — consider .gitignore or LFS` : undefined}
              style={{
                fontSize: "10px",
                flexShrink: 0,
                fontWeight: isLarge ? 700 : 400,
                color: isLarge ? "var(--color-error)" : isWarn ? "var(--color-warning)" : "var(--color-text-disabled)",
              }}
            >
              {isLarge && "\u26A0 "}{formatSize(file.size)}
            </span>
          );
        })()}

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
                  background: "var(--color-accent-dim)",
                  border: "none",
                  color: "var(--color-success)",
                  cursor: "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 100ms ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "var(--color-success-border)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "var(--color-accent-dim)")
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
                  background: "var(--overlay-light)",
                  border: "none",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 100ms ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "var(--overlay-strong)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "var(--overlay-light)")
                }
              >
                −
              </button>
            )}
            {onDiscard && (
              <button
                title="Discard changes"
                onClick={async () => {
                  const ok = await useConfirmStore.getState().request({
                    title: "Discard changes?",
                    description: `Discard changes to "${file.path}"? This cannot be undone.`,
                    danger: true,
                    confirmLabel: "Discard",
                  });
                  if (ok) onDiscard!();
                }}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "4px",
                  background: "var(--color-error-dim)",
                  border: "none",
                  color: "var(--color-error)",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 100ms ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "var(--color-error-border)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "var(--color-error-dim)")
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
          onBlame={onBlame}
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
  const logActivity = useActivityStore((s) => s.addEntry);

  const repoPath = selectedRepoPath ?? "";
  const repoConfig = config?.repos.find((r) => r.path === repoPath);
  const repoDisplayName = repoConfig?.name ?? repoPath.split(/[/\\]/).pop() ?? "Repo";

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
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [blameFile, setBlameFile] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState("");

  // Load branch name for PR button
  useEffect(() => {
    if (!repoPath) return;
    ipc.getRepoStatus(repoPath)
      .then(s => setCurrentBranch(s.current_branch))
      .catch(() => {});
  }, [repoPath]);

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

  // Apply file filter
  const fq = fileFilter.toLowerCase();
  const filteredStaged = fq ? staged.filter(f => f.path.toLowerCase().includes(fq)) : staged;
  const filteredConflicts = fq ? conflicts.filter(f => f.path.toLowerCase().includes(fq)) : conflicts;
  const filteredModified = fq ? modified.filter(f => f.path.toLowerCase().includes(fq)) : modified;
  const filteredUntracked = fq ? untracked.filter(f => f.path.toLowerCase().includes(fq)) : untracked;

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

  // Keyboard shortcuts within staging area
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ctrl+A: Stage all
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && !e.shiftKey) {
        e.preventDefault();
        handleStageAll();
        return;
      }
      // Ctrl+Shift+U: Unstage all
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        handleUnstageAll();
        return;
      }
      // Ctrl+Enter: commit
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (commitMsg.trim() && (staged.length > 0 || showAmend)) handleCommit(false);
        return;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [staged, commitMsg, showAmend]);

  // Keyboard Delete key to discard selected file
  useEffect(() => {
    const handleKey = async (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedFile && !selectedFile.staged) {
        const allUnstaged = [...modified, ...untracked];
        const file = allUnstaged.find((f) => f.path === selectedFile.path);
        if (file) {
          const isUntracked = file.status === "?" || file.status === "untracked";
          const action = isUntracked ? "Delete" : "Discard changes to";
          const ok = await useConfirmStore.getState().request({
            title: isUntracked ? "Delete file?" : "Discard changes?",
            description: `${action} "${selectedFile.path}"? This cannot be undone.`,
            danger: true,
            confirmLabel: isUntracked ? "Delete" : "Discard",
          });
          if (ok) handleDiscardFile(selectedFile.path);
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
      logActivity({ repoName: repoDisplayName, operation: "Discard File", success: true, message: file, isDestructive: true });
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Discard failed: ${e}`);
      logActivity({ repoName: repoDisplayName, operation: "Discard File", success: false, message: String(e), isDestructive: true });
    }
  };

  const handleDeleteFile = async (file: string) => {
    try {
      // Untracked files: delete from disk (not checkout HEAD)
      await ipc.deleteUntrackedFile(repoPath, file);
      logActivity({ repoName: repoDisplayName, operation: "Delete Untracked", success: true, message: file, isDestructive: true });
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Delete failed: ${e}`);
      logActivity({ repoName: repoDisplayName, operation: "Delete Untracked", success: false, message: String(e), isDestructive: true });
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

  const handleAmendChange = async (v: boolean) => {
    setShowAmend(v);
    if (v && !commitMsg.trim()) {
      // Auto-fill with last commit message
      try {
        const lastMsg = await ipc.getLastCommitMessage(repoPath);
        if (lastMsg) setCommitMsg(lastMsg);
      } catch {
        // ignore
      }
    }
  };

  const [isGenerating, setIsGenerating] = useState(false);

  const handleAiCommitMsg = async () => {
    if (staged.length === 0) {
      addToast("warning", "Stage files first to generate a commit message");
      return;
    }
    setIsGenerating(true);
    try {
      const msg = await ipc.aiGenerateCommitMessage(repoPath);
      if (msg) {
        setCommitMsg(msg);
        addToast("success", "AI commit message generated");
      }
    } catch (e) {
      addToast("error", `AI generation failed: ${e}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePushOnly = async () => {
    try {
      await ipc.pushRepo(repoPath);
      addToast("success", "Pushed to remote");
      logActivity({ repoName: repoDisplayName, operation: "Push", success: true, message: "Pushed to remote", isDestructive: false });
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Push failed: ${e}`);
      logActivity({ repoName: repoDisplayName, operation: "Push", success: false, message: String(e), isDestructive: false });
    }
  };

  const handleCommit = async (andPush = false) => {
    if (!commitMsg.trim()) {
      addToast("warning", "Commit message is required");
      return;
    }
    // In amend mode, allow 0 staged files (message-only amend)
    if (staged.length === 0 && !showAmend) {
      addToast("warning", "Nothing staged to commit");
      return;
    }
    setIsCommitting(true);
    try {
      const gpgSign = config?.gpg_sign_commits ?? false;
      const gpgKeyId = config?.gpg_key_id ?? "";
      const hash = await ipc.commitChanges(repoPath, commitMsg.trim(), showAmend, gpgSign, gpgKeyId);
      setCommitMsg("");
      addToast("success", `Committed ${hash.slice(0, 7)}: ${commitMsg.slice(0, 40)}`);
      const op = showAmend ? "Amend Commit" : "Commit";
      logActivity({ repoName: repoDisplayName, operation: op, success: true, message: `${hash.slice(0, 7)}: ${commitMsg.slice(0, 60)}`, isDestructive: showAmend });
      if (andPush) {
        await ipc.pushRepo(repoPath);
        addToast("success", "Pushed to remote");
        logActivity({ repoName: repoDisplayName, operation: "Push", success: true, message: "Pushed after commit", isDestructive: false });
      }
      await loadFiles();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Commit failed: ${e}`);
      logActivity({ repoName: repoDisplayName, operation: "Commit", success: false, message: String(e), isDestructive: false });
    } finally {
      setIsCommitting(false);
    }
  };

  const repoName = repoConfig?.name ?? repoPath.split(/[/\\]/).pop() ?? "Repo";

  /** Extract GitHub web URL from remote. Returns null if not GitHub. */
  const getGitHubPrUrl = (): string | null => {
    const remote = repoConfig?.remote;
    if (!remote || !currentBranch) return null;
    const cleanRemote = remote.trim().replace(/\.git$/, "");
    let base: string | null = null;
    if (cleanRemote.startsWith("https://github.com/")) {
      base = cleanRemote;
    } else {
      const sshMatch = cleanRemote.match(/git@github\.com[:/](.+)$/);
      if (sshMatch) base = `https://github.com/${sshMatch[1]}`;
    }
    if (!base) return null;
    // For main/master branches, just open repo; otherwise open compare page
    if (currentBranch === "main" || currentBranch === "master") {
      return `${base}/pulls/new`;
    }
    return `${base}/compare/${currentBranch}?expand=1`;
  };

  const gitHubPrUrl = getGitHubPrUrl();

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
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--color-accent)",
            boxShadow: "0 0 8px var(--color-accent-border)",
            flexShrink: 0,
          }}
        />
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            flex: 1,
          }}
        >
          {repoName}
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 400, marginLeft: "10px" }}>
            Changes
          </span>
        </h2>

        {/* Create PR button (GitHub only) */}
        {gitHubPrUrl && (
          <a
            href={gitHubPrUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Create Pull Request on GitHub"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 12px",
              borderRadius: "20px",
              background: "var(--color-info-dim)",
              border: "1px solid var(--color-info-border)",
              color: "var(--color-info)",
              fontSize: "12px",
              fontWeight: 600,
              textDecoration: "none",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-info-border)";
              (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-info)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-info-dim)";
              (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-info)";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
              <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="6" y1="9" x2="6" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Create PR
          </a>
        )}

        <button
          onClick={loadFiles}
          title="Refresh"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "var(--overlay-subtle)",
            border: "none",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 120ms ease",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "var(--overlay-medium)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "var(--overlay-subtle)")
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

      {/* Body: left panel + right panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left panel: file sections */}
        <div
          style={{
            width: "40%",
            minWidth: "280px",
            maxWidth: "480px",
            borderRight: "1px solid var(--overlay-subtle)",
            display: "flex",
            flexDirection: "column",
            background: "var(--color-bg-card)",
            overflow: "hidden",
          }}
        >
          {/* File filter */}
          {!loading && (staged.length + unstaged.length) > 5 && (
            <div style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--overlay-soft)",
              flexShrink: 0,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 10px",
                background: "var(--overlay-soft)",
                borderRadius: "8px",
                border: "1px solid var(--overlay-light)",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                  <circle cx="11" cy="11" r="7" stroke="var(--color-text-secondary)" strokeWidth="2" />
                  <path d="M16 16l4 4" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  value={fileFilter}
                  onChange={(e) => setFileFilter(e.target.value)}
                  placeholder="Filter files…"
                  style={{
                    flex: 1,
                    background: "none",
                    border: "none",
                    outline: "none",
                    color: "var(--color-text-primary)",
                    fontSize: "11px",
                  }}
                />
                {fileFilter && (
                  <button
                    onClick={() => setFileFilter("")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-text-disabled)",
                      cursor: "pointer",
                      fontSize: "11px",
                      padding: "0 2px",
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div
                style={{
                  padding: "32px",
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
                Loading files…
              </div>
            ) : (
              <>
                {/* Conflicts section */}
                {filteredConflicts.length > 0 && (
                  <div>
                    <SectionHeader
                      title="Conflicted"
                      count={filteredConflicts.length}
                      expanded={expandConflicts}
                      onToggle={() => setExpandConflicts((v) => !v)}
                      accent="var(--color-error)"
                    />
                    {expandConflicts &&
                      filteredConflicts.map((f) => (
                        <FileRow
                          key={f.path}
                          file={f}
                          selected={selectedFile?.path === f.path}
                          isStaged={false}
                          repoPath={repoPath}
                          maxFileSizeMb={config?.max_file_size_mb}
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
                    count={filteredStaged.length}
                    expanded={expandStaged}
                    onToggle={() => setExpandStaged((v) => !v)}
                    accent="var(--color-success)"
                    actions={
                      staged.length > 0 ? (
                        <MiniBtn
                          label="Unstage all"
                          title="Unstage all changes"
                          onClick={handleUnstageAll}
                          color="var(--color-text-secondary)"
                        />
                      ) : undefined
                    }
                  />
                  {expandStaged && filteredStaged.length === 0 && (
                    <div
                      style={{
                        padding: "10px 16px",
                        fontSize: "11px",
                        color: "var(--color-text-disabled)",
                        fontStyle: "italic",
                      }}
                    >
                      {fq ? "No matches" : "Nothing staged"}
                    </div>
                  )}
                  {expandStaged &&
                    filteredStaged.map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        selected={selectedFile?.path === f.path && selectedFile.staged}
                        isStaged={true}
                        repoPath={repoPath}
                        maxFileSizeMb={config?.max_file_size_mb}
                        onSelect={() =>
                          setSelectedFile({ path: f.path, staged: true })
                        }
                        onUnstage={() => handleUnstageFile(f.path)}
                        onBlame={() => setBlameFile(f.path)}
                      />
                    ))}
                </div>

                {/* Modified section */}
                <div>
                  <SectionHeader
                    title="Modified"
                    count={filteredModified.length}
                    expanded={expandModified}
                    onToggle={() => setExpandModified((v) => !v)}
                    accent="var(--color-info)"
                    actions={
                      modified.length > 0 ? (
                        <MiniBtn
                          label="Stage all"
                          title="Stage all modified files"
                          onClick={handleStageAll}
                          color="var(--color-success)"
                        />
                      ) : undefined
                    }
                  />
                  {expandModified && filteredModified.length === 0 && (
                    <div
                      style={{
                        padding: "10px 16px",
                        fontSize: "11px",
                        color: "var(--color-text-disabled)",
                        fontStyle: "italic",
                      }}
                    >
                      {fq ? "No matches" : "No modifications"}
                    </div>
                  )}
                  {expandModified &&
                    filteredModified.map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        selected={selectedFile?.path === f.path && !selectedFile.staged}
                        isStaged={false}
                        repoPath={repoPath}
                        maxFileSizeMb={config?.max_file_size_mb}
                        onSelect={() =>
                          setSelectedFile({ path: f.path, staged: false })
                        }
                        onStage={() => handleStageFile(f.path)}
                        onDiscard={() => handleDiscardFile(f.path)}
                        onBlame={() => setBlameFile(f.path)}
                      />
                    ))}
                </div>

                {/* Untracked section */}
                <div>
                  <SectionHeader
                    title="Untracked"
                    count={filteredUntracked.length}
                    expanded={expandUntracked}
                    onToggle={() => setExpandUntracked((v) => !v)}
                    accent="var(--color-text-secondary)"
                    actions={
                      untracked.length > 0 ? (
                        <MiniBtn
                          label="Stage all"
                          title="Stage all untracked files"
                          onClick={handleStageAll}
                          color="var(--color-success)"
                        />
                      ) : undefined
                    }
                  />
                  {expandUntracked && filteredUntracked.length === 0 && (
                    <div
                      style={{
                        padding: "10px 16px",
                        fontSize: "11px",
                        color: "var(--color-text-disabled)",
                        fontStyle: "italic",
                      }}
                    >
                      {fq ? "No matches" : "No untracked files"}
                    </div>
                  )}
                  {expandUntracked &&
                    filteredUntracked.map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        selected={selectedFile?.path === f.path && !selectedFile.staged}
                        isStaged={false}
                        repoPath={repoPath}
                        maxFileSizeMb={config?.max_file_size_mb}
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
                        color: "var(--color-text-disabled)",
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
                          stroke="var(--color-success)"
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
              borderTop: "1px solid var(--color-border-subtle)",
              padding: "14px 16px",
              background: "var(--color-bg-card)",
              flexShrink: 0,
            }}
          >
            <CommitInput
              value={commitMsg}
              onChange={setCommitMsg}
              onCommit={() => handleCommit(false)}
              onCommitAndPush={() => handleCommit(true)}
              onPushOnly={handlePushOnly}
              onAiGenerate={handleAiCommitMsg}
              isGenerating={isGenerating}
              disabled={isCommitting}
              amend={showAmend}
              onAmendChange={handleAmendChange}
              stagedCount={staged.length}
            />
          </div>
        </div>

        {/* Right panel: diff viewer or blame */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {blameFile ? (
            <BlameViewer
              repoPath={repoPath}
              filePath={blameFile}
              onClose={() => setBlameFile(null)}
            />
          ) : (
            <DiffViewer
              diff={diff}
              loading={diffLoading}
              repoPath={repoPath}
              onStageHunk={
                selectedFile && !selectedFile.staged
                  ? async (patch) => {
                      try {
                        await ipc.stageHunk(repoPath, patch);
                        await loadFiles();
                        refreshStatus(repoPath);
                      } catch (e) {
                        addToast("error", `Stage hunk failed: ${e}`);
                      }
                    }
                  : undefined
              }
              onDiscardHunk={
                selectedFile && !selectedFile.staged
                  ? async (patch) => {
                      const ok = await useConfirmStore.getState().request({
                        title: "Discard hunk?",
                        description: "Discard this hunk? This cannot be undone.",
                        danger: true,
                        confirmLabel: "Discard",
                      });
                      if (!ok) return;
                      try {
                        await ipc.discardHunk(repoPath, patch);
                        await loadFiles();
                        refreshStatus(repoPath);
                      } catch (e) {
                        addToast("error", `Discard hunk failed: ${e}`);
                      }
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
