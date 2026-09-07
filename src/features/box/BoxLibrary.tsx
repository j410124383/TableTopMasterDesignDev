import { useState } from "react";
import { uid } from "@/lib/id";
import { createPackagingBox, ensureBoxRender } from "@/model/box";
import type { PackagingBox } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { BoxViewport } from "./BoxViewport";
import { HelpTip } from "@/ui/HelpTip";

function mmToCm(n: number) {
  return Math.round((n / 10) * 100) / 100;
}

function duplicateBox(src: PackagingBox): PackagingBox {
  const copy = structuredClone(src) as PackagingBox;
  copy.id = uid("box");
  copy.name = `${src.name} 副本`;
  return copy;
}

export function BoxLibrary() {
  const { current, currentPath, patchProject } = useAppStore();
  const openBox = useEditorStore((s) => s.openBox);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  if (!current) return <div className="page">未打开项目</div>;

  const boxes = current.boxes ?? [];

  function create() {
    const next = createPackagingBox(`包装盒 ${boxes.length + 1}`);
    patchProject((p) => ({ ...p, boxes: [...(p.boxes ?? []), next] }));
  }

  function rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchProject((p) => ({
      ...p,
      boxes: (p.boxes ?? []).map((b) => (b.id === id ? { ...b, name: trimmed } : b)),
    }));
    setRenaming(null);
  }

  function copy(id: string) {
    const src = boxes.find((b) => b.id === id);
    if (!src) return;
    const next = duplicateBox(src);
    patchProject((p) => ({ ...p, boxes: [...(p.boxes ?? []), next] }));
  }

  function remove(id: string) {
    const box = boxes.find((b) => b.id === id);
    if (!box) return;
    if (!window.confirm(`删除包装盒「${box.name}」？`)) return;
    patchProject((p) => ({ ...p, boxes: (p.boxes ?? []).filter((b) => b.id !== id) }));
  }

  function moreItems(id: string): MenuItem[] {
    return [
      {
        label: "重命名",
        onClick: () => {
          setRenaming(id);
          setNameDraft(boxes.find((b) => b.id === id)?.name ?? "");
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
          <h1>包装盒</h1>
          <HelpTip>
            <p>点预览块进入编辑；更多操作用 ⋯ 或右键。空库不会自动建盒。倒角在盒子结构/渲染页调。</p>
          </HelpTip>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={create}>
            新建方盒
          </button>
        </div>
      </div>
      {boxes.length === 0 ? (
        <div className="empty">还没有包装盒。点右上角新建一个 10×15×5 cm 的方盒。</div>
      ) : (
        <div className="bp-grid">
          {boxes.map((box) => {
            const render = ensureBoxRender(box);
            const tex = box.textureAssetId ? current.assets[box.textureAssetId] ?? null : null;
            return (
              <article
                key={box.id}
                className="bp-tile"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, id: box.id });
                }}
              >
                <button type="button" className="bp-faces box-lib-faces" onClick={() => openBox(box.id)}>
                  <BoxViewport
                    box={box}
                    render={render}
                    textureSrc={tex}
                    projectDir={currentPath}
                    gizmos={false}
                    className="box-lib-view"
                  />
                </button>
                {renaming === box.id ? (
                  <form
                    className="bp-rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename(box.id, nameDraft);
                    }}
                  >
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => rename(box.id, nameDraft)}
                    />
                  </form>
                ) : (
                  <h3>{box.name}</h3>
                )}
                <p className="muted">
                  {mmToCm(box.lengthMm)} × {mmToCm(box.widthMm)} × {mmToCm(box.heightMm)} cm
                  {box.textureAssetId ? " · 已贴图" : " · 未贴图"}
                </p>
                <div className="card-actions bp-tile-actions">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => openBox(box.id)}>
                    打开
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    title="更多"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setMenu({ x: rect.left, y: rect.bottom + 4, id: box.id });
                    }}
                  >
                    ⋯
                  </button>
                </div>
              </article>
            );
          })}
          <button type="button" className="bp-tile bp-tile-new" onClick={create}>
            <span className="bp-plus">+</span>
            <span>新建方盒</span>
          </button>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={moreItems(menu.id)} onClose={() => setMenu(null)} />}
    </div>
  );
}
