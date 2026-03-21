import React, { useEffect, useState } from "react";
import { useActivityStore } from "../../store/activityStore";
import type { ActivityEntry } from "../../store/activityStore";
import { relativeTime } from "../../lib/time";

type Filter = "all" | "success" | "error" | "destructive";

export function ActivityLog() {
  const entries = useActivityStore((s) => s.entries);
  const clearEntries = useActivityStore((s) => s.clearEntries);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = entries.filter((e) => {
    if (filter === "success")     return e.success;
    if (filter === "error")       return !e.success;
    if (filter === "destructive") return e.isDestructive;
    return true;
  });

  const destructiveCount = entries.filter((e) => e.isDestructive).length;
  const errorCount = entries.filter((e) => !e.success).length;

  const handleExport = () => {
    const lines = entries.map(
      (e) =>
        `[${e.timestamp}] [${e.success ? "OK" : "ERR"}]${e.isDestructive ? " [DESTRUCTIVE]" : ""} ${e.repoName} — ${e.operation}: ${e.message}`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pushvault-activity-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterBtn = (label: string, value: Filter, badgeCount?: number, badgeColor?: string) => (
    <button
      onClick={() => setFilter(value)}
      style={{
        background: filter === value ? "var(--overlay-medium)" : "none",
        border: "none",
        borderRadius: "20px",
        padding: "5px 14px",
        color: filter === value ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        fontSize: "13px",
        fontWeight: filter === value ? 700 : 400,
        cursor: "pointer",
        transition: "background 150ms ease, color 150ms ease",
        display: "flex",
        alignItems: "center",
        gap: "5px",
      }}
    >
      {label}
      {badgeCount !== undefined && badgeCount > 0 && (
        <span style={{
          fontSize: "10px",
          fontWeight: 700,
          padding: "1px 5px",
          borderRadius: "8px",
          background: badgeColor ? `${badgeColor}22` : "var(--overlay-strong)",
          color: badgeColor ?? "var(--color-text-secondary)",
        }}>
          {badgeCount}
        </span>
      )}
    </button>
  );

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "20px",
        gap: "12px",
        flexWrap: "wrap",
      }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700 }}>
            Activity Log
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-secondary)" }}>
            {entries.length} total {entries.length === 1 ? "entry" : "entries"}
            {destructiveCount > 0 && (
              <span style={{ color: "var(--color-warning)", marginLeft: "8px" }}>
                · {destructiveCount} destructive
              </span>
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Filter pills */}
          <div style={{
            display: "flex",
            background: "var(--color-bg-elevated)",
            borderRadius: "24px",
            padding: "3px",
            gap: "2px",
          }}>
            {filterBtn("All", "all")}
            {filterBtn("Success", "success")}
            {filterBtn("Error", "error", errorCount, "var(--color-error)")}
            {filterBtn("Destructive", "destructive", destructiveCount, "var(--color-warning)")}
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={entries.length === 0}
            style={{
              background: "var(--overlay-light)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              padding: "7px 14px",
              color: entries.length === 0 ? "var(--color-text-disabled)" : "var(--color-text-secondary)",
              fontSize: "13px",
              cursor: entries.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Export
          </button>

          {/* Clear */}
          <button
            onClick={clearEntries}
            disabled={entries.length === 0}
            style={{
              background: entries.length === 0
                ? "rgba(229,83,75,0.05)"
                : "var(--color-error-dim)",
              border: "1px solid var(--color-error-border)",
              borderRadius: "6px",
              padding: "7px 14px",
              color: entries.length === 0 ? "var(--color-text-disabled)" : "var(--color-error)",
              fontSize: "13px",
              cursor: entries.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "80px",
          gap: "16px",
          color: "var(--color-text-disabled)",
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
            {filter === "all" ? "No activity yet" : `No ${filter} entries`}
          </p>
          <p style={{ fontSize: "13px", margin: 0 }}>
            {filter === "all"
              ? "Push, pull, commit, and other operations will appear here."
              : `Switch to "All" to see all entries.`}
          </p>
        </div>
      )}

      {/* Entry list */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {filtered.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const [hovered, setHovered] = useState(false);
  const [, setTick] = useState(0);

  // Refresh relative time every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const dotColor = entry.success ? "var(--color-success)" : "var(--color-error)";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "14px",
        padding: "11px 16px",
        borderRadius: "8px",
        background: hovered
          ? entry.isDestructive
            ? "rgba(245,155,0,0.06)"
            : "var(--overlay-soft)"
          : entry.isDestructive
          ? "rgba(245,155,0,0.025)"
          : "transparent",
        border: entry.isDestructive ? "1px solid rgba(245,155,0,0.1)" : "1px solid transparent",
        transition: "background 120ms ease",
      }}
    >
      {/* Status indicator */}
      {entry.isDestructive ? (
        <span style={{
          fontSize: "12px",
          marginTop: "2px",
          flexShrink: 0,
          filter: "drop-shadow(0 0 3px rgba(245,155,0,0.7))",
        }}>
          ⚠
        </span>
      ) : (
        <div style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: dotColor,
          marginTop: "5px",
          flexShrink: 0,
          boxShadow: entry.success
            ? "0 0 6px var(--color-success-dim)"
            : "0 0 6px var(--color-error-dim)",
        }} />
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          flexWrap: "wrap",
          marginBottom: "3px",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)" }}>
            {entry.repoName}
          </span>
          <span style={{
            fontSize: "11px",
            background: entry.isDestructive ? "rgba(245,155,0,0.1)" : "var(--overlay-light)",
            color: entry.isDestructive ? "var(--color-warning)" : "var(--color-text-secondary)",
            padding: "2px 8px",
            borderRadius: "10px",
          }}>
            {entry.operation}
          </span>
          {entry.isDestructive && (
            <span style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "var(--color-warning)",
              background: "var(--color-warning-dim)",
              padding: "1px 6px",
              borderRadius: "8px",
              letterSpacing: "0.04em",
            }}>
              DESTRUCTIVE
            </span>
          )}
          <span style={{
            fontSize: "11px",
            fontWeight: 600,
            color: entry.success ? "var(--color-success)" : "var(--color-error)",
          }}>
            {entry.success ? "✓" : "✕"}
          </span>
        </div>
        <p style={{
          margin: 0,
          fontSize: "12px",
          color: "var(--color-text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {entry.message}
        </p>
      </div>

      {/* Timestamp */}
      <span
        title={entry.timestamp}
        style={{
          fontSize: "11px",
          color: "var(--color-text-disabled)",
          flexShrink: 0,
          marginTop: "2px",
          cursor: "default",
          whiteSpace: "nowrap",
        }}
      >
        {relativeTime(entry.epochMs)}
      </span>
    </div>
  );
}
