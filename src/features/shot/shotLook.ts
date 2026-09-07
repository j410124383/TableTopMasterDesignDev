import type { ProductShotLook } from "@/model/types";

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  if (!Number.isFinite(n)) return [17, 17, 17];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function applyProductLook(
  src: HTMLCanvasElement,
  look?: ProductShotLook | null,
  mask?: HTMLCanvasElement | null,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;

  const blur = Math.max(0, Math.min(1, look?.blur ?? 0));
  if (blur > 0) ctx.filter = `blur(${(blur * 6).toFixed(2)}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";

  if (look?.outline?.enabled && mask) {
    applyOutline(ctx, out, mask, look.outline.color, Math.max(1, look.outline.widthPx || 3));
  }

  const exp = look?.exposure ?? 1;
  const con = look?.contrast ?? 1;
  const sat = look?.saturation ?? 1;
  if (exp !== 1 || con !== 1 || sat !== 1) {
    const tmp = document.createElement("canvas");
    tmp.width = out.width;
    tmp.height = out.height;
    tmp.getContext("2d")!.drawImage(out, 0, 0);
    ctx.filter = `brightness(${exp}) contrast(${con}) saturate(${sat})`;
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(tmp, 0, 0);
    ctx.filter = "none";
  }

  const bloom = Math.max(0, Math.min(1, look?.bloom ?? 0));
  if (bloom > 0) applyBloom(ctx, out, bloom);

  const vig = Math.max(0, Math.min(1, look?.vignette ?? 0));
  if (vig > 0) {
    const g = ctx.createRadialGradient(
      out.width / 2,
      out.height / 2,
      Math.min(out.width, out.height) * 0.25,
      out.width / 2,
      out.height / 2,
      Math.hypot(out.width, out.height) * 0.55,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${(0.72 * vig).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  return out;
}

function applyOutline(
  ctx: CanvasRenderingContext2D,
  frame: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  color: string,
  widthPx: number,
) {
  const w = frame.width;
  const h = frame.height;
  const dilated = document.createElement("canvas");
  dilated.width = w;
  dilated.height = h;
  const dctx = dilated.getContext("2d")!;
  dctx.filter = `blur(${Math.max(1, widthPx * 0.65)}px)`;
  dctx.drawImage(mask, 0, 0);
  dctx.filter = "none";
  const src = dctx.getImageData(0, 0, w, h);
  const mctx = mask.getContext("2d")!;
  const mid = mctx.getImageData(0, 0, w, h);
  const [r, g, b] = parseHex(color);
  const ring = dctx.createImageData(w, h);
  for (let i = 0; i < src.data.length; i += 4) {
    const d = src.data[i]!;
    const inside = mid.data[i]!;
    if (d > 40 && inside < 40) {
      ring.data[i] = r;
      ring.data[i + 1] = g;
      ring.data[i + 2] = b;
      ring.data[i + 3] = 230;
    }
  }
  dctx.putImageData(ring, 0, 0);
  ctx.drawImage(frame, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(dilated, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

function applyBloom(ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, amount: number) {
  const tmp = document.createElement("canvas");
  tmp.width = frame.width;
  tmp.height = frame.height;
  const tctx = tmp.getContext("2d")!;
  tctx.filter = `blur(${(8 + amount * 16).toFixed(1)}px) brightness(${1 + amount})`;
  tctx.drawImage(frame, 0, 0);
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.25 + amount * 0.5;
  ctx.drawImage(tmp, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
