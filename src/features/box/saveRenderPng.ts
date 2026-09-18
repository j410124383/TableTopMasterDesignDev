import { writeDiskBytes, diskMkdir } from "@/persist/nodeFs";
import { looksLikeFullPath, revealInExplorer } from "@/persist/storage";

function joinDisk(dir: string, rel: string) {
  return `${dir.replace(/[\\/]+$/, "")}\\${rel.replaceAll("/", "\\")}`;
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function safeRenderName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "渲染图";
}

function bytesToBase64(buf: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    const slice = buf.subarray(i, i + chunk);
    for (let j = 0; j < slice.length; j++) binary += String.fromCharCode(slice[j]!);
  }
  return btoa(binary);
}

export async function saveRenderPng(
  canvas: HTMLCanvasElement,
  name: string,
  currentPath: string | null | undefined,
): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("无法导出 PNG"))), "image/png");
  });
  const fileName = `${safeRenderName(name)}_${stamp()}.png`;
  if (currentPath && looksLikeFullPath(currentPath)) {
    const full = joinDisk(currentPath, `渲染图/${fileName}`);
    const buf = new Uint8Array(await blob.arrayBuffer());
    await writeDiskBytes(full, bytesToBase64(buf));
    return `已保存到 ${full}`;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
  return "未绑定本机工程文件夹，已下载渲染图。绑定文件夹后会写入「渲染图」子目录。";
}

export async function writePngRel(
  canvas: HTMLCanvasElement,
  currentPath: string,
  rel: string,
): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("无法导出 PNG"))), "image/png");
  });
  const full = joinDisk(currentPath, rel);
  const buf = new Uint8Array(await blob.arrayBuffer());
  await writeDiskBytes(full, bytesToBase64(buf));
  return full;
}

export async function writeTextRel(currentPath: string, rel: string, text: string): Promise<string> {
  const full = joinDisk(currentPath, rel);
  const bytes = new TextEncoder().encode(text);
  await writeDiskBytes(full, bytesToBase64(bytes));
  return full;
}

export async function openRenderFolder(currentPath: string | null | undefined): Promise<string> {
  if (!currentPath || !looksLikeFullPath(currentPath)) {
    return "未绑定本机工程文件夹，无法打开「渲染图」。";
  }
  const dir = joinDisk(currentPath, "渲染图");
  await diskMkdir(dir);
  const ok = await revealInExplorer(dir);
  return ok ? `已打开 ${dir}` : "无法打开资源管理器。";
}

export async function openSequenceFolder(currentPath: string | null | undefined): Promise<string> {
  if (!currentPath || !looksLikeFullPath(currentPath)) {
    return "未绑定本机工程文件夹，无法打开「序列帧」。";
  }
  const dir = joinDisk(currentPath, "序列帧");
  await diskMkdir(dir);
  const ok = await revealInExplorer(dir);
  return ok ? `已打开 ${dir}` : "无法打开资源管理器。";
}

export async function openExportModelFolder(currentPath: string | null | undefined): Promise<string> {
  if (!currentPath || !looksLikeFullPath(currentPath)) {
    return "未绑定本机工程文件夹，无法打开「导出模型」。";
  }
  const dir = joinDisk(currentPath, "导出模型");
  await diskMkdir(dir);
  const ok = await revealInExplorer(dir);
  return ok ? `已打开 ${dir}` : "无法打开资源管理器。";
}