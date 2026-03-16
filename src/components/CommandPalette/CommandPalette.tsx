import React, { useState, useRef, useEffect, useMemo } from "react";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { useToastStore } from "../../store/toastStore";
import { ipc } from "../../lib/ipc";

interface Command {
  id: string;
  label: string;
  description?: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

interface Props {
  onClose: () => void;
  onShowKeyboardHelp: () => void;
  onShowClone: () => void;
  onShowScan: () => void;
}

export function CommandPalette({ onClose, onShowKeyboardHelp, onShowClone, onShowScan }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const config = useRepoStore((s) => s.config);
  const refreshAllStatuses = useRepoStore((s) => s.refreshAllStatuses);
  const { setActiveTab, setActivePanel, setSelectedRepoPath } = useUIStore();
  const addToast = useToastStore((s) => s.add);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const commands = useMemo<Command[]>(() => {
    const global: Command[] = [
      {
        id: "sync-all",
        label: "Sync All",
        description: "Fetch, pull and push all repos",
        category: "Global",
        shortcut: "Ctrl+S",
        action: async () => {
          onClose();
          try {
            const results = await ipc.syncAll();
            const ok = results.filter((r) => r.success).length;
            addToast("success", `Synced ${ok} repositories`);
            refreshAllStatuses();
          } catch (e) {
            addToast("error", `Sync failed: ${e}`);
          }
        },
      },
      {
        id: "refresh",
        label: "Refresh All Statuses",
        description: "Check status of all repos",
        category: "Global",
        shortcut: "Ctrl+R",
        action: () => {
          onClose();
          refreshAllStatuses();
        },
      },
      {
        id: "clone",
        label: "Clone Repository",
        description: "Clone from URL",
        category: "Global",
        shortcut: "Ctrl+N",
        action: () => {
          onClose();
          onShowClone();
        },
      },
      {
        id: "scan",
        label: "Scan for Repositories",
        description: "Find git repos in a folder",
        category: "Global",
        action: () => {
          onClose();
          onShowScan();
        },
      },
      {
        id: "settings",
        label: "Open Settings",
        description: "App preferences",
        category: "Global",
        shortcut: "Ctrl+,",
        action: () => {
          onClose();
          setActiveTab("settings");
        },
      },
      {
        id: "activity",
        label: "Open Activity Log",
        category: "Global",
        action: () => {
          onClose();
          setActiveTab("activity");
        },
      },
      {
        id: "keyboard",
        label: "Keyboard Shortcuts",
        category: "Global",
        shortcut: "Ctrl+/",
        action: () => {
          onClose();
          onShowKeyboardHelp();
        },
      },
    ];

    const repoCommands: Command[] = (config?.repos ?? []).flatMap((repo) => [
      {
        id: `push-${repo.path}`,
        label: `Push · ${repo.name}`,
        description: repo.path,
        category: "Repository",
        action: async () => {
          onClose();
          try {
            await ipc.pushRepo(repo.path, "chore: push via PushVault");
            addToast("success", `Pushed ${repo.name}`);
            refreshAllStatuses();
          } catch (e) {
            addToast("error", `Push failed: ${e}`);
          }
        },
      },
      {
        id: `pull-${repo.path}`,
        label: `Pull · ${repo.name}`,
        description: "Pull latest changes from remote",
        category: "Repository",
        action: async () => {
          onClose();
          try {
            await ipc.pullRepo(repo.path);
            addToast("success", `Pulled ${repo.name}`);
            refreshAllStatuses();
          } catch (e) {
            addToast("error", `Pull failed: ${e}`);
          }
        },
      },
      {
        id: `sync-${repo.path}`,
        label: `Sync · ${repo.name}`,
        description: "Pull then push (sync with remote)",
        category: "Repository",
        action: async () => {
          onClose();
          try {
            const result = await ipc.syncRepoWithProgress(repo.path, "chore: sync via PushVault");
            addToast(result.success ? "success" : "error", result.message || `Synced ${repo.name}`);
            refreshAllStatuses();
          } catch (e) {
            addToast("error", `Sync failed: ${e}`);
          }
        },
      },
      {
        id: `terminal-${repo.path}`,
        label: `Open in Terminal · ${repo.name}`,
        description: "Open repo in Windows Terminal / cmd",
        category: "Repository",
        action: async () => {
          onClose();
          try {
            await ipc.openInTerminal(repo.path);
          } catch (e) {
            addToast("error", `Failed to open terminal: ${e}`);
          }
        },
      },
      {
        id: `explorer-${repo.path}`,
        label: `Open in Explorer · ${repo.name}`,
        description: "Open repo folder in File Explorer",
        category: "Repository",
        action: async () => {
          onClose();
          try {
            await ipc.openInExplorer(repo.path);
          } catch (e) {
            addToast("error", `Failed to open Explorer: ${e}`);
          }
        },
      },
      {
        id: `changes-${repo.path}`,
        label: `Open Changes · ${repo.name}`,
        description: "View staged and unstaged changes",
        category: "Repository",
        action: () => {
          onClose();
          setSelectedRepoPath(repo.path);
          setActivePanel("staging");
        },
      },
      {
        id: `history-${repo.path}`,
        label: `View History · ${repo.name}`,
        description: "Commit log",
        category: "Repository",
        action: () => {
          onClose();
          setSelectedRepoPath(repo.path);
          setActivePanel("history");
        },
      },
      {
        id: `gc-${repo.path}`,
        label: `Git GC · ${repo.name}`,
        description: "Run git garbage collection",
        category: "Maintenance",
        action: async () => {
          onClose();
          try {
            addToast("info", `Running GC on ${repo.name}…`);
            const result = await ipc.gitGc(repo.path);
            addToast("success", result || `GC done on ${repo.name}`);
          } catch (e) {
            addToast("error", `GC failed: ${e}`);
          }
        },
      },
      {
        id: `fetch-prune-${repo.path}`,
        label: `Fetch & Prune · ${repo.name}`,
        description: "Fetch and remove stale remote-tracking refs",
        category: "Maintenance",
        action: async () => {
          onClose();
          try {
            await ipc.fetchPrune(repo.path);
            addToast("success", `Fetch & prune done on ${repo.name}`);
            refreshAllStatuses();
          } catch (e) {
            addToast("error", `Fetch & prune failed: ${e}`);
          }
        },
      },
    ]);

    return [...global, ...repoCommands];
  }, [config, onClose, onShowClone, onShowKeyboardHelp, onShowScan, addToast, refreshAllStatuses, setActivePanel, setActiveTab, setSelectedRepoPath]);

  const filtered = useMemo(() => {
    if (!query) return commands.slice(0, 12);
    const q = query.toLowerCase();
    return commands
      .filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [commands, query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && filtered[selected]) {
      filtered[selected].action();
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelected(0);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "80px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#2a2a2a",
          borderRadius: "12px",
          width: "560px",
          maxWidth: "90vw",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            borderBottom: "1px solid #3d3d3d",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path
              d="m21 21-4.35-4.35"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder="Search commands…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              padding: "14px 12px",
              color: "var(--color-text-primary)",
              fontSize: "15px",
              outline: "none",
            }}
          />
          <kbd
            style={{
              background: "var(--color-bg-highlight)",
              border: "1px solid #535353",
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "11px",
              color: "var(--color-text-secondary)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: "400px", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <p
              style={{
                color: "var(--color-text-disabled)",
                textAlign: "center",
                padding: "24px",
                fontSize: "14px",
              }}
            >
              No commands found
            </p>
          ) : (
            filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                onClick={cmd.action}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 16px",
                  cursor: "pointer",
                  background: i === selected ? "rgba(29,185,84,0.1)" : "transparent",
                  borderLeft:
                    i === selected ? "2px solid #1DB954" : "2px solid transparent",
                  gap: "12px",
                }}
                onMouseEnter={() => setSelected(i)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      color: "var(--color-text-primary)",
                      fontWeight: i === selected ? 600 : 400,
                    }}
                  >
                    {cmd.label}
                  </p>
                  {cmd.description && (
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "11px",
                        color: "var(--color-text-disabled)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cmd.description}
                    </p>
                  )}
                </div>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "var(--color-text-disabled)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    flexShrink: 0,
                  }}
                >
                  {cmd.category}
                </span>
                {cmd.shortcut && (
                  <kbd
                    style={{
                      background: "var(--color-bg-highlight)",
                      border: "1px solid #535353",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontSize: "11px",
                      color: "var(--color-text-secondary)",
                      flexShrink: 0,
                    }}
                  >
                    {cmd.shortcut}
                  </kbd>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #3d3d3d",
            display: "flex",
            gap: "16px",
            fontSize: "11px",
            color: "var(--color-text-disabled)",
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ execute</span>
          <span>ESC close</span>
        </div>
      </div>
    </div>
  );
}
