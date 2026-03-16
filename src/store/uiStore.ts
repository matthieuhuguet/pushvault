import { create } from "zustand";
import type { NavTab } from "../types";

interface UIStore {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  selectedRepoPath: string | null;
  setSelectedRepoPath: (path: string | null) => void;
  activePanel: "staging" | "history" | "stash" | "branches" | "conflicts" | "tags" | "gitignore" | "scan" | "worktrees" | "submodules" | "lfs" | "bisect" | "rebase" | null;
  setActivePanel: (panel: "staging" | "history" | "stash" | "branches" | "conflicts" | "tags" | "gitignore" | "scan" | "worktrees" | "submodules" | "lfs" | "bisect" | "rebase" | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: string;
  setActiveFilter: (f: string) => void;
  isSyncing: boolean;
  setIsSyncing: (v: boolean) => void;
  syncProgress: string;
  setSyncProgress: (msg: string) => void;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeTab: "dashboard",
  setActiveTab: (activeTab) => set({ activeTab }),

  selectedRepoPath: null,
  setSelectedRepoPath: (selectedRepoPath) => set({ selectedRepoPath }),

  activePanel: null,
  setActivePanel: (activePanel) => set({ activePanel }),

  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  activeFilter: "all",
  setActiveFilter: (activeFilter) => set({ activeFilter }),

  isSyncing: false,
  setIsSyncing: (isSyncing) => set({ isSyncing }),

  syncProgress: "",
  setSyncProgress: (syncProgress) => set({ syncProgress }),

  theme: "dark",
  setTheme: (theme) => set({ theme }),
}));
