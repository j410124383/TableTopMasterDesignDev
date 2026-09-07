import { DEFAULT_PRINT } from "@/model/defaults";
import type { ExportPreset, PrintSettings } from "@/model/types";
import { uid } from "@/lib/id";

const KEY = "tmd-export-presets";

export function loadExportPresets(): ExportPreset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPreset).map((p) => ({
      id: p.id,
      name: String(p.name || "未命名"),
      settings: { ...DEFAULT_PRINT, ...p.settings },
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

function isPreset(v: unknown): v is ExportPreset {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<ExportPreset>;
  return typeof p.id === "string" && typeof p.name === "string" && !!p.settings && typeof p.settings === "object";
}

export function saveExportPresets(list: ExportPreset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function makeExportPreset(name: string, settings: PrintSettings): ExportPreset {
  return {
    id: uid("exp"),
    name: name.trim() || "未命名",
    settings: { ...DEFAULT_PRINT, ...settings },
    updatedAt: new Date().toISOString(),
  };
}

export function nextPresetName(existing: ExportPreset[]): string {
  return `预设 ${existing.length + 1}`;
}
