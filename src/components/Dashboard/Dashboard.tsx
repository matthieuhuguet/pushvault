import React, { useMemo, useRef, useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { RepoCard, RepoCardSkeleton, RepoContextMenu } from "../Card/RepoCard";
import { FilterPills } from "../FilterPills/FilterPills";
import { CloneDialog } from "../Clone/CloneDialog";
import type { SyncState } from "../../types";

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
          background: "rgba(29,185,84,0.1)",
          border: "2px dashed rgba(29,185,84,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="#1DB954"
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
          background: "#1DB954",
          color: "#000",
          border: "none",
          borderRadius: "24px",
          fontSize: "14px",
          fontWeight: 700,
          cursor: "pointer",
          transition: "all 150ms ease",
          boxShadow: "0 4px 16px rgba(29,185,84,0.3)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#1ed760";
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.03)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#1DB954";
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
        <circle cx="11" cy="11" r="8" stroke="#b3b3b3" strokeWidth="2" />
        <path d="m21 21-4.35-4.35" stroke="#b3b3b3" strokeWidth="2" strokeLinecap="round" />
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

export function Dashboard() {
  const config = useRepoStore((s) => s.config);
  const statuses = useRepoStore((s) => s.statuses);
  const loading = useRepoStore((s) => s.loading);
  const reorderRepos = useRepoStore((s) => s.reorderRepos);
  const { searchQuery, activeFilter, setActivePanel, setSelectedRepoPath } = useUIStore();
  const [showClone, setShowClone] = useState(false);
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
                    color: viewMode === mode ? "#fff" : "#6a6a6a",
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
              background: "rgba(29,185,84,0.12)",
              color: "#1DB954",
              border: "1px solid rgba(29,185,84,0.3)",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 150ms ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(29,185,84,0.2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(29,185,84,0.12)";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#1DB954" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Add Repo
          </button>
        </div>
      </div>

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
          {[
            { label: "Total", value: repos.length, color: "var(--color-text-secondary)" },
            stats.withChanges > 0 && { label: "With changes", value: stats.withChanges, color: "#3d9be9" },
            stats.needsPush > 0 && { label: "Needs push", value: stats.needsPush, color: "#1DB954" },
            stats.errors > 0 && { label: "Issues", value: stats.errors, color: "#e5534b" },
          ]
            .filter(Boolean)
            .map((stat: any) => (
              <div
                key={stat.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  background: `${stat.color}12`,
                  border: `1px solid ${stat.color}25`,
                  borderRadius: "16px",
                  fontSize: "11px",
                  color: stat.color,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 700 }}>{stat.value}</span>
                <span style={{ opacity: 0.75 }}>{stat.label}</span>
              </div>
            ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {repos.length === 0 ? (
          <EmptyState onAdd={() => setShowClone(true)} />
        ) : filteredRepos.length === 0 ? (
          <NoResults query={searchQuery || activeFilter} />
        ) : viewMode === "grid" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "16px",
              paddingBottom: "24px",
            }}
          >
            {filteredRepos.map((repo, idx) => (
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
                  outline: dragOverPath === repo.path ? "2px dashed rgba(29,185,84,0.6)" : undefined,
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
            ))}
          </div>
        ) : (
          /* List view */
          <div style={{ paddingBottom: "24px" }}>
            {filteredRepos.map((repo, idx) => {
              const status = statuses[repo.path];
              const stateColor: Record<string, string> = {
                SYNCED: "#1DB954", NEEDS_PUSH: "#3d9be9", NEEDS_PULL: "#f59b00",
                DIVERGED: "#ff7b00", CONFLICT: "#e5534b", ERROR: "#e5534b", NOT_INIT: "#535353",
              };
              const color = stateColor[status?.state ?? ""] ?? "#535353";
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
                    outline: dragOverPath === repo.path ? "2px dashed rgba(29,185,84,0.6)" : undefined,
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
                    <span style={{ fontSize: "11px", color: "#3d9be9", fontWeight: 700, flexShrink: 0 }}>↑{status!.ahead}</span>
                  )}
                  {(status?.behind ?? 0) > 0 && (
                    <span style={{ fontSize: "11px", color: "#f59b00", fontWeight: 700, flexShrink: 0 }}>↓{status!.behind}</span>
                  )}
                  {/* Change counts */}
                  {(status?.staged ?? 0) > 0 && (
                    <span style={{ fontSize: "11px", color: "#1DB954", fontWeight: 700, flexShrink: 0 }}>●{status!.staged}</span>
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
                    background: `${color}18`,
                    padding: "2px 8px",
                    borderRadius: "8px",
                    flexShrink: 0,
                  }}>
                    {status?.state?.replace(/_/g, " ") ?? "UNKNOWN"}
                  </span>
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
