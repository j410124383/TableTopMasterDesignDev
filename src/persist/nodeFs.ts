import type { Project } from "@/model/types";

export const PATH_LOST = "本地路径丢失或文件夹已不存在。请重新链接本机文件夹。";

function looksFull(path: string): boolean {
  const t = path.trim();
  return /^[A-Za-z]:[\\/]/.test(t) || (t.startsWith("\\\\") && t.length > 3);
}

export function folderNameOf(path: string): string {
  const parts = path.trim().replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 204) return { ok: true, status: 204, data: null };
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function pickLocalFolder(): Promise<string | null | undefined> {
  const res = await post<{ path?: string }>("/__fs/pick", {});
  if (res.status === 204) return undefined;
  if (!res.ok) return null;
  const path = res.data?.path?.trim() ?? "";
  return looksFull(path) ? path.replace(/[\\/]+$/, "") : null;
}

export async function diskExists(path: string): Promise<boolean | null> {
  if (!looksFull(path)) return false;
  const res = await post<{ ok?: boolean }>("/__fs/exists", { path });
  if (!res.ok) return null;
  return Boolean(res.data?.ok);
}

export async function diskMkdir(path: string): Promise<void> {
  const res = await post("/__fs/mkdir", { path });
  if (!res.ok) throw new Error("无法在本机创建文件夹。请确认工坊是在这台电脑上启动的。");
}

export async function diskList(path: string): Promise<{ files: string[]; dirs: string[] } | null> {
  const res = await post<{ files?: string[]; dirs?: string[] }>("/__fs/list", { path });
  if (!res.ok || !res.data) return null;
  return { files: res.data.files ?? [], dirs: res.data.dirs ?? [] };
}

export async function writeProjectToDisk(dir: string, project: Project): Promise<void> {
  const res = await post("/__fs/write-project", { path: dir, project });
  if (!res.ok) throw new Error("无法写入本机文件夹。请重新选择保存位置。");
}

/** 写入任意二进制到本机路径（base64），返回可显示的 /__fs/file URL */
export async function writeDiskBytes(fullPath: string, base64: string): Promise<string> {
  const res = await post<{ ok?: boolean; url?: string }>("/__fs/write-file", {
    path: fullPath,
    base64,
  });
  if (!res.ok || !res.data?.url) throw new Error("无法写入资源文件到工程目录。");
  return res.data.url;
}

export async function readProjectFromDisk(dir: string): Promise<Project | null> {
  const res = await post<{ project?: Project }>("/__fs/read-project", { path: dir });
  if (!res.ok) return null;
  return res.data?.project ?? null;
}

