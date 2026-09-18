import { contourSlabMesh, type BoxMesh } from "@/features/box/boxGeom";
import { loadBoxTexture } from "@/features/box/boxTexture";
import { boardPlaneMm, boardThicknessMm } from "@/model/board";
import type { BoardPiece } from "@/model/types";

const ALPHA = 16;
const MAX_SIDE = 96;

export type BoardCutout = {
  mesh: BoxMesh;
  hasAlpha: boolean;
  edgeRgb: [number, number, number];
  wMm: number;
  dMm: number;
  imgW: number;
  imgH: number;
};

function rdp(points: { x: number; z: number }[], eps: number): { x: number; z: number }[] {
  if (points.length < 3) return points;
  let maxD = 0;
  let idx = 0;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
    const d = Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [a, b];
  const left = rdp(points.slice(0, idx + 1), eps);
  const right = rdp(points.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

function sampleGrid(img: ImageData, gw: number, gh: number): { on: Uint8Array; hasAlpha: boolean; rgb: [number, number, number] } {
  const on = new Uint8Array(gw * gh);
  let hasAlpha = false;
  let rs = 0,
    gs = 0,
    bs = 0,
    n = 0;
  for (let y = 0; y < gh; y++) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) / gh) * img.height));
    for (let x = 0; x < gw; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) / gw) * img.width));
      const i = (sy * img.width + sx) * 4;
      const a = img.data[i + 3] ?? 0;
      if (a < 250) hasAlpha = true;
      if (a >= ALPHA) {
        on[y * gw + x] = 1;
        rs += img.data[i] ?? 0;
        gs += img.data[i + 1] ?? 0;
        bs += img.data[i + 2] ?? 0;
        n += 1;
      }
    }
  }
  const rgb: [number, number, number] = n
    ? [rs / n / 255, gs / n / 255, bs / n / 255]
    : [0.7, 0.68, 0.64];
  return { on, hasAlpha, rgb };
}

const DIRS: [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function traceOuter(on: Uint8Array, gw: number, gh: number): { x: number; y: number }[] {
  let sx = -1;
  let sy = -1;
  outer: for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!on[y * gw + x]) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === gw - 1 ||
        y === gh - 1 ||
        !on[y * gw + x - 1] ||
        !on[y * gw + x + 1] ||
        !on[(y - 1) * gw + x] ||
        !on[(y + 1) * gw + x];
      if (edge) {
        sx = x;
        sy = y;
        break outer;
      }
    }
  }
  if (sx < 0) return [];
  const ring: { x: number; y: number }[] = [];
  let x = sx;
  let y = sy;
  let dir = 0;
  for (let step = 0; step < gw * gh * 8; step++) {
    ring.push({ x, y });
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (dir + 6 + i) % 8;
      const nx = x + DIRS[d]![0];
      const ny = y + DIRS[d]![1];
      if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && on[ny * gw + nx]) {
        x = nx;
        y = ny;
        dir = d;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (step > 4 && x === sx && y === sy) break;
  }
  return ring;
}

function imageToData(img: HTMLImageElement | HTMLCanvasElement): ImageData {
  const c = document.createElement("canvas");
  c.width = Math.max(1, img instanceof HTMLCanvasElement ? img.width : img.naturalWidth);
  c.height = Math.max(1, img instanceof HTMLCanvasElement ? img.height : img.naturalHeight);
  const ctx = c.getContext("2d");
  if (!ctx) return new ImageData(1, 1);
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

export function probeBoardAlpha(img: HTMLImageElement | HTMLCanvasElement): { hasAlpha: boolean; w: number; h: number } {
  const data = imageToData(img);
  let hasAlpha = false;
  for (let i = 3; i < data.data.length; i += 4) {
    if ((data.data[i] ?? 255) < 250) {
      hasAlpha = true;
      break;
    }
  }
  return { hasAlpha, w: data.width, h: data.height };
}

export function cutoutFromImage(img: HTMLImageElement | HTMLCanvasElement, board: BoardPiece, contourMax = MAX_SIDE): BoardCutout {
  const data = imageToData(img);
  const imgW = Math.max(1, data.width);
  const imgH = Math.max(1, data.height);
  const { w: wMm, d: dMm } = boardPlaneMm(board, imgW, imgH);
  const tMm = boardThicknessMm(board);
  const scale = Math.max(imgW, imgH) > contourMax ? contourMax / Math.max(imgW, imgH) : 1;
  const gw = Math.max(8, Math.round(imgW * scale));
  const gh = Math.max(8, Math.round(imgH * scale));
  const { on, hasAlpha, rgb } = sampleGrid(data, gw, gh);
  let ringMm: { x: number; z: number }[];
  if (!hasAlpha) {
    ringMm = [
      { x: wMm / 2, z: -dMm / 2 },
      { x: wMm / 2, z: dMm / 2 },
      { x: -wMm / 2, z: dMm / 2 },
      { x: -wMm / 2, z: -dMm / 2 },
    ];
  } else {
    const px = traceOuter(on, gw, gh);
    const mapped = px.map((p) => ({
      x: ((p.x + 0.5) / gw - 0.5) * wMm,
      z: ((p.y + 0.5) / gh - 0.5) * dMm,
    }));
    const simplified = mapped.length > 8 ? rdp([...mapped, mapped[0]!], Math.max(0.35, Math.min(wMm, dMm) * 0.012)) : mapped;
    ringMm = simplified.slice();
    const first = ringMm[0];
    const last = ringMm[ringMm.length - 1];
    if (first && last && Math.hypot(first.x - last.x, first.z - last.z) < 0.01) ringMm.pop();
    if (ringMm.length < 3) {
      ringMm = [
        { x: wMm / 2, z: -dMm / 2 },
        { x: wMm / 2, z: dMm / 2 },
        { x: -wMm / 2, z: dMm / 2 },
        { x: -wMm / 2, z: -dMm / 2 },
      ];
    }
  }
  return {
    mesh: contourSlabMesh(ringMm, wMm, dMm, tMm),
    hasAlpha,
    edgeRgb: rgb,
    wMm,
    dMm,
    imgW,
    imgH,
  };
}

export async function loadBoardCutout(
  board: BoardPiece,
  src: string | undefined,
  projectDir?: string | null,
  opts?: { contourMax?: number },
): Promise<{ cutout: BoardCutout; image: HTMLImageElement | HTMLCanvasElement | null }> {
  if (!src) {
    const { w, d } = boardPlaneMm(board, 1, 1);
    return {
      cutout: {
        mesh: contourSlabMesh(
          [
            { x: w / 2, z: -d / 2 },
            { x: w / 2, z: d / 2 },
            { x: -w / 2, z: d / 2 },
            { x: -w / 2, z: -d / 2 },
          ],
          w,
          d,
          boardThicknessMm(board),
        ),
        hasAlpha: false,
        edgeRgb: [0.7, 0.68, 0.64],
        wMm: w,
        dMm: d,
        imgW: 1,
        imgH: 1,
      },
      image: null,
    };
  }
  const image = await loadBoxTexture(src, projectDir);
  return { cutout: cutoutFromImage(image, board, opts?.contourMax ?? MAX_SIDE), image };
}
