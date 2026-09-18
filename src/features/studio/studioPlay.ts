import { orbitEye, packagingPartMeshes, type Vec3 } from "@/features/box/boxGeom";
import { fanInnerDefault, fanOuterDefault, STACK_CARD_CAP } from "@/features/shot/shotStack";
import { defaultLieRotation, placeYForItem } from "@/features/shot/shotResolve";
import { boxLidLiftVec, boxLidOpen, boxModeOf } from "@/model/box";
import { shotCameraFromOrbit } from "@/model/shotCamera";
import {
  actorOf,
  studioCardCount,
  studioDuration,
  studioLookThroughOf,
  studioParamsOf,
  studioViewCameraOf,
} from "@/model/studio";
import type {
  BoxRenderSetup,
  PackagingBox,
  ProductShotItem,
  Project,
  ShotCamera,
  ShotStackLook,
  Studio,
  StudioOrbitCamera,
} from "@/model/types";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hideBackdropItem(it: ProductShotItem, studio: Studio) {
  const box = actorOf(studio, "box");
  const stack = actorOf(studio, "stack");
  if (box && it.kind === "box" && it.refId === box.refId) return true;
  if (stack && it.kind === "stack" && it.refId === stack.refId) return true;
  if (stack && it.kind === "card" && it.setId === stack.refId) return true;
  return false;
}

function meshAabb(parts: { mesh: { pos: Float32Array } }[]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of parts) {
    const pos = p.mesh.pos;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!;
      const y = pos[i + 1]!;
      const z = pos[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, z: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
}

/** 开盒后把天+地 AABB 中心钉回合盖中心。 */
export function studioBoxRecenter(box: PackagingBox, lidOpen: number): { x: number; y: number; z: number } {
  if (boxModeOf(box) !== "lidBase" || lidOpen <= 0) return { x: 0, y: 0, z: 0 };
  const parts = packagingPartMeshes(box, 0);
  const closed = meshAabb(parts);
  const lift = boxLidLiftVec(box, lidOpen);
  const opened = parts.map((p) => {
    if (p.part !== "lid") return p;
    const pos = new Float32Array(p.mesh.pos);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += lift[0];
      pos[i + 1] += lift[1];
      pos[i + 2] += lift[2];
    }
    return { mesh: { pos } };
  });
  const openC = meshAabb(opened);
  return { x: closed.x - openC.x, y: closed.y - openC.y, z: closed.z - openC.z };
}

function actorBoxItem(studio: Studio, project: Project, lidOpen?: number): ProductShotItem {
  const actor = actorOf(studio, "box");
  const kind = "box" as const;
  const refId = actor?.refId ?? "";
  const box = (project.boxes ?? []).find((b) => b.id === refId);
  const open = lidOpen ?? actor?.lidOpen ?? (box ? boxLidOpen(box) : 0);
  const y = placeYForItem(kind, project, refId);
  const shift = box ? studioBoxRecenter(box, open) : { x: 0, y: 0, z: 0 };
  return {
    id: "studio-actor-box",
    kind,
    refId,
    position: { x: shift.x, y: y + shift.y, z: shift.z },
    rotationDeg: { x: 0, y: 0, z: 0 },
    scale: 1,
    lidOpen: open,
  };
}

function actorStackItem(studio: Studio, project: Project, stack: ShotStackLook): ProductShotItem {
  const actor = actorOf(studio, "stack");
  const kind = "stack" as const;
  const refId = actor?.refId ?? "";
  const face = actor?.face === "back" ? "back" : "front";
  const y = placeYForItem(kind, project, refId, undefined, stack, "studio-actor-stack", face === "back");
  return {
    id: "studio-actor-stack",
    kind,
    refId,
    face,
    position: { x: 0, y, z: 0 },
    rotationDeg: defaultLieRotation(kind),
    scale: 1,
    stack,
  };
}

function actorStackLook(studio: Studio): ShotStackLook {
  const actor = actorOf(studio, "stack");
  return { shape: "fan", spread: "ltr", gapMm: 4, ...actor?.stack };
}

function stackLookAt(studio: Studio, project: Project, t: number): ShotStackLook | null {
  if (studio.templateId !== "card-spread" && studio.templateId !== "card-batch") return null;
  const end = actorStackLook(studio);
  const actor = actorOf(studio, "stack");
  const set = actor ? project.sets.find((s) => s.id === actor.refId) : undefined;
  const bp = set ? project.blueprints.find((b) => b.id === set.blueprintId) : undefined;
  const innerT = end.fanInnerMm ?? (bp ? fanInnerDefault(bp) : 36);
  const outerT = end.fanOuterMm ?? (bp ? fanOuterDefault(bp) : 240);
  const gap = end.gapMm ?? 4;
  const n = studioCardCount(studio, project);
  const base: ShotStackLook = { ...end, gapMm: gap, fanInnerMm: innerT, fanOuterMm: outerT };
  if (studio.templateId === "card-spread") {
    const dur = studioDuration(studio, project) || 1;
    const u = clamp01(t / dur);
    const endShape = end.shape ?? "fan";
    return {
      ...base,
      shape: endShape === "deck" ? "row" : endShape,
      gapMm: lerp(0, gap, u),
      fanInnerMm: lerp(4, innerT, u),
      fanOuterMm: lerp(12, outerT, u),
    };
  }
  const p = studioParamsOf(studio);
  const size = Math.max(1, Math.round(p.batchSize ?? 8));
  const gapSec = Math.max(0.01, p.batchGapSeconds ?? 0.8);
  const shown = Math.min(n, size * Math.max(1, Math.floor(t / gapSec) + 1));
  const from = Math.max(1, Math.round(end.countFrom ?? 1));
  return {
    ...base,
    countFrom: from,
    countTo: Math.min(STACK_CARD_CAP, from + shown - 1),
  };
}

export function studioTurnYaw(studio: Studio, t: number, _project?: Project) {
  const p = studioParamsOf(studio);
  const time = Math.max(0, t);
  if (studio.templateId === "unbox-turntable") {
    const unbox = Math.max(0.01, p.unboxSeconds ?? 1.5);
    const turn = Math.max(0.01, p.turnSeconds ?? 4);
    const turns = Math.max(0.01, p.turns ?? 1);
    const turnStart = p.overlapUnboxTurn ? 0 : unbox;
    return clamp01((time - turnStart) / turn) * 360 * turns;
  }
  if (studio.templateId === "box-turntable") {
    const turn = Math.max(0.01, p.turnSeconds ?? 4);
    const turns = Math.max(0.01, p.turns ?? 1);
    return clamp01(time / turn) * 360 * turns;
  }
  return 0;
}

export function studioOrbitPath(studio: Studio): Vec3[] {
  if (studio.templateId !== "unbox-turntable" && studio.templateId !== "box-turntable") return [];
  const cam = studio.render.camera;
  const target: Vec3 = [cam.target?.x ?? 0, cam.target?.y ?? 0, cam.target?.z ?? 0];
  const turns = Math.max(0.01, studioParamsOf(studio).turns ?? 1);
  const sweepDeg = 360 * Math.min(1, turns);
  const segs = Math.max(24, Math.round(64 * Math.min(1, turns)));
  const pts: Vec3[] = [];
  for (let i = 0; i <= segs; i++) {
    const yaw = cam.yaw + (i / segs) * sweepDeg;
    pts.push(orbitEye(yaw, cam.pitch, cam.distance, target));
  }
  return pts;
}

export function studioRenderCamAt(studio: Studio, t: number, project: Project): ShotCamera {
  const yaw = studio.render.camera.yaw + studioTurnYaw(studio, t, project);
  return shotCameraFromOrbit(
    { ...studio.render.camera, yaw },
    { id: "studio-render-cam", name: "渲染机", projection: studio.render.projection },
  );
}

export function studioScene(
  studio: Studio,
  t: number,
  project: Project,
): {
  items: ProductShotItem[];
  viewSetup: BoxRenderSetup;
  sequenceSetup: BoxRenderSetup;
  renderCam: ShotCamera;
  path: Vec3[];
} {
  const p = studioParamsOf(studio);
  const dur = studioDuration(studio, project);
  const time = Math.max(0, Math.min(dur || 0, t));
  const dYaw = studioTurnYaw(studio, time, project);
  let lidOpen: number | undefined;

  if (studio.templateId === "unbox-turntable") {
    const actor = actorOf(studio, "box");
    const start = clamp01(actor?.lidOpen ?? 0);
    const unbox = Math.max(0.01, p.unboxSeconds ?? 1.5);
    lidOpen = lerp(start, 1, clamp01(time / unbox));
  } else if (studio.templateId === "box-turntable") {
    lidOpen = actorOf(studio, "box")?.lidOpen;
  }

  const items: ProductShotItem[] = [];
  const backdrop = studio.backdrop;
  if (backdrop?.kind === "shot" && backdrop.shotId) {
    const shot = (project.shots ?? []).find((s) => s.id === backdrop.shotId);
    if (shot) {
      for (const it of shot.items) {
        if (hideBackdropItem(it, studio)) continue;
        items.push({ ...it, id: `bg-${it.id}` });
      }
    }
  }

  const needBox = studio.templateId === "unbox-turntable" || studio.templateId === "box-turntable";
  if (needBox) items.push(actorBoxItem(studio, project, lidOpen));

  const stackLook = stackLookAt(studio, project, time);
  if (stackLook) items.push(actorStackItem(studio, project, stackLook));

  let background = studio.render.background;
  if (backdrop?.kind === "color") background = backdrop.color ?? background;

  const seqCam = { ...studio.render.camera, yaw: studio.render.camera.yaw + dYaw };
  const lights = { ...studio.render.lights, key: { ...studio.render.lights.key } };
  if (p.lightsFollowTurn) lights.key.yaw = (lights.key.yaw ?? 0) + dYaw;

  const sequenceSetup: BoxRenderSetup = {
    ...studio.render,
    background,
    camera: seqCam,
    lights,
  };

  const look = studioLookThroughOf(studio);
  const viewCam = studioViewCameraOf(studio);
  const viewOrbit: StudioOrbitCamera = look === "render"
    ? {
        yaw: seqCam.yaw,
        pitch: seqCam.pitch,
        distance: seqCam.distance,
        fov: seqCam.fov,
        target: seqCam.target,
        projection: studio.render.projection,
      }
    : viewCam;

  const viewSetup: BoxRenderSetup = {
    ...sequenceSetup,
    camera: {
      yaw: viewOrbit.yaw,
      pitch: viewOrbit.pitch,
      distance: viewOrbit.distance,
      fov: viewOrbit.fov,
      target: viewOrbit.target,
    },
    projection: viewOrbit.projection ?? studio.render.projection,
  };

  return {
    items,
    viewSetup,
    sequenceSetup,
    renderCam: studioRenderCamAt(studio, time, project),
    path: studioOrbitPath(studio),
  };
}

export function studioSheetLines(studio: Studio, project: Project, frames: number, seconds: number): string {
  const box = actorOf(studio, "box");
  const stack = actorOf(studio, "stack");
  const boxName = box ? (project.boxes ?? []).find((b) => b.id === box.refId)?.name ?? box.refId : "无";
  const setName = stack ? project.sets.find((s) => s.id === stack.refId)?.name ?? stack.refId : "无";
  let backdrop = "无";
  if (studio.backdrop?.kind === "color") backdrop = `纯色 ${studio.backdrop.color ?? ""}`;
  if (studio.backdrop?.kind === "shot") {
    const shot = (project.shots ?? []).find((s) => s.id === studio.backdrop?.shotId);
    backdrop = shot?.name ?? "场景丢失";
  }
  const w = studio.render.resolutionW || 1920;
  const h = studio.render.resolutionH || 1080;
  return [
    `名称：${studio.name}`,
    `模版：${studio.templateId}`,
    `分辨率：${w}×${h}`,
    `fps：${studio.fps ?? 24}`,
    `帧数：${frames}`,
    `秒数：${seconds.toFixed(3)}`,
    `透明底：${studio.render.cullBackground ? "是" : "否"}`,
    `演员盒：${boxName}`,
    `演员卡牌集：${setName}`,
    `布景：${backdrop}`,
  ].join("\n");
}
