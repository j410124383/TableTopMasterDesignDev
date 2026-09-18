import { create } from "zustand";
import { centerAtZoom, fitInBox } from "@/lib/viewFit";
import { DEFAULT_VIEWPORT } from "@/model/defaults";
import { PREVIEW_DPI } from "@/render/layout";
import type { Layer, ViewportPrefs } from "@/model/types";

type CanvasBox = { wrapW: number; wrapH: number; cardW: number; cardH: number; padX?: number; padY?: number };

const DPI_KEY = "tmd-preview-dpi";

function clampPreviewDpi(n: number) {
  if (!Number.isFinite(n) || n <= 0) return PREVIEW_DPI;
  return Math.min(1000, Math.max(1, Math.round(n)));
}

function readPreviewDpi() {
  try {
    const n = Number(localStorage.getItem(DPI_KEY));
    if (Number.isFinite(n) && n >= 1 && n <= 1000) return Math.round(n);
  } catch {
    /* ignore */
  }
  return PREVIEW_DPI;
}

function writePreviewDpi(n: number) {
  try {
    localStorage.setItem(DPI_KEY, String(n));
  } catch {
    /* ignore */
  }
}

type EditorState = {
  selectedId: string | null;
  face: "front" | "back";
  clipboard: Layer | null;
  view: ViewportPrefs;
  canvasBox: CanvasBox | null;
  blueprintId: string | null;
  setId: string | null;
  libraryOpen: boolean;
  previewDpi: number;
  specId: string | null;
  boxId: string | null;
  boxLibraryOpen: boolean;
  boardId: string | null;
  boardLibraryOpen: boolean;
  shotId: string | null;
  shotLibraryOpen: boolean;
  studioId: string | null;
  studioLibraryOpen: boolean;
  setSelected: (id: string | null) => void;
  setFace: (face: "front" | "back") => void;
  setClipboard: (layer: Layer | null) => void;
  patchView: (patch: Partial<ViewportPrefs>) => void;
  setCanvasBox: (box: CanvasBox) => void;
  setBlueprintId: (id: string | null) => void;
  setSetId: (id: string | null) => void;
  setLibraryOpen: (open: boolean) => void;
  setPreviewDpi: (dpi: number) => void;
  openBlueprint: (id: string) => void;
  openSpec: (id: string) => void;
  setSpecId: (id: string | null) => void;
  setBoxId: (id: string | null) => void;
  setBoxLibraryOpen: (open: boolean) => void;
  openBox: (id: string) => void;
  setBoardId: (id: string | null) => void;
  setBoardLibraryOpen: (open: boolean) => void;
  openBoard: (id: string) => void;
  setShotId: (id: string | null) => void;
  setShotLibraryOpen: (open: boolean) => void;
  openShot: (id: string) => void;
  setStudioId: (id: string | null) => void;
  setStudioLibraryOpen: (open: boolean) => void;
  openStudio: (id: string) => void;
  fitView: () => void;
  centerZoom: (zoom: number) => void;
  resetView: () => void;
  resetSession: () => void;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  selectedId: null,
  face: "front",
  clipboard: null,
  view: { ...DEFAULT_VIEWPORT },
  canvasBox: null,
  blueprintId: null,
  setId: null,
  libraryOpen: true,
  specId: null,
  boxId: null,
  boxLibraryOpen: true,
  boardId: null,
  boardLibraryOpen: true,
  shotId: null,
  shotLibraryOpen: true,
  studioId: null,
  studioLibraryOpen: true,
  previewDpi: readPreviewDpi(),
  setSelected: (selectedId) => set({ selectedId }),
  setFace: (face) => set({ face }),
  setClipboard: (clipboard) => set({ clipboard }),
  patchView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  setCanvasBox: (canvasBox) => set({ canvasBox }),
  setBlueprintId: (blueprintId) => set({ blueprintId, selectedId: null }),
  setSetId: (setId) => set({ setId }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setPreviewDpi: (dpi) => {
    const previewDpi = clampPreviewDpi(dpi);
    writePreviewDpi(previewDpi);
    set({ previewDpi });
  },
  openBlueprint: (id) => set({ blueprintId: id, selectedId: null, libraryOpen: false, specId: null, face: "front" }),
  openSpec: (id) => set({ specId: id, libraryOpen: true, selectedId: null }),
  setSpecId: (specId) => set({ specId }),
  setBoxId: (boxId) => set({ boxId }),
  setBoxLibraryOpen: (boxLibraryOpen) => set({ boxLibraryOpen }),
  openBox: (id) => set({ boxId: id, boxLibraryOpen: false }),
  setBoardId: (boardId) => set({ boardId }),
  setBoardLibraryOpen: (boardLibraryOpen) => set({ boardLibraryOpen }),
  openBoard: (id) => set({ boardId: id, boardLibraryOpen: false }),
  setShotId: (shotId) => set({ shotId }),
  setShotLibraryOpen: (shotLibraryOpen) => set({ shotLibraryOpen }),
  openShot: (id) => set({ shotId: id, shotLibraryOpen: false }),
  setStudioId: (studioId) => set({ studioId }),
  setStudioLibraryOpen: (studioLibraryOpen) => set({ studioLibraryOpen }),
  openStudio: (id) => set({ studioId: id, studioLibraryOpen: false }),
  fitView: () => {
    const box = get().canvasBox;
    if (!box) return;
    set((s) => ({
      view: {
        ...s.view,
        ...fitInBox(box.wrapW, box.wrapH, box.cardW, box.cardH, 48, box.padX ?? 0, box.padY ?? 0),
      },
    }));
  },
  centerZoom: (zoom) => {
    const box = get().canvasBox;
    if (!box) {
      set((s) => ({ view: { ...s.view, zoom, panX: 40, panY: 40 } }));
      return;
    }
    set((s) => ({
      view: {
        ...s.view,
        ...centerAtZoom(box.wrapW, box.wrapH, box.cardW, box.cardH, zoom, box.padX ?? 0, box.padY ?? 0),
      },
    }));
  },
  resetView: () => get().fitView(),
  resetSession: () =>
    set({
      selectedId: null,
      face: "front",
      blueprintId: null,
      setId: null,
      libraryOpen: true,
      specId: null,
      boxId: null,
      boxLibraryOpen: true,
      boardId: null,
      boardLibraryOpen: true,
      shotId: null,
      shotLibraryOpen: true,
      studioId: null,
      studioLibraryOpen: true,
      canvasBox: null,
    }),
}));
