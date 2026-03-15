import { invoke } from "@tauri-apps/api/core";
import type {
  RepoStatus,
  FileEntry,
  DiffResult,
  CommitInfo,
  StashEntry,
  SyncResult,
  AppConfig,
  RepoConfig,
  BranchInfo,
  ConflictFile,
  TagInfo,
} from "../types";

export const ipc = {
  getRepoStatus: (path: string) =>
    invoke<RepoStatus>("get_repo_status", { path }),

  fetchRepo: (path: string) =>
    invoke<string>("fetch_repo", { path }),

  pullRepo: (path: string) =>
    invoke<string>("pull_repo", { path }),

  pushRepo: (path: string, message: string) =>
    invoke<string>("push_repo", { path, message }),

  syncAll: () =>
    invoke<SyncResult[]>("sync_all"),

  getStagedFiles: (path: string) =>
    invoke<FileEntry[]>("get_staged_files", { path }),

  getUnstagedFiles: (path: string) =>
    invoke<FileEntry[]>("get_unstaged_files", { path }),

  stageFile: (path: string, file: string) =>
    invoke<void>("stage_file", { path, file }),

  unstageFile: (path: string, file: string) =>
    invoke<void>("unstage_file", { path, file }),

  discardFile: (path: string, file: string) =>
    invoke<void>("discard_file", { path, file }),

  stageAll: (path: string) =>
    invoke<void>("stage_all", { path }),

  unstageAll: (path: string) =>
    invoke<void>("unstage_all", { path }),

  commitChanges: (path: string, message: string, amend: boolean) =>
    invoke<string>("commit_changes", { path, message, amend }),

  getDiff: (path: string, file: string | null, staged: boolean) =>
    invoke<DiffResult>("get_diff", { path, file, staged }),

  getLog: (path: string, limit: number) =>
    invoke<CommitInfo[]>("get_log", { path, limit }),

  getStashes: (path: string) =>
    invoke<StashEntry[]>("get_stashes", { path }),

  saveStash: (
    path: string,
    message: string | null,
    includeUntracked: boolean
  ) => invoke<void>("save_stash", { path, message, includeUntracked }),

  applyStash: (path: string, index: number) =>
    invoke<void>("apply_stash", { path, index }),

  popStash: (path: string, index: number) =>
    invoke<void>("pop_stash", { path, index }),

  dropStash: (path: string, index: number) =>
    invoke<void>("drop_stash", { path, index }),

  cloneRepo: (url: string, dest: string) =>
    invoke<string>("clone_repo", { url, dest }),

  loadConfig: () =>
    invoke<AppConfig>("load_config_cmd"),

  saveConfig: (config: AppConfig) =>
    invoke<void>("save_config_cmd", { config }),

  addRepo: (repo: RepoConfig) =>
    invoke<AppConfig>("add_repo", { repo }),

  removeRepo: (path: string) =>
    invoke<AppConfig>("remove_repo", { path }),

  updateRepo: (repo: RepoConfig) =>
    invoke<AppConfig>("update_repo", { repo }),

  // Branch management
  listBranches: (path: string) => invoke<BranchInfo[]>("list_branches", { path }),
  createBranch: (path: string, name: string, from?: string) => invoke<void>("create_branch", { path, name, from: from ?? null }),
  switchBranch: (path: string, name: string) => invoke<void>("switch_branch", { path, name }),
  deleteBranch: (path: string, name: string, force: boolean) => invoke<void>("delete_branch", { path, name, force }),

  // Conflict resolution
  getConflictedFiles: (path: string) => invoke<ConflictFile[]>("get_conflicted_files", { path }),
  resolveUsingOurs: (path: string, file: string) => invoke<void>("resolve_using_ours", { path, file }),
  resolveUsingTheirs: (path: string, file: string) => invoke<void>("resolve_using_theirs", { path, file }),
  abortMerge: (path: string) => invoke<void>("abort_merge", { path }),
  getCommitDiff: (path: string, hash: string) => invoke<DiffResult>("get_commit_diff", { path, hash }),
  deleteUntrackedFile: (path: string, file: string) => invoke<void>("delete_untracked_file", { path, file }),

  // Tags
  listTags: (path: string) => invoke<TagInfo[]>("list_tags", { path }),
  createTag: (path: string, name: string, message: string | null, target: string | null) => invoke<void>("create_tag", { path, name, message, target }),
  deleteTag: (path: string, name: string) => invoke<void>("delete_tag", { path, name }),

  // Reset / Revert / Cherry-pick
  resetRepo: (path: string, target: string, mode: string) => invoke<void>("reset_repo", { path, target, mode }),
  revertCommit: (path: string, hash: string) => invoke<string>("revert_commit", { path, hash }),
  cherryPickCommit: (path: string, hash: string) => invoke<string>("cherry_pick_commit", { path, hash }),
  getRemoteUrl: (path: string) => invoke<string>("get_remote_url", { path }),

  // System
  openInExplorer: (path: string) => invoke<void>("open_in_explorer", { path }),
  openInVscode: (path: string) => invoke<void>("open_in_vscode", { path }),
  openInTerminal: (path: string) => invoke<void>("open_in_terminal", { path }),

  // Extended commands
  syncRepoWithProgress: (path: string, message: string) =>
    invoke<SyncResult>("sync_repo_with_progress", { path, message }),
  getAutoCheckInterval: () => invoke<number>("get_auto_check_interval"),
  quitApp: () => invoke<void>("quit_app"),
  showWindow: () => invoke<void>("show_window"),
  hideWindow: () => invoke<void>("hide_window"),

  // Gitignore
  readGitignore: (repoPath: string) => invoke<string>("read_gitignore", { repoPath }),
  writeGitignore: (repoPath: string, content: string) => invoke<void>("write_gitignore", { repoPath, content }),

  // Scan
  scanForRepos: (dir: string) => invoke<string[]>("scan_for_repos", { dir }),

  // Init
  initRepo: (path: string) => invoke<string>("init_repo", { path }),

  // File at commit
  getFileAtCommit: (repoPath: string, filePath: string, hash: string) => invoke<string>("get_file_at_commit", { repoPath, filePath, hash }),

  // Bulk status
  getAllRepoStatuses: () => invoke<RepoStatus[]>("get_all_repo_statuses"),
};
