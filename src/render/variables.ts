import type { Card, Project, ProjectVariable, Template } from "@/model/types";

export type VarContext = {
  project: Project;
  template: Template;
  card?: Card;
  cardIndex: number;
  total: number;
};

function specials(ctx: VarContext): Record<string, string> {
  const qty = ctx.card?.qty ?? 1;
  const n = String(ctx.cardIndex + 1);
  const total = String(ctx.total);
  return {
    project: ctx.project.meta.name,
    blueprint: ctx.template.name,
    amount: String(qty),
    "#": n,
    "@": total,
  };
}

export function resolveVariables(text: string, ctx: VarContext): string {
  if (!text) return text;
  const vars = ctx.project.variables ?? [];
  const spec = specials(ctx);
  return text.replace(/\{([^{}]+)\}/g, (full, raw: string) => {
    const tag = raw.trim();
    const custom = vars.find(
      (v) => v.tag.toLowerCase() === tag.toLowerCase(),
    );
    if (custom) {
      if (custom.kind === "icon") return custom.replacement.startsWith("data:") ? "◆" : custom.replacement;
      return custom.replacement;
    }
    const key = tag.toLowerCase();
    if (key in spec) return spec[key];
    if (tag in spec) return spec[tag];
    if (ctx.card && tag in ctx.card.fields) return ctx.card.fields[tag] ?? "";
    return full;
  });
}

export function findVariable(project: Project, tag: string): ProjectVariable | undefined {
  return (project.variables ?? []).find(
    (v) => v.tag.toLowerCase() === tag.toLowerCase(),
  );
}
