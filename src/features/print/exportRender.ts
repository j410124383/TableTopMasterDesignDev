import { mmToPx } from "@/lib/mm";
import type { PrintSettings, Project, Template } from "@/model/types";
import { renderCardToCanvas } from "@/render/drawCard";
import type { ExportPage } from "./layoutSheets";
import { slotPosition } from "./layoutSheets";

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (radius < 0.5) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  radiusPx: number,
  color: string,
  linePx: number,
  insetPx: number,
) {
  if (linePx < 0.2) return;
  const maxInset = Math.max(0, Math.min(w, h) / 2 - 0.5);
  const inset = Math.min(maxInset, Math.max(linePx / 2, insetPx));
  ctx.save();
  ctx.strokeStyle = color || "#111";
  ctx.lineWidth = linePx;
  ctx.lineJoin = "round";
  pathRoundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, Math.max(0, radiusPx - inset));
  ctx.stroke();
  ctx.restore();
}

function applyCardEffects(
  src: HTMLCanvasElement,
  radiusPx: number,
  settings: PrintSettings,
  dpi: number,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d", { alpha: true });
  if (!ctx) return src;
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.save();
  if (radiusPx > 0.5) {
    pathRoundRect(ctx, 0, 0, out.width, out.height, radiusPx);
    ctx.clip();
  }
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  if (settings.cardStroke) {
    strokeRoundRect(
      ctx,
      out.width,
      out.height,
      radiusPx,
      settings.cardStrokeColor,
      mmToPx(Math.max(0, settings.cardStrokeMm), dpi),
      mmToPx(Math.max(0, settings.cardStrokeMm), dpi) / 2,
    );
  }
  if (settings.parallelStroke) {
    const linePx = mmToPx(Math.max(0, settings.parallelStrokeMm), dpi);
    const insetPx = mmToPx(Math.max(0, settings.parallelStrokeInsetMm), dpi);
    strokeRoundRect(ctx, out.width, out.height, radiusPx, settings.parallelStrokeColor, linePx, insetPx);
  }
  return out;
}

async function renderExportCard(
  template: Template,
  project: Project,
  fields: Record<string, string>,
  settings: PrintSettings,
  dpi: number,
  extra: { cardIndex: number; total: number },
): Promise<HTMLCanvasElement> {
  const canvas = await renderCardToCanvas(template, {
    dpi,
    fields,
    assets: project.assets,
    project,
    cardIndex: extra.cardIndex,
    total: extra.total,
    cropBleed: !settings.includeBleed,
    roundCorners: false,
  });
  const radius = settings.roundCorners ? mmToPx(template.cornerRadiusMm, dpi) : 0;
  return applyCardEffects(canvas, radius, settings, dpi);
}

function drawCropMarksCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bleedPx: number,
  color: string,
  lengthPx: number,
) {
  const mark = Math.max(1, lengthPx);
  const gap = Math.max(1, bleedPx * 0.15);
  const trimX = x + bleedPx;
  const trimY = y + bleedPx;
  const trimW = w - bleedPx * 2;
  const trimH = h - bleedPx * 2;
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
  ctx.save();
  ctx.strokeStyle = color || "#222";
  ctx.lineWidth = 1;
  for (const [x1, y1, x2, y2] of lines) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  opacityPct: number,
  type: PrintSettings["watermarkType"] = "single",
) {
  const label = text.trim();
  if (!label) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(100, opacityPct)) / 100;
  ctx.fillStyle = "#222222";
  const size = Math.max(14, Math.min(w, h) * 0.08);
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  if (type !== "tile") {
    ctx.fillText(label, 0, 0);
    ctx.restore();
    return;
  }
  const gapX = Math.max(ctx.measureText(label).width * 2.5, size * 2.5);
  const gapY = size * 2.5;
  const extent = Math.hypot(w, h);
  for (let y = -extent; y <= extent; y += gapY) {
    for (let x = -extent; x <= extent; x += gapX) {
      ctx.fillText(label, x, y);
    }
  }
  ctx.restore();
}

export async function renderExportPage(
  page: ExportPage,
  project: Project,
  settings: PrintSettings,
  dpi: number,
  opts?: { paper?: "white" | "transparent" },
): Promise<HTMLCanvasElement> {
  const plan = page.job.plan;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(mmToPx(plan.paper.w, dpi)));
  canvas.height = Math.max(1, Math.round(mmToPx(plan.paper.h, dpi)));
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("无法创建画布");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (opts?.paper === "white") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const template = page.face === "back" && page.job.back ? page.job.back : page.job.front;
  const mirror = page.face === "back";
  const total = Math.max(1, page.job.plan.pages.flat().length);
  const mode = settings.mode ?? "print";
  const layoutBleedPx = mode === "print" ? mmToPx(Math.max(0, settings.bleedMm), dpi) : 0;

  for (const slot of page.slots) {
    const cardCanvas = await renderExportCard(template, project, slot.card.fields, settings, dpi, {
      cardIndex: slot.index,
      total,
    });
    const pos = slotPosition(plan, slot, settings, mirror);
    const x = mmToPx(pos.x, dpi);
    const y = mmToPx(pos.y, dpi);
    const slotW = mmToPx(plan.cardW, dpi);
    const slotH = mmToPx(plan.cardH, dpi);
    if (mode === "print" && !settings.includeBleed && layoutBleedPx > 0.5) {
      ctx.drawImage(
        cardCanvas,
        x + layoutBleedPx,
        y + layoutBleedPx,
        Math.max(1, slotW - layoutBleedPx * 2),
        Math.max(1, slotH - layoutBleedPx * 2),
      );
    } else {
      ctx.drawImage(cardCanvas, x, y, slotW, slotH);
    }
    if (mode === "print" && settings.cutMarks) {
      drawCropMarksCanvas(
        ctx,
        x,
        y,
        slotW,
        slotH,
        layoutBleedPx,
        settings.cutColor,
        mmToPx(settings.cutLengthMm, dpi),
      );
    }
  }

  if (settings.watermark) {
    drawWatermark(
      ctx,
      canvas.width,
      canvas.height,
      settings.watermarkText || project.meta.name,
      settings.watermarkOpacity ?? 30,
      settings.watermarkType ?? "single",
    );
  }
  return canvas;
}

export function flattenWhite(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out;
}

export function canvasToBytes(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("导出图片失败"));
          return;
        }
        void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      },
      mime,
      quality,
    );
  });
}

export function canvasToUrl(canvas: HTMLCanvasElement, mime = "image/png", quality?: number): Promise<string> {
  if (mime === "image/png" && quality == null) {
    return Promise.resolve(canvas.toDataURL("image/png"));
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("预览失败"));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      mime,
      quality,
    );
  });
}
