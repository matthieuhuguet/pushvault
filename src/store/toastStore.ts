import { create } from "zustand";
import type { Toast, ToastLevel } from "../types";

interface ToastStore {
  toasts: Toast[];
  add: (level: ToastLevel, message: string, action?: Toast["action"]) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  add: (level, message, action) => {
    const id =
      Date.now().toString() + Math.random().toString(36).slice(2);
    const toast: Toast = { id, level, message, action };
    set((s) => ({ toasts: [...s.toasts.slice(-4), toast] }));
    const timeout = level === "error" ? 8000 : 4000;
    setTimeout(
      () =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      timeout
    );
  },

  remove: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
