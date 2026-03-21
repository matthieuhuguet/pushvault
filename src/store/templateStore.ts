import { create } from "zustand";

export interface CommitTemplate {
  id: string;
  name: string;
  template: string;
}

const STORAGE_KEY = "pushvault-commit-templates";

const DEFAULT_TEMPLATES: CommitTemplate[] = [
  { id: "feat", name: "Feature", template: "feat: " },
  { id: "fix", name: "Bug Fix", template: "fix: " },
  { id: "refactor", name: "Refactor", template: "refactor: " },
  { id: "docs", name: "Documentation", template: "docs: " },
  { id: "chore", name: "Chore", template: "chore: " },
  { id: "wip", name: "WIP", template: "wip: " },
  { id: "release", name: "Release", template: "release: v" },
];

interface TemplateStore {
  templates: CommitTemplate[];
  addTemplate: (name: string, template: string) => void;
  removeTemplate: (id: string) => void;
  updateTemplate: (id: string, name: string, template: string) => void;
}

function load(): CommitTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

function save(templates: CommitTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

let nextId = Date.now();

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  templates: load(),

  addTemplate: (name, template) => {
    const t: CommitTemplate = { id: `tpl_${nextId++}`, name, template };
    const templates = [...get().templates, t];
    set({ templates });
    save(templates);
  },

  removeTemplate: (id) => {
    const templates = get().templates.filter((t) => t.id !== id);
    set({ templates });
    save(templates);
  },

  updateTemplate: (id, name, template) => {
    const templates = get().templates.map((t) =>
      t.id === id ? { ...t, name, template } : t
    );
    set({ templates });
    save(templates);
  },
}));
