/** 浏览器端：把 PSD 交给本地 Vite 中间件转成 PNG data URL（含 CMYK） */
export async function psdFileToPngDataUrl(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const res = await fetch("/__fs/psd-png", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: buf,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || "PSD 转换失败");
  }
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function isPsdFile(file: File | { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".psd") || file.type === "image/vnd.adobe.photoshop";
}
