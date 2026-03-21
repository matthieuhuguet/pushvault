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
  BlameLine,
  ReflogEntry,
  SearchResult,
} from "../types";

export const ipc = {
  getRepoStatus: (path: string) =>
    invoke<RepoStatus>("get_repo_status", { path }),

  fetchRepo: (path: string) =>
    invoke<string>("fetch_repo", { path }),

  pullRepo: (path: string) =>
    invoke<string>("pull_repo", { path }),

  pushRepo: (path: string) =>
    invoke<string>("push_repo", { path }),

  forcePush: (path: string) =>
    invoke<string>("force_push", { path }),

  forcePushWithLease: (path: string) =>
    invoke<string>("force_push_with_lease", { path }),

  pullWithRebase: (path: string) =>
    invoke<string>("pull_with_rebase", { path }),

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

  commitChanges: (path: string, message: string, amend: boolean, gpgSign = false, gpgKeyId = "") =>
    invoke<string>("commit_changes", { path, message, amend, gpgSign, gpgKeyId }),

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
  renameBranch: (path: string, oldName: string, newName: string) => invoke<void>("rename_branch", { path, oldName, newName }),
  mergeBranch: (path: string, branchName: string) => invoke<string>("merge_branch", { path, branchName }),
  pushBranch: (path: string, branchName: string) => invoke<string>("push_branch", { path, branchName }),

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
  pushTags: (path: string, remote?: string) => invoke<string>("push_tags", { path, remote: remote ?? "" }),

  // Reset / Revert / Cherry-pick
  resetRepo: (path: string, target: string, mode: string) => invoke<void>("reset_repo", { path, target, mode }),
  revertCommit: (path: string, hash: string) => invoke<string>("revert_commit", { path, hash }),
  cherryPickCommit: (path: string, hash: string) => invoke<string>("cherry_pick_commit", { path, hash }),
  getRemoteUrl: (path: string) => invoke<string>("get_remote_url", { path }),

  // System
  openInExplorer: (path: string) => invoke<void>("open_in_explorer", { path }),
  revealInExplorer: (path: string) => invoke<void>("reveal_in_explorer", { path }),
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

  // CI / GitHub
  getGithubCiStatus: (repoUrl: string, token: string | null) =>
    invoke<string>("get_github_ci_status", { repoUrl, token }),
  getGithubWorkflowRuns: (repoUrl: string, token: string | null, limit = 10) =>
    invoke<Array<{ id: number; name: string; status: string; branch: string; commit_sha: string; url: string; created_at: string }>>(
      "get_github_workflow_runs", { repoUrl, token, limit }
    ),
  getGithubPrs: (repoUrl: string, token: string | null, state = "open") =>
    invoke<Array<{ number: number; title: string; state: string; author: string; base_branch: string; head_branch: string; url: string; created_at: string; draft: boolean }>>(
      "get_github_prs", { repoUrl, token, state }
    ),
  getGithubIssues: (repoUrl: string, token: string | null, state = "open") =>
    invoke<Array<{ number: number; title: string; state: string; author: string; url: string; created_at: string; labels: string[]; comments: number; is_pr: boolean }>>(
      "get_github_issues", { repoUrl, token, state }
    ),

  // GitHub Releases
  listGithubReleases: (repoUrl: string, token: string | null) =>
    invoke<Array<{ id: number; tag_name: string; name: string; html_url: string; published_at: string; draft: boolean; prerelease: boolean }>>(
      "list_github_releases", { repoUrl, token }
    ),
  createGithubRelease: (
    repoUrl: string,
    token: string,
    tagName: string,
    name: string,
    body: string,
    draft: boolean,
    prerelease: boolean,
  ) =>
    invoke<{ id: number; tag_name: string; name: string; html_url: string; published_at: string; draft: boolean; prerelease: boolean }>(
      "create_github_release", { repoUrl, token, tagName, name, body, draft, prerelease }
    ),

  // Window state
  saveWindowState: () => invoke<void>("save_window_state"),

  // Startup launch
  getLaunchAtStartup: () => invoke<boolean>("get_launch_at_startup"),
  setLaunchAtStartup: (enable: boolean) => invoke<void>("set_launch_at_startup", { enable }),

  // Stash diff
  getStashDiff: (path: string, index: number) => invoke<DiffResult>("get_stash_diff", { path, index }),

  // Worktrees
  listWorktrees: (path: string) =>
    invoke<Array<{ path: string; head: string; branch: string; is_main: boolean; is_locked: boolean; is_prunable: boolean }>>("list_worktrees", { path }),
  addWorktree: (path: string, worktreePath: string, branch: string, newBranch: boolean) =>
    invoke<string>("add_worktree", { path, worktreePath, branch, newBranch }),
  removeWorktree: (path: string, worktreePath: string, force: boolean) =>
    invoke<string>("remove_worktree", { path, worktreePath, force }),

  // Submodules
  listSubmodules: (path: string) =>
    invoke<Array<{ path: string; url: string; head: string; status: string; describe: string }>>("list_submodules", { path }),
  updateSubmodules: (path: string) =>
    invoke<string>("update_submodules", { path }),
  addSubmodule: (path: string, url: string, subPath: string) =>
    invoke<string>("add_submodule", { path, url, subPath }),
  removeSubmodule: (path: string, subPath: string) =>
    invoke<string>("remove_submodule", { path, subPath }),

  // Interactive Rebase
  getRebaseCommits: (path: string, baseCommit: string) =>
    invoke<Array<[string, string, string]>>("get_rebase_commits", { path, baseCommit }),
  startInteractiveRebase: (path: string, baseCommit: string, todoContent: string) =>
    invoke<string>("start_interactive_rebase", { path, baseCommit, todoContent }),
  rebaseContinue: (path: string) => invoke<string>("rebase_continue", { path }),
  rebaseAbort: (path: string) => invoke<string>("rebase_abort", { path }),
  rebaseInProgress: (path: string) => invoke<boolean>("rebase_in_progress", { path }),

  // Git Bisect
  bisectStatus: (path: string) =>
    invoke<{ active: boolean; current_hash: string; current_message: string; log: string; steps_done: number; steps_remaining: number }>("bisect_status", { path }),
  bisectStart: (path: string, badCommit: string, goodCommit: string) =>
    invoke<string>("bisect_start", { path, badCommit, goodCommit }),
  bisectGood: (path: string) => invoke<string>("bisect_good", { path }),
  bisectBad: (path: string) => invoke<string>("bisect_bad", { path }),
  bisectSkip: (path: string) => invoke<string>("bisect_skip", { path }),
  bisectReset: (path: string) => invoke<string>("bisect_reset", { path }),

  // Git LFS
  detectLfs: (path: string) => invoke<boolean>("detect_lfs", { path }),
  listLfsTracks: (path: string) => invoke<string[]>("list_lfs_tracks", { path }),
  lfsTrack: (path: string, pattern: string) => invoke<string>("lfs_track", { path, pattern }),
  lfsUntrack: (path: string, pattern: string) => invoke<string>("lfs_untrack", { path, pattern }),

  // Hunk-level staging
  stageHunk: (path: string, patch: string) => invoke<void>("stage_hunk", { path, patch }),
  discardHunk: (path: string, patch: string) => invoke<void>("discard_hunk", { path, patch }),

  // Filesystem watchers
  setupFileWatchers: (paths: string[]) => invoke<void>("setup_file_watchers", { paths }),

  // Git maintenance
  gitGc: (path: string) => invoke<string>("git_gc", { path }),
  remotePrune: (path: string, remote: string) => invoke<string[]>("remote_prune", { path, remote }),
  fetchPrune: (path: string) => invoke<string>("fetch_prune", { path }),
  getHeadInfo: (path: string) => invoke<{ is_detached: boolean; hash: string; message: string }>("get_head_info", { path }),
  branchFromHead: (path: string, branchName: string) => invoke<void>("branch_from_head", { path, branchName }),
  amendCommitMessage: (path: string, message: string) => invoke<string>("amend_commit_message", { path, message }),
  getLastCommitMessage: (path: string) => invoke<string>("get_last_commit_message", { path }),

  // OS Credential Manager (Windows Credential Store / macOS Keychain)
  getStoredToken: () => invoke<string>("get_stored_token"),
  storeToken: (token: string) => invoke<void>("store_token", { token }),
  deleteStoredToken: () => invoke<void>("delete_stored_token"),

  // Portable mode
  getPortableMode: () => invoke<boolean>("get_portable_mode"),

  // Binary file reading (image preview)
  readFileBase64: (repoPath: string, filePath: string) =>
    invoke<string>("read_file_base64", { repoPath, filePath }),
  getFileBase64AtRef: (repoPath: string, filePath: string, gitRef: string) =>
    invoke<string>("get_file_base64_at_ref", { repoPath, filePath, gitRef }),

  // Blame
  gitBlame: (path: string, filePath: string) =>
    invoke<BlameLine[]>("git_blame", { path, filePath }),

  // Reflog
  gitReflog: (path: string, limit = 100) =>
    invoke<ReflogEntry[]>("git_reflog", { path, limit }),

  // Global search
  searchRepos: (repoPaths: string[], repoNames: string[], query: string, searchContent: boolean, maxResults = 100) =>
    invoke<SearchResult[]>("search_repos", { repoPaths, repoNames, query, searchContent, maxResults }),

  // MCP integration
  generateMcpConfig: () => invoke<string>("generate_mcp_config"),
  installMcpConfig: () => invoke<string>("install_mcp_config"),
  aiGenerateCommitMessage: (path: string) => invoke<string>("ai_generate_commit_message", { path }),
};
