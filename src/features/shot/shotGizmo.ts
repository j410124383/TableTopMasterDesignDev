import type { BoxGl } from "@/features/box/boxGl";
import type { Vec3 } from "@/features/box/boxGeom";
import type { ProductShotItem } from "@/model/types";

export type GizmoMode = "move" | "rotate" | "scale";
export type GizmoAxis = "x" | "y" | "z" | "uniform";

const AXIS: { id: GizmoAxis; dir: Vec3; color: string }[] = [
  { id: "x", dir: [1, 0, 0], color: "#e44545" },
  { id: "y", dir: [0, 1, 0], color: "#3dcc6a" },
  { id: "z", dir: [0, 0, 1], color: "#4d8dff" },
];

function originOf(item: ProductShotItem): Vec3 {
  return [item.position.x, item.position.y, item.position.z];
}

function axisLen(item: ProductShotItem) {
  return 72 * (item.scale ?? 1);
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export function pickGizmo(gl: BoxGl, item: ProductShotItem, mode: GizmoMode, x: number, y: number): GizmoAxis | null {
  const o = gl.projectWorld(originOf(item));
  if (!o) return null;
  const len = axisLen(item);
  if (mode === "scale") {
    if (Math.hypot(x - o.x, y - o.y) < 12) return "uniform";
  }
  if (mode === "rotate") {
    let best: GizmoAxis | null = null;
    let bestD = 18;
    for (const ax of AXIS) {
      const pts = rotateRing(gl, originOf(item), ax.dir, len);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const d = distToSeg(x, y, a.x, a.y, b.x, b.y);
        if (d < bestD) {
          bestD = d;
          best = ax.id;
        }
      }
    }
    return best;
  }
  let hit: GizmoAxis | null = null;
  let best = 10;
  for (const ax of AXIS) {
    const p = gl.projectWorld([item.position.x + ax.dir[0] * len, item.position.y + ax.dir[1] * len, item.position.z + ax.dir[2] * len]);
    if (!p) continue;
    const d = distToSeg(x, y, o.x, o.y, p.x, p.y);
    if (d < best) {
      best = d;
      hit = ax.id;
    }
  }
  return hit;
}

function rotateRing(gl: BoxGl, o: Vec3, axis: Vec3, radius: number) {
  const u: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s: Vec3 = [
    u[1] * axis[2] - u[2] * axis[1],
    u[2] * axis[0] - u[0] * axis[2],
    u[0] * axis[1] - u[1] * axis[0],
  ];
  const sl = Math.hypot(s[0], s[1], s[2]) || 1;
  s[0] /= sl;
  s[1] /= sl;
  s[2] /= sl;
  const t: Vec3 = [
    axis[1] * s[2] - axis[2] * s[1],
    axis[2] * s[0] - axis[0] * s[2],
    axis[0] * s[1] - axis[1] * s[0],
  ];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const p = gl.projectWorld([
      o[0] + (s[0] * Math.cos(a) + t[0] * Math.sin(a)) * radius,
      o[1] + (s[1] * Math.cos(a) + t[1] * Math.sin(a)) * radius,
      o[2] + (s[2] * Math.cos(a) + t[2] * Math.sin(a)) * radius,
    ]);
    if (p) pts.push(p);
  }
  return pts;
}

export function drawGizmo(ctx: CanvasRenderingContext2D, gl: BoxGl, item: ProductShotItem, mode: GizmoMode) {
  const o = gl.projectWorld(originOf(item));
  if (!o) return;
  const len = axisLen(item);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (mode === "rotate") {
    ctx.lineWidth = 4;
    for (const ax of AXIS) {
      const pts = rotateRing(gl, originOf(item), ax.dir, len);
      if (pts.length < 2) continue;
      ctx.strokeStyle = ax.color;
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  ctx.lineWidth = 3;
  for (const ax of AXIS) {
    const p = gl.projectWorld([item.position.x + ax.dir[0] * len, item.position.y + ax.dir[1] * len, item.position.z + ax.dir[2] * len]);
    if (!p) continue;
    ctx.strokeStyle = ax.color;
    ctx.fillStyle = ax.color;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, mode === "scale" ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (mode === "scale") {
    ctx.fillStyle = "#f2f2f2";
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(o.x - 6, o.y - 6, 12, 12);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function axisDir(axis: GizmoAxis): Vec3 {
  if (axis === "y") return [0, 1, 0];
  if (axis === "z") return [0, 0, 1];
  return [1, 0, 0];
}
