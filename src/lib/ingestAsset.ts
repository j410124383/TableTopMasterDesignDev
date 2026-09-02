import { uid } from "@/lib/id";
import { isPsdFile } from "@/lib/psd";
import { writeDiskBytes } from "@/persist/nodeFs";
import { readFileAsDataUrl } from "@/persist/storage";

function looksFull(path: string): boolean {
  const t = path.trim();
  return /^[A-Za-z]:[\\/]/.test(t) || (t.startsWith("\\\\") && t.length > 3);
}

function joinDisk(dir: string, rel: string): string {
  const base = dir.replace(/[\\/]+$/, "");
  const rest = rel.replaceAll("/", "\\");
  return `${base}\\${rest}`;
}

function extOf(file: File): string {
  if (isPsdFile(file)) return ".psd";
  const fromName = file.name.match(/(\.[a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName && fromName !== ".bin") return fromName;
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "image/svg+xml") return ".svg";
  if (file.type === "image/gif") return ".gif";
  return ".png";
}

function safeStem(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim();
  const cleaned = base.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
  return cleaned || uid("img");
}

function bytesToBase64(buf: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    const slice = buf.subarray(i, i + chunk);
    for (let j = 0; j < slice.length; j++) binary += String.fromCharCode(slice[j]!);
  }
  return btoa(binary);
}

function findExistingAsset(
  assets: Record<string, string> | undefined,
  stem: string,
  ext: string,
): { id: string; src: string; rel: string } | null {
  if (!assets) return null;
  const fileName = `${stem}${ext}`.toLowerCase();
  for (const [id, src] of Object.entries(assets)) {
    const norm = src.replaceAll("\\", "/");
    const idNorm = id.replaceAll("\\", "/");
    if (
      idNorm === stem ||
      idNorm.endsWith(`/${stem}`) ||
      norm.toLowerCase().endsWith(`/${fileName}`) ||
      norm.toLowerCase().endsWith(fileName)
    ) {
      const rel = norm.startsWith("assets/")
        ? norm
        : src.startsWith("/__fs/file")
          ? (() => {
              try {
                const p = new URL(src, "http://local").searchParams.get("p") ?? "";
                const marker = "/assets/";
                const at = p.replaceAll("\\", "/").toLowerCase().lastIndexOf(marker);
                return at >= 0 ? p.replaceAll("\\", "/").slice(at + 1) : `assets/images/${stem}${ext}`;
              } catch {
                return `assets/images/${stem}${ext}`;
              }
            })()
          : `assets/images/${stem}${ext}`;
      return { id, src, rel };
    }
  }
  return null;
}

function withCacheBust(url: string): string {
  const t = String(Date.now());
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const u = new URL(url, "http://local");
    u.searchParams.set("t", t);
    if (url.startsWith("/")) return `${u.pathname}${u.search}`;
    if (/^https?:/i.test(url)) return u.toString();
  } catch {
    /* ignore */
  }
  return `${url}${url.includes("?") ? "&" : "?"}t=${t}`;
}

export function assetDiskPath(src: string, projectDir?: string | null): string | null {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return null;
  try {
    if (src.includes("/__fs/file")) {
      const u = new URL(src, "http://local");
      const p = u.searchParams.get("p") ?? "";
      return looksFull(p) ? p : null;
    }
  } catch {
    /* ignore */
  }
  const rel = src.split("?")[0] ?? src;
  if (projectDir && looksFull(projectDir) && (rel.startsWith("assets/") || rel.startsWith("data/"))) {
    return joinDisk(projectDir, rel);
  }
  if (looksFull(rel)) return rel;
  return null;
}

export function displayAssetPath(src: string, projectDir?: string | null): string {
  return assetDiskPath(src, projectDir) ?? (src.startsWith("data:") ? "(内嵌数据，无磁盘路径)" : src);
}

/** 按已有路径从磁盘再读，写回同一 id 并刷新缓存。 */
export async function refreshAssetsFromDisk(
  assets: Record<string, string>,
  projectDir: string | null | undefined,
): Promise<{ assets: Record<string, string>; ok: number; skipped: number; missing: string[] }> {
  const { diskExists } = await import("@/persist/nodeFs");
  const next: Record<string, string> = { ...assets };
  let ok = 0;
  let skipped = 0;
  const missing: string[] = [];
  for (const [id, src] of Object.entries(assets)) {
    const disk = assetDiskPath(src, projectDir);
    if (!disk) {
      skipped += 1;
      continue;
    }
    const exists = await diskExists(disk);
    if (!exists) {
      missing.push(id);
      continue;
    }
    const rel = src.replaceAll("\\", "/").startsWith("assets/") || src.replaceAll("\\", "/").startsWith("data/")
      ? src.split("?")[0]!
      : src;
    next[id] = withCacheBust(absolutizeAssetSrc(rel.startsWith("assets/") || rel.startsWith("data/") ? rel : `/__fs/file?p=${encodeURIComponent(disk)}`, projectDir));
    ok += 1;
  }
  if (ok) {
    const { invalidateCardCache } = await import("@/render/cardCache");
    const { clearBoxTextureCache } = await import("@/features/box/boxTexture");
    invalidateCardCache();
    clearBoxTextureCache();
  }
  return { assets: next, ok, skipped, missing };
}

async function writeAssetFile(
  file: File,
  projectDir: string | null | undefined,
  id: string,
  rel: string,
): Promise<{ id: string; src: string; rel: string }> {
  const path = rel.replaceAll("\\", "/");
  if (projectDir && looksFull(projectDir)) {
    const full = joinDisk(projectDir, path);
    const buf = new Uint8Array(await file.arrayBuffer());
    await writeDiskBytes(full, bytesToBase64(buf));
    const { invalidateCardCache } = await import("@/render/cardCache");
    const { clearBoxTextureCache } = await import("@/features/box/boxTexture");
    invalidateCardCache();
    clearBoxTextureCache();
    return { id, src: withCacheBust(`/__fs/file?p=${encodeURIComponent(full)}`), rel: path };
  }
  if (isPsdFile(file)) {
    throw new Error("导入 PSD 需要已绑定的本机工程文件夹（将保存为 .psd 引用，不生成预览 PNG）。");
  }
  const { invalidateCardCache } = await import("@/render/cardCache");
  const { clearBoxTextureCache } = await import("@/features/box/boxTexture");
  invalidateCardCache();
  clearBoxTextureCache();
  return { id, src: await readFileAsDataUrl(file), rel: path };
}

/** 把本地图写入工程 assets/images。同名已有资源则覆盖字节并保持 id。 */
export async function ingestImageFile(
  file: File,
  projectDir: string | null | undefined,
  existingAssets?: Record<string, string>,
  opts?: { replaceId?: string },
): Promise<{ id: string; src: string; rel: string }> {
  const ext = extOf(file);
  const stem = safeStem(file.name);
  if (opts?.replaceId && existingAssets?.[opts.replaceId] != null) {
    const src = existingAssets[opts.replaceId]!;
    const reused = findExistingAsset({ [opts.replaceId]: src }, stem, ext);
    const rel =
      reused?.rel ??
      (src.startsWith("assets/") ? src : `assets/images/${opts.replaceId}${ext}`);
    return writeAssetFile(file, projectDir, opts.replaceId, rel);
  }
  const reused = findExistingAsset(existingAssets, stem, ext);
  if (reused) {
    return writeAssetFile(file, projectDir, reused.id, reused.rel);
  }
  return writeAssetFile(file, projectDir, stem, `assets/images/${stem}${ext}`);
}

/** PSD 解码版本：改算法时递增，避免浏览器/内存里留着旧的全透明图 */
const PSD_DECODE_VER = "a2";

function withPsdBust(url: string): string {
  if (!/\.psd(?:$|&)/i.test(url) && !/[?&]p=.*\.psd/i.test(url)) return url;
  if (url.includes(`v=${PSD_DECODE_VER}`)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${PSD_DECODE_VER}`;
}

/** 相对路径 → /__fs/file，便于 FSA 读入后仍能显示 PSD */
export function absolutizeAssetSrc(src: string, projectDir: string | null | undefined): string {
  if (!src || !projectDir || !looksFull(projectDir)) return withPsdBust(src);
  if (
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    src.startsWith("/__fs/") ||
    /^https?:/i.test(src)
  ) {
    return withPsdBust(src);
  }
  if (src.startsWith("assets/") || src.startsWith("data/")) {
    return withPsdBust(`/__fs/file?p=${encodeURIComponent(joinDisk(projectDir, src))}`);
  }
  return withPsdBust(src);
}

export function absolutizeAssets(
  assets: Record<string, string>,
  projectDir: string | null | undefined,
): Record<string, string> {
  if (!projectDir || !looksFull(projectDir)) return assets;
  const out: Record<string, string> = {};
  for (const [id, src] of Object.entries(assets)) {
    out[id] = absolutizeAssetSrc(src, projectDir);
  }
  return out;
}
