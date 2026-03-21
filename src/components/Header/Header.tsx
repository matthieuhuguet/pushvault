import React, { useEffect, useRef, useState } from "react";
import { useUIStore } from "../../store/uiStore";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <circle cx="11" cy="11" r="8" stroke="#b3b3b3" strokeWidth="2" />
      <path d="m21 21-4.35-4.35" stroke="#b3b3b3" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M23 4v6h-6M1 20v-6h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Header() {
  const { searchQuery, setSearchQuery, activeFilter, setActiveFilter, theme } = useUIStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [greeting] = useState(getGreeting);
  const [inputFocused, setInputFocused] = useState(false);

  // Focus on Ctrl+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <header
      data-tauri-drag-region
      style={{
        height: "72px",
        background: "var(--color-bg-primary)",
        borderBottom: "1px solid var(--color-border-subtle)",
        display: "flex",
        alignItems: "center",
        paddingLeft: "28px",
        paddingRight: "24px",
        gap: "16px",
        flexShrink: 0,
        position: "relative",
        zIndex: 5,
        backdropFilter: theme === "dark" ? "blur(20px) saturate(1.4)" : undefined,
        WebkitBackdropFilter: theme === "dark" ? "blur(20px) saturate(1.4)" : undefined,
      }}
    >
      {/* Greeting */}
      <div style={{ flex: "0 0 auto" }}>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            lineHeight: 1.2,
            letterSpacing: "-0.4px",
          }}
        >
          {greeting}
        </h1>
        <p
          style={{
            fontSize: "11px",
            color: "var(--color-text-muted)",
            marginTop: "2px",
            letterSpacing: "0.02em",
          }}
        >
          PushVault — Git Sync Manager
        </p>
      </div>

      {/* Spacer — draggable area */}
      <div data-tauri-drag-region style={{ flex: 1 }} />

      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: inputFocused
            ? "var(--color-bg-hover)"
            : "var(--overlay-subtle)",
          border: `1px solid ${inputFocused ? "var(--color-accent)" : "var(--color-border)"}`,
          borderRadius: "10px",
          padding: "7px 14px",
          width: "260px",
          transition: "border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, width 200ms ease",
          boxShadow: inputFocused ? "0 0 0 3px var(--color-accent-dim)" : "none",
        }}
      >
        <SearchIcon />
        <input
          id="search-input"
          ref={inputRef}
          type="text"
          placeholder="Search repos…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: "var(--color-text-primary)",
            fontSize: "13px",
            padding: 0,
            minWidth: 0,
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{
              background: "var(--overlay-light)",
              border: "none",
              borderRadius: "50%",
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
              fontSize: "10px",
              padding: 0,
              flexShrink: 0,
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background =
                "var(--overlay-vivid)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background =
                "var(--overlay-light)")
            }
          >
            ✕
          </button>
        )}
        {!searchQuery && (
          <kbd
            style={{
              fontSize: "10px",
              color: "var(--color-text-muted)",
              background: "var(--overlay-subtle)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              padding: "1px 5px",
              letterSpacing: "0.05em",
              flexShrink: 0,
            }}
          >
            ⌘K
          </kbd>
        )}
      </div>

      {/* Active filter badge */}
      {activeFilter !== "all" && (
        <button
          onClick={() => setActiveFilter("all")}
          title="Click to clear filter"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "4px 10px",
            background: "var(--color-info-dim)",
            border: "1px solid var(--color-info-border)",
            borderRadius: "8px",
            flexShrink: 0,
            cursor: "pointer",
            transition: "all 120ms ease",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--color-info)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-info-border)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-info-dim)";
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {activeFilter.replace(/_/g, " ")}
          <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>✕</span>
        </button>
      )}

      {/* Version badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          padding: "4px 10px",
          background: "var(--color-accent-dim)",
          border: "1px solid var(--color-accent-border)",
          borderRadius: "8px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: "var(--color-accent)",
            boxShadow: "0 0 6px var(--color-accent)",
          }}
        />
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--color-accent)",
            letterSpacing: "0.03em",
          }}
        >
          v4.5.0
        </span>
      </div>
    </header>
  );
}
