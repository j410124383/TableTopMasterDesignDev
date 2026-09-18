import { useEffect, useState, memo } from "react";
import { BoxGl } from "@/features/box/boxGl";
import { openExportModelFolder, openRenderFolder, saveRenderPng } from "@/features/box/saveRenderPng";
import { uid } from "@/lib/id";
import { templateFromBlueprint } from "@/model/normalize";
import { ensureShotLook, nextItemOffset } from "@/model/shot";
import {
  applyOrbitToLookThrough,
  ensureShotCameras,
  lookThroughCamera,
  nextCameraName,
  patchShotCamera,
  removeShotCamera,
  shotCameraFromOrbit,
} from "@/model/shotCamera";
import { boxModeOf } from "@/model/box";
import type { ProductShot, ProductShotItem, Project, ShotStackLook, ShotStackShape } from "@/model/types";
import { renderCardToCanvas } from "@/render/drawCard";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ColorField } from "@/ui/ColorField";
import { HelpTip } from "@/ui/HelpTip";
import { IconBtn } from "@/ui/IconBtn";
import { IconCamera, IconFilter, IconGrid, IconLayout, IconLight, IconObject, IconReturn } from "@/ui/Icons";
import { pageSlice, Pager } from "@/ui/Pager";
import { ResolutionField } from "@/ui/ResolutionField";
import { SplitHandle, usePaneSize } from "@/ui/Splitter";
import { WorkLock } from "@/ui/WorkLock";
import { applyProductLook } from "./shotLook";
import { exportSceneFbx } from "./exportSceneFbx";
import { applyShotLayout, fillShotSlot, SHOT_LAYOUTS, type ShotLayoutId } from "./shotLayout";
import { defaultLieRotation, placeYForItem, placeYForShotItem, resolveShotDrawItems, shotBoxLidOpen } from "./shotResolve";
import { exportCardDpi, exportBoardContour, exportTextureOf } from "./shotTexture";
import { STACK_CARD_CAP, expandSetCards, fanResolved, itemFaceDown, stackDrawCards, stackShapeOf, stackSlice } from "./shotStack";
import { ShotLibrary } from "./ShotLibrary";
import { ShotOutliner } from "./ShotOutliner";
import { ShotViewport, type ShotDropPayload } from "./ShotViewport";
import type { GizmoMode, GizmoSpace } from "./shotGizmo";

const PAGE_SIZE = 12;

export function StackLookPanel({
  item,
  project,
  onChange,
}: {
  item: ProductShotItem;
  project: Project;
  onChange: (stack: ShotStackLook, restY: boolean) => void;
}) {
  const set = project.sets.find((s) => s.id === item.refId);
  const bp = set ? project.blueprints.find((b) => b.id === set.blueprintId) : undefined;
  const total = expandSetCards(set).length;
  const slice = stackSlice(set, item.stack);
  const shape = stackShapeOf(item.stack);
  const drawn = stackDrawCards(set, item.stack).length;
  const fan = bp ? fanResolved(bp, item.stack) : { inner: 36, outer: 240 };
  const from = item.stack?.countFrom ?? 1;
  const to = item.stack?.countTo ?? total;
  function patch(partial: Partial<ShotStackLook>, restY = false) {
    onChange({ ...item.stack, ...partial }, restY);
  }
  return (
    <div className="shot-stack-look">
      <p className="muted">卡牌集</p>
      <div className="row">
        <div className="field grow">
          <label>从</label>
          <input
            type="number"
            min={1}
            max={total}
            value={from}
            onChange={(e) => patch({ countFrom: Number(e.target.value) }, true)}
          />
        </div>
        <div className="field grow">
          <label>到</label>
          <input
            type="number"
            min={1}
            max={total}
            value={to}
            onChange={(e) => patch({ countTo: Number(e.target.value) }, true)}
          />
        </div>
      </div>
      <p className="muted">
        本集共 {total} 张，用 {slice.length} 张
        {shape !== "deck" && drawn < slice.length ? `，只显示 ${STACK_CARD_CAP} / ${slice.length}` : ""}
      </p>
      <div className="field">
        <label>形态</label>
        <select
          value={shape}
          onChange={(e) => patch({ shape: e.target.value as ShotStackShape }, true)}
        >
          <option value="deck">牌组</option>
          <option value="messy">错落</option>
          <option value="row">一字排开</option>
          <option value="fan">扇形</option>
        </select>
      </div>
      {shape === "messy" ? (
        <div className="field">
          <label>错落 {(item.stack?.messy ?? 0.4).toFixed(2)}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={item.stack?.messy ?? 0.4}
            onChange={(e) => patch({ messy: Number(e.target.value) })}
          />
        </div>
      ) : null}
      {shape === "row" || shape === "fan" ? (
        <>
          <div className="field">
            <label>间距 mm</label>
            <input
              type="number"
              step="0.5"
              value={item.stack?.gapMm ?? 4}
              onChange={(e) => patch({ gapMm: Number(e.target.value) }, true)}
            />
          </div>
          <div className="field">
            <label>排开</label>
            <select
              value={item.stack?.spread === "rtl" ? "rtl" : "ltr"}
              onChange={(e) => patch({ spread: e.target.value === "rtl" ? "rtl" : "ltr" }, true)}
            >
              <option value="ltr">从左到右</option>
              <option value="rtl">从右到左</option>
            </select>
          </div>
        </>
      ) : null}
      {shape === "fan" ? (
        <>
          <div className="field">
            <label>扇叶</label>
            <select
              value={item.stack?.fanLeaf ?? "bottomUp"}
              onChange={(e) => patch({ fanLeaf: e.target.value === "topDown" ? "topDown" : "bottomUp" }, true)}
            >
              <option value="bottomUp">从下到上</option>
              <option value="topDown">从上到下</option>
            </select>
          </div>
          <div className="field">
            <label>下弧宽 mm</label>
            <input
              type="number"
              min={4}
              step="1"
              value={Math.round(fan.inner * 10) / 10}
              onChange={(e) => patch({ fanInnerMm: Number(e.target.value) }, true)}
            />
          </div>
          <div className="field">
            <label>上弧长 mm</label>
            <input
              type="number"
              min={8}
              step="1"
              value={Math.round(fan.outer * 10) / 10}
              onChange={(e) => patch({ fanOuterMm: Number(e.target.value) }, true)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

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
  const [exporting, setExporting] = useState(false);
  const [railTab, setRailTab] = useState<"sets" | "cards" | "boards" | "boxes" | "cameras">("sets");
  const [cardSetId, setCardSetId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [leftW, setLeftW] = usePaneSize("shot-left", 420);
  const [outlinerW, setOutlinerW] = usePaneSize("shot-outliner-w", 168);
  const [rightW, setRightW] = usePaneSize("shot-right", 280);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("move");
  const [gizmoSpace, setGizmoSpace] = useState<GizmoSpace>("local");
  const [layoutPick, setLayoutPick] = useState<ShotLayoutId>((shot.layoutId as ShotLayoutId) || "empty");
  const [rightTab, setRightTab] = useState<"scene" | "layout" | "camera" | "light" | "look" | "object">("scene");

  useEffect(() => {
    if (selectedId) setRightTab("object");
    else setRightTab((t) => (t === "object" ? "scene" : t));
  }, [selectedId]);

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
        shots: (p.shots ?? []).map((s) => {
          if (s.id !== shot.id) return s;
          const live = ensureShotCameras(s);
          if (live.cameras?.some((c) => c.id === selectedId)) return removeShotCamera(live, selectedId);
          return { ...s, items: s.items.filter((it) => it.id !== selectedId) };
        }),
      }));
      setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, shot.id, patchProject]);

  useEffect(() => {
    if (shot.cameras?.length) return;
    patchProject((p) => ({
      ...p,
      shots: (p.shots ?? []).map((s) => (s.id === shot.id ? ensureShotCameras(s) : s)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id]);

  if (!current) return <div className="page">未打开项目</div>;

  const project = current;
  const liveShot = ensureShotCameras(shot);
  const cameras = liveShot.cameras ?? [];
  const lookThroughId = liveShot.lookThroughId ?? cameras[0]?.id;
  const render = shot.render;
  const look = ensureShotLook(shot.look);
  const selected = shot.items.find((it) => it.id === selectedId) ?? null;
  const selectedCam = cameras.find((c) => c.id === selectedId) ?? null;
  const objectOn = !!(selected || selectedCam);
  const pieceBoards = project.boards ?? [];
  const legacyBoards = project.blueprints.filter((b) => b.kind === "board");
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
    const y = placeYForItem(partial.kind, project, partial.refId, partial.setId, partial.stack);
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

  function addCamera() {
    const cam = shotCameraFromOrbit(render.camera, {
      name: nextCameraName(cameras),
      projection: render.projection ?? "perspective",
    });
    patchShot((s) => {
      const live = ensureShotCameras(s);
      return { ...live, cameras: [...(live.cameras ?? []), cam] };
    });
    setSelectedId(cam.id);
  }

  function dropAdd(payload: ShotDropPayload) {
    if (payload.kind === "camera") {
      addCamera();
      return;
    }
    addItem(payload);
  }

  function lookThrough(id: string) {
    patchShot((s) => lookThroughCamera(s, id));
  }

  function deleteSceneObject(id: string) {
    patchShot((s) => {
      const live = ensureShotCameras(s);
      if (live.cameras?.some((c) => c.id === id)) return removeShotCamera(live, id);
      return { ...s, items: s.items.filter((it) => it.id !== id) };
    });
    if (selectedId === id) setSelectedId(null);
  }

  function LookThroughBtn({ cameraId }: { cameraId: string }) {
    const on = lookThroughId === cameraId;
    return (
      <IconBtn title={on ? "正在看穿" : "贴合视角"} onClick={() => lookThrough(cameraId)}>
        <IconCamera />
      </IconBtn>
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
      const quality = exportTextureOf(render.exportTexture);
      const drawn = await resolveShotDrawItems(shot.items, null, project, currentPath, {
        dpi: exportCardDpi(quality),
        contourMax: exportBoardContour(quality),
      });
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

  async function doExportModel() {
    if (!shot.items.some((it) => it.refId)) {
      setError("场景里还没有物件");
      return;
    }
    setExporting(true);
    try {
      const msg = await exportSceneFbx({
        name: shot.name,
        items: shot.items,
        project,
        projectDir: currentPath,
        render,
        note: `看穿 ${lookThroughId ?? ""}`,
      });
      setInfo(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出模型失败");
    } finally {
      setExporting(false);
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
            <p>大纲和创建左右并列。选中后拖控制杆；可切世界/本地轴向。W 移动 / E 旋转 / R 缩放。</p>
            <p>视口写着当前看穿的摄像机。空白左键转镜头不会丢掉选中；单击空白才取消。中键或 Alt+左键平移；滚轮推拉。</p>
            <p>大纲里选摄像机，点摄像机图标把视口贴合到那台机（Look Through）。</p>
            <p>可切换透视与等距。应用布局模版后，把卡和盒子填进半透明占位体。</p>
            <p>包装盒倒角在包装盒编辑器里调，本页不改。选中天地盒可以合上或打开。</p>
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
        <aside
          className="shot-left"
          style={{ gridTemplateColumns: `${Math.max(120, outlinerW)}px 6px minmax(0, 1fr)` }}
        >
          <ShotOutliner
            project={project}
            items={shot.items}
            cameras={cameras}
            lookThroughId={lookThroughId}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onLookThrough={lookThrough}
            onRename={(id, name) => {
              if (cameras.some((c) => c.id === id)) patchShot((s) => patchShotCamera(s, id, { name }));
            }}
            onDelete={deleteSceneObject}
          />
          <SplitHandle onDelta={(dx) => setOutlinerW(Math.min(280, Math.max(120, outlinerW + dx)))} />
          <div className="shot-rail">
          <h3 className="shot-create-title">创建</h3>
          <div className="shot-rail-tabs">
            {(
              [
                ["sets", "卡牌集"],
                ["cards", "单卡"],
                ["boards", "板件"],
                ["boxes", "包装盒"],
                ["cameras", "摄像机"],
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
                {pageSlice(
                  [
                    ...pieceBoards.map((bd) => ({ id: bd.id, name: bd.name, src: bd.textureAssetId ? project.assets[bd.textureAssetId] : "", legacy: false })),
                    ...legacyBoards.map((bp) => ({ id: bp.id, name: bp.name, src: "", legacy: true })),
                  ],
                  page,
                  PAGE_SIZE,
                ).map((bd) => (
                  <button
                    key={bd.id}
                    type="button"
                    className="shot-rail-item"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/x-tmd-shot", JSON.stringify({ kind: "board", refId: bd.id }))}
                    onClick={() => addItem({ kind: "board", refId: bd.id })}
                  >
                    {bd.legacy ? (
                      <CardThumb project={project} blueprintId={bd.id} />
                    ) : (
                      <div className="shot-thumb-ph board-thumb">{bd.src ? <img src={bd.src} alt="" className="shot-thumb-img" /> : null}</div>
                    )}
                    <span>{bd.name}</span>
                  </button>
                ))}
              </div>
              <Pager page={page} pageSize={PAGE_SIZE} total={pieceBoards.length + legacyBoards.length} onChange={setPage} />
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
          {railTab === "cameras" && (
            <div className="shot-rail-grid">
              <button type="button" className="shot-rail-item" draggable onDragStart={(e) => e.dataTransfer.setData("application/x-tmd-shot", JSON.stringify({ kind: "camera" }))} onClick={addCamera}>
                <div className="shot-thumb-ph" style={{ display: "grid", placeItems: "center" }}>
                  <IconCamera size={22} />
                </div>
                <span>新建摄像机</span>
              </button>
            </div>
          )}
          </div>
        </aside>
        <SplitHandle onDelta={(dx) => setLeftW(Math.min(720, Math.max(280, leftW + dx)))} />
        <ShotViewport
          items={shot.items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          gizmoMode={gizmoMode}
          gizmoSpace={gizmoSpace}
          lookThroughName={cameras.find((c) => c.id === lookThroughId)?.name ?? lookThroughId}
          onDropAdd={dropAdd}
          onMove={(id, x, z) =>
            patchItem(id, { position: { ...(shot.items.find((i) => i.id === id)?.position ?? { x: 0, y: 0, z: 0 }), x, z } }, "shot-move")
          }
          onTransform={(id, patch, mergeKey) => patchItem(id, patch, mergeKey)}
          onCameraTransform={(id, patch, mergeKey) => patchShot((s) => patchShotCamera(s, id, patch), mergeKey)}
          onOrbit={(yaw, pitch, distance, target) => patchShot((s) => applyOrbitToLookThrough(s, { yaw, pitch, distance, target }), "shot-orbit")}
          cameras={cameras}
          lookThroughId={lookThroughId}
          render={shot.render}
          look={look}
          project={project}
          projectDir={currentPath}
        />
        <SplitHandle onDelta={(dx) => setRightW(Math.min(440, Math.max(200, rightW - dx)))} />
        <aside className="box-side">
          <div className="shot-icon-tabs">
            {([
              { id: "scene" as const, label: "场景", Icon: IconGrid },
              { id: "layout" as const, label: "布局模版", Icon: IconLayout },
              { id: "camera" as const, label: "摄影机", Icon: IconCamera },
              { id: "light" as const, label: "灯光", Icon: IconLight },
              { id: "look" as const, label: "后处理", Icon: IconFilter },
              ...(objectOn ? [{ id: "object" as const, label: "选中物体", Icon: IconObject }] : []),
            ]).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`shot-icon-tab ${rightTab === id ? "active" : ""}`}
                title={label}
                onClick={() => setRightTab(id)}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
          <p className="shot-icon-tab-title">
            {rightTab === "scene"
              ? "场景"
              : rightTab === "layout"
                ? "布局模版"
                : rightTab === "camera"
                  ? "摄影机"
                  : rightTab === "light"
                    ? "灯光"
                    : rightTab === "look"
                      ? "后处理"
                      : "选中物体"}
          </p>
          <div className="form">
            {rightTab === "scene" ? (
              <>
                <div className="field">
                  <label>场景名称</label>
                  <input value={shot.name} onChange={(e) => patchShot((s) => ({ ...s, name: e.target.value }))} />
                </div>
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
                <ResolutionField
                  width={render.resolutionW}
                  height={render.resolutionH}
                  onChange={(rw, rh) =>
                    patchShot((s) => ({ ...s, render: { ...s.render, resolutionW: rw, resolutionH: rh } }))
                  }
                />
                <div className="field">
                  <label>出图贴图</label>
                  <div className="row">
                    <button
                      type="button"
                      className={`btn btn-small ${exportTextureOf(render.exportTexture) === "standard" ? "btn-primary" : ""}`}
                      onClick={() => patchShot((s) => ({ ...s, render: { ...s.render, exportTexture: "standard" } }))}
                    >
                      标准
                    </button>
                    <button
                      type="button"
                      className={`btn btn-small ${exportTextureOf(render.exportTexture) === "max" ? "btn-primary" : ""}`}
                      onClick={() => patchShot((s) => ({ ...s, render: { ...s.render, exportTexture: "max" } }))}
                    >
                      最高
                    </button>
                  </div>
                  <p className="muted">只影响下一次出图，不拖慢视口。最高：卡面 300 DPI、板件原图。</p>
                </div>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void doRender()}>
                  {busy ? "渲染中…" : "渲染并保存到「渲染图」"}
                </button>
                <button type="button" className="btn" disabled={exporting || !shot.items.some((it) => it.refId)} onClick={() => void doExportModel()}>
                  {exporting ? "导出中…" : "导出模型"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void openRenderFolder(currentPath).then(setInfo)}
                >
                  打开渲染文件夹
                </button>
                <button type="button" className="btn" onClick={() => void openExportModelFolder(currentPath).then(setInfo)}>
                  打开导出模型文件夹
                </button>
              </>
            ) : null}
            {rightTab === "layout" ? (
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
                  <button type="button" className="btn btn-small" onClick={() => patchShot((s) => applyShotLayout(s, layoutPick, project, false))}>
                    应用
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => patchShot((s) => applyShotLayout(s, layoutPick, project, true))}>
                    只重排
                  </button>
                </div>
              </div>
            ) : null}
            {rightTab === "camera" ? (
              <>
                <div className="field">
                  <label>当前看穿：{cameras.find((c) => c.id === lookThroughId)?.name ?? "persp"}</label>
                  <div className="row">
                    <button
                      type="button"
                      className={`btn btn-small ${!iso ? "btn-primary" : ""}`}
                      onClick={() =>
                        lookThroughId &&
                        patchShot((s) => patchShotCamera({ ...s, render: { ...s.render, projection: "perspective" } }, lookThroughId, { projection: "perspective" }))
                      }
                    >
                      透视
                    </button>
                    <button
                      type="button"
                      className={`btn btn-small ${iso ? "btn-primary" : ""}`}
                      onClick={() =>
                        lookThroughId &&
                        patchShot((s) => patchShotCamera({ ...s, render: { ...s.render, projection: "isometric" } }, lookThroughId, { projection: "isometric" }))
                      }
                    >
                      等距
                    </button>
                    {selectedCam ? <LookThroughBtn cameraId={selectedCam.id} /> : null}
                  </div>
                </div>
                {!iso ? (
                  <div className="field">
                    <label>焦距 FOV</label>
                    <input
                      type="number"
                      value={render.camera.fov}
                      onChange={(e) => {
                        const fov = Number(e.target.value);
                        if (!lookThroughId) return;
                        patchShot(
                          (s) =>
                            patchShotCamera(
                              { ...s, render: { ...s.render, camera: { ...s.render.camera, fov } } },
                              lookThroughId,
                              { fov },
                            ),
                          "shot-fov",
                        );
                      }}
                    />
                  </div>
                ) : null}
                <div className="field">
                  <label>机位</label>
                  <div className="row">
                    {([30, 45, 60] as const).map((pitch) => (
                      <button
                        key={pitch}
                        type="button"
                        className={`btn btn-small ${Math.round(render.camera.pitch) === pitch ? "btn-primary" : ""}`}
                        onClick={() =>
                          patchShot((s) => applyOrbitToLookThrough(s, { yaw: 38, pitch, distance: s.render.camera.distance }))
                        }
                      >
                        斜 {pitch}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
            {rightTab === "light" ? (
              <>
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
              </>
            ) : null}
            {rightTab === "look" ? (
              <>
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
              </>
            ) : null}
            {rightTab === "object" && selectedCam ? (
              <>
                <p className="muted">摄像机 {selectedCam.name}</p>
                <div className="row">
                  <LookThroughBtn cameraId={selectedCam.id} />
                </div>
                <div className="row">
                  {(["move", "rotate"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-small ${gizmoMode === m ? "btn-primary" : ""}`}
                      onClick={() => setGizmoMode(m)}
                    >
                      {m === "move" ? "移动" : "旋转"}
                    </button>
                  ))}
                </div>
                <div className="row">
                  {(["local", "world"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`btn btn-small ${gizmoSpace === s ? "btn-primary" : ""}`}
                      onClick={() => setGizmoSpace(s)}
                    >
                      {s === "local" ? "本地轴" : "世界轴"}
                    </button>
                  ))}
                </div>
                <div className="row">
                  {(["x", "y", "z"] as const).map((k) => (
                    <div className="field grow" key={k}>
                      <label>{k.toUpperCase()} mm</label>
                      <input
                        type="number"
                        value={Math.round(selectedCam.position[k] * 10) / 10}
                        onChange={(e) =>
                          patchShot((s) => patchShotCamera(s, selectedCam.id, { position: { ...selectedCam.position, [k]: Number(e.target.value) } }), "shot-cam-pos")
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
                        value={Math.round(selectedCam.rotationDeg[k] * 10) / 10}
                        onChange={(e) =>
                          patchShot(
                            (s) => patchShotCamera(s, selectedCam.id, { rotationDeg: { ...selectedCam.rotationDeg, [k]: Number(e.target.value) } }),
                            "shot-cam-rot",
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                <button type="button" className="btn" disabled={cameras.length <= 1} onClick={() => deleteSceneObject(selectedCam.id)}>
                  从场景删除
                </button>
              </>
            ) : null}
            {rightTab === "object" && selected ? (
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
                  {(["local", "world"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`btn btn-small ${gizmoSpace === s ? "btn-primary" : ""}`}
                      onClick={() => setGizmoSpace(s)}
                    >
                      {s === "local" ? "本地轴" : "世界轴"}
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
                {selected.kind === "box" && selected.refId
                  ? (() => {
                      const box = (project.boxes ?? []).find((b) => b.id === selected.refId);
                      if (!box || boxModeOf(box) !== "lidBase") return null;
                      const open = shotBoxLidOpen(selected, box);
                      return (
                        <div className="field">
                          <label>开合</label>
                          <div className="row">
                            <button
                              type="button"
                              className={`btn btn-small ${open < 0.05 ? "btn-primary" : ""}`}
                              onClick={() => patchItem(selected.id, { lidOpen: 0 }, "shot-lid")}
                            >
                              合上
                            </button>
                            <button
                              type="button"
                              className={`btn btn-small ${open > 0.95 ? "btn-primary" : ""}`}
                              onClick={() => patchItem(selected.id, { lidOpen: 1 }, "shot-lid")}
                            >
                              打开
                            </button>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={open}
                            onChange={(e) => patchItem(selected.id, { lidOpen: Number(e.target.value) }, "shot-lid")}
                          />
                        </div>
                      );
                    })()
                  : null}
                {selected.kind === "card" || selected.kind === "stack" ? (
                  <div className="field">
                    <label>站姿</label>
                    <select
                      value={itemFaceDown(selected) ? "back" : "front"}
                      onChange={(e) => {
                        const face: "front" | "back" = e.target.value === "back" ? "back" : "front";
                        const next = { ...selected, face };
                        patchItem(
                          selected.id,
                          {
                            face,
                            position: { ...selected.position, y: placeYForShotItem(next, project) },
                          },
                          "shot-face",
                        );
                      }}
                    >
                      <option value="front">正面朝上</option>
                      <option value="back">背面朝上</option>
                    </select>
                  </div>
                ) : null}
                {selected.kind === "stack" && selected.refId ? (
                  <StackLookPanel
                    item={selected}
                    project={project}
                    onChange={(stack, restY) =>
                      patchItem(
                        selected.id,
                        {
                          stack,
                          ...(restY
                            ? { position: { ...selected.position, y: placeYForShotItem({ ...selected, stack }, project) } }
                            : {}),
                        },
                        "shot-stack",
                      )
                    }
                  />
                ) : null}
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
            ) : null}
          </div>
        </aside>
      </div>
      <WorkLock open={busy} title="正在写出渲染图" />
      <WorkLock open={exporting} title="正在导出模型" />
    </div>
  );
}
