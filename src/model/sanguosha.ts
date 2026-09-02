import { uid } from "@/lib/id";
import { fieldKeysOf } from "./normalize";
import type { Blueprint, Card, CardSet, Layer, Project, SizeMm } from "./types";

export const SGS_TOKEN_SIZE: SizeMm = { w: 70, h: 24 };

const NATION_FILL: Record<string, string> = {
  魏: "#1d4e89",
  蜀: "#9b1b1b",
  吴: "#1b7a3c",
  群: "#f2efe6",
};

const ROLE_FILL: Record<string, string> = {
  主公: "#c9a227",
  忠臣: "#c0392b",
  反贼: "#2c4a7c",
  内奸: "#2d6a4f",
};

const JADE_ON = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100">
  <defs>
    <radialGradient id="a" cx="34%" cy="28%">
      <stop offset="0%" stop-color="#ff8a82"/>
      <stop offset="42%" stop-color="#d4242c"/>
      <stop offset="100%" stop-color="#6a1014"/>
    </radialGradient>
  </defs>
  <path fill="url(#a)" stroke="#e6c25a" stroke-width="2.4" d="M43 5c23 2 33 29 22 54-8 19-15 27-17 39-3-11-23-17-29-42C13 28 24 4 43 5z"/>
  <circle cx="47" cy="27" r="7.2" fill="#2a0c10"/>
  <ellipse cx="33" cy="18" rx="10" ry="5.2" fill="#fff" opacity=".3"/>
</svg>`.trim());

const JADE_OFF = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100">
  <defs>
    <radialGradient id="b" cx="34%" cy="28%">
      <stop offset="0%" stop-color="#c8b8a0"/>
      <stop offset="50%" stop-color="#6a6054"/>
      <stop offset="100%" stop-color="#2e2a24"/>
    </radialGradient>
  </defs>
  <path fill="url(#b)" stroke="#8a7a58" stroke-width="2.4" d="M43 5c23 2 33 29 22 54-8 19-15 27-17 39-3-11-23-17-29-42C13 28 24 4 43 5z"/>
  <circle cx="47" cy="27" r="7.2" fill="#1a1612"/>
  <ellipse cx="33" cy="18" rx="10" ry="5.2" fill="#fff" opacity=".12"/>
</svg>`.trim());

export const SGS_JADE_ASSETS: Record<string, string> = {
  "hp-jade": `data:image/svg+xml;charset=utf-8,${JADE_ON}`,
  "hp-jade-lost": `data:image/svg+xml;charset=utf-8,${JADE_OFF}`,
};

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
    repeatPerRow: extra?.repeatPerRow,
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

const TEXTS: Record<string, string> = {
  杀: "出牌阶段，对攻击范围内的一名角色使用。目标需打出【闪】，否则受到 1 点伤害。",
  闪: "当你成为【杀】的目标时，可打出此牌抵消之。",
  桃: "出牌阶段对自己使用，或角色濒死时对其使用，回复 1 点体力。",
  过河拆桥: "弃置目标角色区域内的一张牌。",
  顺手牵羊: "获得距离 1 以内一名角色区域内的一张牌。",
  无中生有: "摸两张牌。",
  决斗: "目标与你轮流打出【杀】，先无法打出者受到 1 点伤害。",
  借刀杀人: "令装备武器的角色对你指定的另一名角色使用【杀】；若其不使用，将该武器交给你。",
  无懈可击: "抵消目标锦囊牌对一名角色产生的效果。",
  南蛮入侵: "其他角色需打出一张【杀】，否则受到 1 点伤害。",
  万箭齐发: "其他角色需打出一张【闪】，否则受到 1 点伤害。",
  桃园结义: "所有角色各回复 1 点体力。",
  五谷丰登: "亮出牌堆顶等同角色数的牌，从你开始各选一张。",
  乐不思蜀: "判定阶段：若结果不为红桃，跳过出牌阶段。",
  闪电: "判定阶段：若为黑桃 2–9，受到 3 点雷电伤害，否则移给下家。",
  诸葛连弩: "武器 · 攻击范围 1。出牌阶段使用【杀】无次数限制。",
  雌雄双股剑: "武器 · 攻击范围 2。对异性角色使用【杀】指定目标后，可令其选：弃一张手牌，或让你摸一张牌。",
  青釭剑: "武器 · 攻击范围 2。你的【杀】无视目标防具。",
  青龙偃月刀: "武器 · 攻击范围 3。【杀】被【闪】抵消后，可再对同一目标使用一张【杀】。",
  丈八蛇矛: "武器 · 攻击范围 3。可将两张手牌当【杀】使用或打出。",
  贯石斧: "武器 · 攻击范围 3。【杀】被【闪】抵消后，可弃两张牌令此【杀】仍造成伤害。",
  方天画戟: "武器 · 攻击范围 4。手牌数等于 1 时，使用【杀】可指定至多三名目标。",
  麒麟弓: "武器 · 攻击范围 5。【杀】造成伤害时，可弃置目标的一张坐骑牌。",
  寒冰剑: "武器 · 攻击范围 2。【杀】造成伤害时，可改为弃置目标两张牌。",
  八卦阵: "防具。需要使用或打出【闪】时，可判定：红色则视为打出【闪】。",
  仁王盾: "防具。黑色【杀】对你无效。",
  绝影: "+1 坐骑。其他角色计算与你的距离 +1。",
  爪黄飞电: "+1 坐骑。其他角色计算与你的距离 +1。",
  的卢: "+1 坐骑。其他角色计算与你的距离 +1。",
  赤兔: "−1 坐骑。你计算与其他角色的距离 −1。",
  大宛: "−1 坐骑。你计算与其他角色的距离 −1。",
  紫骍: "−1 坐骑。你计算与其他角色的距离 −1。",
};

function kindOf(name: string): string {
  if (name === "杀" || name === "闪" || name === "桃") return "基本牌";
  if (
    [
      "诸葛连弩",
      "雌雄双股剑",
      "青釭剑",
      "青龙偃月刀",
      "丈八蛇矛",
      "贯石斧",
      "方天画戟",
      "麒麟弓",
      "寒冰剑",
      "八卦阵",
      "仁王盾",
      "绝影",
      "爪黄飞电",
      "的卢",
      "赤兔",
      "大宛",
      "紫骍",
    ].includes(name)
  ) {
    return "装备牌";
  }
  return "锦囊牌";
}

/** 标准包 108 张：每花色 27 张（含 1 张 EX）。来源：标准包牌表。 */
const DECK_ROWS: Array<[string, string, string]> = [
  ["♥", "A", "桃园结义"],
  ["♥", "A", "万箭齐发"],
  ["♥", "2", "闪"],
  ["♥", "2", "闪"],
  ["♥", "3", "桃"],
  ["♥", "3", "五谷丰登"],
  ["♥", "4", "桃"],
  ["♥", "4", "五谷丰登"],
  ["♥", "5", "麒麟弓"],
  ["♥", "5", "赤兔"],
  ["♥", "6", "桃"],
  ["♥", "6", "乐不思蜀"],
  ["♥", "7", "桃"],
  ["♥", "7", "无中生有"],
  ["♥", "8", "桃"],
  ["♥", "8", "无中生有"],
  ["♥", "9", "桃"],
  ["♥", "9", "无中生有"],
  ["♥", "10", "杀"],
  ["♥", "10", "杀"],
  ["♥", "J", "杀"],
  ["♥", "J", "无中生有"],
  ["♥", "Q", "桃"],
  ["♥", "Q", "过河拆桥"],
  ["♥", "Q", "闪电"],
  ["♥", "K", "闪"],
  ["♥", "K", "爪黄飞电"],
  ["♠", "A", "决斗"],
  ["♠", "A", "闪电"],
  ["♠", "2", "雌雄双股剑"],
  ["♠", "2", "八卦阵"],
  ["♠", "2", "寒冰剑"],
  ["♠", "3", "过河拆桥"],
  ["♠", "3", "顺手牵羊"],
  ["♠", "4", "过河拆桥"],
  ["♠", "4", "顺手牵羊"],
  ["♠", "5", "青龙偃月刀"],
  ["♠", "5", "绝影"],
  ["♠", "6", "乐不思蜀"],
  ["♠", "6", "青釭剑"],
  ["♠", "7", "杀"],
  ["♠", "7", "南蛮入侵"],
  ["♠", "8", "杀"],
  ["♠", "8", "杀"],
  ["♠", "9", "杀"],
  ["♠", "9", "杀"],
  ["♠", "10", "杀"],
  ["♠", "10", "杀"],
  ["♠", "J", "顺手牵羊"],
  ["♠", "J", "无懈可击"],
  ["♠", "Q", "过河拆桥"],
  ["♠", "Q", "丈八蛇矛"],
  ["♠", "K", "南蛮入侵"],
  ["♠", "K", "大宛"],
  ["♦", "A", "诸葛连弩"],
  ["♦", "A", "决斗"],
  ["♦", "2", "闪"],
  ["♦", "2", "闪"],
  ["♦", "3", "闪"],
  ["♦", "3", "顺手牵羊"],
  ["♦", "4", "闪"],
  ["♦", "4", "顺手牵羊"],
  ["♦", "5", "闪"],
  ["♦", "5", "贯石斧"],
  ["♦", "6", "杀"],
  ["♦", "6", "闪"],
  ["♦", "7", "杀"],
  ["♦", "7", "闪"],
  ["♦", "8", "杀"],
  ["♦", "8", "闪"],
  ["♦", "9", "杀"],
  ["♦", "9", "闪"],
  ["♦", "10", "杀"],
  ["♦", "10", "闪"],
  ["♦", "J", "闪"],
  ["♦", "J", "闪"],
  ["♦", "Q", "桃"],
  ["♦", "Q", "方天画戟"],
  ["♦", "Q", "无懈可击"],
  ["♦", "K", "杀"],
  ["♦", "K", "紫骍"],
  ["♣", "A", "决斗"],
  ["♣", "A", "诸葛连弩"],
  ["♣", "2", "杀"],
  ["♣", "2", "八卦阵"],
  ["♣", "2", "仁王盾"],
  ["♣", "3", "杀"],
  ["♣", "3", "过河拆桥"],
  ["♣", "4", "杀"],
  ["♣", "4", "过河拆桥"],
  ["♣", "5", "杀"],
  ["♣", "5", "的卢"],
  ["♣", "6", "杀"],
  ["♣", "6", "乐不思蜀"],
  ["♣", "7", "杀"],
  ["♣", "7", "南蛮入侵"],
  ["♣", "8", "杀"],
  ["♣", "8", "杀"],
  ["♣", "9", "杀"],
  ["♣", "9", "杀"],
  ["♣", "10", "杀"],
  ["♣", "10", "杀"],
  ["♣", "J", "杀"],
  ["♣", "J", "杀"],
  ["♣", "Q", "借刀杀人"],
  ["♣", "Q", "无懈可击"],
  ["♣", "K", "借刀杀人"],
  ["♣", "K", "无懈可击"],
];

const GENERALS: Array<{ name: string; nation: string; hp: string; title: string; text: string }> = [
  { name: "曹操", nation: "魏", hp: "4", title: "魏武帝", text: "奸雄：受到伤害后，获得造成伤害的牌。" },
  { name: "司马懿", nation: "魏", hp: "3", title: "狼顾之鬼", text: "反馈：受到伤害后可获得伤害来源一张牌。鬼才：其他角色判定时，可用一张手牌替换判定牌。" },
  { name: "夏侯惇", nation: "魏", hp: "4", title: "独眼的罗刹", text: "刚烈：受到伤害后可判定，若不为红桃则伤害来源弃两张牌或受到 1 点伤害。" },
  { name: "张辽", nation: "魏", hp: "4", title: "前将军", text: "突袭：摸牌阶段可少摸任意张，改为获得等量其他角色各一张手牌。" },
  { name: "许褚", nation: "魏", hp: "4", title: "虎痴", text: "裸衣：摸牌阶段可少摸一张，本回合【杀】【决斗】伤害 +1。" },
  { name: "郭嘉", nation: "魏", hp: "3", title: "早终的奇士", text: "天妒：判定牌生效后可获得之。遗计：受到 1 点伤害后可观看牌堆顶两张，交给任意角色。" },
  { name: "甄姬", nation: "魏", hp: "3", title: "薄幸的美人", text: "倾国：黑色牌可当【闪】。洛神：准备阶段可判定，黑色则获得并重复。" },
  { name: "刘备", nation: "蜀", hp: "4", title: "乱世的枭雄", text: "仁德：出牌阶段可将任意张手牌交给其他角色；若给出第二张，回复 1 点体力。" },
  { name: "关羽", nation: "蜀", hp: "4", title: "美髯公", text: "武圣：红色牌可当【杀】使用或打出。" },
  { name: "张飞", nation: "蜀", hp: "4", title: "万夫不当", text: "咆哮：出牌阶段使用【杀】无次数限制。" },
  { name: "诸葛亮", nation: "蜀", hp: "3", title: "迟暮的丞相", text: "观星：准备阶段可观看牌堆顶 X 张（X 为存活角色数且至少 3）。空城：没有手牌时，不能成为【杀】或【决斗】的目标。" },
  { name: "赵云", nation: "蜀", hp: "4", title: "少年将军", text: "龙胆：【杀】【闪】可互相替代使用或打出。" },
  { name: "马超", nation: "蜀", hp: "4", title: "一骑当千", text: "马术：锁定技，计算与其他角色距离 −1。铁骑：使用【杀】指定目标后可判定，红色则其不能打出【闪】。" },
  { name: "黄月英", nation: "蜀", hp: "3", title: "归隐的杰女", text: "集智：使用非延时锦囊后摸一张牌。奇才：锁定技，使用锦囊无距离限制。" },
  { name: "孙权", nation: "吴", hp: "4", title: "年轻的贤君", text: "制衡：出牌阶段限一次，弃任意张牌并摸等量的牌。" },
  { name: "甘宁", nation: "吴", hp: "4", title: "锦帆游侠", text: "奇袭：黑色牌可当【过河拆桥】使用。" },
  { name: "吕蒙", nation: "吴", hp: "4", title: "白衣渡江", text: "克己：若你未使用或打出过【杀】，弃牌阶段跳过。" },
  { name: "黄盖", nation: "吴", hp: "4", title: "轻身为国", text: "苦肉：出牌阶段，失去 1 点体力并摸两张牌。" },
  { name: "周瑜", nation: "吴", hp: "3", title: "大都督", text: "英姿：摸牌阶段多摸一张。反间：出牌阶段限一次，令一名角色猜你手牌花色。" },
  { name: "大乔", nation: "吴", hp: "3", title: "矜持之花", text: "国色：方块牌可当【乐不思蜀】。流离：成为【杀】目标时可交给攻击范围内角色一张牌并转移目标。" },
  { name: "陆逊", nation: "吴", hp: "3", title: "儒生雄才", text: "谦逊：不能成为【顺手牵羊】【乐不思蜀】目标。连营：失去最后一张手牌时摸一张牌。" },
  { name: "孙尚香", nation: "吴", hp: "3", title: "弓腰姬", text: "结姻：出牌阶段限一次，弃两张手牌令自己和一名男性角色各回复 1 点体力。枭姬：失去装备区的牌时摸两张牌。" },
  { name: "吕布", nation: "群", hp: "4", title: "武的化身", text: "无双：锁定技，你的【杀】需两张【闪】抵消；【决斗】对方需打出两张【杀】。" },
  { name: "华佗", nation: "群", hp: "3", title: "神医", text: "急救：你的回合外，红牌可当【桃】。青囊：出牌阶段限一次，弃一张手牌令一名角色回复 1 点体力。" },
  { name: "貂蝉", nation: "群", hp: "3", title: "绝世的舞姬", text: "离间：出牌阶段限一次，弃一张牌令一名男性对另一名男性【决斗】。闭月：结束阶段可摸一张牌。" },
];

export function sanguoshaPileBlueprint(size: SizeMm): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name: "游戏牌",
    size: { ...size },
    bleedMm: 3,
    cornerRadiusMm: 3,
    frontLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#3d2814" }, { locked: true }),
      ly("rect", "框", { x: 2.5, y: 2.5, w: w - 5, h: h - 5 }, { fill: "#6b4424", stroke: "#c4a06a", strokeWidthMm: 0.7 }, { locked: true }),
      ly("text", "name", { x: 5, y: 4.5, w: w - 22, h: 10 }, txt({ color: "#f6e6c8", fontSizeMm: 5.2, fontWeight: 700 }), {
        text: "杀",
        vars: { text: "name" },
      }),
      ly(
        "text",
        "kind",
        { x: 5, y: 15, w: 22, h: 7 },
        txt({ color: "#2a1a0c", fontSizeMm: 3, fontWeight: 700, align: "center", valign: "middle", background: "#c4a06a" }),
        { text: "基本牌", vars: { text: "kind" } },
      ),
      ly("text", "suit", { x: w - 16, y: 4.5, w: 12, h: 8 }, txt({ color: "#f0c4c4", fontSizeMm: 5, align: "center" }), {
        text: "♥",
        vars: { text: "suit" },
      }),
      ly("text", "rank", { x: w - 16, y: 13, w: 12, h: 7 }, txt({ color: "#f6e6c8", fontSizeMm: 3.6, align: "center" }), {
        text: "A",
        vars: { text: "rank" },
      }),
      ly("rect", "文底", { x: 5, y: h - 36, w: w - 10, h: 30 }, { fill: "#2a1a10cc" }, { locked: true }),
      ly("text", "text", { x: 7, y: h - 34, w: w - 14, h: 26 }, txt({ color: "#f6ecd0", fontSizeMm: 3.1, lineHeight: 1.35 }), {
        text: "出牌阶段，对攻击范围内的一名角色使用。",
        vars: { text: "text" },
      }),
    ],
    backLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#2a1a10" }, { locked: true }),
      ly("rect", "框", { x: 4, y: 4, w: w - 8, h: h - 8 }, { fill: "#5a3a20", stroke: "#c4a06a", strokeWidthMm: 0.8 }, { locked: true }),
      ly(
        "text",
        "backTitle",
        { x: 6, y: h / 2 - 8, w: w - 12, h: 16 },
        txt({ color: "#c4a06a", fontSizeMm: 6, fontWeight: 700, align: "center", valign: "middle" }),
        { text: "三国杀" },
      ),
    ],
  };
}

export function sanguoshaGeneralBlueprint(size: SizeMm): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name: "武将",
    size: { ...size },
    bleedMm: 3,
    cornerRadiusMm: 3,
    frontLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#1d4e89" }, { locked: true, vars: { fill: "nationFill" } }),
      ly("rect", "框", { x: 2.5, y: 2.5, w: w - 5, h: h - 5 }, { fill: "#161018cc", stroke: "#e8c547", strokeWidthMm: 0.7 }, { locked: true }),
      ly(
        "text",
        "nation",
        { x: 4, y: 4, w: 16, h: 8 },
        txt({ color: "#fff8f0", fontSizeMm: 3.2, fontWeight: 700, align: "center", valign: "middle", background: "#1d4e89" }),
        { text: "魏", vars: { text: "nation", background: "nationFill" } },
      ),
      ly(
        "icon",
        "勾玉",
        { x: w - 28, y: 3.5, w: 24, h: 10 },
        { fit: "contain" },
        { text: "hp-jade", vars: { repeat: "hp" }, repeatPerRow: 3 },
      ),
      ly("text", "name", { x: 5, y: 15, w: w - 10, h: 12 }, txt({ color: "#f3e0a8", fontSizeMm: 7, fontWeight: 700, align: "center" }), {
        text: "曹操",
        vars: { text: "name" },
      }),
      ly("text", "title", { x: 5, y: 27, w: w - 10, h: 7 }, txt({ color: "#c9b48a", fontSizeMm: 3.2, align: "center" }), {
        text: "魏武帝",
        vars: { text: "title" },
      }),
      ly("rect", "技底", { x: 5, y: 36, w: w - 10, h: h - 42 }, { fill: "#0e0a10cc" }, { locked: true }),
      ly("text", "text", { x: 7, y: 38, w: w - 14, h: h - 46 }, txt({ color: "#f6ecd0", fontSizeMm: 2.9, lineHeight: 1.32 }), {
        text: "技能写在这里。",
        vars: { text: "text" },
      }),
    ],
    backLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#141018" }, { locked: true }),
      ly("rect", "框", { x: 5, y: 5, w: w - 10, h: h - 10 }, { fill: "#1c141c", stroke: "#c4a06a", strokeWidthMm: 0.9 }, { locked: true }),
      ly(
        "text",
        "backTitle",
        { x: 6, y: h / 2 - 8, w: w - 12, h: 16 },
        txt({ color: "#e8c547", fontSizeMm: 7, fontWeight: 700, align: "center", valign: "middle" }),
        { text: "武将" },
      ),
    ],
  };
}

export function sanguoshaIdentityBackLayers(size: SizeMm): Layer[] {
  const { w, h } = size;
  return [
    ly("rect", "_back", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#000000" }, { locked: true }),
    ly(
      "text",
      "_label",
      { x: 4, y: h / 2 - 12, w: w - 8, h: 24 },
      txt({ color: "#f4f4f0", fontSizeMm: 9, fontWeight: 800, align: "center", valign: "middle", letterSpacingMm: 2.4 }),
      { text: "身份牌", locked: true },
    ),
  ];
}

export function patchSanguoshaIdentityBacks(project: Project): Project {
  let changed = false;
  const blueprints = project.blueprints.map((bp) => {
    if (bp.name !== "身份牌" && bp.name !== "身份") return bp;
    const labels = bp.backLayers.filter((l) => l.type === "text").map((l) => (l.text ?? "").trim());
    const onlyLabel = labels.length === 1 && labels[0] === "身份牌";
    const leaks =
      bp.backLayers.some((l) => l.vars && Object.values(l.vars).some(Boolean)) ||
      bp.backLayers.some((l) => l.type === "rect" && l.style.stroke) ||
      labels.some((t) => t !== "身份牌");
    if (onlyLabel && !leaks) return bp;
    changed = true;
    return { ...bp, backLayers: sanguoshaIdentityBackLayers(bp.size) };
  });
  return changed ? { ...project, blueprints } : project;
}

export function sanguoshaIdentityBlueprint(size: SizeMm): Blueprint {
  const { w, h } = size;
  return {
    id: uid("bp"),
    name: "身份牌",
    size: { ...size },
    bleedMm: 3,
    cornerRadiusMm: 3,
    frontLayers: [
      ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#c9a227" }, { locked: true, vars: { fill: "roleFill" } }),
      ly("rect", "内框", { x: 6, y: 8, w: w - 12, h: h - 16 }, { fill: "#14110ccc", stroke: "#f4e4b0", strokeWidthMm: 0.8 }, { locked: true }),
      ly(
        "text",
        "kind",
        { x: 8, y: 12, w: w - 16, h: 8 },
        txt({ color: "#f4e4b0", fontSizeMm: 3.4, fontWeight: 700, align: "center", letterSpacingMm: 1.2 }),
        { text: "身份", vars: { text: "kind" } },
      ),
      ly(
        "text",
        "name",
        { x: 6, y: 28, w: w - 12, h: 22 },
        txt({ color: "#fff8e0", fontSizeMm: 12, fontWeight: 800, align: "center", valign: "middle" }),
        { text: "主公", vars: { text: "name" } },
      ),
      ly("text", "text", { x: 9, y: 54, w: w - 18, h: h - 62 }, txt({ color: "#f6ecd0", fontSizeMm: 3.2, lineHeight: 1.35, align: "center" }), {
        text: "消灭所有反贼和内奸。",
        vars: { text: "text" },
      }),
    ],
    backLayers: sanguoshaIdentityBackLayers(size),
  };
}

export function sanguoshaJadeBlueprint(): Blueprint {
  const { w, h } = SGS_TOKEN_SIZE;
  return {
    id: uid("bp"),
    name: "勾玉",
    size: { ...SGS_TOKEN_SIZE },
    bleedMm: 1,
    cornerRadiusMm: 10,
    frontLayers: [
      ly("rect", "底", { x: -1, y: -1, w: w + 2, h: h + 2 }, { fill: "#2a0c0c" }, { locked: true }),
      ly(
        "icon",
        "勾玉",
        { x: 3, y: 3, w: w - 6, h: h - 6 },
        { fit: "contain" },
        { text: "hp-jade", locked: true, vars: { repeat: "jadeN" }, repeatPerRow: 3 },
      ),
    ],
    backLayers: [
      ly("rect", "底", { x: -1, y: -1, w: w + 2, h: h + 2 }, { fill: "#221c16" }, { locked: true }),
      ly(
        "icon",
        "勾玉",
        { x: 2, y: 3, w: w - 4, h: h - 6 },
        { fit: "contain" },
        { text: "hp-jade-lost", locked: true, vars: { repeat: "jadeBackN" }, repeatPerRow: 4 },
      ),
    ],
  };
}

export function buildSanguoshaContent(size: SizeMm): {
  blueprints: Blueprint[];
  sets: CardSet[];
  assets: Record<string, string>;
} {
  const pileBp = sanguoshaPileBlueprint(size);
  const idBp = sanguoshaIdentityBlueprint(size);
  const genBp = sanguoshaGeneralBlueprint(size);
  const jadeBp = sanguoshaJadeBlueprint();

  const pileCards = DECK_ROWS.map(([suit, rank, name]) =>
    card({
      name,
      kind: kindOf(name),
      suit,
      rank,
      text: TEXTS[name] ?? name,
    }),
  );

  return {
    assets: { ...SGS_JADE_ASSETS },
    blueprints: [pileBp, idBp, genBp, jadeBp],
    sets: [
      setOf(
        "武将",
        genBp,
        GENERALS.map((g) =>
          card({
            name: g.name,
            nation: g.nation,
            nationFill: NATION_FILL[g.nation] ?? "#1d4e89",
            nationInk: g.nation === "群" ? "#1a1408" : "#f4f0e4",
            hp: g.hp,
            title: g.title,
            text: g.text,
          }),
        ),
      ),
      setOf("身份", idBp, [
        card({ name: "主公", kind: "身份", roleFill: ROLE_FILL.主公, text: "消灭所有反贼和内奸。" }),
        card({ name: "忠臣", kind: "身份", roleFill: ROLE_FILL.忠臣, text: "保护主公，消灭反贼与内奸。" }, 2),
        card({ name: "反贼", kind: "身份", roleFill: ROLE_FILL.反贼, text: "消灭主公。" }, 4),
        card({ name: "内奸", kind: "身份", roleFill: ROLE_FILL.内奸, text: "先消灭反贼与忠臣，最后杀死主公。" }),
      ]),
      setOf("牌堆", pileBp, pileCards),
      setOf("弃牌堆", pileBp, []),
      setOf("勾玉", jadeBp, [card({ name: "勾玉", jadeN: "3", jadeBackN: "4" }, 40)]),
    ],
  };
}

export function countSanguoshaDeck(): number {
  return DECK_ROWS.length;
}
