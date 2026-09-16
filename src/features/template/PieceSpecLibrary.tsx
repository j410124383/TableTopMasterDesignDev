import { useState } from "react";
import { uid } from "@/lib/id";
import { CARD_STOCK_MM } from "@/model/piece";
import {
  applySpecToBlueprint,
  createPieceSpec,
  PIECE_SPEC_TEMPLATES,
  portraitBasis,
  specFromTemplate,
  type PieceSpecTemplate,
} from "@/model/pieceSpec";
import type { CardCore, PieceKind, PieceSpec } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { HelpTip } from "@/ui/HelpTip";
import { SplitHandle, usePaneSize } from "@/ui/Splitter";

function SpecSilhouette({ spec }: { spec: PieceSpec }) {
  const w = Math.max(1, spec.size.w);
  const h = Math.max(1, spec.size.h);
  const maxW = 120;
  const maxH = 150;
  const scale = Math.min(maxW / w, maxH / h);
  const pw = w * scale;
  const ph = h * scale;
  const radius = Math.max(2, spec.cornerRadiusMm * scale);
  const bleed = Math.max(0, spec.bleedMm * scale);
  return (
    <div className="spec-sil">
      <div className="spec-sil-bleed" style={{ padding: bleed, width: pw + bleed * 2, height: ph + bleed * 2 }}>
        <div className="spec-sil-card" style={{ width: pw, height: ph, borderRadius: radius }} />
      </div>
    </div>
  );
}

function templateAsSpec(t: PieceSpecTemplate): PieceSpec {
  return {
    id: `tpl:${t.id}`,
    name: t.name,
    kind: "card",
    size: t.size,
    thicknessMm: t.thicknessMm,
    core: "white",
    bleedMm: t.bleedMm,
    cornerRadiusMm: t.cornerRadiusMm,
    sourceTemplateId: t.id,
  };
}

function SpecFields({
  spec,
  readOnly,
  onPatch,
}: {
  spec: PieceSpec;
  readOnly: boolean;
  onPatch: (next: Partial<PieceSpec>) => void;
}) {
  const locked = { disabled: readOnly };
  return (
    <div className="form bp-spec-form">
      {readOnly ? <p className="muted">模版只读。复制为自定义后才能改尺寸。</p> : null}
      {spec.sourceTemplateId && !readOnly ? (
        <p className="muted">来自 {PIECE_SPEC_TEMPLATES.find((t) => t.id === spec.sourceTemplateId)?.name ?? spec.sourceTemplateId}</p>
      ) : null}
      <div className="field">
        <label>名称</label>
        <input value={spec.name} {...locked} onChange={(e) => onPatch({ name: e.target.value })} />
      </div>
      <div className="field">
        <label>类型</label>
        <select
          value={spec.kind}
          {...locked}
          onChange={(e) => {
            const kind = e.target.value === "board" ? "board" : "card";
            onPatch({
              kind,
              thicknessMm: kind === "board" ? (spec.kind === "board" ? spec.thicknessMm : 2) : CARD_STOCK_MM,
              core: kind === "card" ? "white" : undefined,
            });
          }}
        >
          <option value="card">卡牌</option>
          <option value="board">板件</option>
        </select>
      </div>
      {spec.kind === "board" ? (
        <div className="field">
          <label>厚度 mm</label>
          <input
            type="number"
            min={0}
            step="0.1"
            value={spec.thicknessMm}
            {...locked}
            onChange={(e) => onPatch({ thicknessMm: Math.max(0, Number(e.target.value)) })}
          />
        </div>
      ) : (
        <>
          <div className="field">
            <label>卡牌厚度 mm</label>
            <input
              type="number"
              min={0.05}
              step="0.01"
              value={spec.thicknessMm}
              {...locked}
              onChange={(e) => onPatch({ thicknessMm: Math.max(0.05, Number(e.target.value)) })}
            />
          </div>
          <div className="field">
            <label>卡芯材质</label>
            <select
              value={spec.core === "black" ? "black" : "white"}
              {...locked}
              onChange={(e) => onPatch({ core: e.target.value === "black" ? "black" : "white" })}
            >
              <option value="white">白芯（侧边白灰）</option>
              <option value="black">黑芯（侧边深灰）</option>
            </select>
          </div>
        </>
      )}
      <div className="row">
        <div className="field grow">
          <label>宽 mm（短边）</label>
          <input
            type="number"
            value={spec.size.w}
            {...locked}
            onChange={(e) => onPatch({ size: { ...spec.size, w: Number(e.target.value) } })}
          />
        </div>
        <div className="field grow">
          <label>高 mm（长边）</label>
          <input
            type="number"
            value={spec.size.h}
            {...locked}
            onChange={(e) => onPatch({ size: { ...spec.size, h: Number(e.target.value) } })}
          />
        </div>
      </div>
      <div className="row">
        <div className="field grow">
          <label>出血 mm</label>
          <input type="number" value={spec.bleedMm} {...locked} onChange={(e) => onPatch({ bleedMm: Number(e.target.value) })} />
        </div>
        <div className="field grow">
          <label>圆角 mm</label>
          <input
            type="number"
            value={spec.cornerRadiusMm}
            {...locked}
            onChange={(e) => onPatch({ cornerRadiusMm: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

type Sel = { kind: "template"; id: string } | { kind: "spec"; id: string };

export function PieceSpecLibrary() {
  const { current, patchProject } = useAppStore();
  const [sel, setSel] = useState<Sel | null>(null);
  const [tab, setTab] = useState<"mine" | "template">("mine");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [rightW, setRightW] = usePaneSize("spec-right", 300);

  if (!current) return <div className="page">未打开项目</div>;
  const specs = current.pieceSpecs ?? [];
  const selectedTemplate = sel?.kind === "template" ? PIECE_SPEC_TEMPLATES.find((t) => t.id === sel.id) : undefined;
  const selectedSpec = sel?.kind === "spec" ? specs.find((s) => s.id === sel.id) : undefined;
  const viewing = selectedTemplate ? templateAsSpec(selectedTemplate) : selectedSpec;

  function counts() {
    const map = new Map<string, number>();
    for (const bp of current!.blueprints) {
      if (!bp.specId) continue;
      map.set(bp.specId, (map.get(bp.specId) ?? 0) + 1);
    }
    return map;
  }

  function create(kind: PieceKind, copyId?: string) {
    const from = copyId ? specs.find((s) => s.id === copyId) : undefined;
    const spec = from
      ? { ...from, id: uid("psp"), name: `${from.name} 副本`, sourceTemplateId: from.sourceTemplateId }
      : createPieceSpec(kind, current!.meta.defaultSize, { name: kind === "board" ? `板件规格 ${specs.length + 1}` : `卡牌规格 ${specs.length + 1}` });
    patchProject((p) => ({
      ...p,
      pieceSpecs: [...(p.pieceSpecs ?? []), spec],
      meta: { ...p.meta, defaultSpecId: spec.id },
    }));
    setSel({ kind: "spec", id: spec.id });
    setTab("mine");
  }

  function copyTemplate(t: PieceSpecTemplate) {
    const spec = specFromTemplate(t);
    patchProject((p) => ({
      ...p,
      pieceSpecs: [...(p.pieceSpecs ?? []), spec],
      meta: { ...p.meta, defaultSpecId: spec.id },
    }));
    setSel({ kind: "spec", id: spec.id });
    setTab("mine");
  }

  function rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchProject((p) => ({
      ...p,
      pieceSpecs: (p.pieceSpecs ?? []).map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
    }));
    setRenaming(null);
  }

  function remove(id: string) {
    const used = current!.blueprints.some((b) => b.specId === id);
    if (used) {
      window.alert("还有蓝图在用这条规格，请先改挂再删。");
      return;
    }
    if (specs.length <= 1) {
      window.alert("至少保留一条规格。");
      return;
    }
    const spec = specs.find((s) => s.id === id);
    if (!spec || !window.confirm(`删除规格「${spec.name}」？`)) return;
    patchProject((p) => {
      const next = (p.pieceSpecs ?? []).filter((s) => s.id !== id);
      return {
        ...p,
        pieceSpecs: next,
        meta: { ...p.meta, defaultSpecId: p.meta.defaultSpecId === id ? next[0]?.id : p.meta.defaultSpecId },
      };
    });
    if (sel?.kind === "spec" && sel.id === id) setSel(null);
  }

  function patchSpec(id: string, next: Partial<PieceSpec>) {
    patchProject((p) => {
      const pieceSpecs = (p.pieceSpecs ?? []).map((s): PieceSpec => {
        if (s.id !== id) return s;
        const merged = { ...s, ...next };
        const core: CardCore | undefined = merged.kind === "card" ? (merged.core === "black" ? "black" : "white") : undefined;
        return {
          ...merged,
          size: next.size ? portraitBasis(next.size) : s.size,
          core,
        };
      });
      const spec = pieceSpecs.find((s) => s.id === id);
      if (!spec) return p;
      return {
        ...p,
        pieceSpecs,
        blueprints: p.blueprints.map((b) =>
          b.specId === id ? applySpecToBlueprint(b, spec, b.orientation ?? "portrait") : b,
        ),
      };
    });
  }

  const used = counts();
  return (
    <div className="page box-page spec-page">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <h1>卡牌规格</h1>
          <HelpTip>
            <p>左边点块，右边改参数。模版只读，复制后才是项目里的规格。</p>
          </HelpTip>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => create("card")}>
            新建卡牌规格
          </button>
        </div>
      </div>
      <div className="spec-layout" style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${rightW}px` }}>
        <div className="spec-lib-main">
          <div className="shot-rail-tabs spec-tabs">
            <button type="button" className={`tab ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>
              我的
            </button>
            <button type="button" className={`tab ${tab === "template" ? "active" : ""}`} onClick={() => setTab("template")}>
              模版
            </button>
          </div>
          {tab === "template" ? (
            <div className="bp-grid">
              {PIECE_SPEC_TEMPLATES.map((t) => {
                const asSpec = templateAsSpec(t);
                const on = sel?.kind === "template" && sel.id === t.id;
                return (
                  <article
                    key={t.id}
                    className={`bp-tile ${on ? "is-selected" : ""}`}
                    onClick={() => setSel({ kind: "template", id: t.id })}
                  >
                    <div className="bp-faces">
                      <SpecSilhouette spec={asSpec} />
                    </div>
                    <h3>
                      {t.name} <span className="spec-badge">模版</span>
                    </h3>
                    <p className="muted">
                      {t.size.w}×{t.size.h} mm · {t.thicknessMm} mm · {t.note}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="bp-grid">
              {specs.map((spec) => (
                <article
                  key={spec.id}
                  className={`bp-tile ${sel?.kind === "spec" && sel.id === spec.id ? "is-selected" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, id: spec.id });
                  }}
                  onClick={() => setSel({ kind: "spec", id: spec.id })}
                >
                  <div className="bp-faces">
                    <SpecSilhouette spec={spec} />
                  </div>
                  {renaming === spec.id ? (
                    <form
                      className="bp-rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(spec.id, nameDraft);
                      }}
                    >
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={() => rename(spec.id, nameDraft)}
                      />
                    </form>
                  ) : (
                    <h3>{spec.name}</h3>
                  )}
                  <p className="muted">
                    {spec.kind === "board" ? "板件" : "卡牌"}
                    {` · ${spec.size.w}×${spec.size.h} mm`}
                    {spec.kind === "board" ? ` · ${spec.thicknessMm} mm 厚` : ` · ${spec.thicknessMm} mm · ${spec.core === "black" ? "黑芯" : "白芯"}`}
                    {` · ${used.get(spec.id) ?? 0} 张蓝图`}
                  </p>
                </article>
              ))}
              <button
                type="button"
                className="bp-tile bp-tile-new"
                onClick={() => {
                  create("card");
                  setTab("mine");
                }}
              >
                <span className="bp-plus">+</span>
                <span>新建卡牌规格</span>
              </button>
            </div>
          )}
        </div>
        <SplitHandle onDelta={(dx) => setRightW(Math.min(440, Math.max(220, rightW - dx)))} />
        <aside className="box-side">
          {viewing ? (
            <>
              <div className="bp-spec-preview">
                <SpecSilhouette spec={viewing} />
              </div>
              <SpecFields
                spec={viewing}
                readOnly={!!selectedTemplate}
                onPatch={(next) => selectedSpec && patchSpec(selectedSpec.id, next)}
              />
              {selectedTemplate ? (
                <button type="button" className="btn btn-primary" onClick={() => copyTemplate(selectedTemplate)}>
                  复制为自定义
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted">点左侧规格块，在这里看参数。模版只读，我的规格可改。</p>
          )}
        </aside>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            [
              { label: "选中", onClick: () => setSel({ kind: "spec", id: menu.id }) },
              {
                label: "重命名",
                onClick: () => {
                  setRenaming(menu.id);
                  setNameDraft(specs.find((s) => s.id === menu.id)?.name ?? "");
                },
              },
              { label: "复制", onClick: () => create(specs.find((s) => s.id === menu.id)?.kind ?? "card", menu.id) },
              { label: "删除", danger: true, onClick: () => remove(menu.id) },
            ] satisfies MenuItem[]
          }
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
