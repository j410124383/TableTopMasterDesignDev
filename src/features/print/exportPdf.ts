import { PDFDocument } from "pdf-lib";
import { mmToPt } from "@/lib/mm";
import { downloadBlob, zipFiles } from "@/lib/zip";
import type { PrintSettings, Project, RasterFormat } from "@/model/types";
import { canvasToBytes, flattenWhite, renderExportPage } from "./exportRender";
import {
  buildPrintJobs,
  flattenExportPages,
  formatExportName,
  type ExportPage,
} from "./layoutSheets";

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  downloadBlob(new Blob([bytes as BlobPart], { type: mime }), filename);
}

function pageFileName(project: Project, settings: PrintSettings, page: ExportPage): string {
  return formatExportName(settings.filename, {
    project: project.meta.name,
    deck: page.job.set.name,
    index: page.index,
    face: page.face === "back" ? "背面" : "正面",
  });
}

export async function exportPrintPdf(
  project: Project,
  settings: PrintSettings,
  onProgress?: (label: string) => void,
  setIds?: string[],
  pageIds?: string[] | "all",
): Promise<Uint8Array> {
  const jobs = buildPrintJobs(project, settings, setIds);
  let pages = flattenExportPages(jobs, settings);
  if (pageIds && pageIds !== "all") {
    const allow = new Set(pageIds);
    pages = pages.filter((p) => allow.has(p.id));
  }
  if (!pages.length) throw new Error("请勾选要导出的页");
  const pdf = await PDFDocument.create();
  const dpi = Math.max(72, settings.dpi || 300);
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.(`PDF ${i + 1}/${pages.length}`);
    const canvas = await renderExportPage(page, project, settings, dpi, { paper: "white" });
    const bytes = await canvasToBytes(canvas, "image/png");
    const image = await pdf.embedPng(bytes);
    const pageW = mmToPt(page.job.plan.paper.w);
    const pageH = mmToPt(page.job.plan.paper.h);
    const pdfPage = pdf.addPage([pageW, pageH]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  }
  return pdf.save();
}

async function encodePage(
  canvas: HTMLCanvasElement,
  format: RasterFormat,
  jpgQuality: number,
): Promise<{ bytes: Uint8Array; ext: string; mime: string }> {
  if (format === "jpg") {
    const flat = flattenWhite(canvas);
    const q = Math.max(0.01, Math.min(1, (jpgQuality || 90) / 100));
    return {
      bytes: await canvasToBytes(flat, "image/jpeg", q),
      ext: "jpg",
      mime: "image/jpeg",
    };
  }
  return {
    bytes: await canvasToBytes(canvas, "image/png"),
    ext: "png",
    mime: "image/png",
  };
}

export async function exportRasterPages(
  project: Project,
  settings: PrintSettings,
  onProgress?: (label: string) => void,
  setIds?: string[],
  pageIds?: string[] | "all",
): Promise<void> {
  const formats = (settings.formats ?? []).filter((f): f is RasterFormat => f === "png" || f === "jpg");
  if (!formats.length) throw new Error("请勾选 PNG 或 JPG");
  const jobs = buildPrintJobs(project, settings, setIds);
  let pages = flattenExportPages(jobs, settings);
  if (pageIds && pageIds !== "all") {
    const allow = new Set(pageIds);
    pages = pages.filter((p) => allow.has(p.id));
  }
  if (!pages.length) throw new Error("请勾选要导出的页");
  const dpi = Math.max(72, settings.dpi || 300);
  const files: { name: string; data: Uint8Array }[] = [];
  const used = new Set<string>();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.(`渲染 ${i + 1}/${pages.length}`);
    const canvas = await renderExportPage(page, project, settings, dpi);
    const base = pageFileName(project, settings, page) || `export-${page.index}`;
    for (const format of formats) {
      onProgress?.(`${format.toUpperCase()} ${i + 1}/${pages.length}`);
      const { bytes, ext } = await encodePage(canvas, format, settings.jpgQuality ?? 90);
      let name = `${base}.${ext}`;
      let n = 2;
      while (used.has(name)) {
        name = `${base}-${n}.${ext}`;
        n += 1;
      }
      used.add(name);
      files.push({ name, data: bytes });
    }
  }
  if (files.length === 1) {
    const mime = files[0].name.endsWith(".jpg") ? "image/jpeg" : "image/png";
    downloadBytes(files[0].data, files[0].name, mime);
    return;
  }
  onProgress?.("打包 ZIP…");
  const zip = zipFiles(files);
  downloadBlob(zip, `${project.meta.name}-export.zip`);
}
