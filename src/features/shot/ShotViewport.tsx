import { useEffect, useRef } from "react";
import { BoxGl, type SceneDrawItem } from "@/features/box/boxGl";
import type { BoxRenderSetup, ProductShotItem, ProductShotLook, Project } from "@/model/types";
import { applyProductLook } from "./shotLook";
import { axisDir, drawGizmo, pickGizmo, type GizmoAxis, type GizmoMode } from "./shotGizmo";
import { itemModel, resolveShotDrawItems, shotGeomSig, shotItemContentKey, stubShotDrawItem } from "./shotResolve";

export function ShotViewport({
  items,
  selectedId,
  onSelect,
  onMove,
  onTransform,
  onOrbit,
  onDropAdd,
  render,
  look,
  project,
  projectDir,
  gizmos = true,
  gizmoMode = "move",
}: {
  items: ProductShotItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onTransform: (id: string, patch: Partial<Pick<ProductShotItem, "position" | "rotationDeg" | "scale">>, mergeKey?: string) => void;
  onOrbit: (yaw: number, pitch: number, distance: number) => void;
  onDropAdd?: (payload: Omit<ProductShotItem, "id" | "position" | "rotationDeg">) => void;
  render: BoxRenderSetup;
  look?: ProductShotLook | null;
  project: Project;
  projectDir?: string | null;
  gizmos?: boolean;
  gizmoMode?: GizmoMode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<BoxGl | null>(null);
  const itemsRef = useRef(items);
  const selectedRef = useRef(selectedId);
  const renderRef = useRef(render);
  const lookRef = useRef(look);
  const gizmosRef = useRef(gizmos);
  const gizmoModeRef = useRef(gizmoMode);
  const onOrbitRef = useRef(onOrbit);
  const onSelectRef = useRef(onSelect);
  const onMoveRef = useRef(onMove);
  const onTransformRef = useRef(onTransform);
  const drawItemsRef = useRef<SceneDrawItem[]>([]);
  const meshCacheRef = useRef(
    new Map<string, { mesh: SceneDrawItem["mesh"]; image: SceneDrawItem["image"]; backImage?: SceneDrawItem["backImage"]; tint?: SceneDrawItem["tint"] }>(),
  );
  const projectRef = useRef(project);
  itemsRef.current = items;
  selectedRef.current = selectedId;
  renderRef.current = render;
  lookRef.current = look;
  gizmosRef.current = gizmos;
  gizmoModeRef.current = gizmoMode;
  onOrbitRef.current = onOrbit;
  onSelectRef.current = onSelect;
  onMoveRef.current = onMove;
  onTransformRef.current = onTransform;
  projectRef.current = project;
  const geomSig = shotGeomSig(project);
  const contentKeys = items.map((it) => shotItemContentKey(it, project)).join("|");

  function lookActive(l?: ProductShotLook | null) {
    if (!l) return false;
    if (l.outline?.enabled) return true;
    if ((l.vignette ?? 0) > 0.001 || (l.bloom ?? 0) > 0.001 || (l.blur ?? 0) > 0.001) return true;
    if ((l.exposure ?? 1) !== 1 || (l.contrast ?? 1) !== 1 || (l.saturation ?? 1) !== 1) return true;
    return false;
  }

  async function paint() {
    const gl = glRef.current;
    const view = viewRef.current;
    const wrap = wrapRef.current;
    if (!gl || !view || !wrap) return;
    const r = wrap.getBoundingClientRect();
    gl.setSize(Math.max(1, r.width), Math.max(1, r.height));
    view.width = gl.canvas.width;
    view.height = gl.canvas.height;
    view.style.width = `${r.width}px`;
    view.style.height = `${r.height}px`;
    const setup = renderRef.current;
    const drawn = drawItemsRef.current;
    const active = lookActive(lookRef.current);
    const showWorld = gizmosRef.current && !active;
    let mask: HTMLCanvasElement | null = null;
    if (active && lookRef.current?.outline?.enabled) {
      gl.drawScene(setup, drawn, { gizmos: false, silhouette: true, transparentBg: false });
      mask = document.createElement("canvas");
      mask.width = gl.canvas.width;
      mask.height = gl.canvas.height;
      mask.getContext("2d")!.drawImage(gl.canvas, 0, 0);
    }
    gl.drawScene(setup, drawn, {
      gizmos: showWorld,
      transparentBg: setup.cullBackground,
      groundY: 0,
    });
    const vctx = view.getContext("2d");
    if (!vctx) return;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, view.width, view.height);
    if (active) {
      const processed = applyProductLook(gl.canvas, lookRef.current, mask);
      vctx.drawImage(processed, 0, 0);
    } else {
      vctx.drawImage(gl.canvas, 0, 0);
    }
    if (gizmosRef.current) {
      const selected = itemsRef.current.find((it) => it.id === selectedRef.current);
      if (selected) {
        vctx.setTransform(view.width / r.width, 0, 0, view.height / r.height, 0, 0);
        drawGizmo(vctx, gl, selected, gizmoModeRef.current);
        vctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  }

  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    const wrap = wrapRef.current;
    if (!glCanvas || !wrap) return;
    const renderer = new BoxGl(glCanvas);
    glRef.current = renderer;
    const ro = new ResizeObserver(() => {
      void paint();
    });
    ro.observe(wrap);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = renderRef.current.camera;
      const next = Math.max(40, Math.min(2400, cam.distance * (e.deltaY > 0 ? 1.08 : 0.92)));
      onOrbitRef.current(cam.yaw, cam.pitch, next);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      wrap.removeEventListener("wheel", onWheel);
      ro.disconnect();
      renderer.dispose();
      glRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let dead = false;
    const cache = meshCacheRef.current;
    const missing = itemsRef.current.filter((it) => !cache.has(shotItemContentKey(it, projectRef.current)));
    if (!missing.length) return;
    void (async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (dead) return;
      const drawn = await resolveShotDrawItems(missing, null, projectRef.current, projectDir, { dpi: 56 });
      if (dead) return;
      for (const item of missing) {
        const d = drawn.find((x) => x.id === item.id);
        if (d) cache.set(shotItemContentKey(item, projectRef.current), { mesh: d.mesh, image: d.image, backImage: d.backImage, tint: d.tint });
      }
      drawItemsRef.current = itemsRef.current.map((it) => {
        const hit = cache.get(shotItemContentKey(it, projectRef.current));
        if (hit) {
          return {
            id: it.id,
            mesh: hit.mesh,
            image: hit.image,
            backImage: hit.backImage,
            tint: hit.tint,
            model: itemModel(it),
            selected: it.id === selectedRef.current,
          };
        }
        return stubShotDrawItem(it, selectedRef.current, projectRef.current);
      });
      void paint();
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKeys, projectDir, geomSig]);

  useEffect(() => {
    const cache = meshCacheRef.current;
    drawItemsRef.current = items.map((it) => {
      const hit = cache.get(shotItemContentKey(it, project));
      if (hit) {
        return {
          id: it.id,
          mesh: hit.mesh,
          image: hit.image,
          backImage: hit.backImage,
          tint: hit.tint,
          model: itemModel(it),
          selected: it.id === selectedId,
        };
      }
      return stubShotDrawItem(it, selectedId, project);
    });
    void paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId]);

  useEffect(() => {
    void paint();
  }, [render, look, gizmos, gizmoMode]);

  return (
    <div
      ref={wrapRef}
      className="box-viewport shot-viewport"
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("application/x-tmd-shot")) e.preventDefault();
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData("application/x-tmd-shot");
        if (!raw || !onDropAdd) return;
        e.preventDefault();
        try {
          onDropAdd(JSON.parse(raw));
        } catch {
          /* ignore */
        }
      }}
      onPointerDown={(e) => {
        const gl = glRef.current;
        const wrap = wrapRef.current;
        if (!gl || !wrap) return;
        const rect = wrap.getBoundingClientRect();
        const hx = e.clientX - rect.left;
        const hy = e.clientY - rect.top;
        const selected = itemsRef.current.find((it) => it.id === selectedRef.current);
        let handle: GizmoAxis | null = null;
        if (gizmosRef.current && selected) {
          handle = pickGizmo(gl, selected, gizmoModeRef.current, hx, hy);
        }
        const hit = handle ? selected!.id : gl.pickScene(hx, hy, drawItemsRef.current);
        if (!handle) onSelectRef.current(hit);
        const startX = e.clientX;
        const startY = e.clientY;
        const cam = renderRef.current.camera;
        const yaw0 = cam.yaw;
        const pitch0 = cam.pitch;
        const dist0 = cam.distance;
        const item0 = itemsRef.current.find((it) => it.id === (handle ? selected!.id : hit));
        const pos0 = { ...(item0?.position ?? { x: 0, y: 0, z: 0 }) };
        const rot0 = { ...(item0?.rotationDeg ?? { x: 0, y: 0, z: 0 }) };
        const scale0 = item0?.scale ?? 1;
        const mode = gizmoModeRef.current;
        const movingBody = mode === "move" && !handle && hit && selectedRef.current === hit;
        const move = (ev: PointerEvent) => {
          if (handle && item0) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (mode === "move" && handle !== "uniform") {
              const dir = axisDir(handle);
              const len = 72 * (item0.scale ?? 1);
              const o = gl.projectWorld([pos0.x, pos0.y, pos0.z]);
              const tip = gl.projectWorld([pos0.x + dir[0] * len, pos0.y + dir[1] * len, pos0.z + dir[2] * len]);
              if (o && tip) {
                const sx = tip.x - o.x;
                const sy = tip.y - o.y;
                const denom = sx * sx + sy * sy || 1;
                const t = (dx * sx + (ev.clientY - startY) * sy) / denom;
                onTransformRef.current(
                  item0.id,
                  {
                    position: {
                      x: pos0.x + dir[0] * t * len,
                      y: pos0.y + dir[1] * t * len,
                      z: pos0.z + dir[2] * t * len,
                    },
                  },
                  "shot-gizmo-move",
                );
              }
              return;
            }
            if (mode === "rotate" && handle !== "uniform") {
              const o = gl.projectWorld([pos0.x, pos0.y, pos0.z]);
              if (!o) return;
              const a0 = Math.atan2(startY - rect.top - o.y, startX - rect.left - o.x);
              const a1 = Math.atan2(ev.clientY - rect.top - o.y, ev.clientX - rect.left - o.x);
              const deg = ((a1 - a0) * 180) / Math.PI;
              onTransformRef.current(
                item0.id,
                { rotationDeg: { ...rot0, [handle]: rot0[handle] + deg } },
                "shot-gizmo-rot",
              );
              return;
            }
            const next = Math.max(0.2, Math.min(3, scale0 * (1 - dy * 0.008)));
            onTransformRef.current(item0.id, { scale: next }, "shot-gizmo-scale");
            return;
          }
          if (movingBody && hit && item0) {
            const ray = gl.worldRay(ev.clientX - rect.left, ev.clientY - rect.top);
            if (!ray || Math.abs(ray.dir[1]) < 1e-4) return;
            const t = (item0.position.y - ray.origin[1]) / ray.dir[1];
            if (t <= 0) return;
            const x = ray.origin[0] + ray.dir[0] * t;
            const z = ray.origin[2] + ray.dir[2] * t;
            onMoveRef.current(hit, x, z);
            return;
          }
          onOrbitRef.current(yaw0 - (ev.clientX - startX) * 0.4, Math.max(-80, Math.min(80, pitch0 + (ev.clientY - startY) * 0.35)), dist0);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <canvas ref={glCanvasRef} className="shot-gl-offscreen" />
      <canvas ref={viewRef} />
    </div>
  );
}
