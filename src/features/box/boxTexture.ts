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
