import { create } from "zustand";
import { absolutizeAssets } from "@/lib/ingestAsset";
import { syncDerived } from "@/model/normalize";
import type { StarterId } from "@/model/starters";
import type { AppIndex, AppIndexEntry, PlaySetupSnapshot, Project } from "@/model/types";
import { invalidateCardCache } from "@/render/cardCache";
import {
  cacheProject,
  createProject,
  deleteProjectData,
  importProjectFile,
  loadCachedProject,
  loadIndex,
  mergeExampleEntries,
  openFromDirectory,
  openProjectById,
  pickDirectory,
  rememberSubscribed,
  relinkProjectFolder,
  removeFromIndex,
  saveProject,
  seedExampleProjects,
  updateIndexEntry,
} from "@/persist/storage";
import { ensureOfficialMarket } from "@/features/market/marketSeed";
import { usePlayProfileStore } from "./playProfileStore";
import { useOnboardingStore } from "./onboardingStore";
import { useEditorStore } from "./editorStore";

function withDisplayAssets(project: Project, path: string | null | undefined): Project {
  return { ...project, assets: absolutizeAssets(project.assets ?? {}, path) };
}

function resetEditorSession() {
  useEditorStore.getState().resetSession();
}

const HISTORY_LIMIT = 80;
const MERGE_MS = 320;

type PatchOpts = { mergeKey?: string };

type AppState = {
  ready: boolean;
  index: AppIndex;
  current: Project | null;
  currentPath: string | null;
  error: string | null;
  info: string | null;
  dirty: boolean;
  saving: boolean;
  past: Project[];
  future: Project[];
  mergeKey: string | null;
  mergeAt: number;
  boot: () => Promise<void>;
  setError: (msg: string | null) => void;
  setInfo: (msg: string | null) => void;
  create: (input: {
    name: string;
    note?: string;
    size: { w: number; h: number };
    coverAsset?: string;
    starter?: StarterId;
    handle?: FileSystemDirectoryHandle;
    makeSubfolder: boolean;
    parentPath?: string;
    pathLabel?: string;
    fromProject?: Project;
    sourcePath?: string;
  }) => Promise<void>;
  open: (id: string) => Promise<void>;
  openFile: (text: string, pathLabel?: string) => Promise<void>;
  openFolder: () => Promise<boolean>;
  relinkFolder: () => Promise<void>;
  relinkById: (id: string) => Promise<void>;
  close: () => void;
  adoptPlayProject: (project: Project) => void;
  updateMeta: (
    id: string,
    patch: Partial<Pick<AppIndexEntry, "name" | "note" | "coverAsset" | "localPath">>,
  ) => Promise<void>;
  forget: (id: string) => Promise<void>;
  patchProject: (recipe: (project: Project) => Project, opts?: PatchOpts) => void;
  setPlaySetup: (setup: PlaySetupSnapshot) => void;
  undo: () => void;
  redo: () => void;
  persist: () => Promise<void>;
  currentOrigin: "owned" | "subscribed" | "example";
  uploadMarket: (projectId: string, desc: string) => Promise<void>;
  updateMarket: (marketId: string, projectId: string, desc: string) => Promise<void>;
  unlistMarket: (marketId: string) => Promise<void>;
  subscribeMarket: (marketId: string) => Promise<void>;
  unsubscribeMarket: (marketId: string) => Promise<void>;
};

function resetHistory() {
  return { past: [] as Project[], future: [] as Project[], mergeKey: null, mergeAt: 0 };
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  index: { projects: [] },
  current: null,
  currentPath: null,
  error: null,
  info: null,
  dirty: false,
  saving: false,
  past: [],
  future: [],
  mergeKey: null,
  mergeAt: 0,
  currentOrigin: "owned",

  boot: async () => {
    let index: AppIndex = { projects: [] };
    try {
      index = await Promise.race([
        loadIndex(),
        new Promise<AppIndex>((resolve) => {
          window.setTimeout(() => resolve({ projects: [] }), 1500);
        }),
      ]);
    } catch {
      /* guest browsers may block IndexedDB */
    }
    set({ index: mergeExampleEntries(index), ready: true });
    void seedExampleProjects()
      .then((next) => set({ index: mergeExampleEntries(next) }))
      .catch(() => undefined);
    void ensureOfficialMarket();
  },

  setError: (error) => set({ error }),
  setInfo: (info) => set({ info }),

  create: async (input) => {
    const { project, entry } = await createProject(input);
    const index = await loadIndex();
    const path = entry.localPath || entry.path;
    set({
      index,
      current: withDisplayAssets(project, path),
      currentPath: path,
      dirty: false,
      error: null,
      info: input.fromProject
        ? `已在本地创建工程「${project.meta.name}」→ ${entry.localPath || entry.path}`
        : null,
      currentOrigin: "owned",
      ...resetHistory(),
    });
    resetEditorSession();
    if (input.fromProject) useOnboardingStore.getState().complete("clone-board");
  },

  open: async (id) => {
    const { project, entry } = await openProjectById(id);
    const index = await loadIndex();
    const path = entry.localPath || entry.path;
    set({
      index,
      current: withDisplayAssets(project, path),
      currentPath: path,
      dirty: false,
      error: null,
      currentOrigin: entry.origin === "subscribed" || entry.origin === "example" ? entry.origin : "owned",
      ...resetHistory(),
    });
    resetEditorSession();
  },

  openFile: async (text, pathLabel) => {
    const handle = await pickDirectory();
    if (!handle) throw new Error("导入需要选择一个本地工程文件夹");
    const { project, entry } = await importProjectFile(text, pathLabel, handle);
    const index = await loadIndex();
    const path = entry.localPath || entry.path;
    set({
      index,
      current: withDisplayAssets(project, path),
      currentPath: path,
      dirty: false,
      error: null,
      currentOrigin: "owned",
      ...resetHistory(),
    });
    resetEditorSession();
  },

  openFolder: async () => {
    const result = await openFromDirectory();
    if (!result) return false;
    const index = await loadIndex();
    const path = result.entry.localPath || result.entry.path;
    set({
      index,
      current: withDisplayAssets(result.project, path),
      currentPath: path,
      dirty: false,
      error: null,
      currentOrigin: "owned",
      ...resetHistory(),
    });
    resetEditorSession();
    return true;
  },

  relinkFolder: async () => {
    const current = get().current;
    if (!current) return;
    const { path, project } = await relinkProjectFolder(current.meta.id);
    const index = await loadIndex();
    set({
      index,
      current: withDisplayAssets(project, path),
      currentPath: path,
      dirty: false,
      info: `已绑定文件夹：${path}`,
    });
  },

  relinkById: async (id) => {
    const { path, project } = await relinkProjectFolder(id);
    const index = await loadIndex();
    set({
      index,
      current: withDisplayAssets(project, path),
      currentPath: path,
      dirty: false,
      error: null,
      info: `已绑定文件夹：${path}`,
      ...resetHistory(),
    });
    resetEditorSession();
  },

  close: () => {
    resetEditorSession();
    set({
      current: null,
      currentPath: null,
      dirty: false,
      currentOrigin: "owned",
      ...resetHistory(),
    });
  },

  adoptPlayProject: (project) => {
    invalidateCardCache();
    set({
      current: project,
      currentPath: "联机同步（未写入本机文件夹）",
      dirty: false,
      currentOrigin: "owned",
      ...resetHistory(),
    });
    resetEditorSession();
  },

  updateMeta: async (id, patch) => {
    const index = await updateIndexEntry(id, patch);
    const current = get().current;
    set({
      index,
      current:
        current && current.meta.id === id
          ? {
              ...current,
              meta: {
                ...current.meta,
                name: patch.name ?? current.meta.name,
                note: patch.note ?? current.meta.note,
                coverAsset: patch.coverAsset ?? current.meta.coverAsset,
              },
            }
          : current,
    });
  },

  forget: async (id) => {
    const index = await removeFromIndex(id);
    await deleteProjectData(id);
    const current = get().current;
    set({
      index,
      current: current?.meta.id === id ? null : current,
      currentPath: current?.meta.id === id ? null : get().currentPath,
    });
  },

  setPlaySetup: (setup) => {
    const current = get().current;
    if (!current) return;
    const next = { ...current, playSetup: setup };
    const owned = get().currentOrigin === "owned";
    set({
      current: next,
      dirty: owned ? true : get().dirty,
      info: owned ? "已记下默认桌面，保存项目后下次开房会用。" : "已记下本次默认桌面。",
    });
    void cacheProject(next);
  },

  patchProject: (recipe, opts) => {
    const current = get().current;
    if (!current) return;
    if (get().currentOrigin === "subscribed" || get().currentOrigin === "example") {
      set({ error: get().currentOrigin === "example" ? "案例只读。请先加入工作板再编辑。" : "订阅项目只读。请先另存为本地工程再编辑。" });
      return;
    }
    const next = syncDerived(recipe(structuredClone(current)));
    invalidateCardCache();
    const now = Date.now();
    const merge =
      !!opts?.mergeKey &&
      opts.mergeKey === get().mergeKey &&
      now - get().mergeAt < MERGE_MS;
    if (merge) {
      set({ current: next, dirty: true, mergeAt: now });
      return;
    }
    set({
      current: next,
      dirty: true,
      past: [...get().past, structuredClone(current)].slice(-HISTORY_LIMIT),
      future: [],
      mergeKey: opts?.mergeKey ?? null,
      mergeAt: now,
    });
  },

  undo: () => {
    const { past, current } = get();
    if (!past.length || !current) return;
    const prev = past[past.length - 1];
    invalidateCardCache();
    set({
      current: prev,
      past: past.slice(0, -1),
      future: [...get().future, current],
      dirty: true,
      mergeKey: null,
    });
  },

  redo: () => {
    const { future, current } = get();
    if (!future.length || !current) return;
    const nxt = future[future.length - 1];
    invalidateCardCache();
    set({
      current: nxt,
      future: future.slice(0, -1),
      past: [...get().past, current],
      dirty: true,
      mergeKey: null,
    });
  },

  persist: async () => {
    const current = get().current;
    if (!current || !get().dirty) return;
    if (get().currentOrigin === "subscribed" || get().currentOrigin === "example") {
      set({ error: "只读项目不能直接保存，请加入工作板或另存为。" });
      return;
    }
    set({ saving: true });
    try {
      const path = await saveProject(current);
      const index = await loadIndex();
      set({ dirty: false, saving: false, index, currentPath: path });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "保存失败",
      });
    }
  },

  uploadMarket: async (projectId, desc) => {
    const project = await resolveLocalProject(projectId);
    const profile = usePlayProfileStore.getState();
    const res = await fetch("/__market", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        item: {
          name: project.meta.name,
          author: profile.name,
          kind: profile.kind === "developer" ? "开发者" : "桌游玩家",
          desc,
          cover: project.meta.coverAsset ? project.assets[project.meta.coverAsset] : undefined,
          ownerId: marketAuthorId(),
          projectId: project.meta.id,
        },
        project,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    useOnboardingStore.getState().complete("upload");
  },

  updateMarket: async (marketId, projectId, desc) => {
    const project = await resolveLocalProject(projectId);
    const profile = usePlayProfileStore.getState();
    const res = await fetch(`/__market/${marketId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerId: marketAuthorId(),
        item: {
          name: project.meta.name,
          author: profile.name,
          desc,
          cover: project.meta.coverAsset ? project.assets[project.meta.coverAsset] : undefined,
          projectId: project.meta.id,
        },
        project,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
  },

  unlistMarket: async (marketId) => {
    const res = await fetch(`/__market/${marketId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerId: marketAuthorId() }),
    });
    if (!res.ok) throw new Error(await res.text());
  },

  subscribeMarket: async (marketId) => {
    const res = await fetch(`/__market/${marketId}/subscribe`, { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { project: Project };
    const project = syncDerived({
      ...data.project,
      meta: { ...data.project.meta, id: `sub_${marketId}` },
    });
    const entry = await rememberSubscribed(project, marketId);
    const index = await loadIndex();
    invalidateCardCache();
    set({
      index,
      current: project,
      currentPath: entry.path,
      currentOrigin: "subscribed",
      dirty: false,
      error: null,
      ...resetHistory(),
    });
  },

  unsubscribeMarket: async (marketId) => {
    await fetch(`/__market/${marketId}/unsubscribe`, { method: "POST" }).catch(() => undefined);
    const id = `sub_${marketId}`;
    const hit =
      get().index.projects.find((p) => p.id === id) ??
      get().index.projects.find((p) => p.origin === "subscribed" && p.marketId === marketId);
    if (hit) await get().forget(hit.id);
  },
}));

async function resolveLocalProject(projectId: string): Promise<Project> {
  const current = useAppStore.getState().current;
  if (current?.meta.id === projectId) return current;
  const cached = await loadCachedProject(projectId);
  if (cached) return cached;
  return (await openProjectById(projectId)).project;
}

export function marketAuthorId(): string {
  const key = "ceditor-market-author";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = `au_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return "local";
  }
}
