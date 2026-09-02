import { useMemo, useState } from "react";
import { DEFAULT_PRINT } from "@/model/defaults";
import type { PaperId, PrintSettings } from "@/model/types";
import { PRINT_DPI } from "@/render/layout";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ColorField } from "@/ui/ColorField";
import { Pager } from "@/ui/Pager";
import { downloadBytes, exportCardPngs, exportPrintPdf } from "./exportPdf";
import { SheetCards } from "./SheetCards";
import { buildPrintJobs, flattenPrintPages, formatExportName } from "./layoutSheets";

export function PrintPage() {
  const { current, patchProject } = useAppStore();
  const { setId, setSetId } = useEditorStore();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [range, setRange] = useState<"all" | "page">("all");
  const [picked, setPicked] = useState<string[]>(() => (current?.sets ?? []).map((s) => s.id));
  const [previewScale, setPreviewScale] = useState(2.2);
  const settings: PrintSettings = { ...DEFAULT_PRINT, ...current?.print };
  const deck = current?.sets.find((s) => s.id === (setId ?? current.sets[0]?.id)) ?? current?.sets[0];

  const exportSets = useMemo(
    () => current?.sets.filter((s) => picked.includes(s.id)) ?? [],
    [current, picked],
  );
  const jobs = useMemo(() => {
    if (!current || !exportSets.length) return [];
    try {
      return buildPrintJobs(current, settings, exportSets.map((s) => s.id));
    } catch {
      return [];
    }
  }, [current, settings, exportSets]);
  const pages = useMemo(() => flattenPrintPages(jobs), [jobs]);
  const currentPage = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))] ?? pages[0];
  const plan = currentPage?.job.plan;
  const front = currentPage?.job.front;
  const back = currentPage?.job.back;

  if (!current || !deck || !front || !plan || !currentPage) {
    return <div className="page">项目缺少可打印内容</div>;
  }

  function patch<K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) {
    patchProject(
      (p) => ({ ...p, print: { ...DEFAULT_PRINT, ...p.print, [key]: value } }),
      { mergeKey: "print" },
    );
    if (key === "paper" || key === "orientation" || key === "customW" || key === "customH") {
      setPageIndex(0);
    }
  }

  const scale = previewScale;
  const page = currentPage.slots;
  const printTpl = showBack && back ? back : front;
  const sampleName = formatExportName(settings.filename, {
    project: current.meta.name,
    deck: currentPage.job.set.name,
    index: 1,
    face: "正面",
  });
  const totalFront = pages.length;

  return (
    <div className="print-grid print-layout">
      <aside className="print-settings">
        <h4>拼版</h4>
        <div className="form">
          <div className="field">
            <label>卡牌集</label>
            <div className="row" style={{ marginBottom: 6 }}>
              <button type="button" className="btn btn-small" onClick={() => setPicked(current.sets.map((s) => s.id))}>
                全选
              </button>
              <button type="button" className="btn btn-small" onClick={() => setPicked([])}>
                全不选
              </button>
            </div>
            {current.sets.map((s) => (
              <label key={s.id} className="row">
                <input
                  type="checkbox"
                  checked={picked.includes(s.id)}
                  onChange={(e) => {
                    setPicked((cur) => {
                      const next = e.target.checked ? [...cur, s.id] : cur.filter((id) => id !== s.id);
                      if (e.target.checked) setSetId(s.id);
                      setPageIndex(0);
                      return next;
                    });
                  }}
                />
                {s.name}（{s.cards.length}）
              </label>
            ))}
          </div>
          <div className="field">
            <label>导出模式</label>
            <select
              value={settings.mode ?? "print"}
              onChange={(e) => {
                patch("mode", e.target.value as "print" | "tts");
                setPageIndex(0);
              }}
            >
              <option value="print">打印拼版</option>
              <option value="tts">TTS 贴图 10×8</option>
            </select>
          </div>
          {(settings.mode ?? "print") === "tts" && (
            <div className="row">
              <div className="field grow">
                <label>列</label>
                <input type="number" min={1} max={16} value={settings.ttsCols ?? 10} onChange={(e) => patch("ttsCols", Number(e.target.value) || 10)} />
              </div>
              <div className="field grow">
                <label>行</label>
                <input type="number" min={1} max={16} value={settings.ttsRows ?? 8} onChange={(e) => patch("ttsRows", Number(e.target.value) || 8)} />
              </div>
            </div>
          )}
          <div className="field">
            <label>导出范围</label>
            <select value={range} onChange={(e) => setRange(e.target.value as "all" | "page")}>
              <option value="all">全部页</option>
              <option value="page">仅当前页</option>
            </select>
          </div>
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
          <div className="field">
            <label>导出 DPI</label>
            <input type="number" value={settings.dpi} onChange={(e) => patch("dpi", Number(e.target.value) || PRINT_DPI)} />
          </div>
          <label className="row">
            <input type="checkbox" checked={settings.cutMarks} onChange={(e) => patch("cutMarks", e.target.checked)} />
            切割线
          </label>
          <div className="row">
            <div className="field grow">
              <ColorField label="切割线颜色" value={settings.cutColor} onChange={(c) => patch("cutColor", c)} />
            </div>
            <div className="field grow">
              <label>线长 mm</label>
              <input type="number" value={settings.cutLengthMm} onChange={(e) => patch("cutLengthMm", Number(e.target.value))} />
            </div>
          </div>
          <label className="row">
            <input type="checkbox" checked={settings.duplex} onChange={(e) => patch("duplex", e.target.checked)} />
            双面（背面左右镜像）
          </label>
          <div className="field">
            <label>文件名</label>
            <input value={settings.filename} onChange={(e) => patch("filename", e.target.value)} />
            <span className="muted">{sampleName}</span>
          </div>
          <p className="muted">
            当前「{currentPage.job.set.name}」{plan.cols}×{plan.rows}，共 {totalFront} 页
            {settings.duplex ? `（含背面则 ×2）` : ""}。不同尺寸的卡牌集会分页导出。设置会写入 data/export.json。
          </p>
          {error && <div className="banner">{error}</div>}
          {progress && <p className="muted">{progress}</p>}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const bytes = await exportPrintPdf(
                  current,
                  settings,
                  setProgress,
                  exportSets.map((s) => s.id),
                  range === "page" ? [pageIndex] : "all",
                );
                downloadBytes(bytes, `${sampleName}.pdf`, "application/pdf");
              } catch (err) {
                setError(err instanceof Error ? err.message : "导出失败");
              } finally {
                setBusy(false);
                setProgress("");
              }
            }}
          >
            {busy ? "导出中…" : "导出 PDF"}
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await exportCardPngs(current, settings, setProgress, exportSets.map((s) => s.id));
              } catch (err) {
                setError(err instanceof Error ? err.message : "导出失败");
              } finally {
                setBusy(false);
                setProgress("");
              }
            }}
          >
            批量导出 PNG
          </button>
        </div>
      </aside>
      <div
        className="print-preview"
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          setPreviewScale((s) => Math.min(5, Math.max(0.8, s * (e.deltaY > 0 ? 0.9 : 1.1))));
        }}
      >
        <div className="toolbar" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <Pager
            page={pageIndex + 1}
            pageSize={1}
            total={totalFront}
            onChange={(p) => setPageIndex(p - 1)}
          />
          {settings.duplex && (
            <button className={`btn btn-small ${showBack ? "btn-primary" : ""}`} onClick={() => setShowBack((v) => !v)}>
              {showBack ? "看背面" : "看正面"}
            </button>
          )}
          {currentPage ? <span className="muted">{currentPage.job.set.name}</span> : null}
        </div>
        <div
          className="sheet"
          style={{
            width: plan.paper.w * scale,
            height: plan.paper.h * scale,
            position: "relative",
          }}
        >
          <SheetCards
            plan={plan}
            page={page}
            settings={settings}
            template={printTpl}
            project={current}
            scale={scale}
            mirror={showBack}
          />
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          预览当前页。滚轮缩放与右键拖拽在模板页。
        </p>
      </div>
    </div>
  );
}
