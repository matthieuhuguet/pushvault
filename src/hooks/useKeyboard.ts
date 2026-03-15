import { useEffect } from "react";

type Handler = () => void;

export function useKeyboard(bindings: Record<string, Handler>) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const key = [
        e.ctrlKey ? "ctrl" : "",
        e.shiftKey ? "shift" : "",
        e.altKey ? "alt" : "",
        e.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join("+");
      bindings[key]?.();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [bindings]);
}
