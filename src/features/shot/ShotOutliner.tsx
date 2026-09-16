import { useState, type MouseEvent } from "react";
import type { ProductShotItem, Project, ShotCamera } from "@/model/types";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { IconBoard, IconBox, IconCamera, IconCards, IconLayers } from "@/ui/Icons";

type Row = { id: string; name: string; looking?: boolean };

function Group({
  title,
  Icon,
  rows,
  selectedId,
  onSelect,
  onMenu,
}: {
  title: string;
  Icon: (p: { size?: number }) => ReturnType<typeof IconCamera>;
  rows: Row[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMenu: (e: MouseEvent, id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="shot-ol-group">
      <span>{title}</span>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          className={`shot-ol-row ${selectedId === row.id ? "active" : ""}`}
          onClick={() => onSelect(row.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            onSelect(row.id);
            onMenu(e, row.id);
          }}
        >
          <Icon size={13} />
          <span className="shot-ol-name">{row.name}</span>
          {row.looking ? <span className="shot-ol-dot" title="看穿" /> : null}
        </button>
      ))}
    </div>
  );
}

export function ShotOutliner({
  project,
  items,
  cameras,
  lookThroughId,
  selectedId,
  onSelect,
  onLookThrough,
  onRename,
  onDelete,
}: {
  project: Project;
  items: ProductShotItem[];
  cameras: ShotCamera[];
  lookThroughId?: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLookThrough: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  function nameOf(item: ProductShotItem): string {
    if (!item.refId) return "空槽";
    if (item.kind === "box") return (project.boxes ?? []).find((b) => b.id === item.refId)?.name ?? "包装盒";
    if (item.kind === "board") {
      const piece = (project.boards ?? []).find((b) => b.id === item.refId);
      if (piece) return piece.name;
      const bp = project.blueprints.find((b) => b.id === item.refId);
      if (bp) return bp.name;
      return "板件（丢失）";
    }
    if (item.kind === "stack") return project.sets.find((s) => s.id === item.refId)?.name ?? "卡牌集";
    return project.blueprints.find((b) => b.id === item.refId)?.name ?? "卡牌";
  }

  const isCam = (id: string) => cameras.some((c) => c.id === id);
  const menuItems: MenuItem[] = menu
    ? [
        ...(isCam(menu.id)
          ? [{ label: "贴合视角", onClick: () => onLookThrough(menu.id) }]
          : []),
        {
          label: "重命名",
          onClick: () => {
            const cur = isCam(menu.id)
              ? cameras.find((c) => c.id === menu.id)?.name
              : nameOf(items.find((it) => it.id === menu.id)!);
            const next = window.prompt("名称", cur ?? "");
            if (next?.trim()) onRename(menu.id, next.trim());
          },
        },
        { label: "删除", danger: true, onClick: () => onDelete(menu.id) },
      ]
    : [];

  return (
    <div className="shot-outliner">
      <h3>大纲</h3>
      <Group
        title="摄像机"
        Icon={IconCamera}
        rows={cameras.map((c) => ({ id: c.id, name: c.name, looking: c.id === lookThroughId }))}
        selectedId={selectedId}
        onSelect={onSelect}
        onMenu={(e, id) => setMenu({ x: e.clientX, y: e.clientY, id })}
      />
      <Group
        title="包装盒"
        Icon={IconBox}
        rows={items.filter((it) => it.kind === "box").map((it) => ({ id: it.id, name: nameOf(it) }))}
        selectedId={selectedId}
        onSelect={onSelect}
        onMenu={(e, id) => setMenu({ x: e.clientX, y: e.clientY, id })}
      />
      <Group
        title="卡牌"
        Icon={IconLayers}
        rows={items.filter((it) => it.kind === "card").map((it) => ({ id: it.id, name: nameOf(it) }))}
        selectedId={selectedId}
        onSelect={onSelect}
        onMenu={(e, id) => setMenu({ x: e.clientX, y: e.clientY, id })}
      />
      <Group
        title="卡牌集"
        Icon={IconCards}
        rows={items.filter((it) => it.kind === "stack").map((it) => ({ id: it.id, name: nameOf(it) }))}
        selectedId={selectedId}
        onSelect={onSelect}
        onMenu={(e, id) => setMenu({ x: e.clientX, y: e.clientY, id })}
      />
      <Group
        title="板件"
        Icon={IconBoard}
        rows={items.filter((it) => it.kind === "board").map((it) => ({ id: it.id, name: nameOf(it) }))}
        selectedId={selectedId}
        onSelect={onSelect}
        onMenu={(e, id) => setMenu({ x: e.clientX, y: e.clientY, id })}
      />
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
