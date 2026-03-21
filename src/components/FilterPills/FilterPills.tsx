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
        gap: "4px",
        alignItems: "center",
        background: "var(--overlay-subtle)",
        borderRadius: "10px",
        padding: "3px",
      }}
    >
      {PILLS.map((pill) => {
        const isActive = activeFilter === pill.key;
        const count = getCount(pill);

        return (
          <button
            key={pill.key}
            onClick={() => setActiveFilter(pill.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 12px",
              borderRadius: "8px",
              border: "none",
              background: isActive
                ? "var(--color-accent)"
                : "transparent",
              color: isActive ? "#000" : "var(--color-text-secondary)",
              fontSize: "11px",
              fontWeight: isActive ? 700 : 500,
              cursor: "pointer",
              transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
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
                  "transparent";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }
            }}
          >
            <span>{pill.label}</span>
            {pill.key === "all" && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  minWidth: "15px",
                  height: "15px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                  background: isActive
                    ? "rgba(0,0,0,0.2)"
                    : "var(--overlay-medium)",
                  padding: "0 3px",
                }}
              >
                {totalRepos}
              </span>
            )}
            {count !== null && count > 0 && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  minWidth: "15px",
                  height: "15px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                  background: isActive
                    ? "rgba(0,0,0,0.2)"
                    : pill.key === "conflicts" || pill.key === "errors"
                    ? "var(--color-error-dim)"
                    : "var(--color-accent-dim)",
                  color: isActive
                    ? "#000"
                    : pill.key === "conflicts" || pill.key === "errors"
                    ? "var(--color-error)"
                    : "var(--color-accent)",
                  padding: "0 3px",
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
