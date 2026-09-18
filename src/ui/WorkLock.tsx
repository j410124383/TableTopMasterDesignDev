import { useEffect, useState } from "react";

export function WorkLock({
  open,
  title,
  detail,
  progress,
  onCancel,
}: {
  open: boolean;
  title: string;
  detail?: string;
  progress?: { done: number; total: number };
  onCancel?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (!open) {
      setShown(false);
      setSec(0);
      return;
    }
    const showAt = window.setTimeout(() => setShown(true), 80);
    const started = Date.now();
    const tick = window.setInterval(() => setSec(Math.floor((Date.now() - started) / 1000)), 250);
    return () => {
      window.clearTimeout(showAt);
      window.clearInterval(tick);
    };
  }, [open]);

  if (!open || !shown) return null;
  const total = progress && progress.total > 0 ? progress.total : 0;
  const pct = total ? Math.max(0, Math.min(100, Math.round((progress!.done / total) * 100))) : null;

  return (
    <div className="work-lock" role="status" aria-live="polite">
      <div className="work-lock-card">
        <div className={`work-lock-bar ${pct == null ? "indeterminate" : ""}`} style={pct != null ? { width: `${pct}%` } : undefined} />
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
        {total ? (
          <p className="muted">
            {progress!.done} / {total}
          </p>
        ) : null}
        {sec >= 1 ? <p className="muted">已用时 {sec}s</p> : null}
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
        ) : null}
      </div>
    </div>
  );
}
