import React, { useMemo, useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { RepoCard, RepoCardSkeleton } from "../Card/RepoCard";
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
          style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}
        >
          No repositories yet
        </h2>
        <p style={{ fontSize: "14px", color: "#b3b3b3", maxWidth: "320px" }}>
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
      <p style={{ fontSize: "16px", fontWeight: 600, color: "#fff" }}>
        No results for "{query}"
      </p>
      <p style={{ fontSize: "13px", color: "#b3b3b3" }}>
        Try a different name or filter.
      </p>
    </div>
  );
}

export function Dashboard() {
  const config = useRepoStore((s) => s.config);
  const statuses = useRepoStore((s) => s.statuses);
  const loading = useRepoStore((s) => s.loading);
  const { searchQuery, activeFilter } = useUIStore();
  const [showClone, setShowClone] = useState(false);

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
              color: "#fff",
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
                color: "#6a6a6a",
                background: "rgba(255,255,255,0.06)",
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

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {repos.length === 0 ? (
          <EmptyState onAdd={() => setShowClone(true)} />
        ) : filteredRepos.length === 0 ? (
          <NoResults query={searchQuery || activeFilter} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "16px",
              paddingBottom: "24px",
            }}
          >
            {filteredRepos.map((repo, idx) => (
              <RepoCard
                key={repo.path}
                repo={repo}
                status={statuses[repo.path]}
                index={idx}
              />
            ))}
          </div>
        )}
      </div>

      {/* Clone dialog */}
      {showClone && <CloneDialog onClose={() => setShowClone(false)} />}
    </div>
  );
}
