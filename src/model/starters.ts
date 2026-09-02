import { uid } from "@/lib/id";
import { fieldKeysOf } from "./normalize";
import { buildHalliGalliContent } from "./halligalli";
import { buildMahjongContent } from "./mahjong";
import { createPokerBlueprint, createPokerCards, POKER_FIELD_KEYS } from "./pokerTemplate";
import { buildSanguoshaContent } from "./sanguosha";
import { buildMtgContent } from "./mtg";
import { buildUnoContent } from "./uno";
import { DEFAULT_CARD_SIZE } from "./sizes";
import { stockArt } from "./stockArt";
import type { Blueprint, Card, CardSet, Layer, SizeMm } from "./types";

export type StarterId = "empty" | "poker" | "sanguosha" | "mtg" | "pokemon" | "mahjong" | "uno" | "halligalli";

export type StarterInfo = {
  id: StarterId;
  name: string;
  desc: string;
  size: SizeMm;
};

export const STARTER_TEMPLATES: StarterInfo[] = [
  { id: "empty", name: "空白", desc: "空蓝图，自己搭版式", size: DEFAULT_CARD_SIZE },
  { id: "poker", name: "扑克牌", desc: "54 张标准扑克", size: { w: 63.5, h: 88.9 } },
  { id: "sanguosha", name: "三国杀", desc: "标准包 108 张、25 武将、身份与勾玉", size: { w: 63.5, h: 88.9 } },
  { id: "mtg", name: "万智牌", desc: "两副预组：林间守护（绿白）与火花对策（红蓝）", size: { w: 63.5, h: 88.9 } },
  { id: "pokemon", name: "宝可梦卡牌", desc: "宝可梦卡框与示例宝可梦", size: { w: 63.5, h: 88.9 } },
  { id: "mahjong", name: "麻将", desc: "136 张麻将 + 花牌，以卡牌形式", size: { w: 50, h: 70 } },
  { id: "uno", name: "UNO", desc: "标准 108 张：四色数字、功能牌与万能牌", size: { w: 63.5, h: 88.9 } },
  { id: "halligalli", name: "哈铃果铃", desc: "56 张水果牌 + 铃铛，比谁先抢铃", size: { w: 63.5, h: 88.9 } },
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
    rotation: extra?.rotation,
    style,
    text: extra?.text,
    vars: extra?.vars,
  };
}

function txt(
  style: Partial<Layer["style"]>,
  extra?: { align?: Layer["style"]["align"]; valign?: Layer["style"]["valign"] },
): Layer["style"] {
  return {
    color: "#f4f1e8",
    fontSizeMm: 4,
    fontFamily: "Microsoft YaHei, sans-serif",
    align: extra?.align ?? "center",
    valign: extra?.valign ?? "middle",
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

export function emptyBlueprint(size: SizeMm): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name: "默认蓝图",
    size: { ...size },
    bleedMm: 3,
    cornerRadiusMm: 3,
    frontLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#1b2434" }, { locked: true }),
      ly("text", "name", { x: 5, y: 6, w: w - 10, h: 12 }, txt({ fontSizeMm: 5.5, fontWeight: 700, align: "center" }), {
        text: "卡名",
        vars: { text: "name" },
      }),
      ly("text", "text", { x: 6, y: 24, w: w - 12, h: h - 32 }, txt({ fontSizeMm: 3.4, lineHeight: 1.35 }), {
        text: "在这里写蓝图默认文案。\n右键属性「转为变量」后才会进数据集。",
        vars: { text: "text" },
      }),
    ],
    backLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#141820" }, { locked: true }),
      ly(
        "text",
        "backTitle",
        { x: 6, y: h / 2 - 8, w: w - 12, h: 16 },
        txt({ color: "#c9a227", fontSizeMm: 5, fontWeight: 700, align: "center", valign: "middle" }),
        { text: "卡背" },
      ),
    ],
  };
}

function pokemonBlueprint(size: SizeMm): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name: "宝可梦",
    size: { ...size },
    bleedMm: 3,
    cornerRadiusMm: 3,
    frontLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#f2d36b" }, { locked: true }),
      ly(
        "rect",
        "框",
        { x: 2, y: 2, w: w - 4, h: h - 4 },
        { fill: "#fff8dc", stroke: "#d4a017", strokeWidthMm: 0.7 },
        { locked: true },
      ),
      ly("text", "name", { x: 5, y: 4, w: w - 24, h: 8 }, txt({ color: "#1a1a1a", fontSizeMm: 4.6, fontWeight: 700 }), {
        text: "小火龙",
      }),
      ly(
        "text",
        "hp",
        { x: w - 20, y: 4, w: 16, h: 8 },
        txt({ color: "#c0392b", fontSizeMm: 4, fontWeight: 700, align: "right" }),
        { text: "70 HP" },
      ),
      ly("rect", "插画框", { x: 5, y: 14, w: w - 10, h: 28 }, { fill: "#7ec8e3" }, { locked: true }),
      ly("image", "art", { x: 5, y: 14, w: w - 10, h: 28 }, { fit: "cover" }, { vars: { src: "art" } }),
      ly(
        "text",
        "ptype",
        { x: 5, y: 43.5, w: w - 10, h: 6 },
        txt({ color: "#8a4b12", fontSizeMm: 2.8, fontWeight: 700 }),
        { text: "火属性 · 基本宝可梦" },
      ),
      ly("text", "attack", { x: 5, y: 51, w: w - 22, h: 7 }, txt({ color: "#1a1a1a", fontSizeMm: 3.6, fontWeight: 700 }), {
        text: "火花",
      }),
      ly(
        "text",
        "damage",
        { x: w - 16, y: 51, w: 12, h: 7 },
        txt({ color: "#1a1a1a", fontSizeMm: 4, fontWeight: 700, align: "right" }),
        { text: "30" },
      ),
      ly(
        "text",
        "text",
        { x: 5, y: 59, w: w - 10, h: h - 66 },
        txt({ color: "#333", fontSizeMm: 2.9, lineHeight: 1.3 }),
        { text: "造成 30 点伤害。若对方是草属性，再加 10 点。" },
      ),
    ],
    backLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#1e3a6e" }, { locked: true }),
      ly(
        "rect",
        "框",
        { x: 4, y: 4, w: w - 8, h: h - 8 },
        { fill: "#2a4a8a", stroke: "#f2d36b", strokeWidthMm: 1 },
        { locked: true },
      ),
      ly(
        "text",
        "backTitle",
        { x: 6, y: h / 2 - 8, w: w - 12, h: 16 },
        txt({ color: "#f2d36b", fontSizeMm: 5.2, fontWeight: 700, align: "center", valign: "middle" }),
        { text: "宝可梦" },
      ),
    ],
  };
}

export function buildStarterContent(
  starter: StarterId,
  size: SizeMm,
  projectName: string,
): { blueprints: Blueprint[]; sets: CardSet[]; assets?: Record<string, string> } {
  if (starter === "poker") {
    const blueprint = createPokerBlueprint(size, "扑克");
    return {
      blueprints: [blueprint],
      sets: [
        {
          id: uid("set"),
          name: "一副扑克",
          blueprintId: blueprint.id,
          cards: createPokerCards(projectName),
          fieldKeys: [...POKER_FIELD_KEYS],
        },
      ],
    };
  }

  if (starter === "sanguosha") {
    return buildSanguoshaContent(size);
  }

  if (starter === "mahjong") {
    return buildMahjongContent({ w: 50, h: 70 });
  }

  if (starter === "uno") {
    return buildUnoContent(size);
  }

  if (starter === "halligalli") {
    return buildHalliGalliContent(size);
  }

  if (starter === "mtg") {
    return buildMtgContent(size);
  }

  if (starter === "pokemon") {
    const bp = pokemonBlueprint(size);
    return {
      blueprints: [bp],
      sets: [
        setOf("牌组", bp, [
          card({ name: "小火龙", hp: "70 HP", ptype: "火属性 · 基本宝可梦", attack: "火花", damage: "30", text: "造成 30 点伤害。", art: stockArt("charmander-flame") }),
          card({ name: "杰尼龟", hp: "70 HP", ptype: "水属性 · 基本宝可梦", attack: "水枪", damage: "20", text: "造成 20 点伤害，对方下回合攻击 -10。", art: stockArt("squirtle-water") }),
          card({ name: "妙蛙种子", hp: "70 HP", ptype: "草属性 · 基本宝可梦", attack: "藤鞭", damage: "20", text: "造成 20 点伤害，你回复 10 HP。", art: stockArt("bulbasaur-leaf") }),
          card({ name: "皮卡丘", hp: "60 HP", ptype: "电属性 · 基本宝可梦", attack: "电击", damage: "40", text: "掷一枚硬币，正面则对方无法攻击。", art: stockArt("pikachu-spark") }),
        ]),
      ],
    };
  }

  const blueprint = emptyBlueprint(size);
  return {
    blueprints: [blueprint],
    sets: [
      {
        id: uid("set"),
        name: "卡牌集",
        blueprintId: blueprint.id,
        cards: [card({ name: "", text: "", backTitle: "" })],
        fieldKeys: fieldKeysOf(blueprint),
      },
    ],
  };
}
