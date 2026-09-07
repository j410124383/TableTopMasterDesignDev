import { absolutizeAssetSrc } from "@/lib/ingestAsset";

const cache = new Map<string, HTMLImageElement>();

function loadImageUrl(url: string): Promise<HTMLImageElement> {
  const hit = cache.get(url);
  if (hit?.complete && hit.naturalWidth > 0) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(url)) img.crossOrigin = "anonymous";
    img.onload = () => {
      cache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("贴图加载失败"));
    img.src = url;
  });
}

/** 包装盒贴图：支持 data / blob / __fs（含 PSD 服务端转 PNG）/ 工程相对路径 */
export async function loadBoxTexture(
  src: string,
  projectDir?: string | null,
): Promise<HTMLImageElement> {
  const url = absolutizeAssetSrc(src, projectDir ?? undefined);
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return loadImageUrl(url);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("贴图加载失败");
  const blob = await res.blob();
  const obj = URL.createObjectURL(blob);
  try {
    return await loadImageUrl(obj);
  } finally {
    URL.revokeObjectURL(obj);
  }
}

export function clearBoxTextureCache() {
  cache.clear();
}

export type TextureFitMode = "original" | "cover" | "tile";

/** 把贴图按壁纸铺法烘焙进 UV 0–1 的正方形画布 */
export function bakeTextureFit(
  img: HTMLImageElement | HTMLCanvasElement,
  fit: TextureFitMode = "cover",
  tileScale = 1,
): HTMLCanvasElement {
  const iw = "naturalWidth" in img ? img.naturalWidth : img.width;
  const ih = "naturalHeight" in img ? img.naturalHeight : img.height;
  const size = Math.max(256, Math.min(4096, Math.max(iw, ih, 1)));
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  if (!iw || !ih) return c;
  if (fit === "tile") {
    const tiles = Math.max(0.1, Math.min(16, tileScale || 1));
    const tileW = size / tiles;
    const tileH = tileW * (ih / iw);
    for (let y = 0; y < size + tileH; y += tileH) {
      for (let x = 0; x < size + tileW; x += tileW) {
        ctx.drawImage(img, x, y, tileW, tileH);
      }
    }
    return c;
  }
  const scale =
    fit === "original" ? Math.min(size / iw, size / ih) : Math.max(size / iw, size / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return c;
}

export async function loadFittedBoxTexture(
  src: string,
  projectDir: string | null | undefined,
  fit: TextureFitMode = "cover",
  tileScale = 1,
): Promise<HTMLCanvasElement> {
  const img = await loadBoxTexture(src, projectDir);
  return bakeTextureFit(img, fit, tileScale);
}
