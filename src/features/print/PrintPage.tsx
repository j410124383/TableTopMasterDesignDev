import { useEffect, useMemo, useRef, useState } from "react";
import { mmToPx } from "@/lib/mm";
import { DEFAULT_PRINT } from "@/model/defaults";
import type { ExportMode, PaperId, PrintSettings, RasterFormat } from "@/model/types";
import { PRINT_DPI } from "@/render/layout";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ColorField } from "@/ui/ColorField";
import { Pager } from "@/ui/Pager";
import { SplitHandle, usePaneSize } from "@/ui/Splitter";
import { downloadBytes, exportPrintPdf, exportRasterPages } from "./exportPdf";
import { loadExportPresets, makeExportPreset, nextPresetName, saveExportPresets } from "./exportPresets";
import { renderExportPage } from "./exportRender";
import { buildPrintJobs, flattenExportPages, formatExportName } from "./layoutSheets";

const THUMB_DPI = 36;
const PREVIEW_Q = [
  { id: "std", label: "标准", dpi: 96 },
  { id: "hd", label: "高清", dpi: 144 },
  { id: "fine", label: "精细", dpi: 220 },
] as const;
const PREVIEW_Q_KEY = "tmd-print-preview-q";
const MAX_PREVIEW_EDGE = 8192;

function readPreviewQuality(): (typeof PREVIEW_Q)[number]["id"] {
  try {
    const v = localStorage.getItem(PREVIEW_Q_KEY);
    if (v === "std" || v === "hd" || v === "fine") return v;
  } catch {
    /* ignore */
  }
  return "hd";
}

function cappedPreviewDpi(paperW: number, paperH: number, dpi: number): number {
  const w = mmToPx(paperW, dpi);
  const h = mmToPx(paperH, dpi);
  const m = Math.max(w, h);
  if (m <= MAX_PREVIEW_EDGE) return dpi;
  return Math.max(36, dpi * (MAX_PREVIEW_EDGE / m));
}

function thumbBox(paper: { w: number; h: number }, railW: number): { w: number; h: number } {
  const w = Math.max(48, railW - 22);
  const ar = paper.w / Math.max(1, paper.h);
  return { w, h: Math.max(36, Math.round(w / ar)) };
}

function setQty(set: { cards: { qty: number }[] }): number {
  return set.cards.reduce((n, c) => n + (c.qty || 0), 0);
}

export function PrintPage() {
  const { current, patchProject } = useAppStore();
  const { setSetId } = useEditorStore();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [picked, setPicked] = useState<string[]>(() => (current?.sets ?? []).map((s) => s.id));
  const [pickedPages, setPickedPages] = useState<string[]>([]);
  const [zoomPct, setZoomPct] = useState(100);
  const [zoomDraft, setZoomDraft] = useState("100");
  const [previewQ, setPreviewQ] = useState<(typeof PREVIEW_Q)[number]["id"]>(readPreviewQuality);
  const [stageSize, setStageSize] = useState({ w: 640, h: 480 });
  const stageRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"sets" | "mode">("sets");
  const [leftW, setLeftW] = usePaneSize("print-left", 300);
  const [thumbW, setThumbW] = usePaneSize("print-thumbs", 148);
  const [presets, setPresets] = useState(loadExportPresets);
  const [presetId, setPresetId] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const settings: PrintSettings = useMemo(
    () => ({ ...DEFAULT_PRINT, ...current?.print }),
    [current?.print],
  );

  const exportSets = useMemo(
    () => current?.sets.filter((s) => picked.includes(s.id)) ?? [],
    [current, picked],
  );
  const jobs = useMemo(() => {
    if (!current || !exportSets.length) return [];
    try {
      return buildPrintJobs(
        current,
        settings,
        exportSets.map((s) => s.id),
      );
    } catch {
      return [];
    }
  }, [current, settings, exportSets]);
  const pages = useMemo(() => flattenExportPages(jobs, settings), [jobs, settings]);
  const pageIdsKey = `${settings.mode}|${pages.map((p) => p.id).join("|")}`;
  const visualKey = JSON.stringify({
    mode: settings.mode,
    paper: settings.paper,
    orientation: settings.orientation,
    customW: settings.customW,
    customH: settings.customH,
    marginMm: settings.marginMm,
    gapMm: settings.gapMm,
    bleedMm: settings.bleedMm,
    cutMarks: settings.cutMarks,
    cutColor: settings.cutColor,
    cutLengthMm: settings.cutLengthMm,
    offsetX: settings.offsetX,
    offsetY: settings.offsetY,
    duplex: settings.duplex,
    ttsCols: settings.ttsCols,
    ttsRows: settings.ttsRows,
    roundCorners: settings.roundCorners,
    includeBleed: settings.includeBleed,
    cardStroke: settings.cardStroke,
    cardStrokeColor: settings.cardStrokeColor,
    cardStrokeMm: settings.cardStrokeMm,
    parallelStroke: settings.parallelStroke,
    parallelStrokeColor: settings.parallelStrokeColor,
    parallelStrokeMm: settings.parallelStrokeMm,
    parallelStrokeInsetMm: settings.parallelStrokeInsetMm,
    watermark: settings.watermark,
    watermarkText: settings.watermarkText,
    watermarkOpacity: settings.watermarkOpacity,
    watermarkType: settings.watermarkType,
  });

  useEffect(() => {
    const ids = pageIdsKey.split("|").slice(1).filter(Boolean);
    setPickedPages(ids);
    setPageIndex(0);
    setZoomPct(100);
    setZoomDraft("100");
  }, [pageIdsKey]);

  const currentPage = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))] ?? pages[0];
  const plan = currentPage?.job.plan;
  const mode = settings.mode ?? "print";
  const isPrint = mode === "print";
  const isTts = mode === "tts";
  const formats = settings.formats ?? [];
  const hasFormat = formats.includes("png") || formats.includes("jpg");
  const canExport = !!current && exportSets.length > 0 && pickedPages.length > 0;
  const canRaster = canExport && hasFormat;
  const qDpi = PREVIEW_Q.find((q) => q.id === previewQ)?.dpi ?? 144;
  const fitScale = plan
    ? Math.max(0.08, Math.min(stageSize.w / plan.paper.w, stageSize.h / plan.paper.h))
    : 1;
  const viewScale = fitScale * (zoomPct / 100);
  const sheetW = plan ? plan.paper.w * viewScale : 0;
  const sheetH = plan ? plan.paper.h * viewScale : 0;
  const fitted = zoomPct === 100;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 40 || h < 40) return;
      setStageSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!current]);

  useEffect(() => {
    if (!current || !currentPage || !plan) {
      setPreviewUrl("");
      return;
    }
    let cancelled = false;
    let created = "";
    const dpi = cappedPreviewDpi(plan.paper.w, plan.paper.h, qDpi);
    void renderExportPage(currentPage, current, settings, dpi).then((canvas) => {
      if (cancelled) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setPreviewUrl(url);
      }, "image/png");
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [current, currentPage?.id, visualKey, qDpi, plan?.paper.w, plan?.paper.h]);

  useEffect(() => {
    if (!current || !pages.length) {
      setThumbUrls({});
      return;
    }
    let cancelled = false;
    const next: Record<string, string> = {};
    void (async () => {
      for (const page of pages) {
        if (cancelled) return;
        const canvas = await renderExportPage(page, current, settings, THUMB_DPI);
        if (cancelled) return;
        next[page.id] = canvas.toDataURL("image/png");
        setThumbUrls({ ...next });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current, pageIdsKey, visualKey]);

  function clampZoom(n: number) {
    if (!Number.isFinite(n)) return 100;
    return Math.round(Math.min(800, Math.max(5, n)));
  }

  function applyZoom(n: number) {
    const z = clampZoom(n);
    setZoomPct(z);
    setZoomDraft(String(z));
  }

  function fitPreview() {
    applyZoom(100);
    const el = stageRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w >= 40 && h >= 40) setStageSize({ w, h });
    });
  }

  function bumpZoom(factor: number) {
    applyZoom(zoomPct * factor);
  }

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      applyZoom(zoomPct * (e.deltaY > 0 ? 0.9 : 1.1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [current, zoomPct]);

  if (!current) {
    return <div className="page">项目缺少可打印内容</div>;
  }
  const project = current;

  function patch<K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) {
    patchProject(
      (p) => ({ ...p, print: { ...DEFAULT_PRINT, ...p.print, [key]: value } }),
      { mergeKey: "print" },
    );
    if (key === "paper" || key === "orientation" || key === "customW" || key === "customH" || key === "mode") {
      setPageIndex(0);
      applyZoom(100);
    }
  }

  function toggleFormat(fmt: RasterFormat) {
    const cur = settings.formats ?? [];
    const next = cur.includes(fmt) ? cur.filter((f) => f !== fmt) : [...cur, fmt];
    patch("formats", next);
  }

  function applyPreset(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    patchProject((p) => ({ ...p, print: { ...DEFAULT_PRINT, ...preset.settings } }), { mergeKey: "print" });
    setPresetId(id);
    setPageIndex(0);
  }

  function persistPresets(list: typeof presets) {
    setPresets(list);
    saveExportPresets(list);
  }

  function saveAsPreset() {
    const name = window.prompt("预设名称", nextPresetName(presets));
    if (name == null) return;
    const created = makeExportPreset(name, settings);
    persistPresets([...presets, created]);
    setPresetId(created.id);
  }

  function storePreset() {
    if (!presetId) {
      saveAsPreset();
      return;
    }
    if (!window.confirm("覆盖当前预设？")) return;
    persistPresets(
      presets.map((p) =>
        p.id === presetId ? { ...p, settings: { ...DEFAULT_PRINT, ...settings }, updatedAt: new Date().toISOString() } : p,
      ),
    );
  }

  function deletePreset() {
    if (!presetId) return;
    persistPresets(presets.filter((p) => p.id !== presetId));
    setPresetId("");
  }

  const sampleName = formatExportName(settings.filename, {
    project: project.meta.name,
    deck: currentPage?.job.set.name ?? "卡牌集",
    index: 1,
    face: "正面",
  });
  const totalPages = pages.length;
  const selectedCount = pickedPages.length;

  async function runExport(kind: "raster" | "pdf") {
    setBusy(true);
    setError(null);
    try {
      if (kind === "pdf") {
        const bytes = await exportPrintPdf(
          project,
          settings,
          setProgress,
          exportSets.map((s) => s.id),
          pickedPages,
        );
        downloadBytes(bytes, `${sampleName}.pdf`, "application/pdf");
      } else {
        await exportRasterPages(project, settings, setProgress, exportSets.map((s) => s.id), pickedPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <div
      className="print-layout print-split"
      style={{ gridTemplateColumns: `${leftW}px 6px minmax(0, 1fr) 6px ${thumbW}px` }}
    >
      <aside className="print-settings">
        <div className="shot-rail-tabs">
          <button type="button" className={`tab ${tab === "sets" ? "active" : ""}`} onClick={() => setTab("sets")}>
            卡牌集
          </button>
          <button type="button" className={`tab ${tab === "mode" ? "active" : ""}`} onClick={() => setTab("mode")}>
            导出模式
          </button>
        </div>

        {tab === "sets" && (
          <div className="form">
            <div className="row" style={{ marginBottom: 6 }}>
              <button type="button" className="btn btn-small" onClick={() => setPicked(current.sets.map((s) => s.id))}>
                全选
              </button>
              <button type="button" className="btn btn-small" onClick={() => setPicked([])}>
                全不选
              </button>
            </div>
            <div className="print-sets-wrap">
              <table className="data print-sets-table">
                <thead>
                  <tr>
                    <th>选择</th>
                    <th>卡图集</th>
                    <th>数量</th>
                    <th>蓝图</th>
                  </tr>
                </thead>
                <tbody>
                  {current.sets.map((s) => {
                    const bp = current.blueprints.find((b) => b.id === s.blueprintId);
                    return (
                      <tr key={s.id} className={picked.includes(s.id) ? "selected" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={picked.includes(s.id)}
                            onChange={(e) => {
                              setPicked((cur) => {
                                const next = e.target.checked ? [...cur, s.id] : cur.filter((id) => id !== s.id);
                                if (e.target.checked) setSetId(s.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td>{s.name}</td>
                        <td>{setQty(s)}</td>
                        <td>{bp?.name ?? "（无蓝图）"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!exportSets.length && <p className="muted">请勾选卡牌集</p>}
          </div>
        )}

        {tab === "mode" && (
          <div className="form">
            <div className="field">
              <label>参数预设</label>
              <select value={presetId} onChange={(e) => (e.target.value ? applyPreset(e.target.value) : setPresetId(""))}>
                <option value="">未选择预设</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-small" onClick={() => presetId && applyPreset(presetId)} disabled={!presetId}>
                  读取
                </button>
                <button type="button" className="btn btn-small" onClick={storePreset}>
                  存储
                </button>
                <button type="button" className="btn btn-small" onClick={saveAsPreset}>
                  另存为
                </button>
                <button type="button" className="btn btn-small" onClick={deletePreset} disabled={!presetId}>
                  删除
                </button>
              </div>
            </div>

            <div className="field">
              <label>导出模式</label>
              <select
                value={mode}
                onChange={(e) => patch("mode", e.target.value as ExportMode)}
              >
                <option value="print">打印拼版</option>
                <option value="tts">TTS 贴图</option>
                <option value="single">单图导出</option>
              </select>
            </div>

            {isTts && (
              <div className="row">
                <div className="field grow">
                  <label>列</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={settings.ttsCols ?? 10}
                    onChange={(e) => patch("ttsCols", Number(e.target.value) || 10)}
                  />
                </div>
                <div className="field grow">
                  <label>行</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={settings.ttsRows ?? 8}
                    onChange={(e) => patch("ttsRows", Number(e.target.value) || 8)}
                  />
                </div>
              </div>
            )}

            {isPrint && (
              <>
                <div className="field">
                  <label>纸张</label>
                  <select value={settings.paper} onChange={(e) => patch("paper", e.target.value as PaperId)}>
                    <option value="a4">A4</option>
                    <option value="letter">Letter</option>
                    <option value="legal">Legal</option>
                    <option value="tabloid">Tabloid</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                <div className="field">
                  <label>方向</label>
                  <select
                    value={settings.orientation}
                    onChange={(e) => patch("orientation", e.target.value as "portrait" | "landscape")}
                  >
                    <option value="portrait">纵向</option>
                    <option value="landscape">横向</option>
                  </select>
                </div>
                {settings.paper === "custom" && (
                  <div className="row">
                    <div className="field grow">
                      <label>宽 mm</label>
                      <input type="number" value={settings.customW} onChange={(e) => patch("customW", Number(e.target.value))} />
                    </div>
                    <div className="field grow">
                      <label>高 mm</label>
                      <input type="number" value={settings.customH} onChange={(e) => patch("customH", Number(e.target.value))} />
                    </div>
                  </div>
                )}
                <div className="field">
                  <label>边距 mm</label>
                  <input type="number" value={settings.marginMm} onChange={(e) => patch("marginMm", Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>卡间距 mm</label>
                  <input type="number" value={settings.gapMm} onChange={(e) => patch("gapMm", Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>出血 mm</label>
                  <input type="number" value={settings.bleedMm} onChange={(e) => patch("bleedMm", Number(e.target.value))} />
                </div>
                <div className="row">
                  <div className="field grow">
                    <label>偏移 X</label>
                    <input type="number" value={settings.offsetX} onChange={(e) => patch("offsetX", Number(e.target.value))} />
                  </div>
                  <div className="field grow">
                    <label>偏移 Y</label>
                    <input type="number" value={settings.offsetY} onChange={(e) => patch("offsetY", Number(e.target.value))} />
                  </div>
                </div>
              </>
            )}

            <div className="field">
              <label>导出 DPI</label>
              <input type="number" value={settings.dpi} onChange={(e) => patch("dpi", Number(e.target.value) || PRINT_DPI)} />
            </div>

            <fieldset className="print-fieldset">
              <legend>导出格式</legend>
              <label className="row">
                <input type="checkbox" checked={formats.includes("png")} onChange={() => toggleFormat("png")} />
                PNG
              </label>
              <label className="row">
                <input type="checkbox" checked={formats.includes("jpg")} onChange={() => toggleFormat("jpg")} />
                JPG
              </label>
              {formats.includes("jpg") && (
                <div className="field">
                  <label>JPG 质量</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={settings.jpgQuality ?? 90}
                    onChange={(e) => patch("jpgQuality", Math.min(100, Math.max(1, Number(e.target.value) || 90)))}
                  />
                </div>
              )}
              {!hasFormat && <p className="muted">请至少勾选一种格式</p>}
            </fieldset>

            <fieldset className="print-fieldset">
              <legend>导出效果</legend>
              <label className="row">
                <input type="checkbox" checked={!!settings.roundCorners} onChange={(e) => patch("roundCorners", e.target.checked)} />
                圆角
              </label>
              <label className="row">
                <input type="checkbox" checked={!!settings.includeBleed} onChange={(e) => patch("includeBleed", e.target.checked)} />
                出血
              </label>
              <label className="row">
                <input type="checkbox" checked={!!settings.cardStroke} onChange={(e) => patch("cardStroke", e.target.checked)} />
                描边
              </label>
              {settings.cardStroke && (
                <div className="row">
                  <div className="field grow">
                    <ColorField label="描边颜色" value={settings.cardStrokeColor} onChange={(c) => patch("cardStrokeColor", c)} />
                  </div>
                  <div className="field grow">
                    <label>粗细 mm</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={settings.cardStrokeMm}
                      onChange={(e) => patch("cardStrokeMm", Number(e.target.value))}
                    />
                  </div>
                </div>
              )}
              <label className="row">
                <input type="checkbox" checked={!!settings.parallelStroke} onChange={(e) => patch("parallelStroke", e.target.checked)} />
                并列描边
              </label>
              {settings.parallelStroke && (
                <>
                  <div className="row">
                    <div className="field grow">
                      <ColorField
                        label="并列颜色"
                        value={settings.parallelStrokeColor}
                        onChange={(c) => patch("parallelStrokeColor", c)}
                      />
                    </div>
                    <div className="field grow">
                      <label>线宽 mm</label>
                      <input
                        type="number"
                        min={0}
                        step={0.05}
                        value={settings.parallelStrokeMm}
                        onChange={(e) => patch("parallelStrokeMm", Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>内缩 mm</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={settings.parallelStrokeInsetMm}
                      onChange={(e) => patch("parallelStrokeInsetMm", Number(e.target.value))}
                    />
                  </div>
                </>
              )}
              <label className="row">
                <input type="checkbox" checked={!!settings.watermark} onChange={(e) => patch("watermark", e.target.checked)} />
                水印
              </label>
              {settings.watermark && (
                <>
                  <div className="field">
                    <label>水印文字</label>
                    <input
                      value={settings.watermarkText}
                      placeholder={current.meta.name}
                      onChange={(e) => patch("watermarkText", e.target.value)}
                    />
                  </div>
                  <div className="row">
                    <label className="row grow">
                      <input
                        type="radio"
                        name="watermark-type"
                        checked={(settings.watermarkType ?? "single") === "single"}
                        onChange={() => patch("watermarkType", "single")}
                      />
                      单一
                    </label>
                    <label className="row grow">
                      <input
                        type="radio"
                        name="watermark-type"
                        checked={settings.watermarkType === "tile"}
                        onChange={() => patch("watermarkType", "tile")}
                      />
                      平铺
                    </label>
                  </div>
                  <div className="field">
                    <label>不透明度 %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settings.watermarkOpacity ?? 30}
                      onChange={(e) => patch("watermarkOpacity", Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    />
                  </div>
                </>
              )}
            </fieldset>

            {isPrint && (
              <>
                <label className="row">
                  <input type="checkbox" checked={settings.cutMarks} onChange={(e) => patch("cutMarks", e.target.checked)} />
                  切割线
                </label>
                {settings.cutMarks && (
                  <div className="row">
                    <div className="field grow">
                      <ColorField label="切割线颜色" value={settings.cutColor} onChange={(c) => patch("cutColor", c)} />
                    </div>
                    <div className="field grow">
                      <label>线长 mm</label>
                      <input type="number" value={settings.cutLengthMm} onChange={(e) => patch("cutLengthMm", Number(e.target.value))} />
                    </div>
                  </div>
                )}
              </>
            )}

            <label className="row">
              <input type="checkbox" checked={settings.duplex} onChange={(e) => patch("duplex", e.target.checked)} />
              双面{mode === "single" ? "（正、背各一张）" : "（背面左右镜像）"}
            </label>

            <div className="field">
              <label>文件名</label>
              <input value={settings.filename} onChange={(e) => patch("filename", e.target.value)} />
              <span className="muted">{sampleName}</span>
            </div>

            <p className="muted">
              {currentPage ? `「${currentPage.job.set.name}」` : ""}
              {plan ? `${plan.cols}×${plan.rows}` : ""}，已勾选 {selectedCount}/{totalPages}
              {settings.duplex ? "，含背面" : ""}。
            </p>
            {error && <div className="banner">{error}</div>}
            {progress && <p className="muted">{progress}</p>}
            <button className="btn btn-primary" disabled={busy || !canRaster} onClick={() => void runExport("raster")}>
              {busy ? "导出中…" : "导出"}
            </button>
            {isPrint && (
              <button className="btn" disabled={busy || !canExport} onClick={() => void runExport("pdf")}>
                导出 PDF
              </button>
            )}
          </div>
        )}
      </aside>

      <SplitHandle onDelta={(dx) => setLeftW(Math.min(480, Math.max(200, leftW + dx)))} />

      <div className="print-preview">
        <div className="toolbar print-preview-toolbar">
          <Pager page={pageIndex + 1} pageSize={1} total={totalPages} onChange={(p) => setPageIndex(p - 1)} />
          {settings.duplex && currentPage && (
            <button
              type="button"
              className={`btn btn-small ${currentPage.face === "back" ? "btn-primary" : ""}`}
              onClick={() => {
                const sibling = pages.find(
                  (p) => p.job.set.id === currentPage.job.set.id && p.local === currentPage.local && p.face !== currentPage.face,
                );
                if (sibling) setPageIndex(pages.indexOf(sibling));
              }}
            >
              {currentPage.face === "back" ? "看背面" : "看正面"}
            </button>
          )}
          {currentPage ? <span className="muted">{currentPage.job.set.name}</span> : null}
          {plan && (
            <span className="muted">
              {plan.paper.w.toFixed(1)}×{plan.paper.h.toFixed(1)} mm
              {" · "}
              {Math.round(mmToPx(plan.paper.w, settings.dpi))}×{Math.round(mmToPx(plan.paper.h, settings.dpi))} px @{settings.dpi}dpi
            </span>
          )}
          <span className="muted">
            已勾选 {selectedCount}/{totalPages}
          </span>
          <span className="print-zoom-tools">
            <button type="button" className="btn btn-small" onClick={() => bumpZoom(1 / 1.2)}>
              −
            </button>
            <button type="button" className="btn btn-small" onClick={fitPreview}>
              适应
            </button>
            <button type="button" className="btn btn-small" onClick={() => bumpZoom(1.2)}>
              +
            </button>
            <label className="print-q-field">
              缩放
              <input
                type="number"
                min={5}
                max={800}
                value={zoomDraft}
                onChange={(e) => setZoomDraft(e.target.value)}
                onBlur={() => applyZoom(Number(zoomDraft))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                    applyZoom(Number(zoomDraft));
                  }
                }}
              />
              %
            </label>
          </span>
          <label className="print-q-field">
            清晰度
            <select
              value={previewQ}
              onChange={(e) => {
                const id = e.target.value as (typeof PREVIEW_Q)[number]["id"];
                setPreviewQ(id);
                try {
                  localStorage.setItem(PREVIEW_Q_KEY, id);
                } catch {
                  /* ignore */
                }
              }}
            >
              {PREVIEW_Q.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          ref={stageRef}
          className="print-preview-stage print-check"
        >
          {currentPage && plan && previewUrl ? (
            fitted ? (
              <img className="print-sheet print-sheet-fit" src={previewUrl} alt="导出预览" draggable={false} />
            ) : (
              <div className="print-stage-inner" style={{ width: sheetW, height: sheetH }}>
                <div
                  className="print-sheet"
                  style={{
                    width: sheetW,
                    height: sheetH,
                  }}
                >
                  <img src={previewUrl} alt="导出预览" draggable={false} />
                </div>
              </div>
            )
          ) : (
            <p className="muted" style={{ padding: 16 }}>{exportSets.length ? "没有可预览的页" : "请勾选卡牌集"}</p>
          )}
        </div>
      </div>

      <SplitHandle onDelta={(dx) => setThumbW(Math.min(280, Math.max(108, thumbW - dx)))} />

      <aside className="print-thumbs-rail">
        <div className="print-thumbs-actions">
          <button type="button" className="btn btn-small" onClick={() => setPickedPages(pages.map((p) => p.id))} disabled={!pages.length}>
            全选
          </button>
          <button type="button" className="btn btn-small" onClick={() => setPickedPages([])} disabled={!pages.length}>
            全不选
          </button>
        </div>
        <div className="print-thumbs">
          {pages.map((page, i) => {
            const box = thumbBox(page.job.plan.paper, thumbW);
            return (
              <div
                key={page.id}
                className={`print-thumb ${i === pageIndex ? "active" : ""}`}
                onClick={() => setPageIndex(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPageIndex(i);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <input
                  type="checkbox"
                  className="print-thumb-check"
                  checked={pickedPages.includes(page.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    setPickedPages((cur) =>
                      e.target.checked ? [...cur, page.id] : cur.filter((id) => id !== page.id),
                    );
                  }}
                />
                <div className="print-thumb-frame print-check" style={{ width: box.w, height: box.h }}>
                  {thumbUrls[page.id] ? (
                    <img src={thumbUrls[page.id]} alt={`第 ${i + 1} 页`} />
                  ) : (
                    <div className="print-thumb-ph" />
                  )}
                </div>
                <span className="print-thumb-face">{page.face === "back" ? "背" : "正"}</span>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
