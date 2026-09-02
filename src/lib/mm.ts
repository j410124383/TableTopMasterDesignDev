export function mmToPx(mm: number, dpi: number): number {
  return (mm / 25.4) * dpi;
}

export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * 25.4;
}

export function mmToPt(mm: number): number {
  return (mm / 25.4) * 72;
}

export function roundMm(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
