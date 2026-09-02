/** CORS-friendly placeholder art so example cards are not empty boxes. */
export function stockArt(seed: string, w = 420, h = 300): string {
  const key = encodeURIComponent(seed.replace(/\s+/g, "-").toLowerCase());
  return `https://picsum.photos/seed/ceditor-${key}/${w}/${h}`;
}
