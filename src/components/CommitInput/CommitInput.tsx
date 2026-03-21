import React, { useState, useRef, useCallback } from "react";
import { useTemplateStore } from "../../store/templateStore";

const CONVENTIONAL_PREFIXES = [
  { prefix: "feat", description: "A new feature", emoji: "\u2728" },
  { prefix: "fix", description: "A bug fix", emoji: "\uD83D\uDC1B" },
  { prefix: "docs", description: "Documentation only changes", emoji: "\uD83D\uDCDD" },
  { prefix: "style", description: "Code style changes (formatting)", emoji: "\uD83C\uDFA8" },
  { prefix: "refactor", description: "Code refactoring", emoji: "\u267B\uFE0F" },
  { prefix: "perf", description: "Performance improvements", emoji: "\u26A1" },
  { prefix: "test", description: "Adding or updating tests", emoji: "\u2705" },
  { prefix: "chore", description: "Build process or auxiliary tool changes", emoji: "\uD83D\uDD27" },
  { prefix: "ci", description: "CI/CD configuration changes", emoji: "\uD83D\uDC77" },
  { prefix: "build", description: "Build system changes", emoji: "\uD83D\uDCE6" },
  { prefix: "revert", description: "Revert a previous commit", emoji: "\u23EA" },
  { prefix: "wip", description: "Work in progress", emoji: "\uD83D\uDEA7" },
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
  onPushOnly?: () => void;
  onAiGenerate?: () => void;
  isGenerating?: boolean;
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
  onPushOnly,
  onAiGenerate,
  isGenerating,
  disabled,
  amend,
  onAmendChange,
  stagedCount = 0,
}: Props) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof CONVENTIONAL_PREFIXES>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const templates = useTemplateStore((s) => s.templates);
  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const removeTemplate = useTemplateStore((s) => s.removeTemplate);

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
          background: "var(--color-bg-highlight)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          marginBottom: "4px",
          overflow: "hidden",
          zIndex: 50,
          boxShadow: "var(--shadow-lg)",
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.prefix}
              onMouseDown={() => applySuggestion(s.prefix)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                background: i === selectedSuggestion ? "var(--color-accent-dim)" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                borderLeft: i === selectedSuggestion ? "2px solid var(--color-accent)" : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: "16px" }}>{s.emoji}</span>
              <span style={{
                fontFamily: "monospace",
                color: "var(--color-accent)",
                fontWeight: 700,
                fontSize: "13px",
                minWidth: "64px",
              }}>{s.prefix}:</span>
              <span style={{ color: "var(--color-text-secondary)", fontSize: "12px" }}>{s.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Secret warning */}
      {hasSecret && (
        <div style={{
          background: "var(--color-error-dim)",
          border: "1px solid var(--color-error-border)",
          borderRadius: "6px",
          padding: "8px 12px",
          marginBottom: "8px",
          fontSize: "12px",
          color: "var(--color-error)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span>{"\u26A0\uFE0F"}</span>
          <span>
            <strong>Possible secret detected</strong> in commit message.
            Please review before committing.
          </span>
        </div>
      )}

      {/* Template bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        {/* Template picker button */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => { setShowTemplates((v) => !v); setShowSaveTemplate(false); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              background: showTemplates ? "var(--color-accent-dim)" : "var(--overlay-subtle)",
              border: `1px solid ${showTemplates ? "var(--color-accent-border)" : "var(--color-border-subtle)"}`,
              borderRadius: "6px",
              color: showTemplates ? "var(--color-accent)" : "var(--color-text-muted)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M8 8h8M8 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Templates
          </button>
          {showTemplates && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: 0,
              marginBottom: "4px",
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              minWidth: "200px",
              zIndex: 60,
              padding: "4px 0",
              maxHeight: "240px",
              overflowY: "auto",
            }}>
              {templates.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "7px 12px",
                    cursor: "pointer",
                    transition: "background 100ms ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-light)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  onClick={() => {
                    onChange(t.template);
                    setShowTemplates(false);
                    textareaRef.current?.focus();
                  }}
                >
                  <span style={{ fontSize: "12px", color: "var(--color-text-primary)", flex: 1, fontWeight: 500 }}>
                    {t.name}
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--color-text-disabled)", fontFamily: "monospace" }}>
                    {t.template.slice(0, 20)}{t.template.length > 20 ? "…" : ""}
                  </span>
                  {!["feat", "fix", "refactor", "docs", "chore", "wip", "release"].includes(t.id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTemplate(t.id); }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-text-disabled)",
                        cursor: "pointer",
                        fontSize: "10px",
                        padding: "2px",
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save as template button */}
        {value.trim() && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowSaveTemplate((v) => !v); setShowTemplates(false); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                background: "none",
                border: "none",
                color: "var(--color-text-disabled)",
                fontSize: "10px",
                cursor: "pointer",
                transition: "color 120ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-disabled)"; }}
            >
              Save as template
            </button>
            {showSaveTemplate && (
              <div style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: "4px",
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                padding: "10px",
                zIndex: 60,
                display: "flex",
                gap: "6px",
              }}>
                <input
                  type="text"
                  placeholder="Template name…"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTemplateName.trim()) {
                      addTemplate(newTemplateName.trim(), value);
                      setNewTemplateName("");
                      setShowSaveTemplate(false);
                    }
                    if (e.key === "Escape") setShowSaveTemplate(false);
                  }}
                  autoFocus
                  style={{
                    padding: "5px 8px",
                    background: "var(--overlay-subtle)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    color: "var(--color-text-primary)",
                    fontSize: "11px",
                    outline: "none",
                    width: "140px",
                  }}
                />
                <button
                  onClick={() => {
                    if (newTemplateName.trim()) {
                      addTemplate(newTemplateName.trim(), value);
                      setNewTemplateName("");
                      setShowSaveTemplate(false);
                    }
                  }}
                  disabled={!newTemplateName.trim()}
                  style={{
                    padding: "5px 10px",
                    background: newTemplateName.trim() ? "var(--color-accent)" : "var(--color-btn-disabled-bg)",
                    border: "none",
                    borderRadius: "6px",
                    color: newTemplateName.trim() ? "#000" : "var(--color-btn-disabled-text)",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: newTemplateName.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Commit message\u2026 (type feat/fix/chore for suggestions)"
        rows={3}
        style={{
          width: "100%",
          background: "var(--color-bg-highlight)",
          border: `1px solid ${hasSecret ? "var(--color-error-border)" : isOverLimit ? "var(--color-warning-border)" : "var(--color-border)"}`,
          borderRadius: "8px",
          padding: "10px 12px",
          color: "var(--color-text-primary)",
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
          color: isOverLimit ? "var(--color-error)" : isNearLimit ? "var(--color-warning)" : "var(--color-text-disabled)",
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
          color: "var(--color-text-secondary)",
          cursor: "pointer",
          marginBottom: "8px",
        }}>
          <input
            type="checkbox"
            checked={amend}
            onChange={e => onAmendChange(e.target.checked)}
            style={{ accentColor: "var(--color-accent)" }}
          />
          Amend last commit
        </label>
      )}

      {/* AI generate + Push only row */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        {onAiGenerate && (
          <button
            onClick={onAiGenerate}
            disabled={isGenerating || stagedCount === 0}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "6px 10px",
              color: stagedCount > 0 ? "var(--color-info)" : "var(--color-text-disabled)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: stagedCount > 0 ? "pointer" : "not-allowed",
              transition: "all 150ms ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
            }}
            onMouseEnter={(e) => {
              if (stagedCount > 0) {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-info-dim)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-info-border)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a5 5 0 0 1 5 5c0 2-1.5 3.5-3 4.5V13a2 2 0 0 1-4 0v-1.5C8.5 10.5 7 9 7 7a5 5 0 0 1 5-5z" />
              <path d="M10 17v2a2 2 0 0 0 4 0v-2" />
            </svg>
            {isGenerating ? "Generating…" : "AI Message"}
          </button>
        )}
        {onPushOnly && (
          <button
            onClick={onPushOnly}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "6px 10px",
              color: "var(--color-text-secondary)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 150ms ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--overlay-light)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            Push Only
          </button>
        )}
      </div>

      {/* Action buttons */}
      {(() => {
        // Amend mode allows 0 staged files (message-only amend)
        const canCommit = !disabled && !!value.trim() && (stagedCount > 0 || !!amend);
        return (
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={onCommit}
              disabled={!canCommit}
              style={{
                flex: 1,
                background: canCommit ? "var(--color-accent)" : "var(--color-btn-disabled-bg)",
                border: "none",
                borderRadius: "10px",
                padding: "10px",
                color: canCommit ? "#000" : "var(--color-btn-disabled-text)",
                fontSize: "13px",
                fontWeight: 700,
                cursor: canCommit ? "pointer" : "not-allowed",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: canCommit ? "0 2px 12px var(--color-accent-dim)" : "none",
              }}
              onMouseEnter={(e) => {
                if (canCommit) {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent-hover)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px var(--color-accent-dim)";
                }
              }}
              onMouseLeave={(e) => {
                if (canCommit) {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 12px var(--color-accent-dim)";
                }
              }}
            >
              {amend ? "Amend" : "Commit"}
              {stagedCount > 0 && ` (${stagedCount})`}
            </button>
            <button
              onClick={onCommitAndPush}
              disabled={!canCommit}
              style={{
                flex: 2,
                background: "transparent",
                border: `1px solid ${canCommit ? "var(--color-accent-border)" : "var(--color-btn-disabled-bg)"}`,
                borderRadius: "10px",
                padding: "10px",
                color: canCommit ? "var(--color-accent)" : "var(--color-btn-disabled-text)",
                fontSize: "13px",
                fontWeight: 700,
                cursor: canCommit ? "pointer" : "not-allowed",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={(e) => {
                if (canCommit) {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent-dim)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-accent)";
                }
              }}
              onMouseLeave={(e) => {
                if (canCommit) {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-accent-border)";
                }
              }}
            >
              {amend ? "Amend + Push" : "Commit + Push"}
            </button>
          </div>
        );
      })()}
    </div>
  );
}
