import React, { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";

interface CloneDialogProps {
  onClose: () => void;
}

function extractRepoName(url: string): string {
  if (!url) return "";
  const cleaned = url.trim().replace(/\.git\s*$/, "");
  const parts = cleaned.split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

export function CloneDialog({ onClose }: CloneDialogProps) {
  const addToast = useToastStore((s) => s.add);
  const { addRepo, config } = useRepoStore();

  const [url, setUrl] = useState("");
  const [dest, setDest] = useState("");
  const [repoName, setRepoName] = useState("");
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState("");
  const [urlFocused, setUrlFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);

  // Auto-detect repo name from URL
  useEffect(() => {
    const name = extractRepoName(url);
    setRepoName(name);
  }, [url]);

  const handlePickDest = async () => {
    try {
      // Dynamically import the dialog plugin
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose destination folder",
      });
      if (selected && typeof selected === "string") {
        setDest(selected);
      }
    } catch (e) {
      addToast("error", `Could not open folder picker: ${e}`);
    }
  };

  const handleClone = async () => {
    if (!url.trim()) {
      addToast("warning", "Repository URL is required");
      return;
    }
    if (!dest.trim()) {
      addToast("warning", "Destination folder is required");
      return;
    }

    setCloning(true);
    setProgress("Cloning repository…");

    try {
      const fullPath = await ipc.cloneRepo(url.trim(), dest.trim());
      setProgress("Adding to PushVault…");

      await addRepo({
        name: repoName || extractRepoName(url) || "New Repo",
        path: fullPath,
        remote: url.trim(),
        icon: "folder",
        color: "#1DB954",
      });

      addToast("success", `Cloned "${repoName || url}" successfully`);
      onClose();
    } catch (e) {
      addToast("error", `Clone failed: ${e}`);
      setProgress("");
      setCloning(false);
    }
  };

  const isValid = url.trim().length > 0 && dest.trim().length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 700,
        padding: "24px",
        animation: "fade-in 150ms ease both",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "520px",
          maxWidth: "100%",
          background: "#282828",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          overflow: "hidden",
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
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#fff" }}>
              Clone Repository
            </h2>
            <p style={{ fontSize: "12px", color: "#6a6a6a", marginTop: "2px" }}>
              Clone from a remote URL
            </p>
          </div>
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
              lineHeight: 1,
              transition: "background 120ms ease, color 120ms ease",
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

        {/* Form */}
        <div style={{ padding: "24px" }}>
          {/* URL */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: "#b3b3b3",
                marginBottom: "6px",
                letterSpacing: "0.03em",
              }}
            >
              Repository URL
            </label>
            <input
              type="text"
              placeholder="https://github.com/user/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setUrlFocused(true)}
              onBlur={() => setUrlFocused(false)}
              autoFocus
              style={{
                width: "100%",
                background: "#1e1e1e",
                border: `1px solid ${urlFocused ? "#1DB954" : "rgba(255,255,255,0.1)"}`,
                borderRadius: "8px",
                color: "#fff",
                fontSize: "13px",
                padding: "10px 14px",
                outline: "none",
                transition: "border-color 150ms ease",
                boxShadow: urlFocused ? "0 0 0 2px rgba(29,185,84,0.12)" : "none",
              }}
            />
          </div>

          {/* Destination */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: "#b3b3b3",
                marginBottom: "6px",
                letterSpacing: "0.03em",
              }}
            >
              Destination Folder
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="/path/to/parent/folder"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                onFocus={() => setDestFocused(true)}
                onBlur={() => setDestFocused(false)}
                style={{
                  flex: 1,
                  background: "#1e1e1e",
                  border: `1px solid ${destFocused ? "#1DB954" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "13px",
                  padding: "10px 14px",
                  outline: "none",
                  transition: "border-color 150ms ease",
                  boxShadow: destFocused ? "0 0 0 2px rgba(29,185,84,0.12)" : "none",
                  minWidth: 0,
                }}
              />
              <button
                onClick={handlePickDest}
                style={{
                  padding: "0 16px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#b3b3b3",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 150ms ease",
                  whiteSpace: "nowrap",
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
                Browse…
              </button>
            </div>
          </div>

          {/* Detected repo name */}
          {repoName && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                background: "rgba(29,185,84,0.08)",
                border: "1px solid rgba(29,185,84,0.2)",
                borderRadius: "8px",
                marginBottom: "16px",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="#1DB954" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: "12px", color: "#b3b3b3" }}>
                Will clone as:{" "}
                <span style={{ color: "#fff", fontWeight: 600 }}>
                  {repoName}
                </span>
              </span>
            </div>
          )}

          {/* Progress indicator */}
          {cloning && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                background: "rgba(29,185,84,0.08)",
                borderRadius: "8px",
                marginBottom: "16px",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#1DB954" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: "13px", color: "#1DB954" }}>
                {progress}
              </span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              disabled={cloning}
              style={{
                padding: "10px 20px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "20px",
                color: "#b3b3b3",
                fontSize: "13px",
                fontWeight: 600,
                cursor: cloning ? "not-allowed" : "pointer",
                opacity: cloning ? 0.4 : 1,
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                if (!cloning) {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleClone}
              disabled={!isValid || cloning}
              style={{
                padding: "10px 24px",
                background: !isValid || cloning ? "rgba(29,185,84,0.3)" : "#1DB954",
                color: "#000",
                border: "none",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: !isValid || cloning ? "not-allowed" : "pointer",
                transition: "all 150ms ease",
                boxShadow: !isValid || cloning ? "none" : "0 4px 16px rgba(29,185,84,0.3)",
              }}
              onMouseEnter={(e) => {
                if (isValid && !cloning) {
                  (e.currentTarget as HTMLButtonElement).style.background = "#1ed760";
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (isValid && !cloning) {
                  (e.currentTarget as HTMLButtonElement).style.background = "#1DB954";
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                }
              }}
            >
              {cloning ? "Cloning…" : "Clone Repository"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
