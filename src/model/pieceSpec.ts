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
  extra?: Partial<Pick<PieceSpec, "name" | "thicknessMm" | "core" | "bleedMm" | "cornerRadiusMm" | "sourceTemplateId">>,
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
    sourceTemplateId: extra?.sourceTemplateId,
  };
}

export type PieceSpecTemplate = {
  id: string;
  name: string;
  size: SizeMm;
  cornerRadiusMm: number;
  bleedMm: number;
  thicknessMm: number;
  note: string;
};

export const PIECE_SPEC_TEMPLATES: PieceSpecTemplate[] = [
  { id: "poker", name: "扑克牌", size: { w: 63.5, h: 88.9 }, cornerRadiusMm: 3.5, bleedMm: 3, thicknessMm: 0.32, note: "美式 Poker 2.5×3.5″" },
  { id: "poker-cn", name: "扑克（公制）", size: { w: 63, h: 88 }, cornerRadiusMm: 3, bleedMm: 3, thicknessMm: 0.32, note: "国内印刷常用" },
  { id: "bridge", name: "桥牌", size: { w: 57, h: 89 }, cornerRadiusMm: 3, bleedMm: 3, thicknessMm: 0.32, note: "窄牌，一手更好攥" },
  { id: "sanguosha", name: "三国杀", size: { w: 63, h: 88 }, cornerRadiusMm: 3, bleedMm: 3, thicknessMm: 0.32, note: "角色/装备宽版" },
  { id: "sanguosha-narrow", name: "三国杀（窄）", size: { w: 57, h: 87 }, cornerRadiusMm: 3, bleedMm: 3, thicknessMm: 0.32, note: "部分版本基本牌/锦囊" },
  { id: "mtg", name: "万智牌", size: { w: 63.5, h: 88.9 }, cornerRadiusMm: 3.5, bleedMm: 3, thicknessMm: 0.32, note: "与 Poker 同尺寸；宝可梦等多数 TCG 同此" },
  { id: "yugioh", name: "游戏王", size: { w: 59, h: 86 }, cornerRadiusMm: 3, bleedMm: 3, thicknessMm: 0.32, note: "日式小卡" },
  { id: "tarot", name: "塔罗牌", size: { w: 70, h: 120 }, cornerRadiusMm: 4, bleedMm: 3, thicknessMm: 0.35, note: "2.75×4.75″ 口径" },
  { id: "dixit", name: "说书人", size: { w: 80, h: 120 }, cornerRadiusMm: 4, bleedMm: 3, thicknessMm: 0.35, note: "Dixit 类大图卡" },
  { id: "euro", name: "欧式标准", size: { w: 56, h: 87 }, cornerRadiusMm: 3, bleedMm: 3, thicknessMm: 0.32, note: "多数德式桌游" },
  { id: "mini-euro", name: "迷你欧卡", size: { w: 44, h: 68 }, cornerRadiusMm: 2.5, bleedMm: 2, thicknessMm: 0.3, note: "Mini Euro" },
];

export function specFromTemplate(t: PieceSpecTemplate, name?: string): PieceSpec {
  return createPieceSpec("card", t.size, {
    name: name ?? t.name,
    thicknessMm: t.thicknessMm,
    bleedMm: t.bleedMm,
    cornerRadiusMm: t.cornerRadiusMm,
    sourceTemplateId: t.id,
  });
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
    specs = [specFromTemplate(PIECE_SPEC_TEMPLATES[0]!, "扑克牌")];
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
