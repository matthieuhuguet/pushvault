import React, { useEffect, useMemo, useState } from "react";
import { ipc } from "../../lib/ipc";
import type { BlameLine } from "../../types";

interface BlameViewerProps {
  repoPath: string;
  filePath: string;
  onClose: () => void;
}

/* ── Color palette for unique authors ─────────────────────── */
const AUTHOR_COLORS = [
  "#3d9be9", "#1db954", "#e5534b", "#f5a623", "#a855f7",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

function authorColor(name: string, map: Map<string, string>): string {
  if (map.has(name)) return map.get(name)!;
  const color = AUTHOR_COLORS[map.size % AUTHOR_COLORS.length];
  map.set(name, color);
  return color;
}

export function BlameViewer({ repoPath, filePath, onClose }: BlameViewerProps) {
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredHash, setHoveredHash] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    ipc.gitBlame(repoPath, filePath)
      .then(setLines)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, filePath]);

  const authorMap = useMemo(() => new Map<string, string>(), [lines]);

  // Group consecutive lines by commit to show author/hash only on the first line of each block
  const blockStarts = useMemo(() => {
    const set = new Set<number>();
    if (lines.length > 0) set.add(0);
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].commit_hash !== lines[i - 1].commit_hash) set.add(i);
    }
    return set;
  }, [lines]);

  if (loading) {
    return (
      <div style={{
        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--color-text-muted)", fontSize: 13,
      }}>
        Loading blame...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 12, color: "var(--color-text-disabled)",
      }}>
        <span style={{ fontSize: 13, color: "var(--color-error)" }}>Blame failed: {error}</span>
        <button
          onClick={onClose}
          style={{
            padding: "4px 12px", fontSize: 11, background: "var(--overlay-subtle)",
            border: "1px solid var(--overlay-light)", borderRadius: 6, cursor: "pointer",
            color: "var(--color-text-secondary)",
          }}
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "8px 16px",
        background: "var(--color-bg-elevated)", borderBottom: "1px solid var(--color-border-subtle)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-accent)" }}>
          Blame
        </span>
        <span style={{
          fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
        }}>
          {filePath}
        </span>
        <span style={{ fontSize: 10, color: "var(--color-text-disabled)" }}>
          {lines.length} lines
        </span>
        <button
          onClick={onClose}
          title="Close blame view"
          style={{
            padding: "2px 8px", fontSize: 10, fontWeight: 700, borderRadius: 8,
            background: "var(--overlay-subtle)", border: "1px solid var(--overlay-light)",
            color: "var(--color-text-secondary)", cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      {/* Blame content */}
      <div style={{
        flex: 1, overflowY: "auto", overflowX: "auto",
        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
        fontSize: 12, lineHeight: "1.6",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "70px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "40px" }} />
            <col />
          </colgroup>
          <tbody>
            {lines.map((line, i) => {
              const isBlockStart = blockStarts.has(i);
              const isHovered = hoveredHash === line.commit_hash;
              const color = authorColor(line.author, authorMap);

              return (
                <tr
                  key={i}
                  onMouseEnter={() => setHoveredHash(line.commit_hash)}
                  onMouseLeave={() => setHoveredHash(null)}
                  style={{
                    background: isHovered
                      ? "var(--overlay-subtle)"
                      : i % 2 === 0
                        ? "transparent"
                        : "var(--color-bg-elevated)",
                    transition: "background 60ms ease",
                  }}
                >
                  {/* Commit hash */}
                  <td
                    title={isBlockStart ? `${line.commit_hash}\n${line.summary}` : undefined}
                    style={{
                      padding: "0 6px", fontSize: 10, color: isBlockStart ? color : "transparent",
                      fontWeight: 600, userSelect: "none", whiteSpace: "nowrap",
                      borderRight: `2px solid ${isBlockStart ? color : "transparent"}`,
                      verticalAlign: "top",
                    }}
                  >
                    {isBlockStart ? line.short_hash : ""}
                  </td>
                  {/* Author */}
                  <td style={{
                    padding: "0 6px", fontSize: 10, color: isBlockStart ? "var(--color-text-secondary)" : "transparent",
                    userSelect: "none", whiteSpace: "nowrap", overflow: "hidden",
                    textOverflow: "ellipsis", verticalAlign: "top",
                  }}>
                    {isBlockStart ? line.author : ""}
                  </td>
                  {/* Date */}
                  <td style={{
                    padding: "0 6px", fontSize: 10,
                    color: isBlockStart ? "var(--color-text-disabled)" : "transparent",
                    userSelect: "none", whiteSpace: "nowrap", verticalAlign: "top",
                  }}>
                    {isBlockStart ? line.date : ""}
                  </td>
                  {/* Line number */}
                  <td style={{
                    padding: "0 6px", textAlign: "right", fontSize: 11,
                    color: "var(--overlay-vivid)", userSelect: "none", verticalAlign: "top",
                  }}>
                    {line.line_no}
                  </td>
                  {/* Content */}
                  <td style={{
                    padding: "0 12px 0 4px", whiteSpace: "pre", wordBreak: "break-all",
                    color: "var(--color-text-primary)", verticalAlign: "top",
                  }}>
                    {line.content}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
