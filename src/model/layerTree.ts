import { layerIsVisible } from "./visibleWhen";
import type { Layer } from "./types";

export function absBox(layers: Layer[], layer: Layer): { x: number; y: number; w: number; h: number } {
  let x = layer.x;
  let y = layer.y;
  const seen = new Set<string>([layer.id]);
  let pid = layer.parentId;
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const parent = layers.find((l) => l.id === pid);
    if (!parent) break;
    x += parent.x;
    y += parent.y;
    pid = parent.parentId;
  }
  return { x, y, w: layer.w, h: layer.h };
}

export function toRelative(
  layers: Layer[],
  layer: Layer,
  absX: number,
  absY: number,
): { x: number; y: number } {
  if (!layer.parentId) return { x: absX, y: absY };
  const parent = layers.find((l) => l.id === layer.parentId);
  if (!parent) return { x: absX, y: absY };
  const p = absBox(layers, parent);
  return { x: absX - p.x, y: absY - p.y };
}

export function childrenOf(layers: Layer[], parentId: string | undefined): Layer[] {
  return layers.filter((l) => (l.parentId ?? "") === (parentId ?? ""));
}

export function descendantIds(layers: Layer[], id: string): string[] {
  const ids: string[] = [];
  for (const child of childrenOf(layers, id)) {
    ids.push(child.id, ...descendantIds(layers, child.id));
  }
  return ids;
}

export function subtreeIds(layers: Layer[], id: string): string[] {
  return [id, ...descendantIds(layers, id)];
}

export function layerDepth(layers: Layer[], layer: Layer): number {
  let d = 0;
  const seen = new Set<string>();
  let pid = layer.parentId;
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    d += 1;
    pid = layers.find((l) => l.id === pid)?.parentId;
  }
  return d;
}

export function layerDrawn(
  layers: Layer[],
  layer: Layer,
  fields: Record<string, string> | undefined,
  honorWhen = true,
): boolean {
  if (!layerIsVisible(layer, fields, honorWhen)) return false;
  const seen = new Set<string>([layer.id]);
  let pid = layer.parentId;
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const parent = layers.find((l) => l.id === pid);
    if (!parent) break;
    if (!layerIsVisible(parent, fields, honorWhen)) return false;
    pid = parent.parentId;
  }
  return true;
}

/** 按图层列表顺序输出根→子，便于树状显示且保持绘制序中的兄弟顺序 */
export function walkLayerTree(layers: Layer[]): { layer: Layer; depth: number }[] {
  const out: { layer: Layer; depth: number }[] = [];
  const visit = (parentId: string | undefined, depth: number) => {
    for (const layer of childrenOf(layers, parentId)) {
      out.push({ layer, depth });
      visit(layer.id, depth + 1);
    }
  };
  visit(undefined, 0);
  const hanging = layers.filter((l) => l.parentId && !layers.some((p) => p.id === l.parentId));
  for (const layer of hanging) out.push({ layer, depth: 0 });
  return out;
}

export function extractSubtree(layers: Layer[], id: string): Layer[] {
  const ids = new Set(subtreeIds(layers, id));
  return layers.filter((l) => ids.has(l.id));
}

export function removeSubtree(layers: Layer[], id: string): Layer[] {
  const ids = new Set(subtreeIds(layers, id));
  return layers.filter((l) => !ids.has(l.id));
}

export function insertSubtree(layers: Layer[], block: Layer[], at: number): Layer[] {
  const next = [...layers];
  next.splice(Math.max(0, Math.min(at, next.length)), 0, ...block);
  return next;
}
