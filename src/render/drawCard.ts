import { mmToPx } from "@/lib/mm";
import { parseColor } from "@/lib/color";
import { layerDrawn } from "@/model/layerTree";
import { resolveBound } from "@/model/layerVars";
import type { Layer, Project, Template, ViewportPrefs } from "@/model/types";
import { DEFAULT_VIEWPORT } from "@/model/defaults";
import { cardPixelSize, layerPx, resolveLayerText, SAFE_ZONE_MM } from "./layout";
import { pathLayerShape } from "./shapes";
import { parseRichText, type RichSpan } from "./richText";
import { resolveVariables } from "./variables";

const imageCache = new Map<string, HTMLImageElement>();

export function clearImageCache() {
  imageCache.clear();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

function assetSrc(fieldValue: string, assets: Record<string, string>): string | null {
  if (!fieldValue) return null;
  if (
    fieldValue.startsWith("data:") ||
    fieldValue.startsWith("blob:") ||
    fieldValue.startsWith("/__fs/") ||
    /^https?:/i.test(fieldValue)
  ) {
    return fieldValue;
  }
  const mapped = assets[fieldValue];
  if (mapped) return mapped;
  // 容错：资产 id 大小写或仅文件名
  const lower = fieldValue.toLowerCase();
  const fuzzy = Object.entries(assets).find(
    ([k, v]) => k.toLowerCase() === lower || k.toLowerCase().endsWith(`/${lower}`) || v.endsWith(fieldValue),
  );
  return fuzzy?.[1] ?? null;
}

function clipRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
}

export type RenderContext = {
  project?: Project;
  cardIndex?: number;
  total?: number;
};

function applyFont(
  ctx: CanvasRenderingContext2D,
  weight: string | number,
  italic: boolean,
  sizePx: number,
  family: string,
) {
  ctx.font = `${italic ? "italic " : ""}${weight} ${sizePx}px ${family}`;
}

function measureLine(
  ctx: CanvasRenderingContext2D,
  spans: RichSpan[],
  letterPx: number,
): number {
  let w = 0;
  for (const span of spans) {
    for (const ch of span.text) {
      w += ctx.measureText(ch).width + letterPx;
    }
  }
  return w;
}

/**
 * Canvas strokeText 把描边裁在字形遮罩里，上沿无法超出字形最高点。
 * 用一圈偏移 fillText 做外描边；radius 为可见外圈厚度。
 */
function outlineFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  radius: number,
) {
  if (radius < 0.05 || !text) return;
  const steps = Math.max(8, Math.min(64, Math.ceil(Math.PI * 2 * radius)));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillText(text, x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  box: { x: number; y: number; w: number; h: number },
  rawText: string,
  dpi: number,
) {
  const style = layer.style;
  const bg = parseColor(style.background);
  if (bg && bg.a > 0.01) {
    ctx.fillStyle = style.background!;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  const family = style.fontFamily ?? "Georgia, serif";
  const weight = style.fontWeight ?? (style.italic ? 400 : 400);
  const italic = !!style.italic;
  let fontMm = style.fontSizeMm ?? 4;
  const minMm = style.fontSizeMinMm ?? 2;
  const maxMm = style.fontSizeMaxMm ?? fontMm;
  const letterMm = style.letterSpacingMm ?? 0;
  const align = style.align ?? "center";
  const valign = style.valign ?? "middle";
  const overflow = style.overflow ?? "clip";
  const padL = mmToPx(style.marginLeftMm ?? 0, dpi);
  const padT = mmToPx(style.marginTopMm ?? 0, dpi);
  const padR = mmToPx(style.marginRightMm ?? 0, dpi);
  const padB = mmToPx(style.marginBottomMm ?? 0, dpi);
  const textBox = {
    x: box.x + padL,
    y: box.y + padT,
    w: Math.max(1, box.w - padL - padR),
    h: Math.max(1, box.h - padT - padB),
  };
  const strokePx = style.textStroke ? mmToPx(style.textStrokeWidthMm ?? 0.2, dpi) : 0;
  const resolved = rawText.replace(/\\n/g, "\n");
  const spans = parseRichText(resolved);

  const wrap = (sizeMm: number) => {
    const sizePx = mmToPx(sizeMm, dpi);
    applyFont(ctx, weight, italic, sizePx, family);
    const letterPx = mmToPx(letterMm, dpi);
    const lh = sizePx * (style.lineHeight ?? 1.25);
    const paraGap = mmToPx(style.paragraphSpacingMm ?? 0, dpi);
    const lines: RichSpan[][] = [[]];
    let lineW = 0;
    const pushLine = () => {
      lines.push([]);
      lineW = 0;
    };
    for (const span of spans) {
      const parts = span.text.split("\n");
      parts.forEach((part, pi) => {
        if (pi > 0) pushLine();
        for (const ch of part) {
          applyFont(ctx, span.bold ? 700 : weight, span.italic ?? italic, mmToPx(span.sizeMm ?? sizeMm, dpi), family);
          const cw = ctx.measureText(ch).width + letterPx;
          if (lineW + cw > textBox.w && (lines[lines.length - 1].length || lineW > 0)) {
            pushLine();
          }
          lines[lines.length - 1].push({ ...span, text: ch });
          lineW += cw;
        }
      });
    }
    const height = lines.length * lh + Math.max(0, lines.length - 1) * 0 + paraGap;
    return { lines, lh, letterPx, height };
  };

  let layout = wrap(fontMm);
  if (style.autosize || overflow === "shrink") {
    const tooBig = (lay: typeof layout, sizeMm: number) => {
      if (lay.height > textBox.h + 0.5) return true;
      applyFont(ctx, weight, italic, mmToPx(sizeMm, dpi), family);
      for (const line of lay.lines) {
        if (measureLine(ctx, line, lay.letterPx) > textBox.w + 0.5) return true;
      }
      return false;
    };
    while (tooBig(layout, fontMm) && fontMm > minMm) {
      fontMm = Math.max(minMm, fontMm - 0.2);
      layout = wrap(fontMm);
    }
    while (style.autosize && fontMm < maxMm) {
      const nextMm = Math.min(maxMm, fontMm + 0.2);
      const next = wrap(nextMm);
      if (tooBig(next, nextMm)) break;
      fontMm = nextMm;
      layout = next;
    }
  }

  let startY = textBox.y;
  const fontPx = mmToPx(fontMm, dpi);
  const visualH =
    layout.lines.length === 0 ? 0 : (layout.lines.length - 1) * layout.lh + fontPx;
  if (valign === "middle") startY = textBox.y + Math.max(0, (textBox.h - visualH) / 2);
  if (valign === "bottom") startY = textBox.y + Math.max(0, textBox.h - visualH);

  type GlyphRun = { span: RichSpan; xx: number; ty: number; yy: number; sizePx: number };
  const runs: GlyphRun[] = [];
  let yy = startY;
  for (const line of layout.lines) {
    if (overflow === "ellipsis" && yy + layout.lh > textBox.y + textBox.h) {
      if (line.length) {
        const last = line[line.length - 1];
        last.text = `${last.text.replace(/.$/, "")}…`;
      }
      break;
    }
    applyFont(ctx, weight, italic, mmToPx(fontMm, dpi), family);
    const lineWidth = measureLine(ctx, line, layout.letterPx);
    let xx = textBox.x;
    if (align === "center") xx = textBox.x + (textBox.w - lineWidth) / 2;
    if (align === "right") xx = textBox.x + textBox.w - lineWidth;
    let extra = 0;
    if (align === "justify" && line.length > 1) {
      extra = Math.max(0, (box.w - lineWidth) / (line.length - 1));
    }
    for (const span of line) {
      const sizePx = mmToPx(span.sizeMm ?? fontMm, dpi);
      applyFont(ctx, span.bold ? 700 : weight, span.italic ?? italic, sizePx, family);
      const ty = yy + (span.sup ? -sizePx * 0.28 : span.sub ? sizePx * 0.28 : 0);
      runs.push({ span, xx, ty, yy, sizePx });
      xx += ctx.measureText(span.text).width + layout.letterPx + extra;
    }
    yy += layout.lh;
  }

  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  if (style.textStroke && strokePx > 0) {
    const shadowColor = ctx.shadowColor;
    const shadowBlur = ctx.shadowBlur;
    const shadowX = ctx.shadowOffsetX;
    const shadowY = ctx.shadowOffsetY;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = style.textStroke;
    for (const g of runs) {
      applyFont(ctx, g.span.bold ? 700 : weight, g.span.italic ?? italic, g.sizePx, family);
      outlineFillText(ctx, g.span.text, g.xx, g.ty, strokePx * 0.5);
    }
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowX;
    ctx.shadowOffsetY = shadowY;
  }

  ctx.save();
  if (overflow === "clip" || overflow === "ellipsis") {
    const padX = Math.max(strokePx, fontPx * 0.2);
    const padTop = Math.max(strokePx, fontPx * 0.4);
    const padBottom = Math.max(strokePx * 0.5, fontPx * 0.2);
    ctx.beginPath();
    ctx.rect(
      textBox.x - padX,
      textBox.y - padTop,
      textBox.w + padX * 2,
      textBox.h + padTop + padBottom,
    );
    ctx.clip();
  }
  for (const g of runs) {
    applyFont(ctx, g.span.bold ? 700 : weight, g.span.italic ?? italic, g.sizePx, family);
    const fill = g.span.color ?? style.color ?? "#111";
    if (g.span.mark) {
      ctx.fillStyle = "rgba(214,255,60,0.35)";
      ctx.fillRect(g.xx, g.ty, ctx.measureText(g.span.text).width, g.sizePx);
    }
    ctx.fillStyle = fill;
    ctx.fillText(g.span.text, g.xx, g.ty);
    if (g.span.underline || style.underline) {
      ctx.beginPath();
      ctx.moveTo(g.xx, g.yy + g.sizePx);
      ctx.lineTo(g.xx + ctx.measureText(g.span.text).width, g.yy + g.sizePx);
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (g.span.strike || style.strikethrough) {
      ctx.beginPath();
      ctx.moveTo(g.xx, g.yy + g.sizePx * 0.55);
      ctx.lineTo(g.xx + ctx.measureText(g.span.text).width, g.yy + g.sizePx * 0.55);
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function knockoutBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const samples = [
    idx(0, 0),
    idx(w - 1, 0),
    idx(0, h - 1),
    idx(w - 1, h - 1),
    idx(Math.floor(w / 2), 0),
    idx(Math.floor(w / 2), h - 1),
    idx(0, Math.floor(h / 2)),
    idx(w - 1, Math.floor(h / 2)),
  ];
  let ar = 0;
  let ag = 0;
  let ab = 0;
  let opaque = 0;
  for (const i of samples) {
    if (d[i + 3] < 200) continue;
    ar += d[i];
    ag += d[i + 1];
    ab += d[i + 2];
    opaque += 1;
  }
  if (opaque < 3) return;
  ar /= opaque;
  ag /= opaque;
  ab /= opaque;
  const tol = 42;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const dr = d[i] - ar;
    const dg = d[i + 1] - ag;
    const db = d[i + 2] - ab;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist >= tol) continue;
    const fade = dist / tol;
    d[i + 3] = Math.round(d[i + 3] * fade * fade);
  }
  ctx.putImageData(img, 0, 0);
}

function drawImageFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: { x: number; y: number; w: number; h: number },
  fit: "cover" | "contain",
  opts?: { tint?: string; knockout?: boolean },
) {
  if (box.w < 0.5 || box.h < 0.5 || !img.width || !img.height) return;
  const scale =
    fit === "contain"
      ? Math.min(box.w / img.width, box.h / img.height)
      : Math.max(box.w / img.width, box.h / img.height);
  const dw = Math.max(1, img.width * scale);
  const dh = Math.max(1, img.height * scale);
  const dx = box.x + (box.w - dw) / 2;
  const dy = box.y + (box.h - dh) / 2;
  const oc = document.createElement("canvas");
  oc.width = Math.max(1, Math.round(dw));
  oc.height = Math.max(1, Math.round(dh));
  const octx = oc.getContext("2d");
  if (!octx) return;
  octx.drawImage(img, 0, 0, oc.width, oc.height);
  if (opts?.knockout) knockoutBackground(octx, oc.width, oc.height);
  // Unity UI Image：RGB 正片叠底，必须保留原图 alpha（透明区域继续透）
  const tint = opts?.tint ? parseColor(opts.tint) : null;
  if (tint && (tint.r < 254 || tint.g < 254 || tint.b < 254)) {
    const pix = octx.getImageData(0, 0, oc.width, oc.height);
    const d = pix.data;
    const tr = tint.r / 255;
    const tg = tint.g / 255;
    const tb = tint.b / 255;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = Math.round(d[i] * tr);
      d[i + 1] = Math.round(d[i + 1] * tg);
      d[i + 2] = Math.round(d[i + 2] * tb);
    }
    octx.putImageData(pix, 0, 0);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.drawImage(oc, dx, dy, dw, dh);
  ctx.restore();
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  template: Template,
  layer: Layer,
  fields: Record<string, string>,
  assets: Record<string, string>,
  dpi: number,
  images: Map<string, HTMLImageElement>,
  rawText: string,
  honorVisibleWhen: boolean,
) {
  if (!layerDrawn(template.layers, layer, fields, honorVisibleWhen)) return;
  if (layer.type === "group") return;
  const style = {
    ...layer.style,
    fill: resolveBound(layer, "fill", fields, layer.style.fill ?? ""),
    stroke: resolveBound(layer, "stroke", fields, layer.style.stroke ?? ""),
    color: resolveBound(layer, "color", fields, layer.style.color ?? ""),
    background: resolveBound(layer, "background", fields, layer.style.background ?? ""),
  };
  const drawn: Layer = { ...layer, style };
  const box = layerPx(template, drawn, dpi);
  ctx.save();
  ctx.globalAlpha = drawn.style.opacity ?? 1;
  if (drawn.style.shadowColor) {
    ctx.shadowColor = drawn.style.shadowColor;
    ctx.shadowBlur = mmToPx(drawn.style.shadowBlurMm ?? 1.2, dpi);
    ctx.shadowOffsetX = mmToPx(drawn.style.shadowXMm ?? 0.4, dpi);
    ctx.shadowOffsetY = mmToPx(drawn.style.shadowYMm ?? 0.4, dpi);
  } else if (drawn.style.glowColor) {
    ctx.shadowColor = drawn.style.glowColor;
    ctx.shadowBlur = mmToPx(drawn.style.glowBlurMm ?? 2, dpi);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  if (drawn.style.gradientFrom && drawn.style.gradientTo) {
    const ang = ((drawn.style.gradientAngle ?? 90) * Math.PI) / 180;
    const gx = Math.cos(ang) * box.w * 0.5;
    const gy = Math.sin(ang) * box.h * 0.5;
    const grad = ctx.createLinearGradient(box.x + box.w / 2 - gx, box.y + box.h / 2 - gy, box.x + box.w / 2 + gx, box.y + box.h / 2 + gy);
    grad.addColorStop(0, drawn.style.gradientFrom);
    grad.addColorStop(1, drawn.style.gradientTo);
    ctx.fillStyle = grad;
  }
  if (drawn.rotation) {
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    ctx.rotate((drawn.rotation * Math.PI) / 180);
    ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
  }

  if (drawn.type === "rect") {
    if (!(drawn.style.gradientFrom && drawn.style.gradientTo)) ctx.fillStyle = drawn.style.fill || "#cccccc";
    pathLayerShape(ctx, box, drawn.style.shape, dpi);
    ctx.fill();
    if (drawn.style.stroke) {
      ctx.strokeStyle = drawn.style.stroke;
      ctx.lineWidth = mmToPx(drawn.style.strokeWidthMm ?? 0.4, dpi);
      ctx.stroke();
    }
  }

  if (drawn.type === "text") {
    drawTextLayer(ctx, drawn, box, rawText, dpi);
  }

  if (drawn.type === "image" || drawn.type === "icon") {
    const value = resolveBound(drawn, "src", fields, "") || fields[drawn.name] || drawn.text || "";
    const src = assetSrc(value, assets);
    const img = src ? images.get(src) : undefined;
    const count = Math.max(1, Math.min(24, Number.parseInt(resolveBound(drawn, "repeat", fields, "1"), 10) || 1));
    const imgOpts = {
      tint: drawn.style.tint,
      knockout: drawn.type === "icon" ? drawn.style.knockout !== false : !!drawn.style.knockout,
    };
    if (img && count > 1) {
      const cols = Math.min(drawn.repeatPerRow ?? count, count);
      const rows = Math.ceil(count / cols);
      const gap = mmToPx(0.5, dpi);
      const tw = (box.w - gap * Math.max(0, cols - 1)) / cols;
      const th = (box.h - gap * Math.max(0, rows - 1)) / rows;
      for (let i = 0; i < count; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        drawImageFit(
          ctx,
          img,
          { x: box.x + c * (tw + gap), y: box.y + r * (th + gap), w: tw, h: th },
          drawn.style.fit ?? "contain",
          imgOpts,
        );
      }
    } else if (img) {
      drawImageFit(ctx, img, box, drawn.style.fit ?? (drawn.type === "icon" ? "contain" : "cover"), imgOpts);
    }
  }

  ctx.restore();
}

async function preloadImages(
  template: Template,
  fields: Record<string, string>,
  assets: Record<string, string>,
  project?: Project,
  honorVisibleWhen = true,
): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  const jobs: Promise<void>[] = [];
  const add = (src: string | null) => {
    if (!src) return;
    jobs.push(
      loadImage(src)
        .then((img) => {
          map.set(src, img);
        })
        .catch(() => undefined),
    );
  };
  for (const layer of template.layers) {
    if (!layerDrawn(template.layers, layer, fields, honorVisibleWhen)) continue;
    if (layer.type === "image" || layer.type === "icon") {
      const value = resolveBound(layer, "src", fields, layer.text ?? "") || fields[layer.name] || layer.text || "";
      add(assetSrc(value, assets));
    }
  }
  for (const v of project?.variables ?? []) {
    if (v.kind === "icon") add(assetSrc(v.replacement, assets));
  }
  await Promise.all(jobs);
  return map;
}

export type RenderOptions = {
  dpi: number;
  fields?: Record<string, string>;
  assets?: Record<string, string>;
  project?: Project;
  cardIndex?: number;
  total?: number;
  guides?: boolean | Partial<ViewportPrefs>;
  /** 蓝图编辑时为 false，始终画出带 visibleWhen 的图层以便改版式 */
  honorVisibleWhen?: boolean;
  /** 试玩/桌面：裁掉出血，只输出成品 trim 尺寸 */
  cropBleed?: boolean;
};

export async function renderCardToCanvas(
  template: Template,
  options: RenderOptions,
): Promise<HTMLCanvasElement> {
  const dpi = options.dpi;
  const fields = options.fields ?? {};
  const assets = options.assets ?? options.project?.assets ?? {};
  const size = cardPixelSize(template, dpi);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.save();
  clipRoundRect(ctx, 0, 0, size.width, size.height, size.radius);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);

  const honorVisibleWhen = options.honorVisibleWhen !== false;
  const images = await preloadImages(template, fields, assets, options.project, honorVisibleWhen);
  const total = options.total ?? 1;
  const cardIndex = options.cardIndex ?? 0;
  for (const layer of template.layers) {
    const raw = resolveLayerText(layer, fields);
    const text = options.project
      ? resolveVariables(raw, {
          project: options.project,
          template,
          card: { id: "preview", qty: 1, fields },
          cardIndex,
          total,
        })
      : raw;
    drawLayer(ctx, template, layer, fields, assets, dpi, images, text, honorVisibleWhen);
  }
  ctx.restore();

  const guideOn = options.guides;
  if (guideOn) {
    const g = typeof guideOn === "object" ? { ...DEFAULT_VIEWPORT, ...guideOn } : DEFAULT_VIEWPORT;
    ctx.save();
    if (g.showCut) {
      ctx.strokeStyle = g.cutColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(size.bleedPx, size.bleedPx, size.trimW, size.trimH);
    }
    if (g.showBleed !== false && (typeof guideOn === "boolean" || g.showBleed)) {
      ctx.strokeStyle = g.bleedColor;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(1, 1, size.width - 2, size.height - 2);
    }
    if (g.showSafe) {
      ctx.strokeStyle = g.safeColor;
      ctx.setLineDash([4, 3]);
      const safe = mmToPx(SAFE_ZONE_MM, dpi);
      ctx.strokeRect(
        size.bleedPx + safe,
        size.bleedPx + safe,
        size.trimW - safe * 2,
        size.trimH - safe * 2,
      );
    }
    if (g.showGrid) {
      ctx.setLineDash([]);
      ctx.strokeStyle = g.gridColor;
      ctx.globalAlpha = 0.45;
      const step = mmToPx(g.gridMm || 5, dpi);
      for (let x = size.bleedPx; x < size.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.height);
        ctx.stroke();
      }
      for (let y = size.bleedPx; y < size.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size.width, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  if (options.cropBleed && size.bleedPx > 0.5) {
    const trim = document.createElement("canvas");
    trim.width = Math.max(1, Math.round(size.trimW));
    trim.height = Math.max(1, Math.round(size.trimH));
    const tctx = trim.getContext("2d");
    if (!tctx) return canvas;
    tctx.drawImage(
      canvas,
      size.bleedPx,
      size.bleedPx,
      size.trimW,
      size.trimH,
      0,
      0,
      trim.width,
      trim.height,
    );
    return trim;
  }

  return canvas;
}

export async function renderCardPng(
  template: Template,
  project: Project,
  fields: Record<string, string>,
  dpi: number,
  extra?: { cardIndex?: number; total?: number },
): Promise<string> {
  const canvas = await renderCardToCanvas(template, {
    dpi,
    fields,
    assets: project.assets,
    project,
    cardIndex: extra?.cardIndex,
    total: extra?.total,
  });
  return canvas.toDataURL("image/png");
}

export async function renderCardBlob(
  template: Template,
  project: Project,
  fields: Record<string, string>,
  dpi: number,
  extra?: { cardIndex?: number; total?: number },
): Promise<Blob> {
  const canvas = await renderCardToCanvas(template, {
    dpi,
    fields,
    assets: project.assets,
    project,
    cardIndex: extra?.cardIndex,
    total: extra?.total,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("导出图片失败"));
    }, "image/png");
  });
}
