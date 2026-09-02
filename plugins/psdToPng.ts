import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PNG } from "pngjs";
import type { readPsd as ReadPsdFn, initializeCanvas as InitCanvasFn } from "ag-psd";

const require = createRequire(import.meta.url);

type AgPsd = {
  readPsd: typeof ReadPsdFn;
  initializeCanvas: typeof InitCanvasFn;
};

let agPsd: AgPsd | null = null;
let ready = false;

/**
 * 替换 ag-psd 的简陋 CMYK→RGB：
 * 1. 支持 5 通道（CMYK+Alpha）
 * 2. 标准 (1-C)(1-K) 转换后做屏幕软打样压饱和，避免「直接转 PNG」发飘过艳
 */
const CMYK_FN = `function cmykToRgb(cmyk, rgb, reverseAlpha) {
    const size = rgb.width * rgb.height * 4;
    const srcData = cmyk.data;
    const dstData = rgb.data;
    const sat = 0.72;
    for (let src = 0, dst = 0; dst < size; src += 5, dst += 4) {
        const C = 1 - srcData[src] / 255;
        const M = 1 - srcData[src + 1] / 255;
        const Y = 1 - srcData[src + 2] / 255;
        const K = 1 - srcData[src + 3] / 255;
        let r = (1 - C) * (1 - K);
        let g = (1 - M) * (1 - K);
        let b = (1 - Y) * (1 - K);
        const y709 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = y709 + (r - y709) * sat;
        g = y709 + (g - y709) * sat;
        b = y709 + (b - y709) * sat;
        // 略压亮，贴近印刷软打样观感
        r = Math.pow(Math.max(0, Math.min(1, r)), 1.05);
        g = Math.pow(Math.max(0, Math.min(1, g)), 1.05);
        b = Math.pow(Math.max(0, Math.min(1, b)), 1.05);
        dstData[dst] = (r * 255 + 0.5) | 0;
        dstData[dst + 1] = (g * 255 + 0.5) | 0;
        dstData[dst + 2] = (b * 255 + 0.5) | 0;
        dstData[dst + 3] = reverseAlpha ? 255 - srcData[src + 4] : srcData[src + 4];
    }
}`;

function loadAgPsd(): AgPsd {
  if (agPsd) return agPsd;
  const readerPath = require.resolve("ag-psd/dist/psdReader.js");
  let code = readFileSync(readerPath, "utf8");
  if (!code.includes("/*tmd-cmyk5*/")) {
    code = code
      .replace(
        "if (psd.channels !== 4)\n                throw new Error(`Invalid channel count`);",
        "/*tmd-cmyk5*/ if (psd.channels !== 4 && psd.channels !== 5)\n                throw new Error(`Invalid channel count`);",
      )
      .replace(
        "const channels = [0, 1, 2, 3];\n            if (reader.globalAlpha)\n                channels.push(4);\n            if (compression === 0 /* Compression.RawData */) {\n                throw new Error(`Compression not supported: ${compression}`);",
        "const channels = [0, 1, 2, 3];\n            if (psd.channels > 4 || reader.globalAlpha)\n                channels.push(4);\n            if (compression === 0 /* Compression.RawData */) {\n                throw new Error(`Compression not supported: ${compression}`);",
      );
  }
  if (!code.includes("/*tmd-cmyk-soft*/")) {
    code = code.replace(
      /function cmykToRgb\(cmyk, rgb, reverseAlpha\) \{[\s\S]*?\n\}/,
      `/*tmd-cmyk-soft*/ ${CMYK_FN}`,
    );
  }
  const NodeModule = require("module") as typeof import("module") & {
    _nodeModulePaths: (from: string) => string[];
  };
  const m = new (NodeModule as unknown as { new (id: string, parent?: unknown): NodeModule })(readerPath);
  m.filename = readerPath;
  m.paths = NodeModule._nodeModulePaths(path.dirname(readerPath));
  (m as { _compile: (code: string, filename: string) => void })._compile(code, readerPath);
  require.cache[readerPath] = m as NodeModule;

  for (const key of Object.keys(require.cache)) {
    const norm = key.replaceAll("\\", "/");
    if (norm.includes("/ag-psd/dist/index.js") || norm.endsWith("/ag-psd/index.js")) {
      delete require.cache[key];
    }
  }
  agPsd = require("ag-psd") as AgPsd;
  return agPsd;
}

function ensurePsdReader() {
  if (ready) return;
  const api = loadAgPsd();
  const reader = require("ag-psd/dist/psdReader.js") as { supportedColorModes: number[] };
  if (!reader.supportedColorModes.includes(4)) reader.supportedColorModes.push(4);
  api.initializeCanvas(
    (w: number, h: number) => ({
      width: w,
      height: h,
      getContext: () => ({
        createImageData: (iw?: number, ih?: number) => ({
          width: iw ?? w,
          height: ih ?? h,
          data: new Uint8ClampedArray((iw ?? w) * (ih ?? h) * 4),
        }),
        putImageData: () => undefined,
        drawImage: () => undefined,
      }),
    }),
    (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
  );
  ready = true;
}

/** PSD（含 CMYK / CMYK+Alpha）→ PNG Buffer，在 TMD 里当普通图用 */
export function psdBufferToPng(buf: Buffer): Buffer {
  ensurePsdReader();
  const api = loadAgPsd();
  const copy = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const psd = api.readPsd(copy, {
    useImageData: true,
    skipLayerImageData: true,
    skipThumbnail: true,
  });
  const w = psd.width ?? 0;
  const h = psd.height ?? 0;
  const raw = psd.imageData?.data;
  if (!raw || !w || !h) throw new Error("PSD 没有可读取的合成图");
  const png = new PNG({ width: w, height: h });
  Buffer.from(raw).copy(png.data);
  // 部分 CardPSD（如神契牌背面）合成图 RGB 正常但 Alpha 全 0，画面「看不见」
  const pixels = w * h;
  let transparent = 0;
  for (let i = 0; i < pixels; i++) {
    if ((png.data[i * 4 + 3] ?? 0) < 8) transparent++;
  }
  if (pixels > 0 && transparent / pixels > 0.92) {
    // 神契牌背等：RGB 正常但 Alpha 全 0，强制不透明
    for (let i = 0; i < pixels; i++) png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}
