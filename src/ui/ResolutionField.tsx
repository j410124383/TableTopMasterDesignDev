import { useEffect, useState } from "react";
import { clampRes, RES_MAX, RES_MIN, RES_PRESETS } from "@/features/box/filmGate";

function asText(n: number) {
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "";
}

export function ResolutionField({
  width,
  height,
  onChange,
}: {
  width?: number;
  height?: number;
  onChange: (w: number, h: number) => void;
}) {
  const w = clampRes(width ?? 1920);
  const h = clampRes(height ?? 1080);
  const [wText, setWText] = useState(asText(w));
  const [hText, setHText] = useState(asText(h));
  useEffect(() => setWText(asText(w)), [w]);
  useEffect(() => setHText(asText(h)), [h]);
  const key = `${w}x${h}`;
  const known = RES_PRESETS.some((p) => `${p.w}x${p.h}` === key);

  function commitW(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setWText(asText(w));
      return;
    }
    onChange(clampRes(n), h);
  }
  function commitH(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setHText(asText(h));
      return;
    }
    onChange(w, clampRes(n));
  }

  return (
    <>
      <div className="field">
        <label>分辨率</label>
        <select
          value={known ? key : "custom"}
          onChange={(e) => {
            if (e.target.value === "custom") return;
            const [rw, rh] = e.target.value.split("x").map(Number);
            onChange(clampRes(rw), clampRes(rh));
          }}
        >
          {RES_PRESETS.map((p) => (
            <option key={p.id} value={`${p.w}x${p.h}`}>
              {p.label}
            </option>
          ))}
          <option value="custom">自定义</option>
        </select>
      </div>
      <div className="row">
        <div className="field grow">
          <label>宽</label>
          <input
            type="number"
            min={RES_MIN}
            max={RES_MAX}
            step={1}
            value={wText}
            onChange={(e) => {
              const raw = e.target.value;
              setWText(raw);
              const n = Number(raw);
              if (Number.isFinite(n) && n > 0) onChange(clampRes(n), h);
            }}
            onBlur={(e) => commitW(e.target.value)}
          />
        </div>
        <div className="field grow">
          <label>高</label>
          <input
            type="number"
            min={RES_MIN}
            max={RES_MAX}
            step={1}
            value={hText}
            onChange={(e) => {
              const raw = e.target.value;
              setHText(raw);
              const n = Number(raw);
              if (Number.isFinite(n) && n > 0) onChange(w, clampRes(n));
            }}
            onBlur={(e) => commitH(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}
