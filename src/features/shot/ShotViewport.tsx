import { useEffect, useRef, useState } from "react";
import { BoxGl, type SceneDrawItem } from "@/features/box/boxGl";
import { cameraBodyMesh, matMul, matRotateXYZ, matTranslate } from "@/features/box/boxGeom";
import { drawAxisWidget } from "@/features/box/axisWidget";
import { WorkLock } from "@/ui/WorkLock";
import type { BoxRenderSetup, ProductShotItem, ProductShotLook, Project, ShotCamera } from "@/model/types";
import { applyProductLook } from "./shotLook";
import { axisDir, drawGizmo, pickGizmo, type GizmoAxis, type GizmoMode, type GizmoSpace } from "./shotGizmo";
import { composeShotDrawItems, resolveShotItemParts, shotGeomSig, shotItemContentKey } from "./shotResolve";
import type { ShotDrawPart } from "./shotResolve";
import { drawFilmGate, filmSize, panCameraTarget } from "@/features/box/filmGate";

const CAM_MESH = cameraBodyMesh();

export type ShotDropPayload =
  | (Omit<ProductShotItem, "id" | "position" | "rotationDeg"> & Partial<Pick<ProductShotItem, "position" | "rotationDeg">>)
  | { kind: "camera" };

function cameraModel(cam: ShotCamera) {
  const r = cam.rotationDeg;
  return matMul(
    matTranslate(cam.position.x, cam.position.y, cam.position.z),
    matRotateXYZ((r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180),
  );
}

function cameraDrawItems(cameras: ShotCamera[], lookThroughId: string | undefined, selectedId: string | null): SceneDrawItem[] {
  return cameras
    .filter((c) => c.id !== lookThroughId)
    .map((c) => ({
      id: c.id,
      mesh: CAM_MESH,
      image: null,
      model: cameraModel(c),
      selected: c.id === selectedId,
      tint: c.id === selectedId ? ([0.95, 0.78, 0.28] as [number, number, number]) : ([0.4, 0.62, 0.82] as [number, number, number]),
    }));
}

function asGizmoItem(id: string, position: ShotCamera["position"], rotationDeg: ShotCamera["rotationDeg"]): ProductShotItem {
  return { id, kind: "box", refId: "", position, rotationDeg, scale: 1 };
}

export function ShotViewport({
  items,
  selectedId,
  onSelect,
  onMove,
  onTransform,
  onOrbit,
  onDropAdd,
  onCameraTransform,
  cameras = [],
  lookThroughId,
  render,
  look,
  project,
  projectDir,
  gizmos = true,
  gizmoMode = "move",
  gizmoSpace = "local",
  lookThroughName,
  lockOnLoad = true,
  pathPoints = [],
}: {
  items: ProductShotItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onTransform: (id: string, patch: Partial<Pick<ProductShotItem, "position" | "rotationDeg" | "scale">>, mergeKey?: string) => void;
  onOrbit: (yaw: number, pitch: number, distance: number, target?: { x: number; y: number; z: number }) => void;
  onDropAdd?: (payload: ShotDropPayload) => void;
  onCameraTransform?: (id: string, patch: Partial<Pick<ShotCamera, "position" | "rotationDeg">>, mergeKey?: string) => void;
  cameras?: ShotCamera[];
  lookThroughId?: string;
  lookThroughName?: string;
  render: BoxRenderSetup;
  look?: ProductShotLook | null;
  project: Project;
  projectDir?: string | null;
  gizmos?: boolean;
  gizmoMode?: GizmoMode;
  gizmoSpace?: GizmoSpace;
  /** 贴图未就绪时是否盖工作锁。影棚播放条改开合/展开时必须 false */
  lockOnLoad?: boolean;
  pathPoints?: { x: number; y: number; z: number }[];
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
  const gizmoSpaceRef = useRef(gizmoSpace);
  const onOrbitRef = useRef(onOrbit);
  const onSelectRef = useRef(onSelect);
  const onMoveRef = useRef(onMove);
  const onTransformRef = useRef(onTransform);
  const onCameraTransformRef = useRef(onCameraTransform);
  const camerasRef = useRef(cameras);
  const lookThroughRef = useRef(lookThroughId);
  const pathRef = useRef(pathPoints);
  const drawItemsRef = useRef<SceneDrawItem[]>([]);
  const meshCacheRef = useRef(new Map<string, ShotDrawPart[]>());
  const projectRef = useRef(project);
  itemsRef.current = items;
  selectedRef.current = selectedId;
  renderRef.current = render;
  lookRef.current = look;
  gizmosRef.current = gizmos;
  gizmoModeRef.current = gizmoMode;
  gizmoSpaceRef.current = gizmoSpace;
  onOrbitRef.current = onOrbit;
  onSelectRef.current = onSelect;
  onMoveRef.current = onMove;
  onTransformRef.current = onTransform;
  onCameraTransformRef.current = onCameraTransform;
  camerasRef.current = cameras;
  lookThroughRef.current = lookThroughId;
  pathRef.current = pathPoints;
  projectRef.current = project;
  const geomSig = shotGeomSig(project);
  const contentKeys = items.map((it) => shotItemContentKey(it, project)).join("|");
  const [sceneBusy, setSceneBusy] = useState(false);

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
    const drawn = [...drawItemsRef.current, ...cameraDrawItems(camerasRef.current, lookThroughRef.current, selectedRef.current)];
    const active = lookActive(lookRef.current);
    const showWorld = gizmosRef.current && !active;
    let mask: HTMLCanvasElement | null = null;
    if (active && lookRef.current?.outline?.enabled) {
      gl.drawScene(setup, drawn, { gizmos: false, silhouette: true, transparentBg: false, filmGate: true });
      mask = document.createElement("canvas");
      mask.width = gl.canvas.width;
      mask.height = gl.canvas.height;
      mask.getContext("2d")!.drawImage(gl.canvas, 0, 0);
    }
    const camGizmos = camerasRef.current
      .filter((c) => c.id !== lookThroughRef.current)
      .map((c) => ({
        position: c.position,
        rotationDeg: c.rotationDeg,
        fov: c.fov,
        projection: c.projection,
        selected: c.id === selectedRef.current,
      }));
    const pathLines = (pathRef.current ?? []).slice(0, -1).map((a, i) => {
      const b = pathRef.current[i + 1]!;
      return {
        a: [a.x, a.y, a.z] as [number, number, number],
        b: [b.x, b.y, b.z] as [number, number, number],
        rgb: [1, 0.86, 0.28] as [number, number, number],
      };
    });
    gl.drawScene(setup, drawn, {
      gizmos: showWorld,
      transparentBg: setup.cullBackground,
      groundY: 0,
      filmGate: gizmosRef.current,
      cameras: showWorld ? camGizmos : [],
      pathLines: showWorld ? pathLines : [],
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
    const film = filmSize(setup);
    const dpr = view.width / Math.max(1, r.width);
    if (gizmosRef.current) drawFilmGate(vctx, view.width, view.height, film.w, film.h, dpr);
    if (gizmosRef.current && !active) {
      drawAxisWidget(vctx, r.width, r.height, dpr, setup.camera.yaw, setup.camera.pitch);
    }
    if (gizmosRef.current) {
      const selected = itemsRef.current.find((it) => it.id === selectedRef.current);
      const cam = camerasRef.current.find((c) => c.id === selectedRef.current);
      const gizmoItem = selected ?? (cam ? asGizmoItem(cam.id, cam.position, cam.rotationDeg) : null);
      const mode = cam && gizmoModeRef.current === "scale" ? "move" : gizmoModeRef.current;
      if (gizmoItem) {
        vctx.setTransform(view.width / r.width, 0, 0, view.height / r.height, 0, 0);
        drawGizmo(vctx, gl, gizmoItem, mode, gizmoSpaceRef.current);
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
    if (!missing.length) {
      setSceneBusy(false);
      return;
    }
    if (lockOnLoad) setSceneBusy(true);
    void (async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (dead) return;
      for (const item of missing) {
        const live = itemsRef.current.find((it) => it.id === item.id) ?? item;
        const key = shotItemContentKey(live, projectRef.current);
        const parts = await resolveShotItemParts(live, projectRef.current, projectDir, { dpi: 56 });
        if (dead) return;
        const now = itemsRef.current.find((it) => it.id === item.id) ?? live;
        const keyNow = shotItemContentKey(now, projectRef.current);
        if (keyNow !== key) continue;
        cache.set(key, parts);
      }
      if (dead) return;
      drawItemsRef.current = composeShotDrawItems(itemsRef.current, selectedRef.current, projectRef.current, cache);
      setSceneBusy(false);
      void paint();
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKeys, projectDir, geomSig, lockOnLoad]);

  useEffect(() => {
    const cache = meshCacheRef.current;
    drawItemsRef.current = composeShotDrawItems(items, selectedId, project, cache);
    void paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId, contentKeys, geomSig, cameras, lookThroughId]);

  useEffect(() => {
    void paint();
  }, [render, look, gizmos, gizmoMode, gizmoSpace, cameras, lookThroughId, pathPoints]);

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
        const startX = e.clientX;
        const startY = e.clientY;
        const cam = renderRef.current.camera;
        const yaw0 = cam.yaw;
        const pitch0 = cam.pitch;
        const dist0 = cam.distance;
        if (e.button === 1 || (e.altKey && e.button === 0)) {
          e.preventDefault();
          const move = (ev: PointerEvent) => {
            const next = panCameraTarget(cam, ev.clientX - startX, ev.clientY - startY);
            onOrbitRef.current(yaw0, pitch0, dist0, next);
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          return;
        }
        const selectedItem = itemsRef.current.find((it) => it.id === selectedRef.current);
        const selectedCam = camerasRef.current.find((c) => c.id === selectedRef.current);
        const gizmoSrc = selectedItem ?? (selectedCam ? asGizmoItem(selectedCam.id, selectedCam.position, selectedCam.rotationDeg) : null);
        const mode = selectedCam && gizmoModeRef.current === "scale" ? "move" : gizmoModeRef.current;
        let handle: GizmoAxis | null = null;
        if (gizmosRef.current && gizmoSrc) {
          handle = pickGizmo(gl, gizmoSrc, mode, hx, hy, gizmoSpaceRef.current);
        }
        const world = [...drawItemsRef.current, ...cameraDrawItems(camerasRef.current, lookThroughRef.current, selectedRef.current)];
        const hit = handle ? gizmoSrc!.id : gl.pickScene(hx, hy, world);
        if (handle) {
          /* keep current selection */
        } else if (hit) {
          onSelectRef.current(hit);
        }
        const item0 = itemsRef.current.find((it) => it.id === (handle ? gizmoSrc!.id : hit));
        const cam0 = camerasRef.current.find((c) => c.id === (handle ? gizmoSrc!.id : hit));
        const pos0 = { ...((item0 ?? cam0)?.position ?? { x: 0, y: 0, z: 0 }) };
        const rot0 = { ...((item0 ?? cam0)?.rotationDeg ?? { x: 0, y: 0, z: 0 }) };
        const scale0 = item0?.scale ?? 1;
        const movingBody = mode === "move" && !handle && hit && selectedRef.current === hit;
        const space = gizmoSpaceRef.current;
        const gizmoItem0 = item0 ?? (cam0 ? asGizmoItem(cam0.id, cam0.position, cam0.rotationDeg) : null);
        const applyPos = (id: string, position: { x: number; y: number; z: number }, key: string) => {
          if (cam0 && cam0.id === id) onCameraTransformRef.current?.(id, { position }, key);
          else onTransformRef.current(id, { position }, key);
        };
        const applyRot = (id: string, rotationDeg: { x: number; y: number; z: number }, key: string) => {
          if (cam0 && cam0.id === id) onCameraTransformRef.current?.(id, { rotationDeg }, key);
          else onTransformRef.current(id, { rotationDeg }, key);
        };
        const move = (ev: PointerEvent) => {
          if (handle && (item0 || cam0)) {
            const id = (item0 ?? cam0)!.id;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (mode === "move" && handle !== "uniform") {
              const dir = axisDir(handle, gizmoItem0 ?? undefined, space);
              const len = 72 * (item0?.scale ?? 1);
              const o = gl.projectWorld([pos0.x, pos0.y, pos0.z]);
              const tip = gl.projectWorld([pos0.x + dir[0] * len, pos0.y + dir[1] * len, pos0.z + dir[2] * len]);
              if (o && tip) {
                const sx = tip.x - o.x;
                const sy = tip.y - o.y;
                const denom = sx * sx + sy * sy || 1;
                const t = (dx * sx + (ev.clientY - startY) * sy) / denom;
                applyPos(
                  id,
                  {
                    x: pos0.x + dir[0] * t * len,
                    y: pos0.y + dir[1] * t * len,
                    z: pos0.z + dir[2] * t * len,
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
              applyRot(id, { ...rot0, [handle]: rot0[handle] + deg }, "shot-gizmo-rot");
              return;
            }
            if (!cam0) onTransformRef.current(id, { scale: Math.max(0.2, Math.min(3, scale0 * (1 - dy * 0.008))) }, "shot-gizmo-scale");
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
          if (movingBody && hit && cam0) {
            const ray = gl.worldRay(ev.clientX - rect.left, ev.clientY - rect.top);
            if (!ray || Math.abs(ray.dir[1]) < 1e-4) return;
            const t = (cam0.position.y - ray.origin[1]) / ray.dir[1];
            if (t <= 0) return;
            onCameraTransformRef.current?.(hit, {
              position: { x: ray.origin[0] + ray.dir[0] * t, y: cam0.position.y, z: ray.origin[2] + ray.dir[2] * t },
            }, "shot-gizmo-move");
            return;
          }
          onOrbitRef.current(yaw0 - (ev.clientX - startX) * 0.4, Math.max(-80, Math.min(80, pitch0 + (ev.clientY - startY) * 0.35)), dist0);
        };
        let dragged = false;
        const trackMove = (ev: PointerEvent) => {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) dragged = true;
          move(ev);
        };
        const up = () => {
          window.removeEventListener("pointermove", trackMove);
          window.removeEventListener("pointerup", up);
          if (!handle && !hit && !dragged) onSelectRef.current(null);
        };
        window.addEventListener("pointermove", trackMove);
        window.addEventListener("pointerup", up);
      }}
    >
      <canvas ref={glCanvasRef} className="shot-gl-offscreen" />
      <canvas ref={viewRef} />
      {lookThroughName ? <div className="shot-cam-hud">看穿：{lookThroughName}</div> : null}
      <WorkLock open={sceneBusy} title="正在加载场景预览" detail="准备模型与贴图，完成后即可继续摆放。" />
    </div>
  );
}
