import { create } from "zustand";

export interface ActivityEntry {
  id: string;
  timestamp: string;
  repoName: string;
  operation: string;
  success: boolean;
  message: string;
}

interface ActivityStore {
  entries: ActivityEntry[];
  addEntry: (entry: Omit<ActivityEntry, "id" | "timestamp">) => void;
  clearEntries: () => void;
}

export const useActivityStore = create<ActivityStore>((set) => ({
  entries: [],
  addEntry: (entry) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    const timestamp = new Date().toLocaleTimeString();
    set((s) => ({
      entries: [{ ...entry, id, timestamp }, ...s.entries].slice(0, 200),
    }));
  },
  clearEntries: () => set({ entries: [] }),
}));
