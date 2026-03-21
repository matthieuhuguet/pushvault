import React, { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { RepoConfig } from "../../types";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";

const ICON_OPTIONS = ["brain", "camera", "code", "art", "music", "video", "game", "book", "star", "folder", "portfolio", "download"];
const COLOR_OPTIONS = ["#1DB954", "#A78BFA", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#14B8A6", "#F97316"];

export function Onboarding({ onComplete, onScan }: { onComplete: () => void; onScan?: () => void }) {
  const [step, setStep] = useState<"welcome" | "add-repo" | "clone">("welcome");
  const [repoPath, setRepoPath] = useState("");
  const [repoName, setRepoName] = useState("");
  const [repoRemote, setRepoRemote] = useState("");
  const [repoColor, setRepoColor] = useState(COLOR_OPTIONS[0]);
  const [repoIcon, setRepoIcon] = useState("folder");
  const [adding, setAdding] = useState(false);
  const addRepo = useRepoStore(s => s.addRepo);
  const addToast = useToastStore(s => s.add);

  const handlePickFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select Git Repository" });
      if (selected && typeof selected === "string") {
        setRepoPath(selected);
        // Auto-fill name from folder name
        const parts = selected.replace(/\\/g, "/").split("/");
        setRepoName(parts[parts.length - 1] || "");
      }
    } catch (e) {
      addToast("error", `Failed to open picker: ${e}`);
    }
  };

  const handleAddRepo = async () => {
    if (!repoPath || !repoName) return;
    setAdding(true);
    try {
      const repo: RepoConfig = {
        name: repoName,
        path: repoPath,
        remote: repoRemote || "origin",
        icon: repoIcon,
        color: repoColor,
      };
      await addRepo(repo);
      addToast("success", `Added '${repoName}' to PushVault`);
      onComplete();
    } catch (e) {
      addToast("error", `Failed to add repo: ${e}`);
    } finally {
      setAdding(false);
    }
  };

  // Suppress unused variable warning for ICON_OPTIONS
  void ICON_OPTIONS;

  // Beautiful full-screen onboarding overlay
  return (
    <div
      className="panel-backdrop-enter"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0, 0, 0, 0.92)",
        backdropFilter: "blur(24px) saturate(1.5)",
        WebkitBackdropFilter: "blur(24px) saturate(1.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="scale-in"
        style={{
          maxWidth: "480px",
          width: "100%",
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <div style={{
          width: "72px", height: "72px",
          borderRadius: "18px",
          background: "var(--color-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 32px",
          fontSize: "28px", fontWeight: 900, color: "#000",
          boxShadow: "0 0 40px var(--color-accent-dim), 0 4px 16px rgba(0,0,0,0.4)",
        }}>PV</div>

        {step === "welcome" && (
          <>
            <h1 style={{ fontSize: "32px", fontWeight: 700, margin: "0 0 16px" }}>
              Welcome to PushVault
            </h1>
            <p style={{ fontSize: "16px", color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 40px" }}>
              Multi-repository Git manager built for creatives and engineers.
              Track, sync, and push all your projects from one beautiful dashboard.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button
                onClick={() => setStep("add-repo")}
                style={{
                  background: "var(--color-accent)", border: "none", borderRadius: "12px",
                  padding: "14px 32px", color: "#000", fontSize: "15px", fontWeight: 700,
                  cursor: "pointer", width: "100%",
                }}
              >
                Add an existing repository
              </button>
              <button
                onClick={() => setStep("clone")}
                style={{
                  background: "transparent", border: "2px solid var(--color-text-disabled)", borderRadius: "12px",
                  padding: "14px 32px", color: "var(--color-text-primary)", fontSize: "15px", fontWeight: 700,
                  cursor: "pointer", width: "100%",
                }}
              >
                Clone from GitHub
              </button>
              {onScan && (
                <button
                  onClick={onScan}
                  style={{
                    background: "transparent", border: "2px solid var(--color-text-disabled)", borderRadius: "12px",
                    padding: "14px 32px", color: "var(--color-text-primary)", fontSize: "15px", fontWeight: 700,
                    cursor: "pointer", width: "100%",
                  }}
                >
                  Scan a folder
                </button>
              )}
              <button
                onClick={onComplete}
                style={{
                  background: "transparent", border: "none",
                  color: "var(--color-text-disabled)", fontSize: "14px", cursor: "pointer",
                  padding: "8px",
                }}
              >
                Skip for now
              </button>
            </div>
          </>
        )}

        {step === "add-repo" && (
          <>
            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 8px" }}>
              Add Repository
            </h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 32px", fontSize: "14px" }}>
              Select a folder that contains a Git repository
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "left" }}>
              {/* Folder picker */}
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={repoPath}
                  onChange={e => setRepoPath(e.target.value)}
                  placeholder="Repository path..."
                  style={{
                    flex: 1, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)",
                    borderRadius: "8px", padding: "10px 14px", color: "var(--color-text-primary)",
                    fontSize: "14px", outline: "none",
                  }}
                />
                <button
                  onClick={handlePickFolder}
                  style={{
                    background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)",
                    borderRadius: "8px", padding: "10px 16px", color: "var(--color-text-primary)",
                    cursor: "pointer", flexShrink: 0, fontSize: "14px",
                  }}
                >Browse</button>
              </div>

              {/* Name */}
              <input
                value={repoName}
                onChange={e => setRepoName(e.target.value)}
                placeholder="Repository name..."
                style={{
                  background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)",
                  borderRadius: "8px", padding: "10px 14px", color: "var(--color-text-primary)",
                  fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box",
                }}
              />

              {/* Remote */}
              <input
                value={repoRemote}
                onChange={e => setRepoRemote(e.target.value)}
                placeholder="Remote URL (optional)..."
                style={{
                  background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)",
                  borderRadius: "8px", padding: "10px 14px", color: "var(--color-text-primary)",
                  fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box",
                }}
              />

              {/* Color picker */}
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Accent Color
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setRepoColor(c)}
                      style={{
                        width: "28px", height: "28px", borderRadius: "50%",
                        background: c, border: repoColor === c ? "3px solid var(--color-text-primary)" : "3px solid transparent",
                        cursor: "pointer", outline: "none",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button
                onClick={() => setStep("welcome")}
                style={{
                  flex: 1, background: "transparent", border: "2px solid var(--color-text-disabled)",
                  borderRadius: "12px", padding: "12px", color: "var(--color-text-primary)",
                  fontSize: "14px", fontWeight: 700, cursor: "pointer",
                }}
              >Back</button>
              <button
                onClick={handleAddRepo}
                disabled={adding || !repoPath || !repoName}
                style={{
                  flex: 2, background: "var(--color-accent)", border: "none",
                  borderRadius: "12px", padding: "12px", color: "#000",
                  fontSize: "14px", fontWeight: 700, cursor: adding ? "not-allowed" : "pointer",
                  opacity: adding ? 0.7 : 1,
                }}
              >
                {adding ? "Adding..." : "Add Repository"}
              </button>
            </div>
          </>
        )}

        {step === "clone" && (
          <>
            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 8px" }}>
              Clone Repository
            </h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 32px", fontSize: "14px" }}>
              Enter a GitHub URL to clone a repository
            </p>
            <p style={{ color: "var(--color-text-disabled)", fontSize: "13px" }}>
              Use the Clone button in the sidebar for full clone options.
            </p>
            <button
              onClick={() => setStep("welcome")}
              style={{
                background: "var(--color-accent)", border: "none", borderRadius: "12px",
                padding: "12px 32px", color: "#000", fontSize: "14px", fontWeight: 700,
                cursor: "pointer", marginTop: "24px",
              }}
            >Back</button>
          </>
        )}
      </div>
    </div>
  );
}
