import { useEffect, useRef } from "react";
import { BOX_FACES, boxLidLiftVec, boxLidOpen, boxModeOf } from "@/model/box";
import type { BoxFace, BoxRenderSetup, PackagingBox, UvIsland } from "@/model/types";
import { boxPoseModel, matMul, matTranslate } from "./boxGeom";
import { BoxGl, type SceneDrawItem } from "./boxGl";
import { loadPackagingLayerTextures, packagingItemsWithTextures, packagingLookOf, type PackagingLayerTex } from "./boxDraw";
import { drawAxisWidget } from "./axisWidget";
import { drawFilmGate, filmSize, panCameraTarget } from "./filmGate";

function uvSig(faces?: Record<BoxFace, UvIsland>) {
  if (!faces) return "";
  return BOX_FACES.map((f) => {
    const i = faces[f];
    return i
      ? `${f}:${i.u},${i.v},${i.w},${i.h},${i.scaleX ?? 1},${i.scaleY ?? 1},${i.rotationDeg ?? 0},${i.flipU ? 1 : 0},${i.flipV ? 1 : 0}`
      : f;
  }).join(";");
}

function boxMeshSig(box: PackagingBox) {
  return [
    box.mode,
    box.sleeve ?? "",
    box.lengthMm,
    box.widthMm,
    box.heightMm,
    box.lidHeightMm ?? "",
    box.baseHeightMm ?? "",
    box.wallMm ?? "",
    box.lidFitMm ?? "",
    box.lidNotchUpDown ? 1 : 0,
    box.lidNotchLeftRight ? 1 : 0,
    box.lidNotchRadiusMm ?? "",
    box.bevelMm ?? "",
    uvSig(box.faces),
    uvSig(box.lid?.faces),
    uvSig(box.lid?.innerFaces),
    uvSig(box.base?.faces),
    uvSig(box.base?.innerFaces),
  ].join("|");
}

function boxPrintIds(box: PackagingBox) {
  return [
    box.textureAssetId,
    box.foilMaskAssetId,
    box.varnishMaskAssetId,
    box.lid?.textureAssetId,
    box.lid?.innerTextureAssetId,
    box.lid?.foilMaskAssetId,
    box.lid?.varnishMaskAssetId,
    box.base?.textureAssetId,
    box.base?.innerTextureAssetId,
    box.base?.foilMaskAssetId,
    box.base?.varnishMaskAssetId,
  ].filter((id): id is string => !!id);
}

function boxHasPrints(box: PackagingBox) {
  return boxPrintIds(box).length > 0;
}

function boxTexSig(box: PackagingBox, assets?: Record<string, string>) {
  const p = (m?: {
    textureAssetId?: string;
    innerTextureAssetId?: string;
    textureFit?: string;
    innerTextureFit?: string;
    textureTileScale?: number;
    innerTextureTileScale?: number;
    textureRotationDeg?: number;
    innerTextureRotationDeg?: number;
    foilMaskAssetId?: string;
    varnishMaskAssetId?: string;
  }) =>
    [
      m?.textureAssetId ?? "",
      m?.innerTextureAssetId ?? "",
      m?.textureFit ?? "",
      m?.innerTextureFit ?? "",
      m?.textureTileScale ?? "",
      m?.innerTextureTileScale ?? "",
      m?.textureRotationDeg ?? "",
      m?.innerTextureRotationDeg ?? "",
      m?.foilMaskAssetId ?? "",
      m?.varnishMaskAssetId ?? "",
    ].join(":");
  const urls = boxPrintIds(box)
    .map((id) => `${id}=${assets?.[id] ?? ""}`)
    .join(";");
  return [
    box.mode,
    box.textureAssetId ?? "",
    box.textureFit ?? "",
    box.textureTileScale ?? "",
    box.textureRotationDeg ?? "",
    box.foilMaskAssetId ?? "",
    box.varnishMaskAssetId ?? "",
    p(box.lid),
    p(box.base),
    urls,
  ].join("|");
}

function withLidPreview(items: SceneDrawItem[], box: PackagingBox, open: number, model: ReturnType<typeof boxPoseModel>): SceneDrawItem[] {
  const lift = boxLidLiftVec(box, open);
  const lidModel = lift[0] || lift[1] || lift[2] ? matMul(model, matTranslate(lift[0], lift[1], lift[2])) : model;
  return items.map((it) => ({
    ...it,
    model: it.id.includes(":lid:") ? lidModel : model,
  }));
}

export function BoxViewport({
  box,
  render,
  assets,
  projectDir,
  selectedFace,
  outlinePartId,
  onSelectFace,
  lidOpen,
  onLidOpen,
  onLidPreview,
  onOrbit,
  onBusyChange,
  transparentBg,
  gizmos = true,
  filmGate = false,
  className,
}: {
  box: PackagingBox;
  render: BoxRenderSetup;
  assets?: Record<string, string>;
  projectDir?: string | null;
  selectedFace?: BoxFace | null;
  outlinePartId?: string | null;
  onSelectFace?: (face: BoxFace) => void;
  lidOpen?: number;
  onLidOpen?: (open: number) => void;
  onLidPreview?: (open: number) => void;
  onOrbit?: (yaw: number, pitch: number, distance: number, target?: { x: number; y: number; z: number }) => void;
  onBusyChange?: (busy: boolean) => void;
  transparentBg?: boolean;
  gizmos?: boolean;
  filmGate?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<BoxGl | null>(null);
  const boxRef = useRef(box);
  const renderRef = useRef(render);
  const itemsRef = useRef<SceneDrawItem[]>([]);
  const faceRef = useRef(selectedFace);
  const outlineRef = useRef(outlinePartId);
  const transRef = useRef(transparentBg);
  const gizmosRef = useRef(gizmos);
  const filmGateRef = useRef(filmGate);
  const onOrbitRef = useRef(onOrbit);
  const onBusyRef = useRef(onBusyChange);
  const lidOpenRef = useRef(lidOpen);
  const loadGen = useRef(0);
  const texRef = useRef<Map<string, PackagingLayerTex>>(new Map());
  const assetsRef = useRef(assets);
  const projectDirRef = useRef(projectDir);
  boxRef.current = box;
  renderRef.current = render;
  faceRef.current = selectedFace;
  outlineRef.current = outlinePartId;
  transRef.current = transparentBg;
  gizmosRef.current = gizmos;
  filmGateRef.current = filmGate;
  onOrbitRef.current = onOrbit;
  onBusyRef.current = onBusyChange;
  lidOpenRef.current = lidOpen;
  assetsRef.current = assets;
  projectDirRef.current = projectDir;

  function liveItems() {
    const live = boxRef.current;
    const setup = renderRef.current;
    const model = boxPoseModel(setup.position, setup.rotationDeg);
    const open = lidOpenRef.current ?? boxLidOpen(live);
    const look = packagingLookOf(live);
    return withLidPreview(
      itemsRef.current.map((it) => ({ ...it, look })),
      live,
      open,
      model,
    );
  }

  function paint() {
    const gl = glRef.current;
    const wrap = wrapRef.current;
    const overlay = overlayRef.current;
    if (!gl || !wrap) return;
    const live = boxRef.current;
    const setup = renderRef.current;
    const items = liveItems();
    gl.drawScene(setup, items, {
      selectedFace: faceRef.current,
      outlineItemId: outlineRef.current,
      transparentBg: transRef.current,
      gizmos: gizmosRef.current,
      filmGate: filmGateRef.current,
      groundY: -live.heightMm / 2,
      gridSize: Math.max(80, Math.max(live.lengthMm, live.widthMm) * 1.6),
    });
    if (!overlay) return;
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    overlay.width = Math.max(1, Math.round(r.width * dpr));
    overlay.height = Math.max(1, Math.round(r.height * dpr));
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (gizmosRef.current) drawAxisWidget(ctx, r.width, r.height, dpr, setup.camera.yaw, setup.camera.pitch);
    if (!filmGateRef.current) return;
    const film = filmSize(setup);
    drawFilmGate(ctx, overlay.width, overlay.height, film.w, film.h, dpr);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const renderer = new BoxGl(canvas);
    glRef.current = renderer;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      renderer.setSize(r.width, r.height);
      paint();
    });
    ro.observe(wrap);
    const r = wrap.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height));
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = renderRef.current.camera;
      const next = Math.max(40, Math.min(2000, cam.distance * (e.deltaY > 0 ? 1.08 : 0.92)));
      onOrbitRef.current?.(cam.yaw, cam.pitch, next);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    paint();
    return () => {
      wrap.removeEventListener("wheel", onWheel);
      ro.disconnect();
      renderer.dispose();
      glRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  function assemble() {
    const live = boxRef.current;
    itemsRef.current = packagingItemsWithTextures(live, boxPoseModel(renderRef.current.position, renderRef.current.rotationDeg), texRef.current, 0);
    paint();
  }

  const meshSig = boxMeshSig(box);
  const texSig = boxTexSig(box, assets);

  useEffect(() => {
    assemble();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshSig]);

  useEffect(() => {
    let dead = false;
    const gen = ++loadGen.current;
    const live = boxRef.current;
    const lock = boxHasPrints(live);
    onBusyRef.current?.(lock);
    void loadPackagingLayerTextures(live, assetsRef.current ?? {}, projectDirRef.current)
      .then((tex) => {
        if (dead || gen !== loadGen.current) return;
        texRef.current = tex;
        assemble();
        onBusyRef.current?.(false);
      })
      .catch(() => {
        if (dead || gen !== loadGen.current) return;
        onBusyRef.current?.(false);
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texSig]);

  useEffect(() => {
    return () => onBusyRef.current?.(false);
  }, []);

  useEffect(() => {
    paint();
  }, [render, selectedFace, outlinePartId, transparentBg, gizmos, filmGate, lidOpen, box.material]);

  const shownOpen = lidOpen ?? boxLidOpen(box);
  function commitOpen(n: number) {
    onLidPreview?.(n);
    onLidOpen?.(n);
  }

  return (
    <div
      ref={wrapRef}
      className={className ?? "box-viewport"}
      onPointerDown={(e) => {
        const canvas = canvasRef.current;
        const gl = glRef.current;
        if (!canvas || !gl) return;
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
            onOrbitRef.current?.(yaw0, pitch0, dist0, next);
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const items = liveItems();
        const hit = gl.pickFace(e.clientX - rect.left, e.clientY - rect.top, items, outlineRef.current);
        if (hit && onSelectFace) onSelectFace(hit);
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          onOrbitRef.current?.(yaw0 - dx * 0.4, Math.max(-80, Math.min(80, pitch0 + dy * 0.35)), dist0);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <canvas ref={canvasRef} />
      <canvas ref={overlayRef} className="film-gate-overlay" />
      {onLidOpen && boxModeOf(box) === "lidBase" ? (
        <div className="box-lid-dock" onPointerDown={(e) => e.stopPropagation()}>
          <div className="row">
            <button
              type="button"
              className={`btn btn-small ${shownOpen < 0.05 ? "btn-primary" : ""}`}
              onClick={() => commitOpen(0)}
            >
              合上
            </button>
            <button
              type="button"
              className={`btn btn-small ${shownOpen > 0.95 ? "btn-primary" : ""}`}
              onClick={() => commitOpen(1)}
            >
              打开
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={shownOpen}
            onChange={(e) => onLidPreview?.(Number(e.target.value))}
            onPointerUp={(e) => commitOpen(Number((e.target as HTMLInputElement).value))}
            onPointerCancel={(e) => commitOpen(Number((e.currentTarget as HTMLInputElement).value))}
          />
        </div>
      ) : null}
    </div>
  );
}
