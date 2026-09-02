import type { Project } from "@/model/types";

const loaded = new Set<string>();

export async function applyProjectFonts(project: Project): Promise<void> {
  for (const font of project.fonts ?? []) {
    const src = project.assets[font.assetId];
    if (!src || loaded.has(font.family)) continue;
    try {
      const face = new FontFace(font.family, `url(${src})`);
      await face.load();
      document.fonts.add(face);
      loaded.add(font.family);
    } catch {
      /* skip broken font */
    }
  }
}

export function fontFamilies(project: Project): string[] {
  return (project.fonts ?? []).map((f) => f.family);
}
