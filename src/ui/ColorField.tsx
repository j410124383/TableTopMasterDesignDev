import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  formatCss,
  formatHex6,
  hsvaToRgba,
  parseColor,
  rgbaToHsva,
  type Hsva,
  type Rgba,
} from "@/lib/color";
import { ColorSwatch } from "./ColorSwatch";

type Mode = "hsv" | "rgb";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** Unity 风格：色块 → 弹出色盘（HSV/RGB + Alpha） */
export function ColorField({
  label,
  value,
  fallback = "#333333",
  onChange,
  onContextMenu,
  boundField,
}: {
  label: string;
  value?: string;
  fallback?: string;
  onChange: (css: string) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  boundField?: string;
}) {
  const parsed = parseColor(value) ?? parseColor(fallback) ?? { r: 51, g: 51, b: 51, a: 1 };
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="field color-field" ref={rootRef} onContextMenu={onContextMenu}>
      {label ? (
        <label>
          {label}
          {boundField ? <span className="var-chip">变量 · {boundField}</span> : null}
        </label>
      ) : null}
      <button
        type="button"
        className="color-swatch-btn"
        title={formatCss(parsed)}
        onClick={() => setOpen((v) => !v)}
      >
        <ColorSwatch color={formatCss(parsed)} size={28} />
        <span className="color-swatch-hex">{formatCss(parsed)}</span>
      </button>
      {open ? (
        <ColorPickerPopover
          value={parsed}
          onChange={(c) => onChange(formatCss(c))}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ColorPickerPopover({
  value,
  onChange,
  onClose,
}: {
  value: Rgba;
  onChange: (c: Rgba) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("hsv");
  const [hsva, setHsva] = useState<Hsva>(() => rgbaToHsva(value));
  const svRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHsva(rgbaToHsva(value));
  }, [value.r, value.g, value.b, value.a]);

  function commit(next: Hsva) {
    setHsva(next);
    onChange(hsvaToRgba(next));
  }

  function pickSv(clientX: number, clientY: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp01((clientX - rect.left) / rect.width);
    const v = clamp01(1 - (clientY - rect.top) / rect.height);
    commit({ ...hsva, s, v });
  }

  const hueColor = formatHex6(hsvaToRgba({ h: hsva.h, s: 1, v: 1, a: 1 }));
  const rgba = hsvaToRgba(hsva);

  return (
    <div className="color-popover" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
      <div
        ref={svRef}
        className="color-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          pickSv(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pickSv(e.clientX, e.clientY);
        }}
      >
        <span
          className="color-sv-knob"
          style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%`, background: formatHex6(rgba) }}
        />
      </div>

      <label className="color-slider-row">
        <span>H</span>
        <input
          type="range"
          min={0}
          max={360}
          value={Math.round(hsva.h)}
          onChange={(e) => commit({ ...hsva, h: Number(e.target.value) })}
          className="color-hue-range"
        />
      </label>
      <label className="color-slider-row">
        <span>A</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(hsva.a * 100)}
          onChange={(e) => commit({ ...hsva, a: Number(e.target.value) / 100 })}
          className="color-alpha-range"
          style={{
            background: `linear-gradient(to right, transparent 0%, ${formatHex6(rgba)} 100%),
              repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 10px 10px`,
          }}
        />
        <em>{Math.round(hsva.a * 100)}%</em>
      </label>

      <div className="color-mode-tabs">
        <button type="button" className={mode === "hsv" ? "on" : ""} onClick={() => setMode("hsv")}>
          HSV
        </button>
        <button type="button" className={mode === "rgb" ? "on" : ""} onClick={() => setMode("rgb")}>
          RGB
        </button>
      </div>

      {mode === "hsv" ? (
        <div className="color-num-row">
          {(["h", "s", "v"] as const).map((key) => (
            <label key={key}>
              {key.toUpperCase()}
              <input
                type="number"
                min={0}
                max={key === "h" ? 360 : 100}
                value={Math.round(key === "h" ? hsva.h : hsva[key] * 100)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (key === "h") commit({ ...hsva, h: n });
                  else commit({ ...hsva, [key]: clamp01(n / 100) });
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="color-num-row">
          {(["r", "g", "b"] as const).map((key) => (
            <label key={key}>
              {key.toUpperCase()}
              <input
                type="number"
                min={0}
                max={255}
                value={Math.round(rgba[key])}
                onChange={(e) => {
                  const next = { ...rgba, [key]: Number(e.target.value) };
                  commit(rgbaToHsva(next));
                }}
              />
            </label>
          ))}
        </div>
      )}

      <div className="color-hex-row">
        <input
          spellCheck={false}
          value={formatCss(rgba)}
          onChange={(e) => {
            const next = parseColor(e.target.value);
            if (next) {
              setHsva(rgbaToHsva(next));
              onChange(next);
            }
          }}
        />
        <button type="button" className="btn btn-small" onClick={onClose}>
          完成
        </button>
      </div>
    </div>
  );
}

export { ColorSwatch } from "./ColorSwatch";
export { parseColor } from "@/lib/color";
