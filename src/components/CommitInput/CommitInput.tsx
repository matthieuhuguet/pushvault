import React, { useState, useRef, useCallback } from "react";

const CONVENTIONAL_PREFIXES = [
  { prefix: "feat", description: "A new feature", emoji: "✨" },
  { prefix: "fix", description: "A bug fix", emoji: "🐛" },
  { prefix: "docs", description: "Documentation only changes", emoji: "📝" },
  { prefix: "style", description: "Code style changes (formatting)", emoji: "🎨" },
  { prefix: "refactor", description: "Code refactoring", emoji: "♻️" },
  { prefix: "perf", description: "Performance improvements", emoji: "⚡" },
  { prefix: "test", description: "Adding or updating tests", emoji: "✅" },
  { prefix: "chore", description: "Build process or auxiliary tool changes", emoji: "🔧" },
  { prefix: "ci", description: "CI/CD configuration changes", emoji: "👷" },
  { prefix: "build", description: "Build system changes", emoji: "📦" },
  { prefix: "revert", description: "Revert a previous commit", emoji: "⏪" },
  { prefix: "wip", description: "Work in progress", emoji: "🚧" },
];

// Secret patterns to detect
const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/,  // GitHub PAT
  /sk-[a-zA-Z0-9]{48}/,   // OpenAI key
  /AIza[0-9A-Za-z-_]{35}/, // Google API key
  /AKIA[0-9A-Z]{16}/,      // AWS access key
  /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
  /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*\S+/i,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
];

interface Props {
  value: string;
  onChange: (val: string) => void;
  onCommit: () => void;
  onCommitAndPush: () => void;
  disabled?: boolean;
  amend?: boolean;
  onAmendChange?: (v: boolean) => void;
  stagedCount?: number;
}

export function CommitInput({
  value,
  onChange,
  onCommit,
  onCommitAndPush,
  disabled,
  amend,
  onAmendChange,
  stagedCount = 0,
}: Props) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof CONVENTIONAL_PREFIXES>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check for secret patterns in message
  const hasSecret = SECRET_PATTERNS.some(p => p.test(value));

  // Subject line length
  const firstLine = value.split("\n")[0] || "";
  const subjectLen = firstLine.length;
  const isOverLimit = subjectLen > 72;
  const isNearLimit = subjectLen > 50;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);

    // Show autocomplete if typing at the start with no colon yet
    const firstWord = v.split(/[\s:]/)[0];
    if (v.length > 0 && !v.includes(":") && !v.includes(" ")) {
      const matched = CONVENTIONAL_PREFIXES.filter(p =>
        p.prefix.startsWith(firstWord.toLowerCase())
      );
      setSuggestions(matched);
      setShowSuggestions(matched.length > 0);
      setSelectedSuggestion(0);
    } else {
      setShowSuggestions(false);
    }
  }, [onChange]);

  const applySuggestion = useCallback((prefix: string) => {
    onChange(`${prefix}: `);
    setShowSuggestions(false);
    textareaRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion(s => Math.min(s + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestion(s => Math.max(s - 1, 0));
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        if (suggestions[selectedSuggestion]) {
          applySuggestion(suggestions[selectedSuggestion].prefix);
        }
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      if (e.shiftKey) {
        onCommitAndPush();
      } else {
        onCommit();
      }
    }
  }, [showSuggestions, suggestions, selectedSuggestion, applySuggestion, onCommit, onCommitAndPush]);

  return (
    <div style={{ position: "relative" }}>
      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          right: 0,
          background: "#3d3d3d",
          border: "1px solid #535353",
          borderRadius: "8px",
          marginBottom: "4px",
          overflow: "hidden",
          zIndex: 50,
          boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.prefix}
              onMouseDown={() => applySuggestion(s.prefix)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                background: i === selectedSuggestion ? "rgba(29,185,84,0.15)" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                borderLeft: i === selectedSuggestion ? "2px solid #1DB954" : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: "16px" }}>{s.emoji}</span>
              <span style={{
                fontFamily: "monospace",
                color: "#1DB954",
                fontWeight: 700,
                fontSize: "13px",
                minWidth: "64px",
              }}>{s.prefix}:</span>
              <span style={{ color: "#b3b3b3", fontSize: "12px" }}>{s.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Secret warning */}
      {hasSecret && (
        <div style={{
          background: "rgba(232,82,90,0.15)",
          border: "1px solid rgba(232,82,90,0.4)",
          borderRadius: "6px",
          padding: "8px 12px",
          marginBottom: "8px",
          fontSize: "12px",
          color: "#E8525A",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span>⚠️</span>
          <span>
            <strong>Possible secret detected</strong> in commit message.
            Please review before committing.
          </span>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Commit message… (type feat/fix/chore for suggestions)"
        rows={3}
        style={{
          width: "100%",
          background: "#3d3d3d",
          border: `1px solid ${hasSecret ? "rgba(232,82,90,0.5)" : isOverLimit ? "rgba(245,166,35,0.5)" : "#535353"}`,
          borderRadius: "8px",
          padding: "10px 12px",
          color: "#fff",
          fontSize: "13px",
          fontFamily: "'system-ui', sans-serif",
          resize: "vertical",
          outline: "none",
          lineHeight: 1.5,
          boxSizing: "border-box",
        }}
      />

      {/* Subject length indicator */}
      {subjectLen > 0 && (
        <div style={{
          textAlign: "right",
          fontSize: "11px",
          color: isOverLimit ? "#E8525A" : isNearLimit ? "#F5A623" : "#535353",
          marginTop: "3px",
          marginBottom: "8px",
        }}>
          {subjectLen}/72
        </div>
      )}

      {/* Amend checkbox */}
      {onAmendChange && (
        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          color: "#b3b3b3",
          cursor: "pointer",
          marginBottom: "8px",
        }}>
          <input
            type="checkbox"
            checked={amend}
            onChange={e => onAmendChange(e.target.checked)}
            style={{ accentColor: "#1DB954" }}
          />
          Amend last commit
        </label>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onCommit}
          disabled={disabled || !value.trim() || stagedCount === 0}
          style={{
            flex: 1,
            background: disabled || !value.trim() || stagedCount === 0 ? "#282828" : "#1DB954",
            border: "none",
            borderRadius: "500px",
            padding: "10px",
            color: disabled || !value.trim() || stagedCount === 0 ? "#535353" : "#000",
            fontSize: "13px",
            fontWeight: 700,
            cursor: disabled || !value.trim() || stagedCount === 0 ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          Commit
          {stagedCount > 0 && ` (${stagedCount})`}
        </button>
        <button
          onClick={onCommitAndPush}
          disabled={disabled || !value.trim() || stagedCount === 0}
          style={{
            flex: 2,
            background: "transparent",
            border: `1px solid ${disabled || !value.trim() || stagedCount === 0 ? "#282828" : "#1DB954"}`,
            borderRadius: "500px",
            padding: "10px",
            color: disabled || !value.trim() || stagedCount === 0 ? "#535353" : "#1DB954",
            fontSize: "13px",
            fontWeight: 700,
            cursor: disabled || !value.trim() || stagedCount === 0 ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          Commit + Push
        </button>
      </div>
    </div>
  );
}
