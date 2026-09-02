import { formatCss, parseColor } from "@/lib/color";

export function ColorSwatch({
  color,
  title,
  size = 16,
}: {
  color?: string;
  title?: string;
  size?: number;
}) {
  const parsed = parseColor(color);
  const overlay = parsed ? formatCss(parsed) : undefined;
  return (
    <span
      className={`swatch ${parsed ? "" : "empty"}`}
      title={title ?? (overlay || "透明")}
      style={{
        width: size,
        height: size,
      }}
    >
      {overlay && <span className="swatch-fill" style={{ background: overlay }} />}
    </span>
  );
}

export { parseColor };
