import { uid } from "@/lib/id";
import type { BoardPiece } from "./types";

export function createBoardPiece(name = "板件", textureAssetId = ""): BoardPiece {
  return {
    id: uid("brd"),
    name,
    textureAssetId,
    thicknessMm: 2,
    longestMm: 40,
  };
}

export function boardLongestMm(board: BoardPiece): number {
  const n = Number(board.longestMm);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

export function boardThicknessMm(board: BoardPiece): number {
  const n = Number(board.thicknessMm);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

export function boardPlaneMm(board: BoardPiece, imgW: number, imgH: number): { w: number; d: number } {
  const longest = boardLongestMm(board);
  const wPx = Math.max(1, imgW);
  const hPx = Math.max(1, imgH);
  if (wPx >= hPx) return { w: longest, d: longest * (hPx / wPx) };
  return { w: longest * (wPx / hPx), d: longest };
}
