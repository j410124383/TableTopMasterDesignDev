import { coverThumbOf, exampleCoverUrl } from "@/lib/cover";
import { downloadBlob, zipFiles } from "@/lib/zip";
import { nowIso, uid } from "@/lib/id";
import { createEmptyProject } from "@/model/defaults";
import { validateProject } from "@/model/schema";
import { STARTER_TEMPLATES, type StarterId } from "@/model/starters";
import type { AppIndex, AppIndexEntry, Project, SizeMm } from "@/model/types";
import {
  canPickDirectory,
  dirHasEntries,
  ensurePermission,
  ensureSubdir,
  handleKey,
  pickDirectory,
  safeFolderName,
  tryGetDir,
} from "./fsAccess";
import {
  isCardEditorFolder,
  readProjectFromFolder,
  writeProjectToFolder,
} from "./folderFormat";
import { idbDelete, idbGet, idbSet } from "./idb";
import {
  PATH_LOST,
  copyProjectOnDisk,
  diskExists,
  diskList,
  diskMkdir,
  pickLocalFolder,
  readProjectFromDisk,
  writeProjectToDisk,
} from "./nodeFs";

const INDEX_KEY = "app-index";
const projectKey = (id: string) => `project:${id}`;

function emptyIndex(): AppIndex {
  return { projects: [] };
}

export async function loadIndex(): Promise<AppIndex> {
  return (await idbGet<AppIndex>(INDEX_KEY)) ?? emptyIndex();
}

async function saveIndex(index: AppIndex): Promise<void> {
  await idbSet(INDEX_KEY, index);
}

export async function getProjectHandle(
  id: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  return idbGet<FileSystemDirectoryHandle>(handleKey(id));
}

export async function setProjectHandle(
  id: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await idbSet(handleKey(id), handle);
}

function upsertEntry(index: AppIndex, entry: AppIndexEntry): AppIndex {
  const rest = index.projects.filter((p) => p.id !== entry.id);
  return { ...index, projects: [entry, ...rest] };
}

function entryFrom(project: Project, path: string, extra?: Partial<AppIndexEntry>): AppIndexEntry {
  return {
    id: project.meta.id,
    name: project.meta.name,
    path,
    note: project.meta.note,
    coverAsset: project.meta.coverAsset,
    coverThumb: coverThumbOf(project),
    lastOpenedAt: nowIso(),
    ...extra,
  };
}

export async function cacheProject(project: Project): Promise<void> {
  await idbSet(projectKey(project.meta.id), project);
}

const EXAMPLE_RECIPE = 11;
const EXAMPLE_RECIPE_KEY = "ceditor-example-recipe";

export function exampleStarterOf(id: string): StarterId | undefined {
  if (!id.startsWith("ex_")) return undefined;
  const starter = id.slice(3) as StarterId;
  return STARTER_TEMPLATES.some((s) => s.id === starter && s.id !== "empty") ? starter : undefined;
}

export function buildExampleProject(starter: StarterId): Project {
  const info = STARTER_TEMPLATES.find((s) => s.id === starter);
  if (!info || info.id === "empty") throw new Error("未知案例");
  const cover = exampleCoverUrl(info.id);
  const project = createEmptyProject({
    name: info.name,
    note: `案例 · ${info.desc}`,
    size: info.size,
    starter: info.id,
    coverAsset: cover,
  });
  project.meta.id = `ex_${info.id}`;
  if (cover) project.assets.cover = cover;
  return project;
}

export function mergeExampleEntries(index: AppIndex): AppIndex {
  const projects = index.projects.map((p) => {
    const starter = exampleStarterOf(p.id);
    if (!starter) return p;
    const cover = exampleCoverUrl(starter);
    return { ...p, origin: "example" as const, coverAsset: cover, coverThumb: cover };
  });
  const have = new Set(projects.map((p) => p.id));
  for (const info of STARTER_TEMPLATES.filter((s) => s.id !== "empty")) {
    const id = `ex_${info.id}`;
    if (have.has(id)) continue;
    const cover = exampleCoverUrl(info.id);
    projects.push({
      id,
      name: info.name,
      path: `案例 / ${info.name}`,
      note: `案例 · ${info.desc}`,
      lastOpenedAt: nowIso(),
      origin: "example",
      coverAsset: cover,
      coverThumb: cover,
    });
  }
  return { ...index, projects, examplesSeeded: true };
}

export async function seedExampleProjects(): Promise<AppIndex> {
  let index: AppIndex = emptyIndex();
  try {
    index = await loadIndex();
  } catch {
    index = emptyIndex();
  }
  const next = mergeExampleEntries({ ...index, projects: [...index.projects] });
  let recipe = 0;
  try {
    recipe = Number(localStorage.getItem(EXAMPLE_RECIPE_KEY) || 0);
  } catch {
    recipe = 0;
  }
  const refresh = recipe < EXAMPLE_RECIPE;
  for (const info of STARTER_TEMPLATES.filter((s) => s.id !== "empty")) {
    const id = `ex_${info.id}`;
    if (!refresh) {
      try {
        if (await loadCachedProject(id)) continue;
      } catch {
        /* rebuild below */
      }
    }
    try {
      await cacheProject(buildExampleProject(info.id));
    } catch {
      /* IndexedDB can fail on a fresh PC; opening still rebuilds from code */
    }
    await new Promise((r) => window.setTimeout(r, 0));
  }
  if (refresh) {
    try {
      localStorage.setItem(EXAMPLE_RECIPE_KEY, String(EXAMPLE_RECIPE));
    } catch {
      /* ignore */
    }
  }
  try {
    await saveIndex(next);
  } catch {
    /* keep the in-memory index */
  }
  return next;
}

export function displayPathOf(entry: Pick<AppIndexEntry, "path" | "localPath">): string {
  return (entry.localPath ?? entry.path).trim();
}

export function resolveOwnedPath(
  entry: Pick<AppIndexEntry, "name" | "path" | "localPath" | "origin">,
  projects: AppIndexEntry[],
): string {
  const raw = displayPathOf(entry);
  if (looksLikeFullPath(raw)) return raw;
  if (entry.origin === "example" || entry.origin === "subscribed") return raw;
  return inferSaveDirPath(lastPathSegment(raw) || entry.name, projects) || raw;
}

export async function revealInExplorer(path: string): Promise<boolean> {
  try {
    const res = await fetch("/__fs/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 浏览器拿不到盘符，保存位置路径需要带盘符才能拼出完整工程路径 */
export function looksLikeFullPath(path: string): boolean {
  const t = path.trim();
  if (/^[A-Za-z]:[\\/]/.test(t)) return true;
  if (t.startsWith("\\\\") && t.length > 3) return true;
  if (t.startsWith("/") && t.length > 1 && t.includes("/", 1)) return true;
  return false;
}

export function normalizeLocalPath(path: string): string {
  return path
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .replace(/\\{2,}/g, "\\")
    .toLowerCase();
}

export function joinLocalPath(parent: string, child: string): string {
  const left = parent.trim().replace(/[\\/]+$/, "");
  const right = child.trim().replace(/^[\\/]+/, "");
  if (!left) return right;
  if (!right) return left;
  const sep = left.startsWith("/") && !/^[A-Za-z]:/.test(left) ? "/" : "\\";
  return `${left}${sep}${right}`;
}

export function composeProjectPath(parentPath: string, projectName: string, makeSubfolder: boolean): string {
  const parent = parentPath.trim();
  if (!makeSubfolder) return parent.replace(/[\\/]+$/, "");
  return joinLocalPath(parent, safeFolderName(projectName));
}

export function lastPathSegment(path: string): string {
  const parts = path.trim().replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

const LAST_SAVE_DIR_KEY = "ceditor-last-save-dir";

export function readLastSaveDir(): string {
  try {
    return localStorage.getItem(LAST_SAVE_DIR_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function rememberLastSaveDir(path: string): void {
  const t = path.trim();
  if (!t) return;
  try {
    localStorage.setItem(LAST_SAVE_DIR_KEY, t);
  } catch {
    /* ignore */
  }
}

export function inferSaveDirPath(folderName: string, projects: AppIndexEntry[]): string {
  const name = folderName.trim();
  if (!name) return "";
  const last = readLastSaveDir();
  if (last && lastPathSegment(last).toLowerCase() === name.toLowerCase()) {
    return last.replace(/[\\/]+$/, "");
  }
  for (const p of projects) {
    if (p.origin === "example" || p.origin === "subscribed") continue;
    const full = displayPathOf(p);
    if (!looksLikeFullPath(full)) continue;
    const segs = full.replace(/[\\/]+$/, "").split(/[\\/]/);
    if (segs.length >= 2 && segs[segs.length - 2]?.toLowerCase() === name.toLowerCase()) {
      return segs.slice(0, -1).join(full.includes("/") && !full.includes("\\") ? "/" : "\\");
    }
    if (lastPathSegment(full).toLowerCase() === name.toLowerCase()) {
      return full.replace(/[\\/]+$/, "");
    }
  }
  const drive = last.match(/^[A-Za-z]:[\\/]/);
  if (drive) return `${drive[0]}${name}`;
  return "";
}

export function findOwnedPathConflict(
  localPath: string,
  projects: AppIndexEntry[],
  exceptId?: string,
): AppIndexEntry | undefined {
  const key = normalizeLocalPath(localPath);
  if (!key) return undefined;
  return projects.find((p) => {
    if (exceptId && p.id === exceptId) return false;
    if (p.origin === "example" || p.origin === "subscribed") return false;
    return normalizeLocalPath(displayPathOf(p)) === key;
  });
}

function keepDiskMeta(
  existing: AppIndexEntry | undefined,
  handleName: string,
  extra?: Partial<AppIndexEntry>,
): Pick<AppIndexEntry, "path" | "localPath" | "origin" | "marketId"> {
  const localPath = (extra?.localPath ?? existing?.localPath)?.trim() || undefined;
  return {
    path: localPath || existing?.path || handleName,
    localPath,
    origin: extra?.origin ?? existing?.origin ?? "owned",
    marketId: extra?.marketId ?? existing?.marketId,
  };
}

export async function rememberSubscribed(project: Project, marketId: string): Promise<AppIndexEntry> {
  await cacheProject(project);
  const entry = entryFrom(project, `订阅 / ${project.meta.name}`, { origin: "subscribed", marketId });
  const index = await loadIndex();
  await saveIndex(upsertEntry(index, entry));
  return entry;
}

export async function loadCachedProject(id: string): Promise<Project | undefined> {
  try {
    const raw = await idbGet<unknown>(projectKey(id));
    if (!raw) return undefined;
    return validateProject(raw);
  } catch {
    return undefined;
  }
}

export async function saveProject(project: Project): Promise<string> {
  const next: Project = {
    ...project,
    variables: project.variables ?? [],
    meta: { ...project.meta, updatedAt: nowIso() },
  };
  const handle = await getProjectHandle(next.meta.id);
  const index = await loadIndex();
  const existing = index.projects.find((p) => p.id === next.meta.id);
  const diskPath = (existing?.localPath ?? existing?.path ?? "").trim();
  if (handle) {
    const ok = await ensurePermission(handle);
    if (ok) {
      await writeProjectToFolder(handle, next);
      await cacheProject(next);
      const disk = keepDiskMeta(existing, handle.name);
      await saveIndex(
        upsertEntry(
          index,
          entryFrom(next, disk.path, {
            lastOpenedAt: existing?.lastOpenedAt ?? nowIso(),
            ...disk,
          }),
        ),
      );
      return disk.path;
    }
  }
  if (looksLikeFullPath(diskPath)) {
    const exists = await diskExists(diskPath);
    if (exists === false) throw new Error(PATH_LOST);
    await writeProjectToDisk(diskPath, next);
    await cacheProject(next);
    const disk = keepDiskMeta(existing, lastPathSegment(diskPath), { localPath: diskPath });
    await saveIndex(
      upsertEntry(
        index,
        entryFrom(next, diskPath, {
          lastOpenedAt: existing?.lastOpenedAt ?? nowIso(),
          ...disk,
        }),
      ),
    );
    return diskPath;
  }
  throw new Error(PATH_LOST);
}

export async function createProject(input: {
  name: string;
  note?: string;
  size: SizeMm;
  coverAsset?: string;
  starter?: StarterId;
  fromProject?: Project;
  handle?: FileSystemDirectoryHandle;
  makeSubfolder: boolean;
  /** 所选保存位置的完整路径，例如 F:\卡牌 */
  parentPath?: string;
  pathLabel?: string;
  /** 复制为新工程时，源工程的本机文件夹（有则整目录拷贝） */
  sourcePath?: string;
}): Promise<{ project: Project; entry: AppIndexEntry }> {
  const parentPath = (input.parentPath ?? input.pathLabel)?.trim() || "";
  if (!looksLikeFullPath(parentPath)) {
    throw new Error("请选择保存位置。浏览文件夹后会自动填入完整路径。");
  }
  const localPath = composeProjectPath(parentPath, input.name, input.makeSubfolder);
  const indexBefore = await loadIndex();
  const clash = findOwnedPathConflict(localPath, indexBefore.projects);
  if (clash) {
    throw new Error(`路径已被工作板项目「${clash.name}」占用：${displayPathOf(clash)}`);
  }

  const stamp = nowIso();
  let project: Project;
  if (input.fromProject) {
    project = structuredClone(input.fromProject);
    project.meta = {
      ...project.meta,
      id: uid("prj"),
      name: input.name,
      note: input.note ?? project.meta.note,
      createdAt: stamp,
      updatedAt: stamp,
    };
  } else {
    project = createEmptyProject({
      name: input.name,
      note: input.note,
      size: input.size,
      coverAsset: input.coverAsset,
      starter: input.starter,
    });
  }
  if (input.coverAsset?.startsWith("data:")) {
    const coverId = "cover";
    project.assets[coverId] = input.coverAsset;
    project.meta.coverAsset = coverId;
  }

  if (input.handle) {
    const ok = await ensurePermission(input.handle);
    if (!ok) throw new Error("无法写入所选文件夹");
    let root = input.handle;
    if (input.makeSubfolder) {
      const folderName = safeFolderName(input.name);
      const existing = await tryGetDir(input.handle, folderName);
      if (existing) {
        if (await isCardEditorFolder(existing)) {
          throw new Error(`「${folderName}」已是 TMD 工程。请改用「打开项目」，或换一个名称。`);
        }
        if (await dirHasEntries(existing)) {
          throw new Error(`保存位置下已有同名文件夹「${folderName}」，请换一个项目名称。`);
        }
        root = existing;
      } else {
        root = await ensureSubdir(input.handle, folderName);
      }
    } else if (await isCardEditorFolder(root)) {
      throw new Error("该文件夹已是 TMD 工程。请改用「打开项目」，或换一个空目录。");
    } else if (await dirHasEntries(root)) {
      throw new Error("所选文件夹不是空目录。请勾选创建同名子文件夹，或换一个空目录。");
    }
    await writeProjectToFolder(root, project);
    await setProjectHandle(project.meta.id, root);
  } else {
    await diskMkdir(localPath);
    const listing = await diskList(localPath);
    const hasMarker =
      listing &&
      listing.files.some((n) => n.endsWith(".ceditor") || n === "project.json");
    const hasDataProject = await diskExists(`${localPath.replace(/[\\/]+$/, "")}\\data\\project.json`);
    if (hasMarker || hasDataProject) {
      throw new Error("该路径已是 TMD 工程。请改用「打开项目」，或换一个名称。");
    }
    if (!input.makeSubfolder && listing && listing.files.length + listing.dirs.length > 2) {
      throw new Error("所选文件夹不是空目录。请勾选创建同名子文件夹，或换一个空目录。");
    }
    const sourcePath = (input.sourcePath ?? "").trim();
    if (input.fromProject && looksLikeFullPath(sourcePath) && sourcePath.replace(/[\\/]+$/, "").toLowerCase() !== localPath.replace(/[\\/]+$/, "").toLowerCase()) {
      await copyProjectOnDisk(sourcePath, localPath, {
        id: project.meta.id,
        name: project.meta.name,
        note: project.meta.note,
      });
      const fromDisk = await readProjectFromDisk(localPath);
      if (fromDisk) project = validateProject(fromDisk);
    } else {
      await writeProjectToDisk(localPath, project);
    }
  }

  await cacheProject(project);

  const entry = entryFrom(project, localPath, {
    origin: "owned",
    localPath,
  });
  const index = await loadIndex();
  await saveIndex(upsertEntry(index, entry));
  rememberLastSaveDir(parentPath);
  return { project, entry };
}

export async function openProjectById(id: string): Promise<{
  project: Project;
  entry: AppIndexEntry;
  fromDisk: boolean;
}> {
  const index = await loadIndex().catch(() => emptyIndex());
  const existing = index.projects.find((p) => p.id === id);
  const starter = exampleStarterOf(id);
  const origin = existing?.origin ?? (starter ? "example" : "owned");
  if (origin === "example" || starter) {
    const sid = starter ?? exampleStarterOf(existing?.id ?? id);
    if (!sid) throw new Error("案例数据不完整，请刷新后再打开。");
    const cached = await loadCachedProject(id);
    const project = cached ?? buildExampleProject(sid);
    if (!cached) void cacheProject(project).catch(() => undefined);
    const entry =
      existing ??
      entryFrom(project, `案例 / ${project.meta.name}`, { origin: "example" });
    return { project, entry, fromDisk: false };
  }
  if (origin === "subscribed") {
    const cached = await loadCachedProject(id);
    if (cached && existing) return { project: cached, entry: existing, fromDisk: false };
    throw new Error("订阅数据丢失，请到市集重新订阅。");
  }

  const diskPath = existing ? displayPathOf(existing) : "";
  if (origin === "owned") {
    if (!looksLikeFullPath(diskPath)) throw new Error(PATH_LOST);
    const onDisk = await diskExists(diskPath);
    if (onDisk === false) throw new Error(PATH_LOST);
  }

  const handle = await getProjectHandle(id);
  if (handle) {
    try {
      const ok = await ensurePermission(handle);
      if (ok) {
        const project = await readProjectFromFolder(handle);
        await cacheProject(project);
        let disk = keepDiskMeta(existing, handle.name);
        if (!looksLikeFullPath(disk.path) && !looksLikeFullPath(disk.localPath ?? "")) {
          const inferred = inferSaveDirPath(handle.name, index.projects);
          if (inferred) disk = { ...disk, path: inferred, localPath: inferred };
        }
        const entry = entryFrom(project, disk.path, { lastOpenedAt: nowIso(), ...disk });
        await saveIndex(upsertEntry(index, { ...existing, ...entry }));
        return { project, entry, fromDisk: true };
      }
    } catch {
      /* try disk path */
    }
  }

  if (looksLikeFullPath(diskPath)) {
    const raw = await readProjectFromDisk(diskPath);
    if (raw && existing) {
      let project: Project;
      try {
        project = validateProject(raw);
      } catch {
        throw new Error(PATH_LOST);
      }
      await cacheProject(project);
      const entry = entryFrom(project, diskPath, {
        lastOpenedAt: nowIso(),
        ...keepDiskMeta(existing, lastPathSegment(diskPath), { localPath: diskPath }),
      });
      await saveIndex(upsertEntry(index, { ...existing, ...entry }));
      return { project, entry, fromDisk: true };
    }
  }

  throw new Error(PATH_LOST);
}

export async function importProjectFile(
  jsonText: string,
  pathLabel?: string,
  handle?: FileSystemDirectoryHandle | null,
): Promise<{ project: Project; entry: AppIndexEntry }> {
  const raw = JSON.parse(jsonText) as { json_version?: unknown };
  if (raw && typeof raw === "object" && "json_version" in raw) {
    throw new Error("这是 Tabletop Creator 文件，当前版本不支持导入。请新建 TMD 项目。");
  }
  const parsed = validateProject(raw);
  if (handle) {
    const ok = await ensurePermission(handle);
    if (!ok) throw new Error("无法写入所选文件夹");
    await writeProjectToFolder(handle, parsed);
    await setProjectHandle(parsed.meta.id, handle);
  } else {
    throw new Error("导入后请选择一个本地文件夹作为工程目录。");
  }
  await cacheProject(parsed);
  const labeled = pathLabel?.trim();
  const entry = entryFrom(parsed, looksLikeFullPath(labeled ?? "") ? labeled! : handle.name, {
    origin: "owned",
    localPath: looksLikeFullPath(labeled ?? "") ? labeled : undefined,
  });
  const index = await loadIndex();
  await saveIndex(upsertEntry(index, entry));
  return { project: parsed, entry };
}

export async function openFromDirectory(): Promise<{
  project: Project;
  entry: AppIndexEntry;
} | null> {
  const native = await pickLocalFolder();
  if (native === undefined) return null;
  if (native) {
    const raw = await readProjectFromDisk(native);
    if (!raw) throw new Error("所选文件夹不是 TMD 工程（缺少 project.json）");
    const project = validateProject(raw);
    await cacheProject(project);
    const index = await loadIndex();
    const existing = index.projects.find((p) => p.id === project.meta.id);
    const entry = entryFrom(project, native, {
      origin: "owned",
      localPath: native,
      lastOpenedAt: nowIso(),
    });
    await saveIndex(upsertEntry(index, { ...existing, ...entry }));
    rememberLastSaveDir(native);
    return { project, entry };
  }
  const dir = await pickDirectory();
  if (!dir) return null;
  const project = await readProjectFromFolder(dir);
  await setProjectHandle(project.meta.id, dir);
  await cacheProject(project);
  const index = await loadIndex();
  const existing = index.projects.find((p) => p.id === project.meta.id);
  let disk = keepDiskMeta(existing, dir.name, { origin: "owned" });
  if (!looksLikeFullPath(disk.path) && !looksLikeFullPath(disk.localPath ?? "")) {
    const inferred = inferSaveDirPath(dir.name, index.projects);
    if (inferred) disk = { ...disk, path: inferred, localPath: inferred };
  }
  const entry = entryFrom(project, disk.path, disk);
  await saveIndex(upsertEntry(index, entry));
  return { project, entry };
}

export async function relinkProjectFolder(projectId: string): Promise<{
  path: string;
  project: Project;
}> {
  const native = await pickLocalFolder();
  if (native === undefined) throw new Error("未选择文件夹");
  if (native) {
    const exists = await diskExists(native);
    if (exists === false) throw new Error(PATH_LOST);
    let project: Project | null = null;
    const raw = await readProjectFromDisk(native);
    if (raw) {
      try {
        project = validateProject(raw);
      } catch {
        project = null;
      }
    }
    if (!project) {
      const cached = await loadCachedProject(projectId);
      if (!cached) throw new Error("没有可写入的项目数据");
      project = cached;
      await writeProjectToDisk(native, project);
    }
    await cacheProject(project);
    const index = await loadIndex();
    const old = index.projects.find((p) => p.id === projectId || p.id === project.meta.id);
    const rest = index.projects.filter((p) => p.id !== projectId && p.id !== project.meta.id);
    const entry = entryFrom(project, native, {
      origin: "owned",
      localPath: native,
      lastOpenedAt: nowIso(),
    });
    await saveIndex({ projects: [{ ...old, ...entry, id: project.meta.id }, ...rest] });
    rememberLastSaveDir(native);
    return { path: native, project };
  }

  const dir = await pickDirectory();
  if (!dir) throw new Error("未选择文件夹");
  const ok = await ensurePermission(dir);
  if (!ok) throw new Error("无法访问所选文件夹");
  const existing = await isCardEditorFolder(dir);
  let project: Project;
  if (existing) {
    project = await readProjectFromFolder(dir);
  } else {
    const cached = await loadCachedProject(projectId);
    if (!cached) throw new Error("没有可写入的项目数据");
    project = cached;
    await writeProjectToFolder(dir, project);
  }
  await setProjectHandle(project.meta.id, dir);
  await cacheProject(project);
  const index = await loadIndex();
  const old = index.projects.find((p) => p.id === projectId || p.id === project.meta.id);
  const rest = index.projects.filter((p) => p.id !== projectId && p.id !== project.meta.id);
  const disk = keepDiskMeta(old, dir.name, { origin: "owned", localPath: old?.localPath });
  await saveIndex({ projects: [entryFrom(project, disk.path, disk), ...rest] });
  return { path: disk.path, project };
}

export async function updateIndexEntry(
  id: string,
  patch: Partial<Pick<AppIndexEntry, "name" | "note" | "coverAsset" | "localPath">>,
): Promise<AppIndex> {
  if (patch.localPath?.trim()) {
    const clash = findOwnedPathConflict(patch.localPath, (await loadIndex()).projects, id);
    if (clash) {
      throw new Error(`路径已被工作板项目「${clash.name}」占用：${displayPathOf(clash)}`);
    }
  }
  const handle = await getProjectHandle(id);
  if (!handle) {
    const onlyPath =
      patch.localPath !== undefined &&
      patch.name === undefined &&
      patch.note === undefined &&
      patch.coverAsset === undefined;
    if (!onlyPath) throw new Error("没有本地文件夹句柄，请重新打开或绑定工程目录");
    const index = await loadIndex();
    const next = {
      ...index,
      projects: index.projects.map((p) =>
        p.id === id
          ? {
              ...p,
              localPath: patch.localPath?.trim() || undefined,
              path: patch.localPath?.trim() || p.path,
            }
          : p,
      ),
    };
    await saveIndex(next);
    return next;
  }
  const ok = await ensurePermission(handle);
  if (!ok) throw new Error("文件夹权限已失效");
  let project = await readProjectFromFolder(handle);
  const cover = patch.coverAsset;
  if (cover?.startsWith("data:")) {
    const coverId = "cover";
    project.assets = { ...project.assets, [coverId]: cover };
    project.meta.coverAsset = coverId;
  } else if (cover !== undefined) {
    project.meta.coverAsset = cover;
  }
  project = {
    ...project,
    meta: {
      ...project.meta,
      name: patch.name ?? project.meta.name,
      note: patch.note ?? project.meta.note,
      updatedAt: nowIso(),
    },
  };
  await writeProjectToFolder(handle, project);
  await cacheProject(project);
  const index = await loadIndex();
  const next = {
    ...index,
    projects: index.projects.map((p) => {
      if (p.id !== id) return p;
      const disk = keepDiskMeta(p, handle.name, { localPath: patch.localPath ?? p.localPath });
      return { ...p, ...entryFrom(project, disk.path, { lastOpenedAt: p.lastOpenedAt, ...disk }) };
    }),
  };
  await saveIndex(next);
  return next;
}

export async function removeFromIndex(id: string): Promise<AppIndex> {
  const index = await loadIndex();
  const next = { ...index, projects: index.projects.filter((p) => p.id !== id) };
  await saveIndex(next);
  return next;
}

export async function deleteProjectData(id: string): Promise<void> {
  await idbDelete(projectKey(id));
  await idbDelete(handleKey(id));
}

export function downloadProjectJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.meta.name || "project"}.project.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportProjectById(id: string): Promise<void> {
  const handle = await getProjectHandle(id);
  const project = handle
    ? await readProjectFromFolder(handle)
    : await loadCachedProject(id);
  if (!project) throw new Error("找不到项目");
  downloadProjectJson(project);
}

export function downloadProjectZip(project: Project): void {
  const name = (project.meta.name || "project").replace(/[\\/:*?"<>|]/g, "_");
  const blob = zipFiles([
    { name: `${name}/project.json`, data: JSON.stringify(project, null, 2) },
    {
      name: `${name}/README.txt`,
      data: `TMD 工程包\n${project.meta.name}\n用「打开项目…」选择这个文件夹，或导入 project.json。\n`,
    },
  ]);
  downloadBlob(blob, `${name}.zip`);
}

export async function exportProjectZipById(id: string): Promise<void> {
  const handle = await getProjectHandle(id);
  const project = handle
    ? await readProjectFromFolder(handle)
    : await loadCachedProject(id);
  if (!project) throw new Error("找不到项目");
  downloadProjectZip(project);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export { PATH_LOST, diskExists, pickLocalFolder } from "./nodeFs";
export { canPickDirectory, pickDirectory };
