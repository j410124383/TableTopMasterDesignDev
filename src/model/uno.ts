import { uid } from "@/lib/id";
import { fieldKeysOf } from "./normalize";
import type { Blueprint, Card, CardSet, Layer, SizeMm } from "./types";

const COLORS = [
  { id: "红", fill: "#c0392b", ink: "#fff8f4" },
  { id: "黄", fill: "#d4a017", ink: "#1a1408" },
  { id: "绿", fill: "#1e8a4c", ink: "#f4fff8" },
  { id: "蓝", fill: "#1d4ed8", ink: "#f4f8ff" },
] as const;

function ly(
  type: Layer["type"],
  name: string,
  box: { x: number; y: number; w: number; h: number },
  style: Layer["style"],
  extra?: Partial<Layer>,
): Layer {
  return {
    id: uid("ly"),
    type,
    name,
    ...box,
    visible: true,
    locked: extra?.locked ?? false,
    style,
    text: extra?.text,
    vars: extra?.vars,
    repeatPerRow: extra?.repeatPerRow,
  };
}

function unoBlueprint(size: SizeMm): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name: "UNO",
    size: { ...size },
    bleedMm: 2,
    cornerRadiusMm: 4,
    frontLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#111114" }, { locked: true }),
      ly("rect", "色块", { x: 2, y: 2, w: w - 4, h: h - 4 }, { fill: "#c0392b" }, { locked: true, vars: { fill: "fill" } }),
      ly(
        "rect",
        "椭圆",
        { x: 10, y: 16, w: w - 20, h: h - 32 },
        { fill: "#f4f1e8" },
        { locked: true },
      ),
      ly(
        "text",
        "face",
        { x: 4, y: h / 2 - 14, w: w - 8, h: 28 },
        { color: "#c0392b", fontSizeMm: 14, fontWeight: 800, align: "center", valign: "middle", fontFamily: "Arial Black, sans-serif" },
        { text: "5", vars: { text: "face", color: "ink" } },
      ),
      ly(
        "text",
        "color",
        { x: 3, y: 3, w: 18, h: 7 },
        { color: "#fff8f4", fontSizeMm: 3.6, fontWeight: 700, align: "left", valign: "middle" },
        { text: "红", vars: { text: "color" } },
      ),
    ],
    backLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#111114" }, { locked: true }),
      ly("rect", "框", { x: 3, y: 3, w: w - 6, h: h - 6 }, { fill: "#1a1a22", stroke: "#d6ff3c", strokeWidthMm: 0.6 }, { locked: true }),
      ly(
        "text",
        "backTitle",
        { x: 4, y: h / 2 - 8, w: w - 8, h: 16 },
        { color: "#d6ff3c", fontSizeMm: 8, fontWeight: 800, align: "center", valign: "middle" },
        { text: "UNO" },
      ),
    ],
  };
}

function card(color: string, face: string, fill: string, ink: string, qty = 1): Card {
  return { id: uid("card"), qty, fields: { name: `${color}${face}`, color, face, fill, ink } };
}

export function buildUnoContent(size: SizeMm): { blueprints: Blueprint[]; sets: CardSet[] } {
  const bp = unoBlueprint(size);
  const cards: Card[] = [];
  for (const c of COLORS) {
    cards.push(card(c.id, "0", c.fill, c.ink, 1));
    for (const n of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "跳过", "回转", "+2"]) {
      cards.push(card(c.id, n, c.fill, c.ink, 2));
    }
  }
  cards.push(card("万能", "变色", "#1a1a22", "#d6ff3c", 4));
  cards.push(card("万能", "+4", "#111114", "#ff8a3c", 4));
  return {
    blueprints: [bp],
    sets: [
      {
        id: uid("set"),
        name: "UNO 牌堆",
        blueprintId: bp.id,
        cards,
        fieldKeys: fieldKeysOf(bp),
      },
    ],
  };
}
