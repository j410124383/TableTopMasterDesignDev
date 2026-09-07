import { uid } from "@/lib/id";
import { fieldKeysFromLayers, fieldTypesFromLayers } from "./layerVars";
import { ensureCardSetViews } from "./cardSetView";
import { applySpecToBlueprint, ensurePieceSpecs } from "./pieceSpec";
import { CARD_STOCK_MM } from "./piece";
import type { Blueprint, CardSet, Deck, PieceOrientation, PieceSpec, Project, Template } from "./types";
import { ensureBoxFaces } from "./box";

export function templateFromBlueprint(bp: Blueprint, face: "front" | "back"): Template {
  return {
    id: `${bp.id}_${face}`,
    name: `${bp.name}${face === "front" ? " 正面" : " 背面"}`,
    face,
    size: bp.size,
    bleedMm: bp.bleedMm,
    cornerRadiusMm: bp.cornerRadiusMm,
    layers: face === "front" ? bp.frontLayers : bp.backLayers,
  };
}

export function templatesFromBlueprints(blueprints: Blueprint[]): Template[] {
  return blueprints.flatMap((bp) => [
    templateFromBlueprint(bp, "front"),
    templateFromBlueprint(bp, "back"),
  ]);
}

export function decksFromSets(sets: CardSet[]): Deck[] {
  return sets.map((s) => ({
    id: s.id,
    name: s.name,
    frontTemplateId: `${s.blueprintId}_front`,
    backTemplateId: `${s.blueprintId}_back`,
    cards: s.cards,
    fieldKeys: s.fieldKeys,
    fieldTypes: s.fieldTypes,
  }));
}

export function blueprintsFromTemplates(templates: Template[]): Blueprint[] {
  const fronts = templates.filter((t) => t.face === "front");
  const backs = templates.filter((t) => t.face === "back");
  const count = Math.max(fronts.length, backs.length, templates.length ? 1 : 0);
  const list: Blueprint[] = [];
  for (let i = 0; i < count; i++) {
    const front = fronts[i] ?? fronts[0];
    const back = backs[i] ?? backs[0];
    const src = front ?? back;
    if (!src) continue;
    const name =
      src.name === "正面" || src.name === "背面" || src.name.endsWith(" 正面") || src.name.endsWith(" 背面")
        ? i === 0
          ? "默认蓝图"
          : `蓝图 ${i + 1}`
        : src.name.replace(/ 正面$| 背面$/, "") || `蓝图 ${i + 1}`;
    list.push({
      id: (front?.id ?? src.id).replace(/_front$/, ""),
      name,
      size: src.size,
      bleedMm: src.bleedMm,
      cornerRadiusMm: src.cornerRadiusMm,
      frontLayers: front?.layers ?? [],
      backLayers: back?.layers ?? [],
    });
  }
  return list;
}

export function setsFromDecks(decks: Deck[], blueprints: Blueprint[]): CardSet[] {
  return decks.map((d) => {
    const byFront = blueprints.find((bp) => bp.id === d.frontTemplateId || `${bp.id}_front` === d.frontTemplateId);
    return {
      id: d.id,
      name: d.name,
      blueprintId: byFront?.id ?? blueprints[0]?.id ?? "",
      cards: d.cards,
      fieldKeys: d.fieldKeys,
    };
  });
}

export function syncDerived(project: Project): Project {
  const blueprints = project.blueprints ?? [];
  const sets = (project.sets ?? []).map((s) => {
    const bp = blueprints.find((b) => b.id === s.blueprintId);
    const keys = fieldKeysOf(bp);
    if (!keys.length) return ensureCardSetViews(s);
    const extra = s.fieldKeys.filter((k) => !keys.includes(k));
    const layers = bp ? [...bp.frontLayers, ...bp.backLayers] : [];
    return ensureCardSetViews({
      ...s,
      fieldKeys: [...keys, ...extra],
      fieldTypes: { ...fieldTypesFromLayers(layers), ...s.fieldTypes },
    });
  });
  return {
    ...project,
    blueprints,
    sets,
    boxes: (project.boxes ?? []).map(ensureBoxFaces),
    shots: project.shots ?? [],
    rulebooks: project.rulebooks ?? [],
    pieceSpecs: project.pieceSpecs ?? [],
    templates: templatesFromBlueprints(blueprints),
    decks: decksFromSets(sets),
  };
}

export function normalizeProject(project: Project): Project {
  let blueprints = (project.blueprints ?? []).map(normalizeBlueprint);
  let sets = project.sets ?? [];
  if (!blueprints.length && project.templates?.length) {
    blueprints = blueprintsFromTemplates(project.templates).map(normalizeBlueprint);
  }
  if (!sets.length && project.decks?.length) {
    sets = setsFromDecks(project.decks, blueprints);
  }
  return syncDerived(
    ensurePieceSpecs({
      ...project,
      blueprints,
      sets,
      boxes: project.boxes ?? [],
      shots: project.shots ?? [],
      rulebooks: project.rulebooks ?? [],
      pieceSpecs: project.pieceSpecs ?? [],
    }),
  );
}

function normalizeBlueprint(bp: Blueprint): Blueprint {
  const kind = bp.kind === "board" ? "board" : "card";
  const t = Number(bp.thicknessMm);
  if (kind === "card") {
    return {
      ...bp,
      kind,
      thicknessMm: Number.isFinite(t) && t > 0 ? t : CARD_STOCK_MM,
      core: bp.core === "black" ? "black" : "white",
    };
  }
  return { ...bp, kind, thicknessMm: Number.isFinite(t) && t >= 0 ? t : 2, core: undefined };
}

export function createBlueprint(name: string, spec: PieceSpec, orientation: PieceOrientation = "portrait", from?: Blueprint): Blueprint {
  if (from) {
    const copy = structuredClone(from);
    return applySpecToBlueprint(
      {
        ...copy,
        id: uid("bp"),
        name,
      },
      spec,
      orientation,
    );
  }
  return applySpecToBlueprint(
    {
      id: uid("bp"),
      name,
      kind: spec.kind,
      size: spec.size,
      thicknessMm: spec.thicknessMm,
      core: spec.core,
      bleedMm: spec.bleedMm,
      cornerRadiusMm: spec.cornerRadiusMm,
      frontLayers: [],
      backLayers: [],
    },
    spec,
    orientation,
  );
}

export function createCardSet(name: string, blueprintId: string, fieldKeys: string[]): CardSet {
  return ensureCardSetViews({
    id: uid("set"),
    name,
    blueprintId,
    cards: [{ id: uid("card"), qty: 1, fields: Object.fromEntries(fieldKeys.map((k) => [k, ""])) }],
    fieldKeys,
  });
}

export function fieldKeysOf(bp: Blueprint | undefined): string[] {
  return fieldKeysFromLayers([...(bp?.frontLayers ?? []), ...(bp?.backLayers ?? [])]);
}
