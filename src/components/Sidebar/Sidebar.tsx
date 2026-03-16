import React, { useState } from "react";
import type { NavTab } from "../../types";

/* ── Icon Components ────────────────────────────────────────── */
function IconHome({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        fill={color === "#1DB954" ? color + "22" : "none"}
      />
    </svg>
  );
}

function IconHistory({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <polyline points="12 7 12 12 15 15" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconActivity({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <polyline
        points="22 12 18 12 15 21 9 3 6 12 2 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSettings({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
      <path
        d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Nav item ───────────────────────────────────────────────── */
interface NavItemProps {
  tab: NavTab;
  activeTab: NavTab;
  label: string;
  icon: (color: string) => React.ReactNode;
  onClick: (tab: NavTab) => void;
}

function NavItem({ tab, activeTab, label, icon, onClick }: NavItemProps) {
  const isActive = tab === activeTab;
  const [hovered, setHovered] = useState(false);

  const iconColor = isActive ? "var(--color-text-primary)" : hovered ? "var(--color-text-primary)" : "var(--color-text-secondary)";

  return (
    <button
      onClick={() => onClick(tab)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        position: "relative",
        width: "64px",
        height: "56px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        background: "none",
        border: "none",
        cursor: "pointer",
        transition: "all 120ms ease",
        padding: 0,
      }}
    >
      {/* Active indicator — left border */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: "3px",
            height: "32px",
            background: "#1DB954",
            borderRadius: "0 3px 3px 0",
          }}
        />
      )}

      {/* Icon */}
      <div
        style={{
          transition: "transform 120ms ease",
          transform: hovered && !isActive ? "scale(1.1)" : "scale(1)",
        }}
      >
        {icon(iconColor)}
      </div>

      {/* Label */}
      <span
        style={{
          fontSize: "10px",
          fontWeight: isActive ? 700 : 400,
          color: iconColor,
          letterSpacing: "0.02em",
          transition: "color 120ms ease",
        }}
      >
        {label}
      </span>
    </button>
  );
}

/* ── Clone button ───────────────────────────────────────────── */
interface CloneButtonProps {
  onClick: () => void;
}

function CloneButton({ onClick }: CloneButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Clone repository"
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        background: hovered ? "#1ed760" : "#1DB954",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms ease, transform 120ms ease",
        transform: hovered ? "scale(1.08)" : "scale(1)",
        flexShrink: 0,
        marginBottom: "8px",
        boxShadow: hovered
          ? "0 0 16px rgba(29,185,84,0.5)"
          : "0 0 8px rgba(29,185,84,0.2)",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <line x1="12" y1="5" x2="12" y2="19" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="5" y1="12" x2="19" y2="12" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/* ── Sidebar ────────────────────────────────────────────────── */
interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onClone?: () => void;
}

export function Sidebar({ activeTab, setActiveTab, onClone }: SidebarProps) {
  return (
    <nav
      style={{
        width: "64px",
        height: "100vh",
        background: "var(--color-bg-base)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "8px",
        paddingBottom: "8px",
        flexShrink: 0,
        borderRight: "1px solid var(--color-border-subtle)",
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: "#1DB954",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
          flexShrink: 0,
          boxShadow: "0 0 20px rgba(29,185,84,0.35)",
        }}
      >
        <span
          style={{
            fontSize: "14px",
            fontWeight: 800,
            color: "#000",
            letterSpacing: "-0.5px",
            lineHeight: 1,
          }}
        >
          PV
        </span>
      </div>

      {/* Divider */}
      <div
        style={{
          width: "32px",
          height: "1px",
          background: "var(--color-border)",
          marginBottom: "8px",
          flexShrink: 0,
        }}
      />

      {/* Navigation items */}
      <NavItem
        tab="dashboard"
        activeTab={activeTab}
        label="Home"
        icon={(c) => <IconHome color={c} />}
        onClick={setActiveTab}
      />
      <NavItem
        tab="history"
        activeTab={activeTab}
        label="History"
        icon={(c) => <IconHistory color={c} />}
        onClick={setActiveTab}
      />
      <NavItem
        tab="activity"
        activeTab={activeTab}
        label="Activity"
        icon={(c) => <IconActivity color={c} />}
        onClick={setActiveTab}
      />

      {/* Push Settings to bottom */}
      <div style={{ flex: 1 }} />

      {onClone && <CloneButton onClick={onClone} />}

      <NavItem
        tab="settings"
        activeTab={activeTab}
        label="Settings"
        icon={(c) => <IconSettings color={c} />}
        onClick={setActiveTab}
      />
    </nav>
  );
}
