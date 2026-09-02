import { useEffect, useState, type CSSProperties } from "react";
import type { Project, Template } from "@/model/types";
import { cardCacheKey, renderCardCached, templateFingerprint } from "@/render/cardCache";

type Props = {
  template: Template;
  project: Project;
  fields?: Record<string, string>;
  cardId?: string;
  dpi?: number;
  width?: number;
  face?: string;
  frameStyle?: CSSProperties;
  /** 剔除出血，按成品尺寸显示（试玩桌面） */
  cropBleed?: boolean;
  honorVisibleWhen?: boolean;
  /** 联机预渲染 URL；有则直接贴图，失败时回退 canvas 渲染 */
  srcUrl?: string | null;
};

export function CardThumb({
  template,
  project,
  fields = {},
  cardId = "preview",
  dpi = 180,
  width = 120,
  face = template.face,
  frameStyle,
  cropBleed = false,
  honorVisibleWhen,
  srcUrl,
}: Props) {
  const [url, setUrl] = useState<string>();
  const [cacheFailed, setCacheFailed] = useState(false);

  useEffect(() => {
    setCacheFailed(false);
  }, [srcUrl]);

  useEffect(() => {
    if (srcUrl && !cacheFailed) {
      setUrl(srcUrl);
      return;
    }
    let cancelled = false;
    const key = cardCacheKey(
      template.id,
      face,
      cardId,
      fields,
      `${dpi}:${templateFingerprint(template)}:c${cropBleed ? 1 : 0}:v${honorVisibleWhen === false ? 0 : 1}:a${Object.values(project.assets).map((s) => s.slice(-18)).join("~")}`,
    );
    void renderCardCached(template, project, fields, dpi, key, {
      cropBleed,
      honorVisibleWhen,
    }).then((src) => {
      if (!cancelled) setUrl(src);
    });
    return () => {
      cancelled = true;
    };
  }, [template, project, fields, cardId, dpi, face, cropBleed, honorVisibleWhen, srcUrl, cacheFailed]);
  if (!url) return <div className="thumb-ph">…</div>;
  return (
    <img
      src={url}
      alt=""
      onError={() => {
        if (srcUrl && !cacheFailed) setCacheFailed(true);
      }}
      style={{
        width,
        height: "auto",
        borderRadius: 6,
        display: "block",
        boxShadow: "0 8px 18px rgba(0,0,0,0.28)",
        ...frameStyle,
      }}
    />
  );
}
