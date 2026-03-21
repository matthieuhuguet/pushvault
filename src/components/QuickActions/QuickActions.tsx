import React, { useState } from "react";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { useToastStore } from "../../store/toastStore";
import { ipc } from "../../lib/ipc";

interface QuickAction {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  spinning?: boolean;
}

export function QuickActions({ onClone, onScan }: { onClone: () => void; onScan: () => void }) {
  const refreshAllStatuses = useRepoStore((s) => s.refreshAllStatuses);
  const config = useRepoStore((s) => s.config);
  const { isSyncing, setIsSyncing, setSyncProgress, setActivePanel, setSelectedRepoPath } = useUIStore();
  const addToast = useToastStore((s) => s.add);
  const [refreshing, setRefreshing] = useState(false);

  const handleSyncAll = async () => {
    if (isSyncing) return;
    const repos = config?.repos ?? [];
    if (!repos.length) { addToast("info", "No repositories to sync"); return; }
    setIsSyncing(true);
    setSyncProgress("Syncing all repositories…");
    try {
      const results = await ipc.syncAll();
      const succeeded = results.filter((r: any) => r.success).length;
      const failed = results.filter((r: any) => !r.success).length;
      setIsSyncing(false);
      setSyncProgress("");
      await refreshAllStatuses();
      if (failed === 0) addToast("success", `Synced ${succeeded} repositories`);
      else addToast("warning", `Synced ${succeeded}, ${failed} failed`);
    } catch (e) {
      setIsSyncing(false);
      setSyncProgress("");
      addToast("error", `Sync failed: ${e}`);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshAllStatuses();
      addToast("info", "Statuses refreshed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenFirst = () => {
    const first = config?.repos?.[0];
    if (first) {
      setSelectedRepoPath(first.path);
      setActivePanel("staging");
    }
  };

  const actions: QuickAction[] = [
    {
      id: "sync-all",
      label: "Sync All",
      shortcut: "Ctrl+S",
      accent: true,
      spinning: isSyncing,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M23 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: handleSyncAll,
    },
    {
      id: "refresh",
      label: "Refresh",
      shortcut: "F5",
      spinning: refreshing,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <polyline points="23 4 23 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20.49 15A9 9 0 1 1 21 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      onClick: handleRefresh,
    },
    {
      id: "clone",
      label: "Clone",
      shortcut: "Ctrl+N",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      onClick: onClone,
    },
    {
      id: "scan",
      label: "Scan",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      onClick: onScan,
    },
    {
      id: "open-first",
      label: "Open Staging",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      onClick: handleOpenFirst,
    },
    {
      id: "command-palette",
      label: "Commands",
      shortcut: "Ctrl+P",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      ),
      onClick: () => {
        // Dispatch Ctrl+P programmatically
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true }));
      },
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "16px",
        flexShrink: 0,
        flexWrap: "wrap",
      }}
    >
      {actions.map((a) => (
        <ActionButton key={a.id} action={a} />
      ))}
    </div>
  );
}

function ActionButton({ action }: { action: QuickAction }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      title={action.label + (action.shortcut ? ` (${action.shortcut})` : "")}
      onClick={action.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        background: hovered
          ? action.accent
            ? "var(--color-accent-dim)"
            : "var(--overlay-light)"
          : action.accent
            ? "var(--color-success-dim)"
            : "var(--overlay-subtle)",
        border: `1px solid ${
          action.accent
            ? hovered ? "var(--color-accent-border)" : "var(--color-success-border)"
            : hovered ? "var(--color-border)" : "var(--color-border-subtle)"
        }`,
        borderRadius: "8px",
        color: hovered
          ? action.accent
            ? "var(--color-accent)"
            : "var(--color-text-primary)"
          : action.accent
            ? "var(--color-accent)"
            : "var(--color-text-secondary)",
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 120ms ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          animation: action.spinning ? "spin 0.8s linear infinite" : undefined,
        }}
      >
        {action.icon}
      </span>
      {action.label}
      {action.shortcut && (
        <kbd
          style={{
            fontSize: "9px",
            color: "var(--color-text-disabled)",
            background: "var(--overlay-subtle)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "3px",
            padding: "1px 4px",
            letterSpacing: "0.03em",
            lineHeight: 1.2,
          }}
        >
          {action.shortcut}
        </kbd>
      )}
    </button>
  );
}
