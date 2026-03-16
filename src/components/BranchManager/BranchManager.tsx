import React, { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import type { BranchInfo } from "../../types";
import { useToastStore } from "../../store/toastStore";
import { useConfirmStore } from "../../store/confirmStore";
import { usePromptStore } from "../../store/promptStore";

interface Props {
  repoPath: string;
  repoName?: string;
  onClose: () => void;
}

export function BranchManager({ repoPath, repoName, onClose }: Props) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [headInfo, setHeadInfo] = useState<{ is_detached: boolean; hash: string; message: string } | null>(null);
  const [detachBranchName, setDetachBranchName] = useState("");
  const addToast = useToastStore((s) => s.add);
  const requestConfirm = useConfirmStore((s) => s.request);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const load = async () => {
    setLoading(true);
    try {
      const [data, head] = await Promise.all([
        ipc.listBranches(repoPath),
        ipc.getHeadInfo(repoPath).catch(() => null),
      ]);
      setBranches(data);
      setHeadInfo(head);
      if (head?.is_detached) {
        setDetachBranchName(`detached-${head.hash.slice(0, 7)}`);
      }
    } catch (e) {
      addToast("error", `Failed to load branches: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [repoPath]);

  const handleSwitch = async (name: string) => {
    try {
      await ipc.switchBranch(repoPath, name);
      addToast("success", `Switched to branch '${name}'`);
      load();
    } catch (e) {
      addToast("error", `Failed to switch: ${e}`);
    }
  };

  const handleDelete = async (name: string) => {
    const ok = await requestConfirm({
      title: `Delete branch '${name}'`,
      description: `This will permanently delete the local branch. Unmerged commits on this branch will be lost. Remote tracking branches are not affected.`,
      danger: true,
      confirmLabel: "Delete Branch",
    });
    if (!ok) return;
    try {
      await ipc.deleteBranch(repoPath, name, false);
      addToast("success", `Deleted branch '${name}'`);
      load();
    } catch (e) {
      addToast("error", `Failed to delete: ${e}`);
    }
  };

  const handleMerge = async (name: string) => {
    const currentBranch = branches.find(b => b.is_current)?.name ?? "current branch";
    const ok = await useConfirmStore.getState().request({
      title: "Merge branch?",
      description: `Merge '${name}' into '${currentBranch}'?`,
      confirmLabel: "Merge",
    });
    if (!ok) return;
    try {
      await ipc.mergeBranch(repoPath, name);
      addToast("success", `Merged '${name}' into '${currentBranch}'`);
      load();
    } catch (e) {
      addToast("error", `Merge failed: ${e}`);
    }
  };

  const handlePush = async (name: string) => {
    try {
      addToast("info", `Pushing '${name}' to origin…`);
      const result = await ipc.pushBranch(repoPath, name);
      addToast("success", result || `Pushed '${name}'`);
      load();
    } catch (e) {
      addToast("error", `Push failed: ${e}`);
    }
  };

  const handleRename = async (name: string) => {
    const newName = await usePromptStore.getState().request({
      title: "Rename branch",
      description: `Enter a new name for branch '${name}':`,
      defaultValue: name,
      placeholder: "new-branch-name",
      confirmLabel: "Rename",
    });
    if (!newName?.trim() || newName.trim() === name) return;
    try {
      await ipc.renameBranch(repoPath, name, newName.trim());
      addToast("success", `Renamed '${name}' to '${newName.trim()}'`);
      load();
    } catch (e) {
      addToast("error", `Rename failed: ${e}`);
    }
  };

  const handleCreate = async () => {
    if (!newBranchName.trim()) return;
    setCreating(true);
    try {
      await ipc.createBranch(repoPath, newBranchName.trim());
      addToast("success", `Created branch '${newBranchName}'`);
      setNewBranchName("");
      load();
    } catch (e) {
      addToast("error", `Failed to create: ${e}`);
    } finally {
      setCreating(false);
    }
  };

  const handleBranchFromHead = async () => {
    const name = detachBranchName.trim();
    if (!name) return;
    try {
      await ipc.branchFromHead(repoPath, name);
      addToast("success", `Created branch '${name}' from detached HEAD`);
      load();
    } catch (e) {
      addToast("error", `Failed to create branch: ${e}`);
    }
  };

  const handlePruneRemote = async () => {
    setPruning(true);
    try {
      const pruned = await ipc.remotePrune(repoPath, "origin");
      if (pruned.length === 0) {
        addToast("info", "No stale remote-tracking branches found");
      } else {
        addToast("success", `Pruned ${pruned.length} stale branch(es): ${pruned.join(", ")}`);
        load();
      }
    } catch (e) {
      addToast("error", `Remote prune failed: ${e}`);
    } finally {
      setPruning(false);
    }
  };

  const filtered = branches.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );
  const local = filtered.filter(b => !b.is_remote);
  const remote = filtered.filter(b => b.is_remote);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "60px",
    }}>
      <div style={{
        background: "var(--color-bg-elevated)",
        borderRadius: "12px",
        width: "700px",
        maxWidth: "95vw",
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid #3d3d3d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
              Branch Manager
            </h2>
            {repoName && (
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                {repoName}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handlePruneRemote}
              disabled={pruning}
              title="Prune stale remote-tracking branches (git remote prune origin)"
              style={{
                background: "rgba(61,155,233,0.1)",
                border: "1px solid rgba(61,155,233,0.3)",
                borderRadius: "6px",
                padding: "6px 12px",
                color: "#3d9be9",
                fontSize: "12px",
                fontWeight: 600,
                cursor: pruning ? "not-allowed" : "pointer",
                opacity: pruning ? 0.6 : 1,
              }}
            >
              {pruning ? "Pruning…" : "✂ Prune Remote"}
            </button>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", color: "var(--color-text-secondary)",
                cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "4px",
                borderRadius: "4px",
              }}
            >✕</button>
          </div>
        </div>

        {/* Detached HEAD warning */}
        {headInfo?.is_detached && (
          <div style={{
            margin: "0 24px 0",
            padding: "12px 16px",
            background: "rgba(245,166,35,0.1)",
            border: "1px solid rgba(245,166,35,0.35)",
            borderRadius: "8px",
            marginTop: "12px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <span style={{ fontSize: "18px", flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 700, color: "#F5A623" }}>
                  Detached HEAD
                </p>
                <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                  You are not on any branch. Commit <code style={{ fontFamily: "monospace", fontSize: "11px", color: "#F5A623" }}>{headInfo.hash.slice(0, 8)}</code>
                  {headInfo.message ? ` — "${headInfo.message}"` : ""}. Create a branch to preserve your work.
                </p>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    value={detachBranchName}
                    onChange={e => setDetachBranchName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleBranchFromHead()}
                    placeholder="New branch name…"
                    style={{
                      flex: 1,
                      background: "var(--color-bg-highlight)",
                      border: "1px solid #535353",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      color: "var(--color-text-primary)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleBranchFromHead}
                    disabled={!detachBranchName.trim()}
                    style={{
                      background: "#F5A623",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 14px",
                      color: "#000",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: detachBranchName.trim() ? "pointer" : "not-allowed",
                      opacity: detachBranchName.trim() ? 1 : 0.5,
                    }}
                  >
                    Create Branch Here
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create new branch */}
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid #3d3d3d",
          display: "flex",
          gap: "8px",
        }}>
          <input
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="New branch name..."
            style={{
              flex: 1,
              background: "var(--color-bg-highlight)",
              border: "1px solid #535353",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "var(--color-text-primary)",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newBranchName.trim()}
            style={{
              background: "#1DB954",
              border: "none",
              borderRadius: "6px",
              padding: "8px 16px",
              color: "#000",
              fontSize: "14px",
              fontWeight: 700,
              cursor: creating ? "not-allowed" : "pointer",
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 24px" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter branches..."
            style={{
              width: "100%",
              background: "var(--color-bg-highlight)",
              border: "1px solid #535353",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "var(--color-text-primary)",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Branch list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
          {loading ? (
            <p style={{ color: "var(--color-text-disabled)", textAlign: "center", padding: "32px" }}>
              Loading branches...
            </p>
          ) : (
            <>
              {/* Local branches */}
              <div style={{ marginBottom: "8px" }}>
                <p style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--color-text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  margin: "0 0 8px",
                }}>
                  LOCAL ({local.length})
                </p>
                {local.map(branch => (
                  <BranchRow
                    key={branch.name}
                    branch={branch}
                    onSwitch={handleSwitch}
                    onDelete={handleDelete}
                    onMerge={handleMerge}
                    onPush={handlePush}
                    onRename={handleRename}
                  />
                ))}
                {local.length === 0 && (
                  <p style={{ color: "var(--color-text-disabled)", fontSize: "13px", padding: "8px 0" }}>
                    No local branches
                  </p>
                )}
              </div>

              {/* Remote branches */}
              {remote.length > 0 && (
                <div>
                  <p style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--color-text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    margin: "16px 0 8px",
                  }}>
                    REMOTE ({remote.length})
                  </p>
                  {remote.map(branch => (
                    <BranchRow
                      key={branch.name}
                      branch={branch}
                      onSwitch={handleSwitch}
                      onDelete={handleDelete}
                      onMerge={handleMerge}
                      onPush={handlePush}
                      onRename={handleRename}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BranchRow({
  branch,
  onSwitch,
  onDelete,
  onMerge,
  onPush,
  onRename,
}: {
  branch: BranchInfo;
  onSwitch: (name: string) => void;
  onDelete: (name: string) => void;
  onMerge: (name: string) => void;
  onPush: (name: string) => void;
  onRename: (name: string) => void;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "10px 12px",
      borderRadius: "6px",
      background: branch.is_current ? "rgba(29,185,84,0.1)" : "transparent",
      border: branch.is_current ? "1px solid rgba(29,185,84,0.3)" : "1px solid transparent",
      marginBottom: "4px",
      gap: "12px",
    }}>
      {/* Current indicator */}
      <div style={{
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: branch.is_current ? "#1DB954" : branch.is_remote ? "#3d9be9" : "#535353",
        flexShrink: 0,
      }} />

      {/* Branch info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: "14px",
          fontWeight: branch.is_current ? 700 : 500,
          color: branch.is_current ? "#1DB954" : branch.is_remote ? "#3d9be9" : "#fff",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {branch.name}
        </p>
        {branch.last_commit && (
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-text-disabled)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {branch.last_commit} · {branch.last_commit_time}
          </p>
        )}
      </div>

      {/* Ahead/behind badges */}
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        {branch.ahead > 0 && (
          <span style={{
            background: "rgba(29,185,84,0.2)",
            color: "#1DB954",
            fontSize: "11px",
            padding: "2px 6px",
            borderRadius: "10px",
            fontWeight: 600,
          }}>↑{branch.ahead}</span>
        )}
        {branch.behind > 0 && (
          <span style={{
            background: "rgba(245,166,35,0.2)",
            color: "#F5A623",
            fontSize: "11px",
            padding: "2px 6px",
            borderRadius: "10px",
            fontWeight: 600,
          }}>↓{branch.behind}</span>
        )}
      </div>

      {/* Actions */}
      {!branch.is_current && !branch.is_remote && (
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          <button
            onClick={() => onSwitch(branch.name)}
            title="Switch to this branch"
            style={{
              background: "#1DB954",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              color: "#000",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#1ed760")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#1DB954")}
          >
            Switch
          </button>
          <button
            onClick={() => onMerge(branch.name)}
            title="Merge this branch into the current branch"
            style={{
              background: "rgba(161,97,239,0.15)",
              border: "1px solid rgba(161,97,239,0.35)",
              borderRadius: "4px",
              padding: "4px 8px",
              color: "#a371f7",
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(161,97,239,0.28)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(161,97,239,0.15)")}
          >
            Merge
          </button>
          {branch.ahead > 0 && (
            <button
              onClick={() => onPush(branch.name)}
              title="Push this branch to origin"
              style={{
                background: "rgba(61,155,233,0.15)",
                border: "1px solid rgba(61,155,233,0.35)",
                borderRadius: "4px",
                padding: "4px 8px",
                color: "#3d9be9",
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 120ms ease",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(61,155,233,0.28)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(61,155,233,0.15)")}
            >
              Push
            </button>
          )}
          <button
            onClick={() => onRename(branch.name)}
            title="Rename this branch"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "4px",
              padding: "4px 8px",
              color: "var(--color-text-secondary)",
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
            }}
          >
            Rename
          </button>
          <button
            onClick={() => onDelete(branch.name)}
            title="Delete this branch"
            style={{
              background: "rgba(232,82,90,0.15)",
              border: "1px solid rgba(232,82,90,0.35)",
              borderRadius: "4px",
              padding: "4px 8px",
              color: "#E8525A",
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(232,82,90,0.28)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(232,82,90,0.15)")}
          >
            Delete
          </button>
        </div>
      )}
      {branch.is_current && (
        <span style={{ fontSize: "11px", color: "#1DB954", fontWeight: 600, flexShrink: 0 }}>
          current
        </span>
      )}
    </div>
  );
}
