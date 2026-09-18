import { useEffect, useRef, useState } from "react";
import { BoxGl } from "@/features/box/boxGl";
import { openExportModelFolder, openSequenceFolder, safeRenderName, writePngRel, writeTextRel } from "@/features/box/saveRenderPng";
import { exportSceneFbx } from "@/features/shot/exportSceneFbx";
import { ShotViewport } from "@/features/shot/ShotViewport";
import { StackLookPanel } from "@/features/shot/ShotPage";
import { resolveShotDrawItems, shotBoxLidOpen } from "@/features/shot/shotResolve";
import { exportBoardContour, exportCardDpi, exportTextureOf } from "@/features/shot/shotTexture";
import { isTmdDesktop } from "@/lib/desktop";
import { looksLikeFullPath } from "@/persist/storage";
import { boxModeOf } from "@/model/box";
import {
  actorOf,
  applyStudioBackdropShot,
  setStudioActor,
  studioBlockingReason,
  studioCanRender,
  studioDuration,
  studioFpsOf,
  studioFrameCount,
  studioLookThroughOf,
  studioParamsOf,
  studioTemplateOf,
  studioViewCameraOf,
  STUDIO_TEMPLATES,
  switchStudioTemplate,
} from "@/model/studio";
import type { Studio, StudioActor, StudioParams, StudioTemplateId } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ColorField } from "@/ui/ColorField";
import { HelpTip } from "@/ui/HelpTip";
import { IconBtn } from "@/ui/IconBtn";
import { IconCamera, IconGrid, IconLayout, IconLight, IconObject, IconReturn } from "@/ui/Icons";
import { Pager } from "@/ui/Pager";
import { ResolutionField } from "@/ui/ResolutionField";
import { SplitHandle, usePaneSize } from "@/ui/Splitter";
import { WorkLock } from "@/ui/WorkLock";
import { studioScene, studioSheetLines } from "./studioPlay";
import { StudioLibrary } from "./StudioLibrary";

const PAGE = 8;

function SecField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (n: number, merge?: boolean) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        min={0.01}
        step={0.1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n > 0) onCommit(n, true);
        }}
        onBlur={() => {
          const n = Number(text);
          onCommit(Number.isFinite(n) && n > 0 ? n : value, false);
        }}
      />
    </div>
  );
}

export function StudioPage() {
  const current = useAppStore((s) => s.current);
  const studioId = useEditorStore((s) => s.studioId);
  const libraryOpen = useEditorStore((s) => s.studioLibraryOpen);
  const studio = current?.studios?.find((s) => s.id === studioId) ?? current?.studios?.[0];
  if (libraryOpen || !studio) return <StudioLibrary />;
  return <StudioEditor key={studio.id} studio={studio} />;
}

function StudioEditor({ studio }: { studio: Studio }) {
  const { current, currentPath, patchProject, setInfo, setError } = useAppStore();
  const setStudioLibraryOpen = useEditorStore((s) => s.setStudioLibraryOpen);
  const [leftW, setLeftW] = usePaneSize("studio-left", 260);
  const [rightW, setRightW] = usePaneSize("studio-right", 280);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [page, setPage] = useState(1);
  const [seq, setSeq] = useState<{ done: number; total: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rightTab, setRightTab] = useState<"scene" | "light" | "camera" | "template" | "actor">("scene");
  const [selectedSlot, setSelectedSlot] = useState<"box" | "stack" | null>(null);
  const cancelRef = useRef(false);
  const playRef = useRef(0);
  const timeRef = useRef(0);
  timeRef.current = time;

  if (!current) return <div className="page">未打开项目</div>;
  const project = current;
  const tpl = studioTemplateOf(studio.templateId);
  const params = studioParamsOf(studio);
  const duration = studioDuration(studio, project);
  const missing = studioBlockingReason(studio, project);
  const canRender = studioCanRender(studio, project);
  const desktop = isTmdDesktop();
  const bound = !!(currentPath && looksLikeFullPath(currentPath));
  const scene = studioScene(studio, time, project);
  const lookThrough = studioLookThroughOf(studio);
  const viewCam = studioViewCameraOf(studio);
  const backdropShot = studio.backdrop?.kind === "shot" ? (project.shots ?? []).find((s) => s.id === studio.backdrop?.shotId) : undefined;
  const backdropLost = studio.backdrop?.kind === "shot" && studio.backdrop.shotId && !backdropShot;

  function patchStudio(recipe: (s: Studio) => Studio, mergeKey?: string) {
    patchProject(
      (p) => ({
        ...p,
        studios: (p.studios ?? []).map((s) => (s.id === studio.id ? recipe(s) : s)),
      }),
      mergeKey ? { mergeKey } : undefined,
    );
  }

  function patchParams(patch: Partial<StudioParams>, merge = true) {
    patchStudio((s) => ({ ...s, params: { ...studioParamsOf(s), ...patch } }), merge ? "studio-params" : undefined);
  }

  function patchActor(slotId: "box" | "stack", patch: Partial<StudioActor>, mergeKey?: string) {
    patchStudio(
      (s) => ({
        ...s,
        actors: s.actors.map((a) => (a.slotId === slotId ? { ...a, ...patch } : a)),
      }),
      mergeKey,
    );
  }

  function selectSlot(slot: "box" | "stack") {
    setSelectedSlot(slot);
    setRightTab("actor");
  }

  async function doExportModel() {
    if (!scene.items.some((it) => it.refId)) {
      setError("场景里还没有物件");
      return;
    }
    setExporting(true);
    try {
      const msg = await exportSceneFbx({
        name: studio.name,
        items: scene.items,
        project,
        projectDir: currentPath,
        render: scene.sequenceSetup,
        note: [
          `看穿：${lookThrough === "render" ? "渲染机" : "操作机"}`,
          `渲染机 yaw ${scene.sequenceSetup.camera.yaw.toFixed(1)} pitch ${scene.sequenceSetup.camera.pitch.toFixed(1)} fov ${scene.sequenceSetup.camera.fov}`,
          `操作机 yaw ${viewCam.yaw.toFixed(1)} pitch ${viewCam.pitch.toFixed(1)} fov ${viewCam.fov}`,
          `主光 yaw ${scene.sequenceSetup.lights.key.yaw} pitch ${scene.sequenceSetup.lights.key.pitch} 强度 ${scene.sequenceSetup.lights.key.intensity} 色 ${scene.sequenceSetup.lights.key.color}`,
        ].join("\n"),
      });
      setInfo(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出模型失败");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = timeRef.current + dt;
      const dur = studioDuration(studio, project);
      if (next >= dur) {
        setTime(dur);
        setPlaying(false);
        return;
      }
      setTime(next);
      playRef.current = requestAnimationFrame(tick);
    };
    playRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playRef.current);
  }, [playing, studio, project]);

  async function doSequence() {
    if (!desktop) {
      setError("序列帧只能在 TMD 窗口里渲，系统浏览器标签会卡死、写盘不稳。");
      return;
    }
    if (!bound || !currentPath) {
      setError("未绑定本机工程文件夹，无法写序列帧。请先绑定工程。");
      return;
    }
    if (!canRender) {
      setError(missing ?? "还缺演员");
      return;
    }
    cancelRef.current = false;
    const frames = studioFrameCount(studio, project);
    const seconds = studioDuration(studio, project);
    const fps = studioFpsOf(studio);
    const w = studio.render.resolutionW || 1920;
    const h = studio.render.resolutionH || 1080;
    const folder = safeRenderName(studio.name);
    setSeq({ done: 0, total: frames });
    try {
      const canvas = document.createElement("canvas");
      const gl = new BoxGl(canvas);
      gl.setSize(w, h, 1);
      const quality = exportTextureOf(studio.render.exportTexture);
      for (let i = 0; i < frames; i++) {
        if (cancelRef.current) break;
        const t = frames <= 1 ? 0 : (i / (frames - 1)) * seconds;
        const at = studioScene(studio, t, project);
        const drawn = await resolveShotDrawItems(at.items, null, project, currentPath, {
          dpi: exportCardDpi(quality),
          contourMax: exportBoardContour(quality),
        });
        gl.drawScene(at.sequenceSetup, drawn, { gizmos: false, transparentBg: !!at.sequenceSetup.cullBackground, groundY: 0 });
        const pad = String(i + 1).padStart(4, "0");
        await writePngRel(gl.canvas, currentPath, `序列帧/${folder}/${folder}.${pad}.png`);
        setSeq({ done: i + 1, total: frames });
      }
      await writeTextRel(currentPath, `序列帧/${folder}/镜头表.txt`, studioSheetLines(studio, project, frames, seconds) + `\nfps 写入：${fps}`);
      gl.dispose();
      setInfo(cancelRef.current ? "已取消。已写出的帧保留。" : `已写入序列帧/${folder}/`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "写序列失败");
    } finally {
      setSeq(null);
    }
  }

  const boxSlot = tpl.slots.find((s) => s.slotId === "box");
  const stackSlot = tpl.slots.find((s) => s.slotId === "stack");
  const boxes = (project.boxes ?? []).filter((b) => (boxSlot?.lidBase ? boxModeOf(b) === "lidBase" : true));
  const simpleRejected = boxSlot?.lidBase ? (project.boxes ?? []).filter((b) => boxModeOf(b) !== "lidBase") : [];
  const filledBox = actorOf(studio, "box");
  const filledStack = actorOf(studio, "stack");
  const lookProj = lookThrough === "render" ? studio.render.projection : viewCam.projection;
  const lookFov = lookThrough === "render" ? studio.render.camera.fov : viewCam.fov;
  const lookPitch = lookThrough === "render" ? studio.render.camera.pitch : viewCam.pitch;
  const otherCam = lookThrough === "render" ? viewCam : studio.render.camera;

  return (
    <div className="page box-page shot-page">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <IconBtn title="返回影棚库" onClick={() => setStudioLibraryOpen(true)}>
            <IconReturn />
          </IconBtn>
          <h1>{studio.name}</h1>
          <HelpTip>
            <p>左栏填模版要的演员；布景可引用已经摆好的产品场景，冻结当环境。</p>
            <p>只拧秒数和数量。拖底边播放条立刻看到开合、转台或展开，不会转圈加载。</p>
            <p>点「渲染镜头」写出 PNG 序列，拿到剪映 / PR 里成片。须在 TMD 窗口且已绑定工程文件夹。</p>
          </HelpTip>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setStudioLibraryOpen(true)}>
            返回库
          </button>
        </div>
      </div>
      <div className="shot-layout" style={{ gridTemplateColumns: `${leftW}px 6px minmax(0, 1fr) 6px ${rightW}px` }}>
        <aside className="shot-left studio-left">
          <h3 className="shot-create-title">演员</h3>
          {boxSlot ? (
            <div className="studio-slot" onClick={() => selectSlot("box")}>
              <div className="studio-slot-h">
                <strong>盒</strong>
                <span>{boxSlot.lidBase ? "必填 · 详细天地盒" : "必填 · 包装盒"}</span>
              </div>
              {filledBox ? (
                <div className="row">
                  <span>{(project.boxes ?? []).find((b) => b.id === filledBox.refId)?.name ?? filledBox.refId}</span>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      patchStudio((s) => setStudioActor(s, "box", null));
                    }}
                  >
                    清除
                  </button>
                </div>
              ) : (
                <p className="muted">{missing?.includes("盒") ? missing : "点下面的盒子填入。"}</p>
              )}
              <div className="shot-rail-grid">
                {boxes.slice((page - 1) * PAGE, page * PAGE).map((box) => (
                  <button
                    key={box.id}
                    type="button"
                    className={`shot-rail-item ${filledBox?.refId === box.id ? "active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectSlot("box");
                      patchStudio((s) => setStudioActor(s, "box", box.id));
                    }}
                  >
                    <div className="shot-thumb-ph" />
                    <span>{box.name}</span>
                  </button>
                ))}
              </div>
              {simpleRejected.length && boxSlot.lidBase ? (
                <p className="muted">这个模版需要详细天地盒，简单方盒不能开盖。</p>
              ) : null}
              <Pager page={page} pageSize={PAGE} total={boxes.length} onChange={setPage} />
            </div>
          ) : null}
          {stackSlot ? (
            <div className="studio-slot" onClick={() => selectSlot("stack")}>
              <div className="studio-slot-h">
                <strong>牌</strong>
                <span>必填 · 卡牌集</span>
              </div>
              {filledStack ? (
                <div className="row">
                  <span>{project.sets.find((s) => s.id === filledStack.refId)?.name ?? filledStack.refId}</span>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      patchStudio((s) => setStudioActor(s, "stack", null));
                    }}
                  >
                    清除
                  </button>
                </div>
              ) : (
                <p className="muted">点下面的卡牌集填入。</p>
              )}
              <div className="shot-rail-grid">
                {project.sets.slice((page - 1) * PAGE, page * PAGE).map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    className={`shot-rail-item ${filledStack?.refId === set.id ? "active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectSlot("stack");
                      patchStudio((s) => setStudioActor(s, "stack", set.id));
                    }}
                  >
                    <div className="shot-thumb-ph" />
                    <span>{set.name}</span>
                  </button>
                ))}
              </div>
              <Pager page={page} pageSize={PAGE} total={project.sets.length} onChange={setPage} />
            </div>
          ) : null}

          <h3 className="shot-create-title">布景</h3>
          <div className="row">
            {(["none", "color", "shot"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`btn btn-small ${(studio.backdrop?.kind ?? "none") === k ? "btn-primary" : ""}`}
                onClick={() => patchStudio((s) => ({ ...s, backdrop: { ...s.backdrop, kind: k } }))}
              >
                {k === "none" ? "无" : k === "color" ? "纯色" : "产品场景"}
              </button>
            ))}
          </div>
          {studio.backdrop?.kind === "color" ? (
            <ColorField
              label="布景色"
              value={studio.backdrop.color ?? "#1c1c22"}
              fallback="#1c1c22"
              onChange={(c) => patchStudio((s) => ({ ...s, backdrop: { kind: "color", color: c } }), "studio-bg")}
            />
          ) : null}
          {studio.backdrop?.kind === "shot" ? (
            <>
              {backdropLost ? <p className="muted">场景丢失。演员仍可预览。</p> : null}
              <div className="shot-rail-grid">
                {(project.shots ?? []).map((shot) => (
                  <button
                    key={shot.id}
                    type="button"
                    className={`shot-rail-item ${studio.backdrop?.shotId === shot.id ? "active" : ""}`}
                    onClick={() => patchStudio((s) => applyStudioBackdropShot(s, shot.id, project))}
                  >
                    <div className="shot-thumb-ph" />
                    <span>{shot.name}</span>
                  </button>
                ))}
              </div>
              {(project.shots ?? []).length === 0 ? <p className="muted">还没有产品场景。去产品渲染摆一棚再引用。</p> : null}
            </>
          ) : null}
        </aside>
        <SplitHandle onDelta={(dx) => setLeftW(Math.min(480, Math.max(200, leftW + dx)))} />
        <div className="studio-stage">
          <ShotViewport
            items={scene.items}
            selectedId={null}
            onSelect={() => undefined}
            onMove={() => undefined}
            onTransform={() => undefined}
            onOrbit={(yaw, pitch, distance, target) =>
              patchStudio((s) => {
                if (studioLookThroughOf(s) === "render") {
                  return {
                    ...s,
                    render: { ...s.render, camera: { ...s.render.camera, yaw, pitch, distance, ...(target ? { target } : {}) } },
                  };
                }
                const prev = studioViewCameraOf(s);
                return {
                  ...s,
                  viewCamera: { ...prev, yaw, pitch, distance, ...(target ? { target } : {}) },
                };
              }, "studio-orbit")
            }
            render={scene.viewSetup}
            cameras={[scene.renderCam]}
            lookThroughId={lookThrough === "render" ? scene.renderCam.id : "studio-view"}
            lookThroughName={lookThrough === "render" ? "渲染机" : "操作机"}
            pathPoints={scene.path.map((p) => ({ x: p[0], y: p[1], z: p[2] }))}
            project={project}
            projectDir={currentPath}
            gizmos
            lockOnLoad={time < 0.02 && !playing}
          />
          <div className="studio-playbar">
            <button type="button" className="btn btn-small" onClick={() => setPlaying((v) => !v)}>
              {playing ? "停" : "播"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0.01, duration)}
              step={0.01}
              value={Math.min(time, duration)}
              onChange={(e) => {
                setPlaying(false);
                setTime(Number(e.target.value));
              }}
            />
            <span>
              {time.toFixed(2)} / {duration.toFixed(2)}s
            </span>
          </div>
        </div>
        <SplitHandle onDelta={(dx) => setRightW(Math.min(440, Math.max(220, rightW - dx)))} />
        <aside className="box-side">
          <div className="shot-icon-tabs">
            {(
              [
                { id: "scene" as const, label: "场景", Icon: IconGrid },
                { id: "light" as const, label: "灯光", Icon: IconLight },
                { id: "camera" as const, label: "摄影机", Icon: IconCamera },
                { id: "template" as const, label: "模版", Icon: IconLayout },
                ...(selectedSlot ? [{ id: "actor" as const, label: "演员", Icon: IconObject }] : []),
              ] as const
            ).map(({ id, label, Icon }) => (
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
            {rightTab === "scene" ? "场景" : rightTab === "light" ? "灯光" : rightTab === "camera" ? "摄影机" : rightTab === "template" ? "模版" : "演员"}
          </p>
          <div className="form">
            {rightTab === "scene" ? (
              <>
                <div className="field">
                  <label>影棚名称</label>
                  <input value={studio.name} onChange={(e) => patchStudio((s) => ({ ...s, name: e.target.value }))} />
                </div>
                {missing ? <p className="muted">{missing}。填好才能渲染镜头。</p> : null}
                <ColorField
                  label="背景色"
                  value={studio.render.background ?? "#1c1c22"}
                  fallback="#1c1c22"
                  onChange={(c) => !studio.render.cullBackground && patchStudio((s) => ({ ...s, render: { ...s.render, background: c } }), "studio-bg")}
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!studio.render.cullBackground}
                    onChange={(e) => patchStudio((s) => ({ ...s, render: { ...s.render, cullBackground: e.target.checked } }))}
                  />
                  剔除背景
                </label>
                <ResolutionField
                  width={studio.render.resolutionW}
                  height={studio.render.resolutionH}
                  onChange={(rw, rh) => patchStudio((s) => ({ ...s, render: { ...s.render, resolutionW: rw, resolutionH: rh } }))}
                />
                <div className="field">
                  <label>出图贴图</label>
                  <div className="row">
                    <button
                      type="button"
                      className={`btn btn-small ${exportTextureOf(studio.render.exportTexture) === "standard" ? "btn-primary" : ""}`}
                      onClick={() => patchStudio((s) => ({ ...s, render: { ...s.render, exportTexture: "standard" } }))}
                    >
                      标准
                    </button>
                    <button
                      type="button"
                      className={`btn btn-small ${exportTextureOf(studio.render.exportTexture) === "max" ? "btn-primary" : ""}`}
                      onClick={() => patchStudio((s) => ({ ...s, render: { ...s.render, exportTexture: "max" } }))}
                    >
                      最高
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>帧率</label>
                  <div className="row">
                    {[24, 25, 30].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`btn btn-small ${studioFpsOf(studio) === n ? "btn-primary" : ""}`}
                        onClick={() => patchStudio((s) => ({ ...s, fps: n }))}
                      >
                        {n}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={studio.fps ?? 24}
                      onChange={(e) => patchStudio((s) => ({ ...s, fps: Number(e.target.value) || 24 }), "studio-fps")}
                      style={{ width: 64 }}
                    />
                  </div>
                </div>
                <button type="button" className="btn btn-primary" disabled={!!seq || !canRender || !desktop || !bound} onClick={() => void doSequence()}>
                  渲染镜头
                </button>
                <button type="button" className="btn" disabled={!!exporting || !scene.items.some((it) => it.refId)} onClick={() => void doExportModel()}>
                  导出模型
                </button>
                {!desktop ? <p className="muted">序列只能在 TMD 窗口里渲，请不要用系统浏览器。</p> : null}
                {desktop && !bound ? <p className="muted">未绑定工程时模型会下载 zip。</p> : null}
                <button type="button" className="btn" onClick={() => void openSequenceFolder(currentPath).then(setInfo)}>
                  打开序列帧文件夹
                </button>
                <button type="button" className="btn" onClick={() => void openExportModelFolder(currentPath).then(setInfo)}>
                  打开导出模型文件夹
                </button>
              </>
            ) : null}
            {rightTab === "light" ? (
              <>
                <div className="field">
                  <label>主光强度 {studio.render.lights.key.intensity.toFixed(2)}</label>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.05}
                    value={studio.render.lights.key.intensity}
                    onChange={(e) =>
                      patchStudio(
                        (s) => ({
                          ...s,
                          render: { ...s.render, lights: { ...s.render.lights, key: { ...s.render.lights.key, intensity: Number(e.target.value) } } },
                        }),
                        "studio-light",
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
                      value={studio.render.lights.key.yaw}
                      onChange={(e) =>
                        patchStudio(
                          (s) => ({
                            ...s,
                            render: { ...s.render, lights: { ...s.render.lights, key: { ...s.render.lights.key, yaw: Number(e.target.value) } } },
                          }),
                          "studio-light",
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
                      value={studio.render.lights.key.pitch}
                      onChange={(e) =>
                        patchStudio(
                          (s) => ({
                            ...s,
                            render: { ...s.render, lights: { ...s.render.lights, key: { ...s.render.lights.key, pitch: Number(e.target.value) } } },
                          }),
                          "studio-light",
                        )
                      }
                    />
                  </div>
                </div>
                <ColorField
                  label="主光颜色"
                  value={studio.render.lights.key.color}
                  fallback="#ffffff"
                  onChange={(c) =>
                    patchStudio((s) => ({ ...s, render: { ...s.render, lights: { ...s.render.lights, key: { ...s.render.lights.key, color: c } } } }), "studio-light")
                  }
                />
                <div className="field">
                  <label>补光 {(studio.render.lights.fillIntensity ?? 0.25).toFixed(2)}</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={studio.render.lights.fillIntensity ?? 0.25}
                    onChange={(e) =>
                      patchStudio((s) => ({ ...s, render: { ...s.render, lights: { ...s.render.lights, fillIntensity: Number(e.target.value) } } }), "studio-light")
                    }
                  />
                </div>
                <div className="field">
                  <label>环境光 {(studio.render.lights.ambient ?? 0.3).toFixed(2)}</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={studio.render.lights.ambient ?? 0.3}
                    onChange={(e) =>
                      patchStudio((s) => ({ ...s, render: { ...s.render, lights: { ...s.render.lights, ambient: Number(e.target.value) } } }), "studio-light")
                    }
                  />
                </div>
                {studio.templateId === "unbox-turntable" || studio.templateId === "box-turntable" ? (
                  <label className="check">
                    <input type="checkbox" checked={!!params.lightsFollowTurn} onChange={(e) => patchParams({ lightsFollowTurn: e.target.checked }, false)} />
                    主光跟随转台
                  </label>
                ) : null}
              </>
            ) : null}
            {rightTab === "camera" ? (
              <>
                <div className="field">
                  <label>当前看穿：{lookThrough === "render" ? "渲染机" : "操作机"}</label>
                  <div className="row">
                    <button type="button" className={`btn btn-small ${lookThrough === "view" ? "btn-primary" : ""}`} onClick={() => patchStudio((s) => ({ ...s, lookThrough: "view" }))}>
                      贴合操作机
                    </button>
                    <button
                      type="button"
                      className={`btn btn-small ${lookThrough === "render" ? "btn-primary" : ""}`}
                      onClick={() => patchStudio((s) => ({ ...s, lookThrough: "render" }))}
                    >
                      贴合渲染机
                    </button>
                  </div>
                </div>
                <p className="muted">
                  另一台：{lookThrough === "render" ? "操作机" : "渲染机"} yaw {otherCam.yaw.toFixed(0)} pitch {otherCam.pitch.toFixed(0)} FOV {otherCam.fov}
                </p>
                <div className="row">
                  <button
                    type="button"
                    className={`btn btn-small ${lookProj !== "isometric" ? "btn-primary" : ""}`}
                    onClick={() =>
                      patchStudio((s) =>
                        studioLookThroughOf(s) === "render"
                          ? { ...s, render: { ...s.render, projection: "perspective" } }
                          : { ...s, viewCamera: { ...studioViewCameraOf(s), projection: "perspective" } },
                      )
                    }
                  >
                    透视
                  </button>
                  <button
                    type="button"
                    className={`btn btn-small ${lookProj === "isometric" ? "btn-primary" : ""}`}
                    onClick={() =>
                      patchStudio((s) =>
                        studioLookThroughOf(s) === "render"
                          ? { ...s, render: { ...s.render, projection: "isometric" } }
                          : { ...s, viewCamera: { ...studioViewCameraOf(s), projection: "isometric" } },
                      )
                    }
                  >
                    等距
                  </button>
                </div>
                {lookProj !== "isometric" ? (
                  <div className="field">
                    <label>焦距 FOV</label>
                    <input
                      type="number"
                      value={lookFov}
                      onChange={(e) => {
                        const fov = Number(e.target.value);
                        patchStudio(
                          (s) =>
                            studioLookThroughOf(s) === "render"
                              ? { ...s, render: { ...s.render, camera: { ...s.render.camera, fov } } }
                              : { ...s, viewCamera: { ...studioViewCameraOf(s), fov } },
                          "studio-fov",
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
                        className={`btn btn-small ${Math.round(lookPitch) === pitch ? "btn-primary" : ""}`}
                        onClick={() =>
                          patchStudio((s) =>
                            studioLookThroughOf(s) === "render"
                              ? { ...s, render: { ...s.render, camera: { ...s.render.camera, yaw: 38, pitch } } }
                              : { ...s, viewCamera: { ...studioViewCameraOf(s), yaw: 38, pitch } },
                          )
                        }
                      >
                        斜 {pitch}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
            {rightTab === "template" ? (
              <>
                <div className="field">
                  <label>模版</label>
                  <select
                    value={studio.templateId}
                    onChange={(e) => {
                      setTime(0);
                      setSelectedSlot(null);
                      setRightTab("template");
                      patchStudio((s) => switchStudioTemplate(s, e.target.value as StudioTemplateId));
                    }}
                  >
                    {STUDIO_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                {studio.templateId === "unbox-turntable" ? (
                  <>
                    <SecField label="开盒秒数" value={params.unboxSeconds ?? 1.5} onCommit={(n, m) => patchParams({ unboxSeconds: n }, m)} />
                    <SecField label="转台秒数" value={params.turnSeconds ?? 4} onCommit={(n, m) => patchParams({ turnSeconds: n }, m)} />
                    <SecField label="圈数" value={params.turns ?? 1} onCommit={(n, m) => patchParams({ turns: n }, m)} />
                    <label className="check">
                      <input type="checkbox" checked={!!params.overlapUnboxTurn} onChange={(e) => patchParams({ overlapUnboxTurn: e.target.checked }, false)} />
                      边开边转
                    </label>
                  </>
                ) : null}
                {studio.templateId === "box-turntable" ? (
                  <>
                    <SecField label="转台秒数" value={params.turnSeconds ?? 4} onCommit={(n, m) => patchParams({ turnSeconds: n }, m)} />
                    <SecField label="圈数" value={params.turns ?? 1} onCommit={(n, m) => patchParams({ turns: n }, m)} />
                  </>
                ) : null}
                {studio.templateId === "card-spread" ? (
                  <SecField label="展开秒数" value={params.spreadSeconds ?? 2} onCommit={(n, m) => patchParams({ spreadSeconds: n }, m)} />
                ) : null}
                {studio.templateId === "card-batch" ? (
                  <>
                    <SecField label="每批张数" value={params.batchSize ?? 8} onCommit={(n, m) => patchParams({ batchSize: Math.max(1, Math.round(n)) }, m)} />
                    <SecField label="批间隔秒" value={params.batchGapSeconds ?? 0.8} onCommit={(n, m) => patchParams({ batchGapSeconds: n }, m)} />
                  </>
                ) : null}
              </>
            ) : null}
            {rightTab === "actor" && selectedSlot === "box" && filledBox
              ? (() => {
                  const box = (project.boxes ?? []).find((b) => b.id === filledBox.refId);
                  if (!box || boxModeOf(box) !== "lidBase") return <p className="muted">简单方盒没有开合。</p>;
                  const dummy = {
                    id: "studio-actor-box",
                    kind: "box" as const,
                    refId: filledBox.refId,
                    position: { x: 0, y: 0, z: 0 },
                    rotationDeg: { x: 0, y: 0, z: 0 },
                    lidOpen: filledBox.lidOpen,
                  };
                  const open = shotBoxLidOpen(dummy, box);
                  return (
                    <div className="field">
                      <label>{studio.templateId === "unbox-turntable" ? "开场开合" : "开合"}</label>
                      <div className="row">
                        <button type="button" className={`btn btn-small ${open < 0.05 ? "btn-primary" : ""}`} onClick={() => patchActor("box", { lidOpen: 0 }, "studio-lid")}>
                          合上
                        </button>
                        <button type="button" className={`btn btn-small ${open > 0.95 ? "btn-primary" : ""}`} onClick={() => patchActor("box", { lidOpen: 1 }, "studio-lid")}>
                          打开
                        </button>
                      </div>
                      <input type="range" min={0} max={1} step={0.01} value={open} onChange={(e) => patchActor("box", { lidOpen: Number(e.target.value) }, "studio-lid")} />
                    </div>
                  );
                })()
              : null}
            {rightTab === "actor" && selectedSlot === "stack" && filledStack ? (
              <>
                <div className="field">
                  <label>站姿</label>
                  <select
                    value={filledStack.face === "back" ? "back" : "front"}
                    onChange={(e) => patchActor("stack", { face: e.target.value === "back" ? "back" : "front" }, "studio-face")}
                  >
                    <option value="front">正面朝上</option>
                    <option value="back">背面朝上</option>
                  </select>
                </div>
                <StackLookPanel
                  item={{
                    id: "studio-actor-stack",
                    kind: "stack",
                    refId: filledStack.refId,
                    face: filledStack.face,
                    position: { x: 0, y: 0, z: 0 },
                    rotationDeg: { x: 0, y: 0, z: 0 },
                    stack: filledStack.stack,
                  }}
                  project={project}
                  onChange={(stack) => patchActor("stack", { stack }, "studio-stack")}
                />
              </>
            ) : null}
          </div>
        </aside>
      </div>
      <WorkLock
        open={!!seq}
        title="正在写序列帧"
        detail="可取消。已写的帧保留。"
        progress={seq ?? undefined}
        onCancel={() => {
          cancelRef.current = true;
        }}
      />
      <WorkLock open={exporting} title="正在导出模型" />
    </div>
  );
}
