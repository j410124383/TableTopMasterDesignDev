import type { PaperId, SizeMm } from "./types";

export type CardSizePreset = {
  id: string;
  name: string;
  w: number;
  h: number;
};

export const CARD_SIZE_PRESETS: CardSizePreset[] = [
  { id: "poker", name: "Poker / 集换式", w: 63.5, h: 88.9 },
  { id: "bridge", name: "Bridge", w: 57, h: 88.9 },
  { id: "mini", name: "Mini", w: 44.4, h: 63.5 },
  { id: "custom", name: "自定义", w: 63.5, h: 88.9 },
];

export const DEFAULT_CARD_SIZE: SizeMm = { w: 63.5, h: 88.9 };

export const PAPER_SIZES_MM: Record<Exclude<PaperId, "custom">, SizeMm> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
  legal: { w: 215.9, h: 355.6 },
  tabloid: { w: 279.4, h: 431.8 },
};

export const FONT_PRESETS = [
  "Microsoft YaHei, sans-serif",
  "SimSun, serif",
  "Noto Sans SC, sans-serif",
  "Georgia, serif",
  "Arial, sans-serif",
  "Times New Roman, serif",
];

export function presetBySize(size: SizeMm): string {
  const found = CARD_SIZE_PRESETS.find(
    (p) => p.id !== "custom" && p.w === size.w && p.h === size.h,
  );
  return found?.id ?? "custom";
}

export function paperSizeMm(
  paper: PaperId,
  orientation: "portrait" | "landscape",
  custom?: SizeMm,
): SizeMm {
  const base =
    paper === "custom"
      ? { w: custom?.w || 210, h: custom?.h || 297 }
      : PAPER_SIZES_MM[paper];
  if (orientation === "landscape") return { w: base.h, h: base.w };
  return base;
}
