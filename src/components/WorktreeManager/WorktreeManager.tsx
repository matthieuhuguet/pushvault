import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";
import { useConfirmStore } from "../../store/confirmStore";

type Worktree = {
  path: string;
  head: string;
  branch: string;
  is_main: boolean;
  is_locked: boolean;
  is_prunable: boolean;
};

interface WorktreeManagerProps {
  repoPath: string;
  onClose: () => void;
}

type FormMode = "idle" | "add";

export function WorktreeManager({ repoPath, onClose }: WorktreeManagerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const addToast = useToastStore((s) => s.add);

  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("idle");

  // Add-worktree form fields
  const [addPath, setAddPath] = useState("");
  const [addBranch, setAddBranch] = useState("");
  const [addNewBranch, setAddNewBranch] = useState(false);
  const [addBusy, setAddBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipc.listWorktrees(repoPath);
      setWorktrees(data as Worktree[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [repoPath]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (formMode !== "idle") setFormMode("idle");
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, formMode]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleAdd = async () => {
    if (!addPath.trim()) {
      addToast("error", "Worktree path is required");
      return;
    }
    setAddBusy(true);
    try {
      await ipc.addWorktree(repoPath, addPath.trim(), addBranch.trim(), addNewBranch);
      addToast("success", `Worktree created at ${addPath.trim()}`);
      setFormMode("idle");
      setAddPath("");
      setAddBranch("");
      setAddNewBranch(false);
      load();
    } catch (e) {
      addToast("error", `Failed to add worktree: ${e}`);
    } finally {
      setAddBusy(false);
    }
  };

  const handleRemove = async (wt: Worktree) => {
    const ok = await useConfirmStore.getState().request({
      title: "Remove worktree?",
      description: `Remove worktree at:\n${wt.path}\n\nThis will delete the directory.`,
      danger: true,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await ipc.removeWorktree(repoPath, wt.path, false);
      addToast("success", "Worktree removed");
      load();
    } catch (e) {
      // If it fails, offer force remove
      const forceOk = await useConfirmStore.getState().request({
        title: "Force remove?",
        description: `Could not remove cleanly:\n${e}\n\nForce remove?`,
        danger: true,
        confirmLabel: "Force Remove",
      });
      if (forceOk) {
        try {
          await ipc.removeWorktree(repoPath, wt.path, true);
          addToast("success", "Worktree force-removed");
          load();
        } catch (e2) {
          addToast("error", `Force remove failed: ${e2}`);
        }
      }
    }
  };

  const handleOpenExplorer = async (path: string) => {
    try {
      await ipc.openInExplorer(path);
    } catch (e) {
      addToast("error", `Failed to open explorer: ${e}`);
    }
  };

  const handleOpenTerminal = async (path: string) => {
    try {
      await ipc.openInTerminal(path);
    } catch (e) {
      addToast("error", `Failed to open terminal: ${e}`);
    }
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "8px 12px",
    background: "var(--overlay-soft)",
    border: "1px solid var(--overlay-medium)",
    borderRadius: "7px",
    color: "#e0e0e0",
    fontSize: "13px",
    fontFamily: "inherit",
    outline: "none",
    minWidth: 0,
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 850,
        padding: "24px",
        animation: "fade-in 150ms ease both",
      }}
    >
      <div
        style={{
          width: "580px",
          maxWidth: "100%",
          maxHeight: "85vh",
          background: "var(--color-bg-card)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "slide-in-bottom 200ms ease both",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-border-subtle)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              Worktrees
            </h2>
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px", marginBottom: 0 }}>
              {worktrees.length} worktree{worktrees.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setFormMode(formMode === "add" ? "idle" : "add")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 12px",
                background: formMode === "add" ? "rgba(29,185,84,0.15)" : "var(--overlay-light)",
                border: formMode === "add" ? "1px solid rgba(29,185,84,0.35)" : "1px solid var(--overlay-light)",
                borderRadius: "8px",
                color: formMode === "add" ? "#1DB954" : "#b3b3b3",
                fontSize: "12px",
                cursor: "pointer",
                fontWeight: 600,
                transition: "all 120ms ease",
              }}
            >
              <span style={{ fontSize: "14px" }}>＋</span>
              Add Worktree
            </button>
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
                flexShrink: 0,
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
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* Add worktree form */}
          {formMode === "add" && (
            <div
              style={{
                padding: "16px 24px",
                background: "rgba(29,185,84,0.04)",
                borderBottom: "1px solid var(--color-border-subtle)",
              }}
            >
              <p style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--color-text-disabled)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                margin: "0 0 10px",
              }}>
                New Worktree
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* Path */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "12px", color: "var(--color-text-muted)", width: "64px", flexShrink: 0 }}>
                    Path
                  </label>
                  <input
                    value={addPath}
                    onChange={(e) => setAddPath(e.target.value)}
                    placeholder="C:\repos\my-feature  or  ../my-feature"
                    style={inputStyle}
                    autoFocus
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(29,185,84,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--overlay-medium)")}
                  />
                </div>

                {/* Branch */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "12px", color: "var(--color-text-muted)", width: "64px", flexShrink: 0 }}>
                    Branch
                  </label>
                  <input
                    value={addBranch}
                    onChange={(e) => setAddBranch(e.target.value)}
                    placeholder="existing-branch  or  new-branch-name"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(29,185,84,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--overlay-medium)")}
                  />
                </div>

                {/* New branch toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingLeft: "72px" }}>
                  <label
                    style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", userSelect: "none" }}
                    onClick={() => setAddNewBranch(!addNewBranch)}
                  >
                    <div style={{
                      width: "15px",
                      height: "15px",
                      borderRadius: "4px",
                      border: addNewBranch ? "none" : "1px solid var(--overlay-vivid)",
                      background: addNewBranch ? "#1DB954" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 120ms ease",
                      flexShrink: 0,
                    }}>
                      {addNewBranch && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: "12px", color: addNewBranch ? "#e0e0e0" : "#6a6a6a" }}>
                      Create new branch (<code style={{ fontSize: "11px" }}>-b</code>)
                    </span>
                  </label>
                </div>

                {/* Buttons */}
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
                  <button
                    onClick={() => { setFormMode("idle"); setAddPath(""); setAddBranch(""); }}
                    style={{
                      padding: "7px 14px",
                      background: "var(--overlay-subtle)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "7px",
                      color: "var(--color-text-secondary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={addBusy}
                    style={{
                      padding: "7px 14px",
                      background: addBusy ? "rgba(29,185,84,0.3)" : "#1DB954",
                      border: "none",
                      borderRadius: "7px",
                      color: addBusy ? "rgba(0,0,0,0.4)" : "#000",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: addBusy ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {addBusy && (
                      <span style={{
                        width: "11px",
                        height: "11px",
                        border: "2px solid rgba(0,0,0,0.3)",
                        borderTop: "2px solid #000",
                        borderRadius: "50%",
                        animation: "spin 0.6s linear infinite",
                        display: "inline-block",
                      }} />
                    )}
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Body */}
          <div style={{ padding: "12px 16px 20px" }}>
            {loading && (
              <p style={{ fontSize: "13px", color: "var(--color-text-disabled)", padding: "8px" }}>Loading worktrees…</p>
            )}

            {error && (
              <div style={{
                padding: "10px 14px",
                background: "rgba(229,83,75,0.1)",
                border: "1px solid rgba(229,83,75,0.3)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#e5534b",
                margin: "8px",
              }}>
                {error}
              </div>
            )}

            {!loading && !error && worktrees.map((wt) => (
              <WorktreeRow
                key={wt.path}
                wt={wt}
                onRemove={handleRemove}
                onOpenExplorer={handleOpenExplorer}
                onOpenTerminal={handleOpenTerminal}
              />
            ))}

            {!loading && !error && worktrees.length === 0 && (
              <p style={{ fontSize: "13px", color: "var(--color-text-disabled)", padding: "8px" }}>
                No worktrees found.
              </p>
            )}
          </div>

          {/* Info footer */}
          <div style={{
            padding: "10px 24px 14px",
            borderTop: "1px solid var(--overlay-soft)",
          }}>
            <p style={{ fontSize: "11px", color: "#3a3a3a", margin: 0 }}>
              Worktrees let you check out multiple branches simultaneously in separate directories.
              The main worktree cannot be removed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Worktree row ─────────────────────────────────────────── */
interface RowProps {
  wt: Worktree;
  onRemove: (wt: Worktree) => void;
  onOpenExplorer: (path: string) => void;
  onOpenTerminal: (path: string) => void;
}

function WorktreeRow({ wt, onRemove, onOpenExplorer, onOpenTerminal }: RowProps) {
  const dirName = wt.path.split(/[/\\]/).pop() ?? wt.path;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px solid var(--overlay-soft)",
        background: "rgba(255,255,255,0.02)",
        marginBottom: "6px",
        transition: "border-color 120ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--overlay-light)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--overlay-soft)")}
    >
      {/* Left: icon + info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px" }}>
          {/* Folder icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path
              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              stroke={wt.is_main ? "#1DB954" : "#6a6a6a"}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{
            fontSize: "13px",
            fontWeight: 600,
            color: wt.is_main ? "#e0e0e0" : "#b3b3b3",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {dirName}
          </span>
          {wt.is_main && (
            <span style={{
              fontSize: "10px",
              padding: "1px 6px",
              background: "rgba(29,185,84,0.12)",
              color: "#1DB954",
              borderRadius: "8px",
              fontWeight: 700,
              flexShrink: 0,
            }}>
              main
            </span>
          )}
          {wt.is_locked && (
            <span style={{
              fontSize: "10px",
              padding: "1px 6px",
              background: "rgba(245,155,0,0.12)",
              color: "#f59b00",
              borderRadius: "8px",
              flexShrink: 0,
            }}>
              🔒 locked
            </span>
          )}
          {wt.is_prunable && (
            <span style={{
              fontSize: "10px",
              padding: "1px 6px",
              background: "rgba(229,83,75,0.12)",
              color: "#e5534b",
              borderRadius: "8px",
              flexShrink: 0,
            }}>
              prunable
            </span>
          )}
        </div>

        {/* Branch + path */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "#3d9be9", fontFamily: "monospace" }}>
            ⎇ {wt.branch}
          </span>
          <span style={{ fontSize: "10px", color: "#3a3a3a" }}>
            {wt.head}
          </span>
        </div>
        <div style={{
          fontSize: "10px",
          color: "#3a3a3a",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginTop: "2px",
        }}>
          {wt.path}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
        <ActionBtn
          title="Open in Explorer"
          color="#b3b3b3"
          hoverColor="#fff"
          onClick={() => onOpenExplorer(wt.path)}
        >
          📁
        </ActionBtn>
        <ActionBtn
          title="Open in Terminal"
          color="#b3b3b3"
          hoverColor="#fff"
          onClick={() => onOpenTerminal(wt.path)}
        >
          &gt;_
        </ActionBtn>
        {!wt.is_main && (
          <ActionBtn
            title="Remove worktree"
            color="#e5534b"
            hoverColor="#ff6b63"
            onClick={() => onRemove(wt)}
          >
            ✕
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  title,
  color,
  hoverColor,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  color: string;
  hoverColor: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        padding: "5px 8px",
        background: "var(--overlay-subtle)",
        border: "1px solid var(--overlay-light)",
        borderRadius: "6px",
        color,
        fontSize: "11px",
        cursor: "pointer",
        transition: "background 100ms ease, color 100ms ease",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-medium)";
        (e.currentTarget as HTMLButtonElement).style.color = hoverColor;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
        (e.currentTarget as HTMLButtonElement).style.color = color;
      }}
    >
      {children}
    </button>
  );
}
