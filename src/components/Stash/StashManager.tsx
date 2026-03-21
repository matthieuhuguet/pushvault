import React, { useCallback, useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";
import { useRepoStore } from "../../store/repoStore";
import { useConfirmStore } from "../../store/confirmStore";
import { DiffViewer } from "../Diff/DiffViewer";
import type { DiffResult, StashEntry } from "../../types";

interface StashManagerProps {
  repoPath: string;
  onClose: () => void;
  repoName?: string;
}

export function StashManager({ repoPath, onClose, repoName }: StashManagerProps) {
  const addToast = useToastStore((s) => s.add);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);

  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stashMsg, setStashMsg] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionIdx, setActionIdx] = useState<number | null>(null);
  const [expandedStashIdx, setExpandedStashIdx] = useState<number | null>(null);
  const [stashDiff, setStashDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ipc.getStashes(repoPath);
      setStashes(data);
    } catch (e) {
      addToast("error", `Failed to load stashes: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await ipc.saveStash(repoPath, stashMsg.trim() || null, includeUntracked);
      setStashMsg("");
      addToast("success", "Changes stashed");
      await load();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Stash failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async (index: number) => {
    setActionIdx(index);
    try {
      await ipc.applyStash(repoPath, index);
      addToast("success", `Applied stash@{${index}}`);
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Apply failed: ${e}`);
    } finally {
      setActionIdx(null);
    }
  };

  const handlePop = async (index: number) => {
    setActionIdx(index);
    try {
      await ipc.popStash(repoPath, index);
      addToast("success", `Popped stash@{${index}}`);
      await load();
      refreshStatus(repoPath);
    } catch (e) {
      addToast("error", `Pop failed: ${e}`);
    } finally {
      setActionIdx(null);
    }
  };

  const handleDrop = async (index: number) => {
    const ok = await useConfirmStore.getState().request({
      title: "Drop stash?",
      description: `Drop stash@{${index}}? This cannot be undone.`,
      danger: true,
      confirmLabel: "Drop",
    });
    if (!ok) return;
    setActionIdx(index);
    try {
      await ipc.dropStash(repoPath, index);
      addToast("info", `Dropped stash@{${index}}`);
      await load();
    } catch (e) {
      addToast("error", `Drop failed: ${e}`);
    } finally {
      setActionIdx(null);
    }
  };

  const handleClearAll = async () => {
    const ok = await useConfirmStore.getState().request({
      title: "Clear all stashes?",
      description: "Drop ALL stashes? This cannot be undone.",
      danger: true,
      confirmLabel: "Drop All",
    });
    if (!ok) return;
    for (const stash of [...stashes].reverse()) {
      try {
        await ipc.dropStash(repoPath, stash.index);
      } catch {
        // continue
      }
    }
    addToast("info", "All stashes cleared");
    await load();
  };

  const handleToggleDiff = async (index: number) => {
    if (expandedStashIdx === index) {
      setExpandedStashIdx(null);
      setStashDiff(null);
      return;
    }
    setExpandedStashIdx(index);
    setStashDiff(null);
    setDiffLoading(true);
    try {
      const diff = await ipc.getStashDiff(repoPath, index);
      setStashDiff(diff);
    } catch (e) {
      addToast("error", `Failed to load stash diff: ${e}`);
    } finally {
      setDiffLoading(false);
    }
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
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "600px",
          maxWidth: "100%",
          maxHeight: "84vh",
          background: "var(--color-bg-elevated)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "18px" }}>📦</span>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)" }}>
                Stash Manager
              </h2>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                {repoName ?? repoPath}
              </p>
            </div>
          </div>
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
              lineHeight: 1,
              transition: "background 120ms ease, color 120ms ease",
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

        {/* Save stash form */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border-subtle)",
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "10px" }}>
            Save current changes
          </p>
          <input
            type="text"
            placeholder="Stash message (optional)…"
            value={stashMsg}
            onChange={(e) => setStashMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) handleSave();
            }}
            style={{
              width: "100%",
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              color: "var(--color-text-primary)",
              fontSize: "13px",
              padding: "9px 12px",
              marginBottom: "10px",
              outline: "none",
              transition: "border-color 150ms ease",
            }}
            onFocus={(e) =>
              ((e.target as HTMLInputElement).style.borderColor = "#1DB954")
            }
            onBlur={(e) =>
              ((e.target as HTMLInputElement).style.borderColor =
                "var(--overlay-light)")
            }
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
                style={{ accentColor: "#1DB954", cursor: "pointer" }}
              />
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                Include untracked files
              </span>
            </label>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "8px 20px",
                background: saving ? "rgba(29,185,84,0.3)" : "#1DB954",
                color: "#000",
                border: "none",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "background 150ms ease",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!saving)
                  (e.currentTarget as HTMLButtonElement).style.background = "#1ed760";
              }}
              onMouseLeave={(e) => {
                if (!saving)
                  (e.currentTarget as HTMLButtonElement).style.background = "#1DB954";
              }}
            >
              {saving ? "Saving…" : "Stash Changes"}
            </button>
          </div>
        </div>

        {/* Stash list */}
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
                <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#1DB954" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Loading stashes…
            </div>
          ) : stashes.length === 0 ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "var(--color-text-disabled)",
                fontSize: "13px",
              }}
            >
              <p>No stashes yet</p>
              <p style={{ fontSize: "11px", marginTop: "4px" }}>
                Save your changes above to create one.
              </p>
            </div>
          ) : (
            <div style={{ padding: "8px 0" }}>
              {stashes.map((stash) => {
                const isActive = actionIdx === stash.index;
                const isExpanded = expandedStashIdx === stash.index;
                return (
                  <div key={stash.index}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "12px 24px",
                      borderBottom: isExpanded ? "none" : "1px solid var(--overlay-soft)",
                      background: isExpanded ? "rgba(255,255,255,0.02)" : "transparent",
                    }}
                  >
                    {/* Index badge */}
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--color-text-muted)",
                        background: "var(--overlay-subtle)",
                        borderRadius: "8px",
                        padding: "2px 8px",
                        flexShrink: 0,
                        marginTop: "1px",
                        fontFamily:
                          '"Cascadia Code", "Fira Code", monospace',
                      }}
                    >
                      {stash.index}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "var(--color-text-primary)",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginBottom: "3px",
                        }}
                      >
                        {stash.message || "WIP on " + stash.branch}
                      </p>
                      <p style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                        {stash.branch} · {stash.date}
                      </p>
                    </div>

                    {/* Actions */}
                    {!isActive ? (
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        {/* View/hide diff toggle */}
                        <button
                          onClick={() => handleToggleDiff(stash.index)}
                          title={isExpanded ? "Hide diff" : "View diff"}
                          style={{
                            padding: "4px 10px",
                            fontSize: "11px",
                            fontWeight: 600,
                            color: isExpanded ? "#f59b00" : "#b3b3b3",
                            background: isExpanded ? "rgba(245,155,0,0.12)" : "var(--overlay-subtle)",
                            border: `1px solid ${isExpanded ? "rgba(245,155,0,0.3)" : "var(--overlay-light)"}`,
                            borderRadius: "8px",
                            cursor: "pointer",
                            transition: "all 120ms ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!isExpanded)
                              (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-medium)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded)
                              (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
                          }}
                        >
                          {isExpanded ? "▲ Hide" : "▼ Diff"}
                        </button>

                        {[
                          { label: "Apply", fn: () => handleApply(stash.index), color: "#1DB954" },
                          { label: "Pop", fn: () => handlePop(stash.index), color: "#3d9be9" },
                          { label: "Drop", fn: () => handleDrop(stash.index), color: "#e5534b" },
                        ].map(({ label, fn, color }) => (
                          <button
                            key={label}
                            onClick={fn}
                            style={{
                              padding: "4px 10px",
                              fontSize: "11px",
                              fontWeight: 600,
                              color,
                              background: `${color}18`,
                              border: `1px solid ${color}33`,
                              borderRadius: "8px",
                              cursor: "pointer",
                              transition: "all 120ms ease",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = `${color}30`;
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = `${color}18`;
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                          <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="3" />
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="#1DB954" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Working…
                      </div>
                    )}
                  </div>

                  {/* Inline diff panel */}
                  {isExpanded && (
                    <div
                      style={{
                        borderBottom: "1px solid var(--color-border-subtle)",
                        background: "var(--color-bg-card)",
                        maxHeight: "300px",
                        overflowY: "auto",
                      }}
                    >
                      {diffLoading || stashDiff ? (
                        <DiffViewer diff={stashDiff} loading={diffLoading} repoPath={repoPath} />
                      ) : (
                        <div style={{ padding: "16px 24px", color: "var(--color-text-disabled)", fontSize: "12px" }}>
                          No diff available
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: clear all */}
        {stashes.length > 0 && (
          <div
            style={{
              padding: "14px 24px",
              borderTop: "1px solid var(--color-border-subtle)",
              display: "flex",
              justifyContent: "flex-end",
              flexShrink: 0,
            }}
          >
            <button
              onClick={handleClearAll}
              style={{
                padding: "7px 16px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#e5534b",
                background: "rgba(229,83,75,0.08)",
                border: "1px solid rgba(229,83,75,0.25)",
                borderRadius: "20px",
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(229,83,75,0.18)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(229,83,75,0.08)";
              }}
            >
              Clear All Stashes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
