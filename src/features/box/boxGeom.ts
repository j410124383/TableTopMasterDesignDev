import type { BoxFace, PackagingBox, UvIsland } from "@/model/types";
import { BOX_FACES, boxBevelMm, islandVisual } from "@/model/box";

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

type Vert = { pos: Vec3; uv: [number, number]; nrm: Vec3 };

function addTri(
  pos: number[],
  uv: number[],
  nrm: number[],
  faceIndex: BoxFace[],
  a: Vert,
  b: Vert,
  c: Vert,
  face: BoxFace,
) {
  const e1: Vec3 = [b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]];
  const e2: Vec3 = [c.pos[0] - a.pos[0], c.pos[1] - a.pos[1], c.pos[2] - a.pos[2]];
  const cr = cross(e1, e2);
  const ref = a.nrm;
  const aa = a;
  let bb = b;
  let cc = c;
  if (dot(cr, ref) < 0) {
    bb = c;
    cc = b;
  }
  for (const v of [aa, bb, cc]) {
    pos.push(v.pos[0], v.pos[1], v.pos[2]);
    uv.push(v.uv[0], v.uv[1]);
    nrm.push(v.nrm[0], v.nrm[1], v.nrm[2]);
    faceIndex.push(face);
  }
}

function addQuad(
  pos: number[],
  uv: number[],
  nrm: number[],
  faceIndex: BoxFace[],
  a: Vert,
  b: Vert,
  c: Vert,
  d: Vert,
  face: BoxFace,
) {
  addTri(pos, uv, nrm, faceIndex, a, b, c, face);
  addTri(pos, uv, nrm, faceIndex, a, c, d, face);
}

function dominantFace(n: Vec3): BoxFace {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ax >= ay && ax >= az) return n[0] >= 0 ? "right" : "left";
  if (ay >= ax && ay >= az) return n[1] >= 0 ? "top" : "bottom";
  return n[2] >= 0 ? "front" : "back";
}

function boxMeshSharp(box: PackagingBox, L: number, W: number, H: number) {
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

function boxMeshRounded(box: PackagingBox, L: number, W: number, H: number, r: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const faceIndex: BoxFace[] = [];
  const hx = L / 2;
  const hy = H / 2;
  const hz = W / 2;
  const ix = hx - r;
  const iy = hy - r;
  const iz = hz - r;
  const segs = 4;
  const islandOf = (f: BoxFace) => box.faces[f];

  const inset: Record<BoxFace, { a: Vert; b: Vert; c: Vert; d: Vert }> = {
    front: (() => {
      const isl = islandOf("front");
      const n: Vec3 = [0, 0, 1];
      const v = (s: number, t: number, x: number, y: number): Vert => ({
        pos: [x, y, hz],
        uv: uvAt(isl, s, t),
        nrm: n,
      });
      return {
        a: v(r / L, r / H, -ix, -iy),
        b: v(1 - r / L, r / H, ix, -iy),
        c: v(1 - r / L, 1 - r / H, ix, iy),
        d: v(r / L, 1 - r / H, -ix, iy),
      };
    })(),
    back: (() => {
      const isl = islandOf("back");
      const n: Vec3 = [0, 0, -1];
      const v = (s: number, t: number, x: number, y: number): Vert => ({
        pos: [x, y, -hz],
        uv: uvAt(isl, s, t),
        nrm: n,
      });
      return {
        a: v(r / L, r / H, ix, -iy),
        b: v(1 - r / L, r / H, -ix, -iy),
        c: v(1 - r / L, 1 - r / H, -ix, iy),
        d: v(r / L, 1 - r / H, ix, iy),
      };
    })(),
    right: (() => {
      const isl = islandOf("right");
      const n: Vec3 = [1, 0, 0];
      const v = (s: number, t: number, z: number, y: number): Vert => ({
        pos: [hx, y, z],
        uv: uvAt(isl, s, t),
        nrm: n,
      });
      return {
        a: v(r / W, r / H, iz, -iy),
        b: v(1 - r / W, r / H, -iz, -iy),
        c: v(1 - r / W, 1 - r / H, -iz, iy),
        d: v(r / W, 1 - r / H, iz, iy),
      };
    })(),
    left: (() => {
      const isl = islandOf("left");
      const n: Vec3 = [-1, 0, 0];
      const v = (s: number, t: number, z: number, y: number): Vert => ({
        pos: [-hx, y, z],
        uv: uvAt(isl, s, t),
        nrm: n,
      });
      return {
        a: v(r / W, r / H, -iz, -iy),
        b: v(1 - r / W, r / H, iz, -iy),
        c: v(1 - r / W, 1 - r / H, iz, iy),
        d: v(r / W, 1 - r / H, -iz, iy),
      };
    })(),
    top: (() => {
      const isl = islandOf("top");
      const n: Vec3 = [0, 1, 0];
      const v = (s: number, t: number, x: number, z: number): Vert => ({
        pos: [x, hy, z],
        uv: uvAt(isl, s, t),
        nrm: n,
      });
      return {
        a: v(r / L, r / W, -ix, iz),
        b: v(1 - r / L, r / W, ix, iz),
        c: v(1 - r / L, 1 - r / W, ix, -iz),
        d: v(r / L, 1 - r / W, -ix, -iz),
      };
    })(),
    bottom: (() => {
      const isl = islandOf("bottom");
      const n: Vec3 = [0, -1, 0];
      const v = (s: number, t: number, x: number, z: number): Vert => ({
        pos: [x, -hy, z],
        uv: uvAt(isl, s, t),
        nrm: n,
      });
      return {
        a: v(r / L, r / W, -ix, -iz),
        b: v(1 - r / L, r / W, ix, -iz),
        c: v(1 - r / L, 1 - r / W, ix, iz),
        d: v(r / L, 1 - r / W, -ix, iz),
      };
    })(),
  };

  for (const face of BOX_FACES) {
    const q = inset[face];
    addQuad(pos, uv, nrm, faceIndex, q.a, q.b, q.c, q.d, face);
  }

  type Edge = { nA: Vec3; nB: Vec3; a0: Vec3; a1: Vec3; face: BoxFace; island: UvIsland; s0: number; t0: number; s1: number; t1: number };
  const edges: Edge[] = [
    { nA: [0, 0, 1], nB: [0, 1, 0], a0: [-ix, iy, iz], a1: [ix, iy, iz], face: "front", island: islandOf("front"), s0: r / L, t0: 1 - r / H, s1: 1 - r / L, t1: 1 - r / H },
    { nA: [0, 0, 1], nB: [0, -1, 0], a0: [-ix, -iy, iz], a1: [ix, -iy, iz], face: "front", island: islandOf("front"), s0: r / L, t0: r / H, s1: 1 - r / L, t1: r / H },
    { nA: [0, 0, -1], nB: [0, 1, 0], a0: [ix, iy, -iz], a1: [-ix, iy, -iz], face: "back", island: islandOf("back"), s0: r / L, t0: 1 - r / H, s1: 1 - r / L, t1: 1 - r / H },
    { nA: [0, 0, -1], nB: [0, -1, 0], a0: [ix, -iy, -iz], a1: [-ix, -iy, -iz], face: "back", island: islandOf("back"), s0: r / L, t0: r / H, s1: 1 - r / L, t1: r / H },
    { nA: [1, 0, 0], nB: [0, 1, 0], a0: [ix, iy, iz], a1: [ix, iy, -iz], face: "right", island: islandOf("right"), s0: r / W, t0: 1 - r / H, s1: 1 - r / W, t1: 1 - r / H },
    { nA: [1, 0, 0], nB: [0, -1, 0], a0: [ix, -iy, iz], a1: [ix, -iy, -iz], face: "right", island: islandOf("right"), s0: r / W, t0: r / H, s1: 1 - r / W, t1: r / H },
    { nA: [-1, 0, 0], nB: [0, 1, 0], a0: [-ix, iy, -iz], a1: [-ix, iy, iz], face: "left", island: islandOf("left"), s0: r / W, t0: 1 - r / H, s1: 1 - r / W, t1: 1 - r / H },
    { nA: [-1, 0, 0], nB: [0, -1, 0], a0: [-ix, -iy, -iz], a1: [-ix, -iy, iz], face: "left", island: islandOf("left"), s0: r / W, t0: r / H, s1: 1 - r / W, t1: r / H },
    { nA: [0, 0, 1], nB: [1, 0, 0], a0: [ix, -iy, iz], a1: [ix, iy, iz], face: "front", island: islandOf("front"), s0: 1 - r / L, t0: r / H, s1: 1 - r / L, t1: 1 - r / H },
    { nA: [0, 0, 1], nB: [-1, 0, 0], a0: [-ix, -iy, iz], a1: [-ix, iy, iz], face: "front", island: islandOf("front"), s0: r / L, t0: r / H, s1: r / L, t1: 1 - r / H },
    { nA: [0, 0, -1], nB: [1, 0, 0], a0: [ix, -iy, -iz], a1: [ix, iy, -iz], face: "back", island: islandOf("back"), s0: r / L, t0: r / H, s1: r / L, t1: 1 - r / H },
    { nA: [0, 0, -1], nB: [-1, 0, 0], a0: [-ix, -iy, -iz], a1: [-ix, iy, -iz], face: "back", island: islandOf("back"), s0: 1 - r / L, t0: r / H, s1: 1 - r / L, t1: 1 - r / H },
  ];

  const edgeVert = (e: Edge, t: number, k: number): Vert => {
    const θ = (k / segs) * (Math.PI / 2);
    const c = Math.cos(θ);
    const s = Math.sin(θ);
    const n: Vec3 = [e.nA[0] * c + e.nB[0] * s, e.nA[1] * c + e.nB[1] * s, e.nA[2] * c + e.nB[2] * s];
    const ax = e.a0[0] + (e.a1[0] - e.a0[0]) * t;
    const ay = e.a0[1] + (e.a1[1] - e.a0[1]) * t;
    const az = e.a0[2] + (e.a1[2] - e.a0[2]) * t;
    const su = e.s0 + (e.s1 - e.s0) * t;
    const tv = e.t0 + (e.t1 - e.t0) * t;
    return {
      pos: [ax + n[0] * r, ay + n[1] * r, az + n[2] * r],
      uv: uvAt(e.island, su, tv),
      nrm: n,
    };
  };

  for (const e of edges) {
    for (let k = 0; k < segs; k++) {
      const a = edgeVert(e, 0, k);
      const b = edgeVert(e, 1, k);
      const c = edgeVert(e, 1, k + 1);
      const d = edgeVert(e, 0, k + 1);
      addQuad(pos, uv, nrm, faceIndex, a, b, c, d, e.face);
    }
  }

  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const cx = sx * ix;
        const cy = sy * iy;
        const cz = sz * iz;
        const grid: Vert[][] = [];
        for (let i = 0; i <= segs; i++) {
          const row: Vert[] = [];
          const phi = (i / segs) * (Math.PI / 2);
          for (let j = 0; j <= segs; j++) {
            const theta = (j / segs) * (Math.PI / 2);
            const n: Vec3 = [
              sx * Math.sin(phi) * Math.cos(theta),
              sy * Math.cos(phi),
              sz * Math.sin(phi) * Math.sin(theta),
            ];
            const len = Math.hypot(n[0], n[1], n[2]) || 1;
            n[0] /= len;
            n[1] /= len;
            n[2] /= len;
            const face = dominantFace(n);
            const isl = islandOf(face);
            let s = 0.5;
            let t = 0.5;
            if (face === "front" || face === "back") {
              s = (cx + n[0] * r + hx) / L;
              t = (cy + n[1] * r + hy) / H;
            } else if (face === "right" || face === "left") {
              s = (sz > 0 ? hz - (cz + n[2] * r) : cz + n[2] * r + hz) / W;
              t = (cy + n[1] * r + hy) / H;
            } else {
              s = (cx + n[0] * r + hx) / L;
              t = (sz > 0 ? (cz + n[2] * r + hz) / W : 1 - (cz + n[2] * r + hz) / W);
            }
            row.push({
              pos: [cx + n[0] * r, cy + n[1] * r, cz + n[2] * r],
              uv: uvAt(isl, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, t))),
              nrm: n,
            });
          }
          grid.push(row);
        }
        for (let i = 0; i < segs; i++) {
          for (let j = 0; j < segs; j++) {
            const a = grid[i]![j]!;
            const b = grid[i]![j + 1]!;
            const c = grid[i + 1]![j + 1]!;
            const d = grid[i + 1]![j]!;
            addQuad(pos, uv, nrm, faceIndex, a, b, c, d, dominantFace(a.nrm));
          }
        }
      }
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

export type BoxMesh = {
  pos: Float32Array;
  uv: Float32Array;
  nrm: Float32Array;
  faces: BoxFace[];
  size: { L: number; W: number; H: number };
  useTex?: Float32Array;
};

export function boxMesh(box: PackagingBox): BoxMesh {
  const L = Math.max(1, box.lengthMm);
  const W = Math.max(1, box.widthMm);
  const H = Math.max(1, box.heightMm);
  const r = boxBevelMm({ ...box, lengthMm: L, widthMm: W, heightMm: H });
  if (r < 0.25) return boxMeshSharp(box, L, W, H);
  return boxMeshRounded(box, L, W, H, r);
}

/** 薄板 / 卡牌：paintFace 贴满该面，其余面采角落 */
export function slabMesh(wMm: number, hMm: number, tMm: number, paint: "front" | "top"): BoxMesh {
  const tiny: UvIsland = { u: 0.02, v: 0.02, w: 0.01, h: 0.01, scaleX: 1, scaleY: 1 };
  const full: UvIsland = { u: 0.5, v: 0.5, w: 1, h: 1, scaleX: 1, scaleY: 1 };
  const faces = {
    top: paint === "top" ? full : tiny,
    bottom: tiny,
    front: paint === "front" ? full : tiny,
    back: paint === "front" ? { ...full, flipU: true } : tiny,
    left: tiny,
    right: tiny,
  };
  return boxMesh({
    id: "slab",
    name: "slab",
    lengthMm: wMm,
    widthMm: paint === "top" ? hMm : Math.max(0.35, tMm),
    heightMm: paint === "top" ? Math.max(0.35, tMm) : hMm,
    faces,
    bevelMm: 0,
  });
}

/** 趴在 XZ 地面上的圆角薄片：宽 X、长 Z、厚 Y。顶/底用贴图，四侧 useTex=0。 */
export function roundedSlabMesh(wMm: number, dMm: number, tMm: number, cornerMm: number): BoxMesh {
  const w = Math.max(1, wMm);
  const d = Math.max(1, dMm);
  const t = Math.max(0.12, tMm);
  const r = Math.min(Math.max(0, cornerMm), w / 2 - 0.05, d / 2 - 0.05);
  const hy = t / 2;
  const ring = roundedRectRing(w, d, r, r < 0.2 ? 1 : 6);
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const faces: BoxFace[] = [];
  const use: number[] = [];
  const n = ring.length;
  const topC: Vec3 = [0, hy, 0];
  const botC: Vec3 = [0, -hy, 0];
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const ua: [number, number] = [a.x / w + 0.5, a.z / d + 0.5];
    const ub: [number, number] = [b.x / w + 0.5, b.z / d + 0.5];
    // 环在 XZ 上从 +Y 看为逆时针；顶面要从上往下看为 CCW，故 topC → b → a
    pushTri(pos, uv, nrm, faces, use, topC, [0.5, 0.5], [0, 1, 0], [b.x, hy, b.z], ub, [0, 1, 0], [a.x, hy, a.z], ua, [0, 1, 0], "top", 1);
    pushTri(
      pos, uv, nrm, faces, use,
      botC, [0.5, 0.5], [0, -1, 0],
      [a.x, -hy, a.z], [1 - ua[0], ua[1]], [0, -1, 0],
      [b.x, -hy, b.z], [1 - ub[0], ub[1]], [0, -1, 0],
      "bottom",
      2,
    );
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len;
    const nz = -dx / len;
    const nrmS: Vec3 = [nx, 0, nz];
    pushTri(pos, uv, nrm, faces, use, [a.x, hy, a.z], ua, nrmS, [b.x, hy, b.z], ub, nrmS, [b.x, -hy, b.z], ub, nrmS, "front", 0);
    pushTri(pos, uv, nrm, faces, use, [a.x, hy, a.z], ua, nrmS, [b.x, -hy, b.z], ub, nrmS, [a.x, -hy, a.z], ua, nrmS, "front", 0);
  }
  return {
    pos: new Float32Array(pos),
    uv: new Float32Array(uv),
    nrm: new Float32Array(nrm),
    faces,
    size: { L: w, W: d, H: t },
    useTex: new Float32Array(use),
  };
}

function roundedRectRing(w: number, d: number, r: number, steps: number): { x: number; z: number }[] {
  const hx = w / 2;
  const hz = d / 2;
  if (r < 0.15 || steps <= 1) {
    return [
      { x: hx, z: -hz },
      { x: hx, z: hz },
      { x: -hx, z: hz },
      { x: -hx, z: -hz },
    ];
  }
  const corners: [number, number, number, number][] = [
    [hx - r, -hz + r, -Math.PI / 2, 0],
    [hx - r, hz - r, 0, Math.PI / 2],
    [-hx + r, hz - r, Math.PI / 2, Math.PI],
    [-hx + r, -hz + r, Math.PI, (Math.PI * 3) / 2],
  ];
  const out: { x: number; z: number }[] = [];
  for (const [cx, cz, a0, a1] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
  }
  return out;
}

function pushTri(
  pos: number[],
  uv: number[],
  nrm: number[],
  faces: BoxFace[],
  use: number[],
  a: Vec3,
  au: [number, number],
  an: Vec3,
  b: Vec3,
  bu: [number, number],
  bn: Vec3,
  c: Vec3,
  cu: [number, number],
  cn: Vec3,
  face: BoxFace,
  tex: number,
) {
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  uv.push(au[0], au[1], bu[0], bu[1], cu[0], cu[1]);
  nrm.push(an[0], an[1], an[2], bn[0], bn[1], bn[2], cn[0], cn[1], cn[2]);
  faces.push(face, face, face);
  use.push(tex, tex, tex);
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

export function rayHitMesh(
  origin: Vec3,
  dir: Vec3,
  mesh: { pos: Float32Array },
): number | null {
  let best = Infinity;
  const n = mesh.pos.length / 9;
  for (let t = 0; t < n; t++) {
    const i0 = t * 9;
    const a: Vec3 = [mesh.pos[i0]!, mesh.pos[i0 + 1]!, mesh.pos[i0 + 2]!];
    const b: Vec3 = [mesh.pos[i0 + 3]!, mesh.pos[i0 + 4]!, mesh.pos[i0 + 5]!];
    const c: Vec3 = [mesh.pos[i0 + 6]!, mesh.pos[i0 + 7]!, mesh.pos[i0 + 8]!];
    const hit = rayTri(origin, dir, a, b, c);
    if (hit != null && hit < best && hit > 0.001) best = hit;
  }
  return Number.isFinite(best) ? best : null;
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

export function matOrtho(halfW: number, halfH: number, near: number, far: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1 / Math.max(1e-6, halfW);
  m[5] = 1 / Math.max(1e-6, halfH);
  m[10] = -2 / (far - near);
  m[14] = -(far + near) / (far - near);
  m[15] = 1;
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

export function matScale(x: number, y: number, z: number): Mat4 {
  const m = matIdentity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
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
