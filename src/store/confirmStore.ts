import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  description: string;
  /** Red badge label shown above the title (e.g. "Destructive Operation") */
  danger?: boolean;
  /** If set, user must type this phrase before confirming */
  confirmPhrase?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

interface ConfirmStore {
  pending: PendingConfirm | null;
  /** Opens the modal and returns a Promise<boolean>. */
  request: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolve the pending confirm (called by the modal component). */
  respond: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  pending: null,

  request: (options) =>
    new Promise<boolean>((resolve) => {
      set({ pending: { options, resolve } });
    }),

  respond: (ok) => {
    const { pending } = get();
    if (pending) {
      pending.resolve(ok);
      set({ pending: null });
    }
  },
}));
