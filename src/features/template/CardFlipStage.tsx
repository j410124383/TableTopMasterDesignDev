import { useEffect, useRef, useState, type ReactNode } from "react";

type Face = "front" | "back";

export function CardFlipStage({
  face,
  children,
}: {
  face: Face;
  children: (live: Face) => ReactNode;
}) {
  const [shown, setShown] = useState(face);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const pending = useRef(face);

  useEffect(() => {
    pending.current = face;
    if (face === shown) return;
    setPhase("out");
    const mid = window.setTimeout(() => {
      setShown(pending.current);
      setPhase("in");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("idle"));
      });
    }, 280);
    return () => window.clearTimeout(mid);
  }, [face, shown]);

  return (
    <div className="flip-perspective">
      <div
        className={`flip-card ${phase === "out" ? "is-out" : ""} ${phase === "in" ? "is-in" : ""} ${shown === "back" ? "face-back" : "face-front"}`}
        style={{ pointerEvents: phase === "idle" ? "auto" : "none" }}
      >
        <div className="flip-sheen" aria-hidden />
        {children(shown)}
      </div>
    </div>
  );
}
