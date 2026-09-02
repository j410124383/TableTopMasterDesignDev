import type { Card, CardSet, Project } from "@/model/types";
import type { Piece, PlayPlayer } from "./playTypes";

export const TABLE = { w: 1680, h: 980, pad: 28 };

export const TABLE_PRESETS = [
  { id: "s", label: "小", w: 1200, h: 720 },
  { id: "m", label: "中", w: 1680, h: 980 },
  { id: "l", label: "大", w: 2100, h: 1220 },
  { id: "xl", label: "超大", w: 2600, h: 1500 },
  { id: "custom", label: "自定义", w: 1680, h: 980 },
] as const;

export type TablePresetId = (typeof TABLE_PRESETS)[number]["id"];

export function setTableDim(w: number, h: number) {
  TABLE.w = Math.max(640, Math.round(w));
  TABLE.h = Math.max(420, Math.round(h));
}
export const CARD_REF_W = 63.5;
export const CARD_W = 92;

export function shuffle<T>(list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function expandSet(set: CardSet): { setId: string; card: Card }[] {
  return set.cards.flatMap((card) =>
    Array.from({ length: Math.max(1, card.qty) }, () => ({ setId: set.id, card })),
  );
}

export function blueprintOf(project: Project, setId: string) {
  const set = project.sets.find((s) => s.id === setId);
  return set ? project.blueprints.find((b) => b.id === set.blueprintId) : undefined;
}

export function pieceSize(project: Project, setId: string): { w: number; h: number } {
  const bp = blueprintOf(project, setId);
  const w = bp?.size.w ?? CARD_REF_W;
  const h = bp?.size.h ?? 88.9;
  const scale = CARD_W / CARD_REF_W;
  return {
    w: Math.max(36, Math.round(w * scale)),
    h: Math.max(44, Math.round(h * scale)),
  };
}

export function clampOnTable(x: number, y: number, w: number, h: number) {
  return {
    x: Math.min(TABLE.w - w - TABLE.pad, Math.max(TABLE.pad, x)),
    y: Math.min(TABLE.h - h - TABLE.pad, Math.max(TABLE.pad, y)),
  };
}

export function setByName(project: Project, name: string) {
  return project.sets.find((s) => s.name === name);
}

export function pileLayout(project: Project): Record<string, { x: number; y: number }> {
  const named: Record<string, { x: number; y: number }> = {
    武将: { x: 70, y: 70 },
    身份: { x: 210, y: 70 },
    牌堆: { x: 700, y: 340 },
    弃牌堆: { x: 880, y: 340 },
    勾玉: { x: 70, y: 720 },
    血量: { x: 70, y: 720 },
  };
  const out: Record<string, { x: number; y: number }> = {};
  const unknown: CardSet[] = [];
  for (const set of project.sets) {
    if (named[set.name]) out[set.id] = named[set.name];
    else unknown.push(set);
  }
  unknown.forEach((set, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    out[set.id] = { x: 70 + col * 140, y: 70 + row * 200 };
  });
  return out;
}

export function dealProject(project: Project): { pieces: Piece[]; anchors: Record<string, { x: number; y: number }> } {
  const anchors = pileLayout(project);
  let z = 1;
  const pieces: Piece[] = [];
  for (const set of project.sets) {
    const pos = anchors[set.id] ?? { x: 80, y: 80 };
    shuffle(expandSet(set)).forEach((item, i) => {
      pieces.push({
        id: `${set.id}-${item.card.id}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        setId: set.id,
        card: item.card,
        face: "back",
        x: pos.x,
        y: pos.y,
        z: z++,
        zone: "pile",
        pileId: set.id,
        rot: 0,
      });
    });
  }
  return { pieces, anchors };
}

export function pileTop(pieces: Piece[], pileId: string): Piece | undefined {
  return pieces
    .filter((p) => p.zone === "pile" && p.pileId === pileId)
    .sort((a, b) => a.z - b.z)
    .at(-1);
}

/** 放回牌堆时跟随该堆顶牌朝向；空堆时弃牌堆默认正面，其余默认背面 */
export function faceForPile(
  pieces: Piece[],
  pileId: string,
  project?: Project | null,
): "front" | "back" {
  const top = pileTop(pieces, pileId);
  if (top) return top.face;
  const name = project?.sets.find((s) => s.id === pileId)?.name;
  if (name === "弃牌堆") return "front";
  return "back";
}

export function takeFromPile(pieces: Piece[], pileId: string, n: number): Piece[] {
  return pieces
    .filter((p) => p.zone === "pile" && p.pileId === pileId)
    .sort((a, b) => a.z - b.z)
    .slice(-n);
}

const SKIP_PILES = new Set(["身份", "武将", "勾玉", "血量", "弃牌堆"]);

export function primaryPile(project: Project) {
  return (
    setByName(project, "牌堆") ??
    setByName(project, "牌库") ??
    project.sets.find((s) => s.cards.length && !SKIP_PILES.has(s.name)) ??
    project.sets[0]
  );
}

export function dealNToEach(pieces: Piece[], pileId: string, players: PlayPlayer[], n: number): Piece[] {
  let next = pieces.map((p) => ({ ...p }));
  let z = Math.max(10, ...next.map((p) => p.z), 10) + 1;
  for (const pl of players) {
    const drawn = takeFromPile(next, pileId, n);
    const ids = new Set(drawn.map((c) => c.id));
    next = next.map((p) =>
      ids.has(p.id) ? { ...p, zone: "hand", pileId: undefined, ownerId: pl.id, face: "front", z: z++ } : p,
    );
  }
  return next;
}

export function pileKey(id: string) {
  return `pile:${id}`;
}

export function isPileKey(id: string) {
  return id.startsWith("pile:");
}

export function pileIdOf(key: string) {
  return key.startsWith("pile:") ? key.slice(5) : key;
}

export function seatSide(index: number, total: number): "left" | "top" | "right" {
  if (total <= 1) return "top";
  if (total === 2) return index === 0 ? "left" : "right";
  if (index === 0) return "left";
  if (index === total - 1) return "right";
  return "top";
}

export function passHandsClockwise(pieces: Piece[], players: PlayPlayer[]): Piece[] {
  if (players.length < 2) return pieces;
  const map = new Map(players.map((p, i) => [p.id, players[(i + 1) % players.length].id]));
  return pieces.map((p) => {
    if (p.zone !== "hand" || !p.ownerId) return p;
    const next = map.get(p.ownerId);
    return next ? { ...p, ownerId: next } : p;
  });
}
