import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";

interface BisectStatus {
  active: boolean;
  current_hash: string;
  current_message: string;
  log: string;
  steps_done: number;
  steps_remaining: number;
}

interface BisectPanelProps {
  repoPath: string;
  onClose: () => void;
}

export function BisectPanel({ repoPath, onClose }: BisectPanelProps) {
  const addToast = useToastStore((s) => s.add);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<BisectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [output, setOutput] = useState("");

  // Setup form
  const [badCommit, setBadCommit] = useState("HEAD");
  const [goodCommit, setGoodCommit] = useState("");

  const load = async () => {
    try {
      const s = await ipc.bisectStatus(repoPath);
      setStatus(s);
    } catch (e) {
      addToast("error", `Bisect status failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [repoPath]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const act = async (fn: () => Promise<string>, successMsg?: string) => {
    setActing(true);
    try {
      const out = await fn();
      setOutput(out);
      if (successMsg) addToast("success", successMsg);
      await load();
    } catch (e) {
      addToast("error", String(e));
      setOutput(String(e));
    } finally {
      setActing(false);
    }
  };

  const handleStart = () => {
    if (!goodCommit.trim()) {
      addToast("warning", "Enter a known-good commit hash");
      return;
    }
    act(
      () => ipc.bisectStart(repoPath, badCommit.trim() || "HEAD", goodCommit.trim()),
      "Bisect started — test the current commit and mark as good or bad"
    );
  };

  const isBugFound = output.toLowerCase().includes("first bad commit") ||
    output.toLowerCase().includes("is the first bad commit");

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
          width: "540px",
          maxHeight: "84vh",
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
            background: "var(--color-info-dim)",
            border: "1px solid var(--color-info-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", flexShrink: 0,
          }}>
            🔍
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>
              Git Bisect
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
              Binary search for the commit that introduced a bug
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
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-disabled)"; }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-disabled)", fontSize: "13px" }}>Loading…</div>
          ) : !status?.active ? (
            /* ── Setup form ── */
            <div>
              <p style={{ margin: "0 0 20px", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                Bisect checks out commits between a <span style={{ color: "var(--color-error)", fontWeight: 600 }}>bad</span> commit
                (where the bug exists) and a <span style={{ color: "var(--color-success)", fontWeight: 600 }}>good</span> commit
                (where it didn't exist yet). You test each one and PushVault narrows down the culprit.
              </p>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "var(--color-error)", fontWeight: 600, marginBottom: "6px" }}>
                  Bad commit (has the bug)
                </label>
                <input
                  type="text"
                  value={badCommit}
                  onChange={(e) => setBadCommit(e.target.value)}
                  placeholder="HEAD, or a specific commit hash"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    background: "rgba(229,83,75,0.06)",
                    border: "1px solid rgba(229,83,75,0.25)",
                    borderRadius: "8px",
                    color: "var(--color-text-primary)",
                    fontSize: "13px",
                    fontFamily: "monospace",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(229,83,75,0.5)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(229,83,75,0.25)"; }}
                />
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "var(--color-success)", fontWeight: 600, marginBottom: "6px" }}>
                  Good commit (bug not present)
                </label>
                <input
                  type="text"
                  value={goodCommit}
                  onChange={(e) => setGoodCommit(e.target.value)}
                  placeholder="e.g. abc1234 or a tag like v1.0.0"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    background: "rgba(29,185,84,0.06)",
                    border: "1px solid rgba(29,185,84,0.25)",
                    borderRadius: "8px",
                    color: "var(--color-text-primary)",
                    fontSize: "13px",
                    fontFamily: "monospace",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(29,185,84,0.5)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(29,185,84,0.25)"; }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
                />
              </div>

              <button
                onClick={handleStart}
                disabled={acting || !goodCommit.trim()}
                style={{
                  width: "100%",
                  padding: "11px",
                  background: goodCommit.trim() ? "var(--color-info)" : "var(--color-info-border)",
                  border: "none",
                  borderRadius: "10px",
                  color: "var(--color-text-primary)",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: goodCommit.trim() ? "pointer" : "not-allowed",
                  transition: "all 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (goodCommit.trim())
                    (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = "none";
                }}
              >
                {acting ? "Starting…" : "Start Bisect"}
              </button>
            </div>
          ) : (
            /* ── Active bisect ── */
            <div>
              {/* Found! banner */}
              {isBugFound && (
                <div style={{
                  padding: "14px 16px",
                  background: "var(--color-warning-dim)",
                  border: "1px solid var(--color-warning-border)",
                  borderRadius: "10px",
                  marginBottom: "16px",
                }}>
                  <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "var(--color-warning)" }}>
                    🎯 First bad commit found!
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-text-muted)" }}>
                    See output below. Run Reset to return to your original branch.
                  </p>
                </div>
              )}

              {/* Current commit card */}
              <div style={{
                padding: "14px 16px",
                background: "var(--color-info-dim)",
                border: "1px solid var(--color-info-border)",
                borderRadius: "10px",
                marginBottom: "16px",
              }}>
                <p style={{ margin: "0 0 4px", fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.06em" }}>
                  CURRENT COMMIT TO TEST
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <code style={{ fontSize: "13px", color: "var(--color-info)", fontFamily: "monospace" }}>
                    {status.current_hash || "—"}
                  </code>
                  <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {status.current_message || "—"}
                  </span>
                </div>
              </div>

              {/* Progress */}
              {status.steps_remaining > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>
                      ~{status.steps_remaining} commit{status.steps_remaining !== 1 ? "s" : ""} remaining
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>
                      {status.steps_done} step{status.steps_done !== 1 ? "s" : ""} done
                    </span>
                  </div>
                  <div style={{
                    height: "3px",
                    background: "var(--overlay-light)",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: status.steps_done > 0
                        ? `${Math.min((status.steps_done / (status.steps_done + status.steps_remaining)) * 100, 100)}%`
                        : "0%",
                      background: "var(--color-info)",
                      borderRadius: "2px",
                      transition: "width 400ms ease",
                    }} />
                  </div>
                </div>
              )}

              {/* Good / Bad / Skip action buttons */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <button
                  onClick={() => act(() => ipc.bisectGood(repoPath), "Marked as good")}
                  disabled={acting || isBugFound}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "var(--color-success-dim)",
                    border: "1px solid var(--color-success-border)",
                    borderRadius: "10px",
                    color: "var(--color-success)",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: acting || isBugFound ? "not-allowed" : "pointer",
                    transition: "all 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!acting && !isBugFound)
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--color-success-border)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--color-success-dim)";
                  }}
                >
                  ✓ Good
                </button>
                <button
                  onClick={() => act(() => ipc.bisectBad(repoPath), "Marked as bad")}
                  disabled={acting || isBugFound}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "var(--color-error-dim)",
                    border: "1px solid var(--color-error-border)",
                    borderRadius: "10px",
                    color: "var(--color-error)",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: acting || isBugFound ? "not-allowed" : "pointer",
                    transition: "all 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!acting && !isBugFound)
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--color-error-border)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--color-error-dim)";
                  }}
                >
                  ✕ Bad
                </button>
                <button
                  onClick={() => act(() => ipc.bisectSkip(repoPath), "Skipped")}
                  disabled={acting || isBugFound}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "var(--overlay-soft)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    color: "var(--color-text-muted)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: acting || isBugFound ? "not-allowed" : "pointer",
                    transition: "all 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!acting && !isBugFound) {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-soft)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-disabled)";
                  }}
                >
                  ↷ Skip
                </button>
              </div>

              {/* Output */}
              {output && (
                <div style={{
                  padding: "12px 14px",
                  background: "var(--overlay-soft)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  maxHeight: "120px",
                  overflowY: "auto",
                }}>
                  <pre style={{ margin: 0, fontSize: "11px", color: "var(--color-text-secondary)", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {output}
                  </pre>
                </div>
              )}

              {/* Bisect log */}
              {status.log && (
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: "11px", color: "var(--color-text-disabled)", fontWeight: 600 }}>
                    BISECT LOG
                  </p>
                  <div style={{
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--overlay-soft)",
                    borderRadius: "8px",
                    maxHeight: "100px",
                    overflowY: "auto",
                  }}>
                    <pre style={{ margin: 0, fontSize: "10px", color: "var(--color-text-disabled)", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                      {status.log}
                    </pre>
                  </div>
                </div>
              )}
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
          {status?.active ? (
            <button
              onClick={() => act(() => ipc.bisectReset(repoPath), "Bisect ended — returned to original branch")}
              disabled={acting}
              style={{
                padding: "7px 16px",
                background: "var(--color-error-dim)",
                border: "1px solid var(--color-error-border)",
                borderRadius: "16px",
                color: "var(--color-error)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: acting ? "not-allowed" : "pointer",
                transition: "all 120ms ease",
              }}
              onMouseEnter={(e) => {
                if (!acting)
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--color-error-border)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-error-dim)";
              }}
            >
              Abort & Reset
            </button>
          ) : (
            <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>
              No active bisect session
            </span>
          )}
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
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
