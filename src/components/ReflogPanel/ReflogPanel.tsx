import React, { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";
import type { ReflogEntry } from "../../types";

interface ReflogPanelProps {
  repoPath: string;
  onCheckout?: (hash: string) => void;
  onClose: () => void;
}

function actionColor(action: string): string {
  switch (action.toLowerCase()) {
    case "commit": return "var(--color-success)";
    case "commit (amend)": return "var(--color-success)";
    case "commit (merge)": return "var(--color-info)";
    case "merge": return "var(--color-info)";
    case "checkout": return "var(--color-accent)";
    case "pull": return "var(--color-info)";
    case "push": return "var(--color-success)";
    case "rebase": return "var(--color-warning)";
    case "rebase (finish)": return "var(--color-warning)";
    case "rebase (pick)": return "var(--color-warning)";
    case "reset": return "var(--color-error)";
    case "cherry-pick": return "#a855f7";
    default: return "var(--color-text-secondary)";
  }
}

function actionIcon(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("commit")) return "\u25CF";
  if (a.includes("merge")) return "\u25C8";
  if (a.includes("checkout")) return "\u2192";
  if (a.includes("pull")) return "\u2193";
  if (a.includes("push")) return "\u2191";
  if (a.includes("rebase")) return "\u21BB";
  if (a.includes("reset")) return "\u21A9";
  if (a.includes("cherry")) return "\u2726";
  return "\u25CB";
}

export function ReflogPanel({ repoPath, onCheckout, onClose }: ReflogPanelProps) {
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const addToast = useToastStore((s) => s.add);

  useEffect(() => {
    setLoading(true);
    ipc.gitReflog(repoPath, 200)
      .then(setEntries)
      .catch((e) => addToast("error", `Reflog failed: ${e}`))
      .finally(() => setLoading(false));
  }, [repoPath]);

  const filtered = filter
    ? entries.filter((e) => {
        const q = filter.toLowerCase();
        return (
          e.action.toLowerCase().includes(q) ||
          e.message.toLowerCase().includes(q) ||
          e.short_hash.includes(q)
        );
      })
    : entries;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
        background: "var(--color-bg-elevated)", borderBottom: "1px solid var(--color-border-subtle)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent)" }}>
          Reflog
        </span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter entries..."
          style={{
            flex: 1, background: "var(--color-bg-highlight)", border: "1px solid var(--color-border)",
            borderRadius: 6, padding: "4px 10px", color: "var(--color-text-primary)", fontSize: 12,
            outline: "none",
          }}
        />
        <span style={{ fontSize: 10, color: "var(--color-text-disabled)" }}>
          {filtered.length} / {entries.length}
        </span>
        <button
          onClick={onClose}
          title="Close reflog"
          style={{
            padding: "3px 10px", fontSize: 10, fontWeight: 700, borderRadius: 8,
            background: "var(--overlay-subtle)", border: "1px solid var(--overlay-light)",
            color: "var(--color-text-secondary)", cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--color-text-muted)", fontSize: 13,
        }}>
          Loading reflog...
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {filtered.map((entry) => (
            <div
              key={`${entry.index}-${entry.hash}`}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 16px",
                borderBottom: "1px solid var(--overlay-subtle)",
                transition: "background 60ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-subtle)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              {/* Timeline icon */}
              <span style={{
                fontSize: 14, color: actionColor(entry.action), flexShrink: 0,
                width: 18, textAlign: "center",
              }}>
                {actionIcon(entry.action)}
              </span>

              {/* Index */}
              <span style={{
                fontSize: 10, color: "var(--color-text-disabled)", width: 30,
                textAlign: "right", flexShrink: 0, fontFamily: "monospace",
              }}>
                @{`{${entry.index}}`}
              </span>

              {/* Hash */}
              <span
                title={entry.hash}
                style={{
                  fontSize: 11, fontFamily: "monospace", fontWeight: 600,
                  color: "var(--color-accent)", flexShrink: 0, cursor: "pointer",
                }}
                onClick={() => {
                  navigator.clipboard.writeText(entry.hash);
                  addToast("info", `Copied ${entry.short_hash}`);
                }}
              >
                {entry.short_hash}
              </span>

              {/* Action badge */}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
                background: actionColor(entry.action) + "22",
                color: actionColor(entry.action),
                flexShrink: 0, whiteSpace: "nowrap",
              }}>
                {entry.action}
              </span>

              {/* Message */}
              <span style={{
                fontSize: 12, color: "var(--color-text-primary)", flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entry.message}
              </span>

              {/* Date */}
              <span style={{
                fontSize: 10, color: "var(--color-text-disabled)", flexShrink: 0,
                whiteSpace: "nowrap",
              }}>
                {entry.date}
              </span>

              {/* Checkout button */}
              {onCheckout && (
                <button
                  title={`Reset to ${entry.short_hash}`}
                  onClick={() => onCheckout(entry.hash)}
                  style={{
                    padding: "2px 8px", fontSize: 9, fontWeight: 700, borderRadius: 6,
                    background: "var(--color-warning-dim)", border: "1px solid var(--color-warning-border)",
                    color: "var(--color-warning)", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{
              padding: 24, textAlign: "center", color: "var(--color-text-disabled)", fontSize: 12,
            }}>
              {filter ? "No matching entries" : "Reflog is empty"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
