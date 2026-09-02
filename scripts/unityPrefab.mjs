/**
 * 把 Unity Prefab YAML 转成 TMD 图层：保留 Rect 嵌套、TMP 对齐/颜色/字号。
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const TMP_GUID = "f4688fdb7df04437aeb418b961361dc5";
const IMAGE_GUID = "fe87c0e1cc204ed48ad3b37840f39efc";
const MM = 25.4 / 300;

const SKIP_PREFAB_FILES = new Set(["P_Effect.prefab", "I_Edgeline.prefab", "I_Mark.prefab"]);
const SKIP_OBJECT_NAMES = new Set(["Camera", "Canvas"]);

const FONT = "Noto Sans SC";
const FONT_NUM = "Orator Std";

export const DEFAULT_BIND = {
  T_CostNum: { name: "cost", vars: { text: "cost" }, numeric: true },
  T_PowerNum: { name: "power", vars: { text: "power" }, numeric: true },
  T_Name: { name: "name", vars: { text: "name" } },
  T_Type: { name: "affix", vars: { text: "affix" } },
  T_Desc: { name: "desc", vars: { text: "desc" } },
  T_Note: { name: "note", vars: { text: "note", active: "note" } },
  T_ID: { name: "id", vars: { text: "id" } },
  T_Change: { name: "changetype", vars: { text: "changetype", active: "changetype" } },
  I_Frame: { name: "frame", vars: { src: "frame" } },
  I_Illustration: { name: "art", vars: { src: "art" } },
  I_Ill: { name: "art", vars: { src: "art" } },
  I_Effect: { name: "effect", vars: { src: "effect" } },
  I_Effect_02: { name: "effect2" },
  I_Vicon: { name: "vicon_img", vars: { src: "vicon_img" } },
  I_Vicon_01: { name: "vicon_img", vars: { src: "vicon_img" } },
  I_Vicon_02: { name: "vicon_img", vars: { src: "vicon_img" } },
  I_Note: { name: "note_bg", vars: { active: "note" } },
  "I_Note (1)": { name: "note_bg", vars: { active: "note" } },
  T_Score: { name: "score_01", vars: { text: "score_01" } },
  "T_Score (1)": { name: "score_02", vars: { text: "score_02" } },
  T_Apo: { name: "apoca", vars: { text: "apoca" } },
  T_Tips: { skip: true },
  I_Type_Icon: { name: "court", vars: { src: "court" } },
  I_Back: { name: "cardback", vars: { src: "cardback" } },
  I_back: { name: "cardback", vars: { src: "cardback" } },
  I_TextBar_01: { name: "frame2", vars: { src: "frame2" } },
  Image: { skip: true },
  Panel: { skip: true },
};

function mm(px) {
  return Math.round(Number(px) * MM * 100) / 100;
}

function fid(v) {
  if (v == null) return "0";
  if (typeof v === "object") return String(v.fileID ?? 0);
  return String(v);
}

function isNone(id) {
  return !id || id === "0" || id === "undefined" || id === "null";
}

function decodeYamlStr(s) {
  return String(s).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
    String.fromCharCode(Number.parseInt(h, 16)),
  );
}

function splitTopCommas(s) {
  const out = [];
  let buf = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth += 1;
    if (c === "}") depth -= 1;
    if (c === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === "" || s === "~") return "";
  if (s === "true") return true;
  if (s === "false") return false;
  if (s.startsWith("{") && s.endsWith("}")) {
    const obj = {};
    for (const part of splitTopCommas(s.slice(1, -1))) {
      const i = part.indexOf(":");
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      obj[k] = k === "fileID" || k === "guid" ? v.replace(/^["']|["']$/g, "") : parseScalar(v);
    }
    return obj;
  }
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return decodeYamlStr(s.slice(1, -1).replace(/\\"/g, '"'));
  }
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (/^-?\d+$/.test(s)) return s.length >= 16 ? s : Number(s);
  return decodeYamlStr(s);
}

function indentOf(line) {
  const m = line.match(/^[ ]*/);
  return m ? m[0].length : 0;
}

function parseBlock(lines, start, baseIndent) {
  const obj = {};
  const list = [];
  let isList = false;
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const ind = indentOf(line);
    if (ind < baseIndent) break;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      isList = true;
      const rest = trimmed.slice(2);
      let item;
      let ni = i + 1;
      if (rest.includes(":") && !rest.startsWith("{")) {
        const c = rest.indexOf(":");
        const key = rest.slice(0, c).trim();
        const val = rest.slice(c + 1).trim();
        item = {};
        if (val) item[key] = parseScalar(val);
        else {
          const [child, cj] = parseBlock(lines, ni, ind + 2);
          item[key] = child;
          ni = cj;
        }
        while (ni < lines.length) {
          const nline = lines[ni];
          if (!nline.trim()) {
            ni += 1;
            continue;
          }
          const nind = indentOf(nline);
          if (nind <= ind) break;
          const nt = nline.trim();
          if (nt.startsWith("- ")) break;
          const nc = nt.indexOf(":");
          const nk = nt.slice(0, nc).trim();
          const nv = nt.slice(nc + 1).trim();
          if (nv) {
            item[nk] = parseScalar(nv);
            ni += 1;
          } else {
            const [child, cj] = parseBlock(lines, ni + 1, nind + 2);
            item[nk] = child;
            ni = cj;
          }
        }
      } else {
        item = parseScalar(rest);
      }
      list.push(item);
      i = ni;
      continue;
    }
    if (isList) break;
    const c = trimmed.indexOf(":");
    if (c < 0) {
      i += 1;
      continue;
    }
    const key = trimmed.slice(0, c).trim();
    const val = trimmed.slice(c + 1).trim();
    if (val) {
      obj[key] = parseScalar(val);
      i += 1;
    } else {
      // Unity YAML：序列常与父键同缩进（非标准多缩进）
      //   m_Children:
      //   - {fileID: 1}
      const next = lines[i + 1];
      const nextTrim = next?.trim() ?? "";
      const nextInd = next ? indentOf(next) : -1;
      const childBase =
        nextTrim.startsWith("- ") && nextInd === ind ? ind : ind + 2;
      const [child, ni] = parseBlock(lines, i + 1, childBase);
      obj[key] = child;
      i = ni;
    }
  }
  return [isList ? list : obj, i];
}

function parseUnityYaml(text) {
  const docs = [];
  const re = /^--- !u!(\d+) &(-?\d+)( stripped)?[^\n]*\n/gm;
  const matches = [...text.matchAll(re)];
  for (let n = 0; n < matches.length; n++) {
    const m = matches[n];
    const start = m.index + m[0].length;
    const end = n + 1 < matches.length ? matches[n + 1].index : text.length;
    const body = text.slice(start, end);
    const lines = body.replace(/\r/g, "").split("\n");
    const typeLine = lines[0]?.trim().replace(/:$/, "") ?? "";
    const [data] = parseBlock(lines, 1, 0);
    docs.push({
      classId: Number(m[1]),
      fileId: m[2],
      stripped: Boolean(m[3]),
      type: typeLine,
      data: data && typeof data === "object" ? data : {},
    });
  }
  return docs;
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function setProp(obj, propertyPath, value, objectReference) {
  if (!obj || !propertyPath) return;
  if (/\.Array\./.test(propertyPath) || propertyPath.includes("Array.")) return;
  const parts = propertyPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  const last = parts[parts.length - 1];
  if (objectReference && fid(objectReference) !== "0") cur[last] = objectReference;
  else if (value !== undefined) cur[last] = value;
}

function vec(v, fallback = 0) {
  if (v && typeof v === "object") return { x: Number(v.x) || 0, y: Number(v.y) || 0, z: Number(v.z) || 0, w: Number(v.w) || 0 };
  return { x: fallback, y: fallback, z: fallback, w: fallback };
}

function scriptGuid(mb) {
  return mb?.m_Script?.guid ?? "";
}

function fileIdList(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((item) => fid(item.component ?? item.fileID ?? item)).filter((id) => !isNone(id));
}

function worldGet(world, id) {
  return world.byId.get(fid(id));
}

function goName(go) {
  return String(go?.data?.m_Name ?? "");
}

function componentsOf(go, world) {
  return fileIdList(go?.data?.m_Component).map((id) => worldGet(world, id)).filter(Boolean);
}

function rectOfGo(go, world) {
  return componentsOf(go, world).find((c) => c.classId === 224 || c.type === "RectTransform");
}

function tmpOfGo(go, world) {
  return componentsOf(go, world).find((c) => scriptGuid(c.data) === TMP_GUID);
}

function imageOfGo(go, world) {
  return componentsOf(go, world).find((c) => scriptGuid(c.data) === IMAGE_GUID);
}

function goOfRt(rt, world) {
  return worldGet(world, rt?.data?.m_GameObject);
}

function childrenRtIds(rt) {
  return fileIdList(rt?.data?.m_Children);
}

function remapValue(v, idMap) {
  if (Array.isArray(v)) return v.map((x) => remapValue(x, idMap));
  if (v && typeof v === "object") {
    if (v.fileID != null && (v.guid == null || v.guid === 0 || v.guid === "0")) {
      const id = fid(v.fileID);
      if (!isNone(id) && idMap.has(id)) return { ...v, fileID: idMap.get(id) };
    }
    const out = Array.isArray(v) ? [] : {};
    for (const [k, val] of Object.entries(v)) out[k] = remapValue(val, idMap);
    return out;
  }
  return v;
}

function applyMods(world, mods, sourceGuid) {
  if (!mods) return;
  const list = Array.isArray(mods) ? mods : [mods];
  for (const mod of list) {
    const target = mod.target ?? {};
    if (target.guid && sourceGuid && target.guid !== sourceGuid) continue;
    const obj = worldGet(world, target.fileID);
    if (!obj) continue;
    setProp(obj.data, mod.propertyPath, mod.value, mod.objectReference);
  }
}

function remapWorld(world, idMap) {
  const next = new Map();
  for (const [oldId, obj] of world.byId) {
    const id = idMap.get(oldId) ?? oldId;
    const cloned = {
      ...obj,
      fileId: id,
      data: remapValue(deepClone(obj.data), idMap),
    };
    next.set(id, cloned);
  }
  world.byId = next;
}

function rootRectIds(world) {
  const ids = [];
  for (const obj of world.byId.values()) {
    if (obj.classId !== 224 && obj.type !== "RectTransform") continue;
    if (isNone(fid(obj.data.m_Father))) ids.push(obj.fileId);
  }
  return ids;
}

function mergeWorld(dst, src) {
  for (const [id, obj] of src.byId) dst.byId.set(id, obj);
}

function attachChild(parentRt, childRtId) {
  const kids = childrenRtIds(parentRt);
  if (kids.includes(childRtId)) return;
  const raw = parentRt.data.m_Children;
  const item = { fileID: childRtId };
  if (!raw) parentRt.data.m_Children = [item];
  else if (Array.isArray(raw)) raw.push(item);
  else parentRt.data.m_Children = [raw, item];
}

async function walkFiles(dir, acc = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) await walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

const guidCache = new Map();

export async function buildGuidMap(unityRoot) {
  if (guidCache.size) return guidCache;
  const files = await walkFiles(path.join(unityRoot, "Assets"));
  for (const file of files) {
    if (!file.endsWith(".meta")) continue;
    const text = await readFile(file, "utf8");
    const m = text.match(/^guid:\s*([a-f0-9]{32})/m);
    if (!m) continue;
    guidCache.set(m[1], file.slice(0, -5));
  }
  return guidCache;
}

async function instantiatePrefab(prefabPath, ctx) {
  const text = await readFile(prefabPath, "utf8");
  const docs = parseUnityYaml(text);
  const world = { byId: new Map() };
  const strippedByInst = new Map();

  for (const doc of docs) {
    if (doc.stripped) {
      const instId = fid(doc.data.m_PrefabInstance);
      const srcId = fid(doc.data.m_CorrespondingSourceObject);
      if (!strippedByInst.has(instId)) strippedByInst.set(instId, new Map());
      strippedByInst.get(instId).set(srcId, doc.fileId);
      continue;
    }
    if (doc.classId === 1001) continue;
    world.byId.set(doc.fileId, deepClone(doc));
  }

  for (const inst of docs.filter((d) => d.classId === 1001 && !d.stripped)) {
    const guid = inst.data.m_SourcePrefab?.guid;
    const srcPath = guid ? ctx.guidToPath.get(guid) : "";
    if (!srcPath || SKIP_PREFAB_FILES.has(path.basename(srcPath))) continue;
    const nested = await instantiatePrefab(srcPath, ctx);
    const mods = inst.data.m_Modification?.m_Modifications ?? inst.data.m_Modification?.m_Modifications;
    const modification = inst.data.m_Modification ?? {};
    applyMods(nested, modification.m_Modifications, guid);
    const stripped = strippedByInst.get(inst.fileId) ?? new Map();
    const idMap = new Map();
    for (const oldId of nested.byId.keys()) {
      idMap.set(oldId, stripped.get(oldId) ?? `${inst.fileId}_${oldId}`);
    }
    remapWorld(nested, idMap);
    const parentRtId = fid(modification.m_TransformParent);
    if (!isNone(parentRtId)) {
      const parentRt = worldGet(world, parentRtId);
      for (const rootId of rootRectIds(nested)) {
        const rt = worldGet(nested, rootId);
        if (!rt) continue;
        rt.data.m_Father = { fileID: parentRtId };
        if (parentRt) attachChild(parentRt, rootId);
      }
    }
    mergeWorld(world, nested);
  }

  return world;
}

function localRect(parentW, parentH, rt) {
  const amin = vec(rt.data.m_AnchorMin, 0.5);
  const amax = vec(rt.data.m_AnchorMax, 0.5);
  const pivot = vec(rt.data.m_Pivot, 0.5);
  const ap = vec(rt.data.m_AnchoredPosition);
  const sd = vec(rt.data.m_SizeDelta);
  const scale = vec(rt.data.m_LocalScale, 1);
  const anchorX = amin.x * parentW;
  const anchorY = amin.y * parentH;
  const anchorW = (amax.x - amin.x) * parentW;
  const anchorH = (amax.y - amin.y) * parentH;
  const w = Math.abs((sd.x + anchorW) * (scale.x || 1));
  const h = Math.abs((sd.y + anchorH) * (scale.y || 1));
  const px = anchorX + ap.x + pivot.x * anchorW;
  const py = anchorY + ap.y + pivot.y * anchorH;
  const left = px - pivot.x * w;
  const bottom = py - pivot.y * h;
  return { left, top: parentH - bottom - h, w, h, pivot };
}

function rgbHex(color) {
  if (!color || typeof color !== "object") return "#ffffff";
  const h = (n) =>
    Math.max(0, Math.min(255, Math.round(Number(n) * 255)))
      .toString(16)
      .padStart(2, "0");
  const hex = `#${h(color.r)}${h(color.g)}${h(color.b)}`;
  const a = Number(color.a);
  if (Number.isFinite(a) && a < 0.999) return `${hex}${h(a)}`;
  return hex;
}

function hAlign(n) {
  const v = Number(n) || 0;
  if (v & 8) return "justify";
  if (v & 4) return "right";
  if (v & 2 || v & 32) return "center";
  return "left";
}

function vAlign(n) {
  const v = Number(n) || 0;
  if (v & 1024) return "bottom";
  if (v & 512) return "middle";
  return "top";
}

function bindOf(name, binds) {
  if (binds[name]) return binds[name];
  const base = name.replace(/\s*\(\d+\)\s*$/, "");
  return binds[base] ?? binds[name] ?? {};
}

function makeId(prefix, name, used) {
  const slug = String(name || "layer")
    .replace(/[^\w\u4e00-\u9fff]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24) || "layer";
  let id = `${prefix}-${slug}`;
  let n = 2;
  while (used.has(id)) {
    id = `${prefix}-${slug}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function layerFromNode(go, world, absMm, parentId, opts, usedIds) {
  const name = goName(go);
  const bind = bindOf(name, opts.binds);
  const tmp = tmpOfGo(go, world);
  const img = imageOfGo(go, world);
  const rt = rectOfGo(go, world);
  const kids = rt ? childrenRtIds(rt) : [];
  const active = go.data.m_IsActive !== 0 && go.data.m_IsActive !== "0";
  const rot = Number(rt?.data?.m_LocalEulerAnglesHint?.z) || 0;
  const id = makeId(opts.idPrefix, bind.name || name, usedIds);
  const extra = {
    parentId,
    visible: bind.visible ?? active,
    locked: bind.locked ?? false,
    vars: bind.vars,
    rotation: rot || undefined,
  };

  if (tmp) {
    const d = tmp.data;
    const fs = Number(d.m_fontSize) || 36;
    const styleBits = Number(d.m_fontStyle) || 0;
    const numeric = bind.numeric || /Num|Score|Cost|Power|Distur/i.test(name);
    const auto =
      d.m_enableAutoSizing === true ||
      d.m_enableAutoSizing === 1 ||
      d.m_enableAutoSizing === "1";
    const fontColor = d.m_fontColor ?? {};
    const margin = d.m_margin ?? {};
    const mL = Number(margin.x) || 0;
    const mT = Number(margin.y) || 0;
    const mR = Number(margin.z) || 0;
    const mB = Number(margin.w) || 0;
    return {
      id,
      type: "text",
      name: bind.name || name,
      text: bind.text ?? (typeof d.m_text === "string" ? d.m_text : ""),
      ...absMm,
      ...extra,
      style: {
        color: rgbHex(fontColor),
        fontSizeMm: mm(fs),
        fontFamily: numeric ? FONT_NUM : FONT,
        align: hAlign(d.m_HorizontalAlignment),
        valign: vAlign(d.m_VerticalAlignment),
        fontWeight: styleBits & 1 ? 700 : Number(d.m_fontWeight) === 700 ? 700 : undefined,
        italic: Boolean(styleBits & 2) || undefined,
        underline: Boolean(styleBits & 4) || undefined,
        strikethrough: Boolean(styleBits & 8) || undefined,
        lineHeight: Math.max(0.85, Math.min(2, 1.25 + (Number(d.m_lineSpacing) || 0) / 100)),
        letterSpacingMm: undefined,
        autosize: auto || undefined,
        fontSizeMinMm: auto ? mm(d.m_fontSizeMin || 18) : undefined,
        fontSizeMaxMm: auto ? mm(d.m_fontSizeMax || fs || 72) : undefined,
        overflow: auto ? "shrink" : "clip",
        marginLeftMm: mL ? mm(mL) : undefined,
        marginTopMm: mT ? mm(mT) : undefined,
        marginRightMm: mR ? mm(mR) : undefined,
        marginBottomMm: mB ? mm(mB) : undefined,
      },
    };
  }

  if (img) {
    const col = img.data.m_Color ?? {};
    const a = Number(col.a);
    const tint = rgbHex({ ...col, a: 1 }); // RGB 做正片叠底；alpha 单独走 opacity
    return {
      id,
      type: "image",
      name: bind.name || name,
      ...absMm,
      ...extra,
      style: {
        fit: bind.fit ?? "cover",
        opacity: Number.isFinite(a) && a < 0.999 ? a : undefined,
        // 非纯白才写 tint；渲染端用 multiply（对齐 Unity UI Image）
        tint: tint.toLowerCase() === "#ffffff" ? undefined : tint,
      },
    };
  }

  if (kids.length) {
    return {
      id,
      type: "group",
      name: bind.name || name,
      ...absMm,
      ...extra,
      style: {},
    };
  }

  return {
    id,
    type: "group",
    name: bind.name || name,
    ...absMm,
    ...extra,
    style: {},
  };
}

function expandTextBox(absPx, tmp, rt, parentW) {
  const fs = Number(tmp.data.m_fontSize) || 36;
  const pivot = vec(rt.data.m_Pivot, 0.5);
  let { left, top, w, h } = absPx;
  if (w < 2) {
    const nw = Math.max(fs * 8, parentW * 0.55, 80);
    left -= (nw - w) * pivot.x;
    w = nw;
  }
  if (h < 2) {
    const nh = Math.max(fs * 1.35, 24);
    top -= (nh - h) * (1 - pivot.y);
    h = nh;
  }
  return { left, top, w, h };
}

function findCardRoot(world) {
  let found = null;
  for (const obj of world.byId.values()) {
    if (obj.classId !== 1 && obj.type !== "GameObject") continue;
    const n = goName(obj);
    if (n === "CardSet" || n === "P_Card") found = obj;
  }
  return found;
}

/**
 * @param {string} unityRoot
 * @param {string} prefabRel 相对 Unity 工程的路径
 * @param {{ idPrefix: string, trim: {w:number,h:number}, bleedMm?: number, binds?: Record<string, object> }} opts
 */
export async function layersFromPrefab(unityRoot, prefabRel, opts) {
  const guidToPath = await buildGuidMap(unityRoot);
  const prefabPath = path.isAbsolute(prefabRel) ? prefabRel : path.join(unityRoot, prefabRel);
  const world = await instantiatePrefab(prefabPath, { guidToPath });
  const rootGo = findCardRoot(world);
  if (!rootGo) throw new Error(`预制体里没有 CardSet / P_Card：${prefabRel}`);
  const rootRt = rectOfGo(rootGo, world);
  if (!rootRt) throw new Error(`CardSet 没有 RectTransform：${prefabRel}`);
  const rootW = Number(rootRt.data.m_SizeDelta?.x) || 0;
  const rootH = Number(rootRt.data.m_SizeDelta?.y) || 0;
  const originX = mm(rootW) / 2 - opts.trim.w / 2;
  const originY = mm(rootH) / 2 - opts.trim.h / 2;
  const binds = { ...DEFAULT_BIND, ...(opts.binds ?? {}) };
  const usedIds = new Set();
  const layers = [];
  const seen = new Set();

  const visit = (rtId, parentW, parentH, parentPx, parentLayerId, parentAbsMm) => {
    if (isNone(rtId) || seen.has(rtId)) return;
    seen.add(rtId);
    const rt = worldGet(world, rtId);
    if (!rt) return;
    const go = goOfRt(rt, world);
    if (!go) return;
    const name = goName(go);
    if (SKIP_OBJECT_NAMES.has(name) || /^P_Ankh/.test(name)) {
      for (const child of childrenRtIds(rt)) visit(child, parentW, parentH, parentPx, parentLayerId, parentAbsMm);
      return;
    }
    const bind = bindOf(name, binds);
    if (bind.skip) {
      for (const child of childrenRtIds(rt)) visit(child, parentW, parentH, parentPx, parentLayerId, parentAbsMm);
      return;
    }
    let box = localRect(parentW, parentH, rt);
    let absPx = {
      left: parentPx.left + box.left,
      top: parentPx.top + box.top,
      w: box.w,
      h: box.h,
    };
    const tmp = tmpOfGo(go, world);
    if (tmp) absPx = expandTextBox(absPx, tmp, rt, parentW);
    const absMm = {
      x: +(mm(absPx.left) - originX).toFixed(2),
      y: +(mm(absPx.top) - originY).toFixed(2),
      w: +Math.max(0.4, mm(absPx.w)).toFixed(2),
      h: +Math.max(0.4, mm(absPx.h)).toFixed(2),
    };
    const rel = parentLayerId
      ? { x: +(absMm.x - parentAbsMm.x).toFixed(2), y: +(absMm.y - parentAbsMm.y).toFixed(2), w: absMm.w, h: absMm.h }
      : absMm;
    const layer = layerFromNode(go, world, rel, parentLayerId, { ...opts, binds }, usedIds);
    layers.push(layer);
    for (const child of childrenRtIds(rt)) {
      visit(child, absPx.w, absPx.h, absPx, layer.id, absMm);
    }
  };

  const rootPx = { left: 0, top: 0, w: rootW, h: rootH };
  for (const child of childrenRtIds(rootRt)) visit(child, rootW, rootH, rootPx, undefined, { x: 0, y: 0 });
  // Unity 与 TMD 同为「先画的在下」，保持 m_Children 顺序
  return layers;
}

/** 每个父节点下的兄弟图层倒序；保持父子嵌套，只改绘制先后 */
export function reverseDrawOrder(layers) {
  const byParent = new Map();
  for (const l of layers) {
    const k = l.parentId ?? "";
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(l);
  }
  const out = [];
  const walk = (pid) => {
    const kids = [...(byParent.get(pid ?? "") ?? [])].reverse();
    for (const l of kids) {
      out.push(l);
      walk(l.id);
    }
  };
  walk("");
  return out;
}

export function describeLayerTree(layers) {
  const byParent = new Map();
  for (const l of layers) {
    const k = l.parentId ?? "";
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(l);
  }
  const lines = [];
  const walk = (pid, depth) => {
    for (const l of byParent.get(pid ?? "") ?? []) {
      const align =
        l.type === "text" ? ` ${l.style?.align ?? ""}/${l.style?.valign ?? ""} ${l.style?.color ?? ""} ${l.style?.fontSizeMm}mm` : "";
      lines.push(
        `${"  ".repeat(depth)}${l.type} ${l.name}  ${l.x},${l.y} ${l.w}x${l.h}${l.visible === false ? " hidden" : ""}${l.visibleWhen ? ` when:${l.visibleWhen}` : ""}${align}`,
      );
      walk(l.id, depth + 1);
    }
  };
  walk("", 0);
  return lines.join("\n");
}
