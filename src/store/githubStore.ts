import { create } from "zustand";
import { ipc } from "../lib/ipc";

export interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  public_repos: number;
  private_repos: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  ssh_url: string;
  private: boolean;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  updated_at: string;
}

interface GitHubStore {
  token: string | null;
  user: GitHubUser | null;
  repos: GitHubRepo[];
  loading: boolean;
  error: string | null;
  ciStatuses: Record<string, "success" | "failure" | "in_progress" | "unknown">;

  setToken: (token: string) => void;
  clearToken: () => void;
  fetchUser: () => Promise<void>;
  fetchRepos: () => Promise<void>;
  fetchCiStatus: (repoUrl: string) => Promise<void>;
}

async function githubFetch<T>(endpoint: string, token: string): Promise<T> {
  const resp = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export const useGitHubStore = create<GitHubStore>((set, get) => ({
  token: localStorage.getItem("github_token"),
  user: null,
  repos: [],
  loading: false,
  error: null,
  ciStatuses: {},

  setToken: (token) => {
    localStorage.setItem("github_token", token);
    set({ token, error: null });
  },

  clearToken: () => {
    localStorage.removeItem("github_token");
    set({ token: null, user: null, repos: [] });
  },

  fetchUser: async () => {
    const { token } = get();
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const user = await githubFetch<GitHubUser>("/user", token);
      set({ user, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false, user: null });
    }
  },

  fetchRepos: async () => {
    const { token } = get();
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const repos = await githubFetch<GitHubRepo[]>(
        "/user/repos?per_page=100&sort=updated&type=all",
        token
      );
      set({ repos, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchCiStatus: async (repoUrl: string) => {
    const { token } = get();
    try {
      const result = await ipc.getGithubCiStatus(repoUrl, token);
      const status = result as "success" | "failure" | "in_progress" | "unknown";
      set((state) => ({
        ciStatuses: { ...state.ciStatuses, [repoUrl]: status },
      }));
    } catch {
      set((state) => ({
        ciStatuses: { ...state.ciStatuses, [repoUrl]: "unknown" },
      }));
    }
  },
}));
