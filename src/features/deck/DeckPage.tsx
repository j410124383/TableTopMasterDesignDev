import { useMemo, useRef, useState } from "react";
import { importCardsFile, exportCardsCsv, exportCardsXlsx } from "@/lib/cardSheet";
import { ingestImageFile } from "@/lib/ingestAsset";
import { uid } from "@/lib/id";
import { createCardSet, fieldKeysOf, templateFromBlueprint } from "@/model/normalize";
import {
  createCardSetView,
  DEFAULT_COL_WIDTH,
  renameViewColumn,
  visibleColumns,
} from "@/model/cardSetView";
import type { Card, CardSet, CardSetView, FieldType } from "@/model/types";
import { PREVIEW_DPI } from "@/render/layout";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { IconBtn } from "@/ui/IconBtn";
import { IconCopy, IconPlus, IconSearch, IconTrash } from "@/ui/Icons";
import { CardPreview } from "../template/CardPreview";
import { CardThumb } from "../template/CardThumb";

export function DeckPage() {
  const { current, currentPath, patchProject, setError } = useAppStore();
  const { setId, setSetId } = useEditorStore();
  const [face, setFace] = useState<"front" | "back">("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [batchQty, setBatchQty] = useState(1);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [colMenu, setColMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const [renamingView, setRenamingView] = useState<string | null>(null);
  const dragCol = useRef<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const artRef = useRef<HTMLInputElement>(null);

  const deck = current?.sets.find((d) => d.id === (setId ?? current.sets[0]?.id)) ?? current?.sets[0];
  const blueprint = current?.blueprints.find((b) => b.id === deck?.blueprintId);
  const template = blueprint ? templateFromBlueprint(blueprint, face) : undefined;
  const selected = deck?.cards.find((c) => c.id === selectedId) ?? deck?.cards[0];

  const views = deck?.views ?? [];
  const view = views.find((v) => v.id === deck?.activeViewId) ?? views[0];
  const columns = useMemo(
    () => (deck ? visibleColumns(view, deck.fieldKeys) : []),
    [deck, view],
  );

  const visibleCards = useMemo(() => {
    if (!deck) return [];
    const q = query.trim().toLowerCase();
    let list = q
      ? deck.cards.filter((c) => Object.values(c.fields).some((v) => String(v).toLowerCase().includes(q)))
      : [...deck.cards];
    if (sortKey) {
      list = [...list].sort((a, b) => String(a.fields[sortKey] ?? "").localeCompare(String(b.fields[sortKey] ?? ""), "zh"));
    }
    return list;
  }, [deck, query, sortKey]);

  if (!current || !deck || !template) {
    return <div className="page">项目缺少卡牌集</div>;
  }

  function patchSet(partial: Partial<CardSet>, mergeKey?: string) {
    patchProject(
      (p) => ({
        ...p,
        sets: p.sets.map((d) => (d.id === deck!.id ? { ...d, ...partial } : d)),
      }),
      mergeKey ? { mergeKey } : undefined,
    );
  }

  function patchView(next: CardSetView, mergeKey?: string) {
    patchSet(
      {
        views: (deck!.views ?? []).map((v) => (v.id === next.id ? next : v)),
        activeViewId: next.id,
      },
      mergeKey,
    );
  }

  function patchDeck(cards?: Card[], fieldKeys?: string[], fieldTypes?: Record<string, FieldType>) {
    const keys = fieldKeys ?? deck!.fieldKeys;
    let nextViews = deck!.views;
    if (fieldKeys) {
      nextViews = (deck!.views ?? []).map((v) => {
        const order = v.columnOrder.filter((k) => keys.includes(k));
        for (const k of keys) if (!order.includes(k)) order.push(k);
        return { ...v, columnOrder: order, hiddenColumns: v.hiddenColumns.filter((k) => keys.includes(k)) };
      });
    }
    patchSet({
      cards: cards ?? deck!.cards,
      fieldKeys: keys,
      fieldTypes: fieldTypes ?? deck!.fieldTypes,
      views: nextViews,
    });
  }

  function renameColumn(key: string, next: string) {
    const name = next.trim();
    if (!name || name === key) return;
    if (columns.includes(name)) {
      setError(`字段「${name}」已存在`);
      return;
    }
    const fieldTypes = { ...(deck!.fieldTypes ?? {}) };
    if (fieldTypes[key]) {
      fieldTypes[name] = fieldTypes[key];
      delete fieldTypes[key];
    }
    const allKeys = deck!.fieldKeys.map((k) => (k === key ? name : k));
    patchSet({
      fieldKeys: allKeys,
      fieldTypes,
      views: renameViewColumn(deck!.views, key, name),
      cards: deck!.cards.map((c) => {
        const fields = { ...c.fields };
        fields[name] = fields[key] ?? "";
        delete fields[key];
        return { ...c, fields };
      }),
    });
  }

  function deleteColumn(key: string) {
    if (deck!.fieldKeys.length <= 1) return;
    const fieldKeys = deck!.fieldKeys.filter((k) => k !== key);
    const fieldTypes = { ...(deck!.fieldTypes ?? {}) };
    delete fieldTypes[key];
    patchDeck(
      deck!.cards.map((c) => {
        const fields = { ...c.fields };
        delete fields[key];
        return { ...c, fields };
      }),
      fieldKeys,
      fieldTypes,
    );
  }

  function duplicateColumn(key: string) {
    let name = `${key}_copy`;
    let n = 2;
    while (columns.includes(name)) {
      name = `${key}_copy${n++}`;
    }
    const fieldKeys = [...deck!.fieldKeys];
    const idx = fieldKeys.indexOf(key);
    fieldKeys.splice(idx + 1, 0, name);
    const fieldTypes = { ...(deck!.fieldTypes ?? {}) };
    if (fieldTypes[key]) fieldTypes[name] = fieldTypes[key];
    patchDeck(
      deck!.cards.map((c) => ({ ...c, fields: { ...c.fields, [name]: c.fields[key] ?? "" } })),
      fieldKeys,
      fieldTypes,
    );
  }

  function setColumnType(key: string, type: FieldType) {
    const fieldTypes = { ...(deck!.fieldTypes ?? {}), [key]: type };
    patchDeck(undefined, undefined, fieldTypes);
  }

  function updateCard(id: string, patch: Partial<Card>) {
    patchDeck(deck!.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function setField(id: string, key: string, value: string) {
    const card = deck!.cards.find((c) => c.id === id);
    if (!card) return;
    updateCard(id, { fields: { ...card.fields, [key]: value } });
  }

  async function importSheet(file: File) {
    try {
      setSheetErr(null);
      const { cards, keys } = await importCardsFile(file, deck!.fieldKeys);
      if (!cards.length) {
        setSheetErr("表格里没有数据行");
        return;
      }
      patchDeck(cards, keys);
    } catch (err) {
      setSheetErr(err instanceof Error ? err.message : "导入失败");
    }
  }

  const fileBase = `${current.meta.name}-${deck.name}`;
  const colMenuItems: MenuItem[] = colMenu
    ? [
        {
          label: "重命名…",
          onClick: () => {
            const next = window.prompt("字段名", colMenu.key);
            if (next != null) renameColumn(colMenu.key, next);
          },
        },
        { label: "复制列", onClick: () => duplicateColumn(colMenu.key) },
        {
          label: "类型",
          submenu: [
            { label: "文本 string", onClick: () => setColumnType(colMenu.key, "text") },
            { label: "布尔 bool", onClick: () => setColumnType(colMenu.key, "bool") },
            { label: "图片链接", onClick: () => setColumnType(colMenu.key, "image") },
            { label: "数字 number", onClick: () => setColumnType(colMenu.key, "number") },
          ],
        },
        {
          label: "删除列",
          danger: true,
          disabled: columns.length <= 1,
          onClick: () => deleteColumn(colMenu.key),
        },
        {
          label: "在此视窗隐藏",
          onClick: () => {
            if (!view) return;
            patchView({ ...view, hiddenColumns: [...view.hiddenColumns, colMenu.key] });
          },
        },
      ]
    : [];

  return (
    <div className="deck-grid data-layout">
      <div className="table-wrap">
        <div className="toolbar" style={{ marginBottom: 12, alignItems: "center" }}>
          <select
            value={deck.id}
            onChange={(e) => {
              setSetId(e.target.value);
              setSelectedId(null);
            }}
          >
            {current.sets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            className="search-input"
            style={{ maxWidth: 180 }}
            value={deck.name}
            onChange={(e) =>
              patchProject((p) => ({
                ...p,
                sets: p.sets.map((d) => (d.id === deck.id ? { ...d, name: e.target.value } : d)),
              }))
            }
          />
          <IconBtn
            title="新增卡牌集"
            onClick={() => {
              const next = createCardSet(`卡牌集 ${current.sets.length + 1}`, deck.blueprintId, fieldKeysOf(blueprint));
              patchProject((p) => ({ ...p, sets: [...p.sets, next] }));
              setSetId(next.id);
            }}
          >
            <IconPlus />
          </IconBtn>
          <IconBtn
            title="添加卡牌"
            onClick={() => {
              const card: Card = {
                id: uid("card"),
                qty: 1,
                fields: Object.fromEntries(columns.map((k) => [k, ""])),
              };
              patchDeck([...deck.cards, card]);
              setSelectedId(card.id);
            }}
          >
            <IconPlus />
          </IconBtn>
          <button
            className="btn btn-small"
            onClick={() => {
              const key = `field${columns.length + 1}`;
              patchDeck(
                deck.cards.map((c) => ({ ...c, fields: { ...c.fields, [key]: "" } })),
                [...deck.fieldKeys, key],
              );
            }}
          >
            添加字段
          </button>
          <button className="btn btn-small" type="button" onClick={() => csvRef.current?.click()}>
            导入 CSV / Excel
          </button>
          <button
            className="btn btn-small"
            type="button"
            onClick={() => exportCardsCsv(fileBase, columns, deck.cards)}
          >
            导出 CSV
          </button>
          <button
            className="btn btn-small"
            type="button"
            onClick={() => exportCardsXlsx(fileBase, columns, deck.cards, deck.name)}
          >
            导出 Excel
          </button>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="">不排序</option>
            {columns.map((k) => (
              <option key={k} value={k}>
                按 {k}
              </option>
            ))}
          </select>
          <div className="row">
            <input
              type="number"
              min={1}
              style={{ width: 56 }}
              value={batchQty}
              onChange={(e) => setBatchQty(Math.max(1, Number(e.target.value) || 1))}
            />
            <button className="btn btn-small" onClick={() => patchDeck(deck.cards.map((c) => ({ ...c, qty: batchQty })))}>
              全部数量
            </button>
          </div>
          <label className="row grow" style={{ maxWidth: 220 }}>
            <IconSearch />
            <input
              className="grow"
              placeholder="筛选卡牌"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <input
            ref={csvRef}
            hidden
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importSheet(file);
            }}
          />
        </div>
        {sheetErr && <div className="banner" style={{ marginBottom: 10 }}>{sheetErr}</div>}
        <div className="view-tabs">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`view-tab ${v.id === view?.id ? "active" : ""}`}
              onClick={() => patchSet({ activeViewId: v.id })}
              onDoubleClick={() => {
                setRenamingView(v.id);
              }}
            >
              {renamingView === v.id ? (
                <input
                  autoFocus
                  defaultValue={v.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim() || v.name;
                    patchView({ ...v, name });
                    setRenamingView(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenamingView(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                v.name
              )}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              const next = createCardSetView(`视窗 ${views.length + 1}`, deck.fieldKeys, view);
              patchSet({ views: [...views, next], activeViewId: next.id });
            }}
          >
            + 视窗
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={views.length <= 1}
            onClick={() => {
              if (!view || views.length <= 1) return;
              const nextViews = views.filter((v) => v.id !== view.id);
              patchSet({ views: nextViews, activeViewId: nextViews[0]?.id });
            }}
          >
            删除视窗
          </button>
          {view && view.hiddenColumns.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const key = e.target.value;
                if (!key) return;
                patchView({ ...view, hiddenColumns: view.hiddenColumns.filter((k) => k !== key) });
              }}
            >
              <option value="">显示隐藏列…</option>
              {view.hiddenColumns.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
        </div>
        <table className="data">
          <thead>
            <tr>
              <th style={{ minWidth: 56 }}>预览</th>
              <th style={{ minWidth: 64 }}>数量</th>
              {columns.map((key) => (
                <th
                  key={key}
                  className="th-menu-target"
                  draggable
                  style={{ width: view?.columnWidths[key] ?? DEFAULT_COL_WIDTH, minWidth: 72, position: "relative" }}
                  onDragStart={() => {
                    dragCol.current = key;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const from = dragCol.current;
                    dragCol.current = null;
                    if (!from || !view || from === key) return;
                    const order = [...view.columnOrder];
                    const i = order.indexOf(from);
                    const j = order.indexOf(key);
                    if (i < 0 || j < 0) return;
                    order.splice(i, 1);
                    order.splice(j, 0, from);
                    patchView({ ...view, columnOrder: order });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setColMenu({ x: e.clientX, y: e.clientY, key });
                  }}
                  title={`类型：${deck.fieldTypes?.[key] ?? (key === "art" ? "image" : "text")} · 拖拽改顺序 · 右键更多`}
                >
                  <input
                    value={key}
                    onChange={(e) => {
                      const next = e.target.value.trim();
                      if (!next || next === key || deck.fieldKeys.includes(next)) return;
                      renameColumn(key, next);
                    }}
                  />
                  <span
                    className="th-resize"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!view) return;
                      const startX = e.clientX;
                      const startW = view.columnWidths[key] ?? DEFAULT_COL_WIDTH;
                      const move = (ev: MouseEvent) => {
                        const w = Math.max(72, startW + ev.clientX - startX);
                        patchView({ ...view, columnWidths: { ...view.columnWidths, [key]: w } }, "deck-col-w");
                      };
                      const up = () => {
                        window.removeEventListener("mousemove", move);
                        window.removeEventListener("mouseup", up);
                      };
                      window.addEventListener("mousemove", move);
                      window.addEventListener("mouseup", up);
                    }}
                  />
                </th>
              ))}
              <th style={{ minWidth: 88 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleCards.map((card) => (
              <tr
                key={card.id}
                className={selected?.id === card.id ? "selected" : ""}
                onClick={() => setSelectedId(card.id)}
              >
                <td className="thumb-cell">
                  <CardThumb template={template} project={current} fields={card.fields} cardId={card.id} width={44} dpi={160} />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={card.qty}
                    onChange={(e) => updateCard(card.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </td>
                {columns.map((key) => (
                  <td key={key}>
                    {deck.fieldTypes?.[key] === "bool" ? (
                      <label className="row" style={{ justifyContent: "center" }}>
                        <input
                          type="checkbox"
                          checked={["1", "true", "yes", "on", "是", "真"].includes(
                            String(card.fields[key] ?? "")
                              .trim()
                              .toLowerCase(),
                          )}
                          onChange={(e) => setField(card.id, key, e.target.checked ? "true" : "false")}
                        />
                      </label>
                    ) : key === "art" || deck.fieldTypes?.[key] === "image" ? (
                      <div className="row">
                        <input
                          value={card.fields[key] ?? ""}
                          placeholder="资源 id 或粘贴"
                          onChange={(e) => setField(card.id, key, e.target.value)}
                        />
                        <button
                          className="btn btn-small"
                          onClick={() => {
                            setSelectedId(card.id);
                            artRef.current?.click();
                          }}
                        >
                          图
                        </button>
                      </div>
                    ) : (
                      <textarea
                        rows={2}
                        value={card.fields[key] ?? ""}
                        onChange={(e) => setField(card.id, key, e.target.value)}
                      />
                    )}
                  </td>
                ))}
                <td>
                  <div className="row">
                    <IconBtn
                      title="复制此卡"
                      onClick={() => {
                        const copy: Card = {
                          ...structuredClone(card),
                          id: uid("card"),
                          fields: { ...card.fields, name: `${card.fields.name ?? ""} 副本` },
                        };
                        const i = deck.cards.findIndex((c) => c.id === card.id);
                        const cards = [...deck.cards];
                        cards.splice(i + 1, 0, copy);
                        patchDeck(cards);
                        setSelectedId(copy.id);
                      }}
                    >
                      <IconCopy />
                    </IconBtn>
                    <IconBtn
                      title="删除"
                      danger
                      onClick={() => patchDeck(deck.cards.filter((c) => c.id !== card.id))}
                    >
                      <IconTrash />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <input
          ref={artRef}
          hidden
          type="file"
          accept="image/*,.psd,image/vnd.adobe.photoshop"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !selected) return;
            try {
              const { id, src } = await ingestImageFile(file, currentPath, current.assets);
              patchProject((p) => ({
                ...p,
                assets: { ...p.assets, [id]: src },
                sets: p.sets.map((d) =>
                  d.id === deck.id
                    ? {
                        ...d,
                        cards: d.cards.map((c) =>
                          c.id === selected.id ? { ...c, fields: { ...c.fields, art: id } } : c,
                        ),
                      }
                    : d,
                ),
              }));
            } catch (err) {
              setError(err instanceof Error ? err.message : "导入图片失败");
            }
          }}
        />
      </div>
      <aside className="preview-col">
        <div className="face-toggle">
          <button className={`btn btn-small ${face === "front" ? "btn-primary" : ""}`} onClick={() => setFace("front")}>
            正面
          </button>
          <button className={`btn btn-small ${face === "back" ? "btn-primary" : ""}`} onClick={() => setFace("back")}>
            背面
          </button>
        </div>
        <div className="preview-frame">
          <CardPreview
            template={template}
            project={current}
            fields={selected?.fields}
            dpi={PREVIEW_DPI}
            scale={1.05}
          />
        </div>
        <p className="muted">
          共 {deck.cards.length} 种，打印 {deck.cards.reduce((sum, c) => sum + c.qty, 0)} 张。
          {query && ` 筛选后 ${visibleCards.length} 种。`}
        </p>
      </aside>
      {colMenu && <ContextMenu x={colMenu.x} y={colMenu.y} items={colMenuItems} onClose={() => setColMenu(null)} />}
    </div>
  );
}
