import { useRef, useState } from "react";
import { ingestImageFile, absolutizeAssetSrc } from "@/lib/ingestAsset";
import {
  BOX_POSE_PRESETS,
  BOX_SLEEVE_MODES,
  boxBaseHeight,
  boxBevelMm,
  boxLidFitMm,
  boxLidHeight,
  boxLidNotchRadiusMm,
  boxLidOpen,
  boxMaterialOf,
  boxModeOf,
  boxPartInnerMm,
  boxPartWorldMm,
  boxSleeveOf,
  boxTextureFit,
  boxTextureRotationDeg,
  boxWallMm,
  ensureBoxRender,
  nextTextureRotationDeg,
  partMapsOf,
  simplePartMaps,
  switchBoxMode,
} from "@/model/box";
import type { BoxFace, BoxPartMaps, PackagingBox, TextureFit, UvIsland } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ColorField } from "@/ui/ColorField";
import { WorkLock } from "@/ui/WorkLock";
import { HelpTip } from "@/ui/HelpTip";
import { ResolutionField } from "@/ui/ResolutionField";
import { boxPoseModel } from "./boxGeom";
import { BoxGl } from "./boxGl";
import { resolvePackagingDrawItems } from "./boxDraw";
import { BoxLibrary } from "./BoxLibrary";
import { BoxUvPanel } from "./BoxUvPanel";
import { BoxViewport } from "./BoxViewport";
import { clearBoxTextureCache } from "./boxTexture";
import { openRenderFolder, saveRenderPng } from "./saveRenderPng";
import { exportTextureOf } from "@/features/shot/shotTexture";

type Step = "struct" | "maps" | "render";
type MapPart = "body" | "lid" | "base";

function mmToCm(n: number) {
  return Math.round((n / 10) * 100) / 100;
}

function mapsOf(box: PackagingBox, part: MapPart): BoxPartMaps {
  if (part === "lid" || part === "base") return partMapsOf(box, part);
  return simplePartMaps(box);
}

function withMaps(box: PackagingBox, part: MapPart, maps: BoxPartMaps): PackagingBox {
  if (boxModeOf(box) === "lidBase" && (part === "lid" || part === "base")) {
    return { ...box, [part]: maps };
  }
  return {
    ...box,
    textureAssetId: maps.textureAssetId,
    textureFit: maps.textureFit,
    textureTileScale: maps.textureTileScale,
    textureRotationDeg: boxTextureRotationDeg(maps.textureRotationDeg),
    faces: maps.faces,
    foilMaskAssetId: maps.foilMaskAssetId,
    varnishMaskAssetId: maps.varnishMaskAssetId,
  };
}

function UnitSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const shown = Number(value.toFixed(2));
  return (
    <div className="field">
      <label>
        {label} {shown}
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function BoxPage() {
  const current = useAppStore((s) => s.current);
  const boxLibraryOpen = useEditorStore((s) => s.boxLibraryOpen);
  const boxId = useEditorStore((s) => s.boxId);
  const box = current?.boxes?.find((b) => b.id === boxId);
  if (!current) return <div className="page">未打开项目</div>;
  if (boxLibraryOpen || !box) return <BoxLibrary />;
  return <BoxEditor box={box} />;
}

function BoxEditor({ box }: { box: PackagingBox }) {
  const { current, currentPath, patchProject, setInfo, setError } = useAppStore();
  const setBoxLibraryOpen = useEditorStore((s) => s.setBoxLibraryOpen);
  const [step, setStep] = useState<Step>("struct");
  const [face, setFace] = useState<BoxFace>("front");
  const [uvOpen, setUvOpen] = useState(false);
  const [uvPart, setUvPart] = useState<"lid" | "base">("lid");
  const [mapLayer, setMapLayer] = useState<"outer" | "inner">("outer");
  const [lidDrag, setLidDrag] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileKind = useRef<"print" | "foil" | "varnish">("print");

  function patchBox(recipe: (b: PackagingBox) => PackagingBox, mergeKey?: string) {
    if (!box) return;
    patchProject(
      (p) => ({
        ...p,
        boxes: (p.boxes ?? []).map((b) => (b.id === box.id ? recipe(b) : b)),
      }),
      mergeKey ? { mergeKey } : undefined,
    );
  }

  function patchRender(partial: Partial<ReturnType<typeof ensureBoxRender>>, mergeKey?: string) {
    if (!box) return;
    patchBox((b) => ({ ...b, render: { ...ensureBoxRender(b), ...partial } }), mergeKey);
  }

  const project = current!;
  const render = ensureBoxRender(box);
  const detailed = boxModeOf(box) === "lidBase";
  const mapPart: MapPart = detailed ? uvPart : "body";
  const maps = mapsOf(box, mapPart);
  const mat = boxMaterialOf(box);
  const gloss = 1 - mat.roughness;

  async function importInto(kind: "print" | "foil" | "varnish", file: File) {
    try {
      const got = await ingestImageFile(file, currentPath, project.assets);
      clearBoxTextureCache();
      patchProject((p) => ({
        ...p,
        assets: { ...p.assets, [got.id]: got.src },
        boxes: (p.boxes ?? []).map((b) => {
          if (b.id !== box.id) return b;
          const cur = mapsOf(b, mapPart);
          const next =
            kind === "print" && mapLayer === "inner"
              ? { ...cur, innerTextureAssetId: got.id }
              : kind === "print"
                ? { ...cur, textureAssetId: got.id }
                : kind === "foil"
                  ? { ...cur, foilMaskAssetId: got.id }
                  : { ...cur, varnishMaskAssetId: got.id };
          return withMaps(b, mapPart, next);
        }),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "贴图导入失败");
    }
  }

  async function doRender() {
    setBusy(true);
    try {
      const w = render.resolutionW || 1920;
      const h = render.resolutionH || 1080;
      const canvas = document.createElement("canvas");
      const gl = new BoxGl(canvas);
      gl.setSize(w, h, 1);
      gl.setMesh(box);
      const model = boxPoseModel(render.position, render.rotationDeg);
      const items = await resolvePackagingDrawItems(box, project.assets, currentPath, model, false);
      gl.drawScene(render, items, { gizmos: false, transparentBg: render.cullBackground, groundY: -box.heightMm / 2 });
      const shot = gl.snapshot(!!render.cullOutsideBox);
      gl.dispose();
      const msg = await saveRenderPng(shot, box.name, currentPath);
      setInfo(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "渲染失败");
    } finally {
      setBusy(false);
    }
  }

  function patchFace(f: BoxFace, patch: Partial<UvIsland>, merging?: boolean) {
    patchBox((b) => {
      const cur = mapsOf(b, mapPart);
      if (mapLayer === "inner") {
        const innerFaces = { ...(cur.innerFaces ?? cur.faces), [f]: { ...(cur.innerFaces ?? cur.faces)[f], ...patch } };
        return withMaps(b, mapPart, { ...cur, innerFaces });
      }
      return withMaps(b, mapPart, { ...cur, faces: { ...cur.faces, [f]: { ...cur.faces[f], ...patch } } });
    }, merging ? "box-uv" : undefined);
  }

  function patchMaps(partial: Partial<BoxPartMaps>, mergeKey?: string) {
    patchBox((b) => withMaps(b, mapPart, { ...mapsOf(b, mapPart), ...partial }), mergeKey);
  }

  const outlinePartId = uvOpen ? `${box.id}:${detailed ? uvPart : "body"}:${detailed ? mapLayer : "outer"}` : null;
  const worldDims = detailed && (mapPart === "lid" || mapPart === "base") ? boxPartWorldMm(box, mapPart) : { lengthMm: box.lengthMm, widthMm: box.widthMm, heightMm: box.heightMm };
  const innerDims = detailed && (mapPart === "lid" || mapPart === "base") ? boxPartInnerMm(box, mapPart) : worldDims;
  const uvDims = mapLayer === "inner" ? innerDims : worldDims;
  const layerFaces = mapLayer === "inner" ? (maps.innerFaces ?? maps.faces) : maps.faces;
  const layerFit = mapLayer === "inner" ? (maps.innerTextureFit ?? "cover") : (maps.textureFit ?? boxTextureFit(box));
  const layerTile = mapLayer === "inner" ? (maps.innerTextureTileScale ?? 1) : (maps.textureTileScale ?? 1);
  const layerRot = mapLayer === "inner"
    ? boxTextureRotationDeg(maps.innerTextureRotationDeg)
    : boxTextureRotationDeg(maps.textureRotationDeg);
  const layerAssetId = mapLayer === "inner" ? maps.innerTextureAssetId : maps.textureAssetId;
  const rawSrc = layerAssetId ? project.assets[layerAssetId] : undefined;
  const textureSrc = rawSrc ? absolutizeAssetSrc(rawSrc, currentPath) : null;
  const lidShown = lidDrag ?? boxLidOpen(box);
  const editingInner = detailed && mapLayer === "inner";

  return (
    <div className="page box-page">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <h1>{box.name}</h1>
          <HelpTip>
            <p>结构里切简单方盒或详细天地盖，再贴图、调 UV，最后渲染。</p>
            <p>详细模式是帽盖式天地盒。套合轴向可切上下/前后/左右。视口拖开合滑条只预览，松手才保存。</p>
            <p>天、地内壁单独贴图；没有内图就用底色，不会把外面的图翻进去。</p>
            <p>渲染页：空白左键转镜头；Alt+左键平移；红框是即将导出的画幅。</p>
          </HelpTip>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => setBoxLibraryOpen(true)}>
            ← 返回库
          </button>
        </div>
      </div>
      <div className="box-steps">
        {(
          [
            ["struct", "1 结构"],
            ["maps", "2 贴图"],
            ["render", "3 渲染"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`tab ${step === id ? "active" : ""}`} onClick={() => setStep(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="box-layout">
        <BoxViewport
          box={box}
          render={render}
          assets={project.assets}
          projectDir={currentPath}
          selectedFace={uvOpen ? face : null}
          outlinePartId={outlinePartId}
          onSelectFace={uvOpen ? setFace : undefined}
          transparentBg={step === "render" && render.cullBackground}
          filmGate={step === "render"}
          onOrbit={(yaw, pitch, distance, target) =>
            patchRender({ camera: { ...render.camera, yaw, pitch, distance, ...(target ? { target } : {}) } }, "box-orbit")
          }
          onLidOpen={(open) => {
            setLidDrag(null);
            patchBox((b) => ({ ...b, lidOpen: open }), "box-lid-open");
          }}
          lidOpen={lidShown}
          onLidPreview={setLidDrag}
          onBusyChange={setPreviewBusy}
        />
        <aside className="box-side">
          {step === "struct" && (
            <div className="form">
              <div className="field">
                <label>名称</label>
                <input value={box.name} onChange={(e) => patchBox((b) => ({ ...b, name: e.target.value }))} />
              </div>
              <div className="field">
                <label>模式</label>
                <div className="row">
                  <button
                    type="button"
                    className={`btn btn-small ${!detailed ? "btn-primary" : ""}`}
                    onClick={() => patchBox((b) => switchBoxMode(b, "simple"))}
                  >
                    简单
                  </button>
                  <button
                    type="button"
                    className={`btn btn-small ${detailed ? "btn-primary" : ""}`}
                    onClick={() => patchBox((b) => switchBoxMode(b, "lidBase"))}
                  >
                    详细（天地盖）
                  </button>
                </div>
              </div>
              <p className="muted">{detailed ? "帽盖套盒：天从外套住地。合盖总高是闭合后沿竖直方向的外高。" : "默认 10 × 15 × 5 cm"}</p>
              <div className="row">
                <div className="field grow">
                  <label>长 cm</label>
                  <input
                    type="number"
                    step="0.1"
                    value={mmToCm(box.lengthMm)}
                    onChange={(e) => {
                      const lengthMm = Math.max(1, Number(e.target.value) * 10);
                      patchBox((b) => ({ ...b, lengthMm }), "box-size");
                    }}
                  />
                </div>
                <div className="field grow">
                  <label>宽 cm</label>
                  <input
                    type="number"
                    step="0.1"
                    value={mmToCm(box.widthMm)}
                    onChange={(e) => {
                      const widthMm = Math.max(1, Number(e.target.value) * 10);
                      patchBox((b) => ({ ...b, widthMm }), "box-size");
                    }}
                  />
                </div>
                <div className="field grow">
                  <label>{detailed ? "合盖总高 cm" : "高 cm"}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={mmToCm(box.heightMm)}
                    onChange={(e) => {
                      const heightMm = Math.max(1, Number(e.target.value) * 10);
                      patchBox((b) => ({ ...b, heightMm }), "box-size");
                    }}
                  />
                </div>
              </div>
              {detailed ? (
                <>
                  <div className="row">
                    <div className="field grow">
                      <label>天盒高 cm</label>
                      <input
                        type="number"
                        step="0.1"
                        value={mmToCm(boxLidHeight(box))}
                        onChange={(e) => patchBox((b) => ({ ...b, lidHeightMm: Math.max(1, Number(e.target.value) * 10) }), "box-lid")}
                      />
                    </div>
                    <div className="field grow">
                      <label>地盒高 cm</label>
                      <input
                        type="number"
                        step="0.1"
                        value={mmToCm(boxBaseHeight(box))}
                        onChange={(e) => patchBox((b) => ({ ...b, baseHeightMm: Math.max(1, Number(e.target.value) * 10) }), "box-base")}
                      />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field grow">
                      <label>壁厚 mm</label>
                      <input
                        type="number"
                        step="0.1"
                        value={boxWallMm(box)}
                        onChange={(e) => patchBox((b) => ({ ...b, wallMm: Math.max(0, Number(e.target.value)) }), "box-wall")}
                      />
                    </div>
                    <div className="field grow">
                      <label>套盖间隙 mm</label>
                      <input
                        type="number"
                        step="0.1"
                        value={boxLidFitMm(box)}
                        onChange={(e) => patchBox((b) => ({ ...b, lidFitMm: Math.max(0, Number(e.target.value)) }), "box-fit")}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>天盒口沿缺口</label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!box.lidNotchUpDown}
                        onChange={(e) => patchBox((b) => ({ ...b, lidNotchUpDown: e.target.checked }), "box-notch")}
                      />
                      上下开口
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!box.lidNotchLeftRight}
                        onChange={(e) => patchBox((b) => ({ ...b, lidNotchLeftRight: e.target.checked }), "box-notch")}
                      />
                      左右开口
                    </label>
                    <label>开口半径 mm {boxLidNotchRadiusMm(box)}</label>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      step={0.5}
                      value={boxLidNotchRadiusMm(box)}
                      onChange={(e) => patchBox((b) => ({ ...b, lidNotchRadiusMm: Math.max(0, Number(e.target.value)) }), "box-notch")}
                    />
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      value={boxLidNotchRadiusMm(box)}
                      onChange={(e) => patchBox((b) => ({ ...b, lidNotchRadiusMm: Math.max(0, Number(e.target.value)) }), "box-notch")}
                    />
                  </div>
                  <div className="field">
                    <label>套合轴向</label>
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      {BOX_SLEEVE_MODES.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`btn btn-small ${boxSleeveOf(box) === m.id ? "btn-primary" : ""}`}
                          onClick={() => patchBox((b) => ({ ...b, sleeve: m.id }))}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <p className="muted">{BOX_SLEEVE_MODES.find((m) => m.id === boxSleeveOf(box))?.hint}</p>
                  </div>
                  <div className="field">
                    <label>开合</label>
                    <div className="row">
                      <button
                        type="button"
                        className={`btn btn-small ${lidShown < 0.05 ? "btn-primary" : ""}`}
                        onClick={() => {
                          setLidDrag(null);
                          patchBox((b) => ({ ...b, lidOpen: 0 }), "box-lid-open");
                        }}
                      >
                        合上
                      </button>
                      <button
                        type="button"
                        className={`btn btn-small ${lidShown > 0.95 ? "btn-primary" : ""}`}
                        onClick={() => {
                          setLidDrag(null);
                          patchBox((b) => ({ ...b, lidOpen: 1 }), "box-lid-open");
                        }}
                      >
                        打开
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={lidShown}
                      onChange={(e) => setLidDrag(Number(e.target.value))}
                      onPointerUp={(e) => {
                        const n = Number((e.target as HTMLInputElement).value);
                        setLidDrag(null);
                        patchBox((b) => ({ ...b, lidOpen: n }), "box-lid-open");
                      }}
                    />
                    <p className="muted">拖动只预览，松手才写入。打开沿套合轴拉开天盒，不翻转。</p>
                  </div>
                </>
              ) : null}
              <p className="muted">
                {box.lengthMm} × {box.widthMm} × {box.heightMm} mm
              </p>
              <ColorField
                label="底色"
                value={mat.baseColor}
                fallback="#ffffff"
                onChange={(c) => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), baseColor: c } }), "box-mat")}
              />
              <div className="field">
                <label>金属度 {mat.metallic.toFixed(2)}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={mat.metallic}
                  onChange={(e) =>
                    patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), metallic: Number(e.target.value) } }), "box-mat")
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={mat.metallic}
                  onChange={(e) =>
                    patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), metallic: Number(e.target.value) } }), "box-mat")
                  }
                />
              </div>
              <div className="field">
                <label>反光度 {gloss.toFixed(2)}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={gloss}
                  onChange={(e) =>
                    patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), roughness: 1 - Number(e.target.value) } }), "box-mat")
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={Number(gloss.toFixed(2))}
                  onChange={(e) =>
                    patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), roughness: 1 - Number(e.target.value) } }), "box-mat")
                  }
                />
              </div>
              <div className="field">
                <label>摆放</label>
                <div className="row">
                  {BOX_POSE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="btn btn-small"
                      onClick={() => patchRender({ rotationDeg: { ...p.rotationDeg } })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>绕 X°</label>
                  <input
                    type="number"
                    value={render.rotationDeg.x}
                    onChange={(e) =>
                      patchRender({ rotationDeg: { ...render.rotationDeg, x: Number(e.target.value) } }, "box-rot")
                    }
                  />
                </div>
                <div className="field grow">
                  <label>绕 Y°</label>
                  <input
                    type="number"
                    value={render.rotationDeg.y}
                    onChange={(e) =>
                      patchRender({ rotationDeg: { ...render.rotationDeg, y: Number(e.target.value) } }, "box-rot")
                    }
                  />
                </div>
                <div className="field grow">
                  <label>绕 Z°</label>
                  <input
                    type="number"
                    value={render.rotationDeg.z}
                    onChange={(e) =>
                      patchRender({ rotationDeg: { ...render.rotationDeg, z: Number(e.target.value) } }, "box-rot")
                    }
                  />
                </div>
              </div>
            </div>
          )}
          {step === "maps" && (
            <div className="form">
              {detailed ? (
                <>
                  <div className="field">
                    <label>当前件</label>
                    <div className="row">
                      <button type="button" className={`btn btn-small ${uvPart === "lid" ? "btn-primary" : ""}`} onClick={() => { setUvPart("lid"); setMapLayer("outer"); }}>
                        天盒
                      </button>
                      <button type="button" className={`btn btn-small ${uvPart === "base" ? "btn-primary" : ""}`} onClick={() => { setUvPart("base"); setMapLayer("outer"); }}>
                        地盒
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <label>贴图层</label>
                    <div className="row">
                      <button type="button" className={`btn btn-small ${mapLayer === "outer" ? "btn-primary" : ""}`} onClick={() => setMapLayer("outer")}>
                        外
                      </button>
                      <button type="button" className={`btn btn-small ${mapLayer === "inner" ? "btn-primary" : ""}`} onClick={() => setMapLayer("inner")}>
                        内
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
              <div className="field">
                <label>
                  {detailed
                    ? `${uvPart === "lid" ? "天盒" : "地盒"}${mapLayer === "inner" ? "内" : "外"}印刷图（一张，支持 PSD）`
                    : "整盒贴图（一张，支持 PSD）"}
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.psd,image/vnd.adobe.photoshop"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void importInto(fileKind.current, f);
                  }}
                />
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      fileKind.current = "print";
                      fileRef.current?.click();
                    }}
                  >
                    {(editingInner ? maps.innerTextureAssetId : maps.textureAssetId) ? "更换贴图" : "导入贴图"}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setUvOpen(true)}>
                    打开 UV 编辑器
                  </button>
                  {editingInner && maps.innerTextureAssetId ? (
                    <button type="button" className="btn" onClick={() => patchMaps({ innerTextureAssetId: undefined })}>
                      清除内图
                    </button>
                  ) : null}
                </div>
                {editingInner ? (
                  maps.innerTextureAssetId ? (
                    <p className="muted">已绑定：{maps.innerTextureAssetId}</p>
                  ) : (
                    <p className="muted">没有内图时内壁只用底色，不会翻用外壁印刷图。</p>
                  )
                ) : maps.textureAssetId ? (
                    <p className="muted">已绑定：{maps.textureAssetId}</p>
                ) : (
                    <p className="muted">未贴图时显示底色或棋盘材质。</p>
                )}
                {detailed && mapLayer === "outer" ? (
                  <p className="muted">打开后看见的盒内是内壁。没贴内图就是底色，外壁印刷只在外侧。</p>
                ) : null}
              </div>
              <div className="field">
                <label>贴图铺法</label>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {(
                    [
                      ["original", "原始尺寸"],
                      ["cover", "撑满"],
                      ["tile", "平铺"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`btn btn-small ${layerFit === id ? "btn-primary" : ""}`}
                      onClick={() =>
                        patchMaps(editingInner ? { innerTextureFit: id as TextureFit } : { textureFit: id as TextureFit })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {layerFit === "tile" ? (
                  <>
                    <label>平铺倍率 {layerTile}</label>
                    <input
                      type="range"
                      min={0.25}
                      max={8}
                      step={0.25}
                      value={layerTile}
                      onChange={(e) =>
                        patchMaps(
                          editingInner ? { innerTextureTileScale: Number(e.target.value) } : { textureTileScale: Number(e.target.value) },
                          "box-tile",
                        )
                      }
                    />
                  </>
                ) : (
                  <p className="muted">
                    {layerFit === "original" ? "按宽高比放入 UV，不拉扁、不强制铺满。" : "1:1 等比撑满 UV，多出裁掉。"}
                  </p>
                )}
              </div>
              {editingInner ? null : (
                <>
                  <div className="field">
                    <label>烫金遮罩（白=烫金）</label>
                    <div className="row">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          fileKind.current = "foil";
                          fileRef.current?.click();
                        }}
                      >
                        {maps.foilMaskAssetId ? "更换烫金" : "导入烫金"}
                      </button>
                      {maps.foilMaskAssetId ? (
                        <button type="button" className="btn" onClick={() => patchMaps({ foilMaskAssetId: undefined })}>
                          清除
                        </button>
                      ) : null}
                    </div>
                    {maps.foilMaskAssetId ? <p className="muted">已绑定：{maps.foilMaskAssetId}</p> : <p className="muted">黑白图白色出烫金。UV 壳和铺法与这张印刷图相同。</p>}
                  </div>
                  <ColorField
                    label="烫金颜色"
                    value={mat.foilColor}
                    fallback="#d4af37"
                    onChange={(c) => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), foilColor: c } }), "box-foil")}
                  />
                    <UnitSlider
                      label="烫金金属度"
                      value={mat.foilMetallic}
                      onChange={(n) => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), foilMetallic: n } }), "box-foil")}
                    />
                    <UnitSlider
                      label="烫金反光度"
                      value={1 - mat.foilRoughness}
                      onChange={(n) => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), foilRoughness: 1 - n } }), "box-foil")}
                    />
                    <UnitSlider
                      label="烫金磨砂"
                      value={mat.foilGrain}
                      onChange={(n) => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), foilGrain: n } }), "box-foil")}
                    />
                    <div className="field">
                      <label>烫金磨砂样式</label>
                      <div className="row">
                        <button
                          type="button"
                          className={`btn btn-small ${mat.foilGrainStyle !== "frost" ? "btn-primary" : ""}`}
                          onClick={() => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), foilGrainStyle: "cell" } }), "box-foil")}
                        >
                          方块
                        </button>
                        <button
                          type="button"
                          className={`btn btn-small ${mat.foilGrainStyle === "frost" ? "btn-primary" : ""}`}
                          onClick={() => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), foilGrainStyle: "frost" } }), "box-foil")}
                        >
                          颗粒
                        </button>
                      </div>
                    </div>
                  <div className="field">
                    <label>UV 光油遮罩（白=更亮更滑）</label>
                    <div className="row">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          fileKind.current = "varnish";
                          fileRef.current?.click();
                        }}
                      >
                        {maps.varnishMaskAssetId ? "更换 UV" : "导入 UV"}
                      </button>
                      {maps.varnishMaskAssetId ? (
                        <button type="button" className="btn" onClick={() => patchMaps({ varnishMaskAssetId: undefined })}>
                          清除
                        </button>
                      ) : null}
                    </div>
                    {maps.varnishMaskAssetId ? <p className="muted">已绑定：{maps.varnishMaskAssetId}</p> : <p className="muted">白色出镜面清漆。侧面掠射也会亮。UV 壳和铺法与这张印刷图相同。</p>}
                    <UnitSlider
                      label="UV 反光度"
                      value={1 - mat.varnishRoughness}
                      onChange={(n) => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), varnishRoughness: 1 - n } }), "box-foil")}
                    />
                    <UnitSlider
                      label="UV 清漆"
                      value={mat.varnishCoat}
                      min={0}
                      max={4}
                      step={0.05}
                      onChange={(n) => patchBox((b) => ({ ...b, material: { ...boxMaterialOf(b), varnishCoat: n } }), "box-foil")}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          {step === "render" && (
            <div className="form">
              <div className="row">
                <div className="field grow">
                  <label>焦距 FOV</label>
                  <input
                    type="number"
                    value={render.camera.fov}
                    onChange={(e) =>
                      patchRender({ camera: { ...render.camera, fov: Number(e.target.value) } }, "box-fov")
                    }
                  />
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>主光强度</label>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.05}
                    value={render.lights.key.intensity}
                    onChange={(e) =>
                      patchRender(
                        { lights: { ...render.lights, key: { ...render.lights.key, intensity: Number(e.target.value) } } },
                        "box-light",
                      )
                    }
                  />
                  <span className="muted">{render.lights.key.intensity.toFixed(2)}</span>
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <label>主光方向 Y°</label>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={render.lights.key.yaw}
                    onChange={(e) =>
                      patchRender(
                        { lights: { ...render.lights, key: { ...render.lights.key, yaw: Number(e.target.value) } } },
                        "box-light",
                      )
                    }
                  />
                </div>
                <div className="field grow">
                  <label>主光方向 P°</label>
                  <input
                    type="range"
                    min={-10}
                    max={89}
                    value={render.lights.key.pitch}
                    onChange={(e) =>
                      patchRender(
                        { lights: { ...render.lights, key: { ...render.lights.key, pitch: Number(e.target.value) } } },
                        "box-light",
                      )
                    }
                  />
                </div>
              </div>
              <ColorField
                label="主光色"
                value={render.lights.key.color}
                fallback="#fff4e4"
                onChange={(c) =>
                  patchRender({ lights: { ...render.lights, key: { ...render.lights.key, color: c } } }, "box-light")
                }
              />
              <div className="field">
                <label>环境光 {render.lights.ambient ?? 0.3}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={render.lights.ambient ?? 0.3}
                  onChange={(e) =>
                    patchRender({ lights: { ...render.lights, ambient: Number(e.target.value) } }, "box-light")
                  }
                />
              </div>
              <div className="field">
                <label>补光 {render.lights.fillIntensity ?? 0.28}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={render.lights.fillIntensity ?? 0.28}
                  onChange={(e) =>
                    patchRender({ lights: { ...render.lights, fillIntensity: Number(e.target.value) } }, "box-light")
                  }
                />
              </div>
              <ColorField
                label="背景色"
                value={render.background ?? "#1c1c22"}
                fallback="#1c1c22"
                onChange={(c) => !render.cullBackground && patchRender({ background: c }, "box-bg")}
              />
              {render.cullBackground ? <p className="muted">已开剔除背景，背景色不参与预览。</p> : null}
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!render.cullBackground}
                  onChange={(e) => patchRender({ cullBackground: e.target.checked })}
                />
                剔除背景（透明、不留底）
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!render.cullOutsideBox}
                  onChange={(e) => patchRender({ cullOutsideBox: e.target.checked })}
                />
                剔除盒子以外（裁到盒子包围盒）
              </label>
              <div className="field">
                <label>边缘倒角 {boxBevelMm(box).toFixed(1)} mm</label>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, Math.min(box.lengthMm, box.widthMm, box.heightMm) / 4)}
                  step={0.1}
                  value={boxBevelMm(box)}
                  onChange={(e) => patchBox((b) => ({ ...b, bevelMm: Number(e.target.value) }), "box-bevel")}
                />
                <p className="muted">0 为尖棱。调大后十二条棱变 smooth。</p>
              </div>
              <ResolutionField
                width={render.resolutionW}
                height={render.resolutionH}
                onChange={(rw, rh) => patchRender({ resolutionW: rw, resolutionH: rh })}
              />
              <div className="field">
                <label>出图贴图</label>
                <div className="row">
                  <button
                    type="button"
                    className={`btn btn-small ${exportTextureOf(render.exportTexture) === "standard" ? "btn-primary" : ""}`}
                    onClick={() => patchRender({ exportTexture: "standard" })}
                  >
                    标准
                  </button>
                  <button
                    type="button"
                    className={`btn btn-small ${exportTextureOf(render.exportTexture) === "max" ? "btn-primary" : ""}`}
                    onClick={() => patchRender({ exportTexture: "max" })}
                  >
                    最高
                  </button>
                </div>
                <p className="muted">只影响下一次出图。盒子印刷图仍按原图烘焙（最长边 4096）。</p>
              </div>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void doRender()}>
                {busy ? "渲染中…" : "渲染并保存到「渲染图」"}
              </button>
              <button type="button" className="btn" onClick={() => void openRenderFolder(currentPath).then(setInfo)}>
                打开渲染文件夹
              </button>
            </div>
          )}
        </aside>
        <WorkLock
          open={previewBusy || busy}
          title={busy ? "正在渲染" : "正在载入印刷图"}
          detail={busy ? "写出 PNG，请稍候。" : "从磁盘读取贴图。转镜头、改底色、改开口不会停在这里。"}
        />
      </div>
      <BoxUvPanel
        open={uvOpen}
        onClose={() => setUvOpen(false)}
        title={
          detailed
            ? `UV 编辑器 · ${uvPart === "lid" ? "天盒" : "地盒"}${mapLayer === "inner" ? "内" : "外"}`
            : "UV 编辑器"
        }
        faces={layerFaces}
        textureUrl={textureSrc}
        projectDir={currentPath}
        face={face}
        onFace={setFace}
        lengthMm={uvDims.lengthMm}
        widthMm={uvDims.widthMm}
        heightMm={uvDims.heightMm}
        onPatch={patchFace}
        onPatchAll={(faces) => patchMaps(editingInner ? { innerFaces: faces } : { faces })}
        textureFit={layerFit}
        textureTileScale={layerTile}
        textureRotationDeg={layerRot}
        blankPart={detailed ? uvPart : "body"}
        blankLayer={mapLayer}
        onRotateTexture={() =>
          patchMaps(
            editingInner
              ? { innerTextureRotationDeg: nextTextureRotationDeg(maps.innerTextureRotationDeg) }
              : { textureRotationDeg: nextTextureRotationDeg(maps.textureRotationDeg) },
          )
        }
      />
    </div>
  );
}
