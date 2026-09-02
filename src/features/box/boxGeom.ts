import type { BoxFace, PackagingBox, UvIsland } from "@/model/types";
import { BOX_FACES, islandVisual } from "@/model/box";

export type Vec3 = [number, number, number];

export type FaceCorner = {
  pos: Vec3;
  uv: [number, number];
  nrm: Vec3;
  s: number;
  t: number;
};

function uvAt(island: UvIsland, s: number, t: number): [number, number] {
  const vis = islandVisual(island);
  let x = (s - 0.5) * vis.w;
  let y = (t - 0.5) * vis.h;
  if (island.flipU) x = -x;
  if (island.flipV) y = -y;
  const r = ((island.rotationDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(r);
  const si = Math.sin(r);
  return [island.u + x * c - y * si, island.v + x * si + y * c];
}

function faceCorners(
  face: BoxFace,
  L: number,
  W: number,
  H: number,
  island: UvIsland,
): FaceCorner[] {
  const hx = L / 2;
  const hy = H / 2;
  const hz = W / 2;
  const specs: [Vec3, number, number, Vec3][] =
    face === "front"
      ? [
          [[-hx, -hy, hz], 0, 0, [0, 0, 1]],
          [[hx, -hy, hz], 1, 0, [0, 0, 1]],
          [[hx, hy, hz], 1, 1, [0, 0, 1]],
          [[-hx, hy, hz], 0, 1, [0, 0, 1]],
        ]
      : face === "back"
        ? [
            [[hx, -hy, -hz], 0, 0, [0, 0, -1]],
            [[-hx, -hy, -hz], 1, 0, [0, 0, -1]],
            [[-hx, hy, -hz], 1, 1, [0, 0, -1]],
            [[hx, hy, -hz], 0, 1, [0, 0, -1]],
          ]
        : face === "right"
          ? [
              [[hx, -hy, hz], 0, 0, [1, 0, 0]],
              [[hx, -hy, -hz], 1, 0, [1, 0, 0]],
              [[hx, hy, -hz], 1, 1, [1, 0, 0]],
              [[hx, hy, hz], 0, 1, [1, 0, 0]],
            ]
          : face === "left"
            ? [
                [[-hx, -hy, -hz], 0, 0, [-1, 0, 0]],
                [[-hx, -hy, hz], 1, 0, [-1, 0, 0]],
                [[-hx, hy, hz], 1, 1, [-1, 0, 0]],
                [[-hx, hy, -hz], 0, 1, [-1, 0, 0]],
              ]
            : face === "top"
              ? [
                  [[-hx, hy, hz], 0, 0, [0, 1, 0]],
                  [[hx, hy, hz], 1, 0, [0, 1, 0]],
                  [[hx, hy, -hz], 1, 1, [0, 1, 0]],
                  [[-hx, hy, -hz], 0, 1, [0, 1, 0]],
                ]
              : [
                  [[-hx, -hy, -hz], 0, 0, [0, -1, 0]],
                  [[hx, -hy, -hz], 1, 0, [0, -1, 0]],
                  [[hx, -hy, hz], 1, 1, [0, -1, 0]],
                  [[-hx, -hy, hz], 0, 1, [0, -1, 0]],
                ];
  return specs.map(([pos, s, t, nrm]) => ({
    pos,
    s,
    t,
    nrm,
    uv: uvAt(island, s, t),
  }));
}

export function boxMesh(box: PackagingBox) {
  const L = Math.max(1, box.lengthMm);
  const W = Math.max(1, box.widthMm);
  const H = Math.max(1, box.heightMm);
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const faceIndex: BoxFace[] = [];
  for (const face of BOX_FACES) {
    const c = faceCorners(face, L, W, H, box.faces[face]);
    const tri = [0, 1, 2, 0, 2, 3];
    for (const i of tri) {
      pos.push(...c[i]!.pos);
      uv.push(...c[i]!.uv);
      nrm.push(...c[i]!.nrm);
      faceIndex.push(face);
    }
  }
  return {
    pos: new Float32Array(pos),
    uv: new Float32Array(uv),
    nrm: new Float32Array(nrm),
    faces: faceIndex,
    size: { L, W, H },
  };
}

export function boxCornersMm(box: PackagingBox): Vec3[] {
  const hx = box.lengthMm / 2;
  const hy = box.heightMm / 2;
  const hz = box.widthMm / 2;
  const xs = [-hx, hx];
  const ys = [-hy, hy];
  const zs = [-hz, hz];
  const out: Vec3[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) out.push([x, y, z]);
  return out;
}

export function rayHitFace(
  origin: Vec3,
  dir: Vec3,
  box: PackagingBox,
): BoxFace | null {
  const mesh = boxMesh(box);
  let best = Infinity;
  let hit: BoxFace | null = null;
  for (let i = 0; i < mesh.faces.length; i += 3) {
    const i0 = i * 3;
    const a: Vec3 = [mesh.pos[i0]!, mesh.pos[i0 + 1]!, mesh.pos[i0 + 2]!];
    const b: Vec3 = [mesh.pos[i0 + 3]!, mesh.pos[i0 + 4]!, mesh.pos[i0 + 5]!];
    const c: Vec3 = [mesh.pos[i0 + 6]!, mesh.pos[i0 + 7]!, mesh.pos[i0 + 8]!];
    const t = rayTri(origin, dir, a, b, c);
    if (t != null && t < best && t > 0.001) {
      best = t;
      hit = mesh.faces[i]!;
    }
  }
  return hit;
}

function rayTri(o: Vec3, d: Vec3, a: Vec3, b: Vec3, c: Vec3): number | null {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const h = cross(d, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  const s: Vec3 = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = inv * dot(s, h);
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1);
  const v = inv * dot(d, q);
  if (v < 0 || u + v > 1) return null;
  const t = inv * dot(e2, q);
  return t > 0 ? t : null;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export type Mat4 = Float32Array;

export function matIdentity(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function matMul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r]! * b[c * 4]! +
        a[4 + r]! * b[c * 4 + 1]! +
        a[8 + r]! * b[c * 4 + 2]! +
        a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return o;
}

export function matPerspective(fovyDeg: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan((fovyDeg * Math.PI) / 360);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function matLookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  let zlen = Math.hypot(zx, zy, zz) || 1;
  const z: Vec3 = [zx / zlen, zy / zlen, zz / zlen];
  const x = cross(up, z);
  let xlen = Math.hypot(x[0], x[1], x[2]) || 1;
  x[0] /= xlen;
  x[1] /= xlen;
  x[2] /= xlen;
  const y = cross(z, x);
  const m = matIdentity();
  m[0] = x[0];
  m[1] = y[0];
  m[2] = z[0];
  m[4] = x[1];
  m[5] = y[1];
  m[6] = z[1];
  m[8] = x[2];
  m[9] = y[2];
  m[10] = z[2];
  m[12] = -dot(x, eye);
  m[13] = -dot(y, eye);
  m[14] = -dot(z, eye);
  return m;
}

export function matTranslate(x: number, y: number, z: number): Mat4 {
  const m = matIdentity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function matRotateXYZ(rx: number, ry: number, rz: number): Mat4 {
  const cx = Math.cos(rx),
    sx = Math.sin(rx);
  const cy = Math.cos(ry),
    sy = Math.sin(ry);
  const cz = Math.cos(rz),
    sz = Math.sin(rz);
  const rxm = matIdentity();
  rxm[5] = cx;
  rxm[6] = sx;
  rxm[9] = -sx;
  rxm[10] = cx;
  const rym = matIdentity();
  rym[0] = cy;
  rym[2] = -sy;
  rym[8] = sy;
  rym[10] = cy;
  const rzm = matIdentity();
  rzm[0] = cz;
  rzm[1] = sz;
  rzm[4] = -sz;
  rzm[5] = cz;
  return matMul(rzm, matMul(rym, rxm));
}

export function matInvert(m: Mat4): Mat4 | null {
  const a = Array.from(m);
  const inv = new Float32Array(16);
  inv[0] =
    a[5]! * a[10]! * a[15]! -
    a[5]! * a[11]! * a[14]! -
    a[9]! * a[6]! * a[15]! +
    a[9]! * a[7]! * a[14]! +
    a[13]! * a[6]! * a[11]! -
    a[13]! * a[7]! * a[10]!;
  inv[4] =
    -a[4]! * a[10]! * a[15]! +
    a[4]! * a[11]! * a[14]! +
    a[8]! * a[6]! * a[15]! -
    a[8]! * a[7]! * a[14]! -
    a[12]! * a[6]! * a[11]! +
    a[12]! * a[7]! * a[10]!;
  inv[8] =
    a[4]! * a[9]! * a[15]! -
    a[4]! * a[11]! * a[13]! -
    a[8]! * a[5]! * a[15]! +
    a[8]! * a[7]! * a[13]! +
    a[12]! * a[5]! * a[11]! -
    a[12]! * a[7]! * a[9]!;
  inv[12] =
    -a[4]! * a[9]! * a[14]! +
    a[4]! * a[10]! * a[13]! +
    a[8]! * a[5]! * a[14]! -
    a[8]! * a[6]! * a[13]! -
    a[12]! * a[5]! * a[10]! +
    a[12]! * a[6]! * a[9]!;
  inv[1] =
    -a[1]! * a[10]! * a[15]! +
    a[1]! * a[11]! * a[14]! +
    a[9]! * a[2]! * a[15]! -
    a[9]! * a[3]! * a[14]! -
    a[13]! * a[2]! * a[11]! +
    a[13]! * a[3]! * a[10]!;
  inv[5] =
    a[0]! * a[10]! * a[15]! -
    a[0]! * a[11]! * a[14]! -
    a[8]! * a[2]! * a[15]! +
    a[8]! * a[3]! * a[14]! +
    a[12]! * a[2]! * a[11]! -
    a[12]! * a[3]! * a[10]!;
  inv[9] =
    -a[0]! * a[9]! * a[15]! +
    a[0]! * a[11]! * a[13]! +
    a[8]! * a[1]! * a[15]! -
    a[8]! * a[3]! * a[13]! -
    a[12]! * a[1]! * a[11]! +
    a[12]! * a[3]! * a[9]!;
  inv[13] =
    a[0]! * a[9]! * a[14]! -
    a[0]! * a[10]! * a[13]! -
    a[8]! * a[1]! * a[14]! +
    a[8]! * a[2]! * a[13]! +
    a[12]! * a[1]! * a[10]! -
    a[12]! * a[2]! * a[9]!;
  inv[2] =
    a[1]! * a[6]! * a[15]! -
    a[1]! * a[7]! * a[14]! -
    a[5]! * a[2]! * a[15]! +
    a[5]! * a[3]! * a[14]! +
    a[13]! * a[2]! * a[7]! -
    a[13]! * a[3]! * a[6]!;
  inv[6] =
    -a[0]! * a[6]! * a[15]! +
    a[0]! * a[7]! * a[14]! +
    a[4]! * a[2]! * a[15]! -
    a[4]! * a[3]! * a[14]! -
    a[12]! * a[2]! * a[7]! +
    a[12]! * a[3]! * a[6]!;
  inv[10] =
    a[0]! * a[5]! * a[15]! -
    a[0]! * a[7]! * a[13]! -
    a[4]! * a[1]! * a[15]! +
    a[4]! * a[3]! * a[13]! +
    a[12]! * a[1]! * a[7]! -
    a[12]! * a[3]! * a[5]!;
  inv[14] =
    -a[0]! * a[5]! * a[14]! +
    a[0]! * a[6]! * a[13]! +
    a[4]! * a[1]! * a[14]! -
    a[4]! * a[2]! * a[13]! -
    a[12]! * a[1]! * a[6]! +
    a[12]! * a[2]! * a[5]!;
  inv[3] =
    -a[1]! * a[6]! * a[11]! +
    a[1]! * a[7]! * a[10]! +
    a[5]! * a[2]! * a[11]! -
    a[5]! * a[3]! * a[10]! -
    a[9]! * a[2]! * a[7]! +
    a[9]! * a[3]! * a[6]!;
  inv[7] =
    a[0]! * a[6]! * a[11]! -
    a[0]! * a[7]! * a[10]! -
    a[4]! * a[2]! * a[11]! +
    a[4]! * a[3]! * a[10]! +
    a[8]! * a[2]! * a[7]! -
    a[8]! * a[3]! * a[6]!;
  inv[11] =
    -a[0]! * a[5]! * a[11]! +
    a[0]! * a[7]! * a[9]! +
    a[4]! * a[1]! * a[11]! -
    a[4]! * a[3]! * a[9]! -
    a[8]! * a[1]! * a[7]! +
    a[8]! * a[3]! * a[5]!;
  inv[15] =
    a[0]! * a[5]! * a[10]! -
    a[0]! * a[6]! * a[9]! +
    a[4]! * a[1]! * a[10]! -
    a[4]! * a[2]! * a[9]! +
    a[8]! * a[1]! * a[6]! -
    a[8]! * a[2]! * a[5]!;
  const det = a[0]! * inv[0]! + a[1]! * inv[4]! + a[2]! * inv[8]! + a[3]! * inv[12]!;
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  for (let i = 0; i < 16; i++) inv[i]! *= invDet;
  return inv;
}

export function mulVec4(m: Mat4, v: [number, number, number, number]): [number, number, number, number] {
  return [
    m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]! * v[3],
    m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]! * v[3],
    m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]! * v[3],
    m[3]! * v[0] + m[7]! * v[1] + m[11]! * v[2] + m[15]! * v[3],
  ];
}

export function orbitEye(yawDeg: number, pitchDeg: number, distance: number, target: Vec3 = [0, 0, 0]): Vec3 {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (Math.max(-89, Math.min(89, pitchDeg)) * Math.PI) / 180;
  const cp = Math.cos(pitch);
  return [
    target[0] + distance * Math.sin(yaw) * cp,
    target[1] + distance * Math.sin(pitch),
    target[2] + distance * Math.cos(yaw) * cp,
  ];
}

export function lightDir(yawDeg: number, pitchDeg: number): Vec3 {
  const eye = orbitEye(yawDeg, pitchDeg, 1);
  const len = Math.hypot(eye[0], eye[1], eye[2]) || 1;
  return [eye[0] / len, eye[1] / len, eye[2] / len];
}
