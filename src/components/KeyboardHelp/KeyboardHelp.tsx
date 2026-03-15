import React, { useEffect, useRef } from "react";

const SHORTCUTS = [
  { key: "Ctrl+S", description: "Sync all repositories" },
  { key: "Ctrl+R", description: "Refresh all statuses" },
  { key: "Ctrl+K", description: "Focus search bar" },
  { key: "Ctrl+,", description: "Open settings" },
  { key: "Ctrl+N", description: "Clone from URL" },
  { key: "Ctrl+Enter", description: "Commit (in staging)" },
  { key: "Ctrl+Shift+Enter", description: "Commit + Push" },
  { key: "Ctrl+/", description: "Show keyboard shortcuts" },
  { key: "Escape", description: "Close panel / minimize to tray" },
  { key: "F5", description: "Refresh current view" },
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
          background: "#1e1e1e",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.1)",
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
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#fff", margin: 0 }}>
              Keyboard Shortcuts
            </h2>
            <p style={{ fontSize: "12px", color: "#6a6a6a", marginTop: "2px", marginBottom: 0 }}>
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
              color: "#b3b3b3",
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

        {/* Shortcuts grid */}
        <div style={{ padding: "20px 24px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: "#b3b3b3",
                    flex: 1,
                    lineHeight: 1.3,
                  }}
                >
                  {shortcut.description}
                </span>
                <kbd
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 7px",
                    background: "#282828",
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

          <p
            style={{
              marginTop: "16px",
              marginBottom: 0,
              fontSize: "11px",
              color: "#535353",
              textAlign: "center",
            }}
          >
            Press Escape or click outside to close
          </p>
        </div>
      </div>
    </div>
  );
}
