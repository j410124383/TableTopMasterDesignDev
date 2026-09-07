import { useEffect, useRef } from "react";
import type { BoxFace, BoxRenderSetup, PackagingBox } from "@/model/types";
import { BoxGl } from "./boxGl";
import { loadFittedBoxTexture } from "./boxTexture";

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
  className,
}: {
  box: PackagingBox;
  render: BoxRenderSetup;
  textureSrc?: string | null;
  projectDir?: string | null;
  selectedFace?: BoxFace | null;
  onSelectFace?: (face: BoxFace) => void;
  onOrbit?: (yaw: number, pitch: number, distance: number) => void;
  transparentBg?: boolean;
  gizmos?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<BoxGl | null>(null);
  const boxRef = useRef(box);
  const renderRef = useRef(render);
  const texRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const faceRef = useRef(selectedFace);
  const transRef = useRef(transparentBg);
  const gizmosRef = useRef(gizmos);
  const onOrbitRef = useRef(onOrbit);
  boxRef.current = box;
  renderRef.current = render;
  faceRef.current = selectedFace;
  transRef.current = transparentBg;
  gizmosRef.current = gizmos;
  onOrbitRef.current = onOrbit;

  function paint() {
    const gl = glRef.current;
    if (!gl) return;
    gl.draw(renderRef.current, {
      selectedFace: faceRef.current,
      transparentBg: transRef.current,
      gizmos: gizmosRef.current,
    });
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
  }, [selectedFace, transparentBg, gizmos]);

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
        const rect = canvas.getBoundingClientRect();
        const hit = gl.pick(e.clientX - rect.left, e.clientY - rect.top);
        if (hit && onSelectFace) onSelectFace(hit);
        const startX = e.clientX;
        const startY = e.clientY;
        const cam = renderRef.current.camera;
        const yaw0 = cam.yaw;
        const pitch0 = cam.pitch;
        const dist0 = cam.distance;
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
    </div>
  );
}
