import { useEffect, useState } from "react";
import type { Project, Template } from "@/model/types";
import { renderCardToCanvas } from "@/render/drawCard";

type Props = {
  template: Template;
  project: Project;
  fields?: Record<string, string>;
  dpi: number;
  showGuides?: boolean;
  scale?: number;
};

export function CardPreview({
  template,
  project,
  fields,
  dpi,
  showGuides,
  scale = 1,
}: Props) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let revoked: string | undefined;
    let cancelled = false;
    void renderCardToCanvas(template, {
      dpi,
      fields,
      assets: project.assets,
      project,
      guides: showGuides,
    }).then((canvas) => {
      if (cancelled) return;
      revoked = canvas.toDataURL("image/png");
      setUrl(revoked);
    });
    return () => {
      cancelled = true;
    };
  }, [template, project, fields, dpi, showGuides]);

  if (!url) return <div className="muted">渲染中…</div>;
  return (
    <img
      src={url}
      alt="卡面预览"
      style={{
        width: `${(template.size.w + template.bleedMm * 2) * scale * 3.2}px`,
        height: "auto",
        borderRadius: 8,
        boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
      }}
    />
  );
}
