import { orbitEye, type Vec3 } from "./boxGeom";

const AXES: { v: Vec3; label: string; rgb: [number, number, number]; positive: boolean }[] = [
  { v: [1, 0, 0], label: "右", rgb: [1, 0.32, 0.26], positive: true },
  { v: [-1, 0, 0], label: "左", rgb: [0.72, 0.22, 0.18], positive: false },
  { v: [0, 1, 0], label: "上", rgb: [0.35, 0.92, 0.42], positive: true },
  { v: [0, -1, 0], label: "下", rgb: [0.22, 0.55, 0.26], positive: false },
  { v: [0, 0, 1], label: "前", rgb: [0.32, 0.55, 1], positive: true },
  { v: [0, 0, -1], label: "后", rgb: [0.2, 0.36, 0.72], positive: false },
];

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** 视口角落 Blender 式小坐标：+X右 −X左 +Y上 −Y下 +Z前 −Z后 */
export function drawAxisWidget(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  _cssH: number,
  dpr: number,
  yawDeg: number,
  pitchDeg: number,
) {
  const eye = orbitEye(yawDeg, pitchDeg, 1);
  const forward = norm([-eye[0], -eye[1], -eye[2]]);
  let right = cross(forward, [0, 1, 0]);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-4) right = [1, 0, 0];
  else right = norm(right);
  const up = norm(cross(right, forward));
  const cx = (cssW - 54) * dpr;
  const cy = 54 * dpr;
  const scale = 30 * dpr;
  const projected = AXES.map((a) => ({
    ...a,
    x: a.v[0] * right[0] + a.v[1] * right[1] + a.v[2] * right[2],
    y: a.v[0] * up[0] + a.v[1] * up[1] + a.v[2] * up[2],
    z: a.v[0] * forward[0] + a.v[1] * forward[1] + a.v[2] * forward[2],
  })).sort((a, b) => a.z - b.z);

  ctx.save();
  ctx.lineCap = "round";
  ctx.font = `600 ${11 * dpr}px "Segoe UI","Microsoft YaHei",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const a of projected) {
    const x2 = cx + a.x * scale;
    const y2 = cy - a.y * scale;
    const rgb = `rgb(${Math.round(a.rgb[0] * 255)},${Math.round(a.rgb[1] * 255)},${Math.round(a.rgb[2] * 255)})`;
    ctx.strokeStyle = rgb;
    ctx.lineWidth = (a.positive ? 2.5 : 1.25) * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillStyle = rgb;
    ctx.beginPath();
    ctx.arc(x2, y2, (a.positive ? 9 : 6.5) * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a.positive ? "#111114" : "#f4f4f6";
    ctx.fillText(a.label, x2, y2 + 0.5 * dpr);
  }
  ctx.restore();
}
