import { writeDiskBytes } from "@/persist/nodeFs";
import { looksLikeFullPath } from "@/persist/storage";

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