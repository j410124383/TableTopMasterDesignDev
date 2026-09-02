import type { Project, Template } from "@/model/types";
import { clearImageCache, renderCardToCanvas } from "./drawCard";

const cache = new Map<string, string>();

export function templateFingerprint(template: Template): string {
  const raw = JSON.stringify({
    s: template.size,
    b: template.bleedMm,
    r: template.cornerRadiusMm,
    l: template.layers,
  });
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function invalidateCardCache() {
  cache.clear();
  clearImageCache();
}

export function cardCacheKey(
  templateId: string,
  face: string,
  cardId: string,
  fields: Record<string, string>,
  extra = "",
) {
  return `${templateId}|${face}|${cardId}|${JSON.stringify(fields)}|${extra}`;
}

export async function renderCardCached(
  template: Template,
  project: Project,
  fields: Record<string, string>,
  dpi: number,
  key: string,
  extra?: { cardIndex?: number; total?: number; cropBleed?: boolean; honorVisibleWhen?: boolean },
): Promise<string> {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = await renderCardToCanvas(template, {
    dpi,
    fields,
    assets: project.assets,
    project,
    cardIndex: extra?.cardIndex,
    total: extra?.total,
    cropBleed: extra?.cropBleed,
    honorVisibleWhen: extra?.honorVisibleWhen,
  });
  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  if (cache.size > 200) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  return url;
}
