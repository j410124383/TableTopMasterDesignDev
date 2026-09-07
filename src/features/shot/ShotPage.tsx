import { useEffect, useState, memo } from "react";
import { BoxGl } from "@/features/box/boxGl";
import { saveRenderPng } from "@/features/box/saveRenderPng";
import { uid } from "@/lib/id";
import { templateFromBlueprint } from "@/model/normalize";
import { ensureShotLook, nextItemOffset } from "@/model/shot";
import type { ProductShot, ProductShotItem, Project } from "@/model/types";
import { renderCardToCanvas } from "@/render/drawCard";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ColorField } from "@/ui/ColorField";
import { HelpTip } from "@/ui/HelpTip";
import { IconBtn } from "@/ui/IconBtn";
import { IconReturn } from "@/ui/Icons";
import { pageSlice, Pager } from "@/ui/Pager";
import { SplitHandle, usePaneSize } from "@/ui/Splitter";
import { applyProductLook } from "./shotLook";
import { applyShotLayout, fillShotSlot, SHOT_LAYOUTS, type ShotLayoutId } from "./shotLayout";
import { defaultLieRotation, placeYForItem, resolveShotDrawItems } from "./shotResolve";
import { ShotLibrary } from "./ShotLibrary";
import { ShotViewport } from "./ShotViewport";
import type { GizmoMode } from "./shotGizmo";

const PAGE_SIZE = 12;

const CardThumb = memo(
  function CardThumb({
    project,
    blueprintId,
    fields,
    face = "front",
  }: {
    project: Project;
    blueprintId: string;
    fields?: Record<string, string>;
    face?: "front" | "back";
  }) {
    const [url, setUrl] = useState<string>();
    const fieldsKey = JSON.stringify(fields ?? {});
    useEffect(() => {
      const bp = project.blueprints.find((b) => b.id === blueprintId);
      if (!bp) return;
      let dead = false;
      const template = templateFromBlueprint(bp, face);
      const parsed = JSON.parse(fieldsKey) as Record<string, string>;
      void renderCardToCanvas(template, {
        dpi: 28,
        fields: parsed,
        assets: project.assets,
        project,
        honorVisibleWhen: Object.keys(parsed).length > 0,
        cropBleed: true,
      })
        .then((c) => {
          if (!dead) setUrl(c.toDataURL("image/png"));
        })
        .catch(() => {
          if (!dead) setUrl(undefined);
        });
      return () => {
        dead = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blueprintId, fieldsKey, face]);
    if (!url) return <div className="shot-thumb-ph" />;
    return <img src={url} alt="" className="shot-thumb-img" />;
  },
  (a, b) => a.blueprintId === b.blueprintId && a.face === b.face && JSON.stringify(a.fields ?? {}) === JSON.stringify(b.fields ?? {}),
);

export function ShotPage() {
  const current = useAppStore((s) => s.current);
  const shotLibraryOpen = useEditorStore((s) => s.shotLibraryOpen);
  const shotId = useEditorStore((s) => s.shotId);
  const shot = current?.shots?.find((s) => s.id === shotId);
  if (!current) return <div className="page">未打开项目</div>;
  if (shotLibraryOpen || !shot) return <ShotLibrary />;
  return <ShotEditor shot={shot} />;
}

function ShotEditor({ shot }: { shot: ProductShot }) {
  const { current, currentPath, patchProject, setInfo, setError } = useAppStore();
  const setShotLibraryOpen = useEditorStore((s) => s.setShotLibraryOpen);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [railTab, setRailTab] = useState<"sets" | "cards" | "boards" | "boxes">("sets");
  const [cardSetId, setCardSetId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [leftW, setLeftW] = usePaneSize("shot-left", 240);
  const [rightW, setRightW] = usePaneSize("shot-right", 280);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("move");
  const [layoutPick, setLayoutPick] = useState<ShotLayoutId>((shot.layoutId as ShotLayoutId) || "empty");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const node = e.target as HTMLElement | null;
      if (node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT" || node.isContentEditable)) return;
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setGizmoMode("move");
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setGizmoMode("rotate");
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setGizmoMode("scale");
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selectedId) return;
      e.preventDefault();
      patchProject((p) => ({
        ...p,
        shots: (p.shots ?? []).map((s) =>
          s.id === shot.id ? { ...s, items: s.items.filter((it) => it.id !== selectedId) } : s,
        ),
      }));
      setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, shot.id, patchProject]);

  if (!current) return <div className="page">未打开项目</div>;

  const project = current;
  const render = shot.render;
  const look = ensureShotLook(shot.look);
  const selected = shot.items.find((it) => it.id === selectedId) ?? null;
  const boards = project.blueprints.filter((b) => b.kind === "board");
  const boxes = project.boxes ?? [];
  const iso = render.projection === "isometric";

  function patchShot(recipe: (s: ProductShot) => ProductShot, mergeKey?: string) {
    patchProject(
      (p) => ({
        ...p,
        shots: (p.shots ?? []).map((s) => (s.id === shot.id ? recipe(s) : s)),
      }),
      mergeKey ? { mergeKey } : undefined,
    );
  }

  function addItem(partial: Omit<ProductShotItem, "id" | "position" | "rotationDeg"> & Partial<Pick<ProductShotItem, "position" | "rotationDeg">>) {
    const empty = selected && !selected.refId ? selected : shot.items.find((it) => it.kind === partial.kind && !it.refId);
    if (empty) {
      const filled = fillShotSlot(empty, partial, project);
      if (filled) {
        patchItem(empty.id, filled);
        setSelectedId(empty.id);
        return;
      }
    }
    const pos = partial.position ?? nextItemOffset(shot.items);
    const y = placeYForItem(partial.kind, project, partial.refId, partial.setId);
    const item: ProductShotItem = {
      id: uid("sit"),
      kind: partial.kind,
      refId: partial.refId,
      setId: partial.setId,
      cardId: partial.cardId,
      face: partial.face,
      position: { x: pos.x, y: pos.y || y, z: pos.z },
      rotationDeg: partial.rotationDeg ?? defaultLieRotation(partial.kind),
      scale: 1,
    };
    patchShot((s) => ({ ...s, items: [...s.items, item] }));
    setSelectedId(item.id);
  }

  function patchItem(id: string, patch: Partial<ProductShotItem>, mergeKey?: string) {
    patchShot(
      (s) => ({
        ...s,
        items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      }),
      mergeKey,
    );
  }

  async function doRender() {
    setBusy(true);
    try {
      const w = render.resolutionW || 1920;
      const h = render.resolutionH || 1080;
      const canvas = document.createElement("canvas");
      const gl = new BoxGl(canvas);
      gl.setSize(w, h, 1);
      const drawn = await resolveShotDrawItems(shot.items, null, project, currentPath);
      let mask: HTMLCanvasElement | null = null;
      if (look.outline?.enabled) {
        gl.drawScene(render, drawn, { gizmos: false, silhouette: true });
        mask = document.createElement("canvas");
        mask.width = w;
        mask.height = h;
        mask.getContext("2d")!.drawImage(gl.canvas, 0, 0);
      }
      gl.drawScene(render, drawn, { gizmos: false, transparentBg: render.cullBackground, groundY: 0 });
      const processed = applyProductLook(gl.canvas, look, mask);
      gl.dispose();
      const msg = await saveRenderPng(processed, shot.name, currentPath);
      setInfo(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "渲染失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page box-page shot-page">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <IconBtn title="返回场景库" onClick={() => setShotLibraryOpen(true)}>
            <IconReturn />
          </IconBtn>
          <h1>{shot.name}</h1>
          <HelpTip>
            <p>从左栏拖入或点击加入。卡牌和卡牌集默认趴在桌上。</p>
            <p>选中后拖视口里的控制杆，或改右侧数值。W 移动 / E 旋转 / R 缩放。</p>
            <p>可切换透视与等距。应用布局模版后，把卡和盒子填进半透明占位体。</p>
            <p>包装盒倒角在包装盒编辑器里调，本页不改。</p>
          </HelpTip>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setShotLibraryOpen(true)}>
            返回库
          </button>
        </div>
      </div>
      <div
        className="shot-layout"
        style={{ gridTemplateColumns: `${leftW}px 6px minmax(0, 1fr) 6px ${rightW}px` }}
      >
        <aside className="shot-rail">
          <div className="shot-rail-tabs">
            {(
              [
                ["sets", "卡牌集"],
                ["cards", "单卡"],
                ["boards", "板件"],
                ["boxes", "包装盒"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`tab ${railTab === id ? "active" : ""}`}
                onClick={() => {
                  setRailTab(id);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {railTab === "sets" && (
            <>
              <div className="shot-rail-grid">
                {pageSlice(project.sets, page, PAGE_SIZE).map((set) => {
                  const bp = project.blueprints.find((b) => b.id === set.blueprintId);
                  return (
                    <button
                      key={set.id}
                      type="button"
                      className="shot-rail-item"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/x-tmd-shot", JSON.stringify({ kind: "stack", refId: set.id }))}
                      onClick={() => addItem({ kind: "stack", refId: set.id })}
                      title="加入场景（一摞）"
                    >
                      {bp ? <CardThumb project={project} blueprintId={bp.id} fields={set.cards[0]?.fields} /> : <div className="shot-thumb-ph" />}
                      <span>{set.name}</span>
                    </button>
                  );
                })}
              </div>
              <Pager page={page} pageSize={PAGE_SIZE} total={project.sets.length} onChange={setPage} />
            </>
          )}
          {railTab === "cards" && (
            <>
              <div className="shot-rail-tabs shot-rail-tabs-sub">
                {project.sets.map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    className={`tab ${(cardSetId ?? project.sets[0]?.id) === set.id ? "active" : ""}`}
                    onClick={() => {
                      setCardSetId(set.id);
                      setPage(1);
                    }}
                  >
                    {set.name}
                  </button>
                ))}
              </div>
              {(() => {
                const set = project.sets.find((s) => s.id === (cardSetId ?? project.sets[0]?.id));
                if (!set) return <p className="muted">没有卡牌集</p>;
                return (
                  <>
                    <div className="shot-rail-grid">
                      {pageSlice(set.cards, page, PAGE_SIZE).map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          className="shot-rail-item"
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData(
                              "application/x-tmd-shot",
                              JSON.stringify({ kind: "card", refId: set.blueprintId, setId: set.id, cardId: card.id, face: "front" }),
                            )
                          }
                          onClick={() =>
                            addItem({ kind: "card", refId: set.blueprintId, setId: set.id, cardId: card.id, face: "front" })
                          }
                        >
                          <CardThumb project={project} blueprintId={set.blueprintId} fields={card.fields} />
                          <span>{card.fields.name || card.fields[set.fieldKeys[0] ?? ""] || "卡"}</span>
                        </button>
                      ))}
                    </div>
                    <Pager page={page} pageSize={PAGE_SIZE} total={set.cards.length} onChange={setPage} />
                  </>
                );
              })()}
            </>
          )}
          {railTab === "boards" && (
            <>
              <div className="shot-rail-grid">
                {pageSlice(boards, page, PAGE_SIZE).map((bp) => (
                  <button
                    key={bp.id}
                    type="button"
                    className="shot-rail-item"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/x-tmd-shot", JSON.stringify({ kind: "board", refId: bp.id }))}
                    onClick={() => addItem({ kind: "board", refId: bp.id })}
                  >
                    <CardThumb project={project} blueprintId={bp.id} />
                    <span>{bp.name}</span>
                  </button>
                ))}
              </div>
              <Pager page={page} pageSize={PAGE_SIZE} total={boards.length} onChange={setPage} />
            </>
          )}
          {railTab === "boxes" && (
            <>
              <div className="shot-rail-grid">
                {pageSlice(boxes, page, PAGE_SIZE).map((box) => (
                  <button
                    key={box.id}
                    type="button"
                    className="shot-rail-item"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/x-tmd-shot", JSON.stringify({ kind: "box", refId: box.id }))}
                    onClick={() => addItem({ kind: "box", refId: box.id })}
                  >
                    <div className="shot-thumb-ph" />
                    <span>{box.name}</span>
                  </button>
                ))}
              </div>
              <Pager page={page} pageSize={PAGE_SIZE} total={boxes.length} onChange={setPage} />
            </>
          )}
        </aside>
        <SplitHandle onDelta={(dx) => setLeftW(Math.min(420, Math.max(160, leftW + dx)))} />
        <ShotViewport
          items={shot.items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          gizmoMode={gizmoMode}
          onDropAdd={(payload) => addItem(payload)}
          onMove={(id, x, z) =>
            patchItem(id, { position: { ...(shot.items.find((i) => i.id === id)?.position ?? { x: 0, y: 0, z: 0 }), x, z } }, "shot-move")
          }
          onTransform={(id, patch, mergeKey) => patchItem(id, patch, mergeKey)}
          onOrbit={(yaw, pitch, distance) =>
            patchShot((s) => ({ ...s, render: { ...s.render, camera: { ...s.render.camera, yaw, pitch, distance } } }), "shot-orbit")
          }
          render={shot.render}
          look={look}
          project={project}
          projectDir={currentPath}
        />
        <SplitHandle onDelta={(dx) => setRightW(Math.min(440, Math.max(200, rightW - dx)))} />
        <aside className="box-side">
          <div className="form">
            <div className="field">
              <label>场景名称</label>
              <input value={shot.name} onChange={(e) => patchShot((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="field">
              <label>布局模版</label>
              <div className="row">
                <select value={layoutPick} onChange={(e) => setLayoutPick(e.target.value as ShotLayoutId)}>
                  {SHOT_LAYOUTS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => patchShot((s) => applyShotLayout(s, layoutPick, project, false))}
                >
                  应用
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => patchShot((s) => applyShotLayout(s, layoutPick, project, true))}
                >
                  只重排
                </button>
              </div>
            </div>
            <div className="field">
              <label>摄像机</label>
              <div className="row">
                <button
                  type="button"
                  className={`btn btn-small ${!iso ? "btn-primary" : ""}`}
                  onClick={() => patchShot((s) => ({ ...s, render: { ...s.render, projection: "perspective" } }))}
                >
                  透视
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${iso ? "btn-primary" : ""}`}
                  onClick={() => patchShot((s) => ({ ...s, render: { ...s.render, projection: "isometric" } }))}
                >
                  等距
                </button>
              </div>
            </div>
            {!iso ? (
              <div className="field">
                <label>焦距 FOV</label>
                <input
                  type="number"
                  value={render.camera.fov}
                  onChange={(e) =>
                    patchShot((s) => ({ ...s, render: { ...s.render, camera: { ...s.render.camera, fov: Number(e.target.value) } } }), "shot-fov")
                  }
                />
              </div>
            ) : null}
            {selected ? (
              <>
                <p className="muted">{selected.refId ? "选中物件" : "空槽位：从左栏指定卡 / 集 / 盒"}</p>
                <div className="row">
                  {(["move", "rotate", "scale"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-small ${gizmoMode === m ? "btn-primary" : ""}`}
                      onClick={() => setGizmoMode(m)}
                    >
                      {m === "move" ? "移动" : m === "rotate" ? "旋转" : "缩放"}
                    </button>
                  ))}
                </div>
                <div className="row">
                  {(["x", "y", "z"] as const).map((k) => (
                    <div className="field grow" key={k}>
                      <label>{k.toUpperCase()} mm</label>
                      <input
                        type="number"
                        value={Math.round(selected.position[k] * 10) / 10}
                        onChange={(e) =>
                          patchItem(selected.id, { position: { ...selected.position, [k]: Number(e.target.value) } }, "shot-pos")
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="row">
                  {(["x", "y", "z"] as const).map((k) => (
                    <div className="field grow" key={`r${k}`}>
                      <label>绕 {k.toUpperCase()}°</label>
                      <input
                        type="number"
                        value={Math.round(selected.rotationDeg[k] * 10) / 10}
                        onChange={(e) =>
                          patchItem(selected.id, { rotationDeg: { ...selected.rotationDeg, [k]: Number(e.target.value) } }, "shot-rot")
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="field">
                  <label>缩放 {selected.scale ?? 1}</label>
                  <input
                    type="range"
                    min={0.2}
                    max={3}
                    step={0.05}
                    value={selected.scale ?? 1}
                    onChange={(e) => patchItem(selected.id, { scale: Number(e.target.value) }, "shot-scale")}
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    patchShot((s) => ({ ...s, items: s.items.filter((it) => it.id !== selected.id) }));
                    setSelectedId(null);
                  }}
                >
                  从场景删除
                </button>
              </>
            ) : (
              <p className="muted">点选场景里的物件或控制杆，或从左栏加入。</p>
            )}
            <hr />
            <div className="field">
              <label>主光强度 {render.lights.key.intensity.toFixed(2)}</label>
              <input
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={render.lights.key.intensity}
                onChange={(e) =>
                  patchShot(
                    (s) => ({
                      ...s,
                      render: {
                        ...s.render,
                        lights: { ...s.render.lights, key: { ...s.render.lights.key, intensity: Number(e.target.value) } },
                      },
                    }),
                    "shot-light",
                  )
                }
              />
            </div>
            <div className="row">
              <div className="field grow">
                <label>主光 Y°</label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={render.lights.key.yaw}
                  onChange={(e) =>
                    patchShot(
                      (s) => ({
                        ...s,
                        render: {
                          ...s.render,
                          lights: { ...s.render.lights, key: { ...s.render.lights.key, yaw: Number(e.target.value) } },
                        },
                      }),
                      "shot-light",
                    )
                  }
                />
              </div>
              <div className="field grow">
                <label>主光 P°</label>
                <input
                  type="range"
                  min={-10}
                  max={89}
                  value={render.lights.key.pitch}
                  onChange={(e) =>
                    patchShot(
                      (s) => ({
                        ...s,
                        render: {
                          ...s.render,
                          lights: { ...s.render.lights, key: { ...s.render.lights.key, pitch: Number(e.target.value) } },
                        },
                      }),
                      "shot-light",
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
                patchShot((s) => ({
                  ...s,
                  render: { ...s.render, lights: { ...s.render.lights, key: { ...s.render.lights.key, color: c } } },
                }), "shot-light")
              }
            />
            <ColorField
              label="背景色"
              value={render.background ?? "#1c1c22"}
              fallback="#1c1c22"
              onChange={(c) => !render.cullBackground && patchShot((s) => ({ ...s, render: { ...s.render, background: c } }), "shot-bg")}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={!!render.cullBackground}
                onChange={(e) => patchShot((s) => ({ ...s, render: { ...s.render, cullBackground: e.target.checked } }))}
              />
              剔除背景
            </label>
            <hr />
            <label className="check">
              <input
                type="checkbox"
                checked={!!look.outline?.enabled}
                onChange={(e) =>
                  patchShot((s) => ({ ...s, look: { ...ensureShotLook(s.look), outline: { ...ensureShotLook(s.look).outline!, enabled: e.target.checked } } }))
                }
              />
              轮廓描边
            </label>
            {look.outline?.enabled ? (
              <>
                <ColorField
                  label="描边色"
                  value={look.outline.color}
                  fallback="#111111"
                  onChange={(c) =>
                    patchShot((s) => ({ ...s, look: { ...ensureShotLook(s.look), outline: { ...ensureShotLook(s.look).outline!, color: c } } }), "shot-out")
                  }
                />
                <div className="field">
                  <label>描边宽 {look.outline.widthPx} px</label>
                  <input
                    type="range"
                    min={1}
                    max={16}
                    value={look.outline.widthPx}
                    onChange={(e) =>
                      patchShot(
                        (s) => ({
                          ...s,
                          look: { ...ensureShotLook(s.look), outline: { ...ensureShotLook(s.look).outline!, widthPx: Number(e.target.value) } },
                        }),
                        "shot-out",
                      )
                    }
                  />
                </div>
              </>
            ) : null}
            <div className="field">
              <label>暗角 {look.vignette ?? 0}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={look.vignette ?? 0}
                onChange={(e) => patchShot((s) => ({ ...s, look: { ...ensureShotLook(s.look), vignette: Number(e.target.value) } }), "shot-look")}
              />
            </div>
            <div className="field">
              <label>辉光 {look.bloom ?? 0}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={look.bloom ?? 0}
                onChange={(e) => patchShot((s) => ({ ...s, look: { ...ensureShotLook(s.look), bloom: Number(e.target.value) } }), "shot-look")}
              />
            </div>
            <div className="field">
              <label>曝光 {look.exposure ?? 1}</label>
              <input
                type="range"
                min={0.4}
                max={1.8}
                step={0.02}
                value={look.exposure ?? 1}
                onChange={(e) => patchShot((s) => ({ ...s, look: { ...ensureShotLook(s.look), exposure: Number(e.target.value) } }), "shot-look")}
              />
            </div>
            <div className="field">
              <label>对比 {look.contrast ?? 1}</label>
              <input
                type="range"
                min={0.4}
                max={1.8}
                step={0.02}
                value={look.contrast ?? 1}
                onChange={(e) => patchShot((s) => ({ ...s, look: { ...ensureShotLook(s.look), contrast: Number(e.target.value) } }), "shot-look")}
              />
            </div>
            <div className="field">
              <label>饱和 {look.saturation ?? 1}</label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.02}
                value={look.saturation ?? 1}
                onChange={(e) => patchShot((s) => ({ ...s, look: { ...ensureShotLook(s.look), saturation: Number(e.target.value) } }), "shot-look")}
              />
            </div>
            <div className="field">
              <label>柔化 {look.blur ?? 0}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={look.blur ?? 0}
                onChange={(e) => patchShot((s) => ({ ...s, look: { ...ensureShotLook(s.look), blur: Number(e.target.value) } }), "shot-look")}
              />
            </div>
            <div className="field">
              <label>分辨率</label>
              <select
                value={`${render.resolutionW}x${render.resolutionH}`}
                onChange={(e) => {
                  const [rw, rh] = e.target.value.split("x").map(Number);
                  patchShot((s) => ({ ...s, render: { ...s.render, resolutionW: rw, resolutionH: rh } }));
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
        </aside>
      </div>
    </div>
  );
}
