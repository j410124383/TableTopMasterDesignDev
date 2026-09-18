import { useState } from "react";
import { uid } from "@/lib/id";
import { createStudio, STUDIO_TEMPLATES, studioBlockingReason, studioTemplateOf } from "@/model/studio";
import type { Studio, StudioTemplateId } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { HelpTip } from "@/ui/HelpTip";
import { ShotViewport } from "@/features/shot/ShotViewport";
import { studioScene } from "./studioPlay";

function duplicateStudio(src: Studio): Studio {
  const copy = structuredClone(src) as Studio;
  copy.id = uid("studio");
  copy.name = `${src.name} 副本`;
  return copy;
}

export function StudioLibrary() {
  const { current, currentPath, patchProject } = useAppStore();
  const openStudio = useEditorStore((s) => s.openStudio);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [picking, setPicking] = useState(false);

  if (!current) return <div className="page">未打开项目</div>;
  const studios = current.studios ?? [];

  function create(templateId: StudioTemplateId) {
    const next = createStudio(templateId, `影棚 ${studios.length + 1}`);
    patchProject((p) => ({ ...p, studios: [...(p.studios ?? []), next] }));
    setPicking(false);
    openStudio(next.id);
  }

  function rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchProject((p) => ({
      ...p,
      studios: (p.studios ?? []).map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
    }));
    setRenaming(null);
  }

  function copy(id: string) {
    const src = studios.find((s) => s.id === id);
    if (!src) return;
    patchProject((p) => ({ ...p, studios: [...(p.studios ?? []), duplicateStudio(src)] }));
  }

  function remove(id: string) {
    const studio = studios.find((s) => s.id === id);
    if (!studio) return;
    if (!window.confirm(`删除影棚「${studio.name}」？`)) return;
    patchProject((p) => ({ ...p, studios: (p.studios ?? []).filter((s) => s.id !== id) }));
  }

  function moreItems(id: string): MenuItem[] {
    return [
      {
        label: "重命名",
        onClick: () => {
          setRenaming(id);
          setNameDraft(studios.find((s) => s.id === id)?.name ?? "");
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
          <h1>影棚</h1>
          <HelpTip>
            <p>点预览块进入影棚。空库不会自动建棚。</p>
            <p>新建时先选模版，再填演员、拧秒数，渲成 PNG 序列交给剪辑。</p>
          </HelpTip>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>
            新建影棚
          </button>
        </div>
      </div>
      {studios.length === 0 ? (
        <div className="empty">还没有影棚。点右上角新建，先选一个模版。</div>
      ) : (
        <div className="bp-grid">
          {studios.map((studio) => {
            const scene = studioScene(studio, 0, current);
            const missing = studioBlockingReason(studio, current);
            return (
              <article
                key={studio.id}
                className="bp-tile"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, id: studio.id });
                }}
              >
                <button type="button" className="shot-lib-preview" onClick={() => openStudio(studio.id)}>
                  <ShotViewport
                    items={scene.items}
                    selectedId={null}
                    onSelect={() => undefined}
                    onMove={() => undefined}
                    onTransform={() => undefined}
                    onOrbit={() => undefined}
                    render={scene.sequenceSetup}
                    project={current}
                    projectDir={currentPath}
                    gizmos={false}
                    lockOnLoad={false}
                  />
                </button>
                {renaming === studio.id ? (
                  <form
                    className="bp-rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename(studio.id, nameDraft);
                    }}
                  >
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => rename(studio.id, nameDraft)}
                    />
                  </form>
                ) : (
                  <h3>{studio.name}</h3>
                )}
                <p className="muted" style={{ margin: "0 8px 6px", fontSize: 12 }}>
                  {studioTemplateOf(studio.templateId).name}
                  {missing ? ` · ${missing}` : ""}
                </p>
                <div className="card-actions bp-tile-actions">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => openStudio(studio.id)}>
                    打开
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    title="更多"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setMenu({ x: rect.left, y: rect.bottom + 4, id: studio.id });
                    }}
                  >
                    ⋯
                  </button>
                </div>
              </article>
            );
          })}
          <button type="button" className="bp-tile bp-tile-new" onClick={() => setPicking(true)}>
            <span className="bp-plus">+</span>
            <span>新建影棚</span>
          </button>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={moreItems(menu.id)} onClose={() => setMenu(null)} />}
      {picking ? (
        <div className="studio-pick" role="dialog" aria-label="选择模版" onClick={() => setPicking(false)}>
          <div className="studio-pick-card" onClick={(e) => e.stopPropagation()}>
            <h2>选一个模版</h2>
            <p className="muted">模版规定这场戏要谁上场。选完再填演员。</p>
            <div className="studio-pick-grid">
              {STUDIO_TEMPLATES.map((tpl) => (
                <button key={tpl.id} type="button" className="studio-pick-item" onClick={() => create(tpl.id)}>
                  <strong>{tpl.name}</strong>
                  <span>{tpl.blurb}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => setPicking(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
