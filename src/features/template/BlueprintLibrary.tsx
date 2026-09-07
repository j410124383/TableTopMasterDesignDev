import { useState } from "react";
import { createBlueprint, createCardSet, fieldKeysOf, templateFromBlueprint } from "@/model/normalize";
import { ensureSpecForKind, specOf } from "@/model/pieceSpec";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { CardThumb } from "./CardThumb";
import { BlueprintSpec } from "./BlueprintSpec";
import { HelpTip } from "@/ui/HelpTip";

export function BlueprintLibrary() {
  const { current, patchProject } = useAppStore();
  const openBlueprint = useEditorStore((s) => s.openBlueprint);
  const specId = useEditorStore((s) => s.specId);
  const setSpecId = useEditorStore((s) => s.setSpecId);
  const openSpec = useEditorStore((s) => s.openSpec);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  if (!current) return <div className="page">未打开项目</div>;

  const blueprints = current.blueprints ?? [];
  const spec = specId ? blueprints.find((b) => b.id === specId) : undefined;
  if (spec) {
    return <BlueprintSpec blueprint={spec} onBack={() => setSpecId(null)} />;
  }

  function enter(id: string) {
    openBlueprint(id);
  }

  function create(copyId?: string, kind: "card" | "board" = "card") {
    const from = copyId ? blueprints.find((b) => b.id === copyId) : undefined;
    const name = copyId
      ? `${from?.name ?? "蓝图"} 副本`
      : kind === "board"
        ? `板件 ${blueprints.length + 1}`
        : `卡牌 ${blueprints.length + 1}`;
    patchProject((p) => {
      const ready = ensureSpecForKind(p, from?.kind === "board" || kind === "board" ? "board" : "card");
      const spec = from?.specId ? specOf(ready.project, from.specId) ?? ready.spec : ready.spec;
      const next = createBlueprint(name, spec, from?.orientation ?? "portrait", from);
      return {
        ...ready.project,
        blueprints: [...ready.project.blueprints, next],
        meta: { ...ready.project.meta, defaultSpecId: spec.id },
      };
    });
  }

  function rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchProject((p) => ({
      ...p,
      blueprints: p.blueprints.map((b) => (b.id === id ? { ...b, name: trimmed } : b)),
    }));
    setRenaming(null);
  }

  function remove(id: string) {
    if (blueprints.length <= 1) return;
    const bp = blueprints.find((b) => b.id === id);
    if (!bp) return;
    if (!window.confirm(`删除蓝图「${bp.name}」？使用它的卡牌集会改挂到剩下的蓝图。`)) return;
    const fallback = blueprints.find((b) => b.id !== id)?.id ?? "";
    patchProject((p) => ({
      ...p,
      blueprints: p.blueprints.filter((b) => b.id !== id),
      sets: p.sets.map((s) => (s.blueprintId === id ? { ...s, blueprintId: fallback } : s)),
    }));
  }

  function addSet(id: string) {
    const bp = blueprints.find((b) => b.id === id);
    if (!bp) return;
    const set = createCardSet(`${bp.name}卡组`, bp.id, fieldKeysOf(bp));
    patchProject((p) => ({ ...p, sets: [...p.sets, set] }));
  }

  function moreItems(id: string): MenuItem[] {
    return [
      { label: "规格", onClick: () => openSpec(id) },
      {
        label: "重命名",
        onClick: () => {
          setRenaming(id);
          setNameDraft(blueprints.find((b) => b.id === id)?.name ?? "");
        },
      },
      { label: "复制", onClick: () => create(id) },
      { label: "建卡牌集", onClick: () => addSet(id) },
      {
        label: "删除",
        danger: true,
        disabled: blueprints.length <= 1,
        onClick: () => remove(id),
      },
    ];
  }

  return (
    <div className="bp-library">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <h1>蓝图</h1>
          <HelpTip>
            <p>点「打开」进入图层编辑；更多操作用 ⋯ 或右键。物理尺寸在「卡牌规格」里改，蓝图只选规格和横竖。</p>
          </HelpTip>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => create(undefined, "card")}>
            新建卡牌
          </button>
          <button type="button" className="btn" onClick={() => create(undefined, "board")}>
            新建板件
          </button>
        </div>
      </div>
      {blueprints.length === 0 ? (
        <div className="empty">还没有蓝图。点右上角新建一张。</div>
      ) : (
        <div className="bp-grid">
          {blueprints.map((bp) => {
            const front = templateFromBlueprint(bp, "front");
            const back = templateFromBlueprint(bp, "back");
            const layers = bp.frontLayers.length + bp.backLayers.length;
            return (
              <article
                key={bp.id}
                className="bp-tile"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, id: bp.id });
                }}
              >
                <button type="button" className="bp-faces" onClick={() => enter(bp.id)}>
                  <div>
                    <span>正面</span>
                    <CardThumb template={front} project={current} cardId={`${bp.id}-f`} dpi={160} width={108} honorVisibleWhen={false} />
                  </div>
                  <div>
                    <span>背面</span>
                    <CardThumb template={back} project={current} cardId={`${bp.id}-b`} dpi={160} width={108} honorVisibleWhen={false} />
                  </div>
                </button>
                {renaming === bp.id ? (
                  <form
                    className="bp-rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename(bp.id, nameDraft);
                    }}
                  >
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => rename(bp.id, nameDraft)}
                    />
                  </form>
                ) : (
                  <h3>{bp.name}</h3>
                )}
                <p className="muted">
                  {(() => {
                    const spec = specOf(current, bp.specId);
                    const ori = bp.orientation === "landscape" ? "横放" : "竖放";
                    return `${bp.kind === "board" ? "板件" : "卡牌"} · ${spec?.name ?? "规格"} · ${ori} · ${bp.size.w}×${bp.size.h} mm · ${layers} 图层`;
                  })()}
                </p>
                <div className="card-actions bp-tile-actions">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => enter(bp.id)}>
                    打开
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    title="更多"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setMenu({ x: rect.left, y: rect.bottom + 4, id: bp.id });
                    }}
                  >
                    ⋯
                  </button>
                </div>
              </article>
            );
          })}
          <button type="button" className="bp-tile bp-tile-new" onClick={() => create(undefined, "card")}>
            <span className="bp-plus">+</span>
            <span>新建卡牌</span>
          </button>
        </div>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={moreItems(menu.id)} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
