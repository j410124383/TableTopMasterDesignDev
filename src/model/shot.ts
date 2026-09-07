import { uid } from "@/lib/id";
import { defaultBoxRender } from "./box";
import type { ProductShot, ProductShotItem, ProductShotLook } from "./types";

export function defaultShotLook(): ProductShotLook {
  return {
    outline: { enabled: false, color: "#111111", widthPx: 3 },
    vignette: 0,
    bloom: 0,
    exposure: 1,
    contrast: 1,
    saturation: 1,
    blur: 0,
  };
}

export function createProductShot(name = "产品图 1"): ProductShot {
  return {
    id: uid("shot"),
    name,
    items: [],
    render: defaultBoxRender(120, 120, 80),
    look: defaultShotLook(),
  };
}

export function ensureShotLook(look?: ProductShotLook): ProductShotLook {
  const d = defaultShotLook();
  return {
    ...d,
    ...look,
    outline: { ...d.outline!, ...look?.outline },
  };
}

export function nextItemOffset(items: ProductShotItem[]): { x: number; y: number; z: number } {
  const n = items.length;
  return { x: (n % 4) * 70 - 105, y: 0, z: Math.floor(n / 4) * 70 };
}
