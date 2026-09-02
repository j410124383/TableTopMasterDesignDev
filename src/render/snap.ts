import { SAFE_ZONE_MM } from "./layout";
import type { Layer, Template, ViewportPrefs } from "@/model/types";

function nearest(value: number, targets: number[], threshold: number): number {
  let best = value;
  let dist = threshold;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d < dist) {
      dist = d;
      best = t;
    }
  }
  return best;
}

export function snapLayer(
  layer: Pick<Layer, "x" | "y" | "w" | "h">,
  template: Template,
  others: Layer[],
  view: ViewportPrefs,
): { x: number; y: number } {
  if (!view.snap) return { x: layer.x, y: layer.y };
  const xs = [layer.x, layer.x + layer.w / 2, layer.x + layer.w];
  const ys = [layer.y, layer.y + layer.h / 2, layer.y + layer.h];
  const tx: number[] = [];
  const ty: number[] = [];
  if (view.snapCut) {
    tx.push(0, template.size.w);
    ty.push(0, template.size.h);
  }
  if (view.snapSafe) {
    tx.push(SAFE_ZONE_MM, template.size.w - SAFE_ZONE_MM);
    ty.push(SAFE_ZONE_MM, template.size.h - SAFE_ZONE_MM);
  }
  if (view.snapBleed) {
    tx.push(-template.bleedMm, template.size.w + template.bleedMm);
    ty.push(-template.bleedMm, template.size.h + template.bleedMm);
  }
  if (view.snapGrid) {
    const g = view.gridMm || 5;
    for (let v = -template.bleedMm; v <= template.size.w + template.bleedMm + 0.01; v += g) {
      tx.push(Number(v.toFixed(2)));
    }
    for (let v = -template.bleedMm; v <= template.size.h + template.bleedMm + 0.01; v += g) {
      ty.push(Number(v.toFixed(2)));
    }
  }
  if (view.snapCorners || view.snapCenters) {
    for (const o of others) {
      if (view.snapCorners) {
        tx.push(o.x, o.x + o.w);
        ty.push(o.y, o.y + o.h);
      }
      if (view.snapCenters) {
        tx.push(o.x + o.w / 2);
        ty.push(o.y + o.h / 2);
      }
    }
  }
  const threshold = 0.9;
  const nx = nearest(xs[0], tx, threshold);
  const ny = nearest(ys[0], ty, threshold);
  const ncx = nearest(xs[1], tx, threshold);
  const ncy = nearest(ys[1], ty, threshold);
  return {
    x: Math.abs(ncx - xs[1]) < Math.abs(nx - xs[0]) ? ncx - layer.w / 2 : nx,
    y: Math.abs(ncy - ys[1]) < Math.abs(ny - ys[0]) ? ncy - layer.h / 2 : ny,
  };
}
