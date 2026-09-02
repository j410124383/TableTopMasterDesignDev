import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KImage, Layer as KLayer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { mmToPx, pxToMm, roundMm } from "@/lib/mm";
import { absBox, toRelative } from "@/model/layerTree";
import type { Layer, Project, Template } from "@/model/types";
import { renderCardToCanvas } from "@/render/drawCard";
import { cardPixelSize, layerPx } from "@/render/layout";
import { snapLayer } from "@/render/snap";
import { useEditorStore } from "@/store/editorStore";

type Props = {
  template: Template;
  project: Project;
  fields: Record<string, string>;
  dpi: number;
  selectedId: string | null;
  extraIds?: string[];
  onSelect: (id: string | null, opts?: { toggle?: boolean }) => void;
  onChangeLayer: (id: string, patch: Partial<Layer>, mergeKey?: string) => void;
  onDropImage?: (file: File) => void;
  /** 默认 true。蓝图页必须传 false：只看 layer.visible，不套用卡牌集 active / visibleWhen */
  honorVisibleWhen?: boolean;
};

export function CardCanvas({
  template,
  project,
  fields,
  dpi,
  selectedId,
  extraIds = [],
  onSelect,
  onChangeLayer,
  onDropImage,
  honorVisibleWhen = true,
}: Props) {
  const view = useEditorStore((s) => s.view);
  const patchView = useEditorStore((s) => s.patchView);
  const fitView = useEditorStore((s) => s.fitView);
  const setCanvasBox = useEditorStore((s) => s.setCanvasBox);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [panning, setPanning] = useState(false);
  const space = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const axis = useRef<{ x: number; y: number } | null>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const size = useMemo(() => cardPixelSize(template, dpi), [template, dpi]);
  const crop = view.cropBleed;
  const viewW = crop ? size.trimW : size.width;
  const viewH = crop ? size.trimH : size.height;
  const originX = crop ? -size.bleedPx : 0;
  const originY = crop ? -size.bleedPx : 0;
  const prevCrop = useRef(crop);
  const cardFitKey = `${dpi}:${size.width}x${size.height}`;

  const editPad = useMemo(() => {
    const handleMargin = 56;
    const minPad = Math.max(80, Math.round(Math.max(size.width, size.height) * 0.2));
    let minX = 0;
    let minY = 0;
    let maxX = viewW;
    let maxY = viewH;
    for (const layer of template.layers) {
      if (layer.visible === false) continue;
      const box = layerPx(template, layer, dpi);
      const cx = originX + box.x + box.w / 2;
      const cy = originY + box.y + box.h / 2;
      const rad = ((layer.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const hx = box.w / 2;
      const hy = box.h / 2;
      for (const [dx, dy] of [
        [-hx, -hy],
        [hx, -hy],
        [hx, hy],
        [-hx, hy],
      ] as const) {
        const x = cx + dx * cos - dy * sin;
        const y = cy + dx * sin + dy * cos;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      left: Math.max(minPad, handleMargin - minX),
      top: Math.max(minPad, handleMargin - minY),
      right: Math.max(minPad, maxX + handleMargin - viewW),
      bottom: Math.max(minPad, maxY + handleMargin - viewH),
    };
  }, [template.layers, dpi, viewW, viewH, originX, originY, size.width, size.height]);

  const stageW = viewW + editPad.left + editPad.right;
  const stageH = viewH + editPad.top + editPad.bottom;
  const groupX = editPad.left + originX;
  const groupY = editPad.top + originY;

  useEffect(() => {
    fitted.current = false;
  }, [cardFitKey]);

  useEffect(() => {
    const prev = prevCrop.current;
    if (prev === crop) return;
    prevCrop.current = crop;
    const bleed = size.bleedPx;
    if (bleed < 0.5) return;
    const { zoom, panX, panY } = useEditorStore.getState().view;
    const sign = crop ? 1 : -1;
    patchView({ panX: panX + sign * bleed * zoom, panY: panY + sign * bleed * zoom });
  }, [crop, size.bleedPx, patchView]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setCanvasBox({
        wrapW: r.width,
        wrapH: r.height,
        cardW: viewW,
        cardH: viewH,
        padX: editPad.left,
        padY: editPad.top,
      });
      if (!fitted.current && r.width > 8 && r.height > 8) {
        fitted.current = true;
        requestAnimationFrame(() => useEditorStore.getState().fitView());
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setCanvasBox, viewW, viewH, dpi, editPad.left, editPad.top]);

  useEffect(() => {
    const el = wrapRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const current = useEditorStore.getState().view;
      const next = Math.min(4, Math.max(0.25, current.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      const k = next / current.zoom;
      patchView({
        zoom: next,
        panX: mx - (mx - current.panX) * k,
        panY: my - (my - current.panY) * k,
      });
    };
    el?.addEventListener("wheel", onWheel, { passive: false });
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      el?.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [patchView]);

  useEffect(() => {
    let cancelled = false;
    void renderCardToCanvas(template, {
      dpi,
      fields,
      assets: project.assets,
      project,
      guides: { ...view, showGrid: false },
      honorVisibleWhen,
    }).then((canvas) => {
      if (cancelled) return;
      const img = new window.Image();
      img.onload = () => setBg(img);
      img.src = canvas.toDataURL("image/png");
    });
    return () => {
      cancelled = true;
    };
  }, [template, fields, project, dpi, view, honorVisibleWhen]);

  useEffect(() => {
    const tr = trRef.current;
    const node = selectedId ? nodeRefs.current[selectedId] : null;
    if (tr) {
      tr.nodes(node ? [node] : []);
      tr.getLayer()?.batchDraw();
    }
  }, [selectedId, template.layers, bg]);

  const gridLines = useMemo(() => {
    if (!view.showGrid) return [];
    const step = Math.max(2, mmToPx(view.gridMm || 5, dpi));
    const lines: { key: string; points: number[] }[] = [];
    const x0 = crop ? size.bleedPx : size.bleedPx;
    const y0 = crop ? size.bleedPx : size.bleedPx;
    const xMax = size.width;
    const yMax = size.height;
    for (let x = x0; x < xMax; x += step) {
      lines.push({ key: `v${x}`, points: [x, 0, x, yMax] });
    }
    for (let y = y0; y < yMax; y += step) {
      lines.push({ key: `h${y}`, points: [0, y, xMax, y] });
    }
    return lines;
  }, [view.showGrid, view.gridMm, dpi, size.bleedPx, size.width, size.height, crop]);

  function beginPan(clientX: number, clientY: number) {
    setPanning(true);
    last.current = { x: clientX, y: clientY };
  }

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: panning ? "grabbing" : "default",
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button === 2 || e.button === 1 || space.current) {
          e.preventDefault();
          beginPan(e.clientX, e.clientY);
        }
      }}
      onPointerMove={(e) => {
        if (!panning) return;
        patchView({
          panX: view.panX + e.clientX - last.current.x,
          panY: view.panY + e.clientY - last.current.y,
        });
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => setPanning(false)}
      onDoubleClick={() => fitView()}
      onDragOver={(e) => {
        if (onDropImage && [...e.dataTransfer.types].includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (!file || !onDropImage || !file.type.startsWith("image/")) return;
        e.preventDefault();
        onDropImage(file);
      }}
    >
      <div
        style={{
          transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
          transformOrigin: "0 0",
          width: stageW,
          height: stageH,
        }}
      >
        <Stage
          width={stageW}
          height={stageH}
          style={{
            borderRadius: 10,
            boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
            background: "transparent",
          }}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) onSelect(null);
          }}
        >
          <KLayer>
            <Group
              x={groupX}
              y={groupY}
              clip={
                crop
                  ? {
                      x: size.bleedPx,
                      y: size.bleedPx,
                      width: size.trimW,
                      height: size.trimH,
                    }
                  : undefined
              }
            >
            {bg && (
              <KImage image={bg} width={size.width} height={size.height} listening={false} />
            )}
            {gridLines.map((ln) => (
              <Line
                key={ln.key}
                points={ln.points}
                stroke={view.gridColor}
                strokeWidth={1}
                opacity={0.35}
                listening={false}
              />
            ))}
            <Group>
              {template.layers.map((layer) => {
                const box = layerPx(template, layer, dpi);
                const locked = layer.locked || layer.visible === false;
                const ox = box.w / 2;
                const oy = box.h / 2;
                const group = layer.type === "group";
                const selected = layer.id === selectedId || extraIds.includes(layer.id);
                return (
                  <Rect
                    key={layer.id}
                    ref={(node) => {
                      if (node) nodeRefs.current[layer.id] = node;
                      else delete nodeRefs.current[layer.id];
                    }}
                    x={box.x + ox}
                    y={box.y + oy}
                    offsetX={ox}
                    offsetY={oy}
                    width={box.w}
                    height={box.h}
                    rotation={layer.rotation ?? 0}
                    stroke={
                      selected ? "#d4a017" : group ? "rgba(212,160,23,0.25)" : "transparent"
                    }
                    dash={group ? [6, 4] : undefined}
                    strokeWidth={selected ? 1.5 : group ? 1 : 0}
                    fill="rgba(0,0,0,0.003)"
                    draggable={!locked}
                    onClick={(e) => {
                      const toggle = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
                      onSelect(layer.id, { toggle });
                    }}
                    onTap={() => onSelect(layer.id)}
                    dragBoundFunc={(pos) => {
                      if (!axis.current) axis.current = { x: pos.x, y: pos.y };
                      const ev = window.event as MouseEvent | undefined;
                      if (ev?.shiftKey && axis.current) {
                        if (Math.abs(pos.x - axis.current.x) > Math.abs(pos.y - axis.current.y)) {
                          return { x: pos.x, y: axis.current.y };
                        }
                        return { x: axis.current.x, y: pos.y };
                      }
                      return pos;
                    }}
                    onDragEnd={(e) => {
                      axis.current = null;
                      const node = e.target;
                      const w = node.width();
                      const h = node.height();
                      const absX = roundMm(pxToMm(node.x() - w / 2 - size.bleedPx, dpi));
                      const absY = roundMm(pxToMm(node.y() - h / 2 - size.bleedPx, dpi));
                      const snapped = snapLayer(
                        { ...layer, x: absX, y: absY, w: layer.w, h: layer.h },
                        template,
                        template.layers
                          .filter((l) => l.id !== layer.id)
                          .map((l) => ({ ...l, ...absBox(template.layers, l) })),
                        view,
                      );
                      const rel = toRelative(template.layers, layer, snapped.x, snapped.y);
                      onChangeLayer(layer.id, { x: roundMm(rel.x), y: roundMm(rel.y) }, `drag:${layer.id}`);
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      const wPx = Math.max(4, node.width() * scaleX);
                      const hPx = Math.max(4, node.height() * scaleY);
                      node.scaleX(1);
                      node.scaleY(1);
                      const absX = roundMm(pxToMm(node.x() - wPx / 2 - size.bleedPx, dpi));
                      const absY = roundMm(pxToMm(node.y() - hPx / 2 - size.bleedPx, dpi));
                      const rel = toRelative(template.layers, layer, absX, absY);
                      onChangeLayer(
                        layer.id,
                        {
                          x: roundMm(rel.x),
                          y: roundMm(rel.y),
                          w: roundMm(pxToMm(wPx, dpi)),
                          h: roundMm(pxToMm(hPx, dpi)),
                          rotation: roundMm(node.rotation(), 1),
                        },
                        `xf:${layer.id}`,
                      );
                    }}
                  />
                );
              })}
              <Transformer
                ref={trRef}
                rotateEnabled
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
                }
              />
            </Group>
            {!bg && (
              <Text text="渲染中…" fill="#888" x={size.width / 2 - 30} y={size.height / 2} />
            )}
            </Group>
          </KLayer>
        </Stage>
      </div>
    </div>
  );
}
