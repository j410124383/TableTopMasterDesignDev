import { boxLidOpen, boxMaterialOf, boxModeOf, boxTextureFit, boxTextureRotationDeg, partMapsOf, simplePartMaps } from "@/model/box";
import type { BoxPartMaps, PackagingBox, TextureFit } from "@/model/types";
import { packagingPartMeshes, type Mat4 } from "./boxGeom";
import { loadFittedBoxTexture } from "./boxTexture";
import type { SceneDrawItem } from "./boxGl";

function parseRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function packagingLookOf(box: PackagingBox) {
  const mat = boxMaterialOf(box);
  return {
    baseColor: parseRgb(mat.baseColor),
    metallic: mat.metallic,
    roughness: mat.roughness,
    foilColor: parseRgb(mat.foilColor),
    foilMetallic: mat.foilMetallic,
    foilRoughness: mat.foilRoughness,
    foilGrain: mat.foilGrain,
    foilCell: mat.foilGrainStyle === "frost" ? 0 : 1,
    varnishRoughness: mat.varnishRoughness,
    varnishCoat: mat.varnishCoat,
  };
}

async function loadMask(
  assetId: string | undefined,
  maps: BoxPartMaps,
  assets: Record<string, string>,
  projectDir?: string | null,
) {
  return loadFitted(
    assetId,
    maps.textureFit,
    maps.textureTileScale,
    maps.textureRotationDeg,
    assets,
    projectDir,
  );
}

async function loadFitted(
  assetId: string | undefined,
  fit: TextureFit | undefined,
  tile: number | undefined,
  rotationDeg: number | undefined,
  assets: Record<string, string>,
  projectDir?: string | null,
) {
  const src = assetId ? assets[assetId] : null;
  if (!src) return null;
  try {
    return await loadFittedBoxTexture(
      src,
      projectDir,
      fit ?? "cover",
      tile ?? 1,
      boxTextureRotationDeg(rotationDeg),
    );
  } catch {
    return null;
  }
}

async function loadPrint(maps: BoxPartMaps, assets: Record<string, string>, projectDir?: string | null) {
  return loadFitted(
    maps.textureAssetId,
    maps.textureFit,
    maps.textureTileScale,
    maps.textureRotationDeg,
    assets,
    projectDir,
  );
}

async function loadInnerPrint(maps: BoxPartMaps, assets: Record<string, string>, projectDir?: string | null) {
  return loadFitted(
    maps.innerTextureAssetId,
    maps.innerTextureFit,
    maps.innerTextureTileScale,
    maps.innerTextureRotationDeg,
    assets,
    projectDir,
  );
}

export type PackagingLayerTex = {
  image: HTMLImageElement | HTMLCanvasElement | null;
  foilImage: HTMLImageElement | HTMLCanvasElement | null;
  varnishImage: HTMLImageElement | HTMLCanvasElement | null;
};

export async function loadPackagingLayerTextures(
  box: PackagingBox,
  assets: Record<string, string>,
  projectDir?: string | null,
): Promise<Map<string, PackagingLayerTex>> {
  const out = new Map<string, PackagingLayerTex>();
  const add = async (part: string, maps: BoxPartMaps, inner: boolean) => {
    out.set(`${part}:${inner ? "inner" : "outer"}`, {
      image: inner ? await loadInnerPrint(maps, assets, projectDir) : await loadPrint(maps, assets, projectDir),
      foilImage: inner ? null : await loadMask(maps.foilMaskAssetId, maps, assets, projectDir),
      varnishImage: inner ? null : await loadMask(maps.varnishMaskAssetId, maps, assets, projectDir),
    });
  };
  if (box.mode !== "lidBase") {
    await add("body", simplePartMaps(box), false);
    return out;
  }
  for (const part of ["base", "lid"] as const) {
    const maps = partMapsOf(box, part);
    await add(part, maps, false);
    await add(part, maps, true);
  }
  return out;
}

export function packagingItemsWithTextures(
  box: PackagingBox,
  model: Mat4,
  textures: Map<string, PackagingLayerTex>,
  lidOpen = 0,
  selected = false,
): SceneDrawItem[] {
  const look = packagingLookOf(box);
  return packagingPartMeshes(box, lidOpen).map((part) => {
    const tex = textures.get(`${part.part}:${part.layer}`);
    return {
      id: `${box.id}:${part.part}:${part.layer}`,
      mesh: part.mesh,
      image: tex?.image ?? null,
      foilImage: tex?.foilImage ?? null,
      varnishImage: tex?.varnishImage ?? null,
      model,
      selected,
      tint: [1, 1, 1] as [number, number, number],
      look,
      coverBase: true,
    };
  });
}

export async function resolvePackagingDrawItems(
  box: PackagingBox,
  assets: Record<string, string>,
  projectDir: string | null | undefined,
  model: Mat4,
  selected: boolean,
  lidOpen?: number,
): Promise<SceneDrawItem[]> {
  const textures = await loadPackagingLayerTextures(box, assets, projectDir);
  return packagingItemsWithTextures(box, model, textures, lidOpen ?? boxLidOpen(box), selected);
}

export function packagingTextureFit(box: PackagingBox) {
  return boxTextureFit(box);
}

export function packagingIsDetailed(box: PackagingBox) {
  return boxModeOf(box) === "lidBase";
}
