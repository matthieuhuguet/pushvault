import React, { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";
import type { TagInfo } from "../../types";

interface Props {
  repoPath: string;
  repoName?: string;
  onClose: () => void;
}

export function TagManager({ repoPath, repoName, onClose }: Props) {
  const addToast = useToastStore((s) => s.add);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [createTarget, setCreateTarget] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ipc.listTags(repoPath);
      setTags(data);
    } catch (e) {
      addToast("error", `Failed to load tags: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    load();
  }, [load]);

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDelete) {
          setConfirmDelete(null);
          return;
        }
        if (showCreateForm) {
          setShowCreateForm(false);
          return;
        }
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, confirmDelete, showCreateForm]);

  // Focus name input when create form opens
  useEffect(() => {
    if (showCreateForm) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [showCreateForm]);

  const handleCreate = async () => {
    if (!createName.trim()) {
      addToast("warning", "Tag name is required");
      return;
    }
    setIsCreating(true);
    try {
      await ipc.createTag(
        repoPath,
        createName.trim(),
        createMessage.trim() || null,
        createTarget.trim() || null,
      );
      addToast("success", `Tag "${createName.trim()}" created`);
      setCreateName("");
      setCreateMessage("");
      setCreateTarget("");
      setShowCreateForm(false);
      await load();
    } catch (e) {
      addToast("error", `Failed to create tag: ${e}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    setIsDeleting(true);
    try {
      await ipc.deleteTag(repoPath, name);
      addToast("success", `Tag "${name}" deleted`);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      addToast("error", `Failed to delete tag: ${e}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#282828",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "#fff",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 150ms ease",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(6px)",
        zIndex: 600,
        display: "flex",
        flexDirection: "column",
        animation: "fade-in 150ms ease both",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "56px",
          background: "#1a1a1a",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: "16px",
          flexShrink: 0,
        }}
      >
        {/* Tag icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
            stroke="#1DB954"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="7" cy="7" r="1.5" fill="#1DB954" />
        </svg>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#fff", flex: 1 }}>
          {repoName ?? "Repo"}
          <span style={{ fontSize: "12px", color: "#6a6a6a", fontWeight: 400, marginLeft: "10px" }}>
            Tags
          </span>
        </h2>

        {/* Create tag button */}
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          style={{
            height: "32px",
            padding: "0 14px",
            borderRadius: "16px",
            background: showCreateForm ? "rgba(29,185,84,0.2)" : "rgba(29,185,84,0.12)",
            border: "1px solid rgba(29,185,84,0.3)",
            color: "#1DB954",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,185,84,0.25)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = showCreateForm
              ? "rgba(29,185,84,0.2)"
              : "rgba(29,185,84,0.12)";
          }}
        >
          + New Tag
        </button>

        {/* Close button */}
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
            transition: "background 120ms ease, color 120ms ease",
            lineHeight: 1,
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

      {/* Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Main panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Create form */}
          {showCreateForm && (
            <div
              style={{
                padding: "16px 20px",
                background: "#1e1e1e",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                animation: "fade-in 150ms ease both",
              }}
            >
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#b3b3b3", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Create New Tag
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 140px", minWidth: "140px" }}>
                  <label style={{ fontSize: "11px", color: "#6a6a6a", display: "block", marginBottom: "4px" }}>
                    Tag Name *
                  </label>
                  <input
                    ref={nameInputRef}
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="v1.0.0"
                    style={inputStyle}
                    onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "#1DB954")}
                    onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </div>
                <div style={{ flex: "1 1 140px", minWidth: "140px" }}>
                  <label style={{ fontSize: "11px", color: "#6a6a6a", display: "block", marginBottom: "4px" }}>
                    Target (default: HEAD)
                  </label>
                  <input
                    value={createTarget}
                    onChange={(e) => setCreateTarget(e.target.value)}
                    placeholder="HEAD or commit hash"
                    style={inputStyle}
                    onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "#1DB954")}
                    onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)")}
                  />
                </div>
                <div style={{ flex: "2 1 280px" }}>
                  <label style={{ fontSize: "11px", color: "#6a6a6a", display: "block", marginBottom: "4px" }}>
                    Message (annotated tag — leave empty for lightweight)
                  </label>
                  <input
                    value={createMessage}
                    onChange={(e) => setCreateMessage(e.target.value)}
                    placeholder="Release v1.0.0"
                    style={inputStyle}
                    onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "#1DB954")}
                    onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowCreateForm(false)}
                  style={{
                    padding: "7px 16px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "500px",
                    color: "#b3b3b3",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !createName.trim()}
                  style={{
                    padding: "7px 20px",
                    background: isCreating || !createName.trim() ? "#282828" : "#1DB954",
                    border: "none",
                    borderRadius: "500px",
                    color: isCreating || !createName.trim() ? "#535353" : "#000",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: isCreating || !createName.trim() ? "not-allowed" : "pointer",
                    transition: "all 150ms ease",
                  }}
                >
                  {isCreating ? "Creating…" : "Create Tag"}
                </button>
              </div>
            </div>
          )}

          {/* Tag list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div
                style={{
                  padding: "48px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  color: "#6a6a6a",
                  fontSize: "13px",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#1DB954" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Loading tags…
              </div>
            ) : tags.length === 0 ? (
              <div
                style={{
                  padding: "64px 32px",
                  textAlign: "center",
                  color: "#535353",
                }}
              >
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ display: "block", margin: "0 auto 16px", opacity: 0.3 }}
                >
                  <path
                    d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
                    stroke="#b3b3b3"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <circle cx="7" cy="7" r="1.5" fill="#b3b3b3" />
                </svg>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
                  No tags yet
                </p>
                <p style={{ fontSize: "13px" }}>
                  Create a tag to mark releases or milestones.
                </p>
              </div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {/* Column headers */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 120px 32px",
                    gap: "12px",
                    padding: "6px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#535353",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <span>Name / Message</span>
                  <span>Type</span>
                  <span>Target</span>
                  <span></span>
                </div>

                {tags.map((tag, idx) => (
                  <div
                    key={tag.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 120px 32px",
                      gap: "12px",
                      padding: "10px 20px",
                      alignItems: "center",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      animation: `fade-in 200ms ease ${idx * 20}ms both`,
                      transition: "background 100ms ease",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background = "transparent")
                    }
                  >
                    {/* Name + message */}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: tag.message ? "3px" : 0,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "#1DB954",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {tag.name}
                        </span>
                        {tag.tagger && (
                          <span style={{ fontSize: "11px", color: "#535353", flexShrink: 0 }}>
                            by {tag.tagger}
                          </span>
                        )}
                      </div>
                      {tag.message && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#b3b3b3",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {tag.message}
                        </div>
                      )}
                      {tag.date && (
                        <div style={{ fontSize: "10px", color: "#535353", marginTop: "1px" }}>
                          {tag.date}
                        </div>
                      )}
                    </div>

                    {/* Type badge */}
                    <div>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "10px",
                          background: tag.is_annotated
                            ? "rgba(29,185,84,0.12)"
                            : "rgba(255,255,255,0.06)",
                          color: tag.is_annotated ? "#1DB954" : "#b3b3b3",
                        }}
                      >
                        {tag.is_annotated ? "Annotated" : "Lightweight"}
                      </span>
                    </div>

                    {/* Hash */}
                    <div>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "11px",
                          color: "#3d9be9",
                          background: "rgba(61,155,233,0.1)",
                          border: "1px solid rgba(61,155,233,0.15)",
                          borderRadius: "5px",
                          padding: "1px 6px",
                        }}
                      >
                        {tag.target_hash.slice(0, 7)}
                      </span>
                    </div>

                    {/* Delete button */}
                    <div>
                      {confirmDelete === tag.name ? (
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            onClick={() => handleDelete(tag.name)}
                            disabled={isDeleting}
                            title="Confirm delete"
                            style={{
                              width: "26px",
                              height: "26px",
                              borderRadius: "5px",
                              background: "rgba(229,83,75,0.2)",
                              border: "1px solid rgba(229,83,75,0.4)",
                              color: "#e5534b",
                              cursor: "pointer",
                              fontSize: "11px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                            }}
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            title="Cancel"
                            style={{
                              width: "26px",
                              height: "26px",
                              borderRadius: "5px",
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "#b3b3b3",
                              cursor: "pointer",
                              fontSize: "11px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(tag.name)}
                          title="Delete tag"
                          style={{
                            width: "26px",
                            height: "26px",
                            borderRadius: "5px",
                            background: "transparent",
                            border: "none",
                            color: "#535353",
                            cursor: "pointer",
                            fontSize: "13px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "color 100ms ease, background 100ms ease",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = "#e5534b";
                            (e.currentTarget as HTMLButtonElement).style.background = "rgba(229,83,75,0.1)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = "#535353";
                            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
