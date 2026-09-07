import { useMemo, useRef, useState } from "react";
import { ingestImageFile } from "@/lib/ingestAsset";
import { BOX_POSE_PRESETS, boxBevelMm, boxTextureFit, ensureBoxRender } from "@/model/box";
import type { BoxFace, PackagingBox, TextureFit, UvIsland } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ColorField } from "@/ui/ColorField";
import { HelpTip } from "@/ui/HelpTip";
import { BoxGl } from "./boxGl";
import { loadFittedBoxTexture } from "./boxTexture";
import { BoxLibrary } from "./BoxLibrary";
import { BoxUvPanel } from "./BoxUvPanel";
import { BoxViewport } from "./BoxViewport";
import { saveRenderPng } from "./saveRenderPng";

type Step = "struct" | "render";

function mmToCm(n: number) {
  return Math.round((n / 10) * 100) / 100;
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
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const textureSrc = useMemo(() => {
    if (!current || !box?.textureAssetId) return null;
    return current.assets[box.textureAssetId] ?? null;
  }, [current, box?.textureAssetId, current?.assets]);

  if (!current) return <div className="page">未打开项目</div>;
  const project = current;
  const render = ensureBoxRender(box);

  async function importTexture(file: File) {
    try {
      const got = await ingestImageFile(file, currentPath, project.assets);
      patchProject((p) => ({
        ...p,
        assets: { ...p.assets, [got.id]: got.src },
        boxes: (p.boxes ?? []).map((b) => (b.id === box.id ? { ...b, textureAssetId: got.id } : b)),
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
      let img = null;
      if (textureSrc) {
        try {
          img = await loadFittedBoxTexture(textureSrc, currentPath, boxTextureFit(box), box.textureTileScale ?? 1);
        } catch {
          img = null;
        }
      }
      gl.setTextureImage(img);
      gl.draw(render, { transparentBg: render.cullBackground, gizmos: false });
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
    patchBox(
      (b) => ({ ...b, faces: { ...b.faces, [f]: { ...b.faces[f], ...patch } } }),
      merging ? "box-uv" : undefined,
    );
  }

  return (
    <div className="page box-page">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <h1>{box.name}</h1>
          <HelpTip>
            <p>方盒 → 一张贴图 + UV → 本盒渲染。UV 在次级编辑器里调。倒角跟这只盒子绑定，产品渲染场景会直接用。</p>
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
            ["struct", "1 结构与贴图"],
            ["render", "2 渲染"],
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
          textureSrc={textureSrc}
          projectDir={currentPath}
          selectedFace={uvOpen ? face : null}
          onSelectFace={uvOpen ? setFace : undefined}
          transparentBg={step === "render" && render.cullBackground}
          onOrbit={(yaw, pitch, distance) => patchRender({ camera: { ...render.camera, yaw, pitch, distance } }, "box-orbit")}
        />
        <aside className="box-side">
          {step === "struct" && (
            <div className="form">
              <div className="field">
                <label>名称</label>
                <input value={box.name} onChange={(e) => patchBox((b) => ({ ...b, name: e.target.value }))} />
              </div>
              <p className="muted">默认 10 × 15 × 5 cm</p>
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
                  <label>高 cm</label>
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
              <p className="muted">
                {box.lengthMm} × {box.widthMm} × {box.heightMm} mm
              </p>
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
              <div className="field">
                <label>整盒贴图（一张，支持 PSD）</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.psd,image/vnd.adobe.photoshop"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void importTexture(f);
                  }}
                />
                <div className="row">
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                    {box.textureAssetId ? "更换贴图" : "导入贴图"}
                  </button>
                  <button type="button" className="btn btn-primary" disabled={!box.textureAssetId} onClick={() => setUvOpen(true)}>
                    打开 UV 编辑器
                  </button>
                </div>
                {box.textureAssetId ? (
                  <p className="muted">已绑定：{box.textureAssetId}</p>
                ) : (
                  <p className="muted">未贴图时显示棋盘材质。</p>
                )}
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
                      className={`btn btn-small ${boxTextureFit(box) === id ? "btn-primary" : ""}`}
                      onClick={() => patchBox((b) => ({ ...b, textureFit: id as TextureFit }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {boxTextureFit(box) === "tile" ? (
                  <>
                    <label>平铺倍率 {box.textureTileScale ?? 1}</label>
                    <input
                      type="range"
                      min={0.25}
                      max={8}
                      step={0.25}
                      value={box.textureTileScale ?? 1}
                      onChange={(e) =>
                        patchBox((b) => ({ ...b, textureTileScale: Number(e.target.value) }), "box-tile")
                      }
                    />
                  </>
                ) : (
                  <p className="muted">
                    {boxTextureFit(box) === "original"
                      ? "按宽高比放入 UV，不拉扁、不强制铺满。"
                      : "1:1 等比撑满 UV，多出裁掉。"}
                  </p>
                )}
              </div>
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
              <div className="field">
                <label>分辨率</label>
                <select
                  value={`${render.resolutionW}x${render.resolutionH}`}
                  onChange={(e) => {
                    const [rw, rh] = e.target.value.split("x").map(Number);
                    patchRender({ resolutionW: rw, resolutionH: rh });
                  }}
                >
                  <option value="1920x1080">1920 × 1080</option>
                  <option value="1280x720">1280 × 720</option>
                  <option value="2048x2048">2048 × 2048</option>
                </select>
              </div>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void doRender()}>
                {busy ? "渲染中…" : "渲染并保存到「渲染图」"}
              </button>
            </div>
          )}
        </aside>
      </div>
      <BoxUvPanel
        open={uvOpen}
        onClose={() => setUvOpen(false)}
        faces={box.faces}
        textureUrl={textureSrc}
        projectDir={currentPath}
        face={face}
        onFace={setFace}
        lengthMm={box.lengthMm}
        widthMm={box.widthMm}
        heightMm={box.heightMm}
        onPatch={patchFace}
        onPatchAll={(faces) => patchBox((b) => ({ ...b, faces }))}
        textureFit={boxTextureFit(box)}
        textureTileScale={box.textureTileScale ?? 1}
      />
    </div>
  );
}
