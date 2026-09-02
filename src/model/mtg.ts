import { uid } from "@/lib/id";
import { fieldKeysOf } from "./normalize";
import { stockArt } from "./stockArt";
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
    vars: extra?.vars,
  };
}

function txt(style: Partial<Layer["style"]>): Layer["style"] {
  return {
    color: "#1a1408",
    fontSizeMm: 4,
    fontFamily: "Microsoft YaHei, sans-serif",
    align: "center",
    valign: "middle",
    ...style,
  };
}

function setOf(name: string, blueprint: Blueprint, cards: Card[]): CardSet {
  return {
    id: uid("set"),
    name,
    blueprintId: blueprint.id,
    cards,
    fieldKeys: fieldKeysOf(blueprint),
  };
}

function card(fields: Record<string, string>, qty = 1): Card {
  return { id: uid("card"), qty, fields };
}

function mtgBlueprint(size: SizeMm, name: string, backDefault: string): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name,
    size: { ...size },
    bleedMm: 3,
    cornerRadiusMm: 2.5,
    frontLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#1c1810" }, { locked: true }),
      ly(
        "rect",
        "框",
        { x: 2, y: 2, w: w - 4, h: h - 4 },
        { fill: "#5a4630", stroke: "#c9a227", strokeWidthMm: 0.55 },
        { locked: true, vars: { fill: "frame" } },
      ),
      ly("rect", "标题底", { x: 3.5, y: 3.5, w: w - 7, h: 9 }, { fill: "#d8c89a" }, { locked: true }),
      ly("text", "name", { x: 5, y: 4, w: w - 22, h: 8 }, txt({ fontSizeMm: 4.2, fontWeight: 700 }), {
        text: "林间狼",
        vars: { text: "name" },
      }),
      ly(
        "text",
        "mana",
        { x: w - 16, y: 4, w: 12, h: 8 },
        txt({ fontSizeMm: 3.6, fontWeight: 700, align: "right" }),
        { text: "1G", vars: { text: "mana" } },
      ),
      ly("rect", "插画框", { x: 4, y: 14, w: w - 8, h: 32 }, { fill: "#2a3540" }, { locked: true }),
      ly("image", "art", { x: 4, y: 14, w: w - 8, h: 32 }, { fit: "cover" }, { vars: { src: "art" } }),
      ly("rect", "类型底", { x: 3.5, y: 47, w: w - 7, h: 7 }, { fill: "#d8c89a" }, { locked: true }),
      ly("text", "type", { x: 5, y: 47.4, w: w - 10, h: 6.2 }, txt({ fontSizeMm: 3.1, fontWeight: 700 }), {
        text: "生物 — 狼",
        vars: { text: "type" },
      }),
      ly("rect", "文底", { x: 4, y: 55.5, w: w - 8, h: 24 }, { fill: "#efe4c4" }, { locked: true }),
      ly("text", "text", { x: 5.5, y: 56.5, w: w - 11, h: 22 }, txt({ fontSizeMm: 2.9, lineHeight: 1.3, valign: "middle" }), {
        text: "每当林间狼攻击时，你获得 1 点生命。",
        vars: { text: "text" },
      }),
      ly(
        "text",
        "pt",
        { x: w - 18, y: h - 10, w: 14, h: 7 },
        txt({ fontSizeMm: 3.4, fontWeight: 700, align: "center", background: "#d8c89a" }),
        { text: "2/2", vars: { text: "pt" } },
      ),
    ],
    backLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: backDefault }, { locked: true, vars: { fill: "backFill" } }),
      ly(
        "rect",
        "框",
        { x: 4, y: 4, w: w - 8, h: h - 8 },
        { fill: "#12101888", stroke: "#e8c547", strokeWidthMm: 1.2 },
        { locked: true },
      ),
      ly(
        "text",
        "backTitle",
        { x: 6, y: h / 2 - 8, w: w - 12, h: 16 },
        txt({ color: "#e8c547", fontSizeMm: 5.2, fontWeight: 700, align: "center" }),
        { text: name },
      ),
    ],
  };
}

const GW = "#2a5a38";
const WHITE = "#c9b48a";
const GREEN = "#3d6b3a";
const RED = "#8a3030";
const BLUE = "#2a4a78";

function gwCards(): Card[] {
  const back = "#1a3a24";
  return [
    card({ name: "林间狼", mana: "1G", type: "生物 — 狼", text: "每当林间狼攻击时，你获得 1 点生命。", pt: "2/2", frame: GREEN, backFill: back, art: stockArt("wolf-forest") }, 4),
    card({ name: "橡实卫士", mana: "2G", type: "生物 — 树人", text: "防御。进场时你获得 2 点生命。", pt: "3/3", frame: GREEN, backFill: back, art: stockArt("ancient-tree") }, 3),
    card({ name: "平原骑士", mana: "W", type: "生物 — 人类·骑士", text: "先攻。", pt: "2/1", frame: WHITE, backFill: back, art: stockArt("knight-plain") }, 4),
    card({ name: "治愈术", mana: "W", type: "瞬间", text: "目标永久物或牌手获得 3 点生命。", pt: "", frame: WHITE, backFill: back, art: stockArt("sunlight-heal") }, 3),
    card({ name: "阳光箭", mana: "2W", type: "瞬间", text: "放逐目标进行攻击的生物。", pt: "", frame: WHITE, backFill: back, art: stockArt("golden-arrow") }, 3),
    card({ name: "边境哨所", mana: "2GW", type: "生物 — 人类·斥候", text: "进场时抓一张牌。", pt: "2/3", frame: GW, backFill: back, art: stockArt("border-watch") }, 2),
    card({ name: "平原", mana: "", type: "基本地 — 平原", text: "{T}：加 {W}。", pt: "", frame: WHITE, backFill: back, art: stockArt("open-plain") }, 10),
    card({ name: "森林", mana: "", type: "基本地 — 森林", text: "{T}：加 {G}。", pt: "", frame: GREEN, backFill: back, art: stockArt("deep-forest") }, 10),
  ];
}

function urCards(): Card[] {
  const back = "#3a1028";
  return [
    card({ name: "火花冲击", mana: "R", type: "瞬间", text: "对任意目标造成 3 点伤害。", pt: "", frame: RED, backFill: back, art: stockArt("ember-burst") }, 4),
    card({ name: "反制咒", mana: "UU", type: "瞬间", text: "反击目标咒语。", pt: "", frame: BLUE, backFill: back, art: stockArt("counter-spell") }, 3),
    card({ name: "焰舌法师", mana: "1R", type: "生物 — 人类·法师", text: "进场时对任意目标造成 1 点伤害。", pt: "2/1", frame: RED, backFill: back, art: stockArt("fire-mage") }, 4),
    card({ name: "潮汐精灵", mana: "U", type: "生物 — 精灵", text: "飞行。", pt: "1/2", frame: BLUE, backFill: back, art: stockArt("tide-spirit") }, 4),
    card({ name: "闪电链", mana: "1R", type: "瞬间", text: "对目标生物造成 2 点伤害，再对另一目标造成 1 点。", pt: "", frame: RED, backFill: back, art: stockArt("lightning-chain") }, 3),
    card({ name: "思潮", mana: "1U", type: "法术", text: "抓两张牌。", pt: "", frame: BLUE, backFill: back, art: stockArt("ocean-tide") }, 2),
    card({ name: "山脉", mana: "", type: "基本地 — 山", text: "{T}：加 {R}。", pt: "", frame: RED, backFill: back, art: stockArt("red-mountain") }, 10),
    card({ name: "岛屿", mana: "", type: "基本地 — 岛", text: "{T}：加 {U}。", pt: "", frame: BLUE, backFill: back, art: stockArt("blue-island") }, 10),
  ];
}

export function buildMtgContent(size: SizeMm): { blueprints: Blueprint[]; sets: CardSet[] } {
  const gw = mtgBlueprint(size, "林间守护", "#1a3a24");
  const ur = mtgBlueprint(size, "火花对策", "#3a1028");
  return {
    blueprints: [gw, ur],
    sets: [setOf("预组 · 林间守护", gw, gwCards()), setOf("预组 · 火花对策", ur, urCards())],
  };
}
