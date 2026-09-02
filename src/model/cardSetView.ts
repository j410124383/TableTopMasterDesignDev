import { uid } from "@/lib/id";
import type { CardSet, CardSetView } from "./types";

export const DEFAULT_COL_WIDTH = 160;

export function createCardSetView(name: string, fieldKeys: string[], from?: CardSetView): CardSetView {
  if (from) {
    return {
      ...structuredClone(from),
      id: uid("view"),
      name,
    };
  }
  return {
    id: uid("view"),
    name,
    columnOrder: [...fieldKeys],
    hiddenColumns: [],
    columnWidths: {},
  };
}

export function syncViewColumns(view: CardSetView, fieldKeys: string[]): CardSetView {
  const order = view.columnOrder.filter((k) => fieldKeys.includes(k));
  for (const k of fieldKeys) {
    if (!order.includes(k)) order.push(k);
  }
  return {
    ...view,
    columnOrder: order,
    hiddenColumns: view.hiddenColumns.filter((k) => fieldKeys.includes(k)),
  };
}

export function ensureCardSetViews(set: CardSet): CardSet {
  const keys = set.fieldKeys ?? [];
  const raw = set.views?.length ? set.views : [createCardSetView("默认", keys)];
  const views = raw.map((v) => syncViewColumns(v, keys));
  const activeViewId = views.some((v) => v.id === set.activeViewId) ? set.activeViewId : views[0]!.id;
  return { ...set, views, activeViewId };
}

export function visibleColumns(view: CardSetView | undefined, fieldKeys: string[]): string[] {
  const order = view?.columnOrder?.length ? view.columnOrder : fieldKeys;
  const hidden = new Set(view?.hiddenColumns ?? []);
  return order.filter((k) => fieldKeys.includes(k) && !hidden.has(k));
}

export function renameViewColumn(views: CardSetView[] | undefined, from: string, to: string): CardSetView[] | undefined {
  if (!views) return views;
  return views.map((v) => ({
    ...v,
    columnOrder: v.columnOrder.map((k) => (k === from ? to : k)),
    hiddenColumns: v.hiddenColumns.map((k) => (k === from ? to : k)),
    columnWidths: Object.fromEntries(
      Object.entries(v.columnWidths).map(([k, w]) => [k === from ? to : k, w]),
    ),
  }));
}
