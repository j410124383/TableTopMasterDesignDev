import type { Blueprint } from "@/model/types";
import { CARD_SIZE_PRESETS, presetBySize } from "@/model/sizes";
import { templateFromBlueprint } from "@/model/normalize";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { CardThumb } from "./CardThumb";
import { IconBtn } from "@/ui/IconBtn";
import { IconReturn } from "@/ui/Icons";

export function BlueprintSpec({
  blueprint,
  onBack,
}: {
  blueprint: Blueprint;
  onBack: () => void;
}) {
  const { current, patchProject } = useAppStore();
  const openBlueprint = useEditorStore((s) => s.openBlueprint);
  const sizePreset = presetBySize(blueprint.size);

  function patch(next: Partial<Blueprint>) {
    patchProject((p) => ({
      ...p,
      meta: { ...p.meta, defaultSize: next.size ?? blueprint.size },
      blueprints: p.blueprints.map((b) => (b.id === blueprint.id ? { ...b, ...next } : b)),
    }));
  }

  if (!current) return null;
  const front = templateFromBlueprint(blueprint, "front");
  const back = templateFromBlueprint(blueprint, "back");

  return (
    <div className="bp-library">
      <div className="page-head">
        <div className="row">
          <IconBtn title="返回蓝图列表" onClick={onBack}>
            <IconReturn />
          </IconBtn>
          <div>
            <h1>规格 · {blueprint.name}</h1>
            <p className="muted">成品尺寸、出血和圆角。卡牌无厚度；板件可设厚度。改完可回列表，或直接进入图层编辑。</p>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openBlueprint(blueprint.id)}>
          进入编辑
        </button>
      </div>
      <div className="bp-spec">
        <div className="bp-spec-preview">
          <div>
            <span>正面</span>
            <CardThumb template={front} project={current} cardId={`${blueprint.id}-sf`} dpi={180} width={160} honorVisibleWhen={false} />
          </div>
          <div>
            <span>背面</span>
            <CardThumb template={back} project={current} cardId={`${blueprint.id}-sb`} dpi={180} width={160} honorVisibleWhen={false} />
          </div>
        </div>
        <div className="form bp-spec-form">
          <div className="field">
            <label>名称</label>
            <input value={blueprint.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="field">
            <label>类型</label>
            <select
              value={blueprint.kind === "board" ? "board" : "card"}
              onChange={(e) => {
                const kind = e.target.value === "board" ? "board" : "card";
                patch({
                  kind,
                  thicknessMm: kind === "board" ? (blueprint.thicknessMm ?? 2) : undefined,
                });
              }}
            >
              <option value="card">卡牌（无厚度）</option>
              <option value="board">板件</option>
            </select>
          </div>
          {blueprint.kind === "board" ? (
            <div className="field">
              <label>厚度 mm</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={blueprint.thicknessMm ?? 2}
                onChange={(e) => patch({ thicknessMm: Math.max(0, Number(e.target.value)) })}
              />
            </div>
          ) : null}
          <div className="field">
            <label>成品尺寸</label>
            <select
              value={sizePreset}
              onChange={(e) => {
                const found = CARD_SIZE_PRESETS.find((p) => p.id === e.target.value);
                if (!found || found.id === "custom") return;
                patch({ size: { w: found.w, h: found.h } });
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
              <label>宽 mm</label>
              <input
                type="number"
                value={blueprint.size.w}
                onChange={(e) => patch({ size: { ...blueprint.size, w: Number(e.target.value) } })}
              />
            </div>
            <div className="field grow">
              <label>高 mm</label>
              <input
                type="number"
                value={blueprint.size.h}
                onChange={(e) => patch({ size: { ...blueprint.size, h: Number(e.target.value) } })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field grow">
              <label>出血 mm</label>
              <input
                type="number"
                value={blueprint.bleedMm}
                onChange={(e) => patch({ bleedMm: Number(e.target.value) })}
              />
            </div>
            <div className="field grow">
              <label>圆角 mm</label>
              <input
                type="number"
                value={blueprint.cornerRadiusMm}
                onChange={(e) => patch({ cornerRadiusMm: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
