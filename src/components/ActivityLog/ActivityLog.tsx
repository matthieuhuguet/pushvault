import React, { useState } from "react";
import { useActivityStore } from "../../store/activityStore";
import type { ActivityEntry } from "../../store/activityStore";

type Filter = "all" | "success" | "error";

export function ActivityLog() {
  const entries = useActivityStore((s) => s.entries);
  const clearEntries = useActivityStore((s) => s.clearEntries);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = entries.filter((e) => {
    if (filter === "success") return e.success;
    if (filter === "error") return !e.success;
    return true;
  });

  const handleExport = () => {
    const lines = entries.map(
      (e) =>
        `[${e.timestamp}] [${e.success ? "OK" : "ERR"}] ${e.repoName} — ${e.operation}: ${e.message}`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pushvault-activity-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterBtn = (label: string, value: Filter) => (
    <button
      onClick={() => setFilter(value)}
      style={{
        background: filter === value ? "rgba(255,255,255,0.12)" : "none",
        border: "none",
        borderRadius: "20px",
        padding: "5px 14px",
        color: filter === value ? "#fff" : "#b3b3b3",
        fontSize: "13px",
        fontWeight: filter === value ? 700 : 400,
        cursor: "pointer",
        transition: "background 150ms ease, color 150ms ease",
      }}
    >
      {label}
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
      }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700 }}>
            Activity Log
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#b3b3b3" }}>
            {entries.length} total {entries.length === 1 ? "entry" : "entries"}
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {/* Filter pills */}
          <div style={{
            display: "flex",
            background: "#282828",
            borderRadius: "24px",
            padding: "3px",
            gap: "2px",
          }}>
            {filterBtn("All", "all")}
            {filterBtn("Success", "success")}
            {filterBtn("Error", "error")}
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={entries.length === 0}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              padding: "7px 14px",
              color: entries.length === 0 ? "#535353" : "#b3b3b3",
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
                : "rgba(229,83,75,0.12)",
              border: "1px solid rgba(229,83,75,0.3)",
              borderRadius: "6px",
              padding: "7px 14px",
              color: entries.length === 0 ? "#535353" : "#e5534b",
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
          color: "#535353",
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="#b3b3b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: 0 }}>
            {filter === "all" ? "No activity yet" : `No ${filter} entries`}
          </p>
          <p style={{ fontSize: "13px", margin: 0 }}>
            {filter === "all"
              ? "Operations like push, pull, and sync will appear here."
              : `Switch to "All" to see all entries.`}
          </p>
        </div>
      )}

      {/* Entry list */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
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

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "14px",
        padding: "12px 16px",
        borderRadius: "8px",
        background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
        transition: "background 120ms ease",
      }}
    >
      {/* Status indicator */}
      <div style={{
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: entry.success ? "#1DB954" : "#e5534b",
        marginTop: "5px",
        flexShrink: 0,
        boxShadow: entry.success
          ? "0 0 6px rgba(29,185,84,0.5)"
          : "0 0 6px rgba(229,83,75,0.5)",
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "4px",
        }}>
          <span style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#fff",
          }}>
            {entry.repoName}
          </span>
          <span style={{
            fontSize: "11px",
            background: "rgba(255,255,255,0.08)",
            color: "#b3b3b3",
            padding: "2px 8px",
            borderRadius: "10px",
          }}>
            {entry.operation}
          </span>
          <span style={{
            fontSize: "11px",
            fontWeight: 600,
            color: entry.success ? "#1DB954" : "#e5534b",
          }}>
            {entry.success ? "Success" : "Failed"}
          </span>
        </div>
        <p style={{
          margin: 0,
          fontSize: "12px",
          color: "#b3b3b3",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {entry.message}
        </p>
      </div>

      {/* Timestamp */}
      <span style={{
        fontSize: "11px",
        color: "#535353",
        flexShrink: 0,
        marginTop: "2px",
      }}>
        {entry.timestamp}
      </span>
    </div>
  );
}
