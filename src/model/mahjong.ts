import { uid } from "@/lib/id";
import { fieldKeysOf } from "./normalize";
import type { Blueprint, Card, CardSet, Layer, SizeMm } from "./types";

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
    rotation: extra?.rotation,
    style,
    text: extra?.text,
  };
}

const SUITS = [
  { id: "wan", name: "万", color: "#c0392b" },
  { id: "tiao", name: "条", color: "#1e8449" },
  { id: "tong", name: "筒", color: "#1a5276" },
] as const;

const WINDS = ["东", "南", "西", "北"];
const DRAGONS = [
  { name: "中", color: "#c0392b" },
  { name: "发", color: "#1e8449" },
  { name: "白", color: "#2c3e50" },
];
const FLOWERS = ["春", "夏", "秋", "冬", "梅", "兰", "竹", "菊"];

export function buildMahjongContent(size: SizeMm): { blueprints: Blueprint[]; sets: CardSet[] } {
  const { w, h } = size;
  const bp: Blueprint = {
    id: uid("bp"),
    name: "麻将牌",
    size: { ...size },
    bleedMm: 3,
    cornerRadiusMm: 3,
    frontLayers: [
      ly("rect", "bg", { x: 0, y: 0, w, h }, { fill: "#f4efe4" }, { locked: true }),
      ly("rect", "frame", { x: 3, y: 3, w: w - 6, h: h - 6 }, { fill: "#fffaf0", stroke: "#1a1408", strokeWidthMm: 0.6 }),
      ly(
        "text",
        "rank",
        { x: 4, y: 5, w: w - 8, h: 22 },
        { color: "#1a1408", fontSizeMm: 16, fontWeight: 800, align: "center", valign: "middle", fontFamily: "Georgia, serif" },
        { text: "1" },
      ),
      ly(
        "text",
        "suit",
        { x: 4, y: h / 2 - 8, w: w - 8, h: 20 },
        { color: "#c0392b", fontSizeMm: 12, fontWeight: 700, align: "center", valign: "middle" },
        { text: "万" },
      ),
      ly(
        "text",
        "name",
        { x: 4, y: h - 16, w: w - 8, h: 10 },
        { color: "#5a5040", fontSizeMm: 3.2, align: "center", valign: "middle" },
        { text: "一万" },
      ),
    ],
    backLayers: [
      ly("rect", "bg", { x: 0, y: 0, w, h }, { fill: "#1a4a32" }, { locked: true }),
      ly(
        "text",
        "backTitle",
        { x: 4, y: h / 2 - 8, w: w - 8, h: 16 },
        { color: "#d6ff3c", fontSizeMm: 7, fontWeight: 700, align: "center", valign: "middle" },
        { text: "麻将" },
      ),
    ],
  };

  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (let n = 1; n <= 9; n++) {
      cards.push({
        id: uid("card"),
        qty: 4,
        fields: { rank: String(n), suit: suit.name, name: `${n}${suit.name}`, color: suit.color },
      });
    }
  }
  for (const wind of WINDS) {
    cards.push({ id: uid("card"), qty: 4, fields: { rank: wind, suit: "风", name: `${wind}风`, color: "#1a1408" } });
  }
  for (const d of DRAGONS) {
    cards.push({ id: uid("card"), qty: 4, fields: { rank: d.name, suit: "箭", name: d.name, color: d.color } });
  }
  const flowers: Card[] = FLOWERS.map((name) => ({
    id: uid("card"),
    qty: 1,
    fields: { rank: name, suit: "花", name, color: "#8e44ad" },
  }));

  return {
    blueprints: [bp],
    sets: [
      {
        id: uid("set"),
        name: "麻将 136",
        blueprintId: bp.id,
        cards,
        fieldKeys: fieldKeysOf(bp),
      },
      {
        id: uid("set"),
        name: "花牌",
        blueprintId: bp.id,
        cards: flowers,
        fieldKeys: fieldKeysOf(bp),
      },
    ],
  };
}
