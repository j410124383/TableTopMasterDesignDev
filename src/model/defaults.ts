import { uid, nowIso } from "@/lib/id";
import { syncDerived } from "./normalize";
import { buildStarterContent, type StarterId } from "./starters";
import {
  PROJECT_SCHEMA_VERSION,
  type Deck,
  type Project,
  type SizeMm,
} from "./types";

const DEFAULT_FIELDS = ["name", "text", "backTitle"];

export function createEmptyProject(input: {
  name: string;
  note?: string;
  size: SizeMm;
  coverAsset?: string;
  starter?: StarterId;
}): Project {
  const id = uid("prj");
  const stamp = nowIso();
  const starter = input.starter ?? "empty";
  const { blueprints, sets, assets } = buildStarterContent(starter, input.size, input.name);

  return syncDerived({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    meta: {
      id,
      name: input.name,
      note: input.note,
      coverAsset: input.coverAsset,
      createdAt: stamp,
      updatedAt: stamp,
      defaultSize: input.size,
    },
    templates: [],
    decks: [],
    blueprints,
    sets,
    boxes: [],
    rulebooks: [],
    assets: assets ?? {},
    variables: [{ id: uid("var"), tag: "力量", replacement: "3", kind: "text" }],
    fonts: [],
    print: { ...DEFAULT_PRINT },
  });
}

export function createDeck(
  name: string,
  frontTemplateId: string,
  backTemplateId: string,
): Deck {
  return {
    id: uid("deck"),
    name,
    frontTemplateId,
    backTemplateId,
    cards: [
      {
        id: uid("card"),
        qty: 1,
        fields: { name: "新卡牌", cost: "", art: "", text: "" },
      },
    ],
    fieldKeys: [...DEFAULT_FIELDS],
  };
}

export const DEFAULT_PRINT = {
  paper: "a4" as const,
  orientation: "portrait" as const,
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
  duplex: true,
  dpi: 300,
  filename: "{项目}-{牌组}-{序号}",
  mode: "print" as const,
  ttsCols: 10,
  ttsRows: 8,
};

export const DEFAULT_VIEWPORT = {
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: true,
  gridMm: 5,
  gridColor: "#c8ff0055",
  showBleed: true,
  showSafe: true,
  showCut: true,
  cropBleed: false,
  bleedColor: "#dc5050",
  safeColor: "#46b46e",
  cutColor: "#222222",
  snap: true,
  snapCorners: true,
  snapCenters: true,
  snapCut: true,
  snapSafe: true,
  snapBleed: true,
  snapGrid: true,
};
