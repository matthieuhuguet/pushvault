import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useGitHubStore } from "../../store/githubStore";

type Release = {
  id: number;
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
};

interface GitHubReleaseModalProps {
  repoUrl: string;
  repoName: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function GitHubReleaseModal({ repoUrl, repoName, onClose }: GitHubReleaseModalProps) {
  const token = useGitHubStore((s) => s.token);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Form state
  const [tagName, setTagName] = useState("");
  const [releaseName, setReleaseName] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [prerelease, setPrerelease] = useState(false);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Release | null>(null);

  // Recent releases
  const [releases, setReleases] = useState<Release[]>([]);
  const [relLoading, setRelLoading] = useState(true);

  // Load recent releases on mount
  useEffect(() => {
    ipc.listGithubReleases(repoUrl, token ?? null)
      .then((data) => setReleases(data as Release[]))
      .catch(() => setReleases([]))
      .finally(() => setRelLoading(false));
  }, [repoUrl, token]);

  // Keyboard close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setSubmitError("No GitHub token configured. Add one in Settings.");
      return;
    }
    if (!tagName.trim()) {
      setSubmitError("Tag name is required.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await ipc.createGithubRelease(
        repoUrl,
        token,
        tagName.trim(),
        releaseName.trim() || tagName.trim(),
        body.trim(),
        draft,
        prerelease,
      );
      setCreated(result as Release);
    } catch (err) {
      setSubmitError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    background: "var(--overlay-soft)",
    border: "1px solid var(--overlay-medium)",
    borderRadius: "8px",
    color: "var(--color-text-primary)",
    fontSize: "13px",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 120ms ease",
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    fontSize: "13px",
    color: active ? "#e0e0e0" : "#6a6a6a",
    userSelect: "none",
  });

  const toggleDotStyle = (active: boolean): React.CSSProperties => ({
    width: "32px",
    height: "18px",
    borderRadius: "9px",
    background: active ? "var(--color-accent)" : "var(--overlay-medium)",
    position: "relative",
    transition: "background 150ms ease",
    flexShrink: 0,
  });

  const toggleThumbStyle = (active: boolean): React.CSSProperties => ({
    position: "absolute",
    top: "2px",
    left: active ? "16px" : "2px",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: "#fff",
    transition: "left 150ms ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  });

  const gitHubBase = repoUrl.replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/");

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 850,
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "560px",
          maxWidth: "100%",
          maxHeight: "90vh",
          background: "var(--color-bg-card)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "slide-in-bottom 200ms ease both",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-border-subtle)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>🚀</span>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                Create Release
              </h2>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px", marginBottom: 0 }}>
                {repoName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "var(--overlay-light)",
              border: "none",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              lineHeight: 1,
              transition: "background 120ms ease, color 120ms ease",
              flexShrink: 0,
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

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* Success state */}
          {created ? (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎉</div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "8px" }}>
                Release created!
              </h3>
              <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                <strong style={{ color: "var(--color-accent)" }}>{created.tag_name}</strong>
                {created.draft && (
                  <span style={{
                    marginLeft: "8px",
                    fontSize: "11px",
                    padding: "2px 7px",
                    background: "var(--color-warning-dim)",
                    color: "var(--color-warning)",
                    borderRadius: "10px",
                  }}>Draft</span>
                )}
                {created.prerelease && (
                  <span style={{
                    marginLeft: "8px",
                    fontSize: "11px",
                    padding: "2px 7px",
                    background: "rgba(163,113,247,0.15)",
                    color: "#a371f7",
                    borderRadius: "10px",
                  }}>Pre-release</span>
                )}
              </p>
              {created.name && created.name !== created.tag_name && (
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "24px" }}>
                  {created.name}
                </p>
              )}
              <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                <a
                  href={created.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.preventDefault(); window.open(created.html_url, "_blank", "noopener noreferrer"); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "9px 18px",
                    background: "var(--color-accent)",
                    color: "#000",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  View Release ↗
                </a>
                <button
                  onClick={onClose}
                  style={{
                    padding: "9px 18px",
                    background: "var(--overlay-light)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    color: "var(--color-text-secondary)",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Form */}
              <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
                {/* Token warning */}
                {!token && (
                  <div style={{
                    marginBottom: "16px",
                    padding: "10px 14px",
                    background: "var(--color-warning-dim)",
                    border: "1px solid var(--color-warning-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--color-warning)",
                  }}>
                    ⚠ No GitHub token found. Add one in Settings → GitHub Token to create releases.
                  </div>
                )}

                {/* Tag name */}
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "6px", letterSpacing: "0.04em" }}>
                    TAG NAME <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  <input
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    placeholder="v1.0.0"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent-border)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--overlay-medium)")}
                    autoFocus
                  />
                </div>

                {/* Release title */}
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "6px", letterSpacing: "0.04em" }}>
                    RELEASE TITLE
                    <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--color-text-disabled)", marginLeft: "6px" }}>defaults to tag name</span>
                  </label>
                  <input
                    value={releaseName}
                    onChange={(e) => setReleaseName(e.target.value)}
                    placeholder="Release v1.0.0"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent-border)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--overlay-medium)")}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "6px", letterSpacing: "0.04em" }}>
                    DESCRIPTION
                    <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--color-text-disabled)", marginLeft: "6px" }}>supports Markdown</span>
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={"## What's Changed\n\n- Feature A\n- Bug fix B\n\n**Full Changelog**: https://github.com/..."}
                    rows={5}
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                      minHeight: "100px",
                      lineHeight: "1.5",
                    } as React.CSSProperties}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent-border)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--overlay-medium)")}
                  />
                </div>

                {/* Toggles */}
                <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
                  <label
                    style={toggleStyle(draft)}
                    onClick={() => setDraft(!draft)}
                  >
                    <div style={toggleDotStyle(draft)}>
                      <div style={toggleThumbStyle(draft)} />
                    </div>
                    Draft
                  </label>
                  <label
                    style={toggleStyle(prerelease)}
                    onClick={() => setPrerelease(!prerelease)}
                  >
                    <div style={toggleDotStyle(prerelease)}>
                      <div style={toggleThumbStyle(prerelease)} />
                    </div>
                    Pre-release
                  </label>
                </div>

                {/* Error */}
                {submitError && (
                  <div style={{
                    marginBottom: "14px",
                    padding: "10px 14px",
                    background: "var(--color-error-dim)",
                    border: "1px solid var(--color-error-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--color-error)",
                  }}>
                    {submitError}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || !token}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: submitting || !token ? "var(--color-accent-dim)" : "var(--color-accent)",
                    border: "none",
                    borderRadius: "8px",
                    color: submitting || !token ? "rgba(0,0,0,0.4)" : "#000",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: submitting || !token ? "not-allowed" : "pointer",
                    transition: "background 150ms ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  {submitting ? (
                    <>
                      <span style={{
                        width: "14px",
                        height: "14px",
                        border: "2px solid rgba(0,0,0,0.3)",
                        borderTop: "2px solid #000",
                        borderRadius: "50%",
                        animation: "spin 0.6s linear infinite",
                        display: "inline-block",
                      }} />
                      Creating…
                    </>
                  ) : (
                    <>🚀 {draft ? "Save as Draft" : "Publish Release"}</>
                  )}
                </button>
              </form>

              {/* Recent releases */}
              <div style={{
                borderTop: "1px solid var(--color-border-subtle)",
                padding: "16px 24px 20px",
              }}>
                <p style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--color-text-disabled)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  margin: "0 0 10px",
                }}>
                  Recent Releases
                </p>

                {relLoading && (
                  <p style={{ fontSize: "12px", color: "var(--color-text-disabled)" }}>Loading…</p>
                )}

                {!relLoading && releases.length === 0 && (
                  <p style={{ fontSize: "12px", color: "var(--color-text-disabled)" }}>No releases yet.</p>
                )}

                {!relLoading && releases.map((rel) => (
                  <div
                    key={rel.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "7px 0",
                      borderBottom: "1px solid var(--overlay-soft)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--color-accent)",
                        fontFamily: "monospace",
                        flexShrink: 0,
                      }}>
                        {rel.tag_name}
                      </span>
                      {rel.name && rel.name !== rel.tag_name && (
                        <span style={{
                          fontSize: "12px",
                          color: "var(--color-text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {rel.name}
                        </span>
                      )}
                      {rel.draft && (
                        <span style={{
                          fontSize: "10px",
                          padding: "1px 6px",
                          background: "var(--color-warning-dim)",
                          color: "var(--color-warning)",
                          borderRadius: "8px",
                          flexShrink: 0,
                        }}>
                          Draft
                        </span>
                      )}
                      {rel.prerelease && (
                        <span style={{
                          fontSize: "10px",
                          padding: "1px 6px",
                          background: "rgba(163,113,247,0.12)",
                          color: "#a371f7",
                          borderRadius: "8px",
                          flexShrink: 0,
                        }}>
                          Pre-release
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                      <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>
                        {formatDate(rel.published_at)}
                      </span>
                      <button
                        onClick={() => window.open(rel.html_url, "_blank", "noopener noreferrer")}
                        style={{
                          padding: "3px 8px",
                          background: "var(--overlay-subtle)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "6px",
                          color: "var(--color-text-secondary)",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        View ↗
                      </button>
                    </div>
                  </div>
                ))}

                {/* Footer: all releases link */}
                <div style={{ marginTop: "12px", textAlign: "center" }}>
                  <button
                    onClick={() => window.open(`${gitHubBase}/releases`, "_blank", "noopener noreferrer")}
                    style={{
                      padding: "6px 14px",
                      background: "none",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      color: "var(--color-text-disabled)",
                      fontSize: "11px",
                      cursor: "pointer",
                      transition: "color 120ms ease, border-color 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--overlay-vivid)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-disabled)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--overlay-light)";
                    }}
                  >
                    View all releases on GitHub ↗
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
