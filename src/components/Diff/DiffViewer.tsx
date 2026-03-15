import React, { useMemo } from "react";
import type { DiffResult } from "../../types";

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
      // Hunk header: @@ -l,s +l,s @@
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

interface DiffViewerProps {
  diff: DiffResult | null;
  loading?: boolean;
}

export function DiffViewer({ diff, loading }: DiffViewerProps) {
  const parsedLines = useMemo(() => {
    if (!diff?.content) return [];
    return parseDiff(diff.content);
  }, [diff?.content]);

  if (loading) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6a6a6a",
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
          color: "#535353",
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
          color: "#535353",
          fontSize: "13px",
        }}
      >
        No diff content available
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#1a1a1a",
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
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#b3b3b3",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {diff.file_path}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
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
        </div>
      </div>

      {/* Diff lines */}
      <div
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
          </colgroup>
          <tbody>
            {parsedLines.map((line, i) => {
              if (line.type === "header") return null;

              if (line.type === "hunk") {
                return (
                  <tr key={i}>
                    <td
                      colSpan={4}
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
                  </tr>
                );
              }

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
                <tr
                  key={i}
                  style={{
                    background: bg,
                  }}
                >
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
                    {line.type !== "add" && line.oldLine !== undefined
                      ? line.oldLine
                      : ""}
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
                    {line.type !== "remove" && line.newLine !== undefined
                      ? line.newLine
                      : ""}
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
