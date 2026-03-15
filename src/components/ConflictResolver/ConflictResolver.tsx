import React, { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import type { ConflictFile } from "../../types";
import { useToastStore } from "../../store/toastStore";

interface Props {
  repoPath: string;
  repoName?: string;
  onClose: () => void;
}

interface ResolvedSet {
  [filePath: string]: boolean;
}

export function ConflictResolver({ repoPath, repoName, onClose }: Props) {
  const [conflicts, setConflicts] = useState<ConflictFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState<ResolvedSet>({});
  const [selectedFile, setSelectedFile] = useState<ConflictFile | null>(null);
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
      const data = await ipc.getConflictedFiles(repoPath);
      setConflicts(data);
      if (data.length > 0 && !selectedFile) {
        setSelectedFile(data[0]);
      }
    } catch (e) {
      addToast("error", `Failed to load conflicts: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [repoPath]);

  const handleResolveOurs = async (file: ConflictFile) => {
    try {
      await ipc.resolveUsingOurs(repoPath, file.path);
      addToast("success", `Resolved '${file.path}' using ours`);
      setResolved(prev => ({ ...prev, [file.path]: true }));
    } catch (e) {
      addToast("error", `Failed to resolve: ${e}`);
    }
  };

  const handleResolveTheirs = async (file: ConflictFile) => {
    try {
      await ipc.resolveUsingTheirs(repoPath, file.path);
      addToast("success", `Resolved '${file.path}' using theirs`);
      setResolved(prev => ({ ...prev, [file.path]: true }));
    } catch (e) {
      addToast("error", `Failed to resolve: ${e}`);
    }
  };

  const handleAbortMerge = async () => {
    if (!confirm("Abort the merge? All conflict resolutions will be lost.")) return;
    try {
      await ipc.abortMerge(repoPath);
      addToast("info", "Merge aborted");
      onClose();
    } catch (e) {
      addToast("error", `Failed to abort merge: ${e}`);
    }
  };

  const resolvedCount = Object.keys(resolved).length;
  const totalCount = conflicts.length;
  const allResolved = totalCount > 0 && resolvedCount >= totalCount;

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
        width: "860px",
        maxWidth: "95vw",
        maxHeight: "82vh",
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
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
                Conflict Resolver
              </h2>
              {!loading && totalCount > 0 && (
                <span style={{
                  background: resolvedCount === totalCount
                    ? "rgba(29,185,84,0.2)"
                    : "rgba(229,83,75,0.2)",
                  color: resolvedCount === totalCount ? "#1DB954" : "#e5534b",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "12px",
                }}>
                  {resolvedCount}/{totalCount} resolved
                </span>
              )}
            </div>
            {repoName && (
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#b3b3b3" }}>
                {repoName}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {allResolved && (
              <button
                onClick={() => {
                  addToast("info", "Stage all resolved files and commit to complete the merge.");
                  onClose();
                }}
                style={{
                  background: "#1DB954",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  color: "#000",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Commit Merge
              </button>
            )}
            <button
              onClick={handleAbortMerge}
              style={{
                background: "rgba(229,83,75,0.15)",
                border: "1px solid rgba(229,83,75,0.4)",
                borderRadius: "6px",
                padding: "8px 14px",
                color: "#e5534b",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Abort Merge
            </button>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", color: "#b3b3b3",
                cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "4px",
                borderRadius: "4px",
              }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#535353",
            fontSize: "14px",
          }}>
            Loading conflicts...
          </div>
        ) : totalCount === 0 ? (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            color: "#b3b3b3",
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="#1DB954" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="22 4 12 14.01 9 11.01" stroke="#1DB954" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: 0 }}>
              No conflicts detected
            </p>
            <p style={{ fontSize: "13px", margin: 0 }}>
              This repository has no merge conflicts at this time.
            </p>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* File list sidebar */}
            <div style={{
              width: "260px",
              flexShrink: 0,
              borderRight: "1px solid #3d3d3d",
              overflowY: "auto",
              padding: "12px 0",
            }}>
              <p style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#b3b3b3",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                margin: "0 16px 8px",
              }}>
                Conflicted Files
              </p>
              {conflicts.map(cf => {
                const isResolved = resolved[cf.path];
                const isSelected = selectedFile?.path === cf.path;
                return (
                  <button
                    key={cf.path}
                    onClick={() => setSelectedFile(cf)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      width: "100%",
                      padding: "9px 16px",
                      background: isSelected ? "rgba(29,185,84,0.12)" : "none",
                      border: "none",
                      borderLeft: isSelected ? "2px solid #1DB954" : "2px solid transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      color: isResolved ? "#1DB954" : "#fff",
                    }}
                  >
                    <span style={{ fontSize: "14px", flexShrink: 0 }}>
                      {isResolved ? "✓" : "⚡"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0,
                        fontSize: "12px",
                        fontWeight: isSelected ? 700 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isResolved ? "#1DB954" : isSelected ? "#fff" : "#b3b3b3",
                      }}>
                        {cf.path.split("/").pop() ?? cf.path}
                      </p>
                      <p style={{
                        margin: "2px 0 0",
                        fontSize: "10px",
                        color: "#535353",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {cf.conflict_type}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {selectedFile ? (
                <>
                  {/* File header */}
                  <div style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid #3d3d3d",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                        {selectedFile.path}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#535353" }}>
                        Conflict type: {selectedFile.conflict_type}
                      </p>
                    </div>
                    {!resolved[selectedFile.path] && (
                      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                        <button
                          onClick={() => handleResolveOurs(selectedFile)}
                          style={{
                            background: "rgba(29,185,84,0.15)",
                            border: "1px solid rgba(29,185,84,0.4)",
                            borderRadius: "6px",
                            padding: "6px 14px",
                            color: "#1DB954",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Use Ours
                        </button>
                        <button
                          onClick={() => handleResolveTheirs(selectedFile)}
                          style={{
                            background: "rgba(61,155,233,0.15)",
                            border: "1px solid rgba(61,155,233,0.4)",
                            borderRadius: "6px",
                            padding: "6px 14px",
                            color: "#3d9be9",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Use Theirs
                        </button>
                      </div>
                    )}
                    {resolved[selectedFile.path] && (
                      <span style={{
                        background: "rgba(29,185,84,0.2)",
                        color: "#1DB954",
                        fontSize: "12px",
                        fontWeight: 700,
                        padding: "4px 12px",
                        borderRadius: "12px",
                      }}>
                        Resolved
                      </span>
                    )}
                  </div>

                  {/* Side-by-side diff preview */}
                  <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                    {/* Ours */}
                    <div style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      borderRight: "1px solid #3d3d3d",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        padding: "8px 16px",
                        background: "rgba(29,185,84,0.08)",
                        borderBottom: "1px solid #3d3d3d",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#1DB954",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}>
                        Ours (HEAD)
                      </div>
                      <pre style={{
                        flex: 1,
                        margin: 0,
                        padding: "16px",
                        overflowY: "auto",
                        fontSize: "11px",
                        lineHeight: 1.6,
                        color: "#e0e0e0",
                        background: "transparent",
                        fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}>
                        {selectedFile.ours || "(empty)"}
                      </pre>
                    </div>

                    {/* Theirs */}
                    <div style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        padding: "8px 16px",
                        background: "rgba(61,155,233,0.08)",
                        borderBottom: "1px solid #3d3d3d",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#3d9be9",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}>
                        Theirs (Incoming)
                      </div>
                      <pre style={{
                        flex: 1,
                        margin: 0,
                        padding: "16px",
                        overflowY: "auto",
                        fontSize: "11px",
                        lineHeight: 1.6,
                        color: "#e0e0e0",
                        background: "transparent",
                        fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}>
                        {selectedFile.theirs || "(empty)"}
                      </pre>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#535353",
                  fontSize: "13px",
                }}>
                  Select a file to view conflict details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
