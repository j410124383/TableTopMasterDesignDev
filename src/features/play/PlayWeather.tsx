import { useEffect, useRef } from "react";
import type { WeatherId } from "@/store/playLookStore";

export function PlayWeather({ kind }: { kind: WeatherId }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || kind === "off") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    type Drop = { x: number; y: number; v: number; w: number; h: number; a: number };
    const n = kind === "rain" ? 90 : 70;
    const drops: Drop[] = Array.from({ length: n }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      v: kind === "rain" ? 9 + Math.random() * 10 : 1.2 + Math.random() * 1.8,
      w: kind === "rain" ? 1.2 : 2 + Math.random() * 2.4,
      h: kind === "rain" ? 10 + Math.random() * 14 : 2 + Math.random() * 2.4,
      a: 0.25 + Math.random() * 0.45,
    }));

    const tick = () => {
      if (!alive) return;
      if (!canvas.width || !canvas.height) resize();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const d of drops) {
        d.y += d.v;
        if (kind === "snow") d.x += Math.sin(d.y * 0.02) * 0.7;
        if (d.y > canvas.height + 12) {
          d.y = -12;
          d.x = Math.random() * canvas.width;
        }
        ctx.globalAlpha = d.a;
        ctx.fillStyle = kind === "rain" ? "#9ec9ff" : "#f4f8ff";
        if (kind === "rain") ctx.fillRect(d.x, d.y, d.w, d.h);
        else {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.w, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
    };
  }, [kind]);

  if (kind === "off") return null;
  return <canvas ref={ref} className="play-weather" aria-hidden />;
}
