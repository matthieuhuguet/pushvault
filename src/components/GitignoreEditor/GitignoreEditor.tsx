import React, { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useToastStore } from "../../store/toastStore";

interface Props {
  repoPath: string;
  repoName?: string;
  onClose: () => void;
}

const QUICK_PATTERNS = [
  "node_modules/", ".env", ".env.local", ".DS_Store",
  "*.pyc", "__pycache__/", "target/", "dist/", "build/",
  ".vscode/", "*.log", "*.tmp", ".pv_chunks/",
];

export function GitignoreEditor({ repoPath, repoName, onClose }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore(s => s.add);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    ipc.readGitignore(repoPath)
      .then(setContent)
      .catch(e => addToast("error", `Failed to read .gitignore: ${e}`))
      .finally(() => setLoading(false));
  }, [repoPath]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await ipc.writeGitignore(repoPath, content);
      addToast("success", ".gitignore saved");
      onClose();
    } catch (e) {
      addToast("error", `Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const addPattern = (pattern: string) => {
    const lines = content.split("\n");
    if (!lines.includes(pattern)) {
      setContent(content + (content.endsWith("\n") || !content ? "" : "\n") + pattern + "\n");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--color-bg-elevated)", borderRadius: "12px",
        width: "640px", maxWidth: "95vw",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid #3d3d3d",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>.gitignore Editor</h2>
            {repoName && <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--color-text-secondary)" }}>{repoName}</p>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "20px" }}>&#x2715;</button>
        </div>

        {/* Quick-add patterns */}
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #3d3d3d" }}>
          <p style={{ margin: "0 0 8px", fontSize: "11px", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Quick add
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {QUICK_PATTERNS.map(p => (
              <button
                key={p}
                onClick={() => addPattern(p)}
                style={{
                  background: "var(--color-bg-highlight)", border: "1px solid #535353",
                  borderRadius: "4px", padding: "4px 8px",
                  color: "var(--color-text-secondary)", fontSize: "11px",
                  cursor: "pointer", fontFamily: "monospace",
                }}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, padding: "16px 24px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {loading ? (
            <p style={{ color: "var(--color-text-disabled)", textAlign: "center", padding: "32px" }}>Loading...</p>
          ) : (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, background: "var(--color-bg-card)",
                border: "1px solid #535353", borderRadius: "8px",
                padding: "12px", color: "#e0e0e0",
                fontSize: "13px", fontFamily: "Cascadia Code, Consolas, monospace",
                lineHeight: 1.6, resize: "none", outline: "none",
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #3d3d3d",
          display: "flex", gap: "8px", justifyContent: "flex-end",
        }}>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #535353", borderRadius: "500px", padding: "8px 20px", color: "var(--color-text-primary)", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: "#1DB954", border: "none", borderRadius: "500px", padding: "8px 20px", color: "#000", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
