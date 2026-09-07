import type { Blueprint, CardSet } from "./types";

export const CARD_STOCK_MM = 0.32;

export function cardStockMm(bp: Blueprint | undefined): number {
  if (!bp) return CARD_STOCK_MM;
  if (bp.kind === "board") {
    const t = Number(bp.thicknessMm);
    return Number.isFinite(t) && t >= 0 ? t : 2;
  }
  const t = Number(bp.thicknessMm);
  return Number.isFinite(t) && t > 0 ? t : CARD_STOCK_MM;
}

export function cardCore(bp: Blueprint | undefined): "white" | "black" {
  return bp?.core === "black" ? "black" : "white";
}

export function cardCoreRgb(bp: Blueprint | undefined): [number, number, number] {
  return cardCore(bp) === "black" ? [0.22, 0.22, 0.22] : [0.84, 0.82, 0.78];
}

export function setCardCount(set: CardSet | undefined): number {
  if (!set) return 1;
  const n = set.cards.reduce((sum, c) => sum + Math.max(0, Number(c.qty) || 0), 0);
  return Math.max(1, n);
}

export function stackHeightMm(bp: Blueprint | undefined, set: CardSet | undefined): number {
  return setCardCount(set) * cardStockMm(bp);
}
