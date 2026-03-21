import { create } from "zustand";

/**
 * Repo Groups — organize repos into named groups/folders.
 * Persisted in localStorage (no Rust backend changes needed).
 */

export interface RepoGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
}

interface GroupStore {
  groups: RepoGroup[];
  /** Maps repo path → group ID. Repos without a mapping are "Ungrouped". */
  assignments: Record<string, string>;

  addGroup: (name: string, color?: string) => void;
  removeGroup: (id: string) => void;
  renameGroup: (id: string, name: string) => void;
  setGroupColor: (id: string, color: string) => void;
  toggleCollapsed: (id: string) => void;
  assignRepo: (repoPath: string, groupId: string | null) => void;
  reorderGroups: (fromIdx: number, toIdx: number) => void;
}

const STORAGE_KEY = "pushvault-repo-groups";
const ASSIGN_KEY = "pushvault-repo-assignments";

function loadGroups(): RepoGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadAssignments(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ASSIGN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGroups(groups: RepoGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

function saveAssignments(assignments: Record<string, string>) {
  localStorage.setItem(ASSIGN_KEY, JSON.stringify(assignments));
}

let nextId = Date.now();
function genId(): string {
  return `grp_${nextId++}`;
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: loadGroups(),
  assignments: loadAssignments(),

  addGroup: (name, color = "var(--color-accent)") => {
    const group: RepoGroup = { id: genId(), name, color, collapsed: false };
    const groups = [...get().groups, group];
    set({ groups });
    saveGroups(groups);
  },

  removeGroup: (id) => {
    const groups = get().groups.filter((g) => g.id !== id);
    const assignments = { ...get().assignments };
    // Unassign all repos in this group
    for (const [path, gid] of Object.entries(assignments)) {
      if (gid === id) delete assignments[path];
    }
    set({ groups, assignments });
    saveGroups(groups);
    saveAssignments(assignments);
  },

  renameGroup: (id, name) => {
    const groups = get().groups.map((g) => (g.id === id ? { ...g, name } : g));
    set({ groups });
    saveGroups(groups);
  },

  setGroupColor: (id, color) => {
    const groups = get().groups.map((g) => (g.id === id ? { ...g, color } : g));
    set({ groups });
    saveGroups(groups);
  },

  toggleCollapsed: (id) => {
    const groups = get().groups.map((g) =>
      g.id === id ? { ...g, collapsed: !g.collapsed } : g
    );
    set({ groups });
    saveGroups(groups);
  },

  assignRepo: (repoPath, groupId) => {
    const assignments = { ...get().assignments };
    if (groupId) {
      assignments[repoPath] = groupId;
    } else {
      delete assignments[repoPath];
    }
    set({ assignments });
    saveAssignments(assignments);
  },

  reorderGroups: (fromIdx, toIdx) => {
    const groups = [...get().groups];
    const [moved] = groups.splice(fromIdx, 1);
    groups.splice(toIdx, 0, moved);
    set({ groups });
    saveGroups(groups);
  },
}));
