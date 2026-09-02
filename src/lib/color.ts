export type Rgba = { r: number; g: number; b: number; a: number };

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

function nibble(ch: string): number {
  return parseInt(ch, 16);
}

export function parseColor(value?: string | null): Rgba | null {
  if (!value) return null;
  const v = value.trim();
  const hex = v.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      return {
        r: nibble(h[0]) * 17,
        g: nibble(h[1]) * 17,
        b: nibble(h[2]) * 17,
        a: h.length === 4 ? nibble(h[3]) / 15 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  return null;
}

export function formatHex8(c: Rgba): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${hex2(c.a * 255)}`;
}

export function formatHex6(c: Rgba): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
}

/** Store opaque as #rrggbb, transparent as #rrggbbaa. Canvas accepts both. */
export function formatCss(c: Rgba): string {
  return c.a >= 0.999 ? formatHex6(c) : formatHex8(c);
}

export function toHex6(value?: string, fallback = "#333333"): string {
  return formatHex6(parseColor(value) ?? parseColor(fallback) ?? { r: 51, g: 51, b: 51, a: 1 });
}

export function withAlpha(value: string | undefined, alpha: number, fallback = "#333333"): string {
  const c = parseColor(value) ?? parseColor(fallback)!;
  return formatCss({ ...c, a: Math.max(0, Math.min(1, alpha)) });
}

export function withRgb(value: string | undefined, hex6: string): string {
  const prev = parseColor(value);
  const next = parseColor(hex6) ?? { r: 0, g: 0, b: 0, a: 1 };
  return formatCss({ ...next, a: prev?.a ?? 1 });
}

export type Hsva = { h: number; s: number; v: number; a: number };

export function rgbaToHsva(c: Rgba): Hsva {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max <= 1e-6 ? 0 : d / max;
  return { h, s, v: max, a: c.a };
}

export function hsvaToRgba(c: Hsva): Rgba {
  const { h, s, v, a } = c;
  const hh = ((h % 360) + 360) % 360;
  const i = Math.floor(hh / 60);
  const f = hh / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
  }
  return { r: r * 255, g: g * 255, b: b * 255, a };
}
