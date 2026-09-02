import type { Layer } from "./types";

export type LayerVarProp = "text" | "fill" | "stroke" | "color" | "background" | "src" | "repeat" | "active";

export const LAYER_VAR_LABELS: Record<LayerVarProp, string> = {
  text: "文本",
  fill: "填充色",
  stroke: "描边色",
  color: "文字色",
  background: "背景色",
  src: "图片",
  repeat: "重复次数",
  active: "Active 显隐",
};

export function propsForLayer(layer: Layer): LayerVarProp[] {
  if (layer.type === "group") return ["active"];
  if (layer.type === "rect") return ["fill", "stroke", "active"];
  if (layer.type === "image" || layer.type === "icon") return ["src", "repeat", "active"];
  return ["text", "color", "background", "active"];
}

export function defaultVarField(layer: Layer, prop: LayerVarProp): string {
  if (prop === "text" || prop === "src") return layer.name;
  if (prop === "repeat") return `${layer.name}_n`;
  if (prop === "active") return `${layer.name}_on`;
  return `${layer.name}_${prop}`;
}

export function layerVarField(layer: Layer, prop: LayerVarProp): string | undefined {
  const key = layer.vars?.[prop];
  return key ? key : undefined;
}

export function defaultValueForVar(layer: Layer, prop: LayerVarProp): string {
  if (prop === "text" || prop === "src") return layer.text ?? "";
  if (prop === "repeat") return "1";
  if (prop === "active") return layer.visible === false ? "false" : "true";
  if (prop === "fill") return layer.style.fill ?? "";
  if (prop === "stroke") return layer.style.stroke ?? "";
  if (prop === "color") return layer.style.color ?? "";
  if (prop === "background") return layer.style.background ?? "";
  return "";
}

export function bindLayerVar(layer: Layer, prop: LayerVarProp, field = defaultVarField(layer, prop)): Layer {
  return { ...layer, vars: { ...layer.vars, [prop]: field } };
}

export function unbindLayerVar(layer: Layer, prop: LayerVarProp): Layer {
  const next = { ...(layer.vars ?? {}) };
  delete next[prop];
  return { ...layer, vars: next };
}

export function resolveBound(
  layer: Layer,
  prop: LayerVarProp,
  fields: Record<string, string> | undefined,
  fallback: string,
): string {
  const key = layer.vars?.[prop];
  if (!key || !fields || !Object.prototype.hasOwnProperty.call(fields, key)) return fallback;
  const v = fields[key];
  if (v == null || String(v).length === 0) return fallback;
  return String(v);
}

export function fieldKeysFromLayers(layers: Layer[]): string[] {
  const keys: string[] = [];
  for (const layer of layers) {
    if (layer.vars) {
      for (const value of Object.values(layer.vars)) {
        if (value) keys.push(value);
      }
      continue;
    }
    if (!layer.locked && (layer.type === "text" || layer.type === "image" || layer.type === "icon")) {
      keys.push(layer.name);
    }
  }
  return [...new Set(keys)];
}

/** active 独占的列标为 bool；与 text/src 共用的列仍用文本（空=隐藏） */
export function fieldTypesFromLayers(layers: Layer[]): Record<string, import("./types").FieldType> {
  const usedAsData = new Set<string>();
  const usedAsActive = new Set<string>();
  for (const layer of layers) {
    if (!layer.vars) continue;
    for (const [prop, key] of Object.entries(layer.vars)) {
      if (!key) continue;
      if (prop === "active") usedAsActive.add(key);
      else usedAsData.add(key);
    }
  }
  const out: Record<string, import("./types").FieldType> = {};
  for (const key of usedAsActive) {
    if (!usedAsData.has(key)) out[key] = "bool";
  }
  for (const layer of layers) {
    if (layer.vars?.src) out[layer.vars.src] = out[layer.vars.src] ?? "image";
  }
  return out;
}
