import type { AppIndexEntry, Project } from "@/model/types";
import type { StarterId } from "@/model/starters";

export function exampleCoverUrl(id: StarterId): string | undefined {
  if (id === "empty") return undefined;
  return `/covers/${id}.jpg`;
}

function isCoverSrc(src?: string) {
  if (!src) return false;
  return (
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    src.startsWith("/") ||
    src.startsWith("http://") ||
    src.startsWith("https://")
  );
}

export function coverThumbOf(project: Project): string | undefined {
  const id = project.meta.coverAsset;
  if (!id) return undefined;
  if (isCoverSrc(id)) return id;
  const src = project.assets[id];
  return isCoverSrc(src) ? src : undefined;
}

export function coverSrcOf(entry: AppIndexEntry): string | undefined {
  if (isCoverSrc(entry.coverThumb)) return entry.coverThumb;
  if (isCoverSrc(entry.coverAsset)) return entry.coverAsset;
  return undefined;
}
