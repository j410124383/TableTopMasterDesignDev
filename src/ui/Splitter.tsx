import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from "react";

function readStored(key: string, fallback: number): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 40 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function usePaneSize(key: string, fallback: number) {
  const [size, setSize] = useState(() => readStored(key, fallback));
  const persist = useCallback(
    (next: number) => {
      setSize(next);
      try {
        localStorage.setItem(key, String(Math.round(next)));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [size, persist] as const;
}

type HandleProps = {
  onDelta: (dx: number) => void;
};

export function SplitHandle({ onDelta }: HandleProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    lastX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    if (dx) onDelta(dx);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      className="split-handle"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

type SplitRowProps = {
  children: ReactNode;
  className?: string;
};

export function SplitRow({ children, className }: SplitRowProps) {
  return <div className={`split-row ${className ?? ""}`}>{children}</div>;
}
