import { parseCsv, toCsv } from "./csv";
import { zipFiles } from "./zip";

function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

export function csvWithBom(rows: string[][]): Blob {
  return new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
}

export function toXlsx(rows: string[][], sheetName = "数据集"): Blob {
  const name = xmlEscape(sheetName.slice(0, 31) || "Sheet1");
  const sheetRows = rows
    .map((row, ri) => {
      const cells = row
        .map((cell, ci) => {
          const r = `${colLetter(ci)}${ri + 1}`;
          return `<c r="${r}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const files = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetRows}</sheetData>
</worksheet>`,
    },
  ];
  return zipFiles(files);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "function") throw new Error("浏览器不支持解压 Excel，请另存为 CSV");
  const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipText(buf: ArrayBuffer): Promise<Map<string, string>> {
  const u = new Uint8Array(buf);
  const view = new DataView(buf);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  let i = 0;
  while (i + 30 <= u.length) {
    if (view.getUint32(i, true) !== 0x04034b50) break;
    const flags = view.getUint16(i + 6, true);
    const method = view.getUint16(i + 8, true);
    const comp = view.getUint32(i + 18, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const name = dec.decode(u.subarray(i + 30, i + 30 + nameLen));
    const dataStart = i + 30 + nameLen + extraLen;
    if (flags & 0x8) break;
    const compressed = u.subarray(dataStart, dataStart + comp);
    let raw: Uint8Array;
    if (method === 0) raw = compressed;
    else if (method === 8) raw = await inflateRaw(compressed);
    else throw new Error("不支持的 Excel 压缩方式，请另存为 CSV");
    out.set(name.replaceAll("\\", "/"), dec.decode(raw));
    i = dataStart + compressed.length;
  }
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const si = xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi);
  for (const m of si) {
    const texts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((t) => decodeXml(t[1]));
    strings.push(texts.join(""));
  }
  return strings;
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function parseSheetXml(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const row: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = cell[1];
      const body = cell[2];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      let value = "";
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((t) => decodeXml(t[1])).join("");
      } else if (type === "s") {
        const idx = Number(body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "");
        value = shared[idx] ?? "";
      } else {
        value = decodeXml((body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "").trim());
      }
      const col = ref ? colIndex(ref) : row.length;
      while (row.length < col) row.push("");
      row[col] = value;
    }
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

function parseExcelXml(text: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of text.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/gi)) {
    const row: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<Cell\b([^>]*)>([\s\S]*?)<\/Cell>/gi)) {
      const indexAttr = cell[1].match(/ss:Index="(\d+)"/i);
      if (indexAttr) {
        const idx = Number(indexAttr[1]) - 1;
        while (row.length < idx) row.push("");
      }
      const data = cell[2].match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
      row.push(data ? decodeXml(data[1]) : "");
    }
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

export async function parseTableFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const files = await unzipText(await file.arrayBuffer());
    const shared = parseSharedStrings(files.get("xl/sharedStrings.xml") ?? "");
    const sheet =
      [...files.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k)) ??
      "xl/worksheets/sheet1.xml";
    const xml = files.get(sheet);
    if (!xml) throw new Error("Excel 文件里没有工作表");
    const rows = parseSheetXml(xml, shared);
    if (rows.length < 2) throw new Error("Excel 里没有数据行");
    return rows;
  }
  const text = await file.text();
  if (name.endsWith(".xls") || text.includes("urn:schemas-microsoft-com:office:spreadsheet")) {
    const rows = parseExcelXml(text);
    if (rows.length >= 2) return rows;
  }
  if (name.endsWith(".tsv") || (text.includes("\t") && !text.includes(","))) {
    return text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.split("\t"));
  }
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("表格至少需要表头和一行数据");
  return rows;
}
