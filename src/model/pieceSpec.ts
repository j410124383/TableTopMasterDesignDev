import { uid } from "@/lib/id";
import { CARD_STOCK_MM } from "./piece";
import type { Blueprint, PieceKind, PieceOrientation, PieceSpec, Project, SizeMm } from "./types";

export function roundMm01(n: number) {
  return Math.round(Number(n) * 100) / 100;
}

export function portraitBasis(size: SizeMm): SizeMm {
  const w = Number(size.w) || 0;
  const h = Number(size.h) || 0;
  return w <= h ? { w, h } : { w: h, h: w };
}

export function orientationOf(size: SizeMm): PieceOrientation {
  return Number(size.w) > Number(size.h) ? "landscape" : "portrait";
}

export function sizeFromSpec(spec: PieceSpec, orientation: PieceOrientation): SizeMm {
  if (orientation === "landscape") return { w: spec.size.h, h: spec.size.w };
  return { w: spec.size.w, h: spec.size.h };
}

export function specFingerprint(
  kind: PieceKind,
  size: SizeMm,
  bleedMm: number,
  cornerRadiusMm: number,
  thicknessMm: number,
  core?: string,
): string {
  const p = portraitBasis(size);
  const coreKey = kind === "board" ? "-" : core === "black" ? "black" : "white";
  return [
    kind,
    roundMm01(p.w),
    roundMm01(p.h),
    roundMm01(bleedMm),
    roundMm01(cornerRadiusMm),
    roundMm01(thicknessMm),
    coreKey,
  ].join("|");
}

export function createPieceSpec(
  kind: PieceKind,
  size: SizeMm,
  extra?: Partial<Pick<PieceSpec, "name" | "thicknessMm" | "core" | "bleedMm" | "cornerRadiusMm">>,
): PieceSpec {
  const basis = portraitBasis(size);
  return {
    id: uid("psp"),
    name: extra?.name ?? "默认规格",
    kind,
    size: basis,
    thicknessMm: extra?.thicknessMm ?? (kind === "board" ? 2 : CARD_STOCK_MM),
    core: kind === "card" ? (extra?.core === "black" ? "black" : "white") : undefined,
    bleedMm: extra?.bleedMm ?? 3,
    cornerRadiusMm: extra?.cornerRadiusMm ?? 3,
  };
}

export function applySpecToBlueprint(bp: Blueprint, spec: PieceSpec, orientation: PieceOrientation): Blueprint {
  return {
    ...bp,
    kind: spec.kind,
    specId: spec.id,
    orientation,
    size: sizeFromSpec(spec, orientation),
    bleedMm: spec.bleedMm,
    cornerRadiusMm: spec.cornerRadiusMm,
    thicknessMm: spec.thicknessMm,
    core: spec.kind === "card" ? (spec.core === "black" ? "black" : "white") : undefined,
  };
}

export function specOf(project: Project, specId?: string): PieceSpec | undefined {
  return (project.pieceSpecs ?? []).find((s) => s.id === specId);
}

export function defaultSpec(project: Project, kind?: PieceKind): PieceSpec | undefined {
  const specs = project.pieceSpecs ?? [];
  const pool = kind ? specs.filter((s) => s.kind === kind) : specs;
  if (!pool.length) return undefined;
  const id = project.meta.defaultSpecId;
  const hit = id ? pool.find((s) => s.id === id) : undefined;
  if (hit) return hit;
  const counts = new Map<string, number>();
  for (const bp of project.blueprints ?? []) {
    if (!bp.specId) continue;
    counts.set(bp.specId, (counts.get(bp.specId) ?? 0) + 1);
  }
  return [...pool].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0];
}

function specFromBlueprint(bp: Blueprint, name: string): PieceSpec {
  const kind = bp.kind === "board" ? "board" : "card";
  const t = Number(bp.thicknessMm);
  return {
    id: uid("psp"),
    name,
    kind,
    size: portraitBasis(bp.size),
    thicknessMm: kind === "board" ? (Number.isFinite(t) && t >= 0 ? t : 2) : Number.isFinite(t) && t > 0 ? t : CARD_STOCK_MM,
    core: kind === "card" ? (bp.core === "black" ? "black" : "white") : undefined,
    bleedMm: Number(bp.bleedMm) || 0,
    cornerRadiusMm: Number(bp.cornerRadiusMm) || 0,
  };
}

export function ensurePieceSpecs(project: Project): Project {
  const blueprints = project.blueprints ?? [];
  let specs = [...(project.pieceSpecs ?? [])];
  const byId = new Map(specs.map((s) => [s.id, s]));
  const linked = blueprints.every((b) => !!(b.specId && byId.has(b.specId)));
  if (specs.length && linked) {
    const def = project.meta.defaultSpecId && byId.has(project.meta.defaultSpecId) ? project.meta.defaultSpecId : defaultSpec({ ...project, pieceSpecs: specs })?.id;
    return {
      ...project,
      pieceSpecs: specs,
      blueprints: blueprints.map((b) => ({
        ...b,
        orientation: b.orientation ?? orientationOf(b.size),
      })),
      meta: { ...project.meta, defaultSpecId: def },
    };
  }

  const fpToId = new Map<string, string>();
  for (const spec of specs) {
    fpToId.set(
      specFingerprint(spec.kind, spec.size, spec.bleedMm, spec.cornerRadiusMm, spec.thicknessMm, spec.core),
      spec.id,
    );
  }

  const groups = new Map<string, Blueprint[]>();
  for (const bp of blueprints) {
    if (bp.specId && byId.has(bp.specId)) continue;
    const kind = bp.kind === "board" ? "board" : "card";
    const t = Number(bp.thicknessMm);
    const thickness = kind === "board" ? (Number.isFinite(t) && t >= 0 ? t : 2) : Number.isFinite(t) && t > 0 ? t : CARD_STOCK_MM;
    const key = specFingerprint(kind, bp.size, Number(bp.bleedMm) || 0, Number(bp.cornerRadiusMm) || 0, thickness, bp.core);
    const list = groups.get(key) ?? [];
    list.push(bp);
    groups.set(key, list);
  }

  let multiIndex = specs.filter((s) => s.name.startsWith("规格 ")).length + 1;
  for (const [key, list] of groups) {
    let specId = fpToId.get(key);
    if (!specId) {
      const first = list[0]!;
      const basis = portraitBasis(first.size);
      const name =
        list.length === 1 ? `${first.name}规格` : `规格 ${multiIndex}（${roundMm01(basis.w)}×${roundMm01(basis.h)}）`;
      if (list.length > 1) multiIndex += 1;
      const spec = specFromBlueprint(first, name);
      specs.push(spec);
      byId.set(spec.id, spec);
      fpToId.set(key, spec.id);
      specId = spec.id;
    }
  }

  if (!specs.length) {
    specs = [createPieceSpec("card", project.meta.defaultSize, { name: "默认规格" })];
  }

  const nextBlueprints = blueprints.map((bp) => {
    if (bp.specId && byId.has(bp.specId)) return { ...bp, orientation: bp.orientation ?? orientationOf(bp.size) };
    const kind = bp.kind === "board" ? "board" : "card";
    const t = Number(bp.thicknessMm);
    const thickness = kind === "board" ? (Number.isFinite(t) && t >= 0 ? t : 2) : Number.isFinite(t) && t > 0 ? t : CARD_STOCK_MM;
    const key = specFingerprint(kind, bp.size, Number(bp.bleedMm) || 0, Number(bp.cornerRadiusMm) || 0, thickness, bp.core);
    const specId = fpToId.get(key) ?? specs[0]!.id;
    return {
      ...bp,
      specId,
      orientation: orientationOf(bp.size),
    };
  });

  const nextProject = { ...project, pieceSpecs: specs, blueprints: nextBlueprints };
  const def = defaultSpec(nextProject)?.id;
  return { ...nextProject, meta: { ...project.meta, defaultSpecId: def } };
}

export function ensureSpecForKind(project: Project, kind: PieceKind): { project: Project; spec: PieceSpec } {
  const withSpecs = ensurePieceSpecs(project);
  const existing = defaultSpec(withSpecs, kind);
  if (existing) return { project: withSpecs, spec: existing };
  const spec = createPieceSpec(kind, withSpecs.meta.defaultSize, { name: kind === "board" ? "默认板件规格" : "默认规格" });
  const pieceSpecs = [...(withSpecs.pieceSpecs ?? []), spec];
  return {
    project: { ...withSpecs, pieceSpecs, meta: { ...withSpecs.meta, defaultSpecId: spec.id } },
    spec,
  };
}
