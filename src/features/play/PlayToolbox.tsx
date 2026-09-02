import { createPortal } from "react-dom";
import { useEffect, useState, type PointerEvent } from "react";
import { calcPress, formatMmSs, PROP_GROUPS, propBox, rollDie, timerRemain } from "./playProps";
import { TABLE_PRESETS, type TablePresetId } from "./playTable";
import { CHIP_COLORS, CUBE_COLORS, TOKEN_SHAPES, type PlayProp, type PlayPropKind } from "./playTypes";

type DockProps = {
  onDrop: (kind: PlayPropKind, extra: Partial<PlayProp> | undefined, clientX: number, clientY: number) => void;
  dealN: number;
  onDealN: (n: number) => void;
  onDealEach: () => void;
  onDrawOneEach: () => void;
  onPassHands: () => void;
  onReturnHands: () => void;
  tablePreset: TablePresetId;
  tableCustom: { w: number; h: number };
  onTablePreset: (id: TablePresetId) => void;
  onTableCustom: (w: number, h: number) => void;
  docked?: boolean;
  onClose?: () => void;
};

export function PlayToolbox({
  onDrop,
  dealN,
  onDealN,
  onDealEach,
  onDrawOneEach,
  onPassHands,
  onReturnHands,
  tablePreset,
  tableCustom,
  onTablePreset,
  onTableCustom,
  docked,
  onClose,
}: DockProps) {
  const [tab, setTab] = useState<"props" | "table">("props");
  const [openGroup, setOpenGroup] = useState<string | null>("chip");
  const [ghost, setGhost] = useState<{ name: string; x: number; y: number } | null>(null);

  function beginDrag(
    e: PointerEvent<HTMLButtonElement>,
    item: (typeof PROP_GROUPS)[number]["items"][number],
  ) {
    e.preventDefault();
    e.stopPropagation();
    setGhost({ name: item.name, x: e.clientX, y: e.clientY });
    const move = (ev: globalThis.PointerEvent) => {
      setGhost({ name: item.name, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      onDrop(item.kind, item.extra, ev.clientX, ev.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <>
    <aside className={docked ? "play-review-dock play-tools-dock" : "play-tools"} onPointerDown={(e) => e.stopPropagation()}>
      {docked && (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>道具 / 桌面</strong>
          <button type="button" className="btn btn-small" onClick={onClose}>
            关闭
          </button>
        </div>
      )}
      <div className="play-tool-tabs">
        <button type="button" className={tab === "props" ? "active" : ""} onClick={() => setTab("props")}>
          道具
        </button>
        <button type="button" className={tab === "table" ? "active" : ""} onClick={() => setTab("table")}>
          桌面
        </button>
      </div>
      {tab === "props" ? (
        <div className="play-tool-groups">
          <p className="muted play-tool-hint">拖到牌桌上松开即可放下</p>
          {PROP_GROUPS.map((g) => (
            <div key={g.id} className="play-tool-group">
              <button
                type="button"
                className={`play-tool-group-btn ${openGroup === g.id ? "open" : ""}`}
                onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
              >
                {g.name}
                <span>{openGroup === g.id ? "▾" : "▸"}</span>
              </button>
              {openGroup === g.id &&
                g.items.map((item) => (
                  <button
                    key={`${item.kind}-${item.name}`}
                    type="button"
                    className="play-tool-btn"
                    title={item.hint}
                    onPointerDown={(e) => beginDrag(e, item)}
                  >
                    {item.name}
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          <label className="play-tool-field">
            桌子大小
            <select value={tablePreset} onChange={(e) => onTablePreset(e.target.value as TablePresetId)}>
              {TABLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {tablePreset === "custom" && (
            <div className="row">
              <input
                type="number"
                min={800}
                value={tableCustom.w}
                onChange={(e) => onTableCustom(Number(e.target.value) || 1680, tableCustom.h)}
              />
              <input
                type="number"
                min={500}
                value={tableCustom.h}
                onChange={(e) => onTableCustom(tableCustom.w, Number(e.target.value) || 980)}
              />
            </div>
          )}
          <label className="play-tool-field">
            每人张数
            <input type="number" min={1} max={20} value={dealN} onChange={(e) => onDealN(Number(e.target.value) || 1)} />
          </label>
          <button type="button" className="play-tool-btn" onClick={onDealEach}>
            每位玩家发牌
          </button>
          <button type="button" className="play-tool-btn" onClick={onDrawOneEach}>
            各抽 1 张
          </button>
          <button type="button" className="play-tool-btn" onClick={onPassHands}>
            轮换传递手牌
          </button>
          <button type="button" className="play-tool-btn" onClick={onReturnHands}>
            手牌收回牌库
          </button>
        </>
      )}
    </aside>
    {ghost &&
      createPortal(
        <div className="play-tool-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.name}
        </div>,
        document.body,
      )}
    </>
  );
}

type ViewProps = {
  prop: PlayProp;
  selected: boolean;
  moving?: boolean;
  onPatch: (id: string, patch: Partial<PlayProp>) => void;
  onPointerDown: (e: PointerEvent, prop: PlayProp) => void;
  onContextMenu?: (e: { clientX: number; clientY: number }, prop: PlayProp) => void;
};

export function PlayPropView({ prop, selected, moving, onPatch, onPointerDown, onContextMenu }: ViewProps) {
  const kind = prop.kind === "treasure" ? "meeple" : prop.kind;
  const sz = propBox(prop);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (prop.kind !== "timer" || !prop.running) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [prop.kind, prop.running]);

  const remain = timerRemain(prop, now);
  const noteSize = prop.fontSize ?? 13;
  const noteFont =
    prop.fontFamily === "serif"
      ? '"Songti SC", SimSun, "Noto Serif SC", serif'
      : prop.fontFamily === "kai"
        ? 'KaiTi, STKaiti, "KaiTi SC", serif'
        : prop.fontFamily === "mono"
          ? "ui-monospace, Consolas, monospace"
          : '"Segoe UI Variable", "PingFang SC", "Microsoft YaHei", sans-serif';

  function beginScale(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const start = prop.scale ?? 1;
    const move = (ev: globalThis.PointerEvent) => {
      const next = Math.min(2.8, Math.max(0.45, start + (startY - ev.clientY) / 140));
      onPatch(prop.id, { scale: Math.round(next * 100) / 100 });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      className={`play-prop play-prop-${kind} ${kind === "note" ? "play-prop-note" : ""} ${selected ? "selected" : ""} ${prop.rolling ? "rolling" : ""} ${moving ? "dragging" : ""}`}
      data-prop-id={prop.id}
      style={{ left: prop.x, top: prop.y, zIndex: prop.z, width: sz.w, height: sz.h }}
      onPointerDown={(e) => onPointerDown(e, prop)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, prop);
      }}
    >
      <div className="play-prop-grip" />
      {kind === "d6" || kind === "d20" ? (
        <button
          type="button"
          className="play-die"
          onClick={(e) => {
            e.stopPropagation();
            const sides = kind === "d20" ? 20 : 6;
            onPatch(prop.id, { rolling: true });
            window.setTimeout(() => {
              onPatch(prop.id, { rolling: false, value: rollDie(sides) });
            }, 520);
          }}
        >
          <span className="play-die-face">{prop.value ?? 1}</span>
          <span className="play-die-kind">{kind === "d20" ? "D20" : "D6"}</span>
        </button>
      ) : null}
      {kind === "timer" ? (
        <div className="play-timer" onPointerDown={(e) => e.stopPropagation()}>
          <div className={`play-timer-read ${remain === 0 && prop.running ? "done" : ""}`}>{formatMmSs(remain)}</div>
          <div className="play-timer-row">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                if (prop.running) {
                  onPatch(prop.id, { running: false, value: remain, endsAt: undefined });
                } else {
                  const sec = remain || prop.value || 60;
                  onPatch(prop.id, { running: true, value: sec, endsAt: Date.now() + sec * 1000 });
                }
              }}
            >
              {prop.running ? "暂停" : "开始"}
            </button>
            <button type="button" className="btn btn-small" onClick={() => onPatch(prop.id, { running: false, value: 60, endsAt: undefined })}>
              重置
            </button>
          </div>
          <div className="play-timer-row">
            {[30, 60, 90, 180].map((s) => (
              <button key={s} type="button" className="btn btn-small" onClick={() => onPatch(prop.id, { running: false, value: s, endsAt: undefined })}>
                {s < 60 ? `${s}s` : `${s / 60}m`}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {kind === "note" ? (
        <div className="play-note" onPointerDown={(e) => e.stopPropagation()}>
          <input className="play-note-title" value={prop.label ?? "便签"} onChange={(e) => onPatch(prop.id, { label: e.target.value })} />
          <textarea
            value={prop.text ?? ""}
            placeholder="记规则、回合、点数…"
            style={{ fontSize: noteSize, fontFamily: noteFont }}
            onChange={(e) => onPatch(prop.id, { text: e.target.value })}
          />
        </div>
      ) : null}
      {kind === "cube" ? (
        <button
          type="button"
          className={`play-cube shape-${prop.shape ?? "square"}`}
          style={{
            background: prop.color ?? "#ff3b3b",
            color: ["#d6ff3c", "#7dffb3", "#f4f4f0"].includes(prop.color ?? "") ? "#111114" : "#fff",
          }}
          title="右键改形状和颜色"
        />
      ) : null}
      {kind === "life" ? (
        <div className="play-life" onPointerDown={(e) => e.stopPropagation()}>
          <span>{prop.label ?? "生命"}</span>
          <strong>{prop.value ?? 20}</strong>
          <div className="row">
            <button type="button" className="btn btn-small" onClick={() => onPatch(prop.id, { value: (prop.value ?? 20) - 1 })}>
              -1
            </button>
            <button type="button" className="btn btn-small" onClick={() => onPatch(prop.id, { value: (prop.value ?? 20) + 1 })}>
              +1
            </button>
          </div>
        </div>
      ) : null}
      {kind === "meeple" ? (
        <div className="play-meeple" style={{ color: prop.color ?? "#d6ff3c" }} title={prop.label ?? "米宝"}>
          <svg viewBox="0 0 40 52" width="100%" height="100%" aria-hidden>
            <circle cx="20" cy="10" r="8" fill="currentColor" />
            <path d="M8 48 L12 22 H28 L32 48 Z" fill="currentColor" />
            <rect x="10" y="20" width="20" height="10" rx="5" fill="currentColor" />
          </svg>
        </div>
      ) : null}
      {kind === "calc" ? (
        <div className="play-calc" onPointerDown={(e) => e.stopPropagation()}>
          <div className="play-calc-read">{prop.text || "0"}</div>
          <div className="play-calc-pad">
            {["C", "⌫", "/", "*", "7", "8", "9", "-", "4", "5", "6", "+", "1", "2", "3", "=", "0", "."].map((k) => (
              <button key={k} type="button" onClick={() => onPatch(prop.id, { text: calcPress(prop.text || "0", k) })}>
                {k}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {kind === "chip" ? (
        <div
          className="play-chip"
          style={{
            background: prop.color ?? CHIP_COLORS[prop.value ?? 10],
            color: (prop.value ?? 10) >= 1000 ? "#f4f4f0" : "#111114",
          }}
        >
          {prop.value ?? 10}
        </div>
      ) : null}
      {kind === "textbox" ? (
        <div className="play-textbox" onPointerDown={(e) => e.stopPropagation()}>
          <textarea
            value={prop.text ?? ""}
            style={{ color: prop.color ?? "#f4f4f0", fontSize: prop.fontSize ?? 18 }}
            onChange={(e) => onPatch(prop.id, { text: e.target.value })}
          />
        </div>
      ) : null}
      {selected && (
        <button type="button" className="play-prop-resize" title="拖动缩放" onPointerDown={beginScale} />
      )}
    </div>
  );
}

export function tokenMenuItems(
  prop: PlayProp,
  onPatch: (id: string, patch: Partial<PlayProp>) => void,
  onDelete: () => void,
) {
  const items: { label: string; danger?: boolean; onClick?: () => void; submenu?: { label: string; onClick: () => void }[] }[] = [];
  if (prop.kind === "cube") {
    items.push({
      label: "形状",
      submenu: TOKEN_SHAPES.map((s) => ({
        label: { square: "方块", circle: "圆形", hex: "六边", triangle: "三角" }[s],
        onClick: () => onPatch(prop.id, { shape: s }),
      })),
    });
    items.push({
      label: "颜色",
      submenu: CUBE_COLORS.map((c) => ({
        label: c,
        onClick: () => onPatch(prop.id, { color: c }),
      })),
    });
  }
  if (prop.kind === "meeple" || prop.kind === "treasure") {
    items.push({
      label: "颜色",
      submenu: CUBE_COLORS.map((c) => ({
        label: c,
        onClick: () => onPatch(prop.id, { color: c }),
      })),
    });
  }
  if (prop.kind === "note" || prop.kind === "textbox") {
    items.push({
      label: "字体大小",
      submenu: [
        { label: "更小", onClick: () => onPatch(prop.id, { fontSize: Math.max(10, (prop.fontSize ?? 13) - 2) }) },
        { label: "更大", onClick: () => onPatch(prop.id, { fontSize: Math.min(36, (prop.fontSize ?? 13) + 2) }) },
      ],
    });
  }
  if (prop.kind === "note") {
    items.push({
      label: "字体",
      submenu: [
        { label: "黑体", onClick: () => onPatch(prop.id, { fontFamily: "sans" }) },
        { label: "宋体", onClick: () => onPatch(prop.id, { fontFamily: "serif" }) },
        { label: "楷体", onClick: () => onPatch(prop.id, { fontFamily: "kai" }) },
        { label: "等宽", onClick: () => onPatch(prop.id, { fontFamily: "mono" }) },
      ],
    });
  }
  if (prop.kind === "textbox") {
    items.push({
      label: "颜色",
      submenu: ["#f4f4f0", "#d6ff3c", "#00f0ff", "#ff2bd6", "#ff8a3c"].map((c) => ({
        label: c,
        onClick: () => onPatch(prop.id, { color: c }),
      })),
    });
  }
  items.push({
    label: "大小",
    submenu: [
      { label: "更小", onClick: () => onPatch(prop.id, { scale: Math.max(0.45, Math.round(((prop.scale ?? 1) - 0.15) * 100) / 100) }) },
      { label: "更大", onClick: () => onPatch(prop.id, { scale: Math.min(2.8, Math.round(((prop.scale ?? 1) + 0.15) * 100) / 100) }) },
      { label: "50%", onClick: () => onPatch(prop.id, { scale: 0.5 }) },
      { label: "100%", onClick: () => onPatch(prop.id, { scale: 1 }) },
      { label: "150%", onClick: () => onPatch(prop.id, { scale: 1.5 }) },
      { label: "200%", onClick: () => onPatch(prop.id, { scale: 2 }) },
    ],
  });
  items.push({ label: "删除道具", danger: true, onClick: onDelete });
  return items;
}
