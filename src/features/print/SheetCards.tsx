import { useEffect, useState } from "react";
import type { PrintSettings, Project, Template } from "@/model/types";
import { cardCacheKey, renderCardCached, templateFingerprint } from "@/render/cardCache";
import type { SheetPlan, Slot } from "./layoutSheets";
import { slotPosition } from "./layoutSheets";

type Props = {
  plan: SheetPlan;
  page: Slot[];
  settings: PrintSettings;
  template: Template;
  project: Project;
  scale: number;
  mirror: boolean;
};

export function SheetCards({ plan, page, settings, template, project, scale, mirror }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const renderTpl = { ...template, bleedMm: settings.bleedMm };
    void Promise.all(
      page.map(async (slot) => {
        const key = cardCacheKey(
          renderTpl.id,
          renderTpl.face,
          slot.card.id,
          slot.card.fields,
          `print-${settings.bleedMm}-${templateFingerprint(renderTpl)}`,
        );
        const url = await renderCardCached(renderTpl, project, slot.card.fields, 80, key, {
          cardIndex: slot.index,
          total: plan.pages.flat().length,
        });
        return [key, url] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setUrls(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [page, template, project, settings.bleedMm, plan.pages]);

  return (
    <>
      {page.map((slot) => {
        const pos = slotPosition(plan, slot, settings, mirror);
        const key = cardCacheKey(
          `${template.id}`,
          template.face,
          slot.card.id,
          slot.card.fields,
          `print-${settings.bleedMm}-${templateFingerprint({ ...template, bleedMm: settings.bleedMm })}`,
        );
        return (
          <img
            key={`${slot.card.id}-${slot.col}-${slot.row}-${slot.index}`}
            src={urls[key]}
            alt={slot.card.fields.name || "卡牌"}
            style={{
              position: "absolute",
              left: pos.x * scale,
              top: pos.y * scale,
              width: plan.cardW * scale,
              height: plan.cardH * scale,
              objectFit: "fill",
              outline: settings.cutMarks ? `1px dashed ${settings.cutColor}` : undefined,
              background: "#eee",
            }}
          />
        );
      })}
    </>
  );
}
