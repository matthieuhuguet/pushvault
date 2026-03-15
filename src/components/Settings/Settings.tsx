import React, { useCallback, useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
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
        <label style={{ fontSize: "13px", color: "#b3b3b3", fontWeight: 500 }}>
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
            background: `linear-gradient(to right, #1DB954 0%, #1DB954 ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.12) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.12) 100%)`,
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
        background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
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
            color: "#fff",
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
            color: "#6a6a6a",
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
              color: "#b3b3b3",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
            }}
          >
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove "${repo.name}"?\nThis will not delete any files.`)) {
                onRemove();
              }
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

/* ── Settings ───────────────────────────────────────────────── */
interface SettingsProps {
  onClose: () => void;
}

const SECTIONS = ["General", "Repositories", "Appearance", "GitHub"] as const;
type Section = typeof SECTIONS[number];

const ICON_OPTIONS = [
  "brain", "camera", "code", "folder", "star",
  "rocket", "book", "music", "cube",
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

  // Edit repo modal
  const [editRepo, setEditRepo] = useState<RepoConfig | null>(null);

  useEffect(() => {
    if (config) setLocalConfig({ ...config });
  }, [config]);

  const set = (updates: Partial<AppConfig>) => {
    setLocalConfig((prev) => (prev ? { ...prev, ...updates } : prev));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!localConfig) return;
    setSaving(true);
    try {
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

  if (!localConfig && activeSection !== "GitHub") {
    return null;
  }

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
          padding: "0 24px",
          gap: "16px",
          flexShrink: 0,
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", flex: 1 }}>
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

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <div
          style={{
            width: "180px",
            background: "#121212",
            borderRight: "1px solid rgba(255,255,255,0.06)",
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
                    ? "rgba(255,255,255,0.08)"
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
                    "rgba(255,255,255,0.04)";
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
                  color: "#fff",
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
            </div>
          )}

          {activeSection === "Repositories" && localConfig && (
            <div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#fff",
                  marginBottom: "20px",
                }}
              >
                Repositories
              </h3>

              {localConfig.repos.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#535353" }}>
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
            <div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#fff",
                  marginBottom: "20px",
                }}
              >
                Appearance
              </h3>
              <div
                style={{
                  padding: "16px",
                  background: "rgba(29,185,84,0.08)",
                  border: "1px solid rgba(29,185,84,0.2)",
                  borderRadius: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "#1DB954",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 2c3.86 0 7 3.14 7 7s-3.14 7-7 7V5z" fill="#000" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                      Spotify Dark
                    </p>
                    <p style={{ fontSize: "11px", color: "#6a6a6a" }}>
                      Currently active · More themes coming soon
                    </p>
                  </div>
                  <div
                    style={{
                      marginLeft: "auto",
                      padding: "3px 10px",
                      background: "#1DB954",
                      color: "#000",
                      fontSize: "10px",
                      fontWeight: 700,
                      borderRadius: "10px",
                    }}
                  >
                    Active
                  </div>
                </div>
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
          background: "#1a1a1a",
          borderTop: "1px solid rgba(255,255,255,0.06)",
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
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "20px",
            color: "#b3b3b3",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
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
            background: "rgba(0,0,0,0.6)",
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
              background: "#282828",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
              padding: "24px",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#fff",
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
                  color: "#b3b3b3",
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
                  background: "#1e1e1e",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
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
                  color: "#b3b3b3",
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
                          : "rgba(255,255,255,0.06)",
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
                  color: "#b3b3b3",
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
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "20px",
                  color: "#b3b3b3",
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
