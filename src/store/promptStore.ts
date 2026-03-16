import { create } from "zustand";

export interface PromptOptions {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PendingPrompt {
  options: PromptOptions;
  resolve: (value: string | null) => void;
}

interface PromptStore {
  pending: PendingPrompt | null;
  /** Opens the modal and returns Promise<string | null>. null = cancelled. */
  request: (options: PromptOptions) => Promise<string | null>;
  /** Resolve the pending prompt (called by the modal component). */
  respond: (value: string | null) => void;
}

export const usePromptStore = create<PromptStore>((set, get) => ({
  pending: null,

  request: (options) =>
    new Promise<string | null>((resolve) => {
      set({ pending: { options, resolve } });
    }),

  respond: (value) => {
    const { pending } = get();
    if (pending) {
      pending.resolve(value);
      set({ pending: null });
    }
  },
}));
