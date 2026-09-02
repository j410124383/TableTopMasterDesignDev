import { useEffect, useMemo, useRef, useState } from "react";
import { applyProjectFonts, fontFamilies } from "@/lib/fonts";
import { uid } from "@/lib/id";
import { roundMm } from "@/lib/mm";
import { STOCK_ICONS, stockIconAssetId } from "@/lib/stockIcons";
import { FONT_PRESETS } from "@/model/sizes";
import {
  bindLayerVar,
  defaultValueForVar,
  defaultVarField,
  LAYER_VAR_LABELS,
  layerVarField,
  propsForLayer,
  unbindLayerVar,
  type LayerVarProp,
} from "@/model/layerVars";
import { templateFromBlueprint } from "@/model/normalize";
import {
  absBox,
  extractSubtree,
  insertSubtree,
  removeSubtree,
  subtreeIds,
  toRelative,
  walkLayerTree,
} from "@/model/layerTree";
import type { Blueprint, Layer, LayerShape, LayerType, Template } from "@/model/types";
import { ingestImageFile } from "@/lib/ingestAsset";
import { readFileAsDataUrl } from "@/persist/storage";
import { LAYER_SHAPES } from "@/render/shapes";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { IconBtn } from "@/ui/IconBtn";
import {
  IconBleed,
  IconCropBleed,
  IconCut,
  IconDown,
  IconEye,
  IconEyeOff,
  IconFit,
  IconGrid,
  IconGear,
  IconLock,
  IconOne,
  IconPlus,
  IconReturn,
  IconSafe,
  IconSnap,
  IconTrash,
  IconUnlock,
  IconUp,
} from "@/ui/Icons";
import { ColorField } from "@/ui/ColorField";
import { ColorSwatch } from "@/ui/ColorSwatch";
import { LayerTypeIcon } from "@/ui/LayerTypeIcon";
import { BlueprintLibrary } from "./BlueprintLibrary";
import { CardCanvas } from "./CardCanvas";
import { CardFlipStage } from "./CardFlipStage";
import { LayerInsertBar } from "./LayerInsertBar";
import { TextStyleBar } from "./TextStyleBar";

function DpiField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  function commit() {
    const n = Number(draft);
    const next = Number.isFinite(n) && n > 0 ? Math.min(1000, Math.max(1, Math.round(n))) : 300;
    onCommit(next);
    setDraft(String(next));
  }
  return (
    <label className="dpi-field" title="预览分辨率 1–1000">
      DPI
      <input
        type="text"
        inputMode="numeric"
        value={focused ? draft : String(value)}
        onFocus={() => {
          setFocused(true);
          setDraft(String(value));
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

const EMPTY_FIELDS: Record<string, string> = {};

function layerThumbSrc(
  layer: Layer,
  assets: Record<string, string>,
): string | undefined {
  if (layer.type !== "image" && layer.type !== "icon") return undefined;
  const raw = layer.text || "";
  if (!raw) return undefined;
  if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("/__fs/") || /^https?:/i.test(raw)) {
    return raw;
  }
  return assets[raw];
}

function defaultLayer(type: LayerType, template: Template, extra?: { shape?: LayerShape }): Layer {
  const base = {
    id: uid("ly"),
    x: 6,
    y: 6,
    w: template.size.w - 12,
    h: type === "text" ? 10 : 20,
    visible: true,
    locked: false,
    rotation: 0,
    style: {},
    vars: {},
  };
  if (type === "text") {
    return {
      ...base,
      type,
      name: "name",
      text: "文本",
      style: {
        color: "#f4f1e8",
        fontSizeMm: 4,
        align: "center",
        valign: "middle",
        fontFamily: "Georgia, serif",
      },
    };
  }
  if (type === "image") return { ...base, type, name: "art", style: { fit: "cover" } };
  if (type === "icon") return { ...base, type, name: "icon", w: 12, h: 12, style: { fit: "contain", knockout: true } };
  if (type === "group") {
    return {
      ...base,
      type: "group",
      name: "组",
      w: Math.min(40, template.size.w - 12),
      h: 24,
      style: {},
    };
  }
  const shape = extra?.shape ?? "round";
  const box = shape === "circle" ? 16 : undefined;
  return {
    ...base,
    type: "rect",
    name: "色块",
    w: box ?? Math.min(28, template.size.w - 12),
    h: box ?? 16,
    style: { fill: "#2a3548", shape },
  };
}

export function TemplateEditor() {
  const current = useAppStore((s) => s.current);
  const libraryOpen = useEditorStore((s) => s.libraryOpen);
  if (!current) return <div className="page">未打开项目</div>;
  if (libraryOpen || !current.blueprints.length) return <BlueprintLibrary />;
  return <BlueprintEditor />;
}

function BlueprintEditor() {
  const { current, currentPath, patchProject, setError } = useAppStore();
  const {
    selectedId,
    setSelected,
    face,
    setFace,
    view,
    patchView,
    fitView,
    centerZoom,
    setClipboard,
    clipboard,
    blueprintId,
    setLibraryOpen,
    openSpec,
    previewDpi,
    setPreviewDpi,
  } = useEditorStore();
  const [menu, setMenu] = useState<
    | { kind: "layer"; x: number; y: number; id: string }
    | { kind: "prop"; x: number; y: number; id: string; prop: LayerVarProp }
    | { kind: "box"; x: number; y: number; id: string; key: "x" | "y" | "w" | "h" | "rotation" }
    | null
  >(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [leftW, setLeftW] = useState(280);
  const [rightW, setRightW] = useState(360);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const blueprints = current?.blueprints ?? [];
  const blueprint =
    blueprints.find((b) => b.id === (blueprintId ?? blueprints[0]?.id)) ?? blueprints[0];
  const template = blueprint ? templateFromBlueprint(blueprint, face) : undefined;
  const selected = template?.layers.find((l) => l.id === selectedId);
  const fonts = useMemo(() => [...FONT_PRESETS, ...(current ? fontFamilies(current) : [])], [current]);

  if (!current || !blueprint || !template) return <div className="page">项目缺少蓝图</div>;

  function updateBlueprint(recipe: (b: Blueprint) => Blueprint, mergeKey?: string) {
    patchProject((p) => {
      const next = recipe(blueprint!);
      return {
        ...p,
        meta: { ...p.meta, defaultSize: next.size },
        blueprints: p.blueprints.map((b) => (b.id === next.id ? next : b)),
      };
    }, mergeKey ? { mergeKey } : undefined);
  }

  function updateTemplate(recipe: (t: Template) => Template, mergeKey?: string) {
    updateBlueprint((b) => {
      const next = recipe(templateFromBlueprint(b, face));
      return {
        ...b,
        size: next.size,
        bleedMm: next.bleedMm,
        cornerRadiusMm: next.cornerRadiusMm,
        frontLayers: face === "front" ? next.layers : b.frontLayers,
        backLayers: face === "back" ? next.layers : b.backLayers,
      };
    }, mergeKey);
  }

  function updateLayer(id: string, patch: Partial<Layer>, mergeKey?: string) {
    updateTemplate(
      (t) => ({
        ...t,
        layers: t.layers.map((l) =>
          l.id === id ? { ...l, ...patch, style: { ...l.style, ...("style" in patch ? patch.style : {}) } } : l,
        ),
      }),
      mergeKey,
    );
  }

  function selectedGroup() {
    const ids = new Set([selectedId, ...extraIds].filter(Boolean) as string[]);
    return (template?.layers ?? []).filter((l) => ids.has(l.id));
  }

  function alignSelected(mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "safe" | "cut" | "spreadX" | "spreadY") {
    if (!selected || !template) return;
    const group = selectedGroup();
    if (mode === "spreadX" && group.length >= 3) {
      const sorted = [...group].sort((a, b) => a.x - b.x);
      const left = Math.min(...sorted.map((g) => g.x));
      const right = Math.max(...sorted.map((g) => g.x + g.w));
      const totalW = sorted.reduce((s, g) => s + g.w, 0);
      const gap = (right - left - totalW) / (sorted.length - 1);
      let cursor = left;
      const pos = new Map<string, number>();
      for (const g of sorted) {
        pos.set(g.id, cursor);
        cursor += g.w + gap;
      }
      updateTemplate((t) => ({
        ...t,
        layers: t.layers.map((l) => (pos.has(l.id) ? { ...l, x: pos.get(l.id)! } : l)),
      }));
      return;
    }
    if (mode === "spreadY" && group.length >= 3) {
      const sorted = [...group].sort((a, b) => a.y - b.y);
      const top = Math.min(...sorted.map((g) => g.y));
      const bottom = Math.max(...sorted.map((g) => g.y + g.h));
      const totalH = sorted.reduce((s, g) => s + g.h, 0);
      const gap = (bottom - top - totalH) / (sorted.length - 1);
      let cursor = top;
      const pos = new Map<string, number>();
      for (const g of sorted) {
        pos.set(g.id, cursor);
        cursor += g.h + gap;
      }
      updateTemplate((t) => ({
        ...t,
        layers: t.layers.map((l) => (pos.has(l.id) ? { ...l, y: pos.get(l.id)! } : l)),
      }));
      return;
    }
    const t = template;
    const s = 3;
    const targets = group.length ? group : [selected];
    // 多选：相对选区包围盒对齐（PS 风格）；单选：相对画布
    const multi = targets.length >= 2;
    const bounds = multi
      ? {
          x: Math.min(...targets.map((g) => g.x)),
          y: Math.min(...targets.map((g) => g.y)),
          r: Math.max(...targets.map((g) => g.x + g.w)),
          b: Math.max(...targets.map((g) => g.y + g.h)),
        }
      : { x: 0, y: 0, r: t.size.w, b: t.size.h };
    const cx = (bounds.x + bounds.r) / 2;
    const cy = (bounds.y + bounds.b) / 2;
    updateTemplate((tpl) => ({
      ...tpl,
      layers: tpl.layers.map((l) => {
        if (!targets.some((g) => g.id === l.id)) return l;
        const patch: Partial<Layer> =
          mode === "left"
            ? { x: bounds.x }
            : mode === "center"
              ? { x: cx - l.w / 2 }
              : mode === "right"
                ? { x: bounds.r - l.w }
                : mode === "top"
                  ? { y: bounds.y }
                  : mode === "middle"
                    ? { y: cy - l.h / 2 }
                    : mode === "bottom"
                      ? { y: bounds.b - l.h }
                      : mode === "safe"
                        ? { x: s, y: s, w: t.size.w - s * 2, h: t.size.h - s * 2 }
                        : { x: 0, y: 0, w: t.size.w, h: t.size.h };
        return { ...l, ...patch };
      }),
    }));
  }

  function setLayerVar(layerId: string, prop: LayerVarProp, on: boolean) {
    const layer = template!.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const field = defaultVarField(layer, prop);
    const fallback = defaultValueForVar(layer, prop);
    patchProject((p) => {
      const apply = (layers: Layer[]) =>
        layers.map((l) => {
          if (l.id !== layerId) return l;
          return on ? bindLayerVar(l, prop, field) : unbindLayerVar(l, prop);
        });
      return {
        ...p,
        blueprints: p.blueprints.map((b) =>
          b.id === blueprint!.id
            ? { ...b, frontLayers: apply(b.frontLayers), backLayers: apply(b.backLayers) }
            : b,
        ),
        sets: on
          ? p.sets.map((s) =>
              s.blueprintId === blueprint!.id
                ? {
                    ...s,
                    fieldKeys: s.fieldKeys.includes(field) ? s.fieldKeys : [...s.fieldKeys, field],
                    fieldTypes:
                      prop === "active"
                        ? { ...s.fieldTypes, [field]: "bool" as const }
                        : s.fieldTypes,
                    cards: s.cards.map((c) => ({
                      ...c,
                      fields: {
                        [field]: prop === "active" ? "true" : fallback,
                        ...c.fields,
                      },
                    })),
                  }
                : s,
            )
          : p.sets,
      };
    });
  }

  function openPropMenu(e: { clientX: number; clientY: number; preventDefault: () => void }, prop: LayerVarProp) {
    if (!selected) return;
    e.preventDefault();
    setMenu({ kind: "prop", x: e.clientX, y: e.clientY, id: selected.id, prop });
  }

  function openBoxMenu(
    e: { clientX: number; clientY: number; preventDefault: () => void },
    key: "x" | "y" | "w" | "h" | "rotation",
  ) {
    if (!selected) return;
    e.preventDefault();
    setMenu({ kind: "box", x: e.clientX, y: e.clientY, id: selected.id, key });
  }

  function patchStyle(partial: Layer["style"]) {
    if (!selected) return;
    updateLayer(selected.id, { style: { ...selected.style, ...partial } }, `style:${selected.id}`);
  }

  function parentForNew(): string | undefined {
    if (!selected) return undefined;
    if (selected.type === "group") return selected.id;
    return selected.parentId;
  }

  function placeNew(layer: Layer): Layer {
    const pid = parentForNew();
    if (!pid) return layer;
    return { ...layer, parentId: pid, x: 2, y: 2, w: Math.min(layer.w, 24), h: Math.min(layer.h, 16) };
  }

  function moveLayer(id: string, dir: 1 | -1) {
    updateTemplate((t) => {
      const block = extractSubtree(t.layers, id);
      if (!block.length) return t;
      const rest = removeSubtree(t.layers, id);
      const siblings = rest.filter((l) => (l.parentId ?? "") === (block[0].parentId ?? ""));
      const cur = siblings.findIndex((l) => l.id === id);
      const swapWith = siblings[cur + dir];
      if (!swapWith) return t;
      const at = rest.findIndex((l) => l.id === swapWith.id);
      const insertAt = dir === 1 ? at + subtreeIds(t.layers, swapWith.id).length : at;
      return { ...t, layers: insertSubtree(rest, block, insertAt) };
    });
  }

  function moveLayerBefore(id: string, beforeId: string) {
    if (id === beforeId) return;
    updateTemplate((t) => {
      const block = extractSubtree(t.layers, id);
      const target = t.layers.find((l) => l.id === beforeId);
      if (!block.length || !target) return t;
      if ((block[0].parentId ?? "") !== (target.parentId ?? "")) return t;
      const rest = removeSubtree(t.layers, id);
      const at = rest.findIndex((l) => l.id === beforeId);
      if (at < 0) return t;
      return { ...t, layers: insertSubtree(rest, block, at) };
    });
  }

  function duplicateLayer(id: string) {
    const block = extractSubtree(template!.layers, id);
    if (!block.length) return;
    const idMap = new Map(block.map((l) => [l.id, uid("ly")]));
    const copies = block.map((l) => ({
      ...structuredClone(l),
      id: idMap.get(l.id)!,
      parentId: l.parentId && idMap.has(l.parentId) ? idMap.get(l.parentId) : l.parentId,
      x: l.x + (l.id === id ? 2 : 0),
      y: l.y + (l.id === id ? 2 : 0),
    }));
    updateTemplate((t) => ({ ...t, layers: [...t.layers, ...copies] }));
    setSelected(idMap.get(id) ?? copies[0].id);
  }

  function groupSelected() {
    const ids = extraIds.length ? extraIds : selectedId ? [selectedId] : [];
    const members = template!.layers.filter((l) => ids.includes(l.id));
    if (!members.length) return;
    const abs = members.map((l) => ({ l, box: absBox(template!.layers, l) }));
    const x = Math.min(...abs.map((a) => a.box.x));
    const y = Math.min(...abs.map((a) => a.box.y));
    const r = Math.max(...abs.map((a) => a.box.x + a.box.w));
    const b = Math.max(...abs.map((a) => a.box.y + a.box.h));
    const group: Layer = {
      id: uid("ly"),
      type: "group",
      name: "组",
      x,
      y,
      w: Math.max(4, r - x),
      h: Math.max(4, b - y),
      visible: true,
      locked: false,
      style: {},
      parentId: members[0].parentId,
    };
    updateTemplate((t) => ({
      ...t,
      layers: [
        group,
        ...t.layers.map((l) => {
          if (!ids.includes(l.id)) return l;
          const box = absBox(t.layers, l);
          return { ...l, parentId: group.id, x: box.x - x, y: box.y - y };
        }),
      ],
    }));
    setSelected(group.id);
    setExtraIds([]);
  }

  function ungroup(id: string) {
    const group = template!.layers.find((l) => l.id === id);
    if (!group || group.type !== "group") return;
    updateTemplate((t) => {
      const g = t.layers.find((l) => l.id === id);
      if (!g) return t;
      return {
        ...t,
        layers: t.layers
          .filter((l) => l.id !== id)
          .map((l) =>
            l.parentId === id ? { ...l, parentId: g.parentId, x: g.x + l.x, y: g.y + l.y } : l,
          ),
      };
    });
  }

  async function applyAsset(layer: Layer, assetId: string, data?: string) {
    patchProject((p) => ({
      ...p,
      assets: data ? { ...p.assets, [assetId]: data } : p.assets,
    }));
    updateLayer(layer.id, { text: assetId });
    setSelected(layer.id);
  }

  async function onDropImage(file: File) {
    try {
      const { id, src } = await ingestImageFile(file, currentPath, current?.assets);
      const created =
        selected && (selected.type === "image" || selected.type === "icon") ? selected : undefined;
      if (created) {
        await applyAsset(created, id, src);
        return;
      }
      const layer = placeNew(defaultLayer("image", template!));
      updateTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
      await applyAsset(layer, id, src);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入图片失败");
    }
  }

  function addText() {
    const layer = placeNew(defaultLayer("text", template!));
    updateTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
    setSelected(layer.id);
  }

  function addShape(shape: LayerShape) {
    const layer = placeNew(defaultLayer("rect", template!, { shape }));
    updateTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
    setSelected(layer.id);
  }

  function addIcon(stockId: string) {
    const stock = STOCK_ICONS.find((i) => i.id === stockId);
    if (!stock) return;
    const assetId = stockIconAssetId(stock.id);
    const layer = placeNew(defaultLayer("icon", template!));
    layer.name = stock.name;
    layer.text = assetId;
    patchProject((p) => ({ ...p, assets: { ...p.assets, [assetId]: stock.src } }));
    updateTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
    setSelected(layer.id);
  }

  async function addImageFile(file: File) {
    try {
      const { id, src } = await ingestImageFile(file, currentPath, current?.assets);
      const layer = placeNew(defaultLayer("image", template!));
      layer.text = id;
      patchProject((p) => ({ ...p, assets: { ...p.assets, [id]: src } }));
      updateTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
      setSelected(layer.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入图片失败");
    }
  }

  function addImageAsset(assetId: string) {
    const layer = placeNew(defaultLayer("image", template!));
    layer.text = assetId;
    updateTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
    setSelected(layer.id);
  }

  function addEmptyImage() {
    const layer = placeNew(defaultLayer("image", template!));
    updateTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
    setSelected(layer.id);
  }

  function addGroup() {
    const layer = placeNew(defaultLayer("group", template!));
    updateTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
    setSelected(layer.id);
  }

  function deleteLayer(id: string) {
    const gone = new Set(subtreeIds(template!.layers, id));
    updateTemplate((t) => ({ ...t, layers: removeSubtree(t.layers, id) }));
    if (selectedId && gone.has(selectedId)) setSelected(null);
    setExtraIds((ids) => ids.filter((x) => !gone.has(x)));
  }

  function unparentOne(layer: Layer) {
    const parent = template!.layers.find((l) => l.id === layer.parentId);
    const nextParentId = parent?.parentId;
    const abs = absBox(template!.layers, layer);
    const rel = toRelative(
      template!.layers.map((l) => (l.id === layer.id ? { ...l, parentId: nextParentId } : l)),
      { ...layer, parentId: nextParentId },
      abs.x,
      abs.y,
    );
    updateLayer(layer.id, { parentId: nextParentId, x: rel.x, y: rel.y });
  }

  const menuLayer = menu ? template.layers.find((l) => l.id === menu.id) : null;
  const bindable = menuLayer ? propsForLayer(menuLayer) : [];
  const canBind = menuLayer ? bindable.filter((p) => !layerVarField(menuLayer, p)) : [];
  const canUnbind = menuLayer ? bindable.filter((p) => layerVarField(menuLayer, p)) : [];
  const menuItems: MenuItem[] =
    menu?.kind === "box"
      ? [{ label: "归零", onClick: () => updateLayer(menu.id, { [menu.key]: 0 }, `box:${menu.id}`) }]
      : menu?.kind === "prop" && menuLayer
      ? [
          layerVarField(menuLayer, menu.prop)
            ? {
                label: `移除变量（${layerVarField(menuLayer, menu.prop)}）`,
                onClick: () => setLayerVar(menuLayer.id, menu.prop, false),
              }
            : {
                label: `转为变量 · ${LAYER_VAR_LABELS[menu.prop]}`,
                onClick: () => setLayerVar(menuLayer.id, menu.prop, true),
              },
        ]
      : menuLayer
        ? [
            { label: "复制", onClick: () => setClipboard(structuredClone(menuLayer)) },
            { label: "再制", onClick: () => duplicateLayer(menuLayer.id) },
            {
              label: extraIds.length ? "将所选成组" : "成组",
              onClick: () => groupSelected(),
            },
            ...(menuLayer.type === "group"
              ? [{ label: "解散组", onClick: () => ungroup(menuLayer.id) }]
              : menuLayer.parentId
                ? [{ label: "移出组", onClick: () => unparentOne(menuLayer) }]
                : []),
            {
              label: "粘贴",
              disabled: !clipboard,
              onClick: () => {
                if (!clipboard) return;
                const copy = { ...structuredClone(clipboard), id: uid("ly"), x: clipboard.x + 2, y: clipboard.y + 2 };
                updateTemplate((t) => ({ ...t, layers: [...t.layers, copy] }));
                setSelected(copy.id);
              },
            },
            {
              label: menuLayer.visible === false ? "显示" : "隐藏",
              onClick: () => updateLayer(menuLayer.id, { visible: menuLayer.visible === false }),
            },
            {
              label: menuLayer.locked ? "解锁" : "锁定",
              onClick: () => updateLayer(menuLayer.id, { locked: !menuLayer.locked }),
            },
            ...(canBind.length
              ? [
                  {
                    label: "转为变量",
                    submenu: canBind.map((p) => ({
                      label: LAYER_VAR_LABELS[p],
                      onClick: () => setLayerVar(menuLayer.id, p, true),
                    })),
                  },
                ]
              : []),
            ...(canUnbind.length
              ? [
                  {
                    label: "移除变量",
                    submenu: canUnbind.map((p) => ({
                      label: `${LAYER_VAR_LABELS[p]}（${layerVarField(menuLayer, p)}）`,
                      onClick: () => setLayerVar(menuLayer.id, p, false),
                    })),
                  },
                ]
              : []),
            {
              label: "重命名",
              onClick: () => {
                const name = window.prompt("图层名称", menuLayer.name);
                if (name) updateLayer(menuLayer.id, { name });
              },
            },
            { label: "上移", onClick: () => moveLayer(menuLayer.id, 1) },
            { label: "下移", onClick: () => moveLayer(menuLayer.id, -1) },
            {
              label: "删除",
              danger: true,
              onClick: () => deleteLayer(menuLayer.id),
            },
          ]
        : [];

  return (
    <div
      className="editor-grid"
      style={{ gridTemplateColumns: `${leftW}px 6px minmax(0, 1fr) 6px ${rightW}px` }}
    >
      <aside className="pane">
        <div className="bp-editor-head">
          <button type="button" className="btn btn-primary btn-small bp-back-btn" onClick={() => setLibraryOpen(true)}>
            <IconReturn />
            返回蓝图库
          </button>
          <input
            className="bp-name-input"
            value={blueprint.name}
            onChange={(e) => updateBlueprint((b) => ({ ...b, name: e.target.value }))}
          />
          <IconBtn title="规格" onClick={() => openSpec(blueprint.id)}>
            <IconGear />
          </IconBtn>
        </div>
        <div className="face-toggle">
          <button className={`btn btn-small ${face === "front" ? "btn-primary" : ""}`} onClick={() => setFace("front")}>
            正面
          </button>
          <button className={`btn btn-small ${face === "back" ? "btn-primary" : ""}`} onClick={() => setFace("back")}>
            背面
          </button>
        </div>
        <h4>图层</h4>
        <div className="hint">拖拽调整层级（同组内）。眼图标 = Active。</div>
        {walkLayerTree(template.layers)
          .filter(({ layer }) => {
            let pid = layer.parentId;
            while (pid) {
              if (collapsed[pid]) return false;
              pid = template.layers.find((l) => l.id === pid)?.parentId;
            }
            return true;
          })
          .map(({ layer, depth }, index) => {
            const childCount = template.layers.filter((l) => l.parentId === layer.id).length;
            const thumbSrc = layerThumbSrc(layer, current.assets);
            return (
          <div
            key={layer.id}
            className={`layer-item ${layer.id === selectedId || extraIds.includes(layer.id) ? "active" : ""} ${dragLayerId === layer.id ? "dragging" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            draggable={!layer.locked}
            onDragStart={(e) => {
              setDragLayerId(layer.id);
              e.dataTransfer.setData("text/layer-id", layer.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDragLayerId(null)}
            onDragOver={(e) => {
              if (!dragLayerId || dragLayerId === layer.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData("text/layer-id") || dragLayerId;
              if (from) moveLayerBefore(from, layer.id);
              setDragLayerId(null);
            }}
            onClick={(e) => {
              if (e.shiftKey) {
                setExtraIds((ids) => (ids.includes(layer.id) ? ids.filter((id) => id !== layer.id) : [...ids, layer.id]));
                return;
              }
              setExtraIds([]);
              setSelected(layer.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setSelected(layer.id);
              setMenu({ kind: "layer", x: e.clientX, y: e.clientY, id: layer.id });
            }}
          >
            <span className="muted" style={{ width: 16 }}>{index + 1}</span>
            {layer.type === "group" && childCount > 0 ? (
              <button
                type="button"
                className="btn btn-small"
                style={{ minWidth: 22, padding: "0 4px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed((c) => ({ ...c, [layer.id]: !c[layer.id] }));
                }}
              >
                {collapsed[layer.id] ? "+" : "−"}
              </button>
            ) : (
              <span style={{ width: 22 }} />
            )}
            {thumbSrc ? (
              <span className="layer-thumb" title={layer.name}>
                <img src={thumbSrc} alt="" />
              </span>
            ) : (
              <>
                <span className="layer-type" title={layer.type}>
                  <LayerTypeIcon type={layer.type} />
                </span>
                <ColorSwatch
                  color={layer.type === "rect" ? layer.style.fill : layer.type === "text" ? layer.style.color : undefined}
                  title={layer.type === "rect" ? "填充" : "文字色"}
                />
              </>
            )}
            <span className="grow">
              {layer.name}
              {layer.type === "group" ? <span className="var-chip">组</span> : null}
              {layer.vars?.active ? <span className="var-chip">active</span> : null}
              {layer.vars && Object.entries(layer.vars).some(([k, v]) => k !== "active" && v) ? (
                <span className="var-chip">变量</span>
              ) : null}
            </span>
            <IconBtn
              className={layer.vars?.active ? "eye-bound" : undefined}
              title={
                layer.vars?.active
                  ? `Active 变量 · ${layer.vars.active}（右键管理）`
                  : layer.visible === false
                    ? "显示 · 右键可绑 Active 变量"
                    : "隐藏 · 右键可绑 Active 变量"
              }
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(layer.id, { visible: layer.visible === false });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelected(layer.id);
                setExtraIds([]);
                setMenu({ kind: "prop", x: e.clientX, y: e.clientY, id: layer.id, prop: "active" });
              }}
            >
              {layer.visible === false ? <IconEyeOff /> : <IconEye />}
            </IconBtn>
            <IconBtn
              title={layer.locked ? "解锁" : "锁定"}
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(layer.id, { locked: !layer.locked });
              }}
            >
              {layer.locked ? <IconLock /> : <IconUnlock />}
            </IconBtn>
          </div>
            );
          })}
        <LayerInsertBar
          assets={current.assets}
          onAddText={addText}
          onAddGroup={addGroup}
          onAddShape={addShape}
          onAddIcon={addIcon}
          onAddImageFile={(file) => void addImageFile(file)}
          onAddImageAsset={addImageAsset}
          onAddEmptyImage={addEmptyImage}
        />
      </aside>
      <div
        className="pane-resizer"
        title="拖拽调整左侧宽度"
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = leftW;
          const move = (ev: PointerEvent) => setLeftW(Math.min(480, Math.max(200, startW + ev.clientX - startX)));
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
      <div className="canvas-wrap">
        <div className="toolbar view-tools">
          <IconBtn title="适合窗口 Home" onClick={() => fitView()}>
            <IconFit />
          </IconBtn>
          <IconBtn title="100% 居中" onClick={() => centerZoom(1)}>
            <IconOne />
          </IconBtn>
          <span className="muted">{Math.round(view.zoom * 100)}%</span>
          <span className="view-sep" />
          <IconBtn title="网格 Ctrl+G" active={view.showGrid} onClick={() => patchView({ showGrid: !view.showGrid })}>
            <IconGrid />
          </IconBtn>
          <IconBtn title="吸附" active={view.snap} onClick={() => patchView({ snap: !view.snap })}>
            <IconSnap />
          </IconBtn>
          <IconBtn title="出血线" active={view.showBleed} onClick={() => patchView({ showBleed: !view.showBleed })}>
            <IconBleed />
          </IconBtn>
          <IconBtn
            title={view.cropBleed ? "显示出血区域" : "剔除出血（只看裁切内）"}
            active={view.cropBleed}
            onClick={() => patchView({ cropBleed: !view.cropBleed })}
          >
            <IconCropBleed />
          </IconBtn>
          <IconBtn title="安全区" active={view.showSafe} onClick={() => patchView({ showSafe: !view.showSafe })}>
            <IconSafe />
          </IconBtn>
          <IconBtn title="裁切线" active={view.showCut} onClick={() => patchView({ showCut: !view.showCut })}>
            <IconCut />
          </IconBtn>
          <label className="dpi-field" title="网格间距">
            网格
            <input
              type="number"
              min={1}
              max={20}
              step={0.5}
              value={view.gridMm}
              onChange={(e) => patchView({ gridMm: Number(e.target.value) || 5 })}
            />
            <span>mm</span>
          </label>
          <label className="dpi-field" title="网格色">
            <input
              type="color"
              value={view.gridColor.slice(0, 7)}
              onChange={(e) => patchView({ gridColor: `${e.target.value}55` })}
            />
          </label>
          <span className="view-sep" />
          <DpiField value={previewDpi} onCommit={setPreviewDpi} />
        </div>
        <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
          <CardFlipStage face={face}>
            {(live) => {
              const liveTpl = templateFromBlueprint(blueprint, live);
              return (
                <CardCanvas
                  template={liveTpl}
                  project={current}
                  fields={EMPTY_FIELDS}
                  dpi={previewDpi}
                  selectedId={live === face ? selectedId : null}
                  extraIds={live === face ? extraIds : []}
                  onSelect={(id, opts) => {
                    if (!id) {
                      setSelected(null);
                      setExtraIds([]);
                      return;
                    }
                    if (opts?.toggle) {
                      if (id === selectedId) {
                        if (extraIds.length) {
                          const [next, ...rest] = extraIds;
                          setSelected(next);
                          setExtraIds(rest);
                        }
                        return;
                      }
                      setExtraIds((ids) =>
                        ids.includes(id) ? ids.filter((x) => x !== id) : selectedId ? [...ids, id] : ids,
                      );
                      if (!selectedId) setSelected(id);
                      return;
                    }
                    setSelected(id);
                    setExtraIds([]);
                  }}
                  onChangeLayer={updateLayer}
                  onDropImage={onDropImage}
                  honorVisibleWhen={false}
                />
              );
            }}
          </CardFlipStage>
        </div>
      </div>
      <div
        className="pane-resizer"
        title="拖拽调整右侧宽度"
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = rightW;
          const move = (ev: PointerEvent) => setRightW(Math.min(520, Math.max(260, startW - (ev.clientX - startX))));
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
      <aside className="pane pane-right">
        {selected ? (
          <>
            <h4>图层属性</h4>
            <div className="form" style={{ padding: "0 14px 20px" }}>
              <div className="field">
                <label>图层名称</label>
                <input value={selected.name} onChange={(e) => updateLayer(selected.id, { name: e.target.value })} />
                <p className="hint" style={{ padding: 0 }}>
                  名称只是图层标签。要进数据集请右键属性「转为变量」。
                </p>
              </div>
              <div className="row">
                {(["x", "y", "w", "h"] as const).map((key) => (
                  <div className="field grow" key={key} onContextMenu={(e) => openBoxMenu(e, key)}>
                    <label>
                      {key}
                      {selected.parentId && (key === "x" || key === "y") ? " · 相对父组" : ""}
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={roundMm(selected[key])}
                      onChange={(e) => updateLayer(selected.id, { [key]: Number(e.target.value) }, `box:${selected.id}`)}
                    />
                  </div>
                ))}
              </div>
              <div className="field" onContextMenu={(e) => openBoxMenu(e, "rotation")}>
                <label>旋转 °</label>
                <input
                  type="number"
                  value={selected.rotation ?? 0}
                  onChange={(e) => updateLayer(selected.id, { rotation: Number(e.target.value) }, `rot:${selected.id}`)}
                />
              </div>
              {selected.vars?.active ? (
                <p className="hint" style={{ padding: "0 0 8px" }}>
                  Active 已绑变量「{selected.vars.active}」。在眼睛图标上右键可移除。
                </p>
              ) : (
                <p className="hint" style={{ padding: "0 0 8px" }}>
                  在左侧眼睛图标上<strong>右键</strong>可把 Active 转为数据集 bool 变量。
                </p>
              )}
              {selected.type === "text" && (
                <>
                  <div className="field" onContextMenu={(e) => openPropMenu(e, "text")}>
                    <label>
                      预览 / 默认文本
                      {layerVarField(selected, "text") ? (
                        <span className="var-chip">变量 · {layerVarField(selected, "text")}</span>
                      ) : null}
                    </label>
                    <textarea
                      value={selected.text ?? ""}
                      onChange={(e) => updateLayer(selected.id, { text: e.target.value }, `text:${selected.id}`)}
                    />
                    <p className="hint" style={{ padding: 0 }}>
                      右键可转为变量。转之前只是蓝图默认字，不会出现在数据集。
                    </p>
                  </div>
                  <TextStyleBar
                    layer={selected}
                    fonts={fonts}
                    onStyle={patchStyle}
                    onUploadFont={() => fontRef.current?.click()}
                    boundColor={layerVarField(selected, "color")}
                    boundBackground={layerVarField(selected, "background")}
                    onColorMenu={(e) => openPropMenu(e, "color")}
                    onBackgroundMenu={(e) => openPropMenu(e, "background")}
                  />
                  <input
                    ref={fontRef}
                    hidden
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const data = await readFileAsDataUrl(file);
                      const id = uid("font");
                      const family = file.name.replace(/\.[^.]+$/, "") || id;
                      patchProject((p) => ({
                        ...p,
                        assets: { ...p.assets, [id]: data },
                        fonts: [...(p.fonts ?? []), { id, family, assetId: id }],
                      }));
                      const next = {
                        ...current,
                        assets: { ...current.assets, [id]: data },
                        fonts: [...(current.fonts ?? []), { id, family, assetId: id }],
                      };
                      await applyProjectFonts(next);
                      patchStyle({ fontFamily: family });
                    }}
                  />
                  <p className="hint">可用标签：{"<b> <i> <u> <s> <mark> <sub> <sup> <color=#rrggbbaa> <size=4> <br>"}，以及 {"{变量}"}。</p>
                </>
              )}
              <div className="field">
                <label>不透明度</label>
                <div className="row" style={{ alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    style={{ width: 72, flex: "0 0 auto" }}
                    value={Math.round((selected.style.opacity ?? 1) * 100)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isNaN(n)) return;
                      patchStyle({ opacity: Math.min(1, Math.max(0, n / 100)) });
                    }}
                  />
                  <span className="hint" style={{ padding: 0, flex: "0 0 auto" }}>
                    %
                  </span>
                  <input
                    type="range"
                    className="grow"
                    min={0}
                    max={100}
                    value={Math.round((selected.style.opacity ?? 1) * 100)}
                    onChange={(e) => patchStyle({ opacity: Number(e.target.value) / 100 })}
                  />
                </div>
              </div>
              {selected.type === "rect" && (
                <>
                  <div className="field">
                    <label>图形</label>
                    <div className="shape-grid compact">
                      {LAYER_SHAPES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`shape-swatch ${ (selected.style.shape ?? "round") === s.id ? "active" : ""}`}
                          title={s.name}
                          onClick={() => patchStyle({ shape: s.id })}
                        >
                          <span>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <ColorField
                    label="填充"
                    value={selected.style.fill}
                    onChange={(hex) => patchStyle({ fill: hex })}
                    boundField={layerVarField(selected, "fill")}
                    onContextMenu={(e) => openPropMenu(e, "fill")}
                  />
                  <ColorField
                    label="描边"
                    value={selected.style.stroke}
                    fallback="#00000000"
                    onChange={(hex) => patchStyle({ stroke: hex })}
                    boundField={layerVarField(selected, "stroke")}
                    onContextMenu={(e) => openPropMenu(e, "stroke")}
                  />
                  <div className="field">
                    <label>描边 mm</label>
                    <input type="number" step={0.05} value={selected.style.strokeWidthMm ?? 0} onChange={(e) => patchStyle({ strokeWidthMm: Number(e.target.value) })} />
                  </div>
                </>
              )}
              <ColorField label="投影色" value={selected.style.shadowColor} fallback="#00000000" onChange={(c) => patchStyle({ shadowColor: c })} />
              <div className="row">
                <div className="field grow">
                  <label>投影模糊</label>
                  <input type="number" step={0.1} value={selected.style.shadowBlurMm ?? 0} onChange={(e) => patchStyle({ shadowBlurMm: Number(e.target.value) })} />
                </div>
                <div className="field grow">
                  <label>投影 X</label>
                  <input type="number" step={0.1} value={selected.style.shadowXMm ?? 0} onChange={(e) => patchStyle({ shadowXMm: Number(e.target.value) })} />
                </div>
                <div className="field grow">
                  <label>投影 Y</label>
                  <input type="number" step={0.1} value={selected.style.shadowYMm ?? 0} onChange={(e) => patchStyle({ shadowYMm: Number(e.target.value) })} />
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <ColorField label="发光色" value={selected.style.glowColor} fallback="#00000000" onChange={(c) => patchStyle({ glowColor: c })} />
                </div>
                <div className="field grow">
                  <label>发光模糊</label>
                  <input type="number" step={0.1} value={selected.style.glowBlurMm ?? 0} onChange={(e) => patchStyle({ glowBlurMm: Number(e.target.value) })} />
                </div>
              </div>
              <div className="row">
                <div className="field grow">
                  <ColorField label="渐变起" value={selected.style.gradientFrom} fallback="#00000000" onChange={(c) => patchStyle({ gradientFrom: c })} />
                </div>
                <div className="field grow">
                  <ColorField label="渐变止" value={selected.style.gradientTo} fallback="#00000000" onChange={(c) => patchStyle({ gradientTo: c })} />
                </div>
              </div>
              <div className="field">
                <label>渐变角度</label>
                <input type="number" step={1} value={selected.style.gradientAngle ?? 90} onChange={(e) => patchStyle({ gradientAngle: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>
                  对齐 / 分布
                  {extraIds.length ? `（选中 ${1 + extraIds.length} 层，相对选区）` : "（单层相对画布 · Shift 多选）"}
                </label>
                <div className="toolbar">
                  {(["left", "center", "right", "top", "middle", "bottom"] as const).map((m) => (
                    <button key={m} className="btn btn-small" onClick={() => alignSelected(m)}>
                      {{ left: "左", center: "水平中", right: "右", top: "上", middle: "垂直中", bottom: "下" }[m]}
                    </button>
                  ))}
                  <button className="btn btn-small" onClick={() => alignSelected("spreadX")}>水平等距</button>
                  <button className="btn btn-small" onClick={() => alignSelected("spreadY")}>垂直等距</button>
                  <button className="btn btn-small" onClick={() => alignSelected("safe")}>安全区</button>
                  <button className="btn btn-small" onClick={() => alignSelected("cut")}>裁切区</button>
                </div>
              </div>
              {(selected.type === "image" || selected.type === "icon") && (
                <>
                  <div className="field">
                    <label>{selected.type === "icon" ? "图标" : "图片"}</label>
                    <div className="toolbar" style={{ padding: 0 }}>
                      <button type="button" className="btn btn-small btn-primary" onClick={() => imageRef.current?.click()}>
                        选择本地图片
                      </button>
                    </div>
                    <input
                      className="mono-input"
                      style={{ marginTop: 8 }}
                      value={selected.text ?? ""}
                      placeholder="资源 id"
                      onChange={(e) => updateLayer(selected.id, { text: e.target.value }, `src:${selected.id}`)}
                    />
                    {selected.text && current.assets[selected.text] ? (
                      <p className="hint" style={{ padding: "4px 0 0", wordBreak: "break-all" }}>
                        {current.assets[selected.text].startsWith("/__fs/file")
                          ? decodeURIComponent(
                              current.assets[selected.text].split("p=")[1] ?? current.assets[selected.text],
                            )
                          : current.assets[selected.text].startsWith("data:")
                            ? "（内存数据，保存时写入 assets/images）"
                            : current.assets[selected.text]}
                      </p>
                    ) : null}
                    <input
                      ref={imageRef}
                      hidden
                      type="file"
                      accept="image/*,.psd,image/vnd.adobe.photoshop"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          const { id, src } = await ingestImageFile(file, currentPath, current?.assets);
                          await applyAsset(selected, id, src);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "导入图片失败");
                        }
                      }}
                    />
                  </div>
                  {selected.type === "icon" && (
                    <div className="field">
                      <label>示例图标</label>
                      <div className="icon-grid compact">
                        {STOCK_ICONS.map((icon) => (
                          <button
                            key={icon.id}
                            type="button"
                            className="icon-swatch"
                            title={icon.name}
                            onClick={() => {
                              const assetId = stockIconAssetId(icon.id);
                              patchProject((p) => ({ ...p, assets: { ...p.assets, [assetId]: icon.src } }));
                              void applyAsset(selected, assetId);
                            }}
                          >
                            <img src={icon.src} alt="" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="field">
                    <label>适应</label>
                    <select value={selected.style.fit ?? "cover"} onChange={(e) => patchStyle({ fit: e.target.value as "cover" | "contain" })}>
                      <option value="cover">铺满</option>
                      <option value="contain">完整</option>
                    </select>
                  </div>
                  {selected.type === "icon" && (
                    <div className="field">
                      <ColorField
                        label="着色"
                        value={selected.style.tint}
                        fallback="#ffffff"
                        onChange={(c) => patchStyle({ tint: c })}
                      />
                    </div>
                  )}
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={selected.type === "icon" ? selected.style.knockout !== false : !!selected.style.knockout}
                      onChange={(e) => patchStyle({ knockout: e.target.checked })}
                    />
                    抠除底色（只留图案，露出下层）
                  </label>
                  <p
                    className="hint"
                    onContextMenu={(e) => openPropMenu(e, "src")}
                    style={{ cursor: "context-menu" }}
                  >
                    {layerVarField(selected, "src")
                      ? `图片已是变量「${layerVarField(selected, "src")}」。拖图写入该列。`
                      : "右键「图片」可转为变量，之后拖图才会进数据集。"}
                    {layerVarField(selected, "repeat")
                      ? ` 重复次数变量：${layerVarField(selected, "repeat")}。`
                      : " 右键图层可选「重复次数」变量。"}
                  </p>
                </>
              )}
              <div className="toolbar">
                <IconBtn title="下移" disabled={template.layers[0]?.id === selected.id} onClick={() => moveLayer(selected.id, -1)}>
                  <IconDown />
                </IconBtn>
                <IconBtn title="上移" disabled={template.layers.at(-1)?.id === selected.id} onClick={() => moveLayer(selected.id, 1)}>
                  <IconUp />
                </IconBtn>
                <IconBtn title="再制 Ctrl+D" onClick={() => duplicateLayer(selected.id)}>
                  <IconPlus />
                </IconBtn>
                <IconBtn title="删除" danger onClick={() => deleteLayer(selected.id)}>
                  <IconTrash />
                </IconBtn>
              </div>
            </div>
          </>
        ) : (
          <p className="hint">滚轮缩放，右键拖拽平移。把图片拖到画布可替换插图。按 ? 查看快捷键。</p>
        )}
      </aside>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}
