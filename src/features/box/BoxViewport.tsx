import { useEffect, useRef } from "react";
import type { BoxFace, BoxRenderSetup, PackagingBox } from "@/model/types";
import { BoxGl } from "./boxGl";
import { loadFittedBoxTexture } from "./boxTexture";
import { drawFilmGate, filmSize, panCameraTarget } from "./filmGate";

export function BoxViewport({
  box,
  render,
  textureSrc,
  projectDir,
  selectedFace,
  onSelectFace,
  onOrbit,
  transparentBg,
  gizmos = true,
  filmGate = false,
  className,
}: {
  box: PackagingBox;
  render: BoxRenderSetup;
  textureSrc?: string | null;
  projectDir?: string | null;
  selectedFace?: BoxFace | null;
  onSelectFace?: (face: BoxFace) => void;
  onOrbit?: (yaw: number, pitch: number, distance: number, target?: { x: number; y: number; z: number }) => void;
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
  const texRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const faceRef = useRef(selectedFace);
  const transRef = useRef(transparentBg);
  const gizmosRef = useRef(gizmos);
  const filmGateRef = useRef(filmGate);
  const onOrbitRef = useRef(onOrbit);
  boxRef.current = box;
  renderRef.current = render;
  faceRef.current = selectedFace;
  transRef.current = transparentBg;
  gizmosRef.current = gizmos;
  filmGateRef.current = filmGate;
  onOrbitRef.current = onOrbit;

  function paint() {
    const gl = glRef.current;
    const wrap = wrapRef.current;
    const overlay = overlayRef.current;
    if (!gl || !wrap) return;
    gl.draw(renderRef.current, {
      selectedFace: faceRef.current,
      transparentBg: transRef.current,
      gizmos: gizmosRef.current,
      filmGate: filmGateRef.current,
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
    if (!filmGateRef.current) return;
    const film = filmSize(renderRef.current);
    drawFilmGate(ctx, overlay.width, overlay.height, film.w, film.h, dpr);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const renderer = new BoxGl(canvas);
    glRef.current = renderer;
    renderer.setMesh(boxRef.current);
    if (texRef.current) renderer.setTextureImage(texRef.current);
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

  useEffect(() => {
    glRef.current?.setMesh(box);
    paint();
  }, [box, box.lengthMm, box.widthMm, box.heightMm, box.faces]);

  useEffect(() => {
    paint();
  }, [render]);

  useEffect(() => {
    paint();
  }, [selectedFace, transparentBg, gizmos, filmGate]);

  useEffect(() => {
    let dead = false;
    if (!textureSrc) {
      texRef.current = null;
      glRef.current?.setTextureImage(null);
      paint();
      return;
    }
    void loadFittedBoxTexture(textureSrc, projectDir, box.textureFit ?? "cover", box.textureTileScale ?? 1)
      .then((img) => {
        if (dead) return;
        texRef.current = img;
        glRef.current?.setTextureImage(img);
        paint();
      })
      .catch(() => {
        if (!dead) {
          texRef.current = null;
          glRef.current?.setTextureImage(null);
          paint();
        }
      });
    return () => {
      dead = true;
    };
  }, [textureSrc, projectDir, box.textureAssetId, box.textureFit, box.textureTileScale]);

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
        const hit = gl.pick(e.clientX - rect.left, e.clientY - rect.top);
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
    </div>
  );
}
