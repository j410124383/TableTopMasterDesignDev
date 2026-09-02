import type { Card, Project } from "@/model/types";

export type PlayZone = "table" | "hand" | "pile";

export type Piece = {
  id: string;
  setId: string;
  card: Card;
  face: "front" | "back";
  x: number;
  y: number;
  z: number;
  zone: PlayZone;
  pileId?: string;
  /** 0 直立，90 横置，180 倒置 */
  rot?: number;
  ownerId?: string;
  /** 联机预渲染 PNG（/ __play/card/…） */
  thumbUrl?: string;
};

export type PlayPlayer = {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  gender?: "male" | "female" | "other";
  kind?: "developer" | "player";
  team?: string;
  host?: boolean;
};

export type PlayPropKind =
  | "d6"
  | "d20"
  | "timer"
  | "note"
  | "cube"
  | "treasure"
  | "meeple"
  | "life"
  | "calc"
  | "chip"
  | "textbox";

export type TokenShape = "square" | "circle" | "hex" | "triangle";

export type PlayStroke = {
  id: string;
  tool: "pen" | "line" | "rect" | "ellipse";
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

export type CardReview = { score: number; text: string };

export type PlayProp = {
  id: string;
  kind: PlayPropKind;
  x: number;
  y: number;
  z: number;
  color?: string;
  label?: string;
  /** 骰子点数；计时器剩余秒；秘宝编号 */
  value?: number;
  rolling?: boolean;
  running?: boolean;
  /** 计时结束的时间戳 */
  endsAt?: number;
  text?: string;
  face?: "front" | "back";
  shape?: TokenShape;
  fontSize?: number;
  /** Visual size multiplier, default 1. */
  scale?: number;
  fontFamily?: string;
};

export type PlayEnvelope = {
  id: string;
  from: string;
  at: number;
  room: string;
  kind: "hello" | "bye" | "state" | "roster" | "chat" | "kick" | "seat" | "cursor" | "pack";
  targetId?: string;
  projectId?: string;
  project?: Project;
  players?: PlayPlayer[];
  pieces?: Piece[];
  props?: PlayProp[];
  strokes?: PlayStroke[];
  text?: string;
  name?: string;
  cursor?: { x: number; y: number };
  packId?: string;
  packIndex?: number;
  packTotal?: number;
  packBody?: string;
  appVersion?: string;
  build?: string;
  protocol?: number;
};

export const PLAYER_COLORS = ["#d6ff3c", "#00f0ff", "#ff2bd6", "#7dffb3", "#ff8a3c", "#c084fc"];

/** Empty color = spectator. Chosen colors stay unique. */
export function withRoomSeats(list: PlayPlayer[]): PlayPlayer[] {
  const taken = new Set<string>();
  return list.map((p, i) => {
    if (!p.color) return { ...p, color: "", team: p.team ?? "p1" };
    const keep = PLAYER_COLORS.includes(p.color) && !taken.has(p.color);
    const color = keep ? p.color : (PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[i % PLAYER_COLORS.length]);
    taken.add(color);
    return { ...p, color, team: p.team ?? "p1" };
  });
}

export function setPlayerColor(list: PlayPlayer[], id: string, color: string): PlayPlayer[] {
  if (color && list.some((p) => p.id !== id && p.color === color)) return list;
  return withRoomSeats(list.map((p) => (p.id === id ? { ...p, color } : p)));
}

export const CUBE_COLORS = ["#ff3b3b", "#d6ff3c", "#ff2bd6", "#00f0ff", "#7dffb3", "#f4f4f0", "#2a2a2a"];
export const TOKEN_SHAPES: TokenShape[] = ["square", "circle", "hex", "triangle"];
export const CHIP_VALUES = [10, 50, 100, 500, 1000] as const;
export const CHIP_COLORS: Record<number, string> = {
  10: "#d4d4d8",
  50: "#3b82f6",
  100: "#ef4444",
  500: "#22c55e",
  1000: "#111114",
};
