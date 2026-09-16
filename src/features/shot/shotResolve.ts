import { boxTextureFit, defaultUvNet } from "@/model/box";
import { templateFromBlueprint } from "@/model/normalize";
import { cardCoreRgb, cardStockMm } from "@/model/piece";
import { boardLongestMm, boardThicknessMm } from "@/model/board";
import type { BoardPiece, ProductShotItem, Project, ShotStackLook } from "@/model/types";
import { renderCardToCanvas } from "@/render/drawCard";
import { mmToPx } from "@/lib/mm";
import { boxMesh, matIdentity, matMul, matRotateXYZ, matScale, matTranslate, roundedSlabMesh, type BoxMesh, type Mat4 } from "@/features/box/boxGeom";
import { loadFittedBoxTexture } from "@/features/box/boxTexture";
import { loadBoardCutout } from "@/features/board/boardCutout";
import type { SceneDrawItem } from "@/features/box/boxGl";
import { faceFlipMat, itemFaceDown, stackDrawCards, stackLayout, stackMeshThickMm, stackRestY, stackShapeOf, stackSlice } from "./shotStack";

const cardCache = new Map<string, HTMLCanvasElement>();

export function shotGeomSig(project: Project) {
  const bps = project.blueprints.map((b) => `${b.id}:${b.thicknessMm}:${b.cornerRadiusMm}:${b.core}:${b.size.w}x${b.size.h}`).join("|");
  const sets = project.sets.map((s) => `${s.id}:${s.cards.reduce((n, c) => n + (c.qty || 0), 0)}`).join("|");
  const boxes = (project.boxes ?? []).map((b) => `${b.id}:${b.bevelMm}:${b.lengthMm}x${b.widthMm}x${b.heightMm}:${b.textureAssetId ?? ""}`).join("|");
  const boards = (project.boards ?? []).map((b) => `${b.id}:${b.textureAssetId}:${b.thicknessMm}:${b.longestMm ?? 40}`).join("|");
  return `${bps}#${sets}#${boxes}#${boards}`;
}

export type ShotDrawPart = {
  mesh: BoxMesh;
  image: HTMLCanvasElement | HTMLImageElement | null;
  backImage?: HTMLCanvasElement | HTMLImageElement | null;
  tint?: [number, number, number];
  local: Mat4;
};

export function shotItemContentKey(item: ProductShotItem, project?: Project) {
  const base = `${item.kind}|${item.refId}|${item.setId ?? ""}|${item.cardId ?? ""}|${item.face ?? "front"}|${item.slotId ?? ""}`;
  if (!project) return base;
  if (item.kind === "box") {
    const box = (project.boxes ?? []).find((b) => b.id === item.refId);
    return `${base}|${box?.bevelMm ?? 0}|${box?.lengthMm ?? 0}x${box?.widthMm ?? 0}x${box?.heightMm ?? 0}|${box?.textureAssetId ?? ""}`;
  }
  if (item.kind === "board") {
    const piece = (project.boards ?? []).find((b) => b.id === item.refId);
    if (piece) return `${base}|brd|${piece.textureAssetId}|${piece.thicknessMm}|${piece.longestMm ?? 40}`;
    const bp = project.blueprints.find((b) => b.id === item.refId);
    return `${base}|${bp?.size.w}x${bp?.size.h}|${bp?.cornerRadiusMm}|${cardStockMm(bp)}`;
  }
  if (item.kind === "stack") {
    const set = project.sets.find((s) => s.id === item.refId);
    const bp = project.blueprints.find((b) => b.id === set?.blueprintId);
    const look = item.stack;
    const slice = stackSlice(set, look);
    const drawn = stackDrawCards(set, look);
    const top = slice[slice.length - 1];
    const ids = drawn.map((c, i) => `${c.id}@${i}`).join(",");
    return `${base}|${bp?.size.w}x${bp?.size.h}|${bp?.cornerRadiusMm}|${cardStockMm(bp)}|${bp?.core}|${stackShapeOf(look)}|${slice.length}|${drawn.length}|${top?.id ?? ""}|${look?.countFrom ?? ""}|${look?.countTo ?? ""}|${ids}|${look?.gapMm ?? ""}|${look?.fanInnerMm ?? ""}|${look?.fanOuterMm ?? ""}|${look?.fanDeg ?? ""}|${look?.fanDir ?? ""}|${look?.fanLeaf ?? ""}|${look?.spread ?? ""}|${look?.messy ?? ""}`;
  }
  const bp = project.blueprints.find((b) => b.id === item.refId);
  return `${base}|${bp?.size.w}x${bp?.size.h}|${bp?.cornerRadiusMm}|${cardStockMm(bp)}|${bp?.core}`;
}

export function itemModel(item: ProductShotItem): Mat4 {
  const s = item.scale ?? 1;
  const r = item.rotationDeg;
  return matMul(
    matTranslate(item.position.x, item.position.y, item.position.z),
    matMul(matRotateXYZ((r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180), matScale(s, s, s)),
  );
}

function rgbCss(rgb: [number, number, number]) {
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
}

function solidCoreCanvas(w: number, h: number, rgb: [number, number, number]): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(8, w);
  out.height = Math.max(8, h);
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.fillStyle = rgbCss(rgb);
    ctx.fillRect(0, 0, out.width, out.height);
  }
  return out;
}

function flattenOntoCore(src: HTMLCanvasElement, rgb: [number, number, number]): HTMLCanvasElement {
  const out = solidCoreCanvas(src.width, src.height, rgb);
  out.getContext("2d")?.drawImage(src, 0, 0);
  return out;
}

async function renderFace(
  project: Project,
  blueprintId: string,
  face: "front" | "back",
  fields: Record<string, string>,
  honorVisibleWhen: boolean,
  dpi: number,
): Promise<HTMLCanvasElement | null> {
  const bp = project.blueprints.find((b) => b.id === blueprintId);
  if (!bp) return null;
  const template = templateFromBlueprint(bp, face);
  const rgb = cardCoreRgb(bp);
  const key = `${blueprintId}|${face}|${dpi}|${JSON.stringify(fields)}|${honorVisibleWhen}|${template.layers.length}`;
  const hit = cardCache.get(key);
  if (hit) return hit;
  if (!template.layers.length) {
    const blank = solidCoreCanvas(Math.round(mmToPx(bp.size.w, dpi)), Math.round(mmToPx(bp.size.h, dpi)), rgb);
    cardCache.set(key, blank);
    return blank;
  }
  try {
    const canvas = await renderCardToCanvas(template, {
      dpi,
      fields,
      assets: project.assets,
      project,
      honorVisibleWhen,
      cropBleed: true,
    });
    const opaque = flattenOntoCore(canvas, rgb);
    cardCache.set(key, opaque);
    return opaque;
  } catch {
    const fallback = solidCoreCanvas(Math.round(mmToPx(bp.size.w, dpi)), Math.round(mmToPx(bp.size.h, dpi)), rgb);
    cardCache.set(key, fallback);
    return fallback;
  }
}

function placeholderSlab(): BoxMesh {
  return roundedSlabMesh(63, 88, 0.32, 3);
}

function missingBoardMesh(piece?: BoardPiece): BoxMesh {
  const long = piece ? boardLongestMm(piece) : 40;
  const thick = piece ? Math.max(0.4, boardThicknessMm(piece)) : 2;
  return roundedSlabMesh(long, long * 0.72, thick, 0);
}

const MISSING_TINT: [number, number, number] = [0.86, 0.28, 0.32];

function oppositeFace(face: "front" | "back"): "front" | "back" {
  return face === "back" ? "front" : "back";
}

function cardFaceLocal(item: ProductShotItem): Mat4 {
  return item.kind === "card" && itemFaceDown(item) ? faceFlipMat() : matIdentity();
}

export function stubShotDrawItem(item: ProductShotItem, selectedId: string | null, project: Project): SceneDrawItem {
  const model = itemModel(item);
  const selected = item.id === selectedId;
  const tint: [number, number, number] = [0.55, 0.55, 0.62];
  if (item.kind === "box") {
    const box = (project.boxes ?? []).find((b) => b.id === item.refId);
    return {
      id: item.id,
      mesh: box
        ? boxMesh(box)
        : boxMesh({
            id: "ph",
            name: "ph",
            lengthMm: 100,
            widthMm: 150,
            heightMm: 50,
            faces: defaultUvNet(100, 150, 50),
          }),
      image: null,
      model,
      selected,
      tint,
    };
  }
  if (item.kind === "stack") {
    const set = project.sets.find((s) => s.id === item.refId);
    const bp = set ? project.blueprints.find((b) => b.id === set.blueprintId) : undefined;
    const n = Math.max(1, stackSlice(set, item.stack).length);
    const thick = bp ? n * cardStockMm(bp) : 6;
    return {
      id: item.id,
      mesh: bp ? roundedSlabMesh(bp.size.w, bp.size.h, thick, bp.cornerRadiusMm) : roundedSlabMesh(63, 88, 6, 3),
      image: null,
      backImage: null,
      model,
      selected,
      tint: bp ? cardCoreRgb(bp) : tint,
    };
  }
  const set = item.setId ? project.sets.find((s) => s.id === item.setId) : undefined;
  const bp =
    project.blueprints.find((b) => b.id === item.refId) ??
    project.blueprints.find((b) => b.id === set?.blueprintId);
  if (item.kind === "board") {
    const piece = (project.boards ?? []).find((b) => b.id === item.refId);
    if (piece) {
      return {
        id: item.id,
        mesh: missingBoardMesh(piece),
        image: null,
        backImage: null,
        model,
        selected,
        tint: MISSING_TINT,
      };
    }
    return {
      id: item.id,
      mesh: bp ? roundedSlabMesh(bp.size.w, bp.size.h, Math.max(0.4, cardStockMm(bp)), bp.cornerRadiusMm) : missingBoardMesh(),
      image: null,
      backImage: null,
      model,
      selected,
      tint: bp ? [0.7, 0.68, 0.64] : MISSING_TINT,
    };
  }
  return {
    id: item.id,
    mesh: bp ? roundedSlabMesh(bp.size.w, bp.size.h, cardStockMm(bp), bp.cornerRadiusMm) : placeholderSlab(),
    image: null,
    backImage: null,
    model,
    selected,
    tint: bp ? cardCoreRgb(bp) : tint,
  };
}

export async function resolveShotDrawItems(
  items: ProductShotItem[],
  selectedId: string | null,
  project: Project,
  projectDir?: string | null,
  opts?: { dpi?: number },
): Promise<SceneDrawItem[]> {
  const dpi = opts?.dpi ?? 96;
  const out: SceneDrawItem[] = [];
  for (const item of items) {
    const model = itemModel(item);
    const selected = item.id === selectedId;
    if (item.kind === "box") {
      if (!item.refId) {
        out.push(stubShotDrawItem(item, selectedId, project));
        continue;
      }
      const box = (project.boxes ?? []).find((b) => b.id === item.refId);
      if (!box) continue;
      let image: HTMLCanvasElement | HTMLImageElement | null = null;
      const src = box.textureAssetId ? project.assets[box.textureAssetId] : null;
      if (src) {
        try {
          image = await loadFittedBoxTexture(src, projectDir, boxTextureFit(box), box.textureTileScale ?? 1);
        } catch {
          image = null;
        }
      }
      out.push({ id: item.id, mesh: boxMesh(box), image, model, selected });
      continue;
    }
    if (item.kind === "board") {
      const piece = (project.boards ?? []).find((b) => b.id === item.refId);
      if (piece) {
        const src = piece.textureAssetId ? project.assets[piece.textureAssetId] : undefined;
        try {
          const { cutout, image } = await loadBoardCutout(piece, src, projectDir);
          out.push({
            id: item.id,
            mesh: cutout.mesh,
            image,
            backImage: image,
            model,
            selected,
            tint: cutout.edgeRgb,
          });
        } catch {
          out.push(stubShotDrawItem(item, selectedId, project));
        }
        continue;
      }
      const bp = project.blueprints.find((b) => b.id === item.refId);
      if (!bp) {
        if (!item.refId) out.push(stubShotDrawItem(item, selectedId, project));
        else out.push(stubShotDrawItem(item, selectedId, project));
        continue;
      }
      const up = item.face ?? "front";
      const image = await renderFace(project, bp.id, up, {}, false, dpi);
      const backImage = await renderFace(project, bp.id, oppositeFace(up), {}, false, dpi);
      out.push({
        id: item.id,
        mesh: roundedSlabMesh(bp.size.w, bp.size.h, Math.max(0.4, cardStockMm(bp)), bp.cornerRadiusMm),
        image,
        backImage,
        model,
        selected,
        tint: [0.7, 0.68, 0.64],
      });
      continue;
    }
    if (item.kind === "stack") {
      const parts = await resolveStackParts(item, project, dpi);
      for (const part of parts) {
        out.push({
          id: item.id,
          mesh: part.mesh,
          image: part.image,
          backImage: part.backImage,
          tint: part.tint,
          model: matMul(model, part.local),
          selected,
        });
      }
      continue;
    }
    const set = item.setId ? project.sets.find((s) => s.id === item.setId) : undefined;
    const bp = project.blueprints.find((b) => b.id === item.refId);
    if (!item.refId || !bp) {
      out.push(stubShotDrawItem(item, selectedId, project));
      continue;
    }
    const card = set?.cards.find((c) => c.id === item.cardId) ?? set?.cards[0];
    const honor = !!card;
    const fields = card?.fields ?? {};
    const image = await renderFace(project, bp.id, "front", fields, honor, dpi);
    const backImage = await renderFace(project, bp.id, "back", fields, honor, dpi);
    out.push({
      id: item.id,
      mesh: roundedSlabMesh(bp.size.w, bp.size.h, cardStockMm(bp), bp.cornerRadiusMm),
      image,
      backImage,
      model: matMul(model, cardFaceLocal(item)),
      selected,
      tint: cardCoreRgb(bp),
    });
  }
  return out;
}

export function composeShotDrawItems(
  items: ProductShotItem[],
  selectedId: string | null,
  project: Project,
  cache: Map<string, ShotDrawPart[]>,
): SceneDrawItem[] {
  return items.flatMap((it) => {
    const hit = cache.get(shotItemContentKey(it, project));
    if (!hit?.length) return [stubShotDrawItem(it, selectedId, project)];
    const model = itemModel(it);
    const selected = it.id === selectedId;
    return hit.map((part) => ({
      id: it.id,
      mesh: part.mesh,
      image: part.image,
      backImage: part.backImage,
      tint: part.tint,
      model: matMul(model, part.local),
      selected,
    }));
  });
}

export async function resolveShotItemParts(
  item: ProductShotItem,
  project: Project,
  projectDir?: string | null,
  opts?: { dpi?: number },
): Promise<ShotDrawPart[]> {
  const dpi = opts?.dpi ?? 96;
  if (item.kind === "stack") return resolveStackParts(item, project, dpi);
  const drawn = await resolveShotDrawItems([item], null, project, projectDir, { dpi });
  return drawn.map((d) => ({
    mesh: d.mesh,
    image: d.image,
    backImage: d.backImage,
    tint: d.tint,
    local: cardFaceLocal(item),
  }));
}

async function resolveStackParts(item: ProductShotItem, project: Project, dpi: number): Promise<ShotDrawPart[]> {
  const set = project.sets.find((s) => s.id === item.refId);
  const bp = set ? project.blueprints.find((b) => b.id === set.blueprintId) : undefined;
  if (!item.refId || !set || !bp) {
    const stub = stubShotDrawItem(item, null, project);
    return [{ mesh: stub.mesh, image: null, backImage: null, tint: stub.tint, local: matIdentity() }];
  }
  const look = item.stack;
  const shape = stackShapeOf(look);
  const tint = cardCoreRgb(bp);
  const down = itemFaceDown(item);
  const backImage = await renderFace(project, bp.id, "back", {}, true, dpi);
  if (shape === "deck") {
    const slice = stackSlice(set, look);
    const n = Math.max(1, slice.length);
    const top = slice[slice.length - 1];
    const image = await renderFace(project, bp.id, "front", top?.fields ?? {}, true, dpi);
    const { poses } = stackLayout(item.id, 1, bp, look, down);
    return [
      {
        mesh: roundedSlabMesh(bp.size.w, bp.size.h, n * cardStockMm(bp), bp.cornerRadiusMm),
        image,
        backImage,
        tint,
        local: poses[0] ?? matIdentity(),
      },
    ];
  }
  const cards = stackDrawCards(set, look);
  const thick = stackMeshThickMm(bp);
  const mesh = roundedSlabMesh(bp.size.w, bp.size.h, thick, bp.cornerRadiusMm);
  const { poses } = stackLayout(item.id, cards.length, bp, look, down);
  const parts: ShotDrawPart[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const image = await renderFace(project, bp.id, "front", card.fields, true, dpi);
    parts.push({
      mesh,
      image,
      backImage,
      tint,
      local: poses[i] ?? matIdentity(),
    });
  }
  return parts.length
    ? parts
    : [{ mesh: roundedSlabMesh(bp.size.w, bp.size.h, thick, bp.cornerRadiusMm), image: null, backImage, tint, local: matIdentity() }];
}

export function placeYForItem(
  kind: ProductShotItem["kind"],
  project: Project,
  refId: string,
  setId?: string,
  stack?: ShotStackLook,
  itemId?: string,
  faceDown = false,
): number {
  if (kind === "box") {
    const box = (project.boxes ?? []).find((b) => b.id === refId);
    return (box?.heightMm ?? 50) / 2;
  }
  if (kind === "board") {
    const piece = (project.boards ?? []).find((b) => b.id === refId);
    if (piece) return Math.max(0.12, boardThicknessMm(piece)) / 2;
    const bp = project.blueprints.find((b) => b.id === refId);
    return Math.max(0.4, cardStockMm(bp)) / 2;
  }
  if (kind === "stack") {
    const set = project.sets.find((s) => s.id === refId);
    const bp = project.blueprints.find((b) => b.id === set?.blueprintId);
    return stackRestY(bp, set, stack, itemId, faceDown);
  }
  const bp =
    project.blueprints.find((b) => b.id === refId) ??
    project.blueprints.find((b) => b.id === project.sets.find((s) => s.id === setId)?.blueprintId);
  return cardStockMm(bp) / 2;
}

export function placeYForShotItem(item: ProductShotItem, project: Project): number {
  return placeYForItem(item.kind, project, item.refId, item.setId, item.stack, item.id, itemFaceDown(item));
}

export function defaultLieRotation(_kind: ProductShotItem["kind"]): { x: number; y: number; z: number } {
  return { x: 0, y: 0, z: 0 };
}
