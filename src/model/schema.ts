import { normalizeProject } from "./normalize";
import { patchSanguoshaIdentityBacks } from "./sanguosha";
import { PROJECT_SCHEMA_VERSION, type Project } from "./types";

export function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const p = value as Project;
  const hasMeta =
    typeof p.schemaVersion === "number" &&
    !!p.meta &&
    typeof p.meta.id === "string" &&
    typeof p.meta.name === "string" &&
    !!p.assets &&
    typeof p.assets === "object";
  if (!hasMeta) return false;
  const hasLegacy = Array.isArray(p.templates) && Array.isArray(p.decks);
  const hasNext = Array.isArray(p.blueprints) && Array.isArray(p.sets);
  return hasLegacy || hasNext;
}

export function validateProject(value: unknown): Project {
  if (!isProject(value)) {
    throw new Error("不是有效的项目文件（缺少 project.json 结构）");
  }
  if (value.schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `项目版本 ${value.schemaVersion} 高于当前应用，请升级应用后再打开`,
    );
  }
  if (!Array.isArray(value.templates)) value.templates = [];
  if (!Array.isArray(value.decks)) value.decks = [];
  if (!Array.isArray(value.variables)) value.variables = [];
  if (!value.assets) value.assets = {};
  if (!Array.isArray(value.fonts)) value.fonts = [];
  if (!Array.isArray(value.boxes)) value.boxes = [];
  if (!Array.isArray(value.shots)) value.shots = [];
  if (!Array.isArray(value.rulebooks)) value.rulebooks = [];
  if (!Array.isArray(value.pieceSpecs)) value.pieceSpecs = [];
  const next = patchSanguoshaIdentityBacks(normalizeProject(value));
  if (!next.blueprints.length || !next.sets.length) {
    throw new Error("项目损坏：缺少蓝图或卡牌集");
  }
  return next;
}
