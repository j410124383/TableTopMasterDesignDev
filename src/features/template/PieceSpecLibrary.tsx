import { useState } from "react";
import { uid } from "@/lib/id";
import { CARD_STOCK_MM } from "@/model/piece";
import { applySpecToBlueprint, createPieceSpec, portraitBasis } from "@/model/pieceSpec";
import type { CardCore, PieceKind, PieceSpec } from "@/model/types";
import { CARD_SIZE_PRESETS, presetBySize } from "@/model/sizes";
import { useAppStore } from "@/store/appStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { HelpTip } from "@/ui/HelpTip";
import { IconBtn } from "@/ui/IconBtn";
import { IconReturn } from "@/ui/Icons";

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
        <div
          className="spec-sil-card"
          style={{
            width: pw,
            height: ph,
            borderRadius: radius,
          }}
        />
      </div>
    </div>
  );
}

export function PieceSpecLibrary() {
  const { current, patchProject } = useAppStore();
  const [editId, setEditId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  if (!current) return <div className="page">未打开项目</div>;
  const specs = current.pieceSpecs ?? [];
  const editing = editId ? specs.find((s) => s.id === editId) : undefined;

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
      ? { ...from, id: uid("psp"), name: `${from.name} 副本` }
      : createPieceSpec(kind, current!.meta.defaultSize, { name: kind === "board" ? `板件规格 ${specs.length + 1}` : `卡牌规格 ${specs.length + 1}` });
    patchProject((p) => ({
      ...p,
      pieceSpecs: [...(p.pieceSpecs ?? []), spec],
      meta: { ...p.meta, defaultSpecId: spec.id },
    }));
    setEditId(spec.id);
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

  if (editing) {
    const sizePreset = presetBySize(editing.size);
    return (
      <div className="bp-library">
        <div className="page-head page-head-compact">
          <div className="row">
            <IconBtn title="返回规格库" onClick={() => setEditId(null)}>
              <IconReturn />
            </IconBtn>
            <div>
              <h1>卡牌规格 · {editing.name}</h1>
            </div>
            <HelpTip>
              <p>这里改的是纸张物理参数。挂这条规格的蓝图会一起变尺寸，图层不会自动重排。</p>
            </HelpTip>
          </div>
        </div>
        <div className="bp-spec">
          <div className="bp-spec-preview">
            <SpecSilhouette spec={editing} />
          </div>
          <div className="form bp-spec-form">
            <div className="field">
              <label>名称</label>
              <input value={editing.name} onChange={(e) => patchSpec(editing.id, { name: e.target.value })} />
            </div>
            <div className="field">
              <label>类型</label>
              <select
                value={editing.kind}
                onChange={(e) => {
                  const kind = e.target.value === "board" ? "board" : "card";
                  patchSpec(editing.id, {
                    kind,
                    thicknessMm: kind === "board" ? (editing.kind === "board" ? editing.thicknessMm : 2) : CARD_STOCK_MM,
                    core: kind === "card" ? "white" : undefined,
                  });
                }}
              >
                <option value="card">卡牌</option>
                <option value="board">板件</option>
              </select>
            </div>
            {editing.kind === "board" ? (
              <div className="field">
                <label>厚度 mm</label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={editing.thicknessMm}
                  onChange={(e) => patchSpec(editing.id, { thicknessMm: Math.max(0, Number(e.target.value)) })}
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
                    value={editing.thicknessMm}
                    onChange={(e) => patchSpec(editing.id, { thicknessMm: Math.max(0.05, Number(e.target.value)) })}
                  />
                </div>
                <div className="field">
                  <label>卡芯材质</label>
                  <select
                    value={editing.core === "black" ? "black" : "white"}
                    onChange={(e) => patchSpec(editing.id, { core: e.target.value === "black" ? "black" : "white" })}
                  >
                    <option value="white">白芯（侧边白灰）</option>
                    <option value="black">黑芯（侧边深灰）</option>
                  </select>
                </div>
              </>
            )}
            <div className="field">
              <label>竖放基准尺寸</label>
              <select
                value={sizePreset}
                onChange={(e) => {
                  const found = CARD_SIZE_PRESETS.find((p) => p.id === e.target.value);
                  if (!found || found.id === "custom") return;
                  patchSpec(editing.id, { size: portraitBasis({ w: found.w, h: found.h }) });
                }}
              >
                {CARD_SIZE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <div className="field grow">
                <label>宽 mm（短边）</label>
                <input
                  type="number"
                  value={editing.size.w}
                  onChange={(e) => patchSpec(editing.id, { size: { ...editing.size, w: Number(e.target.value) } })}
                />
              </div>
              <div className="field grow">
                <label>高 mm（长边）</label>
                <input
                  type="number"
                  value={editing.size.h}
                  onChange={(e) => patchSpec(editing.id, { size: { ...editing.size, h: Number(e.target.value) } })}
                />
              </div>
            </div>
            <div className="row">
              <div className="field grow">
                <label>出血 mm</label>
                <input type="number" value={editing.bleedMm} onChange={(e) => patchSpec(editing.id, { bleedMm: Number(e.target.value) })} />
              </div>
              <div className="field grow">
                <label>圆角 mm</label>
                <input
                  type="number"
                  value={editing.cornerRadiusMm}
                  onChange={(e) => patchSpec(editing.id, { cornerRadiusMm: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const used = counts();
  return (
    <div className="bp-library">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <h1>卡牌规格</h1>
          <HelpTip>
            <p>规格是纸张物理参数。多张蓝图可共用一条，再各自选竖放或横放。</p>
          </HelpTip>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => create("card")}>
            新建卡牌规格
          </button>
          <button type="button" className="btn" onClick={() => create("board")}>
            新建板件规格
          </button>
        </div>
      </div>
      <div className="bp-grid">
        {specs.map((spec) => (
          <article
            key={spec.id}
            className="bp-tile"
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, id: spec.id });
            }}
          >
            <button type="button" className="bp-faces" onClick={() => setEditId(spec.id)}>
              <SpecSilhouette spec={spec} />
            </button>
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
            <div className="card-actions bp-tile-actions">
              <button type="button" className="btn btn-small btn-primary" onClick={() => setEditId(spec.id)}>
                打开
              </button>
              <button
                type="button"
                className="btn btn-small"
                title="更多"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  setMenu({ x: rect.left, y: rect.bottom + 4, id: spec.id });
                }}
              >
                ⋯
              </button>
            </div>
          </article>
        ))}
        <button type="button" className="bp-tile bp-tile-new" onClick={() => create("card")}>
          <span className="bp-plus">+</span>
          <span>新建卡牌规格</span>
        </button>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            [
              { label: "打开", onClick: () => setEditId(menu.id) },
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
