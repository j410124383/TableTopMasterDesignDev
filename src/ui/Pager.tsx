import { useEffect, useState } from "react";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

function pageItems(cur: number, pages: number): (number | "…")[] {
  if (pages <= 9) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, pages, cur - 1, cur, cur + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const n of nums) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("…");
    out.push(n);
  }
  return out;
}

export function Pager({ page, pageSize, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize) return null;
  const cur = Math.min(Math.max(1, page), pages);
  const [draft, setDraft] = useState(String(cur));
  useEffect(() => {
    setDraft(String(cur));
  }, [cur]);

  function jump(raw: string) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) {
      setDraft(String(cur));
      return;
    }
    onChange(Math.min(pages, Math.max(1, n)));
  }

  return (
    <div className="pager toolbar" style={{ justifyContent: "center", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-small" disabled={cur <= 1} onClick={() => onChange(cur - 1)}>
        上一页
      </button>
      {pageItems(cur, pages).map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="muted">
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            className={`btn btn-small ${it === cur ? "btn-primary" : ""}`}
            onClick={() => onChange(it)}
          >
            {it}
          </button>
        ),
      )}
      <button type="button" className="btn btn-small" disabled={cur >= pages} onClick={() => onChange(cur + 1)}>
        下一页
      </button>
      <label className="pager-jump-wrap">
        跳到
        <input
          className="pager-jump"
          type="number"
          min={1}
          max={pages}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              jump(draft);
            }
          }}
          onBlur={() => jump(draft)}
        />
      </label>
      <span className="muted">
        第 {cur} / {pages} 页（共 {total}）
      </span>
    </div>
  );
}

export function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (Math.max(1, page) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
