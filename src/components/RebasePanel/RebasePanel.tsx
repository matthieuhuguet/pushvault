import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";

type RebaseAction = "pick" | "squash" | "fixup" | "reword" | "drop" | "edit";

interface RebaseCommit {
  hash: string;
  shortHash: string;
  message: string;
  action: RebaseAction;
}

interface RebasePanelProps {
  repoPath: string;
  onClose: () => void;
}

const ACTION_COLORS: Record<RebaseAction, string> = {
  pick:   "#3d9be9",
  squash: "#b069f8",
  fixup:  "#f59b00",
  reword: "#1DB954",
  drop:   "#e5534b",
  edit:   "#ff7b00",
};

const ACTION_LABELS: Record<RebaseAction, string> = {
  pick:   "pick",
  squash: "squash",
  fixup:  "fixup",
  reword: "reword",
  drop:   "drop",
  edit:   "edit",
};

const ACTION_CYCLE: RebaseAction[] = ["pick", "squash", "fixup", "reword", "drop", "edit"];

function nextAction(a: RebaseAction): RebaseAction {
  const i = ACTION_CYCLE.indexOf(a);
  return ACTION_CYCLE[(i + 1) % ACTION_CYCLE.length];
}

export function RebasePanel({ repoPath, onClose }: RebasePanelProps) {
  const addToast = useToastStore((s) => s.add);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [baseCommit, setBaseCommit] = useState("HEAD~5");
  const [commits, setCommits] = useState<RebaseCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [inProgress, setInProgress] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");

  // Drag-and-drop state
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    ipc.rebaseInProgress(repoPath).then(setInProgress).catch(() => {});
  }, [repoPath]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const loadCommits = async () => {
    if (!baseCommit.trim()) return;
    setLoading(true);
    try {
      const raw = await ipc.getRebaseCommits(repoPath, baseCommit.trim());
      setCommits(raw.map(([hash, shortHash, message]) => ({
        hash, shortHash, message, action: "pick" as RebaseAction,
      })));
    } catch (e) {
      addToast("error", `Failed to load commits: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const buildTodo = (): string =>
    commits
      .map((c) => `${c.action} ${c.hash} ${c.message}`)
      .join("\n") + "\n";

  const handleStart = async () => {
    if (commits.length === 0) return;
    setRunning(true);
    try {
      const result = await ipc.startInteractiveRebase(repoPath, baseCommit.trim(), buildTodo());
      setOutput(result);
      addToast("success", "Rebase complete");
      setCommits([]);
      setInProgress(false);
    } catch (e) {
      const msg = String(e);
      setOutput(msg);
      if (msg.toLowerCase().includes("conflict") || msg.toLowerCase().includes("stopped")) {
        setInProgress(true);
        addToast("warning", "Rebase paused — resolve conflicts then Continue");
      } else {
        addToast("error", `Rebase failed: ${e}`);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleContinue = async () => {
    setRunning(true);
    try {
      const result = await ipc.rebaseContinue(repoPath);
      setOutput(result);
      const stillInProgress = await ipc.rebaseInProgress(repoPath);
      setInProgress(stillInProgress);
      if (!stillInProgress) addToast("success", "Rebase complete");
    } catch (e) {
      setOutput(String(e));
      addToast("error", `Continue failed: ${e}`);
    } finally {
      setRunning(false);
    }
  };

  const handleAbort = async () => {
    setRunning(true);
    try {
      await ipc.rebaseAbort(repoPath);
      setInProgress(false);
      setOutput("");
      addToast("info", "Rebase aborted — returned to original branch");
    } catch (e) {
      addToast("error", `Abort failed: ${e}`);
    } finally {
      setRunning(false);
    }
  };

  // Drag-and-drop handlers
  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOver(idx);
  };
  const handleDrop = (toIdx: number) => {
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === toIdx) { setDragOver(null); return; }
    const next = [...commits];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    setCommits(next);
    dragIdx.current = null;
    setDragOver(null);
  };

  const setAction = (idx: number, action: RebaseAction) => {
    setCommits((prev) => prev.map((c, i) => i === idx ? { ...c, action } : c));
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        style={{
          width: "600px",
          maxHeight: "88vh",
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "14px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexShrink: 0,
        }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px",
            background: "rgba(176,105,248,0.15)",
            border: "1px solid rgba(176,105,248,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", flexShrink: 0,
          }}>
            ↕
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>
              Interactive Rebase
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
              Reorder, squash, drop, or reword commits
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "var(--overlay-subtle)", border: "none",
              color: "var(--color-text-muted)", cursor: "pointer", fontSize: "14px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6a6a6a"; }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* In-progress banner */}
          {inProgress && (
            <div style={{
              padding: "14px 16px",
              background: "rgba(245,155,0,0.08)",
              border: "1px solid rgba(245,155,0,0.3)",
              borderRadius: "10px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}>
              <p style={{ margin: 0, fontSize: "13px", color: "#f59b00" }}>
                ⚠ Rebase in progress — resolve conflicts then continue, or abort.
              </p>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button
                  onClick={handleContinue}
                  disabled={running}
                  style={{
                    padding: "5px 12px",
                    background: "rgba(29,185,84,0.15)",
                    border: "1px solid rgba(29,185,84,0.3)",
                    borderRadius: "8px",
                    color: "#1DB954",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: running ? "not-allowed" : "pointer",
                  }}
                >
                  Continue
                </button>
                <button
                  onClick={handleAbort}
                  disabled={running}
                  style={{
                    padding: "5px 12px",
                    background: "rgba(229,83,75,0.1)",
                    border: "1px solid rgba(229,83,75,0.2)",
                    borderRadius: "8px",
                    color: "#e5534b",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: running ? "not-allowed" : "pointer",
                  }}
                >
                  Abort
                </button>
              </div>
            </div>
          )}

          {/* Base commit input */}
          {!inProgress && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: "6px" }}>
                Rebase from base commit (exclusive)
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={baseCommit}
                  onChange={(e) => setBaseCommit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") loadCommits(); }}
                  placeholder="e.g. HEAD~5, main, or a commit hash"
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    background: "var(--overlay-subtle)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    color: "var(--color-text-primary)",
                    fontSize: "13px",
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(176,105,248,0.4)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--overlay-light)"; }}
                />
                <button
                  onClick={loadCommits}
                  disabled={loading}
                  style={{
                    padding: "9px 16px",
                    background: "rgba(176,105,248,0.15)",
                    border: "1px solid rgba(176,105,248,0.3)",
                    borderRadius: "8px",
                    color: "#b069f8",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    flexShrink: 0,
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading)
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(176,105,248,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(176,105,248,0.15)";
                  }}
                >
                  {loading ? "Loading…" : "Load"}
                </button>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#3a3a3a" }}>
                All commits after this point will be included in the rebase.
              </p>
            </div>
          )}

          {/* Commit list */}
          {commits.length > 0 && !inProgress && (
            <div>
              {/* Legend */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                {ACTION_CYCLE.map((a) => (
                  <span key={a} style={{
                    fontSize: "10px",
                    fontFamily: "monospace",
                    color: ACTION_COLORS[a],
                    background: `${ACTION_COLORS[a]}18`,
                    padding: "2px 8px",
                    borderRadius: "6px",
                    border: `1px solid ${ACTION_COLORS[a]}40`,
                  }}>
                    {a}
                  </span>
                ))}
                <span style={{ fontSize: "11px", color: "#3a3a3a", marginLeft: "4px", alignSelf: "center" }}>
                  Click action to cycle · Drag to reorder
                </span>
              </div>

              {/* Commit rows */}
              <div>
                {commits.map((c, idx) => (
                  <div
                    key={c.hash}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={() => { dragIdx.current = null; setDragOver(null); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "9px 10px",
                      background: dragOver === idx
                        ? "rgba(176,105,248,0.08)"
                        : c.action === "drop"
                          ? "rgba(229,83,75,0.05)"
                          : "var(--overlay-soft)",
                      border: dragOver === idx
                        ? "1px dashed rgba(176,105,248,0.5)"
                        : "1px solid var(--overlay-soft)",
                      borderRadius: "8px",
                      marginBottom: "5px",
                      cursor: "grab",
                      opacity: c.action === "drop" ? 0.5 : 1,
                      transition: "all 100ms ease",
                    }}
                  >
                    {/* Drag handle */}
                    <span style={{ color: "#3a3a3a", fontSize: "12px", flexShrink: 0, userSelect: "none" }}>⠿</span>

                    {/* Action button */}
                    <button
                      onClick={() => setAction(idx, nextAction(c.action))}
                      style={{
                        padding: "2px 8px",
                        background: `${ACTION_COLORS[c.action]}18`,
                        border: `1px solid ${ACTION_COLORS[c.action]}50`,
                        borderRadius: "6px",
                        color: ACTION_COLORS[c.action],
                        fontSize: "10px",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        cursor: "pointer",
                        flexShrink: 0,
                        minWidth: "54px",
                        textAlign: "center",
                        transition: "all 100ms ease",
                      }}
                    >
                      {ACTION_LABELS[c.action]}
                    </button>

                    {/* Hash */}
                    <code style={{ fontSize: "11px", color: "var(--color-text-disabled)", fontFamily: "monospace", flexShrink: 0 }}>
                      {c.shortHash}
                    </code>

                    {/* Message */}
                    <span style={{
                      flex: 1,
                      fontSize: "12px",
                      color: c.action === "drop" ? "#535353" : "#b3b3b3",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textDecoration: c.action === "drop" ? "line-through" : "none",
                    }}>
                      {c.message}
                    </span>

                    {/* Per-row action cycle buttons */}
                    <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                      {(["pick", "squash", "fixup", "drop"] as RebaseAction[]).map((a) => (
                        <button
                          key={a}
                          onClick={() => setAction(idx, a)}
                          title={a}
                          style={{
                            width: "20px", height: "20px",
                            borderRadius: "4px",
                            background: c.action === a ? `${ACTION_COLORS[a]}25` : "transparent",
                            border: c.action === a ? `1px solid ${ACTION_COLORS[a]}60` : "1px solid transparent",
                            color: c.action === a ? ACTION_COLORS[a] : "#3a3a3a",
                            fontSize: "9px",
                            fontFamily: "monospace",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 80ms ease",
                          }}
                          onMouseEnter={(e) => {
                            if (c.action !== a) {
                              (e.currentTarget as HTMLButtonElement).style.color = ACTION_COLORS[a];
                              (e.currentTarget as HTMLButtonElement).style.borderColor = `${ACTION_COLORS[a]}40`;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (c.action !== a) {
                              (e.currentTarget as HTMLButtonElement).style.color = "#3a3a3a";
                              (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
                            }
                          }}
                        >
                          {a[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div style={{ marginTop: "12px", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                <p style={{ margin: 0, fontSize: "11px", color: "var(--color-text-disabled)" }}>
                  {commits.filter(c => c.action !== "drop").length} commits to apply ·{" "}
                  {commits.filter(c => c.action === "squash" || c.action === "fixup").length} to merge ·{" "}
                  {commits.filter(c => c.action === "drop").length} to drop
                </p>
              </div>
            </div>
          )}

          {/* Output */}
          {output && (
            <div style={{
              marginTop: "12px",
              padding: "10px 12px",
              background: "var(--overlay-soft)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "8px",
              maxHeight: "120px",
              overflowY: "auto",
            }}>
              <pre style={{ margin: 0, fontSize: "11px", color: "var(--color-text-secondary)", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {output}
              </pre>
            </div>
          )}

          {commits.length === 0 && !inProgress && !loading && (
            <div style={{
              padding: "32px",
              textAlign: "center",
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed var(--overlay-subtle)",
              borderRadius: "10px",
            }}>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-disabled)" }}>
                Enter a base commit and click Load to get started.
              </p>
              <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#3a3a3a" }}>
                Example: <code style={{ color: "var(--color-text-disabled)" }}>HEAD~5</code> to rebase the last 5 commits.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: "8px" }}>
            {!inProgress && commits.length > 0 && (
              <button
                onClick={() => setCommits([])}
                style={{
                  padding: "7px 14px",
                  background: "transparent",
                  border: "1px solid var(--overlay-light)",
                  borderRadius: "16px",
                  color: "var(--color-text-disabled)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={onClose}
              style={{
                padding: "7px 16px",
                background: "var(--overlay-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "16px",
                color: "var(--color-text-secondary)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Close
            </button>
            {!inProgress && commits.length > 0 && (
              <button
                onClick={handleStart}
                disabled={running}
                style={{
                  padding: "7px 18px",
                  background: running ? "rgba(176,105,248,0.3)" : "#b069f8",
                  border: "none",
                  borderRadius: "16px",
                  color: "var(--color-text-primary)",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: running ? "not-allowed" : "pointer",
                  transition: "all 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (!running)
                    (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = "none";
                }}
              >
                {running ? "Rebasing…" : "Start Rebase"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
