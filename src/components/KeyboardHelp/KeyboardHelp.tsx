import React, { useEffect, useRef } from "react";

interface Shortcut {
  key: string;
  description: string;
  category?: string;
}

const SHORTCUTS: Shortcut[] = [
  // Global
  { key: "Ctrl+S", description: "Sync all repositories", category: "Global" },
  { key: "Ctrl+R / F5", description: "Refresh all statuses", category: "Global" },
  { key: "Ctrl+K", description: "Focus repo search bar", category: "Global" },
  { key: "Ctrl+,", description: "Open settings", category: "Global" },
  { key: "Ctrl+N", description: "Clone from URL", category: "Global" },
  { key: "Ctrl+P", description: "Open command palette", category: "Global" },
  { key: "Ctrl+/", description: "Show keyboard shortcuts", category: "Global" },
  { key: "Escape", description: "Close panel / modal", category: "Global" },
  // Staging area
  { key: "Ctrl+A", description: "Stage all modified files", category: "Staging" },
  { key: "Ctrl+Shift+U", description: "Unstage all files", category: "Staging" },
  { key: "Ctrl+Enter", description: "Commit staged changes", category: "Staging" },
  { key: "Delete", description: "Discard / delete selected file", category: "Staging" },
  // Diff viewer
  { key: "Ctrl+F", description: "Search in diff viewer", category: "Diff" },
  // Commit history
  { key: "↑ / ↓", description: "Navigate commit list", category: "History" },
  { key: "Enter", description: "Expand selected commit diff", category: "History" },
  // Navigation
  { key: "Right-click", description: "Context menu (push, pull, release, worktrees…)", category: "Navigation" },
  { key: "Drag cards", description: "Reorder repository cards", category: "Navigation" },
];

interface KeyboardHelpProps {
  onClose: () => void;
}

export function KeyboardHelp({ onClose }: KeyboardHelpProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

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
        zIndex: 800,
        padding: "24px",
        animation: "fade-in 150ms ease both",
      }}
    >
      <div
        style={{
          width: "520px",
          maxWidth: "100%",
          background: "var(--color-bg-card)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
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
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              Keyboard Shortcuts
            </h2>
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px", marginBottom: 0 }}>
              Press Ctrl+/ to toggle this panel
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              lineHeight: 1,
              transition: "background 120ms ease, color 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)";
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
            }}
          >
            ✕
          </button>
        </div>

        {/* Shortcuts grouped by category */}
        <div style={{ padding: "16px 24px 20px", maxHeight: "70vh", overflowY: "auto" }}>
          {Array.from(new Set(SHORTCUTS.map((s) => s.category ?? "Other"))).map((cat) => (
            <div key={cat} style={{ marginBottom: "16px" }}>
              <p style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--color-text-disabled)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                margin: "0 0 8px",
              }}>
                {cat}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {SHORTCUTS.filter((s) => (s.category ?? "Other") === cat).map((shortcut) => (
                  <div
                    key={shortcut.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      padding: "9px 12px",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flex: 1, lineHeight: 1.3 }}>
                      {shortcut.description}
                    </span>
                    <kbd
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "3px 7px",
                        background: "var(--color-bg-elevated)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderBottom: "2px solid rgba(255,255,255,0.1)",
                        borderRadius: "5px",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        color: "#e0e0e0",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p style={{ marginTop: "8px", marginBottom: 0, fontSize: "11px", color: "var(--color-text-disabled)", textAlign: "center" }}>
            Press Escape or click outside to close
          </p>
        </div>
      </div>
    </div>
  );
}
