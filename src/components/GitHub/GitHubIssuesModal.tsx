import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useGitHubStore } from "../../store/githubStore";

type Issue = {
  number: number;
  title: string;
  state: string; // "open" | "closed"
  author: string;
  url: string;
  created_at: string;
  labels: string[];
  comments: number;
  is_pr: boolean;
};

type IssueFilter = "open" | "closed";

interface GitHubIssuesModalProps {
  repoUrl: string;
  repoName: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

// Simple hash-based color for labels (deterministic)
function labelColor(label: string): string {
  const palette = [
    "#e57a3b", "#3b9ae5", "#3be5a0", "#e53b9a", "#a0e53b",
    "#e5d03b", "#9a3be5", "#3be5d0", "#e53b3b", "#3b5fe5",
  ];
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) & 0xffffff;
  return palette[Math.abs(hash) % palette.length];
}

export function GitHubIssuesModal({ repoUrl, repoName, onClose }: GitHubIssuesModalProps) {
  const token = useGitHubStore((s) => s.token);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<IssueFilter>("open");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    ipc.getGithubIssues(repoUrl, token, filter)
      .then((data) => { setIssues(data); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [repoUrl, token, filter]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const openUrl = (url: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shell = (window as any).__TAURI__?.shell ?? (window as any).__TAURI_INTERNALS__?.plugins?.shell;
      if (shell?.open) { shell.open(url); return; }
    } catch { /* fall through */ }
    window.open(url, "_blank");
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 900,
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "600px",
          maxHeight: "84vh",
          maxWidth: "100%",
          background: "var(--color-bg-card)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "slide-in-bottom 200ms ease both",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border-subtle)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Issue icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#e57a3b" strokeWidth="2" />
              <line x1="12" y1="8" x2="12" y2="12" stroke="#e57a3b" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="0.5" fill="#e57a3b" stroke="#e57a3b" strokeWidth="1.5" />
            </svg>
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                Issues
              </h2>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0, marginTop: "1px" }}>
                {repoName}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Filter pills */}
            <div style={{ display: "flex", background: "var(--overlay-subtle)", borderRadius: "20px", padding: "2px" }}>
              {(["open", "closed"] as IssueFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "16px",
                    background: filter === f ? "var(--overlay-medium)" : "none",
                    border: "none",
                    color: filter === f ? "#fff" : "#6a6a6a",
                    fontSize: "12px",
                    fontWeight: filter === f ? 700 : 400,
                    cursor: "pointer",
                    transition: "all 120ms ease",
                    textTransform: "capitalize",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: "var(--overlay-light)", border: "none",
                color: "var(--color-text-secondary)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "14px", transition: "all 120ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-strong)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px", gap: "10px", color: "var(--color-text-muted)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="var(--overlay-medium)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#e57a3b" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Loading issues…
            </div>
          )}

          {error && (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--color-error)", fontSize: "13px" }}>
              <p style={{ fontWeight: 600 }}>Failed to load issues</p>
              <p style={{ color: "var(--color-text-disabled)", marginTop: "8px" }}>{error}</p>
              {!token && (
                <p style={{ color: "var(--color-text-muted)", marginTop: "8px", fontSize: "11px" }}>
                  Tip: Add a GitHub PAT in Settings → GitHub for private repos
                </p>
              )}
            </div>
          )}

          {!loading && !error && issues.length === 0 && (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--color-text-disabled)", fontSize: "13px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ display: "block", margin: "0 auto 12px", opacity: 0.3 }}>
                <circle cx="12" cy="12" r="10" stroke="var(--color-text-secondary)" strokeWidth="2" />
                <line x1="12" y1="8" x2="12" y2="12" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="0.5" fill="var(--color-text-secondary)" stroke="var(--color-text-secondary)" strokeWidth="1.5" />
              </svg>
              No {filter} issues
            </div>
          )}

          {!loading && !error && issues.map((issue) => {
            const isOpen = issue.state === "open";
            const dotColor = isOpen ? "var(--color-success)" : "var(--color-text-disabled)";
            return (
              <div
                key={issue.number}
                onClick={() => openUrl(issue.url)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "12px 20px",
                  cursor: "pointer",
                  transition: "background 120ms ease",
                  borderBottom: "1px solid var(--overlay-soft)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-soft)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                {/* State dot */}
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: dotColor,
                    boxShadow: isOpen ? `0 0 6px ${dotColor}99` : "none",
                    flexShrink: 0,
                    marginTop: "4px",
                  }}
                />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flexWrap: "wrap", marginBottom: "5px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {issue.title}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-disabled)" }}>
                      #{issue.number}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {issue.author}
                    </span>
                    {issue.comments > 0 && (
                      <span style={{ fontSize: "11px", color: "var(--color-text-disabled)", display: "flex", alignItems: "center", gap: "3px" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {issue.comments}
                      </span>
                    )}
                    {/* Labels */}
                    {issue.labels.slice(0, 3).map((lbl) => {
                      const c = labelColor(lbl);
                      return (
                        <span
                          key={lbl}
                          style={{
                            fontSize: "10px",
                            padding: "1px 6px",
                            borderRadius: "8px",
                            background: `${c}22`,
                            color: c,
                            fontWeight: 600,
                            border: `1px solid ${c}44`,
                          }}
                        >
                          {lbl}
                        </span>
                      );
                    })}
                    {issue.labels.length > 3 && (
                      <span style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>+{issue.labels.length - 3}</span>
                    )}
                  </div>
                </div>

                {/* Date + link icon */}
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>
                    {formatDate(issue.created_at)}
                  </div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ marginTop: "3px", color: "var(--color-text-disabled)" }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="15 3 21 3 21 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!loading && !error && (
          <div style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--color-border-subtle)",
            display: "flex",
            justifyContent: "flex-end",
            flexShrink: 0,
          }}>
            <button
              onClick={() => {
                const base = repoUrl.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/");
                openUrl(`${base}/issues`);
              }}
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                background: "var(--overlay-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 120ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-medium)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              View all on GitHub
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
