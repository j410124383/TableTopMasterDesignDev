import type { Layer } from "./types";

/**
 * 图层显隐：
 * 1. layer.visible === false → 关（对应 Unity inactive）
 * 2. vars.active 绑定字段 → 按 bool / 真值
 * 3. 旧版 visibleWhen 表达式（兼容）
 */
export function parseBoolField(value: string | undefined | null): boolean {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  if (!s) return false;
  return !["0", "false", "no", "off", "否", "假", "n"].includes(s);
}

/**
 * @deprecated 保留兼容旧工程
 */
export function evalVisibleWhen(expr: string, fields: Record<string, string>): boolean {
  const parts = expr
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return true;
  return parts.every((part) => evalClause(part, fields));
}

function fieldOf(fields: Record<string, string>, key: string): string {
  return String(fields[key] ?? "").trim();
}

function evalClause(part: string, fields: Record<string, string>): boolean {
  const neq = part.match(/^([A-Za-z0-9_\u4e00-\u9fff]+)!=(.*)$/);
  if (neq) return fieldOf(fields, neq[1]) !== neq[2];
  const ncontains = part.match(/^([A-Za-z0-9_\u4e00-\u9fff]+)!~(.*)$/);
  if (ncontains) return !fieldOf(fields, ncontains[1]).includes(ncontains[2]);
  const eq = part.match(/^([A-Za-z0-9_\u4e00-\u9fff]+)=(.*)$/);
  if (eq) return fieldOf(fields, eq[1]) === eq[2];
  const contains = part.match(/^([A-Za-z0-9_\u4e00-\u9fff]+)~(.*)$/);
  if (contains) return fieldOf(fields, contains[1]).includes(contains[2]);
  if (part.startsWith("!")) return fieldOf(fields, part.slice(1)) === "";
  return fieldOf(fields, part) !== "";
}

export function layerIsVisible(
  layer: Layer,
  fields: Record<string, string> | undefined,
  honorWhen = true,
): boolean {
  if (layer.visible === false) return false;
  if (!honorWhen) return true;
  const activeKey = layer.vars?.active;
  if (activeKey) return parseBoolField(fields?.[activeKey]);
  if (layer.visibleWhen) return evalVisibleWhen(layer.visibleWhen, fields ?? {});
  return true;
}
