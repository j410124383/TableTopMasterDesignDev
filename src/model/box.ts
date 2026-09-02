import { uid } from "@/lib/id";
import type { BoxFace, BoxRenderSetup, PackagingBox, UvIsland } from "./types";

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
  };
}

export function ensureBoxRender(box: PackagingBox): BoxRenderSetup {
  return box.render ?? defaultBoxRender(box.lengthMm, box.widthMm, box.heightMm);
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
  return { ...box, faces };
}

/** 盒子摆放：立着 / 躺着 / 侧躺 */
export const BOX_POSE_PRESETS: { id: string; label: string; rotationDeg: { x: number; y: number; z: number } }[] = [
  { id: "stand", label: "立着", rotationDeg: { x: 0, y: 0, z: 0 } },
  { id: "lay", label: "躺着", rotationDeg: { x: 90, y: 0, z: 0 } },
  { id: "lay-side", label: "侧躺", rotationDeg: { x: 0, y: 0, z: 90 } },
];
