import { uid } from "@/lib/id";
import type { Card } from "@/model/types";
import { csvWithBom, parseTableFile, toXlsx } from "@/lib/sheet";
import { downloadBlob } from "@/lib/zip";

export function tableFromCards(columns: string[], cards: Card[]): string[][] {
  return [
    ["数量", ...columns],
    ...cards.map((c) => [String(c.qty), ...columns.map((k) => c.fields[k] ?? "")]),
  ];
}

export function cardsFromTable(rows: string[][], fallbackKeys: string[]): { cards: Card[]; keys: string[] } {
  if (rows.length < 2) return { cards: [], keys: fallbackKeys };
  const header = rows[0].map((h) => h.trim());
  const qtyIndex = header.findIndex((h) => /^(qty|数量|count)$/i.test(h));
  const keys = header.filter((_, i) => i !== qtyIndex);
  const cards: Card[] = rows.slice(1).map((row) => {
    const fields: Record<string, string> = {};
    header.forEach((key, i) => {
      if (i === qtyIndex) return;
      fields[key] = row[i] ?? "";
    });
    const qty = qtyIndex >= 0 ? Math.max(1, Number(row[qtyIndex]) || 1) : 1;
    return { id: uid("card"), qty, fields };
  });
  return { cards, keys: keys.length ? keys : fallbackKeys };
}

export function exportCardsCsv(filename: string, columns: string[], cards: Card[]) {
  downloadBlob(csvWithBom(tableFromCards(columns, cards)), filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function exportCardsXlsx(filename: string, columns: string[], cards: Card[], sheetName: string) {
  const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  downloadBlob(toXlsx(tableFromCards(columns, cards), sheetName), name);
}

export async function importCardsFile(file: File, fallbackKeys: string[]) {
  const rows = await parseTableFile(file);
  return cardsFromTable(rows, fallbackKeys);
}
