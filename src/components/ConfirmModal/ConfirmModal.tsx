import React, { useEffect, useRef, useState } from "react";
import { useConfirmStore } from "../../store/confirmStore";

export function ConfirmModal() {
  const { pending, respond } = useConfirmStore();
  const [phrase, setPhrase] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Reset phrase and focus cancel when a new confirm opens
  useEffect(() => {
    if (pending) {
      setPhrase("");
      // Focus cancel (safe default) unless phrase is required, then focus input
      setTimeout(() => {
        if (pending.options.confirmPhrase) {
          inputRef.current?.focus();
        } else {
          cancelRef.current?.focus();
        }
      }, 50);
    }
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") respond(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pending, respond]);

  if (!pending) return null;

  const { options } = pending;
  const phraseMatch = !options.confirmPhrase || phrase === options.confirmPhrase;
  const isDanger = options.danger ?? false;

  return (
    <div
      className="panel-backdrop-enter"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(12px) saturate(1.2)",
        WebkitBackdropFilter: "blur(12px) saturate(1.2)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) respond(false); }}
    >
      <div
        className="scale-in"
        style={{
          width: "420px",
          background: "var(--color-bg-elevated)",
          border: `1px solid ${isDanger ? "var(--color-error-border)" : "var(--color-border)"}`,
          borderRadius: "16px",
          padding: "28px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px var(--overlay-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Icon + title */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          {isDanger && (
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "var(--color-error-dim)",
              border: "1px solid var(--color-error-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: "20px",
            }}>
              ⚠
            </div>
          )}
          <div>
            {isDanger && (
              <span style={{
                display: "inline-block",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--color-error)",
                background: "var(--color-error-dim)",
                padding: "2px 8px",
                borderRadius: "6px",
                marginBottom: "6px",
              }}>
                DESTRUCTIVE OPERATION
              </span>
            )}
            <h3 style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              lineHeight: 1.3,
            }}>
              {options.title}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p style={{
          margin: 0,
          fontSize: "13px",
          color: "var(--color-text-secondary)",
          lineHeight: 1.6,
        }}>
          {options.description}
        </p>

        {/* Phrase confirmation */}
        {options.confirmPhrase && (
          <div>
            <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--color-text-muted)" }}>
              Type <code style={{
                color: "var(--color-error)",
                background: "var(--color-error-dim)",
                padding: "1px 6px",
                borderRadius: "4px",
                fontFamily: "monospace",
              }}>{options.confirmPhrase}</code> to confirm:
            </p>
            <input
              ref={inputRef}
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && phraseMatch) respond(true); }}
              placeholder={options.confirmPhrase}
              style={{
                width: "100%",
                padding: "9px 12px",
                background: "var(--overlay-soft)",
                border: `1px solid ${phrase === options.confirmPhrase ? "var(--color-error-border)" : "var(--overlay-light)"}`,
                borderRadius: "8px",
                color: "var(--color-text-primary)",
                fontSize: "13px",
                fontFamily: "monospace",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 150ms ease",
              }}
            />
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            ref={cancelRef}
            onClick={() => respond(false)}
            style={{
              padding: "9px 20px",
              background: "var(--overlay-subtle)",
              border: "1px solid var(--color-border)",
              borderRadius: "10px",
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 120ms ease",
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
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button
            disabled={!phraseMatch}
            onClick={() => phraseMatch && respond(true)}
            style={{
              padding: "9px 20px",
              background: isDanger
                ? (phraseMatch ? "var(--color-error)" : "var(--color-error-border)")
                : (phraseMatch ? "var(--color-accent)" : "var(--color-success-border)"),
              border: "none",
              borderRadius: "10px",
              color: "var(--color-text-primary)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: phraseMatch ? "pointer" : "not-allowed",
              transition: "all 150ms ease",
            }}
            onMouseEnter={(e) => {
              if (!phraseMatch) return;
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.filter = "none";
            }}
          >
            {options.confirmLabel ?? (isDanger ? "Confirm" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}
