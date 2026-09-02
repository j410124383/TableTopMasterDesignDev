import { PDFDocument, rgb } from "pdf-lib";
import { mmToPt } from "@/lib/mm";
import type { PrintSettings, Project, Template } from "@/model/types";
import { renderCardBlob, renderCardPng } from "@/render/drawCard";
import {
  buildPrintJobs,
  expandCards,
  flattenPrintPages,
  formatExportName,
  slotPosition,
  type PrintJob,
} from "./layoutSheets";

function hexToRgb(hex: string) {
  const n = hex.replace("#", "");
  const v = Number.parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

function drawCropMarks(
  page: ReturnType<PDFDocument["addPage"]>,
  x: number,
  y: number,
  w: number,
  h: number,
  bleed: number,
  color: string,
  lengthMm: number,
) {
  const mark = mmToPt(lengthMm);
  const gap = mmToPt(Math.max(0.4, bleed * 0.15));
  const stroke = hexToRgb(color);
  const trimX = x + mmToPt(bleed);
  const trimY = y + mmToPt(bleed);
  const trimW = w - mmToPt(bleed) * 2;
  const trimH = h - mmToPt(bleed) * 2;
  const lines: [number, number, number, number][] = [
    [trimX, trimY - gap, trimX, trimY - gap - mark],
    [trimX - gap, trimY, trimX - gap - mark, trimY],
    [trimX + trimW, trimY - gap, trimX + trimW, trimY - gap - mark],
    [trimX + trimW + gap, trimY, trimX + trimW + gap + mark, trimY],
    [trimX, trimY + trimH + gap, trimX, trimY + trimH + gap + mark],
    [trimX - gap, trimY + trimH, trimX - gap - mark, trimY + trimH],
    [trimX + trimW, trimY + trimH + gap, trimX + trimW, trimY + trimH + gap + mark],
    [trimX + trimW + gap, trimY + trimH, trimX + trimW + gap + mark, trimY + trimH],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.4, color: stroke });
  }
}

export async function exportPrintPdf(
  project: Project,
  settings: PrintSettings,
  onProgress?: (label: string) => void,
  setIds?: string[],
  pageFilter?: number[] | "all",
): Promise<Uint8Array> {
  const jobs = buildPrintJobs(project, settings, setIds);
  let pages = flattenPrintPages(jobs);
  if (pageFilter && pageFilter !== "all") {
    pages = pages.filter((_, i) => pageFilter.includes(i));
  }
  const pdf = await PDFDocument.create();

  async function drawPage(job: PrintJob, template: Template, pageSlots: (typeof pages)[number]["slots"], mirror: boolean) {
    const plan = job.plan;
    const pageW = mmToPt(plan.paper.w);
    const pageH = mmToPt(plan.paper.h);
    const page = pdf.addPage([pageW, pageH]);
    const total = expandCards(job.set.cards).length;
    for (const slot of pageSlots) {
      onProgress?.(`渲染 ${job.set.name} ${slot.card.fields.name || slot.card.id}`);
      const blob = await renderCardBlob(
        { ...template, bleedMm: settings.bleedMm },
        project,
        slot.card.fields,
        settings.dpi,
        { cardIndex: slot.index, total },
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const image = await pdf.embedPng(bytes);
      const pos = slotPosition(plan, slot, settings, mirror);
      const x = mmToPt(pos.x);
      const w = mmToPt(plan.cardW);
      const h = mmToPt(plan.cardH);
      const y = pageH - mmToPt(pos.y) - h;
      page.drawImage(image, { x, y, width: w, height: h });
      if (settings.cutMarks) {
        drawCropMarks(page, x, y, w, h, settings.bleedMm, settings.cutColor, settings.cutLengthMm);
      }
    }
  }

  for (const page of pages) {
    await drawPage(page.job, page.job.front, page.slots, false);
    if (settings.duplex && page.job.back) {
      await drawPage(page.job, page.job.back, page.slots, true);
    }
  }

  return pdf.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportCardPngs(
  project: Project,
  settings: PrintSettings,
  onProgress?: (label: string) => void,
  setIds?: string[],
): Promise<void> {
  const jobs = buildPrintJobs(project, settings, setIds);
  for (const job of jobs) {
    const copies = expandCards(job.set.cards);
    for (let i = 0; i < copies.length; i++) {
      const card = copies[i];
      onProgress?.(`PNG ${job.set.name} ${i + 1}/${copies.length}`);
      const url = await renderCardPng(job.front, project, card.fields, settings.dpi, {
        cardIndex: i,
        total: copies.length,
      });
      const name = formatExportName(settings.filename, {
        project: project.meta.name,
        deck: job.set.name,
        index: i + 1,
        face: "正面",
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.png`;
      a.click();
      if (settings.duplex && job.back) {
        const backUrl = await renderCardPng(job.back, project, card.fields, settings.dpi, {
          cardIndex: i,
          total: copies.length,
        });
        const b = document.createElement("a");
        b.href = backUrl;
        b.download = `${formatExportName(settings.filename, {
          project: project.meta.name,
          deck: job.set.name,
          index: i + 1,
          face: "背面",
        })}.png`;
        b.click();
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }
}
