import { DEFAULT_PRINT } from "@/model/defaults";
import { validateProject } from "@/model/schema";
import type { Blueprint, CardSet, Deck, PackagingBox, PrintSettings, Project, ProjectMeta, Rulebook, Template } from "@/model/types";
import {
  ensureSubdir,
  fileExists,
  hasCeditorMarker,
  listFileNames,
  readTextFile,
  removeFile,
  tryGetDir,
  tryReadText,
  writeBlobFile,
  writeTextFile,
} from "./fsAccess";

export const FOLDER_FORMAT = "ceditor-folder-v1";

type DiskProjectFile = {
  schemaVersion: number;
  format?: string;
  meta: ProjectMeta;
  print?: PrintSettings;
  templates?: Template[];
  decks?: Deck[];
  assets?: Record<string, string>;
  variables?: Project["variables"];
};

function extFromDataUrl(src: string): string {
  if (src.startsWith("data:image/png")) return ".png";
  if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) return ".jpg";
  if (src.startsWith("data:image/webp")) return ".webp";
  if (src.startsWith("data:image/svg")) return ".svg";
  if (src.startsWith("data:font/ttf") || src.includes("font/ttf")) return ".ttf";
  if (src.includes("font/otf")) return ".otf";
  return ".bin";
}

async function writeDataUrl(
  dir: FileSystemDirectoryHandle,
  filename: string,
  dataUrl: string,
): Promise<void> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  await writeBlobFile(dir, filename, blob);
}

async function readToDataUrl(
  root: FileSystemDirectoryHandle,
  rel: string,
): Promise<string | null> {
  const parts = rel.replaceAll("\\", "/").split("/").filter(Boolean);
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    const next = await tryGetDir(dir, part);
    if (!next) return null;
    dir = next;
  }
  const name = parts.at(-1);
  if (!name) return null;
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    if (name.toLowerCase().endsWith(".psd")) {
      // 保留相对路径，由 /__fs/file 或 absolutizeAssets 按需解码；绝不落预览 PNG
      return null;
    }
    // blob URL 比 data URL 快得多，避免打开大工程卡住
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

export async function detectTtcProject(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const names = await listFileNames(dir);
  if (!names.some((n) => n.endsWith(".tcp"))) return false;
  const data = await tryGetDir(dir, "data");
  if (!data) return false;
  const raw = await tryReadText(data, "project.json");
  return !!raw && raw.includes("json_version");
}

export async function isCardEditorFolder(dir: FileSystemDirectoryHandle): Promise<boolean> {
  if (await hasCeditorMarker(dir)) return true;
  if (await fileExists(dir, "project.json")) return true;
  const data = await tryGetDir(dir, "data");
  if (data && (await fileExists(data, "project.json"))) return true;
  return false;
}

export async function writeProjectToFolder(
  root: FileSystemDirectoryHandle,
  project: Project,
): Promise<void> {
  const marker = `${project.meta.name.replace(/[\\/:*?"<>|]/g, "_") || "project"}.ceditor`;
  for (const name of await listFileNames(root)) {
    if (name.endsWith(".ceditor") && name !== marker) await removeFile(root, name);
  }
  await writeTextFile(
    root,
    marker,
    JSON.stringify(
      {
        info: "Card Editor project folder",
        note: "移动项目请带走整个文件夹",
        format: FOLDER_FORMAT,
      },
      null,
      2,
    ),
  );
  const data = await ensureSubdir(root, "data");
  const assetsDir = await ensureSubdir(root, "assets");
  const images = await ensureSubdir(assetsDir, "images");
  await ensureSubdir(assetsDir, "icons");
  const fontsDir = await ensureSubdir(assetsDir, "fonts");

  const assetIndex: Record<string, string> = {};
  const fontIds = new Set((project.fonts ?? []).map((f) => f.assetId));
  for (const [id, src] of Object.entries(project.assets ?? {})) {
    if (src.startsWith("data:")) {
      const ext = extFromDataUrl(src);
      const filename = `${id.replaceAll("/", "_")}${ext}`;
      const dest = fontIds.has(id) || ext === ".ttf" || ext === ".otf" ? fontsDir : images;
      const rel = dest === fontsDir ? `assets/fonts/${filename}` : `assets/images/${filename}`;
      await writeDataUrl(dest, filename, src);
      assetIndex[id] = rel;
    } else if (src.startsWith("/__fs/file")) {
      let filePath = "";
      try {
        filePath = new URL(src, "http://local").searchParams.get("p") ?? "";
      } catch {
        filePath = "";
      }
      const marker = "/assets/";
      const norm = filePath.replaceAll("\\", "/");
      const at = norm.toLowerCase().lastIndexOf(marker);
      if (at >= 0) {
        assetIndex[id] = norm.slice(at + 1);
      } else {
        assetIndex[id] = src;
      }
    } else if (src.startsWith("blob:")) {
      // 内存预览，不写回；若 assets.json 已有该 id 则由磁盘扫描保留
      continue;
    } else {
      assetIndex[id] = src.replaceAll("\\", "/");
    }
  }

  const disk: DiskProjectFile = {
    schemaVersion: project.schemaVersion,
    format: FOLDER_FORMAT,
    meta: project.meta,
    print: project.print,
  };
  await writeTextFile(data, "project.json", JSON.stringify(disk, null, 2));

  const tdir = await ensureSubdir(data, "templates");
  const keepTpl = new Set((project.templates ?? []).map((t) => `${t.id}.json`));
  for (const name of await listFileNames(tdir)) {
    if (name.endsWith(".json") && !keepTpl.has(name)) await removeFile(tdir, name);
  }
  for (const tpl of project.templates ?? []) {
    await writeTextFile(tdir, `${tpl.id}.json`, JSON.stringify(tpl, null, 2));
  }
  const ddir = await ensureSubdir(data, "decks");
  const keepDeck = new Set((project.decks ?? []).map((d) => `${d.id}.json`));
  for (const name of await listFileNames(ddir)) {
    if (name.endsWith(".json") && !keepDeck.has(name)) await removeFile(ddir, name);
  }
  for (const deck of project.decks ?? []) {
    await writeTextFile(ddir, `${deck.id}.json`, JSON.stringify(deck, null, 2));
  }
  const bdir = await ensureSubdir(data, "blueprints");
  const keepBp = new Set((project.blueprints ?? []).map((b) => `${b.id}.json`));
  for (const name of await listFileNames(bdir)) {
    if (name.endsWith(".json") && !keepBp.has(name)) await removeFile(bdir, name);
  }
  for (const bp of project.blueprints ?? []) {
    await writeTextFile(bdir, `${bp.id}.json`, JSON.stringify(bp, null, 2));
  }
  const sdir = await ensureSubdir(data, "sets");
  const keepSet = new Set((project.sets ?? []).map((s) => `${s.id}.json`));
  for (const name of await listFileNames(sdir)) {
    if (name.endsWith(".json") && !keepSet.has(name)) await removeFile(sdir, name);
  }
  for (const set of project.sets ?? []) {
    await writeTextFile(sdir, `${set.id}.json`, JSON.stringify(set, null, 2));
  }
  await writeTextFile(data, "variables.json", JSON.stringify(project.variables ?? [], null, 2));
  await writeTextFile(data, "fonts.json", JSON.stringify(project.fonts ?? [], null, 2));
  await writeTextFile(data, "assets.json", JSON.stringify(assetIndex, null, 2));
  await writeTextFile(
    data,
    "export.json",
    JSON.stringify(project.print ?? DEFAULT_PRINT, null, 2),
  );
  const boxDir = await ensureSubdir(data, "boxes");
  const keepBox = new Set((project.boxes ?? []).map((b) => `${b.id}.json`));
  for (const name of await listFileNames(boxDir)) {
    if (name.endsWith(".json") && !keepBox.has(name)) await removeFile(boxDir, name);
  }
  for (const box of project.boxes ?? []) {
    await writeTextFile(boxDir, `${box.id}.json`, JSON.stringify(box, null, 2));
  }
  await writeTextFile(data, "rulebooks.json", JSON.stringify(project.rulebooks ?? [], null, 2));
}

export async function readProjectFromFolder(
  root: FileSystemDirectoryHandle,
): Promise<Project> {
  if (await detectTtcProject(root)) {
    throw new Error("这是 Tabletop Creator 工程，当前版本还不支持直接打开。请新建 TMD 项目。");
  }

  const data = await tryGetDir(root, "data");
  const dataProject = data ? await tryReadText(data, "project.json") : null;
  const rootProject = await tryReadText(root, "project.json");

  if (dataProject) {
    const parsed = JSON.parse(dataProject) as DiskProjectFile;
    if (parsed.format === FOLDER_FORMAT || (parsed.meta && !parsed.templates)) {
      const templates: Template[] = [];
      const tdir = data ? await tryGetDir(data, "templates") : null;
      if (tdir) {
        for (const name of await listFileNames(tdir)) {
          if (!name.endsWith(".json")) continue;
          templates.push(JSON.parse(await readTextFile(tdir, name)) as Template);
        }
      }
      const decks: Deck[] = [];
      const ddir = data ? await tryGetDir(data, "decks") : null;
      if (ddir) {
        for (const name of await listFileNames(ddir)) {
          if (!name.endsWith(".json")) continue;
          decks.push(JSON.parse(await readTextFile(ddir, name)) as Deck);
        }
      }
      const blueprints: Blueprint[] = [];
      const bdir = data ? await tryGetDir(data, "blueprints") : null;
      if (bdir) {
        for (const name of await listFileNames(bdir)) {
          if (!name.endsWith(".json")) continue;
          blueprints.push(JSON.parse(await readTextFile(bdir, name)) as Blueprint);
        }
      }
      const sets: CardSet[] = [];
      const sdir = data ? await tryGetDir(data, "sets") : null;
      if (sdir) {
        for (const name of await listFileNames(sdir)) {
          if (!name.endsWith(".json")) continue;
          sets.push(JSON.parse(await readTextFile(sdir, name)) as CardSet);
        }
      }
      const variables = data
        ? (JSON.parse((await tryReadText(data, "variables.json")) || "[]") as Project["variables"])
        : [];
      const fonts = data
        ? (JSON.parse((await tryReadText(data, "fonts.json")) || "[]") as Project["fonts"])
        : [];
      const print = data
        ? ((JSON.parse((await tryReadText(data, "export.json")) || "null") as PrintSettings | null) ??
          parsed.print)
        : parsed.print;
      const assetIndex = data
        ? ((JSON.parse((await tryReadText(data, "assets.json")) || "{}") as Record<string, string>))
        : {};
      const boxes: PackagingBox[] = [];
      const boxDir = data ? await tryGetDir(data, "boxes") : null;
      if (boxDir) {
        for (const name of await listFileNames(boxDir)) {
          if (!name.endsWith(".json")) continue;
          boxes.push(JSON.parse(await readTextFile(boxDir, name)) as PackagingBox);
        }
      }
      const rulebooks = data
        ? (JSON.parse((await tryReadText(data, "rulebooks.json")) || "[]") as Rulebook[])
        : [];
      const assets: Record<string, string> = {};
      const entries = Object.entries(assetIndex);
      // 并行读普通图；PSD 只保留相对路径（不烘焙 PNG）
      await Promise.all(
        entries.map(async ([id, rel]) => {
          if (rel.startsWith("data:") || rel.startsWith("/__fs/")) {
            assets[id] = rel;
            return;
          }
          if (rel.toLowerCase().endsWith(".psd")) {
            assets[id] = rel.replaceAll("\\", "/");
            return;
          }
          assets[id] = (await readToDataUrl(root, rel)) ?? rel.replaceAll("\\", "/");
        }),
      );
      return validateProject({
        schemaVersion: parsed.schemaVersion,
        meta: parsed.meta,
        templates,
        decks,
        blueprints,
        sets,
        assets,
        variables,
        fonts,
        print,
        boxes,
        rulebooks,
      });
    }
    if (parsed.templates && parsed.decks) {
      return validateProject(parsed);
    }
  }

  if (rootProject) {
    return validateProject(JSON.parse(rootProject) as unknown);
  }

  throw new Error("所选文件夹不是 TMD 工程（缺少 .ceditor 或 data/project.json）");
}
