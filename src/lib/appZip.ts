export const APP_ZIP = "/TMD-offline.zip";
export const APP_ZIP_MAC = "/TMD-offline-mac.zip";

export async function zipDownloadReady(url = APP_ZIP): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-3" }, cache: "no-store" });
    if (!res.ok) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } catch {
    return false;
  }
}
