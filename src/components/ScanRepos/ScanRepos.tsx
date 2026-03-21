import React, { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ipc } from "../../lib/ipc";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";

interface Props {
  onClose: () => void;
}

const COLORS = ["#1DB954", "#A78BFA", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#14B8A6", "#F97316"];

export function ScanRepos({ onClose }: Props) {
  const [found, setFound] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const addRepo = useRepoStore(s => s.addRepo);
  const addToast = useToastStore(s => s.add);

  const handleScan = async () => {
    try {
      const dir = await openDialog({ directory: true, multiple: false, title: "Select folder to scan" });
      if (!dir || typeof dir !== "string") return;
      setScanning(true);
      const repos = await ipc.scanForRepos(dir);
      setFound(repos);
      setSelected(new Set(repos));
      if (repos.length === 0) addToast("info", "No git repositories found");
    } catch (e) {
      addToast("error", `Scan failed: ${e}`);
    } finally {
      setScanning(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === found.length) setSelected(new Set());
    else setSelected(new Set(found));
  };

  const toggle = (p: string) => {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p); else next.add(p);
    setSelected(next);
  };

  const handleAdd = async () => {
    setAdding(true);
    let ok = 0, fail = 0;
    for (const p of selected) {
      const parts = p.replace(/\\/g, "/").split("/");
      const name = parts[parts.length - 1] || p;
      try {
        await addRepo({
          name,
          path: p,
          remote: "",
          icon: "folder",
          color: COLORS[ok % COLORS.length],
        });
        ok++;
      } catch { fail++; }
    }
    setAdding(false);
    addToast(fail > 0 ? "warning" : "success", `Added ${ok} repos${fail > 0 ? `, ${fail} failed` : ""}`);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--color-bg-elevated)", borderRadius: "12px", width: "560px", maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Scan for Repositories</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "20px" }}>&#x2715;</button>
        </div>

        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--color-border)" }}>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{ background: "var(--color-accent)", border: "none", borderRadius: "500px", padding: "10px 20px", color: "#000", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}
          >{scanning ? "Scanning..." : "Choose Folder to Scan"}</button>
          {found.length > 0 && (
            <span style={{ marginLeft: "12px", fontSize: "13px", color: "var(--color-text-secondary)" }}>
              Found {found.length} repositories
            </span>
          )}
        </div>

        {found.length > 0 && (
          <>
            <div style={{ padding: "8px 24px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked={selected.size === found.length} onChange={toggleAll} style={{ accentColor: "var(--color-accent)" }} />
              <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Select all ({selected.size}/{found.length})</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px" }}>
              {found.map(p => {
                const parts = p.replace(/\\/g, "/").split("/");
                const name = parts[parts.length - 1] || p;
                return (
                  <label key={p} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", cursor: "pointer", borderBottom: "1px solid var(--overlay-soft)" }}>
                    <input type="checkbox" checked={selected.has(p)} onChange={() => toggle(p)} style={{ accentColor: "var(--color-accent)" }} />
                    <div>
                      <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>{name}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--color-text-disabled)", fontFamily: "monospace" }}>{p}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--color-border)", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--color-border)", borderRadius: "500px", padding: "8px 20px", color: "var(--color-text-primary)", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
              <button
                onClick={handleAdd}
                disabled={adding || selected.size === 0}
                style={{ background: "var(--color-accent)", border: "none", borderRadius: "500px", padding: "8px 20px", color: "#000", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
              >{adding ? "Adding..." : `Add ${selected.size} Repos`}</button>
            </div>
          </>
        )}
        {found.length === 0 && !scanning && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px", flexDirection: "column", gap: "12px", color: "var(--color-text-disabled)" }}>
            <p style={{ fontSize: "14px" }}>Click "Choose Folder to Scan" to find git repositories</p>
          </div>
        )}
      </div>
    </div>
  );
}
