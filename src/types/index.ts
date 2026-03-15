export type SyncState =
  | "SYNCED"
  | "NEEDS_PUSH"
  | "NEEDS_PULL"
  | "DIVERGED"
  | "CONFLICT"
  | "NOT_INIT"
  | "CHECKING"
  | "ERROR";

export interface RepoConfig {
  name: string;
  path: string;
  remote: string;
  icon: string;
  color: string;
}

export interface RepoStatus {
  path: string;
  state: SyncState;
  staged: number;
  modified: number;
  untracked: number;
  deleted: number;
  ahead: number;
  behind: number;
  current_branch: string;
  last_commit: string;
  last_commit_time: string;
  conflicts: number;
  error: string | null;
}

export interface FileEntry {
  path: string;
  status: string;
  size: number;
  is_staged: boolean;
}

export interface DiffResult {
  content: string;
  additions: number;
  deletions: number;
  file_path: string;
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  author_email: string;
  date: string;
  date_relative: string;
  insertions: number;
  deletions: number;
  files_changed: number;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string;
  date: string;
}

export interface SyncResult {
  path: string;
  success: boolean;
  message: string;
  pushed: boolean;
  pulled: boolean;
}

export interface AppConfig {
  repos: RepoConfig[];
  auto_check_interval_minutes: number;
  max_file_size_mb: number;
  batch_size: number;
  window_width: number;
  window_height: number;
}

export type ToastLevel = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  level: ToastLevel;
  message: string;
  action?: { label: string; onClick: () => void };
}

export type NavTab = "dashboard" | "history" | "activity" | "settings";

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  ahead: number;
  behind: number;
  last_commit: string;
  last_commit_time: string;
}

export interface ConflictFile {
  path: string;
  conflict_type: string;
  ours: string;
  theirs: string;
}

export interface TagInfo {
  name: string;
  target_hash: string;
  message: string | null;
  tagger: string | null;
  date: string | null;
  is_annotated: boolean;
}
