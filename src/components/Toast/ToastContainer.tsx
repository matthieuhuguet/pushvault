import React, { useEffect, useRef, useState } from "react";
import { useToastStore } from "../../store/toastStore";
import type { Toast, ToastLevel } from "../../types";

/* ── Colour map ─────────────────────────────────────────────── */
const LEVEL_COLORS: Record<ToastLevel, { border: string; icon: string; bar: string }> = {
  success: { border: "#1db954", icon: "#1db954", bar: "#1db954" },
  error:   { border: "#e5534b", icon: "#e5534b", bar: "#e5534b" },
  warning: { border: "#f59b00", icon: "#f59b00", bar: "#f59b00" },
  info:    { border: "#3d9be9", icon: "#3d9be9", bar: "#3d9be9" },
};

/* ── Level icons (inline SVG) ───────────────────────────────── */
function ToastIcon({ level }: { level: ToastLevel }) {
  const color = LEVEL_COLORS[level].icon;
  if (level === "success") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (level === "error") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
  if (level === "warning") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L14 13H2L8 2Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v4M8 11.5v.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path d="M8 7v5M8 5v.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Individual toast item ──────────────────────────────────── */
function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove);
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalMs = toast.level === "error" ? 8000 : 4000;
  const stepMs = 50;

  useEffect(() => {
    // Trigger entrance animation
    const enterFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });

    let elapsed = 0;
    intervalRef.current = setInterval(() => {
      elapsed += stepMs;
      setProgress(Math.max(0, 100 - (elapsed / totalMs) * 100));
    }, stepMs);

    return () => {
      cancelAnimationFrame(enterFrame);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [totalMs]);

  const colors = LEVEL_COLORS[toast.level];

  return (
    <div
      style={{
        position: "relative",
        background: "#282828",
        border: `1px solid ${colors.border}33`,
        borderLeft: `3px solid ${colors.border}`,
        borderRadius: "10px",
        padding: "12px 14px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        minWidth: "280px",
        maxWidth: "380px",
        overflow: "hidden",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(24px)",
        transition: "opacity 220ms ease, transform 220ms ease",
        cursor: "pointer",
      }}
      onClick={() => remove(toast.id)}
    >
      {/* Body */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div style={{ flexShrink: 0, marginTop: "1px" }}>
          <ToastIcon level={toast.level} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: "13px",
              color: "#fff",
              lineHeight: 1.45,
              wordBreak: "break-word",
            }}
          >
            {toast.message}
          </p>
          {toast.action && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toast.action!.onClick();
                remove(toast.id);
              }}
              style={{
                marginTop: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: colors.bar,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            remove(toast.id);
          }}
          style={{
            flexShrink: 0,
            width: "20px",
            height: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            cursor: "pointer",
            color: "#b3b3b3",
            fontSize: "11px",
            lineHeight: 1,
            transition: "background 120ms ease, color 120ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.18)";
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.08)";
            (e.currentTarget as HTMLButtonElement).style.color = "#b3b3b3";
          }}
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: "2px",
          width: `${progress}%`,
          background: colors.bar,
          transition: `width ${stepMs}ms linear`,
          borderRadius: "0 0 0 10px",
        }}
      />
    </div>
  );
}

/* ── Container ──────────────────────────────────────────────── */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "80px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
}
