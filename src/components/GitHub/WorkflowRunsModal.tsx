import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useGitHubStore } from "../../store/githubStore";

type WorkflowRun = {
  id: number;
  name: string;
  status: string; // "success" | "failure" | "in_progress" | "unknown"
  branch: string;
  commit_sha: string;
  url: string;
  created_at: string;
};

interface WorkflowRunsModalProps {
  repoUrl: string;
  repoName: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

const STATUS_COLOR: Record<string, string> = {
  success: "var(--color-success)",
  failure: "var(--color-error)",
  in_progress: "var(--color-warning)",
  unknown: "var(--color-text-disabled)",
};

const STATUS_LABEL: Record<string, string> = {
  success: "Passed",
  failure: "Failed",
  in_progress: "Running",
  unknown: "Unknown",
};

export function WorkflowRunsModal({ repoUrl, repoName, onClose }: WorkflowRunsModalProps) {
  const token = useGitHubStore((s) => s.token);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    ipc.getGithubWorkflowRuns(repoUrl, token, 15)
      .then((data) => { setRuns(data); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [repoUrl, token]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
          width: "560px",
          maxHeight: "80vh",
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
            padding: "18px 22px",
            borderBottom: "1px solid var(--color-border-subtle)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="var(--color-warning)" strokeWidth="2" />
              <polyline points="12 6 12 12 16 14" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                GitHub Actions
              </h2>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0, marginTop: "1px" }}>
                {repoName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "var(--overlay-light)",
              border: "none",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "15px",
              transition: "all 120ms ease",
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

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px", gap: "10px", color: "var(--color-text-muted)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="var(--overlay-medium)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-warning)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Loading runs…
            </div>
          )}
          {error && (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--color-error)", fontSize: "13px" }}>
              <p style={{ fontWeight: 600 }}>Failed to load workflow runs</p>
              <p style={{ color: "var(--color-text-disabled)", marginTop: "8px" }}>{error}</p>
              {!token && (
                <p style={{ color: "var(--color-text-muted)", marginTop: "8px", fontSize: "11px" }}>
                  Tip: Add a GitHub PAT in Settings → GitHub for private repos
                </p>
              )}
            </div>
          )}
          {!loading && !error && runs.length === 0 && (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--color-text-disabled)", fontSize: "13px" }}>
              No workflow runs found
            </div>
          )}
          {!loading && !error && runs.map((run) => {
            const color = STATUS_COLOR[run.status] ?? "var(--color-text-disabled)";
            return (
              <a
                key={run.id}
                href={run.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 22px",
                  textDecoration: "none",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--overlay-soft)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
              >
                {/* Status dot */}
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: color,
                    boxShadow: `0 0 6px ${color}99`,
                    flexShrink: 0,
                    animation: run.status === "in_progress" ? "pulse 1.4s ease-in-out infinite" : undefined,
                  }}
                />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {run.name}
                    </span>
                    <span style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 7px",
                      borderRadius: "8px",
                      background: `${color}22`,
                      color,
                    }}>
                      {STATUS_LABEL[run.status] ?? run.status}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "2px" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      ⎇ {run.branch}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--color-text-disabled)", fontFamily: "monospace" }}>
                      {run.commit_sha}
                    </span>
                  </div>
                </div>

                {/* Date + external link icon */}
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>
                    {formatDate(run.created_at)}
                  </div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ marginTop: "2px", color: "var(--color-text-disabled)" }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="15 3 21 3 21 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
