import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { importCardsFile, exportCardsCsv, exportCardsXlsx } from "@/lib/cardSheet";
import { uid } from "@/lib/id";
import { createCardSet, fieldKeysOf, templateFromBlueprint } from "@/model/normalize";
import type { Card } from "@/model/types";
import { PREVIEW_DPI } from "@/render/layout";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { pageSlice, Pager } from "@/ui/Pager";
import { CardPreview } from "../template/CardPreview";
import { CardThumb } from "../template/CardThumb";

const PAGE_SIZE = 36;

export function SetsPage() {
  const navigate = useNavigate();
  const { current, patchProject } = useAppStore();
  const { setId, setSetId, face, setFace } = useEditorStore();
  const [menu, setMenu] = useState<{ x: number; y: number; setId?: string; cardId?: string } | null>(null);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewW, setPreviewW] = useState(340);
  const sheetRef = useRef<HTMLInputElement>(null);

  const set = current?.sets.find((s) => s.id === (setId ?? current.sets[0]?.id)) ?? current?.sets[0];
  const blueprint = current?.blueprints.find((b) => b.id === set?.blueprintId) ?? current?.blueprints[0];
  const template = blueprint ? templateFromBlueprint(blueprint, face) : undefined;

  useEffect(() => {
    setPage(1);
    setPreviewId(null);
  }, [set?.id]);

  if (!current) return null;
  if (!set || !blueprint || !template) return <div className="page">请先创建蓝图和卡牌集</div>;

  const activeSet = set;
  const pageCards = pageSlice(activeSet.cards, page, PAGE_SIZE);
  const previewCard =
    activeSet.cards.find((c) => c.id === previewId) ??
    pageCards[0] ??
    activeSet.cards[0];

  function openDeck(targetSet: string, cardId?: string) {
    setSetId(targetSet);
    navigate("/project/deck");
    if (cardId) sessionStorage.setItem("ceditor-focus-card", cardId);
  }

  function duplicateSet(id: string) {
    const src = current!.sets.find((s) => s.id === id);
    if (!src) return;
    const copy = {
      ...structuredClone(src),
      id: uid("set"),
      name: `${src.name} 副本`,
      cards: src.cards.map((c) => ({ ...structuredClone(c), id: uid("card") })),
    };
    patchProject((p) => ({ ...p, sets: [...p.sets, copy] }));
    setSetId(copy.id);
  }

  function deleteSet(id: string) {
    if (current!.sets.length <= 1) return;
    patchProject((p) => ({ ...p, sets: p.sets.filter((s) => s.id !== id) }));
    setSetId(current!.sets.find((s) => s.id !== id)?.id ?? null);
  }

  function patchCard(cardId: string, patch: Partial<Card>) {
    patchProject((p) => ({
      ...p,
      sets: p.sets.map((s) =>
        s.id === activeSet.id ? { ...s, cards: s.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) } : s,
      ),
    }));
  }

  function duplicateCard(cardId: string) {
    const src = activeSet.cards.find((c) => c.id === cardId);
    if (!src) return;
    const copy = { ...structuredClone(src), id: uid("card") };
    patchProject((p) => ({
      ...p,
      sets: p.sets.map((s) => (s.id === activeSet.id ? { ...s, cards: [...s.cards, copy] } : s)),
    }));
  }

  function beginResize(e: { preventDefault: () => void; clientX: number }) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = previewW;
    const move = (ev: PointerEvent) => {
      const next = Math.min(560, Math.max(220, startW - (ev.clientX - startX)));
      setPreviewW(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const setItems: MenuItem[] = menu?.setId
    ? [
        { label: "打开数据集", onClick: () => openDeck(menu.setId!) },
        { label: "导入 CSV / Excel", onClick: () => sheetRef.current?.click() },
        {
          label: "导出 CSV",
          onClick: () => {
            const s = current.sets.find((x) => x.id === menu.setId);
            if (!s) return;
            exportCardsCsv(`${current.meta.name}-${s.name}`, s.fieldKeys, s.cards);
          },
        },
        {
          label: "导出 Excel",
          onClick: () => {
            const s = current.sets.find((x) => x.id === menu.setId);
            if (!s) return;
            exportCardsXlsx(`${current.meta.name}-${s.name}`, s.fieldKeys, s.cards, s.name);
          },
        },
        { label: "复制卡牌集", onClick: () => duplicateSet(menu.setId!) },
        {
          label: "设全部数量…",
          onClick: () => {
            const n = Number(window.prompt("每张数量", "1"));
            if (!n) return;
            patchProject((p) => ({
              ...p,
              sets: p.sets.map((s) =>
                s.id === menu.setId ? { ...s, cards: s.cards.map((c) => ({ ...c, qty: n })) } : s,
              ),
            }));
          },
        },
        {
          label: "重命名…",
          onClick: () => {
            const name = window.prompt("卡牌集名称", current.sets.find((s) => s.id === menu.setId)?.name);
            if (!name) return;
            patchProject((p) => ({
              ...p,
              sets: p.sets.map((s) => (s.id === menu.setId ? { ...s, name } : s)),
            }));
          },
        },
        { label: "删除卡牌集", danger: true, disabled: current.sets.length <= 1, onClick: () => deleteSet(menu.setId!) },
      ]
    : [];

  const cardItems: MenuItem[] = menu?.cardId
    ? [
        { label: "预览", onClick: () => setPreviewId(menu.cardId!) },
        { label: "定位到数据集", onClick: () => openDeck(set.id, menu.cardId) },
        { label: "复制这张", onClick: () => duplicateCard(menu.cardId!) },
        {
          label: "设定数量…",
          onClick: () => {
            const n = Number(window.prompt("数量", String(set.cards.find((c) => c.id === menu.cardId)?.qty ?? 1)));
            if (!n) return;
            patchCard(menu.cardId!, { qty: n });
          },
        },
        {
          label: "删除这张",
          danger: true,
          onClick: () =>
            patchProject((p) => ({
              ...p,
              sets: p.sets.map((s) =>
                s.id === set.id ? { ...s, cards: s.cards.filter((c) => c.id !== menu.cardId) } : s,
              ),
            })),
        },
      ]
    : [];

  return (
    <div
      className="sets-grid"
      style={{ gridTemplateColumns: `280px minmax(0, 1fr) 6px ${previewW}px` }}
    >
      <aside className="pane">
        <h4>卡牌集</h4>
        {current.sets.map((s) => (
          <div
            key={s.id}
            className={`layer-item ${s.id === set.id ? "active" : ""}`}
            onClick={() => setSetId(s.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setSetId(s.id);
              setMenu({ x: e.clientX, y: e.clientY, setId: s.id });
            }}
          >
            <span className="grow">{s.name}</span>
            <span className="muted">{s.cards.length}</span>
          </div>
        ))}
        <div className="toolbar" style={{ padding: 12 }}>
          <button
            className="btn btn-small"
            onClick={() => {
              const next = createCardSet(`卡牌集 ${current.sets.length + 1}`, blueprint.id, fieldKeysOf(blueprint));
              patchProject((p) => ({ ...p, sets: [...p.sets, next] }));
              setSetId(next.id);
            }}
          >
            新建卡牌集
          </button>
        </div>
        <div className="form" style={{ padding: "0 12px 16px" }}>
          <div className="field">
            <label>名称</label>
            <input
              value={set.name}
              onChange={(e) =>
                patchProject((p) => ({
                  ...p,
                  sets: p.sets.map((s) => (s.id === set.id ? { ...s, name: e.target.value } : s)),
                }))
              }
            />
          </div>
          <div className="field">
            <label>蓝图</label>
            <select
              value={set.blueprintId}
              onChange={(e) => {
                const bp = current.blueprints.find((b) => b.id === e.target.value);
                patchProject((p) => ({
                  ...p,
                  sets: p.sets.map((s) =>
                    s.id === set.id
                      ? { ...s, blueprintId: e.target.value, fieldKeys: fieldKeysOf(bp) || s.fieldKeys }
                      : s,
                  ),
                }));
              }}
            >
              {current.blueprints.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </aside>
      <div className="canvas-wrap" style={{ padding: 16, overflow: "auto" }}>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <button className={`btn btn-small ${face === "front" ? "btn-primary" : ""}`} onClick={() => setFace("front")}>
            正面
          </button>
          <button className={`btn btn-small ${face === "back" ? "btn-primary" : ""}`} onClick={() => setFace("back")}>
            背面
          </button>
          <button
            className="btn btn-small"
            onClick={() => {
              const card = {
                id: uid("card"),
                qty: 1,
                fields: Object.fromEntries(set.fieldKeys.map((k) => [k, ""])),
              };
              patchProject((p) => ({
                ...p,
                sets: p.sets.map((s) => (s.id === set.id ? { ...s, cards: [...s.cards, card] } : s)),
              }));
            }}
          >
            添加卡牌
          </button>
          <button className="btn btn-small" type="button" onClick={() => sheetRef.current?.click()}>
            导入 CSV / Excel
          </button>
          <button
            className="btn btn-small"
            type="button"
            onClick={() => exportCardsCsv(`${current.meta.name}-${set.name}`, set.fieldKeys, set.cards)}
          >
            导出 CSV
          </button>
          <button
            className="btn btn-small"
            type="button"
            onClick={() => exportCardsXlsx(`${current.meta.name}-${set.name}`, set.fieldKeys, set.cards, set.name)}
          >
            导出 Excel
          </button>
        </div>
        {sheetErr && <div className="banner" style={{ marginBottom: 10 }}>{sheetErr}</div>}
        <input
          ref={sheetRef}
          hidden
          type="file"
          accept=".csv,.tsv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void (async () => {
              try {
                setSheetErr(null);
                const { cards, keys } = await importCardsFile(file, set.fieldKeys);
                if (!cards.length) {
                  setSheetErr("表格里没有数据行");
                  return;
                }
                patchProject((p) => ({
                  ...p,
                  sets: p.sets.map((s) => (s.id === set.id ? { ...s, cards, fieldKeys: keys } : s)),
                }));
              } catch (err) {
                setSheetErr(err instanceof Error ? err.message : "导入失败");
              }
            })();
          }}
        />
        <div className="set-grid">
          {pageCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`set-card ${previewCard?.id === card.id ? "active" : ""}`}
              onClick={() => setPreviewId(card.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, cardId: card.id });
              }}
            >
              <CardThumb
                template={template}
                project={current}
                fields={card.fields}
                cardId={card.id}
                width={140}
                dpi={180}
              />
              <div className="set-card-name">{card.fields.name || card.fields[set.fieldKeys[0]] || "未命名"}</div>
              <div className="muted">×{card.qty}</div>
            </button>
          ))}
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={set.cards.length} onChange={setPage} />
      </div>
      <div className="pane-resizer" onPointerDown={beginResize} title="拖拽调整预览宽度" />
      <aside className="preview-col">
        <div className="face-toggle" style={{ padding: "0 0 12px" }}>
          <button className={`btn btn-small ${face === "front" ? "btn-primary" : ""}`} onClick={() => setFace("front")}>
            正面
          </button>
          <button className={`btn btn-small ${face === "back" ? "btn-primary" : ""}`} onClick={() => setFace("back")}>
            背面
          </button>
        </div>
        {previewCard ? (
          <>
            <div className="preview-frame">
              <CardPreview
                template={template}
                project={current}
                fields={previewCard.fields}
                dpi={PREVIEW_DPI}
                scale={Math.max(0.7, Math.min(1.2, previewW / 320))}
              />
            </div>
            <strong style={{ display: "block", marginBottom: 8 }}>
              {previewCard.fields.name || previewCard.fields[set.fieldKeys[0]] || "未命名"}
            </strong>
            <p className="muted" style={{ marginTop: 0 }}>
              数量 ×{previewCard.qty}
            </p>
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => openDeck(set.id, previewCard.id)}
            >
              定位到数据集
            </button>
          </>
        ) : (
          <p className="muted">选择一张卡牌预览</p>
        )}
      </aside>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.cardId ? cardItems : setItems} onClose={() => setMenu(null)} />}
    </div>
  );
}
