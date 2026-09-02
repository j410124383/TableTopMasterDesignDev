export function fitInBox(
  wrapW: number,
  wrapH: number,
  cardW: number,
  cardH: number,
  padding = 48,
  padX = 0,
  padY = 0,
) {
  if (wrapW < 8 || wrapH < 8 || cardW < 1 || cardH < 1) {
    return { zoom: 1, panX: 40, panY: 40 };
  }
  const zoom = Math.min((wrapW - padding * 2) / cardW, (wrapH - padding * 2) / cardH, 4);
  const z = Math.max(0.25, zoom);
  return {
    zoom: z,
    panX: (wrapW - cardW * z) / 2 - padX * z,
    panY: (wrapH - cardH * z) / 2 - padY * z,
  };
}

export function centerAtZoom(
  wrapW: number,
  wrapH: number,
  cardW: number,
  cardH: number,
  zoom: number,
  padX = 0,
  padY = 0,
) {
  const z = Math.min(4, Math.max(0.25, zoom));
  return {
    zoom: z,
    panX: (wrapW - cardW * z) / 2 - padX * z,
    panY: (wrapH - cardH * z) / 2 - padY * z,
  };
}
