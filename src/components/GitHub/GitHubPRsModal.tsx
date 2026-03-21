import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useGitHubStore } from "../../store/githubStore";

type PR = {
  number: number;
  title: string;
  state: string; // "open" | "closed" | "merged"
  author: string;
  base_branch: string;
  head_branch: string;
  url: string;
  created_at: string;
  draft: boolean;
};

type PRFilter = "open" | "closed";

interface GitHubPRsModalProps {
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

const STATE_COLOR: Record<string, string> = {
  open: "var(--color-success)",
  closed: "var(--color-text-disabled)",
  merged: "#a371f7",
};

const STATE_LABEL: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  merged: "Merged",
};

function PRIcon({ state, draft }: { state: string; draft: boolean }) {
  if (state === "merged") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="6" r="3" fill="#a371f7" />
        <circle cx="6" cy="18" r="3" fill="#a371f7" />
        <circle cx="18" cy="6" r="3" fill="#a371f7" />
        <path d="M6 9v6" stroke="#a371f7" strokeWidth="2" strokeLinecap="round" />
        <path d="M18 9a6 6 0 0 1-6 6H6" stroke="#a371f7" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "closed") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="6" r="3" stroke="var(--color-text-disabled)" strokeWidth="2" />
        <circle cx="6" cy="18" r="3" stroke="var(--color-text-disabled)" strokeWidth="2" />
        <path d="M6 9v6" stroke="var(--color-text-disabled)" strokeWidth="2" strokeLinecap="round" />
        <path d="M18 6 9 18" stroke="var(--color-text-disabled)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  // open
  const color = draft ? "#6a6a6a" : "var(--color-success)";
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="6" r="3" stroke={color} strokeWidth="2" strokeDasharray={draft ? "2 2" : undefined} />
      <circle cx="6" cy="18" r="3" stroke={color} strokeWidth="2" />
      <circle cx="18" cy="18" r="3" stroke={color} strokeWidth="2" />
      <path d="M6 9v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M18 9v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M9 6h6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function GitHubPRsModal({ repoUrl, repoName, onClose }: GitHubPRsModalProps) {
  const token = useGitHubStore((s) => s.token);
  const [prs, setPrs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PRFilter>("open");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    ipc.getGithubPrs(repoUrl, token, filter)
      .then((data) => { setPrs(data); setLoading(false); })
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
          width: "580px",
          maxHeight: "82vh",
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
            {/* PR icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="6" cy="6" r="3" stroke="var(--color-success)" strokeWidth="2" />
              <circle cx="6" cy="18" r="3" stroke="var(--color-success)" strokeWidth="2" />
              <circle cx="18" cy="18" r="3" stroke="var(--color-success)" strokeWidth="2" />
              <path d="M6 9v6" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" />
              <path d="M18 9v6" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" />
              <path d="M9 6h6" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                Pull Requests
              </h2>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0, marginTop: "1px" }}>
                {repoName}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Filter pills */}
            <div style={{ display: "flex", background: "var(--overlay-subtle)", borderRadius: "20px", padding: "2px" }}>
              {(["open", "closed"] as PRFilter[]).map((f) => (
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
                <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Loading pull requests…
            </div>
          )}

          {error && (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--color-error)", fontSize: "13px" }}>
              <p style={{ fontWeight: 600 }}>Failed to load pull requests</p>
              <p style={{ color: "var(--color-text-disabled)", marginTop: "8px" }}>{error}</p>
              {!token && (
                <p style={{ color: "var(--color-text-muted)", marginTop: "8px", fontSize: "11px" }}>
                  Tip: Add a GitHub PAT in Settings → GitHub for private repos
                </p>
              )}
            </div>
          )}

          {!loading && !error && prs.length === 0 && (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--color-text-disabled)", fontSize: "13px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ display: "block", margin: "0 auto 12px", opacity: 0.3 }}>
                <circle cx="6" cy="6" r="3" stroke="var(--color-text-secondary)" strokeWidth="2" />
                <circle cx="6" cy="18" r="3" stroke="var(--color-text-secondary)" strokeWidth="2" />
                <circle cx="18" cy="18" r="3" stroke="var(--color-text-secondary)" strokeWidth="2" />
                <path d="M6 9v6" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" />
                <path d="M18 9v6" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" />
                <path d="M9 6h6" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              No {filter} pull requests
            </div>
          )}

          {!loading && !error && prs.map((pr) => {
            const color = pr.draft ? "#6a6a6a" : (STATE_COLOR[pr.state] ?? "var(--color-text-disabled)");
            return (
              <div
                key={pr.number}
                onClick={() => openUrl(pr.url)}
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
                {/* PR icon */}
                <div style={{ flexShrink: 0, marginTop: "2px" }}>
                  <PRIcon state={pr.state} draft={pr.draft} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {pr.title}
                    </span>
                    {pr.draft && (
                      <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "8px", background: "var(--overlay-light)", color: "var(--color-text-muted)", fontWeight: 600 }}>
                        Draft
                      </span>
                    )}
                    <span style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 7px",
                      borderRadius: "8px",
                      background: `${color}22`,
                      color,
                    }}>
                      {STATE_LABEL[pr.state] ?? pr.state}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-disabled)" }}>
                      #{pr.number}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {pr.author}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>
                      ⎇ {pr.head_branch}
                    </span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" style={{ color: "var(--color-text-disabled)", flexShrink: 0 }}>
                      <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>
                      {pr.base_branch}
                    </span>
                  </div>
                </div>

                {/* Date + link icon */}
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>
                    {formatDate(pr.created_at)}
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

        {/* Footer: open in GitHub */}
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
                openUrl(`${base}/pulls`);
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
