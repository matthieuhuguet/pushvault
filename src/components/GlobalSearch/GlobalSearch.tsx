import React, { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { useToastStore } from "../../store/toastStore";
import type { SearchResult } from "../../types";

interface Props {
  onClose: () => void;
}

export function GlobalSearch({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [searchContent, setSearchContent] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const config = useRepoStore((s) => s.config);
  const { setSelectedRepoPath, setActivePanel } = useUIStore();
  const addToast = useToastStore((s) => s.add);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Debounced search
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || !config?.repos?.length) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const paths = config.repos.map((r) => r.path);
      const names = config.repos.map((r) => r.name);
      const res = await ipc.searchRepos(paths, names, q, searchContent, 80);
      setResults(res);
      setSelected(0);
    } catch (e) {
      addToast("error", `Search failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [config, searchContent, addToast]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(query), 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query, doSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && results[selected]) {
      handleSelect(results[selected]);
    }
  };

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const item = el.children[selected] as HTMLElement;
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const handleSelect = (result: SearchResult) => {
    onClose();
    // Open the file in VS Code
    const sep = result.repo_path.includes("\\") ? "\\" : "/";
    const fullPath = `${result.repo_path}${sep}${result.file_path}`;
    ipc.openInVscode(fullPath).catch(() => {
      // Fallback: navigate to repo staging
      setSelectedRepoPath(result.repo_path);
      setActivePanel("staging");
    });
  };

  // Group results by repo
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = r.repo_name || r.repo_path;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  let flatIdx = 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
        animation: "fade-in 100ms ease both",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "640px", maxHeight: "70vh",
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          borderRadius: "16px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
            <circle cx="11" cy="11" r="7" stroke="var(--color-text-secondary)" strokeWidth="2" />
            <path d="M16 16l4 4" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files across all repos..."
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "var(--color-text-primary)", fontSize: 15, fontWeight: 500,
            }}
          />
          <label style={{
            display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
            fontSize: 10, color: "var(--color-text-secondary)", flexShrink: 0,
          }}>
            <input
              type="checkbox"
              checked={searchContent}
              onChange={(e) => setSearchContent(e.target.checked)}
              style={{ accentColor: "var(--color-accent)" }}
            />
            Content
          </label>
          {loading && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="var(--overlay-medium)" strokeWidth="3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!query.trim() && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-text-disabled)", fontSize: 13 }}>
              Type to search files across {config?.repos?.length ?? 0} repositories
            </div>
          )}

          {query.trim() && results.length === 0 && !loading && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-text-disabled)", fontSize: 13 }}>
              No results found
            </div>
          )}

          {Object.entries(grouped).map(([repoName, items]) => (
            <div key={repoName}>
              <div style={{
                padding: "6px 16px 2px", fontSize: 10, fontWeight: 700,
                color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                {repoName}
              </div>
              {items.map((result, j) => {
                const idx = flatIdx++;
                const isSelected = idx === selected;
                return (
                  <div
                    key={`${result.file_path}-${result.line_number ?? "f"}-${j}`}
                    onClick={() => handleSelect(result)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 16px", cursor: "pointer",
                      background: isSelected ? "var(--overlay-light)" : "transparent",
                      transition: "background 60ms ease",
                    }}
                    onMouseEnter={(e) => {
                      setSelected(idx);
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-subtle)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                  >
                    {/* Icon */}
                    <span style={{
                      fontSize: 11, width: 16, textAlign: "center", flexShrink: 0,
                      color: result.match_type === "filename" ? "var(--color-info)" : "var(--color-success)",
                    }}>
                      {result.match_type === "filename" ? "\u2630" : "\u2261"}
                    </span>

                    {/* File path */}
                    <span style={{
                      fontSize: 12, color: "var(--color-text-primary)", flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      fontFamily: "monospace",
                    }}>
                      {result.file_path}
                      {result.line_number != null && (
                        <span style={{ color: "var(--color-text-disabled)" }}>
                          :{result.line_number}
                        </span>
                      )}
                    </span>

                    {/* Content preview */}
                    {result.line_content && (
                      <span style={{
                        fontSize: 11, color: "var(--color-text-secondary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        maxWidth: "40%", flexShrink: 0,
                      }}>
                        {result.line_content.trim()}
                      </span>
                    )}

                    {/* Match type badge */}
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                      flexShrink: 0,
                      background: result.match_type === "filename" ? "var(--color-info-dim)" : "var(--color-success-dim)",
                      color: result.match_type === "filename" ? "var(--color-info)" : "var(--color-success)",
                    }}>
                      {result.match_type === "filename" ? "FILE" : "LINE"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 16px", borderTop: "1px solid var(--color-border-subtle)",
          display: "flex", alignItems: "center", gap: 12, fontSize: 10,
          color: "var(--color-text-disabled)",
        }}>
          <span><kbd style={{ background: "var(--overlay-subtle)", padding: "1px 4px", borderRadius: 3, border: "1px solid var(--overlay-light)" }}>{"\u2191\u2193"}</kbd> Navigate</span>
          <span><kbd style={{ background: "var(--overlay-subtle)", padding: "1px 4px", borderRadius: 3, border: "1px solid var(--overlay-light)" }}>Enter</kbd> Open in VS Code</span>
          <span><kbd style={{ background: "var(--overlay-subtle)", padding: "1px 4px", borderRadius: 3, border: "1px solid var(--overlay-light)" }}>Esc</kbd> Close</span>
          {results.length > 0 && (
            <span style={{ marginLeft: "auto" }}>
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
