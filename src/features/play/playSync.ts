import { uid } from "@/lib/id";
import { validateProject } from "@/model/schema";
import type { Project } from "@/model/types";
import type { Piece, PlayPlayer, PlayProp, PlayStroke } from "./playTypes";
import type { PlayNet } from "./playNet";

const CHUNK = 32_000;

export type PlayBundle = {
  project: Project;
  players: PlayPlayer[];
  pieces: Piece[];
  props: PlayProp[];
  strokes: PlayStroke[];
};

export function slimProjectForNet(project: Project): Project {
  const assets: Record<string, string> = {};
  for (const [key, value] of Object.entries(project.assets ?? {})) {
    if (typeof value === "string" && value.startsWith("data:") && value.length > 6000) continue;
    assets[key] = value;
  }
  return {
    ...project,
    playSetup: undefined,
    assets,
    fonts: project.fonts ?? [],
    templates: project.templates ?? [],
    decks: project.decks ?? [],
  };
}

export function sendPlayBundle(net: PlayNet, from: string, bundle: PlayBundle) {
  const payload = JSON.stringify({
    project: slimProjectForNet(bundle.project),
    players: bundle.players,
    pieces: bundle.pieces,
    props: bundle.props,
    strokes: bundle.strokes,
  });
  const packId = uid("pk");
  const total = Math.max(1, Math.ceil(payload.length / CHUNK));
  for (let i = 0; i < total; i++) {
    net.send({
      from,
      kind: "pack",
      projectId: bundle.project.meta.id,
      packId,
      packIndex: i,
      packTotal: total,
      packBody: payload.slice(i * CHUNK, (i + 1) * CHUNK),
    });
  }
}

export function makePackBuffer() {
  const packs = new Map<string, { total: number; slots: Array<string | undefined> }>();
  return {
    push(packId: string, index: number, total: number, body: string): { got: number; total: number; bundle?: PlayBundle; error?: string } {
      let rec = packs.get(packId);
      if (!rec || rec.total !== total) {
        rec = { total, slots: Array.from({ length: total }) };
        packs.set(packId, rec);
      }
      rec.slots[index] = body;
      const got = rec.slots.filter((s) => typeof s === "string").length;
      if (got < total) return { got, total };
      packs.delete(packId);
      try {
        const parsed = JSON.parse(rec.slots.join("")) as PlayBundle;
        parsed.project = validateProject(parsed.project);
        parsed.players = parsed.players ?? [];
        parsed.pieces = parsed.pieces ?? [];
        parsed.props = parsed.props ?? [];
        parsed.strokes = parsed.strokes ?? [];
        return { got, total, bundle: parsed };
      } catch (err) {
        return { got, total, error: err instanceof Error ? err.message : "parse" };
      }
    },
  };
}
