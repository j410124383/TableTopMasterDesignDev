import { uid } from "@/lib/id";
import type { Blueprint, Card, Layer, SizeMm } from "./types";

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const SUITS = [
  { suit: "♠", ink: "#1a1a1a" },
  { suit: "♥", ink: "#c0392b" },
  { suit: "♦", ink: "#c0392b" },
  { suit: "♣", ink: "#1a1a1a" },
] as const;

function tint(text: string, ink: string): string {
  return `<color=${ink}>${text}</color>`;
}

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

export function pokerFrontLayers(size: SizeMm): Layer[] {
  const { w, h } = size;
  return [
    ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#f4efe4" }, { locked: true }),
    ly(
      "rect",
      "卡面",
      { x: 1.2, y: 1.2, w: w - 2.4, h: h - 2.4 },
      { fill: "#fffdf8", stroke: "#d5cbb8", strokeWidthMm: 0.35 },
      { locked: true },
    ),
    ly(
      "text",
      "rank",
      { x: 2.4, y: 2.2, w: 14, h: 9 },
      {
        color: "#1a1a1a",
        fontSizeMm: 6.2,
        fontWeight: 700,
        align: "center",
        valign: "middle",
        fontFamily: "Georgia, serif",
      },
      { text: "A" },
    ),
    ly(
      "text",
      "suit",
      { x: 2.4, y: 11, w: 14, h: 10 },
      {
        color: "#1a1a1a",
        fontSizeMm: 7,
        align: "center",
        valign: "middle",
        fontFamily: "Georgia, serif",
      },
      { text: "♠" },
    ),
    ly(
      "text",
      "pip",
      { x: 10, y: 22, w: w - 20, h: h - 44 },
      {
        color: "#1a1a1a",
        fontSizeMm: Math.min(w, h) * 0.42,
        fontWeight: 400,
        align: "center",
        valign: "middle",
        fontFamily: "Georgia, serif",
      },
      { text: "♠" },
    ),
    ly(
      "text",
      "rank",
      { x: w - 16.4, y: h - 21, w: 14, h: 9 },
      {
        color: "#1a1a1a",
        fontSizeMm: 6.2,
        fontWeight: 700,
        align: "center",
        valign: "middle",
        fontFamily: "Georgia, serif",
      },
      { rotation: 180, text: "A" },
    ),
    ly(
      "text",
      "suit",
      { x: w - 16.4, y: h - 12.2, w: 14, h: 10 },
      {
        color: "#1a1a1a",
        fontSizeMm: 7,
        align: "center",
        valign: "middle",
        fontFamily: "Georgia, serif",
      },
      { rotation: 180, text: "♠" },
    ),
  ];
}

export function pokerBackLayers(size: SizeMm): Layer[] {
  const { w, h } = size;
  return [
    ly("rect", "底", { x: -3, y: -3, w: w + 6, h: h + 6 }, { fill: "#1b2a4a" }, { locked: true }),
    ly(
      "rect",
      "外框",
      { x: 3, y: 3, w: w - 6, h: h - 6 },
      { fill: "#243664", stroke: "#c9a227", strokeWidthMm: 0.7 },
      { locked: true },
    ),
    ly(
      "rect",
      "菱格",
      { x: 7, y: 7, w: w - 14, h: h - 14 },
      { fill: "#1e3060aa", stroke: "#c9a22766", strokeWidthMm: 0.35 },
      { locked: true },
    ),
    ly(
      "rect",
      "中心",
      { x: w / 2 - 12, y: h / 2 - 14, w: 24, h: 28 },
      { fill: "#c9a22722", stroke: "#e8c547cc", strokeWidthMm: 0.45 },
      { locked: true },
    ),
    ly(
      "text",
      "backTitle",
      { x: 6, y: h / 2 - 8, w: w - 12, h: 16 },
      {
        color: "#e8c547",
        fontSizeMm: 5,
        fontWeight: 700,
        align: "center",
        valign: "middle",
        fontFamily: "Georgia, serif",
      },
      { text: "扑克" },
    ),
  ];
}

export function createPokerBlueprint(size: SizeMm, name = "扑克"): Blueprint {
  return {
    id: uid("bp"),
    name,
    size: { ...size },
    bleedMm: 3,
    cornerRadiusMm: 3.2,
    frontLayers: pokerFrontLayers(size),
    backLayers: pokerBackLayers(size),
  };
}

export function createPokerCards(backTitle: string): Card[] {
  const cards: Card[] = [];
  for (const { suit, ink } of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: uid("card"),
        qty: 1,
        fields: {
          rank: tint(rank, ink),
          suit: tint(suit, ink),
          pip: tint(suit, ink),
          backTitle,
        },
      });
    }
  }
  cards.push({
    id: uid("card"),
    qty: 1,
    fields: {
      rank: tint("小王", "#1a1a1a"),
      suit: tint("★", "#1a1a1a"),
      pip: tint("Joker", "#1a1a1a"),
      backTitle,
    },
  });
  cards.push({
    id: uid("card"),
    qty: 1,
    fields: {
      rank: tint("大王", "#c0392b"),
      suit: tint("★", "#c0392b"),
      pip: tint("Joker", "#c0392b"),
      backTitle,
    },
  });
  return cards;
}

export const POKER_FIELD_KEYS = ["rank", "suit", "pip", "backTitle"];
