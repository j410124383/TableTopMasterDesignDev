import { mmToPx } from "@/lib/mm";
import { resolveBound } from "@/model/layerVars";
import { absBox } from "@/model/layerTree";
import type { Layer, Template } from "@/model/types";

export const PREVIEW_DPI = 300;
export const PRINT_DPI = 300;
export const SAFE_ZONE_MM = 3;

export function cardPixelSize(template: Template, dpi: number) {
  const bleed = template.bleedMm;
  return {
    width: Math.round(mmToPx(template.size.w + bleed * 2, dpi)),
    height: Math.round(mmToPx(template.size.h + bleed * 2, dpi)),
    bleedPx: mmToPx(bleed, dpi),
    trimW: mmToPx(template.size.w, dpi),
    trimH: mmToPx(template.size.h, dpi),
    radius: mmToPx(template.cornerRadiusMm, dpi),
  };
}

export function layerPx(
  template: Template,
  layer: Layer,
  dpi: number,
  layers: Layer[] = template.layers,
) {
  const { bleedPx } = cardPixelSize(template, dpi);
  const box = absBox(layers, layer);
  return {
    x: mmToPx(box.x, dpi) + bleedPx,
    y: mmToPx(box.y, dpi) + bleedPx,
    w: mmToPx(box.w, dpi),
    h: mmToPx(box.h, dpi),
  };
}

export function resolveField(
  name: string,
  fields: Record<string, string> | undefined,
): string {
  if (!fields) return "";
  if (name in fields) return fields[name] ?? "";
  return "";
}

/** 卡牌字段优先；空则用蓝图图层上的预览/默认文本。 */
export function resolveLayerText(
  layer: Pick<Layer, "name" | "text" | "vars">,
  fields?: Record<string, string>,
): string {
  if (layer.vars?.text) {
    return resolveBound(layer as Layer, "text", fields, layer.text ?? "");
  }
  if (fields && Object.prototype.hasOwnProperty.call(fields, layer.name)) {
    const v = fields[layer.name];
    if (v != null && String(v).length > 0) return String(v);
  }
  return layer.text ?? "";
}
