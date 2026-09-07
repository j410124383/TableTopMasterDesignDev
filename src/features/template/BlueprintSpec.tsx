import { uid } from "@/lib/id";
import type { Blueprint, PieceKind } from "@/model/types";
import { applySpecToBlueprint, createPieceSpec, defaultSpec, ensureSpecForKind, specOf } from "@/model/pieceSpec";
import { templateFromBlueprint } from "@/model/normalize";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { CardThumb } from "./CardThumb";
import { IconBtn } from "@/ui/IconBtn";
import { IconReturn } from "@/ui/Icons";
import { HelpTip } from "@/ui/HelpTip";

export function BlueprintSpec({
  blueprint,
  onBack,
}: {
  blueprint: Blueprint;
  onBack: () => void;
}) {
  const { current, patchProject } = useAppStore();
  const openBlueprint = useEditorStore((s) => s.openBlueprint);
  const navigate = useNavigate();

  if (!current) return null;
  const kind: PieceKind = blueprint.kind === "board" ? "board" : "card";
  const allSpecs = current.pieceSpecs ?? [];
  const kindSpecs = allSpecs.filter((s) => s.kind === kind || s.id === blueprint.specId);
  const spec = specOf(current, blueprint.specId) ?? defaultSpec(current, kind);
  const orientation = blueprint.orientation ?? "portrait";
  const front = templateFromBlueprint(blueprint, "front");
  const back = templateFromBlueprint(blueprint, "back");

  function bind(specId: string, nextOrientation = orientation) {
    patchProject((p) => {
      const found = (p.pieceSpecs ?? []).find((s) => s.id === specId);
      if (!found) return p;
      if (found.kind !== kind && found.id !== blueprint.specId) return p;
      return {
        ...p,
        meta: { ...p.meta, defaultSpecId: specId },
        blueprints: p.blueprints.map((b) => (b.id === blueprint.id ? applySpecToBlueprint(b, found, nextOrientation) : b)),
      };
    });
  }

  function changeKind(nextKind: PieceKind) {
    if (nextKind === kind) return;
    patchProject((p) => {
      const ready = ensureSpecForKind(p, nextKind);
      const found = defaultSpec(ready.project, nextKind);
      if (!found) return ready.project;
      return {
        ...ready.project,
        meta: { ...ready.project.meta, defaultSpecId: found.id },
        blueprints: ready.project.blueprints.map((b) =>
          b.id === blueprint.id ? applySpecToBlueprint(b, found, b.orientation ?? "portrait") : b,
        ),
      };
    });
  }

  function saveAsNewSpec() {
    const base = spec ?? createPieceSpec(blueprint.kind === "board" ? "board" : "card", blueprint.size, { name: `${blueprint.name}规格` });
    const next = { ...base, id: uid("psp"), name: `${base.name} 副本` };
    patchProject((p) => ({
      ...p,
      pieceSpecs: [...(p.pieceSpecs ?? []), next],
      meta: { ...p.meta, defaultSpecId: next.id },
      blueprints: p.blueprints.map((b) => (b.id === blueprint.id ? applySpecToBlueprint(b, next, orientation) : b)),
    }));
  }

  return (
    <div className="bp-library">
      <div className="page-head page-head-compact">
        <div className="row">
          <IconBtn title="返回蓝图列表" onClick={onBack}>
            <IconReturn />
          </IconBtn>
          <div>
            <h1>规格 · {blueprint.name}</h1>
          </div>
          <HelpTip>
            <p>蓝图只选共用规格和竖放/横放。要改纸张尺寸、出血、圆角、纸厚，去「卡牌规格」库。</p>
          </HelpTip>
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
            <input
              value={blueprint.name}
              onChange={(e) =>
                patchProject((p) => ({
                  ...p,
                  blueprints: p.blueprints.map((b) => (b.id === blueprint.id ? { ...b, name: e.target.value } : b)),
                }))
              }
            />
          </div>
          <div className="field">
            <label>类型</label>
            <select value={kind} onChange={(e) => changeKind(e.target.value === "board" ? "board" : "card")}>
              <option value="card">卡牌</option>
              <option value="board">板件</option>
            </select>
          </div>
          <div className="field">
            <label>卡牌规格</label>
            <select value={blueprint.specId ?? spec?.id ?? ""} onChange={(e) => bind(e.target.value)}>
              {kindSpecs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.size.w}×{s.size.h}）
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>朝向</label>
            <div className="row">
              <label className="row grow">
                <input type="radio" name="bp-ori" checked={orientation === "portrait"} onChange={() => spec && bind(spec.id, "portrait")} />
                竖放
              </label>
              <label className="row grow">
                <input type="radio" name="bp-ori" checked={orientation === "landscape"} onChange={() => spec && bind(spec.id, "landscape")} />
                横放
              </label>
            </div>
          </div>
          <p className="muted">
            当前画布 {blueprint.size.w}×{blueprint.size.h} mm
            {spec ? ` · 规格竖放基准 ${spec.size.w}×${spec.size.h}` : ""}
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={saveAsNewSpec}>
              另存为新规格
            </button>
            <button type="button" className="btn" onClick={() => navigate("/project/specs")}>
              打开规格库
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
