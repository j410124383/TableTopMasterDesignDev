import type { LayerType } from "@/model/types";
import { IconFolder, IconImage, IconRect, IconStar, IconText } from "./Icons";

export function LayerTypeIcon({ type }: { type: LayerType }) {
  if (type === "text") return <IconText />;
  if (type === "image") return <IconImage />;
  if (type === "icon") return <IconStar />;
  if (type === "group") return <IconFolder />;
  return <IconRect />;
}
