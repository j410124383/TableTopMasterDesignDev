import { matIdentity, matMul, matRotateXYZ, matTranslate, type Mat4 } from "@/features/box/boxGeom";
import { cardStockMm } from "@/model/piece";
import type { Blueprint, CardSet, ShotStackLook, ShotStackShape } from "@/model/types";

export const STACK_CARD_CAP = 48;
/** 一字 / 扇形抬层用，避免共面。错落按纸厚叠，不把单张挤厚。 */
const MIN_LAYER_MM = 1.2;

export type StackCard = { id: string; fields: Record<string, string> };
type Vec3 = [number, number, number];

export function expandSetCards(set: CardSet | undefined): StackCard[] {
  if (!set) return [{ id: "ph", fields: {} }];
  const out: StackCard[] = [];
  for (const card of set.cards) {
    const qty = Math.max(0, Number(card.qty) || 0);
    for (let i = 0; i < qty; i++) out.push({ id: card.id, fields: card.fields });
  }
  if (out.length) return out;
  const first = set.cards[0];
  return [{ id: first?.id ?? "ph", fields: first?.fields ?? {} }];
}

export function stackSlice(set: CardSet | undefined, look?: ShotStackLook): StackCard[] {
  const all = expandSetCards(set);
  const n = Math.max(1, all.length);
  let from = look?.countFrom;
  let to = look?.countTo;
  if (from == null || !Number.isFinite(from)) from = 1;
  if (to == null || !Number.isFinite(to)) to = n;
  from = Math.round(from);
  to = Math.round(to);
  if (from > to) {
    const t = from;
    from = to;
    to = t;
  }
  from = Math.max(1, Math.min(n, from));
  to = Math.max(1, Math.min(n, to));
  return all.slice(from - 1, to);
}

export function stackShapeOf(look?: ShotStackLook): ShotStackShape {
  const s = look?.shape;
  return s === "messy" || s === "row" || s === "fan" ? s : "deck";
}

export function stackDrawCards(set: CardSet | undefined, look?: ShotStackLook): StackCard[] {
  const slice = stackSlice(set, look);
  return stackShapeOf(look) === "deck" ? slice : slice.slice(0, STACK_CARD_CAP);
}

/** 单张网格厚度 = 蓝图纸厚。错落不得把卡牌挤成厚板。 */
export function stackMeshThickMm(bp: Blueprint | undefined): number {
  return Math.max(0.12, cardStockMm(bp));
}

/** 层距：错落 / 牌组按纸厚，总高与牌组一致；一字 / 扇形略抬以免共面。 */
export function stackLayerPitchMm(bp: Blueprint | undefined, look?: ShotStackLook): number {
  const paper = stackMeshThickMm(bp);
  const shape = stackShapeOf(look);
  if (shape === "row" || shape === "fan") return Math.max(paper, MIN_LAYER_MM);
  return paper;
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function signedUnit(seed: string, salt: number): number {
  const h = hash32(`${seed}:${salt}`);
  return (h % 2000) / 1000 - 1;
}

function deg(n: number) {
  return (n * Math.PI) / 180;
}

function xform(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

function origin(m: Mat4): Vec3 {
  return [m[12]!, m[13]!, m[14]!];
}

function matRotateAxis(x: number, y: number, z: number, a: number): Mat4 {
  const len = Math.hypot(x, y, z) || 1;
  x /= len;
  y /= len;
  z /= len;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  const m = matIdentity();
  m[0] = t * x * x + c;
  m[1] = t * x * y + s * z;
  m[2] = t * x * z - s * y;
  m[4] = t * x * y - s * z;
  m[5] = t * y * y + c;
  m[6] = t * y * z + s * x;
  m[8] = t * x * z + s * y;
  m[9] = t * y * z - s * x;
  m[10] = t * z * z + c;
  return m;
}

export function fanInnerDefault(bp: Blueprint): number {
  return Math.max(16, bp.size.w * 0.6);
}

export function fanOuterDefault(bp: Blueprint): number {
  return Math.max(fanInnerDefault(bp) + 48, bp.size.h * 2.8);
}

export function fanResolved(bp: Blueprint, look?: ShotStackLook, count = 1): { inner: number; outer: number } {
  const inner0 = fanInnerDefault(bp);
  const outer0 = fanOuterDefault(bp);
  const gap = look?.gapMm == null ? 4 : look.gapMm;
  const extra = Math.max(0, count - 1) * gap;
  let inner = inner0;
  let outer = outer0;
  if (look?.fanInnerMm != null || look?.fanOuterMm != null) {
    inner = Math.max(4, look.fanInnerMm ?? inner0);
    outer = Math.max(inner + 8, look.fanOuterMm ?? outer0);
  } else if (look?.fanDeg != null && Number.isFinite(look.fanDeg)) {
    const th = Math.max(0.12, Math.min(2.8, (look.fanDeg * Math.PI) / 180));
    const rin = Math.max(22, bp.size.w * 0.55);
    inner = Math.max(4, 2 * rin * Math.sin(th / 2));
    outer = Math.max(inner0 + 8, (rin + bp.size.h) * th);
  }
  return { inner, outer: Math.max(inner + 8, outer + extra) };
}

function fanSpanRad(innerW: number, outerArc: number, cardH: number): { theta: number; rin: number } {
  const h = Math.max(8, cardH);
  const inner = Math.max(4, innerW);
  const outer = Math.max(inner + 8, outerArc);
  let th = Math.max(0.08, Math.min(2.85, (outer - inner) / h));
  for (let i = 0; i < 10; i++) {
    const s = Math.sin(th / 2);
    const rin = s < 1e-5 ? inner / th : inner / (2 * s);
    const f = (rin + h) * th - outer;
    const ds = 0.5 * Math.cos(th / 2);
    const drin = s < 1e-5 ? -inner / (th * th) : (-inner * ds) / (2 * s * s);
    const df = rin + h + drin * th;
    th = Math.max(0.08, Math.min(2.9, th - f / (df || 1)));
  }
  const s = Math.sin(th / 2);
  const rin = s < 1e-5 ? inner / th : inner / (2 * s);
  return { theta: th, rin: Math.max(4, rin) };
}

export function faceFlipMat(): Mat4 {
  return matMul(matRotateXYZ(0, Math.PI, 0), matRotateXYZ(Math.PI, 0, 0));
}

export function itemFaceDown(item: { face?: "front" | "back"; kind?: string; stack?: ShotStackLook }): boolean {
  if (item.face === "back") return true;
  if (item.face === "front") return false;
  return item.kind === "stack" && item.stack?.fanDir === "down";
}

function flattenToTable(mats: Mat4[]): Mat4[] {
  if (mats.length < 2) return mats;
  const c0 = origin(mats[0]!);
  const c1 = origin(mats[mats.length - 1]!);
  const dx = c1[0] - c0[0];
  const dy = c1[1] - c0[1];
  const dz = c1[2] - c0[2];
  const horiz = Math.hypot(dx, dz);
  if (horiz < 0.5 && Math.abs(dy) < 0.05) return mats;
  const angle = -Math.atan2(dy, Math.max(horiz, 1e-4));
  if (Math.abs(angle) < 1e-4) return mats;
  const ax = -dz;
  const az = dx;
  const alen = Math.hypot(ax, az);
  const R = alen < 1e-4 ? matRotateXYZ(0, 0, angle) : matRotateAxis(ax / alen, 0, az / alen, angle);
  const px = (c0[0] + c1[0]) / 2;
  const py = (c0[1] + c1[1]) / 2;
  const pz = (c0[2] + c1[2]) / 2;
  const T = matMul(matTranslate(px, py, pz), matMul(R, matTranslate(-px, -py, -pz)));
  return mats.map((m) => matMul(T, m));
}

function centerPoses(mats: Mat4[]): Mat4[] {
  if (!mats.length) return mats;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const m of mats) {
    cx += m[12]!;
    cy += m[13]!;
    cz += m[14]!;
  }
  const n = mats.length;
  const shift = matTranslate(-cx / n, -cy / n, -cz / n);
  return mats.map((m) => matMul(shift, m));
}

function minCornerY(mats: Mat4[], bp: Blueprint, thick: number): number {
  const hw = bp.size.w / 2;
  const hh = bp.size.h / 2;
  const ht = thick / 2;
  let minY = Infinity;
  for (const m of mats) {
    for (const sx of [-1, 1] as const) {
      for (const sy of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          const p = xform(m, [sx * hw, sy * ht, sz * hh]);
          if (p[1] < minY) minY = p[1];
        }
      }
    }
  }
  return minY;
}

function rawPoses(itemId: string, count: number, bp: Blueprint, look?: ShotStackLook): Mat4[] {
  const shape = stackShapeOf(look);
  const pitch = stackLayerPitchMm(bp, look);
  const w = bp.size.w;
  const h = bp.size.h;
  const out: Mat4[] = [];
  if (shape === "messy") {
    const strength = look?.messy == null ? 0.4 : Math.max(0, Math.min(1, look.messy));
    const pile = count * pitch;
    const span = Math.max(4.5, w * 0.08) * strength;
    for (let i = 0; i < count; i++) {
      const y = (i + 0.5) * pitch - pile / 2;
      const yaw = 12 * strength * signedUnit(itemId, i * 3 + 2);
      out.push(
        matMul(
          matTranslate(signedUnit(itemId, i * 3) * span, y, signedUnit(itemId, i * 3 + 1) * span),
          matRotateXYZ(0, deg(yaw), 0),
        ),
      );
    }
    return out;
  }

  if (shape === "row") {
    const gap = look?.gapMm == null ? 4 : look.gapMm;
    const step = w + gap;
    const dir = look?.spread === "rtl" ? -1 : 1;
    for (let i = 0; i < count; i++) {
      const x = dir * (i - (count - 1) / 2) * step;
      out.push(matTranslate(x, i * pitch, 0));
    }
    return out;
  }

  const topDown = look?.fanLeaf === "topDown";
  const layerOf = (i: number) => (topDown ? count - 1 - i : i);

  const { inner, outer } = fanResolved(bp, look, count);
  const { theta, rin } = fanSpanRad(inner, outer, h);
  const dist = rin + h / 2;
  for (let i = 0; i < count; i++) {
    const seq = topDown ? count - 1 - i : i;
    const t = count === 1 ? 0.5 : seq / (count - 1);
    const yaw0 = -theta / 2 + theta * t;
    const yaw = look?.spread === "rtl" ? -yaw0 : yaw0;
    const yLift = layerOf(i) * pitch;
    out.push(
      matMul(matTranslate(Math.sin(yaw) * dist, yLift, -Math.cos(yaw) * dist), matRotateXYZ(0, -yaw, 0)),
    );
  }
  return out;
}

export function stackLayout(
  itemId: string,
  count: number,
  bp: Blueprint,
  look?: ShotStackLook,
  faceDown = false,
): { poses: Mat4[]; restY: number } {
  const shape = stackShapeOf(look);
  const meshT = stackMeshThickMm(bp);
  const flip = faceDown ? faceFlipMat() : null;
  if (shape === "deck" || count <= 0) {
    const poses = [flip ?? matIdentity()];
    const restY = -minCornerY(poses, bp, meshT);
    return { poses, restY: Number.isFinite(restY) ? restY : meshT / 2 };
  }
  let poses = rawPoses(itemId, count, bp, look);
  const flatten = shape === "row" || shape === "fan";
  if (flatten) poses = flattenToTable(poses);
  poses = centerPoses(poses);
  if (flip) poses = poses.map((m) => matMul(m, flip));
  const restY = -minCornerY(poses, bp, meshT);
  return { poses, restY: Number.isFinite(restY) ? restY : meshT / 2 };
}

export function stackLocalPose(
  itemId: string,
  index: number,
  count: number,
  bp: Blueprint,
  look?: ShotStackLook,
  faceDown = false,
): Mat4 {
  return stackLayout(itemId, count, bp, look, faceDown).poses[index] ?? matIdentity();
}

export function stackRestY(
  bp: Blueprint | undefined,
  set: CardSet | undefined,
  look?: ShotStackLook,
  itemId = "rest",
  faceDown = false,
): number {
  const n = Math.max(1, stackDrawCards(set, look).length);
  const shape = stackShapeOf(look);
  if (!bp) return stackMeshThickMm(bp) / 2;
  if (shape === "deck") {
    const paper = stackMeshThickMm(bp);
    const full = Math.max(1, stackSlice(set, look).length);
    return (full * paper) / 2;
  }
  return stackLayout(itemId, n, bp, look, faceDown).restY;
}
