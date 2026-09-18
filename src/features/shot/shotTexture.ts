import { mmToPx } from "@/lib/mm";
import type { Blueprint } from "@/model/types";

export type ExportTextureQuality = "standard" | "max";

export function exportTextureOf(v?: ExportTextureQuality): ExportTextureQuality {
  return v === "standard" ? "standard" : "max";
}

export function exportCardDpi(quality: ExportTextureQuality): number {
  return quality === "standard" ? 150 : 300;
}

export function capCardDpi(bp: Pick<Blueprint, "size">, dpi: number): number {
  const px = Math.max(mmToPx(bp.size.w, dpi), mmToPx(bp.size.h, dpi));
  if (px <= 4096) return dpi;
  return Math.max(72, dpi * (4096 / px));
}

export function exportBoardContour(quality: ExportTextureQuality): number {
  return quality === "max" ? 512 : 256;
}
