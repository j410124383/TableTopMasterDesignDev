/**
 * 从 Unity Ankh 工程导入 TMD 项目：Luban JSON + Sprites + 关键词染色。
 * 用法：node scripts/import-ankh.mjs [输出目录]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { layersFromPrefab } from "./unityPrefab.mjs";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNITY =
  process.env.ANKH_UNITY || path.resolve(ROOT, "..", "0513_CardPrint", "Unity");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "projects", "Ankh"));
const SPRITES = path.join(UNITY, "Assets", "Resources", "Sprites");
const JSON_DIR = path.join(UNITY, "Assets", "Datas", "LubanGen", "Datas", "json");
const KW_DIR = path.join(UNITY, "Assets", "Resources", "Datas", "KeyWorlds", "Ankh");
const PREFAB_DIR = "Assets/Resources/Prefabs/Ankh";

const BLEED = 3;
const FONT = "Noto Sans SC";
const FONT_BOLD = "Noto Sans SC Bold";
const FONT_NUM = "Orator Std";
const CREAM = "#f8f9da";

const SIZE_UNIT = { w: 54, h: 87 };
const SIZE_LAND = { w: 87, h: 54 };
const SIZE_FATE = { w: 70, h: 120 };

function ly(id, type, name, b, style, extra = {}) {
  return {
    id,
    type,
    name,
    ...b,
    visible: true,
    locked: extra.locked ?? false,
    rotation: extra.rotation,
    style,
    text: extra.text,
    vars: extra.vars,
    visibleWhen: extra.visibleWhen,
    repeatPerRow: extra.repeatPerRow,
  };
}

function txt(style, extra = {}) {
  return {
    color: CREAM,
    fontSizeMm: 3.1,
    fontFamily: FONT,
    align: extra.align ?? "center",
    valign: extra.valign ?? "middle",
    lineHeight: 1.25,
    ...style,
  };
}

function fullBleed(size) {
  return { x: -BLEED, y: -BLEED, w: size.w + BLEED * 2, h: size.h + BLEED * 2 };
}

function backLayers(idPrefix, title, size, fill = "#1a140e", backAsset = "") {
  if (backAsset) {
    return [
      ly(
        `${idPrefix}-back`,
        "image",
        "背面",
        fullBleed(size),
        { fit: "cover" },
        { text: backAsset, locked: true },
      ),
    ];
  }
  return [
    ly(`${idPrefix}-back-bg`, "rect", "底", fullBleed(size), { fill }, { locked: true }),
    ly(
      `${idPrefix}-back-title`,
      "text",
      "backTitle",
      { x: 4, y: size.h / 2 - 8, w: size.w - 8, h: 16 },
      txt({ color: "#c9a227", fontSizeMm: 5, fontWeight: 700 }),
      { text: title },
    ),
  ];
}

function bp(id, name, size, frontLayers, backTitle, backAsset = "") {
  return {
    id,
    name,
    size: { ...size },
    bleedMm: BLEED,
    cornerRadiusMm: 3,
    frontLayers,
    backLayers: backLayers(id, backTitle, size, "#1a140e", backAsset),
  };
}

function polishLayers(layers) {
  return layers.map((l) => {
    if (l.type !== "text") return l;
    const style = { ...l.style };
    if (l.name === "desc" || l.vars?.text === "desc") style.color = CREAM;
    if (l.name === "cost" || l.name === "power" || l.name === "num" || l.name === "distur") {
      style.fontFamily = FONT_NUM;
    } else if (l.name === "name" || l.name === "name2") {
      style.fontFamily = FONT_BOLD;
    } else {
      style.fontFamily = style.fontFamily?.includes("Consolas") ? FONT_NUM : FONT;
    }
    // Unity AV 偏差：TMD 默认字距 0
    delete style.letterSpacingMm;
    return { ...l, style };
  });
}

async function frontFromPrefab(file, idPrefix, trim, binds) {
  const layers = await layersFromPrefab(UNITY, path.join(PREFAB_DIR, file), {
    idPrefix,
    trim,
    binds,
  });
  return polishLayers(layers);
}

const BINDS = {
  unit: undefined,
  stone: {
    T_Type: { skip: true },
    T_Note: { skip: true },
    T_CostNum: { skip: true },
    T_PowerNum: { skip: true },
    I_Note: { skip: true },
    "I_Note (1)": { skip: true },
  },
  disaster: {
    T_Type: { skip: true },
    T_CostNum: { skip: true },
    T_PowerNum: { skip: true },
    T_Change: { skip: true },
  },
  apostle: {
    T_Type: { name: "name2", vars: { text: "name2" } },
    T_CostNum: { skip: true },
    T_PowerNum: { skip: true },
    T_Change: { skip: true },
    I_Effect: { skip: true },
    I_Effect_02: { skip: true },
  },
  hallows: {
    T_CostNum: { name: "distur", vars: { text: "distur" }, numeric: true },
    T_PowerNum: { skip: true },
    T_Type: { skip: true },
    T_Change: { skip: true },
    I_Effect: { skip: true },
    I_Effect_02: { skip: true },
    I_Back: { skip: true },
  },
  fate: {
    T_CostNum: { name: "num", vars: { text: "num" }, numeric: true },
    T_PowerNum: { skip: true },
    T_Change: { skip: true },
    I_Effect: { skip: true },
    I_Effect_02: { skip: true },
    I_Vicon: { skip: true },
  },
};

async function buildBlueprints(assets = {}) {
  const unit = await frontFromPrefab("P_AnkhUnitCard.prefab", "unit", SIZE_UNIT, BINDS.unit);
  const stone = await frontFromPrefab("P_AnkhStoneCard.prefab", "stone", SIZE_LAND, BINDS.stone);
  const hallows = await frontFromPrefab("P_Ankh_Hallows.prefab", "hallows", SIZE_UNIT, BINDS.hallows);
  const disaster = await frontFromPrefab("P_AnkhDisasterCard.prefab", "disaster", SIZE_LAND, BINDS.disaster);
  const apostle = await frontFromPrefab("P_AnkhDisasterKnightCard.prefab", "apostle", SIZE_UNIT, BINDS.apostle);
  const fate = await frontFromPrefab("P_AnkhCardFate.prefab", "fate", SIZE_FATE, BINDS.fate);
  const corridor = await frontFromPrefab("P_AnkhCardFate.prefab", "corridor", SIZE_FATE, BINDS.fate);
  const reward = await frontFromPrefab("P_AnkhCardFate.prefab", "reward", SIZE_FATE, BINDS.fate);

  const pickBack = (...needles) =>
    findAssetIncludes(assets, "cardpsd/", ...needles) || findAssetIncludes(assets, ...needles);
  const unitBack =
    pickAsset(assets, "CardPSD/2.神契牌_背面") ||
    pickBack("神契", "背面") ||
    findAssetIncludes(assets, "cardpsd/", "2.", "背面");

  return [
    bp("bp_unit", "神契", SIZE_UNIT, unit, "神契", unitBack),
    bp("bp_stone", "石碑", SIZE_LAND, stone, "石碑", pickBack("石碑", "背面")),
    bp("bp_hallows", "圣器", SIZE_UNIT, hallows, "圣器", pickBack("圣器", "背面")),
    bp("bp_disaster", "灾祸", SIZE_LAND, disaster, "灾祸", pickBack("灾祸", "背面")),
    bp("bp_apostle", "使徒", SIZE_UNIT, apostle, "使徒", pickBack("使徒", "背面")),
    bp(
      "bp_fate",
      "命运",
      SIZE_FATE,
      fate,
      "命运",
      pickBack("塔罗", "卡背") || pickBack("命运", "卡背") || unitBack,
    ),
    bp(
      "bp_corridor",
      "回廊",
      SIZE_FATE,
      corridor,
      "回廊",
      pickBack("回廊", "卡背") || unitBack,
    ),
    bp(
      "bp_reward",
      "奖励",
      SIZE_FATE,
      reward,
      "奖励",
      pickBack("奖励", "卡背") || unitBack,
    ),
  ];
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

function rgbToHex(r, g, b, a) {
  const h = (n) =>
    Math.max(0, Math.min(255, Math.round(Number(n) * 255)))
      .toString(16)
      .padStart(2, "0");
  const hex = `#${h(r)}${h(g)}${h(b)}`;
  if (a != null && Number.isFinite(Number(a)) && Number(a) < 0.999) return `${hex}${h(a)}`;
  return hex;
}

function decodeYamlStr(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16)));
}

async function loadKeywords() {
  const files = ["行动效果关键词.asset", "触发时机关键词.asset", "石碑属性关键词.asset"];
  const list = [];
  for (const name of files) {
    let raw = "";
    try {
      raw = await readFile(path.join(KW_DIR, name), "utf8");
    } catch {
      continue;
    }
    const blocks = raw.split("- stylechar:");
    for (const block of blocks.slice(1)) {
      const charM = block.match(/^\s*"((?:\\.|[^"])*)"/);
      const ital = /isItalic:\s*1/.test(block);
      const col = block.match(
        /color:\s*\{r:\s*([-\d.]+),\s*g:\s*([-\d.]+),\s*b:\s*([-\d.]+)(?:,\s*a:\s*([-\d.]+))?/,
      );
      if (!charM) continue;
      list.push({
        word: decodeYamlStr(charM[1]),
        italic: ital,
        color: col ? rgbToHex(col[1], col[2], col[3], col[4]) : "#ffffff",
      });
    }
  }
  list.sort((a, b) => b.word.length - a.word.length);
  return list;
}

function styleText(input, keywords) {
  let str = String(input ?? "");
  str = str.replace(/<sprite=\d+>/g, "");
  str = str.replace(/<\/?size=[^>]*>/g, "").replace(/<\/size>/g, "");
  const tokens = [];
  for (const kw of keywords) {
    if (!kw.word || !str.includes(kw.word)) continue;
    const inner = kw.italic ? `<i>${kw.word}</i>` : kw.word;
    const token = `\u0001${tokens.length}\u0001`;
    str = str.split(kw.word).join(token);
    tokens.push(`<color=${kw.color}>${inner}</color>`);
  }
  for (let i = tokens.length - 1; i >= 0; i--) {
    str = str.split(`\u0001${i}\u0001`).join(tokens[i]);
  }
  str = str.replaceAll("“", "“ ");
  str = str.replaceAll("●", "● ");
  return str;
}

function locked(row) {
  return String(row.islock ?? "") === "1";
}

function assetId(relNoExt) {
  return relNoExt.replaceAll("\\", "/");
}

function pickAsset(assets, relNoExt) {
  const id = assetId(relNoExt);
  if (assets[id]) return id;
  const lower = Object.keys(assets).find((k) => k.toLowerCase() === id.toLowerCase());
  if (lower) return lower;
  const tip = id.split("/").pop()?.toLowerCase();
  if (tip) {
    const fuzzy = Object.keys(assets).find(
      (k) => k.toLowerCase() === tip || k.toLowerCase().endsWith(`/${tip}`),
    );
    if (fuzzy) return fuzzy;
  }
  return "";
}

function findAssetIncludes(assets, ...parts) {
  const needles = parts.map((p) => p.toLowerCase());
  return (
    Object.keys(assets).find((k) => {
      const kk = k.toLowerCase();
      return needles.every((n) => kk.includes(n));
    }) ?? ""
  );
}

async function copyAnkhFonts(assetsOut) {
  const fontsDir = path.join(path.dirname(assetsOut), "fonts");
  await mkdir(fontsDir, { recursive: true });
  const fontRoot = path.join(UNITY, "Assets", "Resources", "Fonts");
  const specs = [
    {
      src: path.join(fontRoot, "NotoSansSC-Regular.otf"),
      id: "font_noto_sc",
      family: FONT,
      file: "NotoSansSC-Regular.otf",
    },
    {
      src: path.join(fontRoot, "NotoSansSC-Bold.otf"),
      id: "font_noto_sc_bold",
      family: FONT_BOLD,
      file: "NotoSansSC-Bold.otf",
    },
    {
      src: path.join(fontRoot, "OratorStd.otf"),
      id: "font_orator",
      family: FONT_NUM,
      file: "OratorStd.otf",
    },
    {
      src: path.join(fontRoot, "HGY3_CNKI.TTF"),
      id: "font_hgy3",
      family: "HGY3 CNKI",
      file: "HGY3_CNKI.TTF",
    },
  ];
  const assets = {};
  const fonts = [];
  for (const spec of specs) {
    let src = spec.src;
    let outName = spec.file;
    try {
      await stat(src);
    } catch {
      const altName = spec.file.replace(/\.otf$/i, ".ttf");
      const alt = path.join(fontRoot, "NotoSansSC", "1.SourceFonts", altName);
      try {
        await stat(alt);
        src = alt;
        outName = altName;
      } catch {
        console.warn("缺少字体", spec.src);
        continue;
      }
    }
    await copyFile(src, path.join(fontsDir, outName));
    assets[spec.id] = `assets/fonts/${outName}`;
    fonts.push({ id: spec.id, family: spec.family, assetId: spec.id });
  }
  return { assets, fonts };
}

/** 把 CardPSD 等 PSD 预烘焙成 PNG —— 已弃用：改为工程内直接引用 .psd */
async function removeBakedPsdPngs(imagesRoot) {
  const { unlink } = await import("node:fs/promises");
  const walk = async (dir) => {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!ent.name.toLowerCase().endsWith(".png")) continue;
      const psd = full.replace(/\.png$/i, ".psd");
      try {
        await stat(psd);
        await unlink(full);
      } catch {
        /* 没有同名 psd 则保留 png */
      }
    }
  };
  await walk(imagesRoot);
}

/** 把工程里已有的 CardPSD 等登记进 assets（不覆盖已有 id；同名优先 .psd） */
async function indexExtraImages(assetsOut, assets) {
  const walk = async (dir, relParts) => {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ent.name.startsWith("_")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, [...relParts, ent.name]);
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".psd"].includes(ext)) continue;
      const id = [...relParts, ent.name.replace(/\.[^.]+$/, "")].join("/");
      const rel = `assets/images/${[...relParts, ent.name].join("/")}`;
      const prev = assets[id];
      // 已有非 psd、新来的是 psd → 改引用 psd；已有 psd 则不动
      if (!prev) assets[id] = rel;
      else if (ext === ".psd" && !String(prev).toLowerCase().endsWith(".psd")) assets[id] = rel;
    }
  };
  await walk(assetsOut, []);
}

function card(id, fields, qty = 1) {
  return { id, qty, fields };
}

function extraKeys(keys) {
  return [...new Set([...keys, "id", "vicon", "color", "faq", "guide", "story", "changetype"])];
}

async function copyAnkhSprites(assetsOut) {
  const folders = [
    "Color",
    "Effect",
    "Illustration",
    "versionicon",
    "Fate",
    "illust_Stone",
    "illust_Hallows",
    "illust_Disaster",
  ];
  const assets = {};
  let copied = 0;
  for (const folder of folders) {
    const files = await walkFiles(path.join(SPRITES, folder));
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
      const relFromSprites = path.relative(SPRITES, file).replaceAll("\\", "/");
      const noExt = relFromSprites.slice(0, -ext.length);
      const dest = path.join(assetsOut, relFromSprites);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(file, dest);
      assets[assetId(noExt)] = `assets/images/${relFromSprites}`;
      copied += 1;
    }
  }
  return { assets, copied };
}

async function sliceFateTypeIcons(assetsOut, assets) {
  const src = path.join(assetsOut, "Fate", "FateIcon", "Type.png");
  try {
    await stat(src);
  } catch {
    return;
  }
  const destDir = path.join(assetsOut, "Fate", "FateIcon");
  const srcLit = src.replace(/'/g, "''");
  const destLit = destDir.replace(/'/g, "''");
  const ps = `
    Add-Type -AssemblyName System.Drawing
    $img = [System.Drawing.Image]::FromFile('${srcLit}')
    for ($i = 0; $i -lt 5; $i++) {
      $bmp = New-Object System.Drawing.Bitmap 100, 100
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0,0,100,100), (New-Object System.Drawing.Rectangle ($i * 100), 0, 100, 100), [System.Drawing.GraphicsUnit]::Pixel)
      $g.Dispose()
      $out = Join-Path '${destLit}' ("Type_" + $i + ".png")
      $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
    }
    $img.Dispose()
  `;
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-STA", "-Command", ps], { timeout: 30000 });
    for (let i = 0; i < 5; i++) {
      assets[`Fate/FateIcon/Type_${i}`] = `assets/images/Fate/FateIcon/Type_${i}.png`;
    }
  } catch (err) {
    console.warn("宫廷图标切片失败，将使用 Type.png 整图", err instanceof Error ? err.message : err);
  }
}

async function writeSplit(dir, project, assetIndex) {
  const dataDir = path.join(dir, "data");
  await mkdir(path.join(dataDir, "blueprints"), { recursive: true });
  await mkdir(path.join(dataDir, "sets"), { recursive: true });
  await mkdir(path.join(dir, "assets", "images"), { recursive: true });
  const name = project.meta.name.replace(/[\\/:*?"<>|]/g, "_") || "Ankh";
  await writeFile(
    path.join(dir, `${name}.ceditor`),
    JSON.stringify({ info: "Card Editor project folder", format: "ceditor-folder-v1" }, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "project.json"),
    JSON.stringify(
      { schemaVersion: 1, format: "ceditor-folder-v1", meta: project.meta, print: project.print },
      null,
      2,
    ),
    "utf8",
  );
  for (const bpItem of project.blueprints) {
    await writeFile(path.join(dataDir, "blueprints", `${bpItem.id}.json`), JSON.stringify(bpItem, null, 2), "utf8");
  }
  for (const set of project.sets) {
    await writeFile(path.join(dataDir, "sets", `${set.id}.json`), JSON.stringify(set, null, 2), "utf8");
  }
  await writeFile(path.join(dataDir, "variables.json"), "[]", "utf8");
  await writeFile(path.join(dataDir, "fonts.json"), JSON.stringify(project.fonts ?? [], null, 2), "utf8");
  await writeFile(path.join(dataDir, "assets.json"), JSON.stringify(assetIndex, null, 2), "utf8");
  await writeFile(path.join(dataDir, "export.json"), JSON.stringify(project.print, null, 2), "utf8");
}

function fieldKeysOf(blueprint) {
  const keys = [];
  for (const layer of [...blueprint.frontLayers, ...blueprint.backLayers]) {
    if (!layer.vars) continue;
    for (const v of Object.values(layer.vars)) if (v) keys.push(v);
  }
  return extraKeys(keys);
}

/** 用数据集第一张牌的字段填进蓝图图层默认值，方便蓝图预览 */
function applySampleDefaults(blueprints, sets) {
  for (const bpItem of blueprints) {
    const set = sets.find((s) => s.blueprintId === bpItem.id && s.cards?.length);
    const fields = set?.cards[0]?.fields;
    if (!fields) continue;
    for (const layer of [...bpItem.frontLayers, ...bpItem.backLayers]) {
      if (!layer.vars) continue;
      if (layer.vars.text && fields[layer.vars.text] != null) {
        layer.text = String(fields[layer.vars.text]);
      }
      if (layer.vars.src && fields[layer.vars.src]) {
        layer.text = String(fields[layer.vars.src]);
      }
    }
  }
}

function courtOf(affix, assets) {
  const a = String(affix ?? "");
  let name = "Type_4";
  if (a.includes("国王")) name = "Type_0";
  else if (a.includes("王后")) name = "Type_1";
  else if (a.includes("骑士")) name = "Type_2";
  else if (a.includes("侍从")) name = "Type_3";
  return pickAsset(assets, `Fate/FateIcon/${name}`) || pickAsset(assets, "Fate/FateIcon/Type");
}

function fateFrame(vicon, color, assets) {
  let frame = "";
  if (vicon === "FC_F") frame = `Fate/FateFrame/Fate_${color}`;
  else if (vicon === "FC_B") frame = `Fate/FateFrame/${color}`;
  else if (vicon === "FC_R") frame = `Fate/FateFrame/R_${color}`;
  return pickAsset(assets, frame);
}

async function readTable(name) {
  return JSON.parse(await readFile(path.join(JSON_DIR, name), "utf8"));
}

async function main() {
  const unityOk = await stat(JSON_DIR).catch(() => null);
  if (!unityOk) {
    console.error(`找不到 Unity JSON：${JSON_DIR}`);
    process.exit(1);
  }
  await mkdir(path.join(OUT, "assets", "images"), { recursive: true });
  const { assets, copied } = await copyAnkhSprites(path.join(OUT, "assets", "images"));
  const { assets: fontAssets, fonts } = await copyAnkhFonts(path.join(OUT, "assets", "images"));
  Object.assign(assets, fontAssets);
  await sliceFateTypeIcons(path.join(OUT, "assets", "images"), assets);
  await indexExtraImages(path.join(OUT, "assets", "images"), assets);
  // 故意不烘焙 PNG：工程里继续引用 .psd，显示时由 /__fs 按需解码
  await removeBakedPsdPngs(path.join(OUT, "assets", "images"));
  const keywords = await loadKeywords();
  const blueprints = await buildBlueprints(assets);
  const stamp = new Date().toISOString();
  const cover = pickAsset(assets, "Illustration/images/I_02") || Object.keys(assets)[0];

  const units = (await readTable("ankhtable_tbankhunit.json")).filter((r) => !locked(r));
  const unitPrint = units.filter((r) => r.changetype !== "被修改");
  const stones = (await readTable("ankhtable_tbankhstone.json")).filter((r) => !locked(r));
  const hallows = (await readTable("ankhtable_tbankhhallows.json")).filter((r) => !locked(r));
  const disasters = (await readTable("ankhtable_tbankhdisaster.json")).filter((r) => !locked(r));
  const knights = (await readTable("ankhtable_tbankhdisasterknight.json")).filter((r) => !locked(r));
  const fates = (await readTable("ankhtable_tbankhfate.json")).filter((r) => !locked(r));

  const mapUnit = (row, noText) => {
    const effectDir = noText ? "Effect/NoText" : "Effect";
    return card(`unit_${row.id}${noText ? "_nt" : ""}`, {
      id: row.id,
      name: noText ? "" : row.name ?? "",
      affix: noText ? "" : row.affix ?? "",
      desc: noText ? "" : styleText(row.desc, keywords),
      note: noText ? "" : row.note ?? "",
      cost: String(row.cost ?? ""),
      power: String(row.power ?? ""),
      changetype: row.changetype ?? "",
      vicon: row.vicon ?? "",
      color: row.color ?? "",
      frame: pickAsset(assets, `Color/${row.color}`),
      art: pickAsset(assets, `Illustration/images/${row.cover_img}`),
      effect: pickAsset(assets, `${effectDir}/${row.effect}`),
      vicon_img: pickAsset(assets, `versionicon/${row.vicon}`),
      faq: row.faq ?? "",
      guide: row.guide ?? "",
      story: row.story ?? "",
    });
  };

  const mapStone = (row) => {
    const tips = row.tips ? `\n<i>(${row.tips})</i>` : "";
    return card(`stone_${row.id}`, {
      id: row.id,
      name: row.name ?? "",
      desc: styleText(`${row.desc ?? ""}${tips}`, keywords),
      score_01: row.score_01 ?? "",
      score_02: row.score_02 ?? "",
      apoca: styleText(row.apoca ?? "", keywords),
      art: pickAsset(assets, `illust_Stone/images/${row.cover_img}`),
      vicon_img: pickAsset(assets, `versionicon/${row.vicon}`),
      frame: pickAsset(assets, "Color/N"),
      vicon: row.vicon ?? "",
      faq: row.faq ?? "",
      guide: row.guide ?? "",
      story: "",
    });
  };

  const mapHallows = (row) =>
    card(`hallows_${row.id}`, {
      id: row.id,
      name: row.name ?? "",
      desc: styleText(row.desc, keywords),
      note: row.note ?? "",
      distur: row.distur ?? "",
      art: pickAsset(assets, `illust_Hallows/images/${row.ill_img}`),
      frame:
        pickAsset(assets, "Color/87x54_圣器牌_CMYK") ||
        findAssetIncludes(assets, "color/", "圣器"),
      vicon_img: pickAsset(assets, `versionicon/${row.vicon}`),
      vicon: row.vicon ?? "",
      faq: row.faq ?? "",
      guide: row.guide ?? "",
      story: row.story ?? "",
    });

  const mapDisaster = (row) =>
    card(`disaster_${row.id}`, {
      id: row.id,
      name: row.name ?? "",
      desc: styleText(row.desc, keywords),
      note: row.note ?? "",
      art: pickAsset(assets, `illust_Disaster/images/${row.cover_img}`),
      frame: pickAsset(assets, "Color/87x54_天灾牌"),
      vicon: row.vicon ?? "",
      vicon_img: pickAsset(assets, `versionicon/${row.vicon}`),
    });

  const mapKnight = (row) =>
    card(`apostle_${row.id}`, {
      id: row.id,
      name: row.name ?? "",
      name2: row.name2 ?? "",
      desc: styleText(String(row.desc ?? "").replace(/<sprite=\d+>/g, "• "), keywords),
      note: row.note ?? "",
      cardback: pickAsset(assets, `illust_Disaster/knight/${row.cardback_img}`),
      frame: pickAsset(assets, `illust_Disaster/knight/${row.cardframe_img}`),
      art: pickAsset(assets, `illust_Disaster/knight/images/${row.ill_img}`),
      vicon_img: pickAsset(assets, `versionicon/${row.vicon}`),
      vicon: row.vicon ?? "",
      color: row.color ?? "",
      faq: row.faq ?? "",
      guide: row.guide ?? "",
    });

  const mapFate = (row) => {
    const set = row.desc_set ? `${row.desc_set}\n` : "";
    const desc = row.vicon === "FC_B" ? `${set}${row.desc ?? ""}` : (row.desc ?? "");
    return card(`fate_${row.vicon}_${row.id}`, {
      id: row.id,
      name: row.name ?? "",
      num: row.num ?? "",
      affix: row.affix ?? "",
      desc: styleText(desc, keywords),
      desc_set: row.desc_set ?? "",
      note: row.note ?? "",
      vicon: row.vicon ?? "",
      color: row.color ?? "",
      art: pickAsset(assets, `Fate/FateIllust/${row.cover_img}`),
      frame: fateFrame(row.vicon, row.color, assets),
      frame2: pickAsset(assets, `Fate/FateFrame/PSD_Frame_Black_${row.color}`),
      court: courtOf(row.affix, assets),
      faq: row.faq ?? "",
      guide: row.guide ?? "",
      story: row.story ?? "",
    });
  };

  const byBp = Object.fromEntries(blueprints.map((b) => [b.id, b]));
  const fieldTypesOf = (blueprint) => {
    const usedData = new Set();
    const usedActive = new Set();
    for (const layer of [...(blueprint?.frontLayers ?? []), ...(blueprint?.backLayers ?? [])]) {
      if (!layer.vars) continue;
      for (const [prop, key] of Object.entries(layer.vars)) {
        if (!key) continue;
        if (prop === "active") usedActive.add(key);
        else usedData.add(key);
      }
    }
    const out = {};
    for (const key of usedActive) {
      if (!usedData.has(key)) out[key] = "bool";
    }
    return out;
  };
  const setOf = (id, name, blueprintId, cards) => ({
    id,
    name,
    blueprintId,
    cards,
    fieldKeys: fieldKeysOf(byBp[blueprintId]),
    fieldTypes: fieldTypesOf(byBp[blueprintId]),
  });

  const sets = [
    setOf("set_unit", "神契", "bp_unit", unitPrint.map((r) => mapUnit(r, false))),
    setOf("set_stone", "石碑", "bp_stone", stones.map(mapStone)),
    setOf("set_hallows", "圣器", "bp_hallows", hallows.map(mapHallows)),
    setOf("set_disaster", "灾祸", "bp_disaster", disasters.map(mapDisaster)),
    setOf("set_apostle", "使徒", "bp_apostle", knights.map(mapKnight)),
    setOf(
      "set_fate",
      "命运",
      "bp_fate",
      fates.filter((r) => r.vicon === "FC_F").map(mapFate),
    ),
    setOf(
      "set_corridor",
      "回廊",
      "bp_corridor",
      fates.filter((r) => r.vicon === "FC_B").map(mapFate),
    ),
    setOf(
      "set_reward",
      "奖励",
      "bp_reward",
      fates.filter((r) => r.vicon === "FC_R").map(mapFate),
    ),
  ];

  applySampleDefaults(blueprints, sets);

  const project = {
    schemaVersion: 1,
    meta: {
      id: "prj_ankh",
      name: "Ankh",
      note: "从 Unity Ankh 导入。神契默认剔除「被修改」，全部跳过 islock=1。",
      coverAsset: cover,
      createdAt: stamp,
      updatedAt: stamp,
      defaultSize: SIZE_UNIT,
    },
    blueprints,
    sets,
    templates: [],
    decks: [],
    assets,
    variables: [],
    fonts,
    print: {
      paper: "a4",
      orientation: "portrait",
      customW: 210,
      customH: 297,
      marginMm: 8,
      gapMm: 4,
      bleedMm: 3,
      cutMarks: true,
      cutColor: "#222222",
      cutLengthMm: 3,
      offsetX: 0,
      offsetY: 0,
      duplex: false,
      dpi: 300,
      filename: "{项目}-{牌组}-{序号}",
      mode: "print",
      ttsCols: 10,
      ttsRows: 8,
    },
  };

  await writeSplit(OUT, project, assets);
  const counts = sets.map((s) => `${s.name} ${s.cards.length}`).join("、");
  console.log(`Ankh 已写入 ${OUT}`);
  console.log(`图片 ${copied} 张，关键词 ${keywords.length} 条，字体 ${fonts.length} 个`);
  console.log(counts);
}

await main();
