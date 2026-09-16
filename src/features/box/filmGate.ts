import { orbitEye, type Vec3 } from "@/features/box/boxGeom";

export const RES_MIN = 1;
export const RES_MAX = 32768;

export const RES_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: "hd", label: "HD 1280 × 720", w: 1280, h: 720 },
  { id: "fhd", label: "FHD 1920 × 1080", w: 1920, h: 1080 },
  { id: "qhd", label: "QHD 2560 × 1440", w: 2560, h: 1440 },
  { id: "uhd", label: "4K 3840 × 2160", w: 3840, h: 2160 },
  { id: "sq1", label: "方 1K 1080 × 1080", w: 1080, h: 1080 },
  { id: "sq2", label: "方 2K 2048 × 2048", w: 2048, h: 2048 },
  { id: "sq4", label: "方 4K 4096 × 4096", w: 4096, h: 4096 },
  { id: "vfhd", label: "竖 FHD 1080 × 1920", w: 1080, h: 1920 },
  { id: "vqhd", label: "竖 QHD 1440 × 2560", w: 1440, h: 2560 },
];

export function clampRes(n: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 1920;
  return Math.max(RES_MIN, Math.min(RES_MAX, v));
}

export function filmSize(setup?: { resolutionW?: number; resolutionH?: number }): { w: number; h: number } {
  return { w: setup?.resolutionW || 1920, h: setup?.resolutionH || 1080 };
}

export function filmGateRect(viewW: number, viewH: number, filmW: number, filmH: number): { x: number; y: number; w: number; h: number } {
  const fa = Math.max(1, filmW) / Math.max(1, filmH);
  const va = Math.max(1, viewW) / Math.max(1, viewH);
  const gw = va > fa ? viewH * fa : viewW;
  const gh = va > fa ? viewH : viewW / fa;
  return { x: (viewW - gw) / 2, y: (viewH - gh) / 2, w: gw, h: gh };
}

export function overscanFovY(filmFovDeg: number, viewH: number, gateH: number): number {
  const f = (Math.max(1, filmFovDeg) * Math.PI) / 180;
  const k = viewH / Math.max(1, gateH);
  return (2 * Math.atan(Math.tan(f / 2) * k) * 180) / Math.PI;
}

export function drawFilmGate(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  filmW: number,
  filmH: number,
  dpr = 1,
) {
  const g = filmGateRect(viewW, viewH, filmW, filmH);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, viewW, g.y);
  ctx.fillRect(0, g.y + g.h, viewW, viewH - g.y - g.h);
  ctx.fillRect(0, g.y, g.x, g.h);
  ctx.fillRect(g.x + g.w, g.y, viewW - g.x - g.w, g.h);
  ctx.strokeStyle = "#ee2233";
  ctx.lineWidth = Math.max(1, 1.5 * dpr);
  ctx.strokeRect(g.x + ctx.lineWidth / 2, g.y + ctx.lineWidth / 2, Math.max(0, g.w - ctx.lineWidth), Math.max(0, g.h - ctx.lineWidth));
  ctx.restore();
}

export type OrbitCam = {
  yaw: number;
  pitch: number;
  distance: number;
  target?: { x: number; y: number; z: number };
};

export function cameraTargetOf(cam: OrbitCam): Vec3 {
  return [cam.target?.x ?? 0, cam.target?.y ?? 0, cam.target?.z ?? 0];
}

export function panCameraTarget(cam: OrbitCam, dx: number, dy: number): { x: number; y: number; z: number } {
  const target = cameraTargetOf(cam);
  const eye = orbitEye(cam.yaw, cam.pitch, cam.distance, target);
  const fx = target[0] - eye[0];
  const fy = target[1] - eye[1];
  const fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f: Vec3 = [fx / fl, fy / fl, fz / fl];
  let rx = -f[2];
  let ry = 0;
  let rz = f[0];
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-5) {
    rx = 1;
    ry = 0;
    rz = 0;
    rl = 1;
  }
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * f[2] - rz * f[1];
  const uy = rz * f[0] - rx * f[2];
  const uz = rx * f[1] - ry * f[0];
  const k = cam.distance * 0.0025;
  return {
    x: target[0] - rx * dx * k + ux * dy * k,
    y: target[1] - ry * dx * k + uy * dy * k,
    z: target[2] - rz * dx * k + uz * dy * k,
  };
}
