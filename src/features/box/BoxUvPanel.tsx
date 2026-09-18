import { useMemo, useState } from "react";
import type { BoxFace, UvIsland } from "@/model/types";
import { BOX_FACES, blankUvNetFor, FACE_LABEL } from "@/model/box";
import { SplitHandle, usePaneSize } from "@/ui/Splitter";
import { UvEditor } from "./UvEditor";

export function BoxUvPanel({
  open,
  onClose,
  faces,
  textureUrl,
  face,
  onFace,
  lengthMm,
  widthMm,
  heightMm,
  onPatch,
  onPatchAll,
  projectDir,
  textureFit,
  textureTileScale,
  textureRotationDeg = 0,
  onRotateTexture,
  blankPart,
  blankLayer = "outer",
  title,
}: {
  open: boolean;
  onClose: () => void;
  faces: Record<BoxFace, UvIsland>;
  textureUrl?: string | null;
  projectDir?: string | null;
  face: BoxFace;
  onFace: (f: BoxFace) => void;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  onPatch: (face: BoxFace, patch: Partial<UvIsland>, merging?: boolean) => void;
  onPatchAll: (faces: Record<BoxFace, UvIsland>) => void;
  textureFit?: "original" | "cover" | "tile";
  textureTileScale?: number;
  textureRotationDeg?: number;
  onRotateTexture?: () => void;
  blankPart?: "lid" | "base" | "body";
  blankLayer?: "outer" | "inner";
  title?: string;
}) {
  const faceIdx = BOX_FACES.indexOf(face);
  const island = faces[face];
  const [snap, setSnap] = useState(true);
  const [sideW, setSideW] = usePaneSize("uv-side", 280);
  const uniform = island.uniformScale !== false;
  const sx = island.scaleX ?? 1;
  const sy = island.scaleY ?? 1;
  const blankNet = () => blankUvNetFor(lengthMm, widthMm, heightMm, { part: blankPart, layer: blankLayer });

  const tools = useMemo(
    () => ({
      rot(delta: number) {
        onPatch(face, { rotationDeg: Math.round(((island.rotationDeg ?? 0) + delta + 360) % 360) });
      },
      prevFace() {
        onFace(BOX_FACES[(faceIdx + BOX_FACES.length - 1) % BOX_FACES.length]!);
      },
      nextFace() {
        onFace(BOX_FACES[(faceIdx + 1) % BOX_FACES.length]!);
      },
    }),
    [face, faceIdx, island.rotationDeg, onFace, onPatch],
  );

  function num(label: string, value: number, onVal: (n: number) => void, step = 0.01) {
    return (
      <div className="field">
        <label>{label}</label>
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onVal(Number(e.target.value))}
        />
      </div>
    );
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop box-uv-backdrop">
      <div className="box-uv-panel" onMouseDown={(e) => e.stopPropagation()}>
        <header className="box-uv-head">
          <div>
            <h2>{title ?? "UV 编辑器"}</h2>
            <p className="muted">滚轮缩放画布，中键或空格拖移。拖壳移动，角点缩放（默认等比例），蓝点旋转。</p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            完成
          </button>
        </header>
        <div className="box-uv-body" style={{ ["--uv-side" as string]: `${sideW}px` }}>
          <UvEditor
            faces={faces}
            textureUrl={textureUrl}
            selectedFace={face}
            onSelect={onFace}
            onPatch={(f, patch, merging) => onPatch(f, patch, merging)}
            projectDir={projectDir}
            snap={snap}
            textureFit={textureFit}
            textureTileScale={textureTileScale}
            textureRotationDeg={textureRotationDeg}
          />
          <SplitHandle onDelta={(dx) => setSideW(Math.min(480, Math.max(200, sideW - dx)))} />
          <aside className="box-uv-side">
            <div className="row">
              <button type="button" className="btn btn-small" onClick={tools.prevFace}>
                ← 上一面
              </button>
              <strong>{FACE_LABEL[face]}</strong>
              <button type="button" className="btn btn-small" onClick={tools.nextFace}>
                下一面 →
              </button>
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button type="button" className="btn btn-small" onClick={() => tools.rot(-90)}>
                旋转 −90°
              </button>
              <button type="button" className="btn btn-small" onClick={() => tools.rot(90)}>
                旋转 +90°
              </button>
              <button type="button" className="btn btn-small" onClick={() => onPatch(face, { flipU: !island.flipU })}>
                翻转 U
              </button>
              <button type="button" className="btn btn-small" onClick={() => onPatch(face, { flipV: !island.flipV })}>
                翻转 V
              </button>
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button type="button" className="btn btn-small" onClick={() => onRotateTexture?.()}>
                贴图旋转 90°
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                当前 {textureRotationDeg}°
              </span>
            </div>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onPatch(face, blankNet()[face])}
            >
              重置当前壳
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onPatchAll(blankNet())}
            >
              按盒坯重排全部
            </button>
            {num("U", +island.u.toFixed(4), (n) => onPatch(face, { u: n }, true))}
            {num("V", +island.v.toFixed(4), (n) => onPatch(face, { v: n }, true))}
            {num("W", +island.w.toFixed(4), (n) => onPatch(face, { w: Math.max(0.01, n) }, true))}
            {num("H", +island.h.toFixed(4), (n) => onPatch(face, { h: Math.max(0.01, n) }, true))}
            {num("Scale X", +sx.toFixed(3), (n) => {
              const v = Math.max(0.01, n);
              onPatch(face, uniform ? { scaleX: v, scaleY: v } : { scaleX: v }, true);
            }, 0.05)}
            {num("Scale Y", +sy.toFixed(3), (n) => {
              const v = Math.max(0.01, n);
              onPatch(face, uniform ? { scaleX: v, scaleY: v } : { scaleY: v }, true);
            }, 0.05)}
            <label className="row">
              <input
                type="checkbox"
                checked={uniform}
                onChange={(e) => onPatch(face, { uniformScale: e.target.checked })}
              />
              等比例缩放
            </label>
            <label className="row">
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
              边吸附
            </label>
            {num("旋转 °", island.rotationDeg ?? 0, (n) => onPatch(face, { rotationDeg: n }, true), 1)}
          </aside>
        </div>
      </div>
    </div>
  );
}
