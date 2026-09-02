import { uid } from "@/lib/id";
import { fieldKeysOf } from "./normalize";
import type { Blueprint, Card, CardSet, Layer, SizeMm } from "./types";

const FRUITS = [
  { id: "草莓", emoji: "🍓", fill: "#c0392b" },
  { id: "香蕉", emoji: "🍌", fill: "#d4a017" },
  { id: "柠檬", emoji: "🍋", fill: "#e6e05a" },
  { id: "李子", emoji: "🫐", fill: "#6d28d9" },
] as const;

/** 标准 56 张：每水果 1×5、2×3、3×3、4×2、5×1 */
const COUNTS: { n: number; qty: number }[] = [
  { n: 1, qty: 5 },
  { n: 2, qty: 3 },
  { n: 3, qty: 3 },
  { n: 4, qty: 2 },
  { n: 5, qty: 1 },
];

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
  };
}

function fruitBlueprint(size: SizeMm): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name: "哈铃果铃",
    size: { ...size },
    bleedMm: 2,
    cornerRadiusMm: 5,
    frontLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#f7f1df" }, { locked: true }),
      ly("rect", "卡面", { x: 2, y: 2, w: w - 4, h: h - 4 }, { fill: "#fffaf0", stroke: "#c0392b", strokeWidthMm: 0.5 }, { locked: true }),
      ly(
        "text",
        "fruit",
        { x: 4, y: 16, w: w - 8, h: h - 28 },
        { color: "#c0392b", fontSizeMm: 18, align: "center", valign: "middle" },
        { text: "🍓🍓" },
      ),
      ly(
        "text",
        "name",
        { x: 3, y: 3, w: w - 6, h: 8 },
        { color: "#7a2a20", fontSizeMm: 4, fontWeight: 700, align: "center", valign: "middle" },
        { text: "草莓 ×2" },
      ),
    ],
    backLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#7a2a20" }, { locked: true }),
      ly(
        "text",
        "backTitle",
        { x: 4, y: h / 2 - 8, w: w - 8, h: 16 },
        { color: "#f7e27a", fontSizeMm: 6, fontWeight: 800, align: "center", valign: "middle" },
        { text: "哈铃果铃" },
      ),
    ],
  };
}

function bellBlueprint(size: SizeMm): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name: "铃铛",
    size: { ...size },
    bleedMm: 2,
    cornerRadiusMm: 8,
    frontLayers: [
      ly("rect", "底", { x: -2, y: -2, w: w + 4, h: h + 4 }, { fill: "#f2d36b" }, { locked: true }),
      ly(
        "text",
        "name",
        { x: 2, y: h / 2 - 10, w: w - 4, h: 20 },
        { color: "#3a2a08", fontSizeMm: 16, align: "center", valign: "middle" },
        { text: "🔔" },
      ),
    ],
    backLayers: [
      ly("rect", "底", { x: 0, y: 0, w, h }, { fill: "#d4a017" }, { locked: true }),
      ly("text", "backTitle", { x: 2, y: h / 2 - 6, w: w - 4, h: 12 }, { color: "#3a2a08", fontSizeMm: 5, align: "center", valign: "middle" }, { text: "铃" }),
    ],
  };
}

export function buildHalliGalliContent(size: SizeMm): { blueprints: Blueprint[]; sets: CardSet[] } {
  const fruitBp = fruitBlueprint(size);
  const bellBp = bellBlueprint({ w: 50, h: 50 });
  const cards: Card[] = [];
  for (const fruit of FRUITS) {
    for (const { n, qty } of COUNTS) {
      cards.push({
        id: uid("card"),
        qty,
        fields: {
          name: `${fruit.id} ×${n}`,
          fruit: fruit.emoji.repeat(n),
          color: fruit.id,
        },
      });
    }
  }
  return {
    blueprints: [fruitBp, bellBp],
    sets: [
      {
        id: uid("set"),
        name: "果牌",
        blueprintId: fruitBp.id,
        cards,
        fieldKeys: fieldKeysOf(fruitBp),
      },
      {
        id: uid("set"),
        name: "铃铛",
        blueprintId: bellBp.id,
        cards: [{ id: uid("card"), qty: 1, fields: { name: "铃铛" } }],
        fieldKeys: fieldKeysOf(bellBp),
      },
    ],
  };
}
