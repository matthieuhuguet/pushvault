import React, { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ipc } from "../../lib/ipc";
import { useRepoStore } from "../../store/repoStore";
import { useUIStore } from "../../store/uiStore";
import { useToastStore } from "../../store/toastStore";
import { useConfirmStore } from "../../store/confirmStore";
import type { AppConfig, RepoConfig } from "../../types";
import { GitHubPanel } from "../GitHub/GitHubPanel";

/* ── Slider ─────────────────────────────────────────────────── */
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function SettingSlider({ label, value, min, max, step = 1, unit = "", onChange }: SliderProps) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
          {label}
        </label>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#1DB954",
            background: "rgba(29,185,84,0.1)",
            padding: "2px 10px",
            borderRadius: "10px",
          }}
        >
          {value}
          {unit}
        </span>
      </div>
      <div style={{ position: "relative" }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{
            width: "100%",
            height: "4px",
            appearance: "none",
            background: `linear-gradient(to right, #1DB954 0%, #1DB954 ${((value - min) / (max - min)) * 100}%, var(--overlay-medium) ${((value - min) / (max - min)) * 100}%, var(--overlay-medium) 100%)`,
            borderRadius: "2px",
            outline: "none",
            cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}

/* ── Repo edit row ──────────────────────────────────────────── */
interface RepoRowProps {
  repo: RepoConfig;
  onRemove: () => void;
  onEdit: () => void;
}

function RepoRow({ repo, onRemove, onEdit }: RepoRowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 16px",
        background: hovered ? "var(--overlay-soft)" : "transparent",
        borderRadius: "8px",
        transition: "background 120ms ease",
      }}
    >
      {/* Color dot */}
      <div
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: repo.color,
          flexShrink: 0,
        }}
      />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {repo.name}
        </p>
        <p
          style={{
            fontSize: "11px",
            color: "var(--color-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {repo.path}
        </p>
      </div>

      {/* Actions */}
      {hovered && (
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          <button
            onClick={onEdit}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              background: "var(--overlay-subtle)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-medium)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
            }}
          >
            Edit
          </button>
          <button
            onClick={async () => {
              const ok = await useConfirmStore.getState().request({
                title: "Remove repository?",
                description: `Remove "${repo.name}"? This will not delete any files.`,
                danger: true,
                confirmLabel: "Remove",
              });
              if (ok) onRemove();
            }}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 600,
              color: "#e5534b",
              background: "rgba(229,83,75,0.1)",
              border: "1px solid rgba(229,83,75,0.2)",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(229,83,75,0.2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(229,83,75,0.1)";
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Appearance section with theme picker ─────────────────── */
function AppearanceSection() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const themes: { id: "dark" | "light"; label: string; desc: string; preview: string; previewText: string }[] = [
    { id: "dark", label: "Spotify Dark", desc: "Dark background with green accents", preview: "#121212", previewText: "#ffffff" },
    { id: "light", label: "Clean Light", desc: "Light background for daytime use", preview: "#f5f5f5", previewText: "#1a1a1a" },
  ];

  return (
    <div>
      <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "20px" }}>
        Appearance
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {themes.map((t) => {
          const isActive = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "16px",
                background: isActive ? "rgba(29,185,84,0.08)" : "var(--overlay-soft)",
                border: isActive ? "1px solid rgba(29,185,84,0.3)" : "1px solid var(--overlay-subtle)",
                borderRadius: "10px",
                cursor: "pointer",
                transition: "all 150ms ease",
                textAlign: "left",
                width: "100%",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-soft)";
              }}
            >
              {/* Preview swatch */}
              <div style={{
                width: "48px",
                height: "36px",
                borderRadius: "8px",
                background: t.preview,
                border: "1px solid rgba(128,128,128,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: "8px", fontWeight: 800, color: t.previewText, letterSpacing: "0.5px" }}>PV</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {t.label}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                  {t.desc}
                </p>
              </div>
              {isActive && (
                <span style={{
                  padding: "3px 10px",
                  background: "#1DB954",
                  color: "#000",
                  fontSize: "10px",
                  fontWeight: 700,
                  borderRadius: "10px",
                  flexShrink: 0,
                }}>
                  Active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Settings ───────────────────────────────────────────────── */
interface SettingsProps {
  onClose: () => void;
}

const SECTIONS = ["General", "Repositories", "Appearance", "Security", "GitHub"] as const;
type Section = typeof SECTIONS[number];

const ICON_OPTIONS = [
  "brain", "camera", "code", "folder", "star",
  "rocket", "book", "music", "cube", "download",
  "portfolio", "globe", "shield", "terminal",
  "heart", "zap", "git",
];
const COLOR_OPTIONS = [
  "#1DB954", "#3d9be9", "#e5534b", "#f59b00",
  "#ff7b00", "#b069f8", "#ff5c8d", "#00c9b7",
];

export function Settings({ onClose }: SettingsProps) {
  const addToast = useToastStore((s) => s.add);
  const { config, removeRepo, updateRepo, loadConfig } = useRepoStore();

  const [activeSection, setActiveSection] = useState<Section>("General");
  const [localConfig, setLocalConfig] = useState<AppConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [portableMode, setPortableMode] = useState(false);

  // Edit repo modal
  const [editRepo, setEditRepo] = useState<RepoConfig | null>(null);

  useEffect(() => {
    if (config) {
      setLocalConfig({ ...config });
      // Populate token from OS credential store if config.json doesn't have one
      if (!config.github_token) {
        ipc.getStoredToken().then((token) => {
          if (token) setLocalConfig((prev) => prev ? { ...prev, github_token: token } : prev);
        }).catch(() => {});
      }
    }
  }, [config]);

  // Load startup setting and portable mode on mount
  useEffect(() => {
    ipc.getLaunchAtStartup().then(setLaunchAtStartup).catch(() => {});
    ipc.getPortableMode().then(setPortableMode).catch(() => {});
  }, []);

  const handleStartupToggle = async (v: boolean) => {
    try {
      await ipc.setLaunchAtStartup(v);
      setLaunchAtStartup(v);
      addToast("success", v ? "PushVault will launch at startup" : "Startup launch disabled");
    } catch (e) {
      addToast("error", `Failed to set startup: ${e}`);
    }
  };

  const set = (updates: Partial<AppConfig>) => {
    setLocalConfig((prev) => (prev ? { ...prev, ...updates } : prev));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!localConfig) return;
    setSaving(true);
    try {
      // Mirror token to OS Credential Manager for enhanced security
      await ipc.storeToken(localConfig.github_token ?? "").catch(() => {});
      await ipc.saveConfig(localConfig);
      await loadConfig();
      addToast("success", "Settings saved");
      setDirty(false);
    } catch (e) {
      addToast("error", `Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRepo = async (path: string) => {
    await removeRepo(path);
    addToast("info", "Repo removed");
  };

  const handleSaveEditRepo = async () => {
    if (!editRepo) return;
    await updateRepo(editRepo);
    addToast("success", `Updated "${editRepo.name}"`);
    setEditRepo(null);
  };

  const handleAddRepo = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select Git Repository" });
      if (!selected || typeof selected !== "string") return;
      const name = selected.replace(/\\/g, "/").split("/").pop() ?? selected;
      await ipc.addRepo({ path: selected, name, color: "#1DB954", icon: "folder", remote: "" });
      await loadConfig();
      addToast("success", `Added "${name}"`);
    } catch (e) {
      addToast("error", `Failed to add repo: ${e}`);
    }
  };

  if (!localConfig && activeSection !== "GitHub") {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-backdrop)",
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
          background: "var(--color-bg-card)",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: "16px",
          flexShrink: 0,
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", flex: 1 }}>
          Settings
        </h2>
        {dirty && (
          <span style={{ fontSize: "11px", color: "#f59b00" }}>
            ● Unsaved changes
          </span>
        )}
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
            lineHeight: 1,
            transition: "background 120ms ease, color 120ms ease",
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

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <div
          style={{
            width: "180px",
            background: "var(--color-bg-primary)",
            borderRight: "1px solid var(--overlay-subtle)",
            padding: "16px 8px",
            flexShrink: 0,
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              style={{
                width: "100%",
                padding: "9px 14px",
                borderRadius: "8px",
                background:
                  activeSection === s
                    ? "var(--overlay-light)"
                    : "transparent",
                border: "none",
                color: activeSection === s ? "#fff" : "#b3b3b3",
                fontSize: "13px",
                fontWeight: activeSection === s ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 120ms ease",
                marginBottom: "2px",
              }}
              onMouseEnter={(e) => {
                if (activeSection !== s)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--overlay-soft)";
              }}
              onMouseLeave={(e) => {
                if (activeSection !== s)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "32px 40px",
            maxWidth: "600px",
          }}
        >
          {activeSection === "General" && localConfig && (
            <div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  marginBottom: "28px",
                }}
              >
                General
              </h3>

              <SettingSlider
                label="Auto-check interval"
                value={localConfig.auto_check_interval_minutes}
                min={1}
                max={60}
                step={1}
                unit=" min"
                onChange={(v) => set({ auto_check_interval_minutes: v })}
              />
              <SettingSlider
                label="Max file size"
                value={localConfig.max_file_size_mb}
                min={1}
                max={100}
                step={1}
                unit=" MB"
                onChange={(v) => set({ max_file_size_mb: v })}
              />
              <SettingSlider
                label="Batch size"
                value={localConfig.batch_size}
                min={10}
                max={200}
                step={10}
                unit=" files"
                onChange={(v) => set({ batch_size: v })}
              />

              {/* Launch at startup toggle */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 0",
                borderTop: "1px solid var(--color-border-subtle)",
                marginTop: "8px",
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                    Launch at startup
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: "11px", color: "var(--color-text-disabled)" }}>
                    Start PushVault automatically when Windows starts
                  </p>
                </div>
                <button
                  onClick={() => handleStartupToggle(!launchAtStartup)}
                  style={{
                    width: "44px",
                    height: "24px",
                    borderRadius: "12px",
                    background: launchAtStartup ? "#1DB954" : "var(--overlay-strong)",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 200ms ease",
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: "absolute",
                    top: "3px",
                    left: launchAtStartup ? "22px" : "3px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 200ms ease",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  }} />
                </button>
              </div>

              {/* Portable mode status (read-only) */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 0",
                borderTop: "1px solid var(--color-border-subtle)",
                marginTop: "8px",
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                    Portable mode
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: "11px", color: "var(--color-text-disabled)" }}>
                    {portableMode
                      ? "Config is stored next to the executable (pushvault.portable detected)"
                      : "Drop a pushvault.portable file next to the exe to enable"}
                  </p>
                </div>
                <span style={{
                  padding: "3px 10px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: portableMode ? "rgba(29,185,84,0.15)" : "var(--overlay-subtle)",
                  color: portableMode ? "#1DB954" : "#535353",
                  border: portableMode ? "1px solid rgba(29,185,84,0.3)" : "1px solid var(--overlay-light)",
                }}>
                  {portableMode ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          )}

          {activeSection === "Repositories" && localConfig && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-text-primary)" }}>
                  Repositories
                </h3>
                <button
                  onClick={handleAddRepo}
                  style={{
                    padding: "7px 14px",
                    background: "rgba(29,185,84,0.15)",
                    border: "1px solid rgba(29,185,84,0.3)",
                    borderRadius: "20px",
                    color: "#1DB954",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,185,84,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,185,84,0.15)";
                  }}
                >
                  <span style={{ fontSize: "15px", lineHeight: 1 }}>+</span>
                  Add Repository
                </button>
              </div>

              {localConfig.repos.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--color-text-disabled)" }}>
                  No repositories added yet.
                </p>
              ) : (
                <div>
                  {localConfig.repos.map((repo) => (
                    <RepoRow
                      key={repo.path}
                      repo={repo}
                      onRemove={() => handleRemoveRepo(repo.path)}
                      onEdit={() => setEditRepo({ ...repo })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === "Appearance" && localConfig && (
            <AppearanceSection />
          )}

          {activeSection === "Security" && localConfig && (
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "28px" }}>
                Security
              </h3>

              {/* GPG Sign Commits */}
              <div style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
                padding: "18px 0",
                borderBottom: "1px solid var(--color-border-subtle)",
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
                    GPG-sign commits
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
                    Sign every commit with your GPG key. Requires GPG agent running.
                    Displays a verified badge on GitHub.
                  </p>
                </div>
                <button
                  onClick={() => set({ gpg_sign_commits: !localConfig.gpg_sign_commits })}
                  style={{
                    width: "44px",
                    height: "24px",
                    borderRadius: "12px",
                    background: localConfig.gpg_sign_commits ? "#1DB954" : "var(--overlay-strong)",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 200ms ease",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  <span style={{
                    position: "absolute",
                    top: "3px",
                    left: localConfig.gpg_sign_commits ? "22px" : "3px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 200ms ease",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  }} />
                </button>
              </div>

              {/* GPG Key ID */}
              <div style={{ padding: "18px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <label style={{ display: "block", fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: "8px" }}>
                  GPG Key ID
                </label>
                <p style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--color-text-disabled)" }}>
                  Leave blank to use default GPG key. Example: <code style={{ color: "#8a8a8a", fontFamily: "monospace" }}>ABC123DE</code>
                </p>
                <input
                  type="text"
                  value={localConfig.gpg_key_id}
                  onChange={(e) => set({ gpg_key_id: e.target.value })}
                  placeholder="e.g. ABC123DE or full fingerprint"
                  disabled={!localConfig.gpg_sign_commits}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    background: localConfig.gpg_sign_commits ? "var(--overlay-subtle)" : "rgba(255,255,255,0.02)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    color: localConfig.gpg_sign_commits ? "#fff" : "#535353",
                    fontSize: "13px",
                    fontFamily: "monospace",
                    outline: "none",
                    boxSizing: "border-box",
                    cursor: localConfig.gpg_sign_commits ? "text" : "not-allowed",
                    transition: "all 150ms ease",
                  }}
                />
              </div>

              {/* GitHub Token */}
              <div style={{ padding: "18px 0" }}>
                <label style={{ display: "block", fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: "8px" }}>
                  GitHub Personal Access Token
                </label>
                <p style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
                  Used for CI status, releases, PRs, and issues.
                  Requires <code style={{ color: "#8a8a8a", fontFamily: "monospace" }}>repo</code> scope.
                </p>
                <input
                  type="password"
                  value={localConfig.github_token}
                  onChange={(e) => set({ github_token: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    background: "var(--overlay-subtle)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    color: "var(--color-text-primary)",
                    fontSize: "13px",
                    fontFamily: "monospace",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 150ms ease",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(29,185,84,0.4)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--overlay-light)"; }}
                />
                {localConfig.github_token && (
                  <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#1DB954" }}>
                    ● Token configured · {localConfig.github_token.length} chars
                  </p>
                )}
              </div>

              {/* Info box */}
              <div style={{
                marginTop: "8px",
                padding: "12px 16px",
                background: "var(--overlay-soft)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "10px",
              }}>
                <p style={{ margin: 0, fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.6 }}>
                  Your GitHub token is saved to the <strong style={{ color: "#8a8a8a" }}>Windows Credential Manager</strong> (OS keychain) for enhanced security.
                  GPG key IDs are stored in the local app config — never commit it to a public repository.
                </p>
              </div>
            </div>
          )}

          {activeSection === "GitHub" && <GitHubPanel />}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          height: "64px",
          background: "var(--color-bg-card)",
          borderTop: "1px solid var(--color-border-subtle)",
          display: activeSection === "GitHub" ? "none" : "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 32px",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: "9px 20px",
            background: "var(--overlay-subtle)",
            border: "1px solid var(--color-border)",
            borderRadius: "20px",
            color: "var(--color-text-secondary)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-subtle)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            padding: "9px 24px",
            background: !dirty || saving ? "rgba(29,185,84,0.3)" : "#1DB954",
            color: "#000",
            border: "none",
            borderRadius: "20px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: !dirty || saving ? "not-allowed" : "pointer",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (dirty && !saving)
              (e.currentTarget as HTMLButtonElement).style.background = "#1ed760";
          }}
          onMouseLeave={(e) => {
            if (dirty)
              (e.currentTarget as HTMLButtonElement).style.background = "#1DB954";
          }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Edit repo modal */}
      {editRepo && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-backdrop-light)",
            zIndex: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditRepo(null);
          }}
        >
          <div
            style={{
              width: "440px",
              background: "var(--color-bg-elevated)",
              borderRadius: "14px",
              border: "1px solid var(--color-border)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
              padding: "24px",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                marginBottom: "20px",
              }}
            >
              Edit Repository
            </h3>

            {/* Name */}
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Name
              </label>
              <input
                type="text"
                value={editRepo.name}
                onChange={(e) =>
                  setEditRepo({ ...editRepo, name: e.target.value })
                }
                style={{
                  width: "100%",
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  color: "var(--color-text-primary)",
                  fontSize: "13px",
                  padding: "9px 12px",
                  outline: "none",
                }}
              />
            </div>

            {/* Icon */}
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "8px",
                }}
              >
                Icon
              </label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ICON_OPTIONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setEditRepo({ ...editRepo, icon })}
                    style={{
                      padding: "5px 10px",
                      fontSize: "11px",
                      background:
                        editRepo.icon === icon
                          ? "rgba(29,185,84,0.2)"
                          : "var(--overlay-subtle)",
                      border: `1px solid ${editRepo.icon === icon ? "#1DB954" : "transparent"}`,
                      borderRadius: "6px",
                      color: editRepo.icon === icon ? "#1DB954" : "#b3b3b3",
                      cursor: "pointer",
                      transition: "all 120ms ease",
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "8px",
                }}
              >
                Color
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditRepo({ ...editRepo, color })}
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: color,
                      border: `2px solid ${editRepo.color === color ? "#fff" : "transparent"}`,
                      cursor: "pointer",
                      transition: "transform 120ms ease",
                      transform: editRepo.color === color ? "scale(1.2)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditRepo(null)}
                style={{
                  padding: "8px 18px",
                  background: "var(--overlay-subtle)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "20px",
                  color: "var(--color-text-secondary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditRepo}
                style={{
                  padding: "8px 20px",
                  background: "#1DB954",
                  color: "#000",
                  border: "none",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
