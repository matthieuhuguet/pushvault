import React, { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import type { BranchInfo } from "../../types";
import { useToastStore } from "../../store/toastStore";

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
  const addToast = useToastStore((s) => s.add);

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
      const data = await ipc.listBranches(repoPath);
      setBranches(data);
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
    if (!confirm(`Delete branch '${name}'? This cannot be undone.`)) return;
    try {
      await ipc.deleteBranch(repoPath, name, false);
      addToast("success", `Deleted branch '${name}'`);
      load();
    } catch (e) {
      addToast("error", `Failed to delete: ${e}`);
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
        background: "#282828",
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
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#b3b3b3" }}>
                {repoName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "#b3b3b3",
              cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "4px",
              borderRadius: "4px",
            }}
          >✕</button>
        </div>

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
              background: "#3d3d3d",
              border: "1px solid #535353",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#fff",
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
              background: "#3d3d3d",
              border: "1px solid #535353",
              borderRadius: "6px",
              padding: "8px 12px",
              color: "#fff",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Branch list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
          {loading ? (
            <p style={{ color: "#535353", textAlign: "center", padding: "32px" }}>
              Loading branches...
            </p>
          ) : (
            <>
              {/* Local branches */}
              <div style={{ marginBottom: "8px" }}>
                <p style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#b3b3b3",
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
                  />
                ))}
                {local.length === 0 && (
                  <p style={{ color: "#535353", fontSize: "13px", padding: "8px 0" }}>
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
                    color: "#b3b3b3",
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
}: {
  branch: BranchInfo;
  onSwitch: (name: string) => void;
  onDelete: (name: string) => void;
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
        background: branch.is_current ? "#1DB954" : "#535353",
        flexShrink: 0,
      }} />

      {/* Branch info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: "14px",
          fontWeight: branch.is_current ? 700 : 500,
          color: branch.is_current ? "#1DB954" : "#fff",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {branch.name}
        </p>
        {branch.last_commit && (
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#535353", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            style={{
              background: "#1DB954",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              color: "#000",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Switch
          </button>
          <button
            onClick={() => onDelete(branch.name)}
            style={{
              background: "rgba(232,82,90,0.2)",
              border: "1px solid rgba(232,82,90,0.4)",
              borderRadius: "4px",
              padding: "4px 8px",
              color: "#E8525A",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
