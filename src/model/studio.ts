import { uid } from "@/lib/id";
import { defaultBoxRender } from "./box";
import { ensureShotCameras } from "./shotCamera";
import type {
  BoxRenderSetup,
  PackagingBox,
  ProductShot,
  Project,
  ShotStackLook,
  Studio,
  StudioActor,
  StudioOrbitCamera,
  StudioParams,
  StudioTemplateId,
} from "./types";

export const STUDIO_TEMPLATES: {
  id: StudioTemplateId;
  name: string;
  blurb: string;
  slots: { slotId: "box" | "stack"; kind: "box" | "stack"; required: true; lidBase?: boolean }[];
}[] = [
  {
    id: "unbox-turntable",
    name: "开盒转台",
    blurb: "先开盖（或边开边转），再绕兴趣点转指定圈数。必须填详细天地盒。",
    slots: [{ slotId: "box", kind: "box", required: true, lidBase: true }],
  },
  {
    id: "box-turntable",
    name: "盒转台",
    blurb: "只转不拆。简单或详细包装盒都可以。",
    slots: [{ slotId: "box", kind: "box", required: true }],
  },
  {
    id: "card-spread",
    name: "排列展开",
    blurb: "卡牌集从收拢插值到演员终态。",
    slots: [{ slotId: "stack", kind: "stack", required: true }],
  },
  {
    id: "card-batch",
    name: "分批亮相",
    blurb: "按牌序一批一批出现在终态排列上。",
    slots: [{ slotId: "stack", kind: "stack", required: true }],
  },
];

export function studioTemplateOf(id: StudioTemplateId) {
  return STUDIO_TEMPLATES.find((t) => t.id === id) ?? STUDIO_TEMPLATES[0]!;
}

export function defaultStudioParams(id: StudioTemplateId): StudioParams {
  if (id === "unbox-turntable") return { unboxSeconds: 1.5, turnSeconds: 4, turns: 1, overlapUnboxTurn: false, lightsFollowTurn: false };
  if (id === "box-turntable") return { turnSeconds: 4, turns: 1, lightsFollowTurn: false };
  if (id === "card-batch") return { batchSize: 8, batchGapSeconds: 0.8 };
  return { spreadSeconds: 2 };
}

export function orbitFromRender(render: BoxRenderSetup): StudioOrbitCamera {
  return {
    yaw: render.camera.yaw,
    pitch: render.camera.pitch,
    distance: render.camera.distance,
    fov: render.camera.fov,
    target: render.camera.target ?? { x: 0, y: 0, z: 0 },
    projection: render.projection,
  };
}

export function studioViewCameraOf(studio: Studio): StudioOrbitCamera {
  return studio.viewCamera ?? orbitFromRender(studio.render);
}

export function studioLookThroughOf(studio: Studio): "view" | "render" {
  return studio.lookThrough === "render" ? "render" : "view";
}

export function createStudio(templateId: StudioTemplateId, name = "影棚 1"): Studio {
  return {
    id: uid("studio"),
    name,
    templateId,
    actors: [],
    backdrop: { kind: "none" },
    params: defaultStudioParams(templateId),
    render: defaultBoxRender(120, 120, 80),
    viewCamera: undefined,
    lookThrough: "view",
    fps: 24,
  };
}

export function migrateActorStackFromParams(studio: Studio): Studio {
  const p = studio.params as StudioParams & {
    spreadShape?: "fan" | "row";
    spread?: "ltr" | "rtl";
    countFrom?: number;
    countTo?: number;
    fanInnerMm?: number;
    fanOuterMm?: number;
    gapMm?: number;
  } | undefined;
  if (!p) return studio;
  const hasLegacy =
    p.spreadShape != null ||
    p.spread != null ||
    p.countFrom != null ||
    p.countTo != null ||
    p.fanInnerMm != null ||
    p.fanOuterMm != null ||
    p.gapMm != null;
  if (!hasLegacy) return studio;
  const actors = studio.actors.map((a) => {
    if (a.slotId !== "stack" || a.stack) return a;
    const shape = p.spreadShape === "row" ? "row" : p.spreadShape === "fan" ? "fan" : undefined;
    const stack: ShotStackLook = {
      ...(shape ? { shape } : {}),
      spread: p.spread,
      countFrom: p.countFrom,
      countTo: p.countTo,
      fanInnerMm: p.fanInnerMm,
      fanOuterMm: p.fanOuterMm,
      gapMm: p.gapMm,
    };
    return { ...a, stack };
  });
  const {
    spreadShape: _s,
    spread: _sp,
    countFrom: _f,
    countTo: _t,
    fanInnerMm: _i,
    fanOuterMm: _o,
    gapMm: _g,
    ...rest
  } = p;
  return { ...studio, actors, params: rest };
}

export function ensureStudio(studio: Studio): Studio {
  const migrated = migrateActorStackFromParams(studio);
  return {
    ...migrated,
    viewCamera: studioViewCameraOf(migrated),
    lookThrough: studioLookThroughOf(migrated),
  };
}

export function studioParamsOf(studio: Studio): StudioParams {
  return { ...defaultStudioParams(studio.templateId), ...studio.params };
}

export function studioFpsOf(studio: Studio) {
  const n = Number(studio.fps);
  return Number.isFinite(n) && n > 0 ? Math.min(60, Math.max(1, n)) : 24;
}

function posNum(n: unknown, fallback: number, min = 0.01) {
  const v = Number(n);
  return Number.isFinite(v) && v >= min ? v : fallback;
}

export function actorOf(studio: Studio, slotId: "box" | "stack"): StudioActor | undefined {
  return studio.actors.find((a) => a.slotId === slotId);
}

export function boxActorValid(studio: Studio, project: Project): { ok: boolean; reason?: string; box?: PackagingBox } {
  const need = studioTemplateOf(studio.templateId).slots.find((s) => s.slotId === "box");
  if (!need) return { ok: true };
  const actor = actorOf(studio, "box");
  if (!actor?.refId) return { ok: false, reason: need.lidBase ? "缺天地盒" : "缺包装盒" };
  const box = (project.boxes ?? []).find((b) => b.id === actor.refId);
  if (!box) return { ok: false, reason: need.lidBase ? "缺天地盒" : "缺包装盒" };
  if (need.lidBase && box.mode !== "lidBase") {
    return { ok: false, reason: "这个模版需要详细天地盒，简单方盒不能开盖" };
  }
  return { ok: true, box };
}

export function stackActorValid(studio: Studio, project: Project): { ok: boolean; reason?: string } {
  const need = studioTemplateOf(studio.templateId).slots.find((s) => s.slotId === "stack");
  if (!need) return { ok: true };
  const actor = actorOf(studio, "stack");
  if (!actor?.refId) return { ok: false, reason: "缺卡牌集" };
  const set = project.sets.find((s) => s.id === actor.refId);
  if (!set) return { ok: false, reason: "缺卡牌集" };
  return { ok: true };
}

export function studioBlockingReason(studio: Studio, project: Project): string | null {
  const box = boxActorValid(studio, project);
  if (!box.ok) return box.reason ?? "缺包装盒";
  const stack = stackActorValid(studio, project);
  if (!stack.ok) return stack.reason ?? "缺卡牌集";
  return null;
}

export function studioCanRender(studio: Studio, project: Project) {
  return !studioBlockingReason(studio, project);
}

export function studioCardCount(studio: Studio, project: Project): number {
  const actor = actorOf(studio, "stack");
  const set = actor ? project.sets.find((s) => s.id === actor.refId) : undefined;
  let n = 0;
  if (set) {
    for (const c of set.cards) n += Math.max(0, Number(c.qty) || 0);
  }
  n = Math.max(1, n);
  const look = actor?.stack;
  let from = look?.countFrom ?? 1;
  let to = look?.countTo ?? n;
  if (from > to) {
    const t = from;
    from = to;
    to = t;
  }
  from = Math.max(1, Math.min(n, Math.round(from)));
  to = Math.max(1, Math.min(n, Math.round(to)));
  return Math.min(48, to - from + 1);
}

export function studioDuration(studio: Studio, project: Project): number {
  const p = studioParamsOf(studio);
  if (studio.templateId === "unbox-turntable") {
    const unbox = posNum(p.unboxSeconds, 1.5);
    const turn = posNum(p.turnSeconds, 4);
    return p.overlapUnboxTurn ? Math.max(unbox, turn) : unbox + turn;
  }
  if (studio.templateId === "box-turntable") return posNum(p.turnSeconds, 4);
  if (studio.templateId === "card-spread") return posNum(p.spreadSeconds, 2);
  const n = studioCardCount(studio, project);
  const size = Math.max(1, Math.round(posNum(p.batchSize, 8, 1)));
  const batches = Math.max(1, Math.ceil(n / size));
  return batches * posNum(p.batchGapSeconds, 0.8);
}

export function studioFrameCount(studio: Studio, project: Project) {
  return Math.max(1, Math.round(studioDuration(studio, project) * studioFpsOf(studio)));
}

export function switchStudioTemplate(studio: Studio, templateId: StudioTemplateId): Studio {
  const spec = studioTemplateOf(templateId);
  const keep = studio.actors.filter((a) => spec.slots.some((s) => s.slotId === a.slotId && s.kind === a.kind));
  return {
    ...studio,
    templateId,
    actors: keep,
    params: defaultStudioParams(templateId),
  };
}

export function setStudioActor(studio: Studio, slotId: "box" | "stack", refId: string | null): Studio {
  const rest = studio.actors.filter((a) => a.slotId !== slotId);
  if (!refId) return { ...studio, actors: rest };
  const prev = studio.actors.find((a) => a.slotId === slotId);
  if (prev?.refId === refId) return studio;
  return { ...studio, actors: [...rest, { slotId, kind: slotId, refId }] };
}

export function copyShotOrbit(shot: ProductShot): Pick<BoxRenderSetup, "camera" | "projection"> {
  const live = ensureShotCameras(shot);
  const cam = live.cameras?.find((c) => c.id === live.lookThroughId) ?? live.cameras?.[0];
  const orbit = live.render.camera;
  return {
    camera: {
      yaw: orbit.yaw,
      pitch: orbit.pitch,
      distance: orbit.distance,
      fov: cam?.fov ?? orbit.fov,
      target: orbit.target ?? { x: 0, y: 0, z: 0 },
    },
    projection: cam?.projection ?? live.render.projection,
  };
}

export function applyStudioBackdropShot(studio: Studio, shotId: string, project: Project): Studio {
  const shot = (project.shots ?? []).find((s) => s.id === shotId);
  const prev = studio.backdrop?.kind === "shot" ? studio.backdrop.shotId : undefined;
  const next: Studio = { ...studio, backdrop: { kind: "shot", shotId } };
  if (!shot || prev === shotId) return next;
  const copied = copyShotOrbit(shot);
  const view: StudioOrbitCamera = {
    yaw: copied.camera.yaw,
    pitch: copied.camera.pitch,
    distance: copied.camera.distance,
    fov: copied.camera.fov,
    target: copied.camera.target ?? { x: 0, y: 0, z: 0 },
    projection: copied.projection,
  };
  return {
    ...next,
    viewCamera: view,
    render: { ...studio.render, camera: copied.camera, projection: copied.projection },
  };
}
