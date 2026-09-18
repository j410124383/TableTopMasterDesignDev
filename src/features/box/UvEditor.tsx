import { useEffect, useRef, useState } from "react";
import type { BoxFace, UvIsland } from "@/model/types";
import { BOX_FACES, FACE_LABEL, islandVisual } from "@/model/box";
import { bakeTextureFit, loadBoxTexture, type TextureFitMode } from "./boxTexture";

type Drag =
  | { kind: "pan"; x: number; y: number; panX: number; panY: number }
  | { kind: "move"; face: BoxFace; u: number; v: number; startU: number; startV: number }
  | {
      kind: "scale";
      face: BoxFace;
      w: number;
      h: number;
      sx: number;
      sy: number;
      cu: number;
      cv: number;
      rot: number;
      flipU: boolean;
      flipV: boolean;
      mode: "corner" | "x" | "y";
    }
  | { kind: "rotate"; face: BoxFace; rot: number; cu: number; cv: number; startAng: number };

type Guide = { axis: "u" | "v"; at: number };

const SNAP = 0.012;
const HANDLE = 14;

function localOf(u: number, v: number, island: UvIsland) {
  const r = ((island.rotationDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = u - island.u;
  const dy = v - island.v;
  let lx = dx * c + dy * s;
  let ly = -dx * s + dy * c;
  if (island.flipU) lx = -lx;
  if (island.flipV) ly = -ly;
  return { lx, ly };
}

function distPointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function visSize(island: UvIsland) {
  return islandVisual(island);
}

function islandCorners(island: UvIsland) {
  const vis = visSize(island);
  const r = ((island.rotationDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const pts: { x: number; y: number }[] = [];
  for (const [sx, sy] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const) {
    let x = sx * vis.w;
    let y = sy * vis.h;
    if (island.flipU) x = -x;
    if (island.flipV) y = -y;
    pts.push({ x: island.u + x * c - y * s, y: island.v + x * s + y * c });
  }
  return pts;
}

function hitIsland(u: number, v: number, island: UvIsland): boolean {
  const vis = visSize(island);
  const r = ((island.rotationDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = u - island.u;
  const dy = v - island.v;
  let lx = dx * c + dy * s;
  let ly = -dx * s + dy * c;
  if (island.flipU) lx = -lx;
  if (island.flipV) ly = -ly;
  return Math.abs(lx) <= vis.w / 2 && Math.abs(ly) <= vis.h / 2;
}

function aabb(island: UvIsland) {
  const vis = visSize(island);
  return {
    l: island.u - vis.w / 2,
    r: island.u + vis.w / 2,
    b: island.v - vis.h / 2,
    t: island.v + vis.h / 2,
  };
}

function snapMove(
  island: UvIsland,
  du: number,
  dv: number,
  faces: Record<BoxFace, UvIsland>,
  skip: BoxFace,
): { u: number; v: number; guides: Guide[] } {
  const next = { ...island, u: island.u + du, v: island.v + dv };
  const box = aabb(next);
  const targetsU = [0, 1];
  const targetsV = [0, 1];
  for (const f of BOX_FACES) {
    if (f === skip) continue;
    const o = aabb(faces[f]);
    targetsU.push(o.l, o.r);
    targetsV.push(o.b, o.t);
  }
  const guides: Guide[] = [];
  let u = next.u;
  let v = next.v;
  const trySnap = (value: number, targets: number[], apply: (delta: number) => void, axis: "u" | "v") => {
    let best = SNAP;
    let hit: number | null = null;
    for (const t of targets) {
      const d = Math.abs(value - t);
      if (d < best) {
        best = d;
        hit = t;
      }
    }
    if (hit != null) {
      apply(hit - value);
      guides.push({ axis, at: hit });
    }
  };
  trySnap(box.l, targetsU, (d) => {
    u += d;
  }, "u");
  trySnap(box.r, targetsU, (d) => {
    u += d;
  }, "u");
  trySnap(box.b, targetsV, (d) => {
    v += d;
  }, "v");
  trySnap(box.t, targetsV, (d) => {
    v += d;
  }, "v");
  return { u, v, guides };
}

export function UvEditor({
  faces,
  textureUrl,
  projectDir,
  selectedFace,
  onSelect,
  onPatch,
  snap = true,
  textureFit = "cover",
  textureTileScale = 1,
  textureRotationDeg = 0,
}: {
  faces: Record<BoxFace, UvIsland>;
  textureUrl?: string | null;
  projectDir?: string | null;
  selectedFace: BoxFace | null;
  onSelect: (face: BoxFace) => void;
  onPatch: (face: BoxFace, patch: Partial<UvIsland>, merging: boolean) => void;
  snap?: boolean;
  textureFit?: TextureFitMode;
  textureTileScale?: number;
  textureRotationDeg?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const facesRef = useRef(faces);
  const hoverRef = useRef<string>("default");
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const spaceRef = useRef(false);
  const guidesRef = useRef<Guide[]>([]);
  const [cursor, setCursor] = useState("default");
  const [texNote, setTexNote] = useState<string | null>(textureUrl ? null : "先导入印刷图");
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const selectedRef = useRef(selectedFace);
  selectedRef.current = selectedFace;
  facesRef.current = faces;

  function layout(w: number, h: number) {
    const view = viewRef.current;
    const side = Math.min(w, h) * 0.92 * view.zoom;
    const ox = w / 2 + view.panX - side / 2;
    const oy = h / 2 + view.panY - side / 2;
    return { side, ox, oy };
  }

  function toUv(px: number, py: number, w: number, h: number) {
    const { side, ox, oy } = layout(w, h);
    return { u: (px - ox) / side, v: 1 - (py - oy) / side };
  }

  function toPx(u: number, v: number, w: number, h: number) {
    const { side, ox, oy } = layout(w, h);
    return { x: ox + u * side, y: oy + (1 - v) * side, side, ox, oy };
  }

  function paint() {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#141418";
    ctx.fillRect(0, 0, w, h);
    const { side, ox, oy } = toPx(0, 1, w, h);
    ctx.fillStyle = "#0e0e12";
    ctx.fillRect(ox, oy, side, side);
    const img = imgRef.current;
    if (img) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, ox, oy, side, side);
    } else {
      const n = 8;
      const cell = side / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          ctx.fillStyle = (x + y) % 2 ? "#3a3a42" : "#2a2a32";
          ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
        }
      }
    }
    ctx.strokeStyle = "#ffffff22";
    ctx.strokeRect(ox, oy, side, side);
    for (const g of guidesRef.current) {
      ctx.strokeStyle = "#ff4dd8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (g.axis === "u") {
        const p = toPx(g.at, 0, w, h);
        ctx.moveTo(p.x, oy);
        ctx.lineTo(p.x, oy + side);
      } else {
        const p = toPx(0, g.at, w, h);
        ctx.moveTo(ox, p.y);
        ctx.lineTo(ox + side, p.y);
      }
      ctx.stroke();
    }
    for (const face of BOX_FACES) {
      const island = facesRef.current[face];
      const corners = islandCorners(island).map((p) => toPx(p.x, p.y, w, h));
      ctx.beginPath();
      ctx.moveTo(corners[0]!.x, corners[0]!.y);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
      ctx.closePath();
      const sel = face === selectedRef.current;
      ctx.fillStyle = sel ? "#c8ff0028" : "#ffffff10";
      ctx.fill();
      ctx.strokeStyle = sel ? "#c8ff00" : "#ffffff88";
      ctx.lineWidth = sel ? 2 : 1;
      ctx.stroke();
      const c = toPx(island.u, island.v, w, h);
      ctx.fillStyle = sel ? "#c8ff00" : "#eee";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(FACE_LABEL[face], c.x, c.y);
      if (sel) {
        for (const p of corners) {
          ctx.fillStyle = "#c8ff00";
          ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
        }
        for (let i = 0; i < 4; i++) {
          const a = corners[i]!;
          const b = corners[(i + 1) % 4]!;
          ctx.fillStyle = "#c8ff00";
          ctx.beginPath();
          ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        const vis = visSize(island);
        const rot = toPx(island.u, island.v + vis.h / 2 + 0.03, w, h);
        ctx.beginPath();
        ctx.arc(rot.x, rot.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#7ad0ff";
        ctx.fill();
      }
    }
  }

  function hitHandle(
    px: number,
    py: number,
    w: number,
    h: number,
    island: UvIsland,
  ): { kind: "rotate" } | { kind: "scale"; mode: "corner" | "x" | "y" } | null {
    const vis = visSize(island);
    const rot = toPx(island.u, island.v + vis.h / 2 + 0.04, w, h);
    if (Math.hypot(px - rot.x, py - rot.y) < HANDLE) return { kind: "rotate" };
    const corners = islandCorners(island).map((p) => toPx(p.x, p.y, w, h));
    if (corners.some((p) => Math.hypot(px - p.x, py - p.y) < HANDLE)) return { kind: "scale", mode: "corner" };
    const edgeHit = (i: number) => {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      return distPointSeg(px, py, a.x, a.y, b.x, b.y) < 10;
    };
    if (edgeHit(0) || edgeHit(2)) return { kind: "scale", mode: "y" };
    if (edgeHit(1) || edgeHit(3)) return { kind: "scale", mode: "x" };
    return null;
  }

  function hitCursor(px: number, py: number, w: number, h: number): string {
    const order = selectedRef.current
      ? [selectedRef.current, ...BOX_FACES.filter((f) => f !== selectedRef.current)]
      : BOX_FACES;
    for (const face of order) {
      const handle = hitHandle(px, py, w, h, facesRef.current[face]);
      if (handle?.kind === "rotate") return "grab";
      if (handle?.mode === "x") return "ew-resize";
      if (handle?.mode === "y") return "ns-resize";
      if (handle?.kind === "scale") return "nwse-resize";
    }
    const { u, v } = toUv(px, py, w, h);
    for (const face of order) {
      if (hitIsland(u, v, facesRef.current[face])) return "grab";
    }
    return "default";
  }

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const before = toUv(mx, my, wrap.clientWidth, wrap.clientHeight);
      const view = viewRef.current;
      view.zoom = Math.min(8, Math.max(0.25, view.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      const after = toUv(mx, my, wrap.clientWidth, wrap.clientHeight);
      const { side } = layout(wrap.clientWidth, wrap.clientHeight);
      view.panX += (after.u - before.u) * side;
      view.panY -= (after.v - before.v) * side;
      paint();
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    paint();
    return () => {
      ro.disconnect();
      wrap.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once; paint/layout read refs
  }, []);

  useEffect(() => {
    if (!textureUrl) {
      imgRef.current = null;
      setTexNote("先导入印刷图");
      paint();
      return;
    }
    let dead = false;
    setTexNote(null);
    void loadBoxTexture(textureUrl, projectDir)
      .then((img) => {
        if (dead) return;
        if (img.naturalWidth < 2) {
          imgRef.current = null;
          setTexNote("贴图为空");
          paint();
          return;
        }
        imgRef.current = bakeTextureFit(img, textureFit, textureTileScale, textureRotationDeg);
        setTexNote(null);
        paint();
      })
      .catch((err: unknown) => {
        if (!dead) {
          imgRef.current = null;
          setTexNote(err instanceof Error ? err.message : "贴图加载失败");
          paint();
        }
      });
    return () => {
      dead = true;
    };
  }, [textureUrl, projectDir, textureFit, textureTileScale, textureRotationDeg]);

  useEffect(() => {
    paint();
  }, [faces, selectedFace]);

  return (
    <div
      ref={wrapRef}
      className="uv-editor"
      style={{ cursor, position: "relative" }}
      onPointerMove={(e) => {
        if (dragRef.current) return;
        const wrap = wrapRef.current;
        if (!wrap) return;
        const next = hitCursor(e.clientX - wrap.getBoundingClientRect().left, e.clientY - wrap.getBoundingClientRect().top, wrap.clientWidth, wrap.clientHeight);
        if (next !== hoverRef.current) {
          hoverRef.current = next;
          setCursor(next);
        }
      }}
      onPointerDown={(e) => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;
        const rect = wrap.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        const pan = e.button === 1 || spaceRef.current;
        if (pan) {
          dragRef.current = {
            kind: "pan",
            x: e.clientX,
            y: e.clientY,
            panX: viewRef.current.panX,
            panY: viewRef.current.panY,
          };
          setCursor("grabbing");
        } else {
          const { u, v } = toUv(px, py, w, h);
          const order = selectedRef.current
            ? [selectedRef.current, ...BOX_FACES.filter((f) => f !== selectedRef.current)]
            : BOX_FACES;
          let face: BoxFace | null = null;
          let handle: ReturnType<typeof hitHandle> = null;
          for (const f of order) {
            const hnd = hitHandle(px, py, w, h, facesRef.current[f]);
            if (hnd) {
              face = f;
              handle = hnd;
              break;
            }
          }
          if (!face) {
            for (const f of order) {
              if (hitIsland(u, v, facesRef.current[f])) {
                face = f;
                break;
              }
            }
          }
          if (!face) return;
          onSelect(face);
          const island = facesRef.current[face];
          if (handle?.kind === "rotate") {
            dragRef.current = {
              kind: "rotate",
              face,
              rot: island.rotationDeg ?? 0,
              cu: island.u,
              cv: island.v,
              startAng: Math.atan2(v - island.v, u - island.u),
            };
            setCursor("grabbing");
          } else if (handle?.kind === "scale") {
            dragRef.current = {
              kind: "scale",
              face,
              w: Math.max(0.01, island.w),
              h: Math.max(0.01, island.h),
              sx: island.scaleX ?? 1,
              sy: island.scaleY ?? 1,
              cu: island.u,
              cv: island.v,
              rot: island.rotationDeg ?? 0,
              flipU: !!island.flipU,
              flipV: !!island.flipV,
              mode: handle.mode,
            };
            setCursor(handle.mode === "x" ? "ew-resize" : handle.mode === "y" ? "ns-resize" : "nwse-resize");
          } else {
            dragRef.current = { kind: "move", face, u: island.u, v: island.v, startU: u, startV: v };
            setCursor("grabbing");
          }
        }
        const move = (ev: PointerEvent) => {
          const drag = dragRef.current;
          if (!drag) return;
          if (drag.kind === "pan") {
            viewRef.current.panX = drag.panX + ev.clientX - drag.x;
            viewRef.current.panY = drag.panY + ev.clientY - drag.y;
            paint();
            return;
          }
          const { u, v } = toUv(ev.clientX - rect.left, ev.clientY - rect.top, wrap.clientWidth, wrap.clientHeight);
          if (drag.kind === "move") {
            const du = u - drag.startU;
            const dv = v - drag.startV;
            if (snapRef.current) {
              const snapped = snapMove(
                { ...facesRef.current[drag.face], u: drag.u, v: drag.v },
                du,
                dv,
                facesRef.current,
                drag.face,
              );
              guidesRef.current = snapped.guides;
              onPatch(drag.face, { u: snapped.u, v: snapped.v }, true);
            } else {
              guidesRef.current = [];
              onPatch(drag.face, { u: drag.u + du, v: drag.v + dv }, true);
            }
          } else if (drag.kind === "scale") {
            const loc = localOf(u, v, {
              u: drag.cu,
              v: drag.cv,
              w: drag.w,
              h: drag.h,
              rotationDeg: drag.rot,
              flipU: drag.flipU,
              flipV: drag.flipV,
            });
            let sx = Math.max(0.05, (2 * Math.abs(loc.lx)) / drag.w);
            let sy = Math.max(0.05, (2 * Math.abs(loc.ly)) / drag.h);
            const island = facesRef.current[drag.face];
            const uniform = island.uniformScale !== false;
            if (drag.mode === "x") sy = drag.sy;
            if (drag.mode === "y") sx = drag.sx;
            if (uniform) {
              const k = drag.mode === "y" ? sy / drag.sy : drag.mode === "x" ? sx / drag.sx : Math.max(sx / drag.sx, sy / drag.sy);
              sx = drag.sx * k;
              sy = drag.sy * k;
            }
            onPatch(drag.face, { scaleX: sx, scaleY: sy }, true);
          } else {
            const ang = Math.atan2(v - drag.cv, u - drag.cu);
            const deg = drag.rot + ((ang - drag.startAng) * 180) / Math.PI;
            onPatch(drag.face, { rotationDeg: Math.round(((deg % 360) + 360) % 360) }, true);
          }
        };
        const up = () => {
          dragRef.current = null;
          guidesRef.current = [];
          paint();
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <canvas ref={canvasRef} />
      {texNote ? (
        <p className="muted" style={{ position: "absolute", left: 12, bottom: 12, margin: 0, pointerEvents: "none" }}>
          {texNote}
        </p>
      ) : null}
    </div>
  );
}
