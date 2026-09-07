import { uid } from "@/lib/id";
import type { ProductShot, ProductShotItem, Project } from "@/model/types";
import { defaultLieRotation, placeYForItem } from "./shotResolve";

export type ShotLayoutId = "empty" | "box-fan" | "box-row" | "box-stack-fan";

export const SHOT_LAYOUTS: { id: ShotLayoutId; name: string }[] = [
  { id: "empty", name: "空场景" },
  { id: "box-fan", name: "盒 + 扇形卡" },
  { id: "box-row", name: "盒 + 一字卡" },
  { id: "box-stack-fan", name: "盒 + 一摞 + 扇开" },
];

type SlotDef = {
  slotId: string;
  kind: ProductShotItem["kind"];
  position: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
};

function fanCards(count: number, z: number, radius: number, spanDeg: number): SlotDef[] {
  const slots: SlotDef[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const yaw = -spanDeg / 2 + spanDeg * t;
    const rad = (yaw * Math.PI) / 180;
    slots.push({
      slotId: `card-${i}`,
      kind: "card",
      position: { x: Math.sin(rad) * radius, y: 0.16, z: z + (1 - Math.cos(rad)) * 12 },
      rotationDeg: { x: 0, y: yaw, z: 0 },
    });
  }
  return slots;
}

export function layoutSlots(id: ShotLayoutId): SlotDef[] {
  if (id === "empty") return [];
  const box: SlotDef = {
    slotId: "hero-box",
    kind: "box",
    position: { x: 0, y: 25, z: 0 },
    rotationDeg: { x: 0, y: 18, z: 0 },
  };
  if (id === "box-fan") return [box, ...fanCards(6, 95, 70, 70)];
  if (id === "box-row") {
    const row: SlotDef[] = [];
    for (let i = 0; i < 6; i++) {
      row.push({
        slotId: `card-${i}`,
        kind: "card",
        position: { x: -125 + i * 50, y: 0.16, z: 110 },
        rotationDeg: { x: 0, y: 0, z: 0 },
      });
    }
    return [box, ...row];
  }
  return [
    box,
    {
      slotId: "stack-0",
      kind: "stack",
      position: { x: -85, y: 5, z: 55 },
      rotationDeg: { x: 0, y: -12, z: 0 },
    },
    ...fanCards(5, 100, 62, 62),
  ];
}

export function applyShotLayout(
  shot: ProductShot,
  layoutId: ShotLayoutId,
  project: Project,
  keepFilled: boolean,
): ProductShot {
  const slots = layoutSlots(layoutId);
  const prev = shot.items;
  const items: ProductShotItem[] = slots.map((slot) => {
    const old = keepFilled ? prev.find((it) => it.slotId === slot.slotId) : undefined;
    const y = old?.refId ? placeYForItem(slot.kind, project, old.refId, old.setId) : slot.position.y;
    return {
      id: old?.id ?? uid("sit"),
      kind: slot.kind,
      refId: old?.refId ?? "",
      setId: old?.setId,
      cardId: old?.cardId,
      face: old?.face,
      position: { ...slot.position, y },
      rotationDeg: slot.rotationDeg,
      scale: old?.scale ?? 1,
      slotId: slot.slotId,
    };
  });
  return { ...shot, items, layoutId };
}

export function fillShotSlot(
  item: ProductShotItem,
  payload: Pick<ProductShotItem, "kind" | "refId" | "setId" | "cardId" | "face">,
  project: Project,
): ProductShotItem | null {
  if (item.kind !== payload.kind) return null;
  return {
    ...item,
    refId: payload.refId,
    setId: payload.setId,
    cardId: payload.cardId,
    face: payload.face,
    position: {
      ...item.position,
      y: placeYForItem(payload.kind, project, payload.refId, payload.setId),
    },
    rotationDeg: item.slotId ? item.rotationDeg : defaultLieRotation(payload.kind),
  };
}
