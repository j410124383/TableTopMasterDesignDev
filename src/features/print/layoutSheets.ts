import { paperSizeMm } from "@/model/sizes";
import { templateFromBlueprint } from "@/model/normalize";
import type { Card, CardSet, PrintSettings, Project, Template } from "@/model/types";

export type Slot = { col: number; row: number; card: Card; index: number };

export type SheetPlan = {
  paper: { w: number; h: number };
  cols: number;
  rows: number;
  cardW: number;
  cardH: number;
  originX: number;
  originY: number;
  slotsPerPage: number;
  pages: Slot[][];
};

export function expandCards(cards: Card[]): Card[] {
  return cards.flatMap((card) => Array.from({ length: card.qty }, () => card));
}

export function planSheets(
  template: Template,
  cards: Card[],
  settings: PrintSettings,
): SheetPlan {
  const tts = settings.mode === "tts";
  const cardW = template.size.w + (tts ? 0 : settings.bleedMm * 2);
  const cardH = template.size.h + (tts ? 0 : settings.bleedMm * 2);
  const gap = tts ? 0 : settings.gapMm;
  const cols = tts ? Math.max(1, settings.ttsCols ?? 10) : 0;
  const rows = tts ? Math.max(1, settings.ttsRows ?? 8) : 0;
  const paper = tts
    ? {
        w: cols * cardW + settings.marginMm * 2,
        h: rows * cardH + settings.marginMm * 2,
      }
    : paperSizeMm(settings.paper, settings.orientation, {
        w: settings.customW,
        h: settings.customH,
      });
  const innerW = paper.w - settings.marginMm * 2;
  const innerH = paper.h - settings.marginMm * 2;
  const autoCols = Math.max(1, Math.floor((innerW + gap) / (cardW + gap)));
  const autoRows = Math.max(1, Math.floor((innerH + gap) / (cardH + gap)));
  const useCols = tts ? cols : autoCols;
  const useRows = tts ? rows : autoRows;
  const gridW = useCols * cardW + (useCols - 1) * gap;
  const gridH = useRows * cardH + (useRows - 1) * gap;
  const originX = (paper.w - gridW) / 2 + settings.offsetX;
  const originY = (paper.h - gridH) / 2 + settings.offsetY;
  const slotsPerPage = useCols * useRows;
  const copies = expandCards(cards);
  const pages: Slot[][] = [];
  for (let i = 0; i < copies.length; i += slotsPerPage) {
    const chunk = copies.slice(i, i + slotsPerPage);
    pages.push(
      chunk.map((card, idx) => ({
        card,
        index: i + idx,
        col: idx % useCols,
        row: Math.floor(idx / useCols),
      })),
    );
  }
  if (pages.length === 0) pages.push([]);
  return {
    paper,
    cols: useCols,
    rows: useRows,
    cardW,
    cardH,
    originX,
    originY,
    slotsPerPage,
    pages,
  };
}

export function slotPosition(
  plan: SheetPlan,
  slot: Slot,
  settings: PrintSettings,
  mirror: boolean,
) {
  const col = mirror ? plan.cols - 1 - slot.col : slot.col;
  return {
    x: plan.originX + col * (plan.cardW + (settings.mode === "tts" ? 0 : settings.gapMm)),
    y: plan.originY + slot.row * (plan.cardH + (settings.mode === "tts" ? 0 : settings.gapMm)),
  };
}

export function formatExportName(
  pattern: string,
  ctx: { project: string; deck: string; index: number; face: string },
): string {
  return pattern
    .replaceAll("{项目}", ctx.project)
    .replaceAll("{牌组}", ctx.deck)
    .replaceAll("{序号}", String(ctx.index).padStart(2, "0"))
    .replaceAll("{面}", ctx.face);
}

export type PrintJob = {
  set: CardSet;
  front: Template;
  back?: Template;
  plan: SheetPlan;
};

export function pickPrintSets(project: Project, setIds?: string[]): CardSet[] {
  const wanted = setIds?.length ? setIds : project.sets[0] ? [project.sets[0].id] : [];
  const sets = project.sets.filter((s) => wanted.includes(s.id));
  if (!sets.length) throw new Error("请勾选卡牌集");
  return sets;
}

export function buildPrintJobs(project: Project, settings: PrintSettings, setIds?: string[]): PrintJob[] {
  const sets = pickPrintSets(project, setIds);
  return sets.map((set) => {
    const bp = project.blueprints.find((b) => b.id === set.blueprintId);
    const front = bp
      ? templateFromBlueprint(bp, "front")
      : project.templates.find((t) => t.id === `${set.blueprintId}_front`) ??
        project.templates.find((t) => t.face === "front");
    const back = bp
      ? templateFromBlueprint(bp, "back")
      : project.templates.find((t) => t.id === `${set.blueprintId}_back`) ??
        project.templates.find((t) => t.face === "back");
    if (!front) throw new Error(`卡牌集「${set.name}」缺少正面模板`);
    return {
      set,
      front,
      back,
      plan: planSheets(front, set.cards, settings),
    };
  });
}

export type FlatPrintPage = {
  job: PrintJob;
  local: number;
  slots: Slot[];
};

export function flattenPrintPages(jobs: PrintJob[]): FlatPrintPage[] {
  const pages: FlatPrintPage[] = [];
  for (const job of jobs) {
    job.plan.pages.forEach((slots, local) => pages.push({ job, local, slots }));
  }
  return pages;
}
