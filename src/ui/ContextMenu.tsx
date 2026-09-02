import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuItem = {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  color?: string;
  onClick?: () => void;
  submenu?: MenuItem[];
};

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

function clampMenu(x: number, y: number, w: number, h: number) {
  const pad = 8;
  let nx = x;
  let ny = y;
  if (nx + w > window.innerWidth - pad) nx = window.innerWidth - w - pad;
  if (ny + h > window.innerHeight - pad) ny = y - h;
  if (nx < pad) nx = pad;
  if (ny < pad) ny = pad;
  if (ny + h > window.innerHeight - pad) ny = Math.max(pad, window.innerHeight - h - pad);
  return {
    x: nx,
    y: ny,
    subLeft: nx + w + 156 > window.innerWidth,
    subUp: ny + h > window.innerHeight - 120,
  };
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [pos, setPos] = useState({ x, y, subLeft: false, subUp: false });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(clampMenu(x, y, r.width, r.height));
  }, [x, y, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPtr = (e: PointerEvent) => {
      const node = e.target as Node | null;
      if (node && rootRef.current?.contains(node)) return;
      onClose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPtr, true);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPtr, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div ref={rootRef} className="ctx-menu" style={{ left: pos.x, top: pos.y }} role="menu">
      {items.map((item) => (
        <div
          key={item.label}
          className="ctx-row"
          onPointerEnter={() => setOpenSub(item.submenu ? item.label : null)}
        >
          <button
            type="button"
            className={`ctx-item ${item.danger ? "danger" : ""} ${item.submenu ? "has-sub" : ""}`}
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled || item.submenu) return;
              item.onClick?.();
              onClose();
            }}
          >
            {item.color ? <span className="ctx-swatch" style={{ background: item.color || "transparent" }} /> : null}
            <span>{item.label}</span>
            {item.submenu && <span className="ctx-arrow">▸</span>}
          </button>
          {item.submenu && openSub === item.label && (
            <div className={`ctx-submenu ${pos.subLeft ? "flip-left" : ""} ${pos.subUp ? "flip-up" : ""}`}>
              {item.submenu.map((sub) => (
                <button
                  key={sub.label}
                  type="button"
                  className={`ctx-item ${sub.danger ? "danger" : ""}`}
                  disabled={sub.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (sub.disabled) return;
                    sub.onClick?.();
                    onClose();
                  }}
                >
                  {sub.color ? <span className="ctx-swatch" style={{ background: sub.color || "transparent" }} /> : null}
                  <span>{sub.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
