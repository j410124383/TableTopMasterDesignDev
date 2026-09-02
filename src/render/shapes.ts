import { mmToPx } from "@/lib/mm";
import type { LayerShape } from "@/model/types";

export const LAYER_SHAPES: { id: LayerShape; name: string }[] = [
  { id: "rect", name: "矩形" },
  { id: "round", name: "圆角" },
  { id: "pill", name: "胶囊" },
  { id: "circle", name: "圆形" },
  { id: "ellipse", name: "椭圆" },
  { id: "diamond", name: "菱形" },
  { id: "triangle", name: "三角" },
  { id: "hex", name: "六边" },
];

export function pathLayerShape(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  shape: LayerShape | undefined,
  dpi: number,
) {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.beginPath();
  switch (shape) {
    case "circle": {
      ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
      break;
    }
    case "ellipse":
      ctx.ellipse(cx, cy, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case "hex": {
      const rx = w / 2;
      const ry = h / 2;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case "pill":
      ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
      break;
    case "rect":
      ctx.rect(x, y, w, h);
      break;
    case "round":
      ctx.roundRect(x, y, w, h, mmToPx(2.2, dpi));
      break;
    default:
      ctx.roundRect(x, y, w, h, mmToPx(0.6, dpi));
  }
}
