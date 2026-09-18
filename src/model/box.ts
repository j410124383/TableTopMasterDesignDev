import { uid } from "@/lib/id";
import type {
  BoxFace,
  BoxMaterial,
  BoxMode,
  BoxPartMaps,
  BoxRenderSetup,
  BoxSleeve,
  PackagingBox,
  TextureFit,
  TextureRotationDeg,
  UvIsland,
} from "./types";

export const BOX_FACES: BoxFace[] = ["top", "bottom", "front", "back", "left", "right"];

export const FACE_LABEL: Record<BoxFace, string> = {
  top: "上",
  bottom: "下",
  front: "前",
  back: "后",
  left: "左",
  right: "右",
};

/** 默认 10 × 15 × 5 cm */
export const DEFAULT_BOX_MM = { lengthMm: 100, widthMm: 150, heightMm: 50 };

export function defaultUvNet(lengthMm: number, widthMm: number, heightMm: number): Record<BoxFace, UvIsland> {
  const L = Math.max(1, lengthMm);
  const W = Math.max(1, widthMm);
  const H = Math.max(1, heightMm);
  const netW = L + W + L + W;
  const netH = W + H + W;
  const pad = 0.03;
  const s = (1 - pad * 2) / Math.max(netW, netH);
  const ox = pad + Math.max(0, (1 - pad * 2 - netW * s) / 2);
  const oy = pad + Math.max(0, (1 - pad * 2 - netH * s) / 2);
  const island = (x: number, y: number, w: number, h: number): UvIsland => ({
    u: ox + (x + w / 2) * s,
    v: oy + (y + h / 2) * s,
    w: w * s,
    h: h * s,
    scaleX: 1,
    scaleY: 1,
    uniformScale: true,
    rotationDeg: 0,
  });
  const yMid = W;
  const xFront = W;
  return {
    top: island(xFront, yMid + H, L, W),
    left: island(0, yMid, W, H),
    front: island(xFront, yMid, L, H),
    right: island(xFront + L, yMid, W, H),
    back: island(xFront + L + W, yMid, L, H),
    bottom: island(xFront, 0, L, W),
  };
}

/** 地盒外壁盒坯：前/后对调后再整网绕 UV 中心转 180°。 */
export function defaultBaseOuterUvNet(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
): Record<BoxFace, UvIsland> {
  const net = defaultUvNet(lengthMm, widthMm, heightMm);
  const swapped: Record<BoxFace, UvIsland> = {
    ...net,
    front: { ...net.back },
    back: { ...net.front },
  };
  const out = {} as Record<BoxFace, UvIsland>;
  for (const f of BOX_FACES) {
    const isl = swapped[f]!;
    out[f] = {
      ...isl,
      u: 1 - isl.u,
      v: 1 - isl.v,
      rotationDeg: Math.round(((isl.rotationDeg ?? 0) + 180) % 360),
    };
  }
  return out;
}

export function boxTextureRotationDeg(value?: number): TextureRotationDeg {
  const n = Math.round(Number(value));
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

export function nextTextureRotationDeg(value?: number): TextureRotationDeg {
  return boxTextureRotationDeg((boxTextureRotationDeg(value) + 90) % 360);
}

/** 当前层盒坯默认网：地盒外壁用前后对调+整网180，其余用十字网。 */
export function blankUvNetFor(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  opts?: { part?: "lid" | "base" | "body"; layer?: "outer" | "inner" },
): Record<BoxFace, UvIsland> {
  if (opts?.part === "base" && opts.layer !== "inner") {
    return defaultBaseOuterUvNet(lengthMm, widthMm, heightMm);
  }
  return defaultUvNet(lengthMm, widthMm, heightMm);
}

export function defaultBoxRender(lengthMm: number, widthMm: number, heightMm: number): BoxRenderSetup {
  const diag = Math.hypot(lengthMm, widthMm, heightMm);
  return {
    position: { x: 0, y: 0, z: 0 },
    rotationDeg: { x: 0, y: 0, z: 0 },
    camera: { yaw: 38, pitch: 22, distance: Math.max(180, diag * 1.85), fov: 32 },
    lights: {
      key: { yaw: -35, pitch: 48, intensity: 1.05, color: "#fff4e4" },
      fillIntensity: 0.28,
      ambient: 0.32,
    },
    background: "#1c1c22",
    cullBackground: false,
    cullOutsideBox: false,
    resolutionW: 1920,
    resolutionH: 1080,
    exportTexture: "max",
  };
}

export function createPackagingBox(name = "包装盒"): PackagingBox {
  const { lengthMm, widthMm, heightMm } = DEFAULT_BOX_MM;
  return {
    id: uid("box"),
    name,
    lengthMm,
    widthMm,
    heightMm,
    faces: defaultUvNet(lengthMm, widthMm, heightMm),
    render: defaultBoxRender(lengthMm, widthMm, heightMm),
    textureFit: "cover",
    textureTileScale: 1,
    bevelMm: 0,
  };
}

export function ensureBoxRender(box: PackagingBox): BoxRenderSetup {
  const render = box.render ?? defaultBoxRender(box.lengthMm, box.widthMm, box.heightMm);
  return { ...render, exportTexture: render.exportTexture === "standard" ? "standard" : "max" };
}

export function islandVisual(island: UvIsland): { w: number; h: number } {
  return {
    w: Math.max(0.01, island.w * (island.scaleX ?? 1)),
    h: Math.max(0.01, island.h * (island.scaleY ?? 1)),
  };
}

export function ensureBoxFaces(box: PackagingBox): PackagingBox {
  const base = defaultUvNet(box.lengthMm, box.widthMm, box.heightMm);
  const faces = { ...base, ...(box.faces ?? {}) } as Record<BoxFace, UvIsland>;
  for (const f of BOX_FACES) {
    const cur = faces[f] ?? base[f];
    faces[f] = {
      ...base[f],
      ...cur,
      scaleX: cur.scaleX ?? 1,
      scaleY: cur.scaleY ?? 1,
      uniformScale: cur.uniformScale !== false,
    };
  }
  const fit = box.textureFit === "original" || box.textureFit === "tile" ? box.textureFit : "cover";
  const tile = Number(box.textureTileScale);
  const bevel = Number(box.bevelMm);
  const cap = Math.min(box.lengthMm, box.widthMm, box.heightMm) / 4;
  const mode = box.mode === "lidBase" ? "lidBase" : "simple";
  const next: PackagingBox = {
    ...box,
    mode,
    faces,
    textureFit: fit,
    textureTileScale: Number.isFinite(tile) && tile > 0 ? tile : 1,
    bevelMm: Number.isFinite(bevel) ? Math.max(0, Math.min(bevel, cap)) : 0,
    material: boxMaterialOf(box),
  };
  if (mode === "lidBase") {
    next.lid = partMapsOf(next, "lid");
    next.base = partMapsOf(next, "base");
    next.lidHeightMm = boxLidHeight(next);
    next.baseHeightMm = boxBaseHeight(next);
    next.wallMm = boxWallMm(next);
    next.lidFitMm = boxLidFitMm(next);
    next.sleeve = boxSleeveOf(next);
    next.lidOpen = boxLidOpen(next);
  }
  return next;
}

export function boxTextureFit(box: PackagingBox): TextureFit {
  return box.textureFit === "original" || box.textureFit === "tile" ? box.textureFit : "cover";
}

export function boxBevelMm(box: PackagingBox): number {
  const cap = Math.min(box.lengthMm, box.widthMm, box.heightMm) / 4;
  const n = Number(box.bevelMm);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, cap);
}

export function boxModeOf(box: PackagingBox): BoxMode {
  return box.mode === "lidBase" ? "lidBase" : "simple";
}

export function boxMaterialOf(box: PackagingBox): Required<BoxMaterial> {
  const m = box.material ?? {};
  const clamp01 = (n: number, d: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d);
  const clampCoat = (n: number, d: number) => (Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : d);
  const clampRough = (n: number, d: number) => (Number.isFinite(n) ? Math.max(0.002, Math.min(1, n)) : d);
  return {
    baseColor: m.baseColor || "#ffffff",
    metallic: clamp01(Number(m.metallic), 0),
    roughness: clamp01(Number(m.roughness), 0.55),
    foilColor: m.foilColor || "#d4af37",
    foilMetallic: clamp01(Number(m.foilMetallic), 0.95),
    foilRoughness: clamp01(Number(m.foilRoughness), 0.12),
    foilGrain: clamp01(Number(m.foilGrain), 0.55),
    foilGrainStyle: m.foilGrainStyle === "frost" ? "frost" : "cell",
    varnishRoughness: clampRough(Number(m.varnishRoughness), 0.02),
    varnishCoat: clampCoat(Number(m.varnishCoat), 1.5),
  };
}

function completeUvFaces(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  stored?: Record<BoxFace, UvIsland>,
  blank?: Record<BoxFace, UvIsland>,
): Record<BoxFace, UvIsland> {
  const base = blank ?? defaultUvNet(lengthMm, widthMm, heightMm);
  const faces = { ...base, ...(stored ?? {}) } as Record<BoxFace, UvIsland>;
  for (const f of BOX_FACES) {
    const cur = faces[f] ?? base[f];
    faces[f] = {
      ...base[f],
      ...cur,
      scaleX: cur.scaleX ?? 1,
      scaleY: cur.scaleY ?? 1,
      uniformScale: cur.uniformScale !== false,
    };
  }
  return faces;
}

function fitOf(value?: TextureFit): TextureFit {
  return value === "original" || value === "tile" ? value : "cover";
}

export function defaultPartMaps(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  from?: Partial<BoxPartMaps>,
  innerMm?: { lengthMm: number; widthMm: number; heightMm: number },
  opts?: { outerBlank?: "lid" | "base" },
): BoxPartMaps {
  const inner = innerMm ?? { lengthMm, widthMm, heightMm };
  const outerBlank =
    opts?.outerBlank === "base"
      ? defaultBaseOuterUvNet(lengthMm, widthMm, heightMm)
      : defaultUvNet(lengthMm, widthMm, heightMm);
  return {
    textureAssetId: from?.textureAssetId,
    textureFit: fitOf(from?.textureFit),
    textureTileScale: from?.textureTileScale ?? 1,
    textureRotationDeg: boxTextureRotationDeg(from?.textureRotationDeg),
    faces: from?.faces
      ? completeUvFaces(lengthMm, widthMm, heightMm, from.faces, outerBlank)
      : outerBlank,
    innerTextureAssetId: from?.innerTextureAssetId,
    innerTextureFit: fitOf(from?.innerTextureFit),
    innerTextureTileScale: from?.innerTextureTileScale ?? 1,
    innerTextureRotationDeg: boxTextureRotationDeg(from?.innerTextureRotationDeg),
    innerFaces: completeUvFaces(inner.lengthMm, inner.widthMm, inner.heightMm, from?.innerFaces),
    foilMaskAssetId: from?.foilMaskAssetId,
    varnishMaskAssetId: from?.varnishMaskAssetId,
  };
}

export function boxLidHeight(box: PackagingBox): number {
  const n = Number(box.lidHeightMm);
  if (Number.isFinite(n) && n > 1) return n;
  return Math.max(8, box.heightMm * 0.45);
}

export function boxBaseHeight(box: PackagingBox): number {
  const n = Number(box.baseHeightMm);
  if (Number.isFinite(n) && n > 1) return n;
  return Math.max(8, box.heightMm * 0.9);
}

export function boxWallMm(box: PackagingBox): number {
  const n = Number(box.wallMm);
  if (Number.isFinite(n) && n >= 0) return n;
  return 1.5;
}

export function boxLidFitMm(box: PackagingBox): number {
  const n = Number(box.lidFitMm);
  if (Number.isFinite(n) && n >= 0) return n;
  return 1;
}

export function boxLidOpen(box: PackagingBox): number {
  const n = Number(box.lidOpen);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function boxLidNotchUpDown(box: PackagingBox) {
  return box.mode === "lidBase" && !!box.lidNotchUpDown;
}

export function boxLidNotchLeftRight(box: PackagingBox) {
  return box.mode === "lidBase" && !!box.lidNotchLeftRight;
}

export function boxLidNotchRadiusMm(box: PackagingBox) {
  const n = Number(box.lidNotchRadiusMm);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

/** 天盒开口圈上要挖半圆的壁。地盒 / 简单盒为空。 */
export function lidNotchWalls(box: PackagingBox): BoxFace[] {
  if (box.mode !== "lidBase") return [];
  const up = boxLidNotchUpDown(box);
  const lr = boxLidNotchLeftRight(box);
  if (!up && !lr) return [];
  const sleeve = boxSleeveOf(box);
  const vert: BoxFace[] = sleeve === "upDown" ? ["front", "back"] : ["top", "bottom"];
  const horz: BoxFace[] = sleeve === "leftRight" ? ["front", "back"] : ["left", "right"];
  const out: BoxFace[] = [];
  if (up) out.push(...vert);
  if (lr) out.push(...horz);
  return out;
}

export function boxSleeveOf(box: PackagingBox): BoxSleeve {
  return box.sleeve === "frontBack" || box.sleeve === "leftRight" ? box.sleeve : "upDown";
}

export const BOX_SLEEVE_MODES: { id: BoxSleeve; label: string; hint: string }[] = [
  { id: "upDown", label: "上下", hint: "地口上、天口下" },
  { id: "frontBack", label: "前后", hint: "地口前、天口后" },
  { id: "leftRight", label: "左右", hint: "地口右、天口左" },
];

function lidFitExtra(box: PackagingBox) {
  return 2 * boxLidFitMm(box) + 2 * boxWallMm(box);
}

/** 该件世界外尺寸。长=X 宽=Z 高=Y */
export function boxPartWorldMm(box: PackagingBox, part: "lid" | "base"): { lengthMm: number; widthMm: number; heightMm: number } {
  const extra = lidFitExtra(box);
  const depth = part === "lid" ? boxLidHeight(box) : boxBaseHeight(box);
  const sleeve = boxSleeveOf(box);
  if (part === "lid") {
    if (sleeve === "frontBack") return { lengthMm: box.lengthMm + extra, widthMm: depth, heightMm: box.heightMm + extra };
    if (sleeve === "leftRight") return { lengthMm: depth, widthMm: box.widthMm + extra, heightMm: box.heightMm + extra };
    return { lengthMm: box.lengthMm + extra, widthMm: box.widthMm + extra, heightMm: depth };
  }
  if (sleeve === "frontBack") return { lengthMm: box.lengthMm, widthMm: depth, heightMm: box.heightMm };
  if (sleeve === "leftRight") return { lengthMm: depth, widthMm: box.widthMm, heightMm: box.heightMm };
  return { lengthMm: box.lengthMm, widthMm: box.widthMm, heightMm: depth };
}

export function boxPartInnerMm(box: PackagingBox, part: "lid" | "base"): { lengthMm: number; widthMm: number; heightMm: number } {
  const o = boxPartWorldMm(box, part);
  const w = boxWallMm(box);
  const shrink = (n: number, times: number) => Math.max(1, n - times * w);
  const sleeve = boxSleeveOf(box);
  if (sleeve === "frontBack") return { lengthMm: shrink(o.lengthMm, 2), widthMm: shrink(o.widthMm, 1), heightMm: shrink(o.heightMm, 2) };
  if (sleeve === "leftRight") return { lengthMm: shrink(o.lengthMm, 1), widthMm: shrink(o.widthMm, 2), heightMm: shrink(o.heightMm, 2) };
  return { lengthMm: shrink(o.lengthMm, 2), widthMm: shrink(o.widthMm, 2), heightMm: shrink(o.heightMm, 1) };
}

/** 天盒外尺寸（世界）。上下套时长宽为地外径+间隙+壁厚 */
export function boxLidOuterMm(box: PackagingBox): { lengthMm: number; widthMm: number; heightMm: number } {
  return boxPartWorldMm(box, "lid");
}

export function boxLidLiftMm(box: PackagingBox): number {
  return boxLidHeight(box) + 10;
}

export function boxLidLiftVec(box: PackagingBox, open = boxLidOpen(box)): [number, number, number] {
  const t = open * boxLidLiftMm(box);
  const sleeve = boxSleeveOf(box);
  if (sleeve === "frontBack") return [0, 0, t];
  if (sleeve === "leftRight") return [t, 0, 0];
  return [0, t, 0];
}

/** 该件开口所在的世界面。UV 仍按世界面上/下/前/后/左/右采样，不随开口把岛换轴。 */
export function sleeveOpenFace(sleeve: BoxSleeve, part: "lid" | "base"): BoxFace {
  if (sleeve === "frontBack") return part === "lid" ? "back" : "front";
  if (sleeve === "leftRight") return part === "lid" ? "left" : "right";
  return part === "lid" ? "bottom" : "top";
}

export function simplePartMaps(box: PackagingBox): BoxPartMaps {
  return {
    textureAssetId: box.textureAssetId,
    textureFit: boxTextureFit(box),
    textureTileScale: box.textureTileScale ?? 1,
    textureRotationDeg: boxTextureRotationDeg(box.textureRotationDeg),
    faces: box.faces,
    foilMaskAssetId: box.foilMaskAssetId,
    varnishMaskAssetId: box.varnishMaskAssetId,
  };
}

export function partMapsOf(box: PackagingBox, part: "lid" | "base"): BoxPartMaps {
  const outer = boxPartWorldMm(box, part);
  const inner = boxPartInnerMm(box, part);
  const stored = part === "lid" ? box.lid : box.base;
  const blank = part === "base" ? "base" : "lid";
  if (stored?.faces || stored?.textureAssetId || stored?.innerTextureAssetId) {
    return defaultPartMaps(outer.lengthMm, outer.widthMm, outer.heightMm, stored, inner, { outerBlank: blank });
  }
  return defaultPartMaps(
    outer.lengthMm,
    outer.widthMm,
    outer.heightMm,
    {
      textureAssetId: box.textureAssetId,
      textureFit: box.textureFit,
      textureTileScale: box.textureTileScale,
      textureRotationDeg: box.textureRotationDeg,
      faces: box.faces,
      foilMaskAssetId: box.foilMaskAssetId,
      varnishMaskAssetId: box.varnishMaskAssetId,
    },
    inner,
    { outerBlank: blank },
  );
}

export function switchBoxMode(box: PackagingBox, mode: BoxMode): PackagingBox {
  if (mode === "simple") {
    const lid = box.lid ?? simplePartMaps(box);
    return {
      ...box,
      mode: "simple",
      textureAssetId: lid.textureAssetId,
      textureFit: lid.textureFit,
      textureTileScale: lid.textureTileScale,
      textureRotationDeg: boxTextureRotationDeg(lid.textureRotationDeg),
      faces: lid.faces,
      foilMaskAssetId: lid.foilMaskAssetId,
      varnishMaskAssetId: lid.varnishMaskAssetId,
    };
  }
  const seed = simplePartMaps(box);
  const lid = boxPartWorldMm(box, "lid");
  const base = boxPartWorldMm(box, "base");
  return {
    ...box,
    mode: "lidBase",
    lidHeightMm: boxLidHeight(box),
    baseHeightMm: boxBaseHeight(box),
    wallMm: boxWallMm(box),
    lidFitMm: boxLidFitMm(box),
    sleeve: boxSleeveOf(box),
    lidOpen: boxLidOpen(box),
    lid: defaultPartMaps(lid.lengthMm, lid.widthMm, lid.heightMm, seed, boxPartInnerMm({ ...box, mode: "lidBase" }, "lid"), {
      outerBlank: "lid",
    }),
    base: defaultPartMaps(base.lengthMm, base.widthMm, base.heightMm, seed, boxPartInnerMm({ ...box, mode: "lidBase" }, "base"), {
      outerBlank: "base",
    }),
  };
}

/** 盒子摆放：立着 / 躺着 / 侧躺 */
export const BOX_POSE_PRESETS: { id: string; label: string; rotationDeg: { x: number; y: number; z: number } }[] = [
  { id: "stand", label: "立着", rotationDeg: { x: 0, y: 0, z: 0 } },
  { id: "lay", label: "躺着", rotationDeg: { x: 90, y: 0, z: 0 } },
  { id: "lay-side", label: "侧躺", rotationDeg: { x: 0, y: 0, z: 90 } },
];
