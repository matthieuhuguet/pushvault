import React from "react";
import { useUIStore } from "../../store/uiStore";
import { useRepoStore } from "../../store/repoStore";
import type { SyncState } from "../../types";

interface PillDef {
  key: string;
  label: string;
  states?: SyncState[];
  countFn?: (counts: Record<string, number>) => number;
}

const PILLS: PillDef[] = [
  { key: "all",          label: "All" },
  { key: "needs_push",   label: "Needs Push",  states: ["NEEDS_PUSH", "DIVERGED"] },
  { key: "needs_pull",   label: "Needs Pull",  states: ["NEEDS_PULL", "DIVERGED"] },
  { key: "synced",       label: "Synced",      states: ["SYNCED"] },
  { key: "conflicts",    label: "Conflicts",   states: ["CONFLICT"] },
  { key: "errors",       label: "Errors",      states: ["ERROR", "NOT_INIT"] },
];

export function FilterPills() {
  const { activeFilter, setActiveFilter } = useUIStore();
  const statuses = useRepoStore((s) => s.statuses);
  const config = useRepoStore((s) => s.config);

  const totalRepos = config?.repos.length ?? 0;

  const getCount = (pill: PillDef): number | null => {
    if (pill.key === "all") return null;
    if (!pill.states) return null;
    return Object.values(statuses).filter((s) =>
      pill.states!.includes(s.state)
    ).length;
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {PILLS.map((pill) => {
        const isActive = activeFilter === pill.key;
        const count = getCount(pill);
        const hasNonZero = count !== null && count > 0;

        return (
          <button
            key={pill.key}
            onClick={() => setActiveFilter(pill.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 14px",
              borderRadius: "20px",
              border: isActive
                ? "1px solid #1DB954"
                : "1px solid rgba(255,255,255,0.12)",
              background: isActive
                ? "#1DB954"
                : "rgba(255,255,255,0.06)",
              color: isActive ? "#000" : "#b3b3b3",
              fontSize: "12px",
              fontWeight: isActive ? 700 : 500,
              cursor: "pointer",
              transition: "all 150ms ease",
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.1)";
                (e.currentTarget as HTMLButtonElement).style.color = "#fff";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
              }
            }}
          >
            <span>{pill.label}</span>
            {pill.key === "all" && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  minWidth: "16px",
                  height: "16px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px",
                  background: isActive
                    ? "rgba(0,0,0,0.2)"
                    : "rgba(255,255,255,0.12)",
                  padding: "0 4px",
                }}
              >
                {totalRepos}
              </span>
            )}
            {count !== null && count > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  minWidth: "16px",
                  height: "16px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px",
                  background: isActive
                    ? "rgba(0,0,0,0.2)"
                    : pill.key === "conflicts" || pill.key === "errors"
                    ? "rgba(229,83,75,0.3)"
                    : "rgba(29,185,84,0.2)",
                  color: isActive
                    ? "#000"
                    : pill.key === "conflicts" || pill.key === "errors"
                    ? "#e5534b"
                    : "#1DB954",
                  padding: "0 4px",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
