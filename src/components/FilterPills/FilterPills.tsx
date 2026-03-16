import React, { useMemo } from "react";
import { useUIStore } from "../../store/uiStore";
import { useRepoStore } from "../../store/repoStore";
import type { SyncState } from "../../types";

interface PillDef {
  key: string;
  label: string;
  states?: SyncState[];
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

  const counts = useMemo(() => {
    const statusValues = Object.values(statuses);
    return {
      needs_push: statusValues.filter(
        (s) =>
          s.state === "NEEDS_PUSH" ||
          s.state === "DIVERGED"
      ).length,
      needs_pull: statusValues.filter(
        (s) => s.state === "NEEDS_PULL" || s.state === "DIVERGED"
      ).length,
      synced: statusValues.filter((s) => s.state === "SYNCED").length,
      conflicts: statusValues.filter((s) => s.state === "CONFLICT").length,
      errors: statusValues.filter(
        (s) => s.state === "ERROR" || s.state === "NOT_INIT"
      ).length,
    } as Record<string, number>;
  }, [statuses]);

  const getCount = (pill: PillDef): number | null => {
    if (pill.key === "all") return null;
    const c = counts[pill.key];
    return c !== undefined ? c : null;
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
                ? "1px solid var(--color-accent)"
                : "1px solid var(--color-border)",
              background: isActive
                ? "var(--color-accent)"
                : "var(--color-bg-elevated)",
              color: isActive ? "#000" : "var(--color-text-secondary)",
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
                  "var(--overlay-light)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--overlay-subtle)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
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
                    : "var(--overlay-medium)",
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
