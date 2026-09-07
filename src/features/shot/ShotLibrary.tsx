import { useState } from "react";
import { uid } from "@/lib/id";
import { createProductShot } from "@/model/shot";
import type { ProductShot } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { HelpTip } from "@/ui/HelpTip";
import { applyShotLayout, SHOT_LAYOUTS, type ShotLayoutId } from "./shotLayout";

function duplicateShot(src: ProductShot): ProductShot {
  const copy = structuredClone(src) as ProductShot;
  copy.id = uid("shot");
  copy.name = `${src.name} 副本`;
  copy.items = copy.items.map((it) => ({ ...it, id: uid("sit") }));
  return copy;
}

export function ShotLibrary() {
  const { current, patchProject } = useAppStore();
  const openShot = useEditorStore((s) => s.openShot);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [layoutId, setLayoutId] = useState<ShotLayoutId>("empty");

  if (!current) return <div className="page">未打开项目</div>;
  const shots = current.shots ?? [];

  function create() {
    let next = createProductShot(`产品图 ${shots.length + 1}`);
    if (layoutId !== "empty") next = applyShotLayout(next, layoutId, current!, false);
    patchProject((p) => ({ ...p, shots: [...(p.shots ?? []), next] }));
  }

  function rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchProject((p) => ({
      ...p,
      shots: (p.shots ?? []).map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
    }));
    setRenaming(null);
  }

  function copy(id: string) {
    const src = shots.find((s) => s.id === id);
    if (!src) return;
    patchProject((p) => ({ ...p, shots: [...(p.shots ?? []), duplicateShot(src)] }));
  }

  function remove(id: string) {
    const shot = shots.find((s) => s.id === id);
    if (!shot) return;
    if (!window.confirm(`删除场景「${shot.name}」？`)) return;
    patchProject((p) => ({ ...p, shots: (p.shots ?? []).filter((s) => s.id !== id) }));
  }

  function moreItems(id: string): MenuItem[] {
    return [
      {
        label: "重命名",
        onClick: () => {
          setRenaming(id);
          setNameDraft(shots.find((s) => s.id === id)?.name ?? "");
        },
      },
      { label: "复制", onClick: () => copy(id) },
      { label: "删除", danger: true, onClick: () => remove(id) },
    ];
  }

  return (
    <div className="bp-library">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <h1>产品渲染</h1>
          <HelpTip>
            <p>点预览块进入场景编辑。空库不会自动建场景。</p>
            <p>新建时可先选布局模版（盒+扇形卡 / 一字卡），进编辑后再把左栏的卡和盒子填进占位体。</p>
          </HelpTip>
        </div>
        <div className="row">
          <select value={layoutId} onChange={(e) => setLayoutId(e.target.value as ShotLayoutId)}>
            {SHOT_LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={create}>
            新建场景
          </button>
        </div>
      </div>
      {shots.length === 0 ? (
        <div className="empty">还没有产品场景。选一个布局模版，点右上角新建。</div>
      ) : (
        <div className="bp-grid">
          {shots.map((shot) => (
            <article
              key={shot.id}
              className="bp-tile"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, id: shot.id });
              }}
            >
              <button type="button" className="shot-lib-preview" onClick={() => openShot(shot.id)}>
                <span>{shot.items.filter((it) => it.refId).length} 件</span>
                <span className="muted">{shot.items.length ? `${shot.items.length} 槽` : "空场景"}</span>
              </button>
              {renaming === shot.id ? (
                <form
                  className="bp-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename(shot.id, nameDraft);
                  }}
                >
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => rename(shot.id, nameDraft)}
                  />
                </form>
              ) : (
                <h3>{shot.name}</h3>
              )}
              <div className="card-actions bp-tile-actions">
                <button type="button" className="btn btn-small btn-primary" onClick={() => openShot(shot.id)}>
                  打开
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  title="更多"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                    setMenu({ x: rect.left, y: rect.bottom + 4, id: shot.id });
                  }}
                >
                  ⋯
                </button>
              </div>
            </article>
          ))}
          <button type="button" className="bp-tile bp-tile-new" onClick={create}>
            <span className="bp-plus">+</span>
            <span>新建场景</span>
          </button>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={moreItems(menu.id)} onClose={() => setMenu(null)} />}
    </div>
  );
}
