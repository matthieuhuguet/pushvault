import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiffResult } from "../../types";
import { ipc } from "../../lib/ipc";

interface ParsedLine {
  type: "add" | "remove" | "context" | "hunk" | "header";
  content: string;
  oldLine?: number;
  newLine?: number;
}

function parseDiff(content: string): ParsedLine[] {
  const lines = content.split("\n");
  const result: ParsedLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of lines) {
    if (raw.startsWith("@@")) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "hunk", content: raw });
      continue;
    }
    if (
      raw.startsWith("diff ") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ")
    ) {
      result.push({ type: "header", content: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      result.push({ type: "add", content: raw.slice(1), newLine: newLine++ });
    } else if (raw.startsWith("-")) {
      result.push({ type: "remove", content: raw.slice(1), oldLine: oldLine++ });
    } else {
      result.push({
        type: "context",
        content: raw.startsWith(" ") ? raw.slice(1) : raw,
        oldLine: oldLine++,
        newLine: newLine++,
      });
    }
  }

  return result;
}

/**
 * Extract individual hunk patches from a unified diff.
 * Each returned string is a complete, valid patch (file headers + one hunk).
 */
function extractHunks(content: string): string[] {
  if (!content) return [];
  const lines = content.split("\n");
  const fileHeaderLines: string[] = [];
  let i = 0;

  // Collect file header lines (before first @@)
  while (i < lines.length && !lines[i].startsWith("@@")) {
    fileHeaderLines.push(lines[i]);
    i++;
  }

  const hunks: string[] = [];
  while (i < lines.length) {
    if (lines[i].startsWith("@@")) {
      const hunkLines: string[] = [lines[i]];
      i++;
      while (
        i < lines.length &&
        !lines[i].startsWith("@@") &&
        !lines[i].startsWith("diff ")
      ) {
        hunkLines.push(lines[i]);
        i++;
      }
      // Ensure the patch ends with a trailing newline
      const patch = [...fileHeaderLines, ...hunkLines, ""].join("\n");
      hunks.push(patch);
    } else {
      i++;
    }
  }

  return hunks;
}

interface DiffViewerProps {
  diff: DiffResult | null;
  loading?: boolean;
  /** Base repo path — enables "Open in VS Code" button */
  repoPath?: string;
  /** When provided (unstaged diff), show "Stage Hunk" button on each @@ header */
  onStageHunk?: (patch: string) => void;
  /** When provided, show "Discard Hunk" button on each @@ header */
  onDiscardHunk?: (patch: string) => void;
}

/** Build side-by-side panels from parsed lines. Returns [leftLines, rightLines] aligned. */
function buildSideBySide(lines: ParsedLine[]): Array<{ old: ParsedLine | null; new: ParsedLine | null }> {
  const rows: Array<{ old: ParsedLine | null; new: ParsedLine | null }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === "header") { i++; continue; }
    if (line.type === "hunk") {
      rows.push({ old: line, new: null });
      i++;
      continue;
    }
    if (line.type === "context") {
      rows.push({ old: line, new: line });
      i++;
      continue;
    }
    // Collect consecutive removes then adds and pair them
    const removes: ParsedLine[] = [];
    const adds: ParsedLine[] = [];
    while (i < lines.length && lines[i].type === "remove") { removes.push(lines[i++]); }
    while (i < lines.length && lines[i].type === "add") { adds.push(lines[i++]); }
    const maxLen = Math.max(removes.length, adds.length);
    for (let j = 0; j < maxLen; j++) {
      rows.push({ old: removes[j] ?? null, new: adds[j] ?? null });
    }
  }
  return rows;
}

/** Highlight occurrences of `query` within `text` using <mark>-like spans */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let idx = lower.indexOf(qLower, lastIdx);
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <mark key={idx} style={{ background: "#f5a623", color: "#000", borderRadius: "2px", padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    lastIdx = idx + query.length;
    idx = lower.indexOf(qLower, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

/* ── Diff Minimap ───────────────────────────────────────────── */
interface DiffMinimapProps {
  lines: ParsedLine[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  searchQuery: string;
}

function DiffMinimap({ lines, scrollContainerRef, searchQuery }: DiffMinimapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbStyle, setThumbStyle] = useState({ top: "0%", height: "100%" });

  const visibleLines = useMemo(
    () => lines.filter((l) => l.type !== "header"),
    [lines]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper || visibleLines.length === 0) return;
    const W = wrapper.offsetWidth;
    const H = wrapper.offsetHeight;
    if (W === 0 || H === 0) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, W, H);

    const lineH = H / visibleLines.length;
    visibleLines.forEach((line, i) => {
      const y = i * lineH;
      const h = Math.max(1, lineH);
      if (line.type === "add") {
        const isMatch =
          searchQuery &&
          line.content.toLowerCase().includes(searchQuery.toLowerCase());
        ctx.fillStyle = isMatch ? "#f5a623aa" : "#1DB95466";
      } else if (line.type === "remove") {
        ctx.fillStyle = "#e5534b66";
      } else if (line.type === "hunk") {
        ctx.fillStyle = "#3d9be844";
      } else {
        ctx.fillStyle = "#232323";
      }
      ctx.fillRect(0, y, W, h);
    });
  }, [visibleLines, searchQuery]);

  useEffect(() => {
    draw();
    // Redraw on resize
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [draw]);

  // Track scroll position for thumb
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop / Math.max(1, el.scrollHeight);
      const height = el.clientHeight / Math.max(1, el.scrollHeight);
      setThumbStyle({
        top: `${top * 100}%`,
        height: `${Math.max(4, height * 100)}%`,
      });
    };
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => el.removeEventListener("scroll", update);
  }, [scrollContainerRef]);

  const handleClick = (e: React.MouseEvent) => {
    const el = scrollContainerRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    el.scrollTop = ratio * el.scrollHeight;
  };

  if (visibleLines.length < 20) return null; // Not worth showing for tiny diffs

  return (
    <div
      ref={wrapperRef}
      onClick={handleClick}
      title="Click to jump to position"
      style={{
        width: "16px",
        flexShrink: 0,
        position: "relative",
        cursor: "pointer",
        borderLeft: "1px solid rgba(255,255,255,0.04)",
        overflow: "hidden",
        background: "var(--color-bg-card)",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {/* Viewport thumb overlay */}
      <div
        style={{
          position: "absolute",
          top: thumbStyle.top,
          left: 0,
          right: 0,
          height: thumbStyle.height,
          background: "rgba(255,255,255,0.09)",
          border: "1px solid rgba(255,255,255,0.18)",
          boxSizing: "border-box",
          pointerEvents: "none",
          borderRadius: "1px",
        }}
      />
    </div>
  );
}

export function DiffViewer({ diff, loading, repoPath, onStageHunk, onDiscardHunk }: DiffViewerProps) {
  const [sideBySide, setSideBySide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const unifiedScrollRef = useRef<HTMLDivElement>(null);

  // Ctrl+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        // Only intercept if this viewer has a diff loaded
        if (!diff) return;
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setShowSearch(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [diff]);

  const parsedLines = useMemo(() => {
    if (!diff?.content) return [];
    return parseDiff(diff.content);
  }, [diff?.content]);

  const sideBySideRows = useMemo(() => {
    if (!sideBySide) return [];
    return buildSideBySide(parsedLines);
  }, [sideBySide, parsedLines]);

  const hunks = useMemo(() => extractHunks(diff?.content ?? ""), [diff?.content]);

  const showHunkActions = !!(onStageHunk || onDiscardHunk);

  if (loading) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-muted)",
          fontSize: "13px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            style={{ animation: "spin 0.8s linear infinite" }}
          >
            <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="3" />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="#1DB954"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          Loading diff…
        </div>
      </div>
    );
  }

  if (!diff) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          color: "var(--color-text-disabled)",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            stroke="#535353"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <polyline points="14 2 14 8 20 8" stroke="#535353" strokeWidth="1.5" />
          <line x1="9" y1="13" x2="15" y2="13" stroke="#535353" strokeWidth="1.5" />
          <line x1="9" y1="17" x2="15" y2="17" stroke="#535353" strokeWidth="1.5" />
        </svg>
        <span style={{ fontSize: "13px" }}>Select a file to see its diff</span>
      </div>
    );
  }

  if (!diff.content || diff.content.trim() === "") {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-disabled)",
          fontSize: "13px",
        }}
      >
        No diff content available
      </div>
    );
  }

  // Render-time hunk counter (reset each render cycle, NOT React state)
  let hunkCount = 0;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-card)",
        overflow: "hidden",
      }}
    >
      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "10px 16px",
          background: "#202020",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {diff.file_path}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {/* Copy path button */}
          <button
            title="Copy file path"
            onClick={() => {
              navigator.clipboard.writeText(diff.file_path).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            style={{
              padding: "2px 8px",
              fontSize: "10px",
              fontWeight: 600,
              color: copied ? "#1DB954" : "#b3b3b3",
              background: copied ? "rgba(29,185,84,0.1)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${copied ? "rgba(29,185,84,0.3)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            {copied ? "✓ Copied" : "⎘ Copy path"}
          </button>
          {/* Open in VS Code button */}
          {repoPath && (
            <button
              title="Open in VS Code"
              onClick={() => {
                const sep = repoPath.includes("\\") ? "\\" : "/";
                ipc.openInVscode(repoPath + sep + diff.file_path).catch(() => {
                  ipc.openInVscode(repoPath);
                });
              }}
              style={{
                padding: "2px 8px",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 120ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3"; }}
            >
              ⎈ Open
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {showHunkActions && (
            <span
              style={{
                fontSize: "11px",
                color: "#3d9be9",
                background: "rgba(61,155,233,0.1)",
                padding: "2px 8px",
                borderRadius: "10px",
                fontWeight: 600,
              }}
            >
              {hunks.length} hunk{hunks.length !== 1 ? "s" : ""}
            </span>
          )}
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#1DB954",
              background: "rgba(29,185,84,0.12)",
              padding: "2px 8px",
              borderRadius: "10px",
            }}
          >
            +{diff.additions}
          </span>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#e5534b",
              background: "rgba(229,83,75,0.12)",
              padding: "2px 8px",
              borderRadius: "10px",
            }}
          >
            -{diff.deletions}
          </span>
          {/* Search toggle */}
          <button
            title="Search in diff (Ctrl+F)"
            onClick={() => { setShowSearch(v => !v); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 50); }}
            style={{
              padding: "2px 8px",
              fontSize: "10px",
              fontWeight: 700,
              color: showSearch ? "#f5a623" : "#b3b3b3",
              background: showSearch ? "rgba(245,166,35,0.12)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${showSearch ? "rgba(245,166,35,0.3)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            🔍
          </button>
          {/* Diff mode toggle */}
          <button
            title={sideBySide ? "Switch to unified diff" : "Switch to side-by-side diff"}
            onClick={() => setSideBySide((v) => !v)}
            style={{
              padding: "2px 8px",
              fontSize: "10px",
              fontWeight: 700,
              color: sideBySide ? "#1DB954" : "#b3b3b3",
              background: sideBySide ? "rgba(29,185,84,0.12)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${sideBySide ? "rgba(29,185,84,0.3)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              if (!sideBySide) (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              if (!sideBySide) (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
            }}
          >
            {sideBySide ? "⬛⬛ Unified" : "⬜⬜ Split"}
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          background: "#252525",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search in diff… (Esc to close)"
            style={{
              flex: 1,
              background: "var(--color-bg-highlight)",
              border: "1px solid #535353",
              borderRadius: "6px",
              padding: "4px 10px",
              color: "var(--color-text-primary)",
              fontSize: "12px",
              outline: "none",
            }}
          />
          {searchQuery && (
            <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
              {parsedLines.filter(l => l.type !== "header" && l.type !== "hunk" && l.content.toLowerCase().includes(searchQuery.toLowerCase())).length} matches
            </span>
          )}
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(""); }}
            style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "14px", padding: "2px 4px" }}
          >✕</button>
        </div>
      )}

      {/* Diff content */}
      {sideBySide ? (
        /* ── Side-by-side view ─────────────────────────────────── */
        <div
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
            fontSize: "12px",
            lineHeight: "1.6",
          }}
        >
          {/* Left pane (old) */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "auto",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: "44px" }} /><col /></colgroup>
              <tbody>
                {sideBySideRows.map((row, i) => {
                  if (row.old?.type === "hunk") {
                    return (
                      <tr key={i}>
                        <td colSpan={2} style={{ background: "rgba(61,155,233,0.08)", color: "#3d9be9", padding: "4px 12px", fontSize: "11px", whiteSpace: "pre", userSelect: "none" }}>
                          {row.old.content}
                        </td>
                      </tr>
                    );
                  }
                  const line = row.old;
                  const bg = line?.type === "remove" ? "rgba(229,83,75,0.12)" : "transparent";
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ color: "rgba(255,255,255,0.2)", padding: "0 6px", textAlign: "right", userSelect: "none", fontSize: "11px", whiteSpace: "nowrap" }}>
                        {line?.oldLine ?? ""}
                      </td>
                      <td style={{ color: line?.type === "remove" ? "#ffb3ae" : "#e0e0e0", padding: "0 12px 0 4px", whiteSpace: "pre", wordBreak: "break-all" }}>
                        {line?.content ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Right pane (new) */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: "44px" }} /><col /></colgroup>
              <tbody>
                {sideBySideRows.map((row, i) => {
                  if (row.old?.type === "hunk") {
                    return (
                      <tr key={i}>
                        <td colSpan={2} style={{ background: "rgba(61,155,233,0.08)", color: "#3d9be9", padding: "4px 12px", fontSize: "11px", whiteSpace: "pre", userSelect: "none" }}>
                          &nbsp;
                        </td>
                      </tr>
                    );
                  }
                  const line = row.new;
                  const bg = line?.type === "add" ? "rgba(29,185,84,0.1)" : "transparent";
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ color: "rgba(255,255,255,0.2)", padding: "0 6px", textAlign: "right", userSelect: "none", fontSize: "11px", whiteSpace: "nowrap" }}>
                        {line?.newLine ?? ""}
                      </td>
                      <td style={{ color: line?.type === "add" ? "#b6f5c8" : "#e0e0e0", padding: "0 12px 0 4px", whiteSpace: "pre", wordBreak: "break-all" }}>
                        {line?.content ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      /* ── Unified view ──────────────────────────────────────── */
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div
        ref={unifiedScrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "auto",
          fontFamily:
            '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
          fontSize: "12px",
          lineHeight: "1.6",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: "44px" }} />
            <col style={{ width: "44px" }} />
            <col style={{ width: "20px" }} />
            <col />
            {showHunkActions && <col style={{ width: "160px" }} />}
          </colgroup>
          <tbody>
            {parsedLines.map((line, i) => {
              if (line.type === "header") return null;

              if (line.type === "hunk") {
                const hunkIdx = hunkCount;
                hunkCount++;
                const hunkPatch = hunks[hunkIdx];
                return (
                  <tr key={i}>
                    <td
                      colSpan={showHunkActions ? 4 : 4}
                      style={{
                        background: "rgba(61,155,233,0.08)",
                        color: "#3d9be9",
                        padding: "4px 16px",
                        fontSize: "11px",
                        fontFamily: "inherit",
                        whiteSpace: "pre",
                        userSelect: "none",
                      }}
                    >
                      {line.content}
                    </td>
                    {showHunkActions && (
                      <td
                        style={{
                          background: "rgba(61,155,233,0.08)",
                          padding: "2px 8px 2px 4px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          verticalAlign: "middle",
                        }}
                      >
                        {onDiscardHunk && hunkPatch && (
                          <button
                            title="Discard this hunk (irreversible)"
                            onClick={() => onDiscardHunk(hunkPatch)}
                            style={{
                              padding: "2px 7px",
                              fontSize: "10px",
                              fontWeight: 700,
                              color: "#e5534b",
                              background: "rgba(229,83,75,0.15)",
                              border: "1px solid rgba(229,83,75,0.3)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              marginRight: "4px",
                              transition: "background 100ms ease",
                            }}
                            onMouseEnter={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.background =
                                "rgba(229,83,75,0.3)")
                            }
                            onMouseLeave={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.background =
                                "rgba(229,83,75,0.15)")
                            }
                          >
                            ✕ Discard
                          </button>
                        )}
                        {onStageHunk && hunkPatch && (
                          <button
                            title="Stage only this hunk"
                            onClick={() => onStageHunk(hunkPatch)}
                            style={{
                              padding: "2px 7px",
                              fontSize: "10px",
                              fontWeight: 700,
                              color: "#1DB954",
                              background: "rgba(29,185,84,0.15)",
                              border: "1px solid rgba(29,185,84,0.3)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              transition: "background 100ms ease",
                            }}
                            onMouseEnter={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.background =
                                "rgba(29,185,84,0.3)")
                            }
                            onMouseLeave={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.background =
                                "rgba(29,185,84,0.15)")
                            }
                          >
                            + Stage
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              }

              const isMatch = searchQuery
                ? line.content.toLowerCase().includes(searchQuery.toLowerCase())
                : true;

              const bg =
                line.type === "add"
                  ? "rgba(29,185,84,0.08)"
                  : line.type === "remove"
                  ? "rgba(229,83,75,0.08)"
                  : "transparent";

              const lineNumColor = "rgba(255,255,255,0.2)";
              const sigColor =
                line.type === "add"
                  ? "#1DB954"
                  : line.type === "remove"
                  ? "#e5534b"
                  : "transparent";
              const sig =
                line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

              return (
                <tr key={i} style={{ background: bg, opacity: searchQuery && !isMatch ? 0.3 : 1 }}>
                  {/* Old line number */}
                  <td
                    style={{
                      color: lineNumColor,
                      padding: "0 8px",
                      textAlign: "right",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      verticalAlign: "top",
                      fontSize: "11px",
                    }}
                  >
                    {line.type !== "add" && line.oldLine !== undefined ? line.oldLine : ""}
                  </td>
                  {/* New line number */}
                  <td
                    style={{
                      color: lineNumColor,
                      padding: "0 8px",
                      textAlign: "right",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      verticalAlign: "top",
                      fontSize: "11px",
                    }}
                  >
                    {line.type !== "remove" && line.newLine !== undefined ? line.newLine : ""}
                  </td>
                  {/* +/- sign */}
                  <td
                    style={{
                      color: sigColor,
                      textAlign: "center",
                      userSelect: "none",
                      fontWeight: 700,
                      verticalAlign: "top",
                    }}
                  >
                    {sig}
                  </td>
                  {/* Line content */}
                  <td
                    style={{
                      color:
                        line.type === "add"
                          ? "#b6f5c8"
                          : line.type === "remove"
                          ? "#ffb3ae"
                          : "#e0e0e0",
                      padding: "0 16px 0 4px",
                      whiteSpace: "pre",
                      wordBreak: "break-all",
                      verticalAlign: "top",
                    }}
                  >
                    <HighlightText text={line.content} query={searchQuery} />
                  </td>
                  {/* Empty cell to fill hunk-action column */}
                  {showHunkActions && <td />}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <DiffMinimap
        lines={parsedLines}
        scrollContainerRef={unifiedScrollRef}
        searchQuery={searchQuery}
      />
      </div>
      )}
    </div>
  );
}
