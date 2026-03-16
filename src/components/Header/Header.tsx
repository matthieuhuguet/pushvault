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
  const { searchQuery, setSearchQuery } = useUIStore();
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
      style={{
        height: "80px",
        background: "var(--color-bg-primary)",
        borderBottom: "1px solid var(--color-border-subtle)",
        display: "flex",
        alignItems: "center",
        paddingLeft: "28px",
        paddingRight: "24px",
        gap: "20px",
        flexShrink: 0,
        position: "relative",
        zIndex: 5,
      }}
    >
      {/* Greeting */}
      <div style={{ flex: "0 0 auto" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            lineHeight: 1.2,
            letterSpacing: "-0.3px",
          }}
        >
          {greeting}
        </h1>
        <p
          style={{
            fontSize: "12px",
            color: "var(--color-text-muted)",
            marginTop: "1px",
          }}
        >
          PushVault — Git Sync Manager
        </p>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: inputFocused ? "var(--color-bg-hover)" : "var(--color-bg-elevated)",
          border: `1px solid ${inputFocused ? "var(--color-accent)" : "var(--color-border)"}`,
          borderRadius: "24px",
          padding: "8px 16px",
          width: "280px",
          transition: "border-color 150ms ease, background 150ms ease, box-shadow 150ms ease",
          boxShadow: inputFocused ? "0 0 0 2px rgba(29,185,84,0.15)" : "none",
        }}
      >
        <SearchIcon />
        <input
          id="search-input"
          ref={inputRef}
          type="text"
          placeholder="Search repos…  Ctrl+K"
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
              background: "rgba(255,255,255,0.1)",
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
                "rgba(255,255,255,0.2)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.1)")
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
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              padding: "1px 5px",
              letterSpacing: "0.05em",
              flexShrink: 0,
            }}
          >
            ⌃K
          </kbd>
        )}
      </div>

      {/* Version badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px 12px",
          background: "rgba(29,185,84,0.1)",
          border: "1px solid rgba(29,185,84,0.25)",
          borderRadius: "20px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#1DB954",
            boxShadow: "0 0 6px rgba(29,185,84,0.8)",
          }}
        />
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#1DB954",
            letterSpacing: "0.04em",
          }}
        >
          v4.0.0
        </span>
      </div>
    </header>
  );
}
