import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { useGroupStore, type RepoGroup } from "../../store/groupStore";
import { RepoCard, RepoCardSkeleton, RepoContextMenu } from "../Card/RepoCard";
import { FilterPills } from "../FilterPills/FilterPills";
import { CloneDialog } from "../Clone/CloneDialog";
import { QuickActions } from "../QuickActions/QuickActions";
import { computeHealth } from "../../lib/healthScore";
import type { RepoConfig, SyncState } from "../../types";

const FILTER_STATES: Record<string, SyncState[]> = {
  needs_push:  ["NEEDS_PUSH", "DIVERGED"],
  needs_pull:  ["NEEDS_PULL", "DIVERGED"],
  synced:      ["SYNCED"],
  conflicts:   ["CONFLICT"],
  errors:      ["ERROR", "NOT_INIT"],
};

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "360px",
        textAlign: "center",
        gap: "20px",
      }}
    >
      {/* Illustration */}
      <div
        style={{
          width: "96px",
          height: "96px",
          borderRadius: "50%",
          background: "var(--color-success-dim)",
          border: "2px dashed var(--color-success-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="var(--color-success)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div>
        <h2
          style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "8px" }}
        >
          No repositories yet
        </h2>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", maxWidth: "320px" }}>
          Add a local Git repository or clone one from a remote URL to get started.
        </p>
      </div>

      <button
        onClick={onAdd}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 28px",
          background: "var(--color-accent)",
          color: "#000",
          border: "none",
          borderRadius: "24px",
          fontSize: "14px",
          fontWeight: 700,
          cursor: "pointer",
          transition: "all 150ms ease",
          boxShadow: "0 4px 16px var(--color-success-border)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent-hover)";
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.03)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent)";
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        Add Repository
      </button>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "280px",
        textAlign: "center",
        gap: "12px",
      }}
    >
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
        <circle cx="11" cy="11" r="8" stroke="var(--color-text-secondary)" strokeWidth="2" />
        <path d="m21 21-4.35-4.35" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)" }}>
        No results for "{query}"
      </p>
      <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
        Try a different name or filter.
      </p>
    </div>
  );
}

/* ── Group Section Header ───────────────────────────────────── */
function GroupHeader({ name, color, count, collapsed, onToggle, onRemove }: {
  name: string; color: string; count: number; collapsed: boolean;
  onToggle: () => void; onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 4px",
        cursor: "pointer",
        userSelect: "none",
        marginTop: "8px",
        marginBottom: collapsed ? "0" : "8px",
      }}
    >
      <svg
        width="10" height="10" viewBox="0 0 10 10" fill="none"
        style={{
          transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
          transition: "transform 150ms ease",
          color: "var(--color-text-muted)",
          flexShrink: 0,
        }}
      >
        <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ width: "8px", height: "8px", borderRadius: "3px", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "0.03em" }}>
        {name}
      </span>
      <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
        {count}
      </span>
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "var(--color-text-disabled)",
            cursor: "pointer",
            fontSize: "12px",
            padding: "2px 6px",
            borderRadius: "4px",
            transition: "color 120ms ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-disabled)"; }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function Dashboard() {
  const config = useRepoStore((s) => s.config);
  const statuses = useRepoStore((s) => s.statuses);
  const loading = useRepoStore((s) => s.loading);
  const reorderRepos = useRepoStore((s) => s.reorderRepos);
  const { searchQuery, activeFilter, setActiveFilter, setActivePanel, setSelectedRepoPath } = useUIStore();
  const { groups, assignments, addGroup, removeGroup, toggleCollapsed, assignRepo } = useGroupStore();
  const [showClone, setShowClone] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [viewMode, setViewModeState] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem("pushvault-view-mode");
    return saved === "list" ? "list" : "grid";
  });
  const setViewMode = (mode: "grid" | "list") => {
    setViewModeState(mode);
    localStorage.setItem("pushvault-view-mode", mode);
  };

  // Drag-and-drop state
  const draggedPath = useRef<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  // Context menu for list view
  const [listContextMenu, setListContextMenu] = useState<{
    x: number; y: number; path: string; name: string; conflicts: number;
  } | null>(null);

  // Keyboard navigation
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const repos = config?.repos ?? [];

  const filteredRepos = useMemo(() => {
    let result = repos;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.path.toLowerCase().includes(q)
      );
    }

    // State filter
    if (activeFilter !== "all") {
      const states = FILTER_STATES[activeFilter];
      if (states) {
        result = result.filter((r) => {
          const s = statuses[r.path];
          return s ? states.includes(s.state) : false;
        });
      }
    }

    return result;
  }, [repos, searchQuery, activeFilter, statuses]);

  const focusedRepoPath = focusedIdx >= 0 && focusedIdx < filteredRepos.length
    ? filteredRepos[focusedIdx].path
    : null;

  // Summary stats
  const stats = useMemo(() => {
    let withChanges = 0, needsPush = 0, errors = 0;
    for (const r of repos) {
      const s = statuses[r.path];
      if (!s) continue;
      if ((s.staged + s.modified + s.untracked) > 0) withChanges++;
      if (s.state === "NEEDS_PUSH" || s.state === "DIVERGED") needsPush++;
      if (s.state === "ERROR" || s.state === "CONFLICT") errors++;
    }
    return { withChanges, needsPush, errors };
  }, [repos, statuses]);

  // Group repos by their group assignments
  const groupedRepos = useMemo(() => {
    const sections: { group: RepoGroup | null; repos: RepoConfig[] }[] = [];

    if (groups.length === 0) {
      // No groups defined — just show all repos flat
      return [{ group: null, repos: filteredRepos }];
    }

    // Build a map: groupId → repos
    const byGroup = new Map<string, RepoConfig[]>();
    const ungrouped: RepoConfig[] = [];

    for (const repo of filteredRepos) {
      const gid = assignments[repo.path];
      if (gid && groups.some((g) => g.id === gid)) {
        if (!byGroup.has(gid)) byGroup.set(gid, []);
        byGroup.get(gid)!.push(repo);
      } else {
        ungrouped.push(repo);
      }
    }

    // Add groups in order (even if empty — skip empty in render)
    for (const g of groups) {
      const repos = byGroup.get(g.id) ?? [];
      if (repos.length > 0) {
        sections.push({ group: g, repos });
      }
    }

    // Add ungrouped repos at the end
    if (ungrouped.length > 0) {
      sections.push({ group: null, repos: ungrouped });
    }

    return sections;
  }, [filteredRepos, groups, assignments]);

  // Drag-and-drop handlers (only when no search/filter is active)
  const canDrag = !searchQuery.trim() && activeFilter === "all";

  const handleDragStart = (repoPath: string) => {
    draggedPath.current = repoPath;
  };

  const handleDragOver = (e: React.DragEvent, repoPath: string) => {
    e.preventDefault();
    if (draggedPath.current && draggedPath.current !== repoPath) {
      setDragOverPath(repoPath);
    }
  };

  const handleDrop = (targetPath: string) => {
    const from = draggedPath.current;
    if (!from || from === targetPath) { setDragOverPath(null); return; }
    const allRepos = config?.repos ?? [];
    const fromIdx = allRepos.findIndex((r) => r.path === from);
    const toIdx = allRepos.findIndex((r) => r.path === targetPath);
    if (fromIdx >= 0 && toIdx >= 0) reorderRepos(fromIdx, toIdx);
    draggedPath.current = null;
    setDragOverPath(null);
  };

  const handleDragEnd = () => {
    draggedPath.current = null;
    setDragOverPath(null);
  };

  // Keyboard navigation: j/k, Enter, g+h, g+s
  const handleDashboardKey = useCallback(
    (e: KeyboardEvent) => {
      // Skip if an input is focused
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((prev) => Math.min(prev + 1, filteredRepos.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusedIdx >= 0 && focusedIdx < filteredRepos.length) {
        e.preventDefault();
        const repo = filteredRepos[focusedIdx];
        setSelectedRepoPath(repo.path);
        setActivePanel("staging");
      } else if (e.key === "g") {
        // g+g to go to top
        setFocusedIdx(0);
      } else if (e.key === "G" && e.shiftKey) {
        // Shift+G to go to bottom
        setFocusedIdx(filteredRepos.length - 1);
      }
    },
    [filteredRepos, focusedIdx, setActivePanel, setSelectedRepoPath]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleDashboardKey);
    return () => window.removeEventListener("keydown", handleDashboardKey);
  }, [handleDashboardKey]);

  // Reset focus when filter changes
  useEffect(() => {
    setFocusedIdx(-1);
  }, [searchQuery, activeFilter]);

  // Loading skeleton
  if (loading && repos.length === 0) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
          }}
        >
          <div className="skeleton" style={{ height: "20px", width: "120px" }} />
          <div style={{ display: "flex", gap: "8px" }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: "28px", width: "80px", borderRadius: "14px" }}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <RepoCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "0" }}>
      {/* Top bar: title + pills + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h2
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.3px",
              flexShrink: 0,
            }}
          >
            Your Repositories
          </h2>
          {repos.length > 0 && (
            <span
              style={{
                fontSize: "13px",
                color: "var(--color-text-muted)",
                background: "var(--overlay-subtle)",
                padding: "2px 10px",
                borderRadius: "12px",
              }}
            >
              {filteredRepos.length}
              {filteredRepos.length !== repos.length
                ? ` / ${repos.length}`
                : ""}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {repos.length > 0 && <FilterPills />}
          {/* View mode toggle */}
          {repos.length > 0 && (
            <div
              style={{
                display: "flex",
                background: "var(--overlay-subtle)",
                borderRadius: "10px",
                padding: "2px",
              }}
            >
              {(["grid", "list"] as const).map((mode) => (
                <button
                  key={mode}
                  title={mode === "grid" ? "Grid view" : "List view"}
                  onClick={() => setViewMode(mode)}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    background: viewMode === mode ? "var(--overlay-medium)" : "transparent",
                    border: "none",
                    color: viewMode === mode ? "var(--color-text-primary)" : "var(--color-text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 120ms ease",
                  }}
                >
                  {mode === "grid" ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <rect x="0" y="0" width="5" height="5" rx="1" />
                      <rect x="7" y="0" width="5" height="5" rx="1" />
                      <rect x="0" y="7" width="5" height="5" rx="1" />
                      <rect x="7" y="7" width="5" height="5" rx="1" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <rect x="0" y="0" width="12" height="2.5" rx="1" />
                      <rect x="0" y="4.75" width="12" height="2.5" rx="1" />
                      <rect x="0" y="9.5" width="12" height="2.5" rx="1" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowClone(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 16px",
              background: "var(--color-success-dim)",
              color: "var(--color-accent)",
              border: "1px solid var(--color-success-border)",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 150ms ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--color-accent-dim)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--color-success-dim)";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Add Repo
          </button>
          {repos.length > 0 && (
            <button
              onClick={() => setShowNewGroup(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                background: "var(--overlay-subtle)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 150ms ease",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              Group
            </button>
          )}
        </div>
      </div>

      {/* New group inline input */}
      {showNewGroup && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "12px",
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            placeholder="Group name…"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newGroupName.trim()) {
                addGroup(newGroupName.trim());
                setNewGroupName("");
                setShowNewGroup(false);
              }
              if (e.key === "Escape") {
                setNewGroupName("");
                setShowNewGroup(false);
              }
            }}
            autoFocus
            style={{
              flex: "0 0 200px",
              padding: "6px 12px",
              background: "var(--overlay-subtle)",
              border: "1px solid var(--color-accent-border)",
              borderRadius: "8px",
              color: "var(--color-text-primary)",
              fontSize: "12px",
              outline: "none",
            }}
          />
          <button
            onClick={() => {
              if (newGroupName.trim()) {
                addGroup(newGroupName.trim());
                setNewGroupName("");
                setShowNewGroup(false);
              }
            }}
            disabled={!newGroupName.trim()}
            style={{
              padding: "6px 14px",
              background: newGroupName.trim() ? "var(--color-accent)" : "var(--color-btn-disabled-bg)",
              border: "none",
              borderRadius: "8px",
              color: newGroupName.trim() ? "#000" : "var(--color-btn-disabled-text)",
              fontSize: "12px",
              fontWeight: 700,
              cursor: newGroupName.trim() ? "pointer" : "not-allowed",
            }}
          >
            Create
          </button>
          <button
            onClick={() => { setNewGroupName(""); setShowNewGroup(false); }}
            style={{
              padding: "6px 10px",
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Stats summary bar */}
      {repos.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "16px",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {([
            { label: "Total", value: repos.length, color: "var(--color-text-secondary)", bg: "var(--overlay-subtle)", borderColor: "var(--overlay-light)", filter: "all" },
            stats.withChanges > 0 && { label: "With changes", value: stats.withChanges, color: "var(--color-info)", bg: "var(--color-info-dim)", borderColor: "var(--color-info-border)", filter: "needs_push" },
            stats.needsPush > 0 && { label: "Needs push", value: stats.needsPush, color: "var(--color-success)", bg: "var(--color-success-dim)", borderColor: "var(--color-success-border)", filter: "needs_push" },
            stats.errors > 0 && { label: "Issues", value: stats.errors, color: "var(--color-error)", bg: "var(--color-error-dim)", borderColor: "var(--color-error-border)", filter: "errors" },
          ] as (false | { label: string; value: number; color: string; bg: string; borderColor: string; filter: string })[])
            .filter(Boolean)
            .map((stat) => {
              const s = stat as { label: string; value: number; color: string; bg: string; borderColor: string; filter: string };
              const isActive = activeFilter === s.filter && s.filter !== "all";
              return (
                <div
                  key={s.label}
                  onClick={() => setActiveFilter(activeFilter === s.filter ? "all" : s.filter)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 12px",
                    background: isActive ? s.color : s.bg,
                    border: `1px solid ${isActive ? s.color : s.borderColor}`,
                    borderRadius: "16px",
                    fontSize: "11px",
                    color: isActive ? "#000" : s.color,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 150ms ease",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 700 }}>{s.value}</span>
                  <span style={{ opacity: 0.75 }}>{s.label}</span>
                </div>
              );
            })}
        </div>
      )}

      {/* Quick Actions */}
      {repos.length > 0 && (
        <QuickActions
          onClone={() => setShowClone(true)}
          onScan={() => setActivePanel("scan")}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {repos.length === 0 ? (
          <EmptyState onAdd={() => setShowClone(true)} />
        ) : filteredRepos.length === 0 ? (
          <NoResults query={searchQuery || activeFilter} />
        ) : viewMode === "grid" ? (
          <div style={{ paddingBottom: "24px" }}>
            {groupedRepos.map((section) => {
              const g = section.group;
              return (
                <div key={g?.id ?? "__ungrouped"}>
                  {g && (
                    <GroupHeader
                      name={g.name}
                      color={g.color}
                      count={section.repos.length}
                      collapsed={g.collapsed}
                      onToggle={() => toggleCollapsed(g.id)}
                      onRemove={() => removeGroup(g.id)}
                    />
                  )}
                  {/* Show "Ungrouped" label only when there are actual groups */}
                  {!g && groups.length > 0 && (
                    <div style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      padding: "8px 4px",
                      marginTop: "8px",
                    }}>
                      Ungrouped
                    </div>
                  )}
                  {!(g?.collapsed) && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "16px",
                        marginBottom: "8px",
                      }}
                    >
                      {section.repos.map((repo, idx) => {
                        const isFocused = focusedRepoPath === repo.path;
                        return (
                          <div
                            key={repo.path}
                            className="card-enter"
                            draggable={canDrag}
                            onDragStart={() => handleDragStart(repo.path)}
                            onDragOver={(e) => handleDragOver(e, repo.path)}
                            onDrop={() => handleDrop(repo.path)}
                            onDragEnd={handleDragEnd}
                            style={{
                              animationDelay: `${Math.min(idx * 40, 240)}ms`,
                              outline: isFocused
                                ? "2px solid var(--color-accent)"
                                : dragOverPath === repo.path
                                  ? "2px dashed var(--color-accent-border)"
                                  : undefined,
                              outlineOffset: "2px",
                              borderRadius: "13px",
                              opacity: draggedPath.current === repo.path ? 0.5 : 1,
                              transition: "opacity 150ms ease, outline 100ms ease",
                              cursor: canDrag ? "grab" : undefined,
                            }}
                          >
                            <RepoCard
                              repo={repo}
                              status={statuses[repo.path]}
                              index={idx}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* List view */
          <div style={{ paddingBottom: "24px" }}>
            {groupedRepos.map((section) => {
              const g = section.group;
              return (
                <div key={g?.id ?? "__ungrouped"}>
                  {g && (
                    <GroupHeader
                      name={g.name}
                      color={g.color}
                      count={section.repos.length}
                      collapsed={g.collapsed}
                      onToggle={() => toggleCollapsed(g.id)}
                      onRemove={() => removeGroup(g.id)}
                    />
                  )}
                  {!g && groups.length > 0 && (
                    <div style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      padding: "8px 4px",
                      marginTop: "8px",
                    }}>
                      Ungrouped
                    </div>
                  )}
                  {!(g?.collapsed) && section.repos.map((repo, idx) => {
                    const status = statuses[repo.path];
                    const isFocusedRow = focusedRepoPath === repo.path;
                    const stateColor: Record<string, string> = {
                      SYNCED: "var(--color-success)", NEEDS_PUSH: "var(--color-info)", NEEDS_PULL: "var(--color-warning)",
                      DIVERGED: "var(--color-conflict)", CONFLICT: "var(--color-error)", ERROR: "var(--color-error)", NOT_INIT: "var(--color-text-disabled)",
                    };
                    const stateDimColor: Record<string, string> = {
                      SYNCED: "var(--color-success-dim)", NEEDS_PUSH: "var(--color-info-dim)", NEEDS_PULL: "var(--color-warning-dim)",
                      DIVERGED: "var(--color-warning-dim)", CONFLICT: "var(--color-error-dim)", ERROR: "var(--color-error-dim)", NOT_INIT: "var(--overlay-subtle)",
                    };
                    const color = stateColor[status?.state ?? ""] ?? "var(--color-text-disabled)";
                    const dimColor = stateDimColor[status?.state ?? ""] ?? "var(--overlay-subtle)";
                    return (
                      <div
                        key={repo.path}
                        className="list-row-enter"
                        draggable={canDrag}
                        onDragStart={() => handleDragStart(repo.path)}
                        onDragOver={(e) => handleDragOver(e, repo.path)}
                        onDrop={() => handleDrop(repo.path)}
                        onDragEnd={handleDragEnd}
                        onClick={() => { setSelectedRepoPath(repo.path); setActivePanel("staging"); }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setListContextMenu({ x: e.clientX, y: e.clientY, path: repo.path, name: repo.name, conflicts: statuses[repo.path]?.conflicts ?? 0 });
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "background 120ms ease",
                          marginBottom: "2px",
                          animationDelay: `${Math.min(idx * 30, 200)}ms`,
                          background: isFocusedRow ? "var(--color-accent-dim)" : undefined,
                          outline: isFocusedRow
                            ? "1px solid var(--color-accent-border)"
                            : dragOverPath === repo.path
                              ? "2px dashed var(--color-accent-border)"
                              : undefined,
                          outlineOffset: "2px",
                          opacity: draggedPath.current === repo.path ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-soft)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      >
                        {/* Color dot */}
                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: repo.color, flexShrink: 0 }} />
                        {/* Name + path */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {repo.name}
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {repo.path}
                          </div>
                        </div>
                        {/* Branch */}
                        {status?.current_branch && (
                          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace", flexShrink: 0 }}>
                            {status.current_branch}
                          </span>
                        )}
                        {/* Ahead/behind */}
                        {(status?.ahead ?? 0) > 0 && (
                          <span style={{ fontSize: "11px", color: "var(--color-info)", fontWeight: 700, flexShrink: 0 }}>↑{status!.ahead}</span>
                        )}
                        {(status?.behind ?? 0) > 0 && (
                          <span style={{ fontSize: "11px", color: "var(--color-warning)", fontWeight: 700, flexShrink: 0 }}>↓{status!.behind}</span>
                        )}
                        {/* Change counts */}
                        {(status?.staged ?? 0) > 0 && (
                          <span style={{ fontSize: "11px", color: "var(--color-success)", fontWeight: 700, flexShrink: 0 }}>●{status!.staged}</span>
                        )}
                        {((status?.modified ?? 0) + (status?.untracked ?? 0)) > 0 && (
                          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                            {(status?.modified ?? 0) + (status?.untracked ?? 0)} changed
                          </span>
                        )}
                        {/* State badge */}
                        <span style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color,
                          background: dimColor,
                          padding: "2px 8px",
                          borderRadius: "8px",
                          flexShrink: 0,
                        }}>
                          {status?.state?.replace(/_/g, " ") ?? "UNKNOWN"}
                        </span>
                        {/* Health score */}
                        {status && (() => {
                          const h = computeHealth(status);
                          return (
                            <span
                              title={`Health: ${h.label}${h.issues.length > 0 ? "\n" + h.issues.join("\n") : ""}`}
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                color: h.color,
                                background: h.dimColor,
                                padding: "2px 8px",
                                borderRadius: "8px",
                                flexShrink: 0,
                              }}
                            >
                              {h.score}
                            </span>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clone dialog */}
      {showClone && <CloneDialog onClose={() => setShowClone(false)} />}

      {/* List view context menu */}
      {listContextMenu && (
        <RepoContextMenu
          x={listContextMenu.x}
          y={listContextMenu.y}
          repoPath={listContextMenu.path}
          repoName={listContextMenu.name}
          conflictsCount={listContextMenu.conflicts}
          onClose={() => setListContextMenu(null)}
        />
      )}
    </div>
  );
}
