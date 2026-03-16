import { create } from "zustand";
import type { AppConfig, RepoConfig, RepoStatus } from "../types";
import { ipc } from "../lib/ipc";

interface RepoStore {
  config: AppConfig | null;
  statuses: Record<string, RepoStatus>;
  loading: boolean;

  loadConfig: () => Promise<void>;
  refreshStatus: (path: string) => Promise<void>;
  refreshAllStatuses: () => Promise<void>;
  addRepo: (repo: RepoConfig) => Promise<void>;
  removeRepo: (path: string) => Promise<void>;
  updateRepo: (repo: RepoConfig) => Promise<void>;
  reorderRepos: (fromIdx: number, toIdx: number) => Promise<void>;
}

const defaultConfig: AppConfig = {
  repos: [],
  auto_check_interval_minutes: 5,
  max_file_size_mb: 49,
  batch_size: 50,
  window_width: 1200,
  window_height: 750,
  gpg_sign_commits: false,
  gpg_key_id: "",
  github_token: "",
};

export const useRepoStore = create<RepoStore>((set, get) => ({
  config: null,
  statuses: {},
  loading: false,

  loadConfig: async () => {
    set({ loading: true });
    try {
      const config = await ipc.loadConfig();
      set({ config, loading: false });
    } catch {
      set({ config: defaultConfig, loading: false });
    }
  },

  refreshStatus: async (path: string) => {
    try {
      const status = await ipc.getRepoStatus(path);
      set((s) => ({ statuses: { ...s.statuses, [path]: status } }));
    } catch (e) {
      const errStatus: RepoStatus = {
        path,
        state: "ERROR",
        staged: 0,
        modified: 0,
        untracked: 0,
        deleted: 0,
        ahead: 0,
        behind: 0,
        current_branch: "?",
        last_commit: "",
        last_commit_time: "",
        conflicts: 0,
        error: String(e),
      };
      set((s) => ({ statuses: { ...s.statuses, [path]: errStatus } }));
    }
  },

  refreshAllStatuses: async () => {
    const { config } = get();
    if (!config || config.repos.length === 0) return;
    try {
      const allStatuses = await ipc.getAllRepoStatuses();
      const newStatuses: Record<string, RepoStatus> = {};
      for (const status of allStatuses) {
        newStatuses[status.path] = status;
      }
      set({ statuses: newStatuses });
    } catch {
      // Fallback to individual calls
      await Promise.all(config.repos.map((r) => get().refreshStatus(r.path)));
    }
  },

  addRepo: async (repo: RepoConfig) => {
    const config = await ipc.addRepo(repo);
    set({ config });
    get().refreshStatus(repo.path);
  },

  removeRepo: async (path: string) => {
    const config = await ipc.removeRepo(path);
    set({ config });
  },

  updateRepo: async (repo: RepoConfig) => {
    const config = await ipc.updateRepo(repo);
    set({ config });
  },

  reorderRepos: async (fromIdx: number, toIdx: number) => {
    const { config } = get();
    if (!config || fromIdx === toIdx) return;
    const repos = [...config.repos];
    const [moved] = repos.splice(fromIdx, 1);
    repos.splice(toIdx, 0, moved);
    const newConfig = { ...config, repos };
    set({ config: newConfig });
    await ipc.saveConfig(newConfig);
  },
}));
