import type { PlayStroke } from "./playTypes";

export function PlayDrawLayer({ strokes, width, height }: { strokes: PlayStroke[]; width: number; height: number }) {
  return (
    <svg className="play-ink" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {strokes.map((s) => {
        if (s.tool === "rect" && s.points.length >= 2) {
          const a = s.points[0];
          const b = s.points[s.points.length - 1];
          return (
            <rect
              key={s.id}
              x={Math.min(a.x, b.x)}
              y={Math.min(a.y, b.y)}
              width={Math.abs(b.x - a.x)}
              height={Math.abs(b.y - a.y)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
            />
          );
        }
        if (s.tool === "ellipse" && s.points.length >= 2) {
          const a = s.points[0];
          const b = s.points[s.points.length - 1];
          return (
            <ellipse
              key={s.id}
              cx={(a.x + b.x) / 2}
              cy={(a.y + b.y) / 2}
              rx={Math.abs(b.x - a.x) / 2}
              ry={Math.abs(b.y - a.y) / 2}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
            />
          );
        }
        if (s.tool === "line" && s.points.length >= 2) {
          const a = s.points[0];
          const b = s.points[s.points.length - 1];
          return <line key={s.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={s.color} strokeWidth={s.width} />;
        }
        const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
        return <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" />;
      })}
    </svg>
  );
}
