import { uid } from "@/lib/id";
import { orbitEye, type Vec3 } from "@/features/box/boxGeom";
import { cameraTargetOf } from "@/features/box/filmGate";
import type { BoxRenderSetup, ProductShot, ShotCamera } from "./types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/** 从朝向 target 的机位提取 XYZ 欧拉角（与 matRotateXYZ 一致，局部 −Z 朝前）。 */
export function eulerLookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): { x: number; y: number; z: number } {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zlen = Math.hypot(zx, zy, zz) || 1;
  zx /= zlen;
  zy /= zlen;
  zz /= zlen;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xlen = Math.hypot(xx, xy, xz) || 1;
  xx /= xlen;
  xy /= xlen;
  xz /= xlen;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  void yx;
  const sy = clamp(-xz, -1, 1);
  const ry = Math.asin(sy);
  const cy = Math.cos(ry);
  let rx: number;
  let rz: number;
  if (Math.abs(cy) > 1e-6) {
    rx = Math.atan2(yz, zz);
    rz = Math.atan2(xy, xx);
  } else {
    rx = Math.atan2(-yz, yy);
    rz = 0;
  }
  return { x: (rx * 180) / Math.PI, y: (ry * 180) / Math.PI, z: (rz * 180) / Math.PI };
}

export function shotCameraFromOrbit(
  orbit: BoxRenderSetup["camera"],
  extra: { id?: string; name: string; projection?: ShotCamera["projection"] },
): ShotCamera {
  const target = cameraTargetOf(orbit);
  const eye = orbitEye(orbit.yaw, orbit.pitch, orbit.distance, target);
  return {
    id: extra.id ?? uid("cam"),
    name: extra.name,
    position: { x: eye[0], y: eye[1], z: eye[2] },
    rotationDeg: eulerLookAt(eye, target),
    fov: orbit.fov,
    projection: extra.projection ?? "perspective",
  };
}

export function orbitFromShotCamera(
  cam: ShotCamera,
  distance: number,
): { yaw: number; pitch: number; distance: number; target: { x: number; y: number; z: number } } {
  const dist = Math.max(40, distance || 420);
  const rx = (cam.rotationDeg.x * Math.PI) / 180;
  const ry = (cam.rotationDeg.y * Math.PI) / 180;
  const rz = (cam.rotationDeg.z * Math.PI) / 180;
  const cx = Math.cos(rx),
    sx = Math.sin(rx);
  const cy = Math.cos(ry),
    sy = Math.sin(ry);
  const cz = Math.cos(rz),
    sz = Math.sin(rz);
  // R = Rz * Ry * Rx；局部 +Z 列
  const zx = cx * sy * cz + sx * sz;
  const zy = cx * sy * sz - sx * cz;
  const zz = cx * cy;
  const fwd: Vec3 = [-zx, -zy, -zz];
  const fl = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1;
  fwd[0] /= fl;
  fwd[1] /= fl;
  fwd[2] /= fl;
  const target = {
    x: cam.position.x + fwd[0] * dist,
    y: cam.position.y + fwd[1] * dist,
    z: cam.position.z + fwd[2] * dist,
  };
  const ox = cam.position.x - target.x;
  const oy = cam.position.y - target.y;
  const oz = cam.position.z - target.z;
  const pitch = (Math.asin(clamp(oy / dist, -1, 1)) * 180) / Math.PI;
  const yaw = (Math.atan2(ox, oz) * 180) / Math.PI;
  return { yaw, pitch, distance: dist, target };
}

export function nextCameraName(cameras: ShotCamera[]): string {
  if (!cameras.some((c) => c.name === "persp")) return "persp";
  let n = 1;
  while (cameras.some((c) => c.name === `Camera${n}`)) n += 1;
  return `Camera${n}`;
}

export function ensureShotCameras(shot: ProductShot): ProductShot {
  if (shot.cameras?.length) {
    const look = shot.lookThroughId && shot.cameras.some((c) => c.id === shot.lookThroughId) ? shot.lookThroughId : shot.cameras[0]!.id;
    if (look === shot.lookThroughId) return shot;
    return { ...shot, lookThroughId: look };
  }
  const persp = shotCameraFromOrbit(shot.render.camera, {
    name: "persp",
    projection: shot.render.projection ?? "perspective",
  });
  return { ...shot, cameras: [persp], lookThroughId: persp.id };
}

export function applyOrbitToLookThrough(
  shot: ProductShot,
  orbit: { yaw: number; pitch: number; distance: number; target?: { x: number; y: number; z: number } },
): ProductShot {
  const base = ensureShotCameras(shot);
  const lookId = base.lookThroughId ?? base.cameras![0]!.id;
  const cam = base.cameras!.find((c) => c.id === lookId) ?? base.cameras![0]!;
  const render: BoxRenderSetup = {
    ...base.render,
    camera: {
      ...base.render.camera,
      yaw: orbit.yaw,
      pitch: orbit.pitch,
      distance: orbit.distance,
      ...(orbit.target ? { target: orbit.target } : {}),
    },
  };
  const synced = shotCameraFromOrbit(render.camera, {
    id: cam.id,
    name: cam.name,
    projection: render.projection ?? cam.projection ?? "perspective",
  });
  return {
    ...base,
    render,
    lookThroughId: cam.id,
    cameras: base.cameras!.map((c) => (c.id === cam.id ? synced : c)),
  };
}

export function lookThroughCamera(shot: ProductShot, cameraId: string): ProductShot {
  const base = ensureShotCameras(shot);
  const cam = base.cameras!.find((c) => c.id === cameraId);
  if (!cam) return base;
  const orbit = orbitFromShotCamera(cam, base.render.camera.distance);
  return {
    ...base,
    lookThroughId: cam.id,
    render: {
      ...base.render,
      projection: cam.projection ?? "perspective",
      camera: { ...base.render.camera, ...orbit, fov: cam.fov },
    },
  };
}

export function patchShotCamera(
  shot: ProductShot,
  cameraId: string,
  patch: Partial<Pick<ShotCamera, "name" | "position" | "rotationDeg" | "fov" | "projection">>,
): ProductShot {
  const base = ensureShotCameras(shot);
  const cameras = base.cameras!.map((c) => (c.id === cameraId ? { ...c, ...patch } : c));
  const cam = cameras.find((c) => c.id === cameraId);
  if (!cam) return base;
  const looking = (base.lookThroughId ?? cameras[0]!.id) === cameraId;
  if (!looking) return { ...base, cameras };
  const orbit = orbitFromShotCamera(cam, base.render.camera.distance);
  return {
    ...base,
    cameras,
    render: {
      ...base.render,
      projection: cam.projection ?? base.render.projection,
      camera: { ...base.render.camera, ...orbit, fov: cam.fov },
    },
  };
}

export function removeShotCamera(shot: ProductShot, cameraId: string): ProductShot {
  const base = ensureShotCameras(shot);
  if ((base.cameras?.length ?? 0) <= 1) return base;
  const cameras = base.cameras!.filter((c) => c.id !== cameraId);
  const looking = base.lookThroughId === cameraId;
  const nextLook = looking ? cameras[0]!.id : (base.lookThroughId ?? cameras[0]!.id);
  const next = { ...base, cameras, lookThroughId: nextLook };
  return looking ? lookThroughCamera(next, nextLook) : next;
}
