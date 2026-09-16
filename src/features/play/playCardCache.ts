import type { Project, Template } from "@/model/types";
import { templateFingerprint } from "@/render/cardCache";
import { renderCardToCanvas } from "@/render/drawCard";

export const PLAY_CARD_DPI = 180;

function hashKey(raw: string): string {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 ^= c + i;
    h2 = Math.imul(h2, 2246822519);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function playCardCacheKey(
  template: Template,
  face: string,
  fields: Record<string, string>,
  cropBleed = true,
): string {
  const raw = `${templateFingerprint(template)}|${face}|${cropBleed ? 1 : 0}|${JSON.stringify(fields)}`;
  return hashKey(raw);
}

export function playCardUrl(hash: string): string {
  return `/__play/card/${hash}.png`;
}

export function playCardSrc(
  template: Template | null | undefined,
  face: string,
  fields: Record<string, string>,
): string | null {
  if (!template) return null;
  return playCardUrl(playCardCacheKey(template, face, fields, true));
}

async function cacheExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensurePlayCardOnServer(
  hash: string,
  render: () => Promise<HTMLCanvasElement>,
): Promise<string> {
  const url = playCardUrl(hash);
  if (await cacheExists(url)) return url;
  const canvas = await render();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png blob"))), "image/png");
  });
  const res = await fetch(url, { method: "PUT", body: blob, headers: { "content-type": "image/png" } });
  if (!res.ok) throw new Error(`play card cache put ${res.status}`);
  return url;
}

export type PlayCardPiece = { setId: string; card: { id: string; fields: Record<string, string> }; face: string };

export type ResolveTpl = (piece: PlayCardPiece, forceFace?: "front" | "back") => Template | null | undefined;

function cardContentKey(piece: { setId: string; card: { id: string; fields: Record<string, string> } }): string {
  return `${piece.setId}|${piece.card.id}|${JSON.stringify(piece.card.fields)}`;
}

/** 主机：按卡牌内容去重，预渲染正/背面 PNG 写入联机缓存目录。 */
export async function warmPlayCardCache(
  pieces: Array<{ setId: string; card: { id: string; fields: Record<string, string> }; face: string; id: string }>,
  project: Project,
  resolveTpl: ResolveTpl,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const jobs = new Map<string, () => Promise<HTMLCanvasElement>>();
  const seenCards = new Set<string>();

  for (const piece of pieces) {
    const ck = cardContentKey(piece);
    if (seenCards.has(ck)) continue;
    seenCards.add(ck);
    for (const face of ["front", "back"] as const) {
      const tpl = resolveTpl(piece, face);
      if (!tpl) continue;
      const hash = playCardCacheKey(tpl, face, piece.card.fields, true);
      if (jobs.has(hash)) continue;
      jobs.set(hash, () =>
        renderCardToCanvas(tpl, {
          dpi: PLAY_CARD_DPI,
          fields: piece.card.fields,
          assets: project.assets,
          project,
          cropBleed: true,
          honorVisibleWhen: true,
        }),
      );
    }
  }

  const batch = 6;
  const entries = [...jobs.entries()];
  const total = entries.length;
  onProgress?.(0, total);
  let done = 0;
  for (let i = 0; i < entries.length; i += batch) {
    const slice = entries.slice(i, i + batch);
    await Promise.all(
      slice.map(async ([hash, render]) => {
        await ensurePlayCardOnServer(hash, render);
        done += 1;
        onProgress?.(done, total);
      }),
    );
  }
}

export function withPlayThumbUrls<T extends { setId: string; card: { id: string; fields: Record<string, string> }; face: string; id: string; thumbUrl?: string }>(
  pieces: T[],
  resolveTpl: ResolveTpl,
): T[] {
  return pieces.map((p) => {
    const tpl = resolveTpl(p);
    const url = tpl ? playCardSrc(tpl, p.face, p.card.fields) : null;
    return url ? { ...p, thumbUrl: url } : p;
  });
}
