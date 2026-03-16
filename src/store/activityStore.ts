import { create } from "zustand";

export interface ActivityEntry {
  id: string;
  timestamp: string;
  epochMs: number;
  repoName: string;
  operation: string;
  success: boolean;
  message: string;
  isDestructive: boolean;
}

interface ActivityStore {
  entries: ActivityEntry[];
  addEntry: (entry: Omit<ActivityEntry, "id" | "timestamp" | "epochMs">) => void;
  clearEntries: () => void;
}

export const useActivityStore = create<ActivityStore>((set) => ({
  entries: [],
  addEntry: (entry) => {
    const now = Date.now();
    const id = now.toString() + Math.random().toString(36).slice(2);
    const timestamp = new Date(now).toLocaleTimeString();
    set((s) => ({
      entries: [{ ...entry, id, timestamp, epochMs: now }, ...s.entries].slice(0, 500),
    }));
  },
  clearEntries: () => set({ entries: [] }),
}));
