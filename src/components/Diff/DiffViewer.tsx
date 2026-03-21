import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiffResult } from "../../types";
import { ipc } from "../../lib/ipc";

/* ── Image file detection ─────────────────────────────────── */
const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tiff", "tif", "avif",
]);

function getExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot >= 0 ? filePath.slice(dot + 1).toLowerCase() : "";
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filePath));
}

function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon",
    tiff: "image/tiff", tif: "image/tiff", avif: "image/avif",
  };
  return map[ext] ?? "application/octet-stream";
}

/* ── Image Diff Preview ───────────────────────────────────── */
type ImageViewMode = "side-by-side" | "onion-skin" | "swipe";

interface ImageDiffPreviewProps {
  filePath: string;
  repoPath: string;
}

function ImageDiffPreview({ filePath, repoPath }: ImageDiffPreviewProps) {
  const [newSrc, setNewSrc] = useState<string | null>(null);
  const [oldSrc, setOldSrc] = useState<string | null>(null);
  const [mode, setMode] = useState<ImageViewMode>("side-by-side");
  const [opacity, setOpacity] = useState(50);
  const [swipePos, setSwipePos] = useState(50);
  const [loadError, setLoadError] = useState<string | null>(null);
  const swipeRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const ext = getExtension(filePath);
  const mime = mimeForExt(ext);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    // Load current working copy
    ipc.readFileBase64(repoPath, filePath)
      .then((b64) => { if (!cancelled) setNewSrc(`data:${mime};base64,${b64}`); })
      .catch(() => { if (!cancelled) setNewSrc(null); });

    // Load HEAD version
    ipc.getFileBase64AtRef(repoPath, filePath, "HEAD")
      .then((b64) => { if (!cancelled) setOldSrc(`data:${mime};base64,${b64}`); })
      .catch(() => { if (!cancelled) setOldSrc(null); }); // file may be new

    return () => { cancelled = true; };
  }, [repoPath, filePath, mime]);

  const handleSwipeMove = useCallback((clientX: number) => {
    const el = swipeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSwipePos(pct);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging.current) handleSwipeMove(e.clientX); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [handleSwipeMove]);

  if (loadError) {
    return <div style={{ padding: 20, color: "var(--color-error)" }}>{loadError}</div>;
  }

  if (!newSrc && !oldSrc) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-muted)", fontSize: 13 }}>
        Loading image preview…
      </div>
    );
  }

  const imgStyle: React.CSSProperties = {
    maxWidth: "100%",
    maxHeight: "400px",
    objectFit: "contain",
    borderRadius: "6px",
    border: "1px solid var(--overlay-light)",
    background: "repeating-conic-gradient(var(--overlay-subtle) 0% 25%, transparent 0% 50%) 50% / 16px 16px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Mode selector */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
        background: "var(--color-bg-elevated)", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginRight: 8 }}>
          Image Preview
        </span>
        {(["side-by-side", "onion-skin", "swipe"] as ImageViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "3px 10px", fontSize: 10, fontWeight: 700, borderRadius: 8, cursor: "pointer",
              border: `1px solid ${mode === m ? "var(--color-accent-border)" : "var(--overlay-light)"}`,
              background: mode === m ? "var(--color-accent-dim)" : "var(--overlay-subtle)",
              color: mode === m ? "var(--color-accent)" : "var(--color-text-secondary)",
              transition: "all 120ms ease",
            }}
          >
            {m === "side-by-side" ? "Side by Side" : m === "onion-skin" ? "Onion Skin" : "Swipe"}
          </button>
        ))}
        {mode === "onion-skin" && (
          <input
            type="range" min={0} max={100} value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            title={`Opacity: ${opacity}%`}
            style={{ width: 120, accentColor: "var(--color-accent)" }}
          />
        )}
      </div>

      {/* Image content */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {mode === "side-by-side" && (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "center" }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-error)", marginBottom: 6 }}>
                Old (HEAD)
              </div>
              {oldSrc ? (
                <img src={oldSrc} alt="Old version" style={imgStyle} />
              ) : (
                <div style={{ padding: 24, color: "var(--color-text-disabled)", fontSize: 12, border: "1px dashed var(--overlay-light)", borderRadius: 6 }}>
                  (new file)
                </div>
              )}
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "var(--overlay-light)" }} />
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-success)", marginBottom: 6 }}>
                New (Working Copy)
              </div>
              {newSrc ? (
                <img src={newSrc} alt="New version" style={imgStyle} />
              ) : (
                <div style={{ padding: 24, color: "var(--color-text-disabled)", fontSize: 12, border: "1px dashed var(--overlay-light)", borderRadius: 6 }}>
                  (deleted)
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "onion-skin" && (
          <div style={{ position: "relative", display: "inline-block", margin: "0 auto" }}>
            {oldSrc && <img src={oldSrc} alt="Old version" style={{ ...imgStyle, display: "block" }} />}
            {newSrc && (
              <img
                src={newSrc}
                alt="New version"
                style={{
                  ...imgStyle,
                  position: oldSrc ? "absolute" : "relative",
                  top: 0, left: 0,
                  opacity: opacity / 100,
                  display: "block",
                }}
              />
            )}
            {!oldSrc && !newSrc && (
              <div style={{ color: "var(--color-text-disabled)", fontSize: 12 }}>No images to compare</div>
            )}
          </div>
        )}

        {mode === "swipe" && (
          <div
            ref={swipeRef}
            onMouseDown={(e) => { dragging.current = true; handleSwipeMove(e.clientX); }}
            style={{
              position: "relative", display: "inline-block", cursor: "ew-resize",
              overflow: "hidden", borderRadius: 6, border: "1px solid var(--overlay-light)",
              background: "repeating-conic-gradient(var(--overlay-subtle) 0% 25%, transparent 0% 50%) 50% / 16px 16px",
            }}
          >
            {/* New image (full, underneath) */}
            {newSrc && <img src={newSrc} alt="New version" style={{ display: "block", maxWidth: "100%", maxHeight: 400, objectFit: "contain" }} />}
            {/* Old image (clipped from left) */}
            {oldSrc && (
              <div style={{
                position: "absolute", top: 0, left: 0, bottom: 0,
                width: `${swipePos}%`, overflow: "hidden",
              }}>
                <img src={oldSrc} alt="Old version" style={{ display: "block", maxWidth: "none", maxHeight: 400, objectFit: "contain", width: swipeRef.current?.offsetWidth }} />
              </div>
            )}
            {/* Swipe divider */}
            <div style={{
              position: "absolute", top: 0, bottom: 0, left: `${swipePos}%`,
              width: 2, background: "var(--color-accent)", transform: "translateX(-1px)",
              pointerEvents: "none",
            }}>
              <div style={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: 24, height: 24, borderRadius: "50%",
                background: "var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}>
                <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>\u2194</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

/* ── Word-level diff highlighting ───────────────────────────── */

/** Simple word-level diff: compare two strings and return segments marked as changed/unchanged */
function computeWordDiff(oldStr: string, newStr: string): { old: { text: string; changed: boolean }[]; new: { text: string; changed: boolean }[] } {
  // Tokenize into words and whitespace
  const tokenize = (s: string) => s.match(/\S+|\s+/g) || [];
  const oldTokens = tokenize(oldStr);
  const newTokens = tokenize(newStr);

  // Simple LCS-based diff on tokens
  const m = oldTokens.length;
  const n = newTokens.length;

  // For performance, skip LCS on very long lines
  if (m > 200 || n > 200) {
    return {
      old: [{ text: oldStr, changed: true }],
      new: [{ text: newStr, changed: true }],
    };
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldTokens[i - 1] === newTokens[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to find common tokens
  const oldMarked = new Array(m).fill(true);
  const newMarked = new Array(n).fill(true);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldTokens[i - 1] === newTokens[j - 1]) {
      oldMarked[i - 1] = false;
      newMarked[j - 1] = false;
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Build segments, merging consecutive same-state tokens
  const buildSegments = (tokens: string[], marked: boolean[]) => {
    const segs: { text: string; changed: boolean }[] = [];
    for (let k = 0; k < tokens.length; k++) {
      if (segs.length > 0 && segs[segs.length - 1].changed === marked[k]) {
        segs[segs.length - 1].text += tokens[k];
      } else {
        segs.push({ text: tokens[k], changed: marked[k] });
      }
    }
    return segs;
  };

  return { old: buildSegments(oldTokens, oldMarked), new: buildSegments(newTokens, newMarked) };
}

/** Pair consecutive remove+add lines in parsed diff for word-level highlighting */
function buildLinePairs(lines: ParsedLine[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "remove") {
      const removeStart = i;
      const removes: number[] = [];
      while (i < lines.length && lines[i].type === "remove") { removes.push(i); i++; }
      const adds: number[] = [];
      while (i < lines.length && lines[i].type === "add") { adds.push(i); i++; }
      // Pair up matching remove/add lines
      const pairCount = Math.min(removes.length, adds.length);
      for (let p = 0; p < pairCount; p++) {
        pairs.set(removes[p], adds[p]);
        pairs.set(adds[p], removes[p]);
      }
    } else {
      i++;
    }
  }
  return pairs;
}

/** Render content with word-diff highlighting */
function WordDiffContent({ content, segments, type }: { content: string; segments: { text: string; changed: boolean }[] | null; type: "add" | "remove" }) {
  if (!segments) return <>{content}</>;
  const highlightBg = type === "add" ? "var(--diff-add-bg-strong)" : "var(--diff-remove-bg-strong)";
  return (
    <>
      {segments.map((seg, i) =>
        seg.changed ? (
          <span key={i} style={{ background: highlightBg, borderRadius: "2px" }}>{seg.text}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
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
      <mark key={idx} style={{ background: "var(--color-warning)", color: "#000", borderRadius: "2px", padding: "0 1px" }}>
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

    // Read theme-aware colors from CSS variables
    const style = getComputedStyle(document.documentElement);
    const minimapBg = style.getPropertyValue("--diff-minimap-bg").trim() || "#1a1a1a";
    const minimapCtx = style.getPropertyValue("--diff-minimap-context").trim() || "#232323";
    const addColor = style.getPropertyValue("--color-success").trim() || "#1db954";
    const removeColor = style.getPropertyValue("--color-error").trim() || "#e5534b";
    const hunkColor = style.getPropertyValue("--color-info").trim() || "#3d9be9";
    const warnColor = style.getPropertyValue("--color-warning").trim() || "#f5a623";

    ctx.fillStyle = minimapBg;
    ctx.fillRect(0, 0, W, H);

    const lineH = H / visibleLines.length;
    visibleLines.forEach((line, i) => {
      const y = i * lineH;
      const h = Math.max(1, lineH);
      if (line.type === "add") {
        const isMatch =
          searchQuery &&
          line.content.toLowerCase().includes(searchQuery.toLowerCase());
        ctx.fillStyle = isMatch ? warnColor + "aa" : addColor + "66";
      } else if (line.type === "remove") {
        ctx.fillStyle = removeColor + "66";
      } else if (line.type === "hunk") {
        ctx.fillStyle = hunkColor + "44";
      } else {
        ctx.fillStyle = minimapCtx;
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
        borderLeft: "1px solid var(--overlay-soft)",
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
          background: "var(--overlay-light)",
          border: "1px solid var(--overlay-vivid)",
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

  // Word-level diff pairs and cache
  const linePairs = useMemo(() => buildLinePairs(parsedLines), [parsedLines]);
  const wordDiffCache = useMemo(() => {
    const cache = new Map<number, { old: { text: string; changed: boolean }[]; new: { text: string; changed: boolean }[] }>();
    for (const [removeIdx, addIdx] of linePairs.entries()) {
      if (parsedLines[removeIdx]?.type === "remove" && parsedLines[addIdx]?.type === "add" && !cache.has(removeIdx)) {
        cache.set(removeIdx, computeWordDiff(parsedLines[removeIdx].content, parsedLines[addIdx].content));
      }
    }
    return cache;
  }, [parsedLines, linePairs]);

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
            <circle cx="12" cy="12" r="10" stroke="var(--overlay-medium)" strokeWidth="3" />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          Loading diff\u2026
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
            stroke="var(--color-text-disabled)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <polyline points="14 2 14 8 20 8" stroke="var(--color-text-disabled)" strokeWidth="1.5" />
          <line x1="9" y1="13" x2="15" y2="13" stroke="var(--color-text-disabled)" strokeWidth="1.5" />
          <line x1="9" y1="17" x2="15" y2="17" stroke="var(--color-text-disabled)" strokeWidth="1.5" />
        </svg>
        <span style={{ fontSize: "13px" }}>Select a file to see its diff</span>
      </div>
    );
  }

  if (!diff.content || diff.content.trim() === "") {
    // If it's an image with no text diff, show image preview
    if (repoPath && isImageFile(diff.file_path)) {
      return <ImageDiffPreview filePath={diff.file_path} repoPath={repoPath} />;
    }
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

  // Image files: show visual preview instead of text diff
  if (repoPath && isImageFile(diff.file_path)) {
    return <ImageDiffPreview filePath={diff.file_path} repoPath={repoPath} />;
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
          background: "var(--color-bg-elevated)",
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
              color: copied ? "var(--color-success)" : "var(--color-text-secondary)",
              background: copied ? "var(--color-success-dim)" : "var(--overlay-subtle)",
              border: `1px solid ${copied ? "var(--color-success-border)" : "var(--overlay-light)"}`,
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            {copied ? "\u2713 Copied" : "\u2398 Copy path"}
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
                background: "var(--overlay-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 120ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)"; }}
            >
              \u2388 Open
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {showHunkActions && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--color-info)",
                background: "var(--color-info-dim)",
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
              color: "var(--color-success)",
              background: "var(--color-success-dim)",
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
              color: "var(--color-error)",
              background: "var(--color-error-dim)",
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
              color: showSearch ? "var(--color-warning)" : "var(--color-text-secondary)",
              background: showSearch ? "var(--color-warning-dim)" : "var(--overlay-subtle)",
              border: `1px solid ${showSearch ? "var(--color-warning-border)" : "var(--overlay-light)"}`,
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            \uD83D\uDD0D
          </button>
          {/* Diff mode toggle */}
          <button
            title={sideBySide ? "Switch to unified diff" : "Switch to side-by-side diff"}
            onClick={() => setSideBySide((v) => !v)}
            style={{
              padding: "2px 8px",
              fontSize: "10px",
              fontWeight: 700,
              color: sideBySide ? "var(--color-accent)" : "var(--color-text-secondary)",
              background: sideBySide ? "var(--color-accent-dim)" : "var(--overlay-subtle)",
              border: `1px solid ${sideBySide ? "var(--color-accent-border)" : "var(--overlay-light)"}`,
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              if (!sideBySide) (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              if (!sideBySide) (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
            }}
          >
            {sideBySide ? "\u2B1B\u2B1B Unified" : "\u2B1C\u2B1C Split"}
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
          background: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search in diff\u2026 (Esc to close)"
            style={{
              flex: 1,
              background: "var(--color-bg-highlight)",
              border: "1px solid var(--color-border)",
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
          >\u2715</button>
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
              borderRight: "1px solid var(--overlay-subtle)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: "44px" }} /><col /></colgroup>
              <tbody>
                {sideBySideRows.map((row, i) => {
                  if (row.old?.type === "hunk") {
                    return (
                      <tr key={i}>
                        <td colSpan={2} style={{ background: "var(--diff-hunk-bg)", color: "var(--diff-hunk-text)", padding: "4px 12px", fontSize: "11px", whiteSpace: "pre", userSelect: "none" }}>
                          {row.old.content}
                        </td>
                      </tr>
                    );
                  }
                  const line = row.old;
                  const bg = line?.type === "remove" ? "var(--diff-remove-bg-strong)" : "transparent";
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ color: "var(--overlay-vivid)", padding: "0 6px", textAlign: "right", userSelect: "none", fontSize: "11px", whiteSpace: "nowrap" }}>
                        {line?.oldLine ?? ""}
                      </td>
                      <td style={{ color: line?.type === "remove" ? "var(--diff-remove-text)" : "var(--diff-context-text)", padding: "0 12px 0 4px", whiteSpace: "pre", wordBreak: "break-all" }}>
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
                        <td colSpan={2} style={{ background: "var(--diff-hunk-bg)", color: "var(--diff-hunk-text)", padding: "4px 12px", fontSize: "11px", whiteSpace: "pre", userSelect: "none" }}>
                          &nbsp;
                        </td>
                      </tr>
                    );
                  }
                  const line = row.new;
                  const bg = line?.type === "add" ? "var(--diff-add-bg-strong)" : "transparent";
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ color: "var(--overlay-vivid)", padding: "0 6px", textAlign: "right", userSelect: "none", fontSize: "11px", whiteSpace: "nowrap" }}>
                        {line?.newLine ?? ""}
                      </td>
                      <td style={{ color: line?.type === "add" ? "var(--diff-add-text)" : "var(--diff-context-text)", padding: "0 12px 0 4px", whiteSpace: "pre", wordBreak: "break-all" }}>
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
                        background: "var(--diff-hunk-bg)",
                        color: "var(--diff-hunk-text)",
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
                          background: "var(--diff-hunk-bg)",
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
                              color: "var(--color-error)",
                              background: "var(--color-error-dim)",
                              border: "1px solid var(--color-error-border)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              marginRight: "4px",
                              transition: "background 100ms ease",
                            }}
                            onMouseEnter={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.background =
                                "var(--diff-remove-bg-strong)")
                            }
                            onMouseLeave={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.background =
                                "var(--color-error-dim)")
                            }
                          >
                            \u2715 Discard
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
                              color: "var(--color-success)",
                              background: "var(--color-success-dim)",
                              border: "1px solid var(--color-success-border)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              transition: "background 100ms ease",
                            }}
                            onMouseEnter={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.background =
                                "var(--diff-add-bg-strong)")
                            }
                            onMouseLeave={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.background =
                                "var(--color-success-dim)")
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
                  ? "var(--diff-add-bg)"
                  : line.type === "remove"
                  ? "var(--diff-remove-bg)"
                  : "transparent";

              const lineNumColor = "var(--overlay-vivid)";
              const sigColor =
                line.type === "add"
                  ? "var(--color-success)"
                  : line.type === "remove"
                  ? "var(--color-error)"
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
                          ? "var(--diff-add-text)"
                          : line.type === "remove"
                          ? "var(--diff-remove-text)"
                          : "var(--diff-context-text)",
                      padding: "0 16px 0 4px",
                      whiteSpace: "pre",
                      wordBreak: "break-all",
                      verticalAlign: "top",
                    }}
                  >
                    {searchQuery ? (
                      <HighlightText text={line.content} query={searchQuery} />
                    ) : (line.type === "remove" || line.type === "add") && linePairs.has(i) ? (
                      <WordDiffContent
                        content={line.content}
                        segments={
                          line.type === "remove"
                            ? wordDiffCache.get(i)?.old ?? null
                            : wordDiffCache.get(linePairs.get(i)!)?.new ?? null
                        }
                        type={line.type}
                      />
                    ) : (
                      line.content
                    )}
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
