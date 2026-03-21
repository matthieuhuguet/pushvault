import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";

interface LfsManagerProps {
  repoPath: string;
  onClose: () => void;
}

// Common large-file patterns to suggest
const SUGGESTIONS = [
  "*.psd", "*.ai", "*.sketch", "*.fig",
  "*.pnga", "*.tif", "*.tiff", "*.exr",
  "*.mp4", "*.mov", "*.avi", "*.mkv",
  "*.wav", "*.aif", "*.flac",
  "*.zip", "*.7z", "*.rar",
  "*.blend", "*.fbx", "*.obj", "*.usd",
  "*.unitypackage", "*.pak",
];

export function LfsManager({ repoPath, onClose }: LfsManagerProps) {
  const addToast = useToastStore((s) => s.add);
  const [tracks, setTracks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lfsInstalled, setLfsInstalled] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const patterns = await ipc.listLfsTracks(repoPath);
      setTracks(patterns);
      setLfsInstalled(true);
    } catch (e) {
      const msg = String(e);
      if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("not installed")) {
        setLfsInstalled(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [repoPath]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleTrack = async (pattern?: string) => {
    const pat = (pattern ?? newPattern).trim();
    if (!pat) return;
    setAdding(true);
    try {
      await ipc.lfsTrack(repoPath, pat);
      addToast("success", `LFS tracking: ${pat}`);
      setNewPattern("");
      await load();
    } catch (e) {
      addToast("error", `LFS track failed: ${e}`);
    } finally {
      setAdding(false);
    }
  };

  const handleUntrack = async (pattern: string) => {
    setRemoving(pattern);
    try {
      await ipc.lfsUntrack(repoPath, pattern);
      addToast("info", `Removed LFS tracking for: ${pattern}`);
      await load();
    } catch (e) {
      addToast("error", `LFS untrack failed: ${e}`);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        style={{
          width: "520px",
          maxHeight: "80vh",
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "14px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexShrink: 0,
        }}>
          <div style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: "var(--color-accent-dim)",
            border: "1px solid var(--color-success-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            flexShrink: 0,
          }}>
            📦
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>
              Git LFS Tracked Patterns
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
              Large File Storage — store big binaries outside the git history
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "var(--overlay-subtle)", border: "none",
              color: "var(--color-text-muted)", cursor: "pointer", fontSize: "14px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-disabled)"; }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {!lfsInstalled ? (
            <div style={{
              padding: "20px",
              background: "var(--color-warning-dim)",
              border: "1px solid var(--color-warning-border)",
              borderRadius: "10px",
              textAlign: "center",
            }}>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--color-warning)", fontWeight: 600 }}>
                git-lfs is not installed
              </p>
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--color-text-muted)" }}>
                Install from <code style={{ color: "var(--color-text-secondary)" }}>git-lfs.com</code> and run{" "}
                <code style={{ color: "var(--color-text-secondary)" }}>git lfs install</code> once.
              </p>
            </div>
          ) : loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", fontSize: "13px" }}>
              Loading…
            </div>
          ) : (
            <>
              {/* Add pattern */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: "8px" }}>
                  Track new pattern
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleTrack(); }}
                    placeholder='e.g. *.psd, *.mp4, assets/**'
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: "var(--overlay-subtle)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      color: "var(--color-text-primary)",
                      fontSize: "13px",
                      fontFamily: "monospace",
                      outline: "none",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(29,185,84,0.4)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--overlay-light)"; }}
                  />
                  <button
                    onClick={() => handleTrack()}
                    disabled={!newPattern.trim() || adding}
                    style={{
                      padding: "8px 16px",
                      background: newPattern.trim() ? "var(--color-accent)" : "var(--color-success-border)",
                      border: "none",
                      borderRadius: "8px",
                      color: "#000",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: newPattern.trim() ? "pointer" : "not-allowed",
                      transition: "all 150ms ease",
                      flexShrink: 0,
                    }}
                  >
                    {adding ? "…" : "Track"}
                  </button>
                </div>
              </div>

              {/* Quick suggestions */}
              <div style={{ marginBottom: "20px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", color: "var(--color-text-disabled)" }}>
                  Quick add:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {SUGGESTIONS.filter(s => !tracks.includes(s)).slice(0, 12).map(s => (
                    <button
                      key={s}
                      onClick={() => handleTrack(s)}
                      style={{
                        padding: "3px 10px",
                        background: "var(--overlay-soft)",
                        border: "1px solid var(--overlay-light)",
                        borderRadius: "12px",
                        color: "var(--color-text-muted)",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        cursor: "pointer",
                        transition: "all 120ms ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--color-success-dim)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-success-border)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--color-accent)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-soft)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--overlay-light)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
                      }}
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tracked patterns list */}
              {tracks.length === 0 ? (
                <div style={{
                  padding: "24px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px dashed var(--overlay-subtle)",
                  borderRadius: "10px",
                  textAlign: "center",
                }}>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-disabled)" }}>
                    No LFS patterns tracked yet.
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--color-text-disabled)" }}>
                    Add patterns above to store large files via LFS.
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--color-text-disabled)" }}>
                    {tracks.length} tracked pattern{tracks.length !== 1 ? "s" : ""}
                  </p>
                  {tracks.map((pat) => (
                    <div
                      key={pat}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "9px 12px",
                        background: "var(--overlay-soft)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: "8px",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ fontSize: "14px", flexShrink: 0 }}>📦</span>
                      <code style={{ flex: 1, fontSize: "13px", color: "var(--color-accent)", fontFamily: "monospace" }}>
                        {pat}
                      </code>
                      <button
                        onClick={() => handleUntrack(pat)}
                        disabled={removing === pat}
                        style={{
                          padding: "3px 10px",
                          background: "var(--color-error-dim)",
                          border: "1px solid var(--color-error-border)",
                          borderRadius: "6px",
                          color: removing === pat ? "var(--color-text-disabled)" : "var(--color-error)",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: removing === pat ? "not-allowed" : "pointer",
                          transition: "all 120ms ease",
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          if (removing !== pat)
                            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-error-border)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "var(--color-error-dim)";
                        }}
                      >
                        {removing === pat ? "…" : "Untrack"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
            After adding patterns, stage and commit <code style={{ color: "var(--color-text-disabled)" }}>.gitattributes</code> to
            apply LFS tracking to all contributors.
          </p>
        </div>
      </div>
    </div>
  );
}
