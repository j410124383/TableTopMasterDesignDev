import type { BoxFace, BoxRenderSetup, PackagingBox } from "@/model/types";
import { ensureBoxRender } from "@/model/box";
import {
  boxCornersMm,
  boxMesh,
  lightDir,
  matLookAt,
  matMul,
  matPerspective,
  matOrtho,
  matRotateXYZ,
  matTranslate,
  matInvert,
  mulVec4,
  orbitEye,
  rayHitFace,
  rayHitMesh,
  type BoxMesh,
  type Mat4,
  type Vec3,
} from "./boxGeom";
import { cameraTargetOf, filmGateRect, filmSize, overscanFovY } from "./filmGate";

const VS = `
attribute vec3 aPos;
attribute vec2 aUv;
attribute vec3 aNrm;
attribute float aUseTex;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec2 vUv;
varying vec3 vNrm;
varying float vUseTex;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUv = aUv;
  vNrm = mat3(uModel) * aNrm;
  vUseTex = aUseTex;
}
`;

const FS = `
precision mediump float;
varying vec2 vUv;
varying vec3 vNrm;
varying float vUseTex;
uniform sampler2D uTex;
uniform sampler2D uTexBack;
uniform float uHasTex;
uniform float uHasBackTex;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uKey;
uniform float uFill;
uniform float uAmbient;
uniform vec3 uTint;
void main() {
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  float ndl = abs(dot(n, normalize(uLightDir)));
  vec4 texc = vUseTex > 1.5 ? texture2D(uTexBack, vUv) : texture2D(uTex, vUv);
  float has = vUseTex > 1.5 ? uHasBackTex : uHasTex;
  if (vUseTex > 0.5 && has > 0.5 && texc.a < 0.08) discard;
  float useRgb = has * step(0.5, vUseTex) * step(0.01, uKey + uFill);
  vec4 albedo = mix(vec4(uTint, 1.0), vec4(texc.rgb, 1.0), useRgb);
  vec3 base = albedo.rgb;
  vec3 lit = base * uAmbient + base * ndl * uKey * uLightColor + base * uFill;
  gl_FragColor = vec4(lit, albedo.a);
}
`;

const LINE_VS = `
attribute vec3 aPos;
attribute vec3 aCol;
uniform mat4 uMVP;
varying vec3 vCol;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vCol = aCol;
}
`;

const LINE_FS = `
precision mediump float;
varying vec3 vCol;
void main() {
  gl_FragColor = vec4(vCol, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || "compile");
  }
  return sh;
}

function parseColor(hex: string): Vec3 {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function checkerTexture(gl: WebGLRenderingContext) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#c8c4bc" : "#9a968e";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

export type BoxViewOpts = {
  selectedFace?: BoxFace | null;
  showFloor?: boolean;
  transparentBg?: boolean;
  background?: string;
  gizmos?: boolean;
  groundY?: number;
  gridSize?: number;
  silhouette?: boolean;
  /** 视口按分辨率过扫，红框内与导出画幅一致 */
  filmGate?: boolean;
  cameras?: {
    position: { x: number; y: number; z: number };
    rotationDeg: { x: number; y: number; z: number };
    fov: number;
    projection?: "perspective" | "isometric";
    selected?: boolean;
  }[];
};

export type SceneDrawItem = {
  id: string;
  mesh: BoxMesh;
  image: HTMLImageElement | HTMLCanvasElement | null;
  backImage?: HTMLImageElement | HTMLCanvasElement | null;
  model: Mat4;
  selected?: boolean;
  tint?: [number, number, number];
};

export class BoxGl {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null>;
  private aPos: number;
  private aUv: number;
  private aNrm: number;
  private aUseTex: number;
  private lineProg: WebGLProgram;
  private aLinePos: number;
  private aLineCol: number;
  private locLineMvp: WebGLUniformLocation | null;
  private bufLineCol: WebGLBuffer;
  private bufPos: WebGLBuffer;
  private bufUv: WebGLBuffer;
  private bufNrm: WebGLBuffer;
  private bufUseTex: WebGLBuffer;
  private vCount = 0;
  private checker: WebGLTexture;
  private tex: WebGLTexture | null = null;
  private texCache = new Map<CanvasImageSource, WebGLTexture>();
  private hasTex = false;
  private mvp: Mat4 = matLookAt([0, 0, 1], [0, 0, 0], [0, 1, 0]);
  private vp: Mat4 | null = null;
  private invVp: Mat4 | null = null;
  private model: Mat4 = matTranslate(0, 0, 0);
  private box: PackagingBox | null = null;
  private setup: BoxRenderSetup | null = null;
  private w = 1;
  private h = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL 不可用");
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    this.prog = prog;
    this.aPos = gl.getAttribLocation(prog, "aPos");
    this.aUv = gl.getAttribLocation(prog, "aUv");
    this.aNrm = gl.getAttribLocation(prog, "aNrm");
    this.aUseTex = gl.getAttribLocation(prog, "aUseTex");
    this.loc = {
      uMVP: gl.getUniformLocation(prog, "uMVP"),
      uModel: gl.getUniformLocation(prog, "uModel"),
      uTex: gl.getUniformLocation(prog, "uTex"),
      uTexBack: gl.getUniformLocation(prog, "uTexBack"),
      uHasTex: gl.getUniformLocation(prog, "uHasTex"),
      uHasBackTex: gl.getUniformLocation(prog, "uHasBackTex"),
      uLightDir: gl.getUniformLocation(prog, "uLightDir"),
      uLightColor: gl.getUniformLocation(prog, "uLightColor"),
      uKey: gl.getUniformLocation(prog, "uKey"),
      uFill: gl.getUniformLocation(prog, "uFill"),
      uAmbient: gl.getUniformLocation(prog, "uAmbient"),
      uTint: gl.getUniformLocation(prog, "uTint"),
    };
    const lvs = compile(gl, gl.VERTEX_SHADER, LINE_VS);
    const lfs = compile(gl, gl.FRAGMENT_SHADER, LINE_FS);
    const lineProg = gl.createProgram()!;
    gl.attachShader(lineProg, lvs);
    gl.attachShader(lineProg, lfs);
    gl.linkProgram(lineProg);
    if (!gl.getProgramParameter(lineProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(lineProg) || "link");
    this.lineProg = lineProg;
    this.aLinePos = gl.getAttribLocation(lineProg, "aPos");
    this.aLineCol = gl.getAttribLocation(lineProg, "aCol");
    this.locLineMvp = gl.getUniformLocation(lineProg, "uMVP");
    this.bufPos = gl.createBuffer()!;
    this.bufUv = gl.createBuffer()!;
    this.bufNrm = gl.createBuffer()!;
    this.bufUseTex = gl.createBuffer()!;
    this.bufLineCol = gl.createBuffer()!;
    this.checker = checkerTexture(gl);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  setSize(cssW: number, cssH: number, dpr = window.devicePixelRatio || 1) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.gl.viewport(0, 0, w, h);
  }

  setMesh(box: PackagingBox) {
    this.box = box;
    const mesh = boxMesh(box);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUv);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNrm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUseTex);
    gl.bufferData(gl.ARRAY_BUFFER, onesFor(mesh.pos.length / 3), gl.DYNAMIC_DRAW);
    this.vCount = mesh.pos.length / 3;
  }

  setTextureImage(image: HTMLImageElement | HTMLCanvasElement | null) {
    const gl = this.gl;
    if (this.tex) {
      gl.deleteTexture(this.tex);
      this.tex = null;
    }
    this.hasTex = false;
    if (!image) return;
    const w = "naturalWidth" in image ? image.naturalWidth : image.width;
    const h = "naturalHeight" in image ? image.naturalHeight : image.height;
    if (!w || !h) return;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex = tex;
    this.hasTex = true;
  }

  /** @deprecated use setMesh + setTextureImage */
  setBox(box: PackagingBox, image: HTMLImageElement | HTMLCanvasElement | null) {
    this.setMesh(box);
    this.setTextureImage(image);
  }

  draw(setup: BoxRenderSetup, opts: BoxViewOpts = {}) {
    if (!this.box) return;
    this.setup = setup;
    const gl = this.gl;
    const aspect = this.w / this.h;
    const rot = setup.rotationDeg;
    const pos = setup.position;
    const model = matMul(
      matTranslate(pos.x, pos.y, pos.z),
      matRotateXYZ((rot.x * Math.PI) / 180, (rot.y * Math.PI) / 180, (rot.z * Math.PI) / 180),
    );
    this.model = model;
    const cam = setup.camera;
    const target = cameraTargetOf(cam);
    const eye = orbitEye(cam.yaw, cam.pitch, cam.distance, target);
    const view = matLookAt(eye, target, [0, 1, 0]);
    const near = Math.max(1, cam.distance / 80);
    const far = cam.distance * 8;
    const proj = makeProj(setup, aspect, near, far, opts.filmGate ? { w: this.w, h: this.h } : undefined);
    const vp = matMul(proj, view);
    this.vp = vp;
    this.invVp = matInvert(vp);
    this.mvp = matMul(vp, model);
    const transparent = opts.transparentBg || setup.cullBackground;
    const bg = parseColor(opts.background ?? setup.background ?? "#1c1c22");
    if (transparent) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUv);
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNrm);
    gl.enableVertexAttribArray(this.aNrm);
    gl.vertexAttribPointer(this.aNrm, 3, gl.FLOAT, false, 0, 0);
    if (this.aUseTex >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUseTex);
      gl.enableVertexAttribArray(this.aUseTex);
      gl.vertexAttribPointer(this.aUseTex, 1, gl.FLOAT, false, 0, 0);
    }
    gl.uniformMatrix4fv(this.loc.uMVP, false, this.mvp);
    gl.uniformMatrix4fv(this.loc.uModel, false, model);
    const key = setup.lights.key;
    const ld = lightDir(key.yaw, key.pitch);
    gl.uniform3fv(this.loc.uLightDir, ld);
    gl.uniform3fv(this.loc.uLightColor, parseColor(key.color));
    gl.uniform1f(this.loc.uKey, key.intensity);
    gl.uniform1f(this.loc.uFill, setup.lights.fillIntensity ?? 0.25);
    gl.uniform1f(this.loc.uAmbient, setup.lights.ambient ?? 0.3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hasTex && this.tex ? this.tex : this.checker);
    gl.uniform1i(this.loc.uTex, 0);
    gl.uniform1f(this.loc.uHasTex, this.hasTex ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.checker);
    gl.uniform1i(this.loc.uTexBack, 1);
    gl.uniform1f(this.loc.uHasBackTex, 0);
    gl.uniform3f(this.loc.uTint, 0.78, 0.76, 0.72);
    gl.drawArrays(gl.TRIANGLES, 0, this.vCount);

    if (opts.selectedFace && this.box) {
      this.drawFaceOutline(opts.selectedFace);
    }

    if (opts.gizmos !== false) {
      this.drawGizmos(setup, vp, opts);
    }
  }

  private drawFaceOutline(face: BoxFace) {
    if (!this.box) return;
    const mesh = boxMesh(this.box);
    const pos: number[] = [];
    const nrm: number[] = [];
    for (let i = 0; i < mesh.faces.length; i++) {
      if (mesh.faces[i] !== face) continue;
      pos.push(mesh.pos[i * 3]!, mesh.pos[i * 3 + 1]!, mesh.pos[i * 3 + 2]!);
      nrm.push(mesh.nrm[i * 3]!, mesh.nrm[i * 3 + 1]!, mesh.nrm[i * 3 + 2]!);
    }
    if (!pos.length) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNrm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nrm), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(this.aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.uniform1f(this.loc.uHasTex, 0);
    gl.uniform3f(this.loc.uTint, 0.55, 0.95, 0.2);
    gl.uniform1f(this.loc.uKey, 0.15);
    gl.uniform1f(this.loc.uAmbient, 0.55);
    gl.drawArrays(gl.TRIANGLES, 0, pos.length / 3);
    gl.disable(gl.BLEND);
    this.setMesh(this.box);
  }

  private drawGizmos(setup: BoxRenderSetup, vp: Mat4, opts: BoxViewOpts = {}) {
    const gl = this.gl;
    const box = this.box;
    const g = opts.gridSize ?? Math.max(80, (box ? Math.max(box.lengthMm, box.widthMm) : 100) * 1.6);
    const step = g / 8;
    const groundY = opts.groundY ?? (box ? -box.heightMm / 2 : 0);
    const grid: number[] = [];
    const gridCol: number[] = [];
    const overlay: number[] = [];
    const overlayCol: number[] = [];
    const push = (buf: number[], col: number[], a: Vec3, b: Vec3, rgb: Vec3) => {
      buf.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      col.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]);
    };
    const gy = groundY - 0.08;
    for (let i = -8; i <= 8; i++) {
      const t = i * step;
      const fade = i === 0 ? 0.92 : 0.58;
      push(grid, gridCol, [-g, gy, t], [g, gy, t], [fade, fade, fade]);
      push(grid, gridCol, [t, gy, -g], [t, gy, g], [fade, fade, fade]);
    }
    const ax = Math.max(40, g * 0.45);
    push(overlay, overlayCol, [0, 0, 0], [ax, 0, 0], [1, 0.28, 0.22]);
    push(overlay, overlayCol, [0, 0, 0], [0, ax, 0], [0.32, 0.95, 0.4]);
    push(overlay, overlayCol, [0, 0, 0], [0, 0, ax], [0.3, 0.55, 1]);
    const ld = lightDir(setup.lights.key.yaw, setup.lights.key.pitch);
    const reach = ax * 1.35;
    const lp: Vec3 = [ld[0] * reach, ld[1] * reach, ld[2] * reach];
    push(overlay, overlayCol, [0, 0, 0], lp, [1, 0.92, 0.35]);
    const tick = Math.max(8, ax * 0.08);
    push(overlay, overlayCol, [lp[0] - tick, lp[1], lp[2]], [lp[0] + tick, lp[1], lp[2]], [1, 0.92, 0.35]);
    push(overlay, overlayCol, [lp[0], lp[1] - tick, lp[2]], [lp[0], lp[1] + tick, lp[2]], [1, 0.92, 0.35]);
    push(overlay, overlayCol, [lp[0], lp[1], lp[2] - tick], [lp[0], lp[1], lp[2] + tick], [1, 0.92, 0.35]);

    const cams = opts.cameras ?? [];
    if (cams.length) {
      const film = filmSize(setup);
      const aspect = Math.max(0.2, film.w / Math.max(1, film.h));
      for (const cam of cams) {
        const model = matMul(
          matTranslate(cam.position.x, cam.position.y, cam.position.z),
          matRotateXYZ((cam.rotationDeg.x * Math.PI) / 180, (cam.rotationDeg.y * Math.PI) / 180, (cam.rotationDeg.z * Math.PI) / 180),
        );
        const xform = (p: Vec3): Vec3 => {
          const v = mulVec4(model, [p[0], p[1], p[2], 1]);
          return [v[0], v[1], v[2]];
        };
        const near = 6;
        const far = 42;
        const fov = (Math.max(8, cam.fov || 32) * Math.PI) / 180;
        const iso = cam.projection === "isometric";
        const nh = iso ? 10 : Math.tan(fov / 2) * near;
        const nw = nh * aspect;
        const fh = iso ? 28 : Math.tan(fov / 2) * far;
        const fw = fh * aspect;
        const ns = [
          xform([-nw, -nh, -near]),
          xform([nw, -nh, -near]),
          xform([nw, nh, -near]),
          xform([-nw, nh, -near]),
        ];
        const fs = [
          xform([-fw, -fh, -far]),
          xform([fw, -fh, -far]),
          xform([fw, fh, -far]),
          xform([-fw, fh, -far]),
        ];
        const rgb: Vec3 = cam.selected ? [1, 0.82, 0.28] : [0.45, 0.78, 0.95];
        const origin = xform([0, 0, 0]);
        for (let i = 0; i < 4; i++) {
          push(overlay, overlayCol, ns[i]!, ns[(i + 1) % 4]!, rgb);
          push(overlay, overlayCol, fs[i]!, fs[(i + 1) % 4]!, rgb);
          push(overlay, overlayCol, ns[i]!, fs[i]!, rgb);
          push(overlay, overlayCol, origin, ns[i]!, rgb);
        }
      }
    }

    const drawLines = (pos: number[], col: number[]) => {
      if (!pos.length) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aLinePos);
      gl.vertexAttribPointer(this.aLinePos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufLineCol);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aLineCol);
      gl.vertexAttribPointer(this.aLineCol, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(this.locLineMvp, false, vp);
      gl.drawArrays(gl.LINES, 0, pos.length / 3);
    };

    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.lineProg);
    gl.enable(gl.DEPTH_TEST);
    drawLines(grid, gridCol);
    gl.disable(gl.DEPTH_TEST);
    drawLines(overlay, overlayCol);
    gl.enable(gl.DEPTH_TEST);
    gl.disableVertexAttribArray(this.aLinePos);
    gl.disableVertexAttribArray(this.aLineCol);
    gl.disable(gl.CULL_FACE);
    if (this.box) this.setMesh(this.box);
  }

  pick(cssX: number, cssY: number): BoxFace | null {
    if (!this.box || !this.invVp || !this.setup) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = (cssX / rect.width) * 2 - 1;
    const ndcY = 1 - (cssY / rect.height) * 2;
    const n = mulVec4(this.invVp, [ndcX, ndcY, -1, 1]);
    const f = mulVec4(this.invVp, [ndcX, ndcY, 1, 1]);
    const nw = n[3] || 1;
    const fw = f[3] || 1;
    const near: Vec3 = [n[0] / nw, n[1] / nw, n[2] / nw];
    const far: Vec3 = [f[0] / fw, f[1] / fw, f[2] / fw];
    const dir: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= len;
    dir[1] /= len;
    dir[2] /= len;
    const invModel = matInvert(this.model);
    if (!invModel) return rayHitFace(near, dir, this.box);
    const o4 = mulVec4(invModel, [near[0], near[1], near[2], 1]);
    const d4 = mulVec4(invModel, [near[0] + dir[0], near[1] + dir[1], near[2] + dir[2], 1]);
    const origin: Vec3 = [o4[0], o4[1], o4[2]];
    const localDir: Vec3 = [d4[0] - o4[0], d4[1] - o4[1], d4[2] - o4[2]];
    const dl = Math.hypot(localDir[0], localDir[1], localDir[2]) || 1;
    return rayHitFace(origin, [localDir[0] / dl, localDir[1] / dl, localDir[2] / dl], this.box);
  }

  projectedBoxAabb(): { x: number; y: number; w: number; h: number } | null {
    if (!this.box) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of boxCornersMm(this.box)) {
      const c = mulVec4(this.mvp, [p[0], p[1], p[2], 1]);
      if (c[3] === 0) continue;
      const ndcX = c[0] / c[3];
      const ndcY = c[1] / c[3];
      const x = ((ndcX + 1) / 2) * this.w;
      const y = ((1 - ndcY) / 2) * this.h;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX)) return null;
    const pad = 8;
    const x = Math.max(0, Math.floor(minX - pad));
    const y = Math.max(0, Math.floor(minY - pad));
    const w = Math.min(this.w - x, Math.ceil(maxX - minX + pad * 2));
    const h = Math.min(this.h - y, Math.ceil(maxY - minY + pad * 2));
    return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
  }

  snapshot(cullOutside: boolean): HTMLCanvasElement {
    const src = this.canvas;
    const out = document.createElement("canvas");
    if (cullOutside) {
      const aabb = this.projectedBoxAabb();
      if (aabb) {
        out.width = aabb.w;
        out.height = aabb.h;
        const ctx = out.getContext("2d")!;
        ctx.drawImage(src, aabb.x, aabb.y, aabb.w, aabb.h, 0, 0, aabb.w, aabb.h);
        return out;
      }
    }
    out.width = src.width;
    out.height = src.height;
    out.getContext("2d")!.drawImage(src, 0, 0);
    return out;
  }

  private uploadMesh(mesh: BoxMesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUv);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNrm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUseTex);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.useTex ?? onesFor(mesh.pos.length / 3), gl.DYNAMIC_DRAW);
    this.vCount = mesh.pos.length / 3;
  }

  private bindImage(image: HTMLImageElement | HTMLCanvasElement | null, unit = 0): boolean {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (!image) {
      gl.bindTexture(gl.TEXTURE_2D, this.checker);
      return false;
    }
    let tex = this.texCache.get(image);
    if (!tex) {
      const w = "naturalWidth" in image ? image.naturalWidth : image.width;
      const h = "naturalHeight" in image ? image.naturalHeight : image.height;
      if (!w || !h) {
        gl.bindTexture(gl.TEXTURE_2D, this.checker);
        return false;
      }
      tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.texCache.set(image, tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return true;
  }

  private bindMeshAttribs() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUv);
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNrm);
    gl.enableVertexAttribArray(this.aNrm);
    gl.vertexAttribPointer(this.aNrm, 3, gl.FLOAT, false, 0, 0);
    if (this.aUseTex >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufUseTex);
      gl.enableVertexAttribArray(this.aUseTex);
      gl.vertexAttribPointer(this.aUseTex, 1, gl.FLOAT, false, 0, 0);
    }
  }

  drawScene(setup: BoxRenderSetup, items: SceneDrawItem[], opts: BoxViewOpts = {}) {
    this.setup = setup;
    this.box = null;
    const gl = this.gl;
    const aspect = this.w / this.h;
    const cam = setup.camera;
    const target = cameraTargetOf(cam);
    const eye = orbitEye(cam.yaw, cam.pitch, cam.distance, target);
    const view = matLookAt(eye, target, [0, 1, 0]);
    const near = Math.max(1, cam.distance / 80);
    const far = cam.distance * 8;
    const proj = makeProj(setup, aspect, near, far, opts.filmGate ? { w: this.w, h: this.h } : undefined);
    const vp = matMul(proj, view);
    this.vp = vp;
    this.invVp = matInvert(vp);
    const transparent = opts.transparentBg || setup.cullBackground;
    const bg = parseColor(opts.background ?? setup.background ?? "#1c1c22");
    if (opts.silhouette) gl.clearColor(0, 0, 0, 1);
    else if (transparent) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.useProgram(this.prog);
    const key = setup.lights.key;
    const ld = lightDir(key.yaw, key.pitch);
    if (opts.silhouette) {
      gl.uniform3fv(this.loc.uLightDir, [0, 1, 0]);
      gl.uniform3fv(this.loc.uLightColor, [1, 1, 1]);
      gl.uniform1f(this.loc.uKey, 0);
      gl.uniform1f(this.loc.uFill, 0);
      gl.uniform1f(this.loc.uAmbient, 1);
      gl.uniform3f(this.loc.uTint, 1, 1, 1);
    } else {
      gl.uniform3fv(this.loc.uLightDir, ld);
      gl.uniform3fv(this.loc.uLightColor, parseColor(key.color));
      gl.uniform1f(this.loc.uKey, key.intensity);
      gl.uniform1f(this.loc.uFill, setup.lights.fillIntensity ?? 0.25);
      gl.uniform1f(this.loc.uAmbient, setup.lights.ambient ?? 0.3);
      gl.uniform3f(this.loc.uTint, 0.78, 0.76, 0.72);
    }
    gl.uniform1i(this.loc.uTex, 0);
    gl.uniform1i(this.loc.uTexBack, 1);
    for (const item of items) {
      this.uploadMesh(item.mesh);
      this.bindMeshAttribs();
      const hasFront = this.bindImage(item.image, 0);
      const hasBack = this.bindImage(item.backImage ?? null, 1);
      const mvp = matMul(vp, item.model);
      gl.uniformMatrix4fv(this.loc.uMVP, false, mvp);
      gl.uniformMatrix4fv(this.loc.uModel, false, item.model);
      gl.uniform1f(this.loc.uHasTex, hasFront ? 1 : 0);
      gl.uniform1f(this.loc.uHasBackTex, hasBack ? 1 : 0);
      if (item.tint && !opts.silhouette) gl.uniform3f(this.loc.uTint, item.tint[0], item.tint[1], item.tint[2]);
      else if (!opts.silhouette) gl.uniform3f(this.loc.uTint, 0.78, 0.76, 0.72);
      gl.drawArrays(gl.TRIANGLES, 0, this.vCount);
      if (item.selected && !opts.silhouette) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.uniform1f(this.loc.uHasTex, 0);
        gl.uniform1f(this.loc.uHasBackTex, 0);
        gl.uniform3f(this.loc.uTint, 0.55, 0.95, 0.2);
        gl.uniform1f(this.loc.uKey, 0.12);
        gl.uniform1f(this.loc.uAmbient, 0.5);
        gl.drawArrays(gl.TRIANGLES, 0, this.vCount);
        gl.disable(gl.BLEND);
        gl.uniform3f(this.loc.uTint, item.tint ? item.tint[0] : 0.78, item.tint ? item.tint[1] : 0.76, item.tint ? item.tint[2] : 0.72);
        gl.uniform1f(this.loc.uKey, key.intensity);
        gl.uniform1f(this.loc.uAmbient, setup.lights.ambient ?? 0.3);
      }
    }
    if (opts.gizmos !== false && !opts.silhouette) {
      this.drawGizmos(setup, vp, { ...opts, groundY: opts.groundY ?? 0, gridSize: opts.gridSize ?? 420 });
    }
  }

  pickScene(cssX: number, cssY: number, items: SceneDrawItem[]): string | null {
    if (!this.invVp) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = (cssX / rect.width) * 2 - 1;
    const ndcY = 1 - (cssY / rect.height) * 2;
    const n = mulVec4(this.invVp, [ndcX, ndcY, -1, 1]);
    const f = mulVec4(this.invVp, [ndcX, ndcY, 1, 1]);
    const nw = n[3] || 1;
    const fw = f[3] || 1;
    const near: Vec3 = [n[0] / nw, n[1] / nw, n[2] / nw];
    const far: Vec3 = [f[0] / fw, f[1] / fw, f[2] / fw];
    const dir: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= len;
    dir[1] /= len;
    dir[2] /= len;
    let best = Infinity;
    let hitId: string | null = null;
    for (const item of items) {
      const invModel = matInvert(item.model);
      if (!invModel) continue;
      const o4 = mulVec4(invModel, [near[0], near[1], near[2], 1]);
      const d4 = mulVec4(invModel, [near[0] + dir[0], near[1] + dir[1], near[2] + dir[2], 1]);
      const origin: Vec3 = [o4[0], o4[1], o4[2]];
      const localDir: Vec3 = [d4[0] - o4[0], d4[1] - o4[1], d4[2] - o4[2]];
      const dl = Math.hypot(localDir[0], localDir[1], localDir[2]) || 1;
      const t = rayHitMesh(origin, [localDir[0] / dl, localDir[1] / dl, localDir[2] / dl], item.mesh);
      if (t != null && t < best) {
        best = t;
        hitId = item.id;
      }
    }
    return hitId;
  }

  worldRay(cssX: number, cssY: number): { origin: Vec3; dir: Vec3 } | null {
    if (!this.invVp) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = (cssX / rect.width) * 2 - 1;
    const ndcY = 1 - (cssY / rect.height) * 2;
    const n = mulVec4(this.invVp, [ndcX, ndcY, -1, 1]);
    const f = mulVec4(this.invVp, [ndcX, ndcY, 1, 1]);
    const nw = n[3] || 1;
    const fw = f[3] || 1;
    const near: Vec3 = [n[0] / nw, n[1] / nw, n[2] / nw];
    const far: Vec3 = [f[0] / fw, f[1] / fw, f[2] / fw];
    const dir: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    return { origin: near, dir: [dir[0] / len, dir[1] / len, dir[2] / len] };
  }

  projectWorld(p: Vec3): { x: number; y: number } | null {
    if (!this.vp) return null;
    const rect = this.canvas.getBoundingClientRect();
    const clip = mulVec4(this.vp, [p[0], p[1], p[2], 1]);
    const w = clip[3] || 1;
    const ndcX = clip[0] / w;
    const ndcY = clip[1] / w;
    return { x: (ndcX * 0.5 + 0.5) * rect.width, y: (1 - (ndcY * 0.5 + 0.5)) * rect.height };
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.bufPos);
    gl.deleteBuffer(this.bufUv);
    gl.deleteBuffer(this.bufNrm);
    gl.deleteBuffer(this.bufUseTex);
    gl.deleteBuffer(this.bufLineCol);
    gl.deleteTexture(this.checker);
    if (this.tex) gl.deleteTexture(this.tex);
    for (const t of this.texCache.values()) gl.deleteTexture(t);
    this.texCache.clear();
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.lineProg);
  }
}

export function loadTextureImage(src: string, projectDir?: string | null): Promise<HTMLImageElement> {
  return import("./boxTexture").then((m) => m.loadBoxTexture(src, projectDir));
}

export { ensureBoxRender };

function makeProj(
  setup: BoxRenderSetup,
  aspect: number,
  near: number,
  far: number,
  overscan?: { w: number; h: number },
) {
  const cam = setup.camera;
  if (overscan) {
    const film = filmSize(setup);
    const gate = filmGateRect(overscan.w, overscan.h, film.w, film.h);
    const k = overscan.h / Math.max(1, gate.h);
    if (setup.projection === "isometric") {
      const halfH = Math.max(20, cam.distance * 0.42) * k;
      return matOrtho(halfH * aspect, halfH, near, far);
    }
    return matPerspective(overscanFovY(cam.fov, overscan.h, gate.h), aspect, near, far);
  }
  if (setup.projection === "isometric") {
    const halfH = Math.max(20, cam.distance * 0.42);
    return matOrtho(halfH * aspect, halfH, near, far);
  }
  return matPerspective(cam.fov, aspect, near, far);
}

const onesCache = new Map<number, Float32Array>();
function onesFor(n: number) {
  let a = onesCache.get(n);
  if (!a) {
    a = new Float32Array(n);
    a.fill(1);
    onesCache.set(n, a);
  }
  return a;
}
