import React, { useEffect, useRef, useState } from "react";
import { usePromptStore } from "../../store/promptStore";

export function PromptModal() {
  const { pending, respond } = usePromptStore();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pending) {
      setValue(pending.options.defaultValue ?? "");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") respond(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pending, respond]);

  if (!pending) return null;

  const { options } = pending;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fade-in 120ms ease both",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) respond(null); }}
    >
      <div
        style={{
          width: "420px",
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          borderRadius: "14px",
          padding: "28px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <h3 style={{
          margin: 0,
          fontSize: "16px",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          lineHeight: 1.3,
        }}>
          {options.title}
        </h3>

        {options.description && (
          <p style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--color-text-secondary)",
            lineHeight: 1.5,
          }}>
            {options.description}
          </p>
        )}

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) respond(value.trim());
          }}
          placeholder={options.placeholder ?? ""}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            color: "var(--color-text-primary)",
            fontSize: "13px",
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 150ms ease",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
        />

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={() => respond(null)}
            style={{
              padding: "9px 20px",
              background: "var(--color-bg-highlight)",
              border: "1px solid var(--color-border)",
              borderRadius: "20px",
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button
            disabled={!value.trim()}
            onClick={() => value.trim() && respond(value.trim())}
            style={{
              padding: "9px 20px",
              background: value.trim() ? "var(--color-accent)" : "var(--color-accent-dim)",
              border: "none",
              borderRadius: "20px",
              color: value.trim() ? "#000" : "var(--color-text-disabled)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: value.trim() ? "pointer" : "not-allowed",
              transition: "all 150ms ease",
            }}
          >
            {options.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
