import { boxTextureFit, defaultUvNet } from "@/model/box";
import { templateFromBlueprint } from "@/model/normalize";
import { cardCoreRgb, cardStockMm, stackHeightMm } from "@/model/piece";
import type { ProductShotItem, Project } from "@/model/types";
import { renderCardToCanvas } from "@/render/drawCard";
import { mmToPx } from "@/lib/mm";
import { boxMesh, matMul, matRotateXYZ, matScale, matTranslate, roundedSlabMesh, type BoxMesh, type Mat4 } from "@/features/box/boxGeom";
import { loadFittedBoxTexture } from "@/features/box/boxTexture";
import type { SceneDrawItem } from "@/features/box/boxGl";

const cardCache = new Map<string, HTMLCanvasElement>();

export function shotGeomSig(project: Project) {
  const bps = project.blueprints.map((b) => `${b.id}:${b.thicknessMm}:${b.cornerRadiusMm}:${b.core}:${b.size.w}x${b.size.h}`).join("|");
  const sets = project.sets.map((s) => `${s.id}:${s.cards.reduce((n, c) => n + (c.qty || 0), 0)}`).join("|");
  const boxes = (project.boxes ?? []).map((b) => `${b.id}:${b.bevelMm}:${b.lengthMm}x${b.widthMm}x${b.heightMm}:${b.textureAssetId ?? ""}`).join("|");
  return `${bps}#${sets}#${boxes}`;
}

export function shotItemContentKey(item: ProductShotItem, project?: Project) {
  const base = `${item.kind}|${item.refId}|${item.setId ?? ""}|${item.cardId ?? ""}|${item.face ?? "front"}|${item.slotId ?? ""}`;
  if (!project) return base;
  if (item.kind === "box") {
    const box = (project.boxes ?? []).find((b) => b.id === item.refId);
    return `${base}|${box?.bevelMm ?? 0}|${box?.lengthMm ?? 0}x${box?.widthMm ?? 0}x${box?.heightMm ?? 0}|${box?.textureAssetId ?? ""}`;
  }
  if (item.kind === "stack") {
    const set = project.sets.find((s) => s.id === item.refId);
    const bp = project.blueprints.find((b) => b.id === set?.blueprintId);
    return `${base}|${bp?.size.w}x${bp?.size.h}|${bp?.cornerRadiusMm}|${cardStockMm(bp)}|${bp?.core}|${set?.cards.reduce((n, c) => n + (c.qty || 0), 0)}`;
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

function oppositeFace(face: "front" | "back"): "front" | "back" {
  return face === "back" ? "front" : "back";
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
    return {
      id: item.id,
      mesh: bp ? roundedSlabMesh(bp.size.w, bp.size.h, stackHeightMm(bp, set), bp.cornerRadiusMm) : roundedSlabMesh(63, 88, 6, 3),
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
    return {
      id: item.id,
      mesh: bp ? roundedSlabMesh(bp.size.w, bp.size.h, Math.max(0.4, cardStockMm(bp)), bp.cornerRadiusMm) : placeholderSlab(),
      image: null,
      backImage: null,
      model,
      selected,
      tint: [0.7, 0.68, 0.64],
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
      const bp = project.blueprints.find((b) => b.id === item.refId);
      if (!bp) continue;
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
      const set = project.sets.find((s) => s.id === item.refId);
      const bp = set ? project.blueprints.find((b) => b.id === set.blueprintId) : undefined;
      if (!item.refId || !set || !bp) {
        out.push(stubShotDrawItem(item, selectedId, project));
        continue;
      }
      const first = set.cards[0];
      const image = await renderFace(project, bp.id, "front", first?.fields ?? {}, true, dpi);
      const backImage = await renderFace(project, bp.id, "back", first?.fields ?? {}, true, dpi);
      const thick = stackHeightMm(bp, set);
      out.push({
        id: item.id,
        mesh: roundedSlabMesh(bp.size.w, bp.size.h, thick, bp.cornerRadiusMm),
        image,
        backImage,
        model,
        selected,
        tint: cardCoreRgb(bp),
      });
      continue;
    }
    const set = item.setId ? project.sets.find((s) => s.id === item.setId) : undefined;
    const bp = project.blueprints.find((b) => b.id === item.refId);
    if (!item.refId || !bp) {
      out.push(stubShotDrawItem(item, selectedId, project));
      continue;
    }
    const card = set?.cards.find((c) => c.id === item.cardId) ?? set?.cards[0];
    const up = item.face ?? "front";
    const honor = !!card;
    const fields = card?.fields ?? {};
    const image = await renderFace(project, bp.id, up, fields, honor, dpi);
    const backImage = await renderFace(project, bp.id, oppositeFace(up), fields, honor, dpi);
    out.push({
      id: item.id,
      mesh: roundedSlabMesh(bp.size.w, bp.size.h, cardStockMm(bp), bp.cornerRadiusMm),
      image,
      backImage,
      model,
      selected,
      tint: cardCoreRgb(bp),
    });
  }
  return out;
}

export function placeYForItem(kind: ProductShotItem["kind"], project: Project, refId: string, setId?: string): number {
  if (kind === "box") {
    const box = (project.boxes ?? []).find((b) => b.id === refId);
    return (box?.heightMm ?? 50) / 2;
  }
  if (kind === "board") {
    const bp = project.blueprints.find((b) => b.id === refId);
    return Math.max(0.4, cardStockMm(bp)) / 2;
  }
  if (kind === "stack") {
    const set = project.sets.find((s) => s.id === refId);
    const bp = project.blueprints.find((b) => b.id === set?.blueprintId);
    return stackHeightMm(bp, set) / 2;
  }
  const bp =
    project.blueprints.find((b) => b.id === refId) ??
    project.blueprints.find((b) => b.id === project.sets.find((s) => s.id === setId)?.blueprintId);
  return cardStockMm(bp) / 2;
}

export function defaultLieRotation(kind: ProductShotItem["kind"]): { x: number; y: number; z: number } {
  if (kind === "box") return { x: 0, y: 0, z: 0 };
  return { x: 0, y: 0, z: 0 };
}
