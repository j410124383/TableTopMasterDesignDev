import { mulVec4, type Mat4 } from "@/features/box/boxGeom";
import type { SceneDrawItem } from "@/features/box/boxGl";
import { openExportModelFolder, safeRenderName, writeTextRel } from "@/features/box/saveRenderPng";
import { looksLikeFullPath } from "@/persist/storage";
import { writeDiskBytes } from "@/persist/nodeFs";
import type { BoxRenderSetup, ProductShotItem, Project } from "@/model/types";
import { resolveShotDrawItems } from "./shotResolve";
import { exportBoardContour, exportCardDpi, exportTextureOf } from "./shotTexture";

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC = crcTable();

function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number) {
  return [n & 255, (n >>> 8) & 255];
}
function u32(n: number) {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}

function zipStore(files: { name: string; data: Uint8Array }[]) {
  const chunks: number[] = [];
  const central: number[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name.replaceAll("\\", "/"));
    const crc = crc32(f.data);
    const local = [0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), 0, 0];
    chunks.push(...local, ...name, ...f.data);
    central.push(
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32(offset), ...name,
    );
    offset += local.length + name.length + f.data.length;
  }
  const cdOff = offset;
  chunks.push(...central);
  const cdLen = central.length;
  chunks.push(0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cdLen), ...u32(cdOff), 0, 0);
  return new Uint8Array(chunks);
}

function xform(m: Mat4, x: number, y: number, z: number) {
  const v = mulVec4(m, [x, y, z, 1]);
  return [v[0] / 10, v[1] / 10, v[2] / 10] as const;
}

function safeTok(s: string, i: number) {
  return `${s.replace(/[^\w\u4e00-\u9fff]+/g, "_").slice(0, 40) || "mesh"}_${i}`;
}

function fbxName(s: string) {
  return s.replace(/["\\]/g, "_");
}

function fbxArr(name: string, vals: number[]) {
  return `        ${name}: *${vals.length} {\n            a: ${vals.join(",")}\n        }`;
}

function rgbOf(it: SceneDrawItem): [number, number, number] {
  if (it.look?.baseColor) return it.look.baseColor;
  if (it.tint) return it.tint;
  return [0.8, 0.8, 0.8];
}

async function canvasPng(img: CanvasImageSource): Promise<Uint8Array> {
  const c = document.createElement("canvas");
  const w = "width" in img ? Number(img.width) : 8;
  const h = "height" in img ? Number(img.height) : 8;
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  c.getContext("2d")!.drawImage(img as CanvasImageSource, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function joinDisk(dir: string, rel: string) {
  return `${dir.replace(/[\\/]+$/, "")}\\${rel.replaceAll("/", "\\")}`;
}

function bytesToBase64(buf: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    const slice = buf.subarray(i, i + chunk);
    for (let j = 0; j < slice.length; j++) binary += String.fromCharCode(slice[j]!);
  }
  return btoa(binary);
}

function buildAsciiFbx(
  folder: string,
  meshes: {
    name: string;
    verts: number[];
    idx: number[];
    nrm: number[];
    uv: number[];
    rgb: [number, number, number];
    texRel?: string;
  }[],
) {
  let nid = 100000;
  const next = () => ++nid;
  const docId = next();
  const geos: string[] = [];
  const models: string[] = [];
  const mats: string[] = [];
  const texs: string[] = [];
  const vids: string[] = [];
  const conn: string[] = [];
  for (const m of meshes) {
    const geoId = next();
    const modelId = next();
    const matId = next();
    const n = fbxName(m.name);
    geos.push(`    Geometry: ${geoId}, "Geometry::${n}", "Mesh" {
        GeometryVersion: 124
${fbxArr("Vertices", m.verts)}
${fbxArr("PolygonVertexIndex", m.idx)}
        LayerElementNormal: 0 {
            Version: 101
            Name: ""
            MappingInformationType: "ByPolygonVertex"
            ReferenceInformationType: "Direct"
${fbxArr("Normals", m.nrm)}
        }
        LayerElementUV: 0 {
            Version: 101
            Name: "UVMap"
            MappingInformationType: "ByPolygonVertex"
            ReferenceInformationType: "Direct"
${fbxArr("UV", m.uv)}
        }
        LayerElementMaterial: 0 {
            Version: 101
            Name: ""
            MappingInformationType: "AllSame"
            ReferenceInformationType: "IndexToDirect"
            Materials: *1 {
                a: 0
            }
        }
        Layer: 0 {
            Version: 100
            LayerElement:  {
                Type: "LayerElementNormal"
                TypedIndex: 0
            }
            LayerElement:  {
                Type: "LayerElementUV"
                TypedIndex: 0
            }
            LayerElement:  {
                Type: "LayerElementMaterial"
                TypedIndex: 0
            }
        }
    }`);
    models.push(`    Model: ${modelId}, "Model::${n}", "Mesh" {
        Version: 232
        Properties70:  {
            P: "RotationActive", "bool", "", "",1
            P: "InheritType", "enum", "", "",1
            P: "ScalingMax", "Vector3D", "Vector", "",0,0,0
            P: "DefaultAttributeIndex", "int", "Integer", "",0
            P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
            P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
            P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
        }
        Shading: T
        Culling: "CullingOff"
    }`);
    const [r, g, b] = m.rgb;
    mats.push(`    Material: ${matId}, "Material::${n}", "" {
        Version: 102
        ShadingModel: "lambert"
        MultiLayer: 0
        Properties70:  {
            P: "Diffuse", "Vector3D", "Vector", "",${r},${g},${b}
            P: "DiffuseColor", "Color", "", "A",${r},${g},${b}
            P: "AmbientColor", "Color", "", "A",0.2,0.2,0.2
        }
    }`);
    conn.push(`        C: "OO",${geoId},${modelId}`, `        C: "OO",${modelId},0`, `        C: "OO",${matId},${modelId}`);
    if (m.texRel) {
      const texId = next();
      const vidId = next();
      const rel = m.texRel.replaceAll("\\", "/");
      vids.push(`    Video: ${vidId}, "Video::${n}", "Clip" {
        Type: "Clip"
        Properties70:  {
            P: "Path", "KString", "XRefUrl", "", "${rel}"
        }
        UseMipMap: 0
        Filename: "${rel}"
        RelativeFilename: "${rel}"
    }`);
      texs.push(`    Texture: ${texId}, "Texture::${n}", "" {
        Type: "TextureVideoClip"
        Version: 202
        TextureName: "Texture::${n}"
        Properties70:  {
            P: "CurrentTextureBlendMode", "enum", "", "",0
            P: "UVSet", "KString", "", "", "UVMap"
            P: "UseMaterial", "bool", "", "",1
        }
        Media: "Video::${n}"
        FileName: "${rel}"
        RelativeFilename: "${rel}"
        ModelUVTranslation: 0,0
        ModelUVScaling: 1,1
        Texture_Alpha_Source: "None"
        Cropping: 0,0,0,0
    }`);
      conn.push(`        C: "OO",${vidId},${texId}`, `        C: "OP",${texId},${matId},"DiffuseColor"`);
    }
  }
  const nTex = texs.length;
  const typeCount = 1 + meshes.length * 3 + nTex * 2;
  const types = [
    `    ObjectType: "GlobalSettings" {\n        Count: 1\n    }`,
    `    ObjectType: "Model" {\n        Count: ${meshes.length}\n    }`,
    `    ObjectType: "Geometry" {\n        Count: ${meshes.length}\n    }`,
    `    ObjectType: "Material" {\n        Count: ${meshes.length}\n    }`,
  ];
  if (nTex) {
    types.push(`    ObjectType: "Texture" {\n        Count: ${nTex}\n    }`, `    ObjectType: "Video" {\n        Count: ${nTex}\n    }`);
  }
  return `; FBX 7.4.0 project file
; TMD ${folder}

FBXHeaderExtension:  {
    FBXHeaderVersion: 1003
    FBXVersion: 7400
    Creator: "TMD"
}
GlobalSettings:  {
    Version: 1000
    Properties70:  {
        P: "UpAxis", "int", "Integer", "",1
        P: "UpAxisSign", "int", "Integer", "",1
        P: "FrontAxis", "int", "Integer", "",2
        P: "FrontAxisSign", "int", "Integer", "",1
        P: "CoordAxis", "int", "Integer", "",0
        P: "CoordAxisSign", "int", "Integer", "",1
        P: "OriginalUpAxis", "int", "Integer", "",1
        P: "OriginalUpAxisSign", "int", "Integer", "",1
        P: "UnitScaleFactor", "double", "Number", "",1
        P: "OriginalUnitScaleFactor", "double", "Number", "",1
    }
}
Documents:  {
    Count: 1
    Document: ${docId}, "", "Scene" {
        Properties70:  {
            P: "SourceObject", "object", "", ""
            P: "ActiveAnimStackName", "KString", "", "", ""
        }
        RootNode: 0
    }
}
References:  {
}
Definitions:  {
    Version: 100
    Count: ${typeCount}
${types.join("\n")}
}
Objects:  {
${geos.join("\n")}
${models.join("\n")}
${mats.join("\n")}
${vids.join("\n")}
${texs.join("\n")}
}
Connections:  {
${conn.join("\n")}
}
Takes:  {
    Current: ""
}
`;
}

export async function exportSceneFbx(opts: {
  name: string;
  items: ProductShotItem[];
  project: Project;
  projectDir: string | null | undefined;
  render: BoxRenderSetup;
  note?: string;
}): Promise<string> {
  const filled = opts.items.filter((it) => it.refId);
  if (!filled.length) throw new Error("场景里还没有物件");
  const quality = exportTextureOf(opts.render.exportTexture);
  const drawn = await resolveShotDrawItems(filled, null, opts.project, opts.projectDir, {
    dpi: exportCardDpi(quality),
    contourMax: exportBoardContour(quality),
  });
  const folder = safeRenderName(opts.name);
  const texFiles: { rel: string; data: Uint8Array }[] = [];
  const meshes: {
    name: string;
    verts: number[];
    idx: number[];
    nrm: number[];
    uv: number[];
    rgb: [number, number, number];
    texRel?: string;
  }[] = [];
  for (let i = 0; i < drawn.length; i++) {
    const it: SceneDrawItem = drawn[i]!;
    const tok = safeTok(it.id, i);
    const pos = it.mesh.pos;
    const uv = it.mesh.uv;
    const nrm = it.mesh.nrm;
    const n = pos.length / 3;
    if (n < 3) continue;
    const verts: number[] = [];
    const nrmOut: number[] = [];
    const uvOut: number[] = [];
    const idx: number[] = [];
    for (let vi = 0; vi < n; vi++) {
      const p = xform(it.model, pos[vi * 3]!, pos[vi * 3 + 1]!, pos[vi * 3 + 2]!);
      verts.push(+p[0].toFixed(6), +p[1].toFixed(6), +p[2].toFixed(6));
      const nn = mulVec4(it.model, [nrm[vi * 3]!, nrm[vi * 3 + 1]!, nrm[vi * 3 + 2]!, 0]);
      const nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      nrmOut.push(+(nn[0] / nl).toFixed(6), +(nn[1] / nl).toFixed(6), +(nn[2] / nl).toFixed(6));
      const u = uv[vi * 2] ?? 0;
      const v = uv[vi * 2 + 1] ?? 0;
      uvOut.push(+u.toFixed(6), +(1 - v).toFixed(6));
    }
    for (let f = 0; f + 2 < n; f += 3) {
      idx.push(f, f + 1, -(f + 3));
    }
    let texRel: string | undefined;
    const img = it.image;
    if (img) {
      const png = await canvasPng(img);
      texRel = `textures/${tok}.png`;
      texFiles.push({ rel: texRel, data: png });
      if (it.foilImage) texFiles.push({ rel: `textures/${tok}_foil.png`, data: await canvasPng(it.foilImage) });
      if (it.varnishImage) texFiles.push({ rel: `textures/${tok}_varnish.png`, data: await canvasPng(it.varnishImage) });
    }
    meshes.push({ name: tok, verts, idx, nrm: nrmOut, uv: uvOut, rgb: img ? [1, 1, 1] : rgbOf(it), texRel });
  }
  if (!meshes.length) throw new Error("场景里还没有物件");
  const cam = opts.render.camera;
  const note = [
    `名称：${opts.name}`,
    `单位：厘米（1 单位 = 1 cm；内部毫米 ÷10）`,
    `轴向：Y 向上、右手系`,
    `格式：ASCII FBX 7.4（无动画）`,
    `摄像机 rest yaw ${cam.yaw} pitch ${cam.pitch} distance ${cam.distance} fov ${cam.fov} 投影 ${opts.render.projection ?? "perspective"}`,
    `target ${cam.target?.x ?? 0},${cam.target?.y ?? 0},${cam.target?.z ?? 0}`,
    `主光 yaw ${opts.render.lights.key.yaw} pitch ${opts.render.lights.key.pitch} 强度 ${opts.render.lights.key.intensity} 色 ${opts.render.lights.key.color}`,
    `补光 ${opts.render.lights.fillIntensity ?? 0.25} 环境 ${opts.render.lights.ambient ?? 0.3}`,
    `背景 ${opts.render.background ?? ""} 剔除背景 ${opts.render.cullBackground ? "是" : "否"}`,
    opts.note ?? "",
    `物件 ${meshes.length} 件`,
  ].join("\n");
  const fbxText = buildAsciiFbx(folder, meshes);
  const bound = !!(opts.projectDir && looksLikeFullPath(opts.projectDir));
  if (bound && opts.projectDir) {
    await writeTextRel(opts.projectDir, `导出模型/${folder}/${folder}.fbx`, fbxText);
    await writeTextRel(opts.projectDir, `导出模型/${folder}/场景说明.txt`, note);
    for (const t of texFiles) {
      const full = joinDisk(opts.projectDir, `导出模型/${folder}/${t.rel}`);
      await writeDiskBytes(full, bytesToBase64(t.data));
    }
    await openExportModelFolder(opts.projectDir);
    return `已写入 导出模型/${folder}/`;
  }
  const files = [
    { name: `${folder}/${folder}.fbx`, data: new TextEncoder().encode(fbxText) },
    { name: `${folder}/场景说明.txt`, data: new TextEncoder().encode(note) },
    ...texFiles.map((t) => ({ name: `${folder}/${t.rel}`, data: t.data })),
  ];
  const zip = zipStore(files);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  a.download = `${folder}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  return "未绑定本机工程文件夹，已下载 zip。绑定后会写入「导出模型」子目录。";
}

/** @deprecated 主格式已是 FBX；保留别名以免旧调用断开 */
export const exportSceneObj = exportSceneFbx;
