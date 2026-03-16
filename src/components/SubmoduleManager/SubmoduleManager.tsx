import React, { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";
import { useConfirmStore } from "../../store/confirmStore";

type Submodule = {
  path: string;
  url: string;
  head: string;
  status: string; // "clean" | "not_init" | "modified" | "conflict"
  describe: string;
};

interface SubmoduleManagerProps {
  repoPath: string;
  onClose: () => void;
}

type FormMode = "idle" | "add";

const STATUS_COLOR: Record<string, string> = {
  clean: "#1DB954",
  not_init: "#535353",
  modified: "#f59b00",
  conflict: "#e5534b",
};

const STATUS_LABEL: Record<string, string> = {
  clean: "Clean",
  not_init: "Not initialized",
  modified: "Modified",
  conflict: "Conflict",
};

export function SubmoduleManager({ repoPath, onClose }: SubmoduleManagerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const addToast = useToastStore((s) => s.add);

  const [submodules, setSubmodules] = useState<Submodule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("idle");
  const [updating, setUpdating] = useState(false);

  // Add form
  const [addUrl, setAddUrl] = useState("");
  const [addPath, setAddPath] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipc.listSubmodules(repoPath);
      setSubmodules(data as Submodule[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [repoPath]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (formMode !== "idle") setFormMode("idle");
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, formMode]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleUpdateAll = async () => {
    setUpdating(true);
    try {
      const msg = await ipc.updateSubmodules(repoPath);
      addToast("success", msg || "Submodules updated");
      load();
    } catch (e) {
      addToast("error", `Update failed: ${e}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleAdd = async () => {
    if (!addUrl.trim()) {
      addToast("error", "URL is required");
      return;
    }
    if (!addPath.trim()) {
      addToast("error", "Path is required");
      return;
    }
    setAddBusy(true);
    try {
      const msg = await ipc.addSubmodule(repoPath, addUrl.trim(), addPath.trim());
      addToast("success", msg);
      setFormMode("idle");
      setAddUrl("");
      setAddPath("");
      load();
    } catch (e) {
      addToast("error", `Add submodule failed: ${e}`);
    } finally {
      setAddBusy(false);
    }
  };

  const handleRemove = async (sub: Submodule) => {
    const ok = await useConfirmStore.getState().request({
      title: "Remove submodule?",
      description: `Remove submodule "${sub.path}"?\n\nThis will deinit and stage the removal. You'll need to commit afterward.`,
      danger: true,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      const msg = await ipc.removeSubmodule(repoPath, sub.path);
      addToast("success", msg);
      load();
    } catch (e) {
      addToast("error", `Remove failed: ${e}`);
    }
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "8px 12px",
    background: "var(--overlay-soft)",
    border: "1px solid var(--overlay-medium)",
    borderRadius: "7px",
    color: "#e0e0e0",
    fontSize: "13px",
    fontFamily: "inherit",
    outline: "none",
    minWidth: 0,
  };

  const hasUninitialized = submodules.some((s) => s.status === "not_init");
  const hasModified = submodules.some((s) => s.status === "modified");

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
        zIndex: 850,
        padding: "24px",
        animation: "fade-in 150ms ease both",
      }}
    >
      <div
        style={{
          width: "600px",
          maxWidth: "100%",
          maxHeight: "85vh",
          background: "var(--color-bg-card)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
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
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              Submodules
            </h2>
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px", marginBottom: 0 }}>
              {submodules.length} submodule{submodules.length !== 1 ? "s" : ""}
              {hasUninitialized && <span style={{ color: "var(--color-text-disabled)" }}> · some not initialized</span>}
              {hasModified && <span style={{ color: "#f59b00" }}> · some modified</span>}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Update All */}
            <button
              onClick={handleUpdateAll}
              disabled={updating}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 12px",
                background: updating ? "rgba(61,155,233,0.1)" : "rgba(61,155,233,0.12)",
                border: "1px solid rgba(61,155,233,0.3)",
                borderRadius: "8px",
                color: updating ? "rgba(61,155,233,0.5)" : "#3d9be9",
                fontSize: "12px",
                cursor: updating ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {updating ? (
                <span style={{
                  width: "11px",
                  height: "11px",
                  border: "2px solid rgba(61,155,233,0.3)",
                  borderTop: "2px solid #3d9be9",
                  borderRadius: "50%",
                  animation: "spin 0.6s linear infinite",
                  display: "inline-block",
                }} />
              ) : "⟳"}
              Update All
            </button>
            {/* Add */}
            <button
              onClick={() => setFormMode(formMode === "add" ? "idle" : "add")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 12px",
                background: formMode === "add" ? "rgba(29,185,84,0.15)" : "var(--overlay-light)",
                border: formMode === "add" ? "1px solid rgba(29,185,84,0.35)" : "1px solid var(--overlay-light)",
                borderRadius: "8px",
                color: formMode === "add" ? "#1DB954" : "#b3b3b3",
                fontSize: "12px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: "14px" }}>＋</span>
              Add
            </button>
            <button
              onClick={onClose}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "var(--overlay-light)",
                border: "none",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-strong)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* Add form */}
          {formMode === "add" && (
            <div style={{
              padding: "16px 24px",
              background: "rgba(29,185,84,0.04)",
              borderBottom: "1px solid var(--color-border-subtle)",
            }}>
              <p style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--color-text-disabled)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                margin: "0 0 10px",
              }}>
                Add Submodule
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "12px", color: "var(--color-text-muted)", width: "50px", flexShrink: 0 }}>
                    URL
                  </label>
                  <input
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo.git"
                    style={inputStyle}
                    autoFocus
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(29,185,84,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--overlay-medium)")}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "12px", color: "var(--color-text-muted)", width: "50px", flexShrink: 0 }}>
                    Path
                  </label>
                  <input
                    value={addPath}
                    onChange={(e) => setAddPath(e.target.value)}
                    placeholder="libs/my-lib"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(29,185,84,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--overlay-medium)")}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setFormMode("idle"); setAddUrl(""); setAddPath(""); }}
                    style={{
                      padding: "7px 14px",
                      background: "var(--overlay-subtle)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "7px",
                      color: "var(--color-text-secondary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={addBusy}
                    style={{
                      padding: "7px 14px",
                      background: addBusy ? "rgba(29,185,84,0.3)" : "#1DB954",
                      border: "none",
                      borderRadius: "7px",
                      color: addBusy ? "rgba(0,0,0,0.4)" : "#000",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: addBusy ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {addBusy && (
                      <span style={{
                        width: "11px",
                        height: "11px",
                        border: "2px solid rgba(0,0,0,0.3)",
                        borderTop: "2px solid #000",
                        borderRadius: "50%",
                        animation: "spin 0.6s linear infinite",
                        display: "inline-block",
                      }} />
                    )}
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Body */}
          <div style={{ padding: "12px 16px 20px" }}>
            {loading && (
              <p style={{ fontSize: "13px", color: "var(--color-text-disabled)", padding: "8px" }}>
                Loading submodules…
              </p>
            )}
            {error && (
              <div style={{
                padding: "10px 14px",
                background: "rgba(229,83,75,0.1)",
                border: "1px solid rgba(229,83,75,0.3)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#e5534b",
                margin: "8px",
              }}>
                {error}
              </div>
            )}

            {!loading && !error && submodules.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 24px" }}>
                <p style={{ fontSize: "14px", color: "var(--color-text-disabled)", marginBottom: "6px" }}>
                  No submodules found.
                </p>
                <p style={{ fontSize: "12px", color: "#3a3a3a" }}>
                  Add one using the button above.
                </p>
              </div>
            )}

            {!loading && !error && submodules.map((sub) => (
              <SubmoduleRow
                key={sub.path}
                sub={sub}
                onRemove={handleRemove}
              />
            ))}
          </div>

          {/* Info footer */}
          <div style={{
            padding: "10px 24px 14px",
            borderTop: "1px solid var(--overlay-soft)",
          }}>
            <p style={{ fontSize: "11px", color: "#3a3a3a", margin: 0 }}>
              "Update All" runs <code style={{ fontSize: "10px" }}>git submodule update --init --recursive</code>.
              Removing a submodule stages the change; commit afterward.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Submodule row ─────────────────────────────────────────── */
interface RowProps {
  sub: Submodule;
  onRemove: (sub: Submodule) => void;
}

function SubmoduleRow({ sub, onRemove }: RowProps) {
  const statusColor = STATUS_COLOR[sub.status] ?? "#535353";
  const statusLabel = STATUS_LABEL[sub.status] ?? sub.status;
  const subName = sub.path.split(/[/\\]/).pop() ?? sub.path;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px solid var(--overlay-soft)",
        background: "rgba(255,255,255,0.02)",
        marginBottom: "6px",
        transition: "border-color 120ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--overlay-light)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--overlay-soft)")}
    >
      {/* Status dot */}
      <div style={{
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: statusColor,
        boxShadow: `0 0 4px ${statusColor}88`,
        marginTop: "5px",
        flexShrink: 0,
      }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px" }}>
          <span style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#e0e0e0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {subName}
          </span>
          <span style={{
            fontSize: "10px",
            padding: "1px 6px",
            background: `${statusColor}18`,
            color: statusColor,
            border: `1px solid ${statusColor}33`,
            borderRadius: "8px",
            flexShrink: 0,
          }}>
            {statusLabel}
          </span>
          {sub.describe && (
            <span style={{ fontSize: "10px", color: "var(--color-text-disabled)", flexShrink: 0 }}>
              {sub.describe}
            </span>
          )}
        </div>

        <div style={{ fontSize: "11px", color: "#3d9be9", fontFamily: "monospace", marginBottom: "2px" }}>
          {sub.head || "—"}
          {" · "}
          <span style={{ color: "var(--color-text-disabled)" }}>{sub.path}</span>
        </div>

        <div style={{
          fontSize: "10px",
          color: "#3a3a3a",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {sub.url}
        </div>
      </div>

      {/* Remove button */}
      <button
        title="Remove submodule"
        onClick={() => onRemove(sub)}
        style={{
          padding: "5px 8px",
          background: "rgba(229,83,75,0.06)",
          border: "1px solid rgba(229,83,75,0.15)",
          borderRadius: "6px",
          color: "#e5534b",
          fontSize: "11px",
          cursor: "pointer",
          transition: "background 100ms ease",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(229,83,75,0.14)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(229,83,75,0.06)")}
      >
        ✕
      </button>
    </div>
  );
}
