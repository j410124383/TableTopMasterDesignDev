import { uid } from "@/lib/id";
import { TABLE } from "./playTable";
import {
  CHIP_COLORS,
  CHIP_VALUES,
  CUBE_COLORS,
  type PlayProp,
  type PlayPropKind,
} from "./playTypes";

export const PROP_SIZE: Record<PlayPropKind, { w: number; h: number }> = {
  d6: { w: 56, h: 56 },
  d20: { w: 64, h: 64 },
  timer: { w: 132, h: 88 },
  note: { w: 168, h: 140 },
  cube: { w: 32, h: 32 },
  treasure: { w: 40, h: 52 },
  meeple: { w: 40, h: 52 },
  life: { w: 88, h: 56 },
  calc: { w: 168, h: 228 },
  chip: { w: 46, h: 46 },
  textbox: { w: 200, h: 52 },
};

export const PROP_TOOLS: { kind: PlayPropKind; name: string; hint: string; extra?: Partial<PlayProp> }[] = [
  { kind: "d6", name: "六面骰", hint: "拖到桌上，单击掷骰" },
  { kind: "d20", name: "二十面骰", hint: "拖到桌上，单击掷骰" },
  { kind: "timer", name: "计时器", hint: "拖到桌上" },
  { kind: "note", name: "桌面便签", hint: "拖到桌上给大家看" },
  { kind: "cube", name: "指示物", hint: "拖到桌上，右键改形状和颜色" },
  { kind: "meeple", name: "米宝", hint: "拖到桌上" },
  { kind: "life", name: "生命", hint: "拖到桌上" },
  { kind: "calc", name: "计算器", hint: "拖到桌上" },
  { kind: "chip", name: "筹码 10", hint: "拖到桌上", extra: { value: 10 } },
  { kind: "chip", name: "筹码 50", hint: "拖到桌上", extra: { value: 50 } },
  { kind: "chip", name: "筹码 100", hint: "拖到桌上", extra: { value: 100 } },
  { kind: "chip", name: "筹码 500", hint: "拖到桌上", extra: { value: 500 } },
  { kind: "chip", name: "筹码 1000", hint: "拖到桌上", extra: { value: 1000 } },
];

export const PROP_GROUPS: { id: string; name: string; items: typeof PROP_TOOLS }[] = [
  { id: "dice", name: "骰子", items: PROP_TOOLS.filter((t) => t.kind === "d6" || t.kind === "d20") },
  { id: "chip", name: "筹码", items: PROP_TOOLS.filter((t) => t.kind === "chip") },
  { id: "token", name: "指示物", items: PROP_TOOLS.filter((t) => t.kind === "cube" || t.kind === "meeple") },
  {
    id: "desk",
    name: "桌面用具",
    items: PROP_TOOLS.filter((t) => t.kind === "timer" || t.kind === "note" || t.kind === "life" || t.kind === "calc"),
  },
];

export function propBox(prop: PlayProp): { w: number; h: number } {
  const kind = prop.kind === "treasure" ? "meeple" : prop.kind;
  const sz = PROP_SIZE[kind] ?? PROP_SIZE.cube;
  const s = Math.min(2.8, Math.max(0.45, prop.scale ?? 1));
  return { w: Math.round(sz.w * s), h: Math.round(sz.h * s) };
}

export function spawnProp(kind: PlayPropKind, index = 0, extra?: Partial<PlayProp>): PlayProp {
  const id = uid("prop");
  const x = TABLE.w * 0.42 + (index % 4) * 36;
  const y = TABLE.h * 0.42 + Math.floor(index / 4) * 36;
  const base: PlayProp = { id, kind, x, y, z: 40 + index, ...extra };
  if (kind === "d6" || kind === "d20") return { ...base, value: extra?.value ?? 1 };
  if (kind === "timer") return { ...base, value: extra?.value ?? 60, running: false };
  if (kind === "note") return { ...base, text: extra?.text ?? "", label: extra?.label ?? "便签", fontSize: extra?.fontSize ?? 13, scale: extra?.scale ?? 1 };
  if (kind === "cube") {
    return {
      ...base,
      color: extra?.color ?? "#ff3b3b",
      shape: extra?.shape ?? "square",
      label: extra?.label ?? "",
    };
  }
  if (kind === "life") return { ...base, value: extra?.value ?? 20, label: extra?.label ?? "生命" };
  if (kind === "meeple" || kind === "treasure") {
    return { ...base, kind: "meeple", color: extra?.color ?? CUBE_COLORS[index % CUBE_COLORS.length], label: extra?.label ?? "米宝" };
  }
  if (kind === "calc") return { ...base, text: extra?.text ?? "0", label: extra?.label ?? "" };
  if (kind === "chip") {
    const value = extra?.value ?? CHIP_VALUES[index % CHIP_VALUES.length];
    return { ...base, value, color: CHIP_COLORS[value] ?? "#d4d4d8", label: String(value) };
  }
  if (kind === "textbox") {
    return { ...base, text: extra?.text ?? "文本", color: extra?.color ?? "#f4f4f0", fontSize: extra?.fontSize ?? 18 };
  }
  return base;
}

export function timerRemain(prop: PlayProp, now = Date.now()) {
  if (prop.kind !== "timer") return 0;
  if (prop.running && prop.endsAt) return Math.max(0, Math.ceil((prop.endsAt - now) / 1000));
  return Math.max(0, prop.value ?? 0);
}

export function formatMmSs(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function rollDie(sides: number) {
  return 1 + Math.floor(Math.random() * sides);
}

export function calcPress(display: string, key: string): string {
  const cur = display === "错误" ? "0" : display;
  if (key === "C") return "0";
  if (key === "⌫") return cur.length <= 1 ? "0" : cur.slice(0, -1);
  if (key === "=") {
    try {
      if (!/^[\d.+\-*/() ]+$/.test(cur)) return "错误";
      const n = Function(`"use strict"; return (${cur})`)() as number;
      if (!Number.isFinite(n)) return "错误";
      return String(Math.round(n * 1000) / 1000);
    } catch {
      return "错误";
    }
  }
  if (cur === "0" && /[0-9.]/.test(key)) return key;
  return cur + key;
}
