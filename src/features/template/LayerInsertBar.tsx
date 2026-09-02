import { useRef, useState, type ReactNode } from "react";
import { STOCK_ICONS } from "@/lib/stockIcons";
import type { LayerShape } from "@/model/types";
import { LAYER_SHAPES } from "@/render/shapes";
import { IconBtn } from "@/ui/IconBtn";
import { IconFolder, IconImage, IconPlus, IconRect, IconStar, IconText } from "@/ui/Icons";

type InsertKind = "text" | "image" | "rect" | "icon";

type Props = {
  assets: Record<string, string>;
  onAddText: () => void;
  onAddGroup?: () => void;
  onAddShape: (shape: LayerShape) => void;
  onAddIcon: (stockId: string) => void;
  onAddImageFile: (file: File) => void;
  onAddImageAsset: (assetId: string) => void;
  onAddEmptyImage: () => void;
};

export function LayerInsertBar({
  assets,
  onAddText,
  onAddGroup,
  onAddShape,
  onAddIcon,
  onAddImageFile,
  onAddImageAsset,
  onAddEmptyImage,
}: Props) {
  const [open, setOpen] = useState<InsertKind | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const assetIds = Object.keys(assets).filter((k) => !k.startsWith("stock-icon:") && assets[k]?.startsWith("data:image"));

  function toggle(kind: InsertKind) {
    if (kind === "text") {
      onAddText();
      setOpen(null);
      return;
    }
    setOpen((cur) => (cur === kind ? null : kind));
  }

  return (
    <div className="layer-insert">
      <div className="toolbar" style={{ padding: 12, flexWrap: "wrap" }}>
        {(
          [
            ["text", "文字", <IconText key="t" />],
            ["image", "图片", <IconImage key="i" />],
            ["rect", "图形", <IconRect key="r" />],
            ["icon", "图标", <IconStar key="s" />],
          ] as const
        ).map(([kind, label, icon]) => (
          <IconBtn key={kind} title={`添加${label}`} active={open === kind} onClick={() => toggle(kind)}>
            <IconPlus />
            {icon}
          </IconBtn>
        ))}
        {onAddGroup ? (
          <IconBtn title="添加组" onClick={onAddGroup}>
            <IconPlus />
            <IconFolder />
          </IconBtn>
        ) : null}
      </div>
      {open === "rect" && (
        <div className="layer-pop">
          <p className="hint" style={{ padding: "0 0 8px" }}>
            选择图形
          </p>
          <div className="shape-grid">
            {LAYER_SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="shape-swatch"
                title={s.name}
                onClick={() => {
                  onAddShape(s.id);
                  setOpen(null);
                }}
              >
                <ShapeMark shape={s.id} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {open === "icon" && (
        <div className="layer-pop">
          <p className="hint" style={{ padding: "0 0 8px" }}>
            选择示例图标
          </p>
          <div className="icon-grid">
            {STOCK_ICONS.map((icon) => (
              <button
                key={icon.id}
                type="button"
                className="icon-swatch"
                title={icon.name}
                onClick={() => {
                  onAddIcon(icon.id);
                  setOpen(null);
                }}
              >
                <img src={icon.src} alt="" />
                <span>{icon.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {open === "image" && (
        <div className="layer-pop">
          <div className="toolbar" style={{ padding: 0, marginBottom: 8 }}>
            <button type="button" className="btn btn-small btn-primary" onClick={() => fileRef.current?.click()}>
              选择本地图片
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                onAddEmptyImage();
                setOpen(null);
              }}
            >
              先加空图层
            </button>
          </div>
          {assetIds.length > 0 && (
            <>
              <p className="hint" style={{ padding: "4px 0 8px" }}>
                工程里已有的图
              </p>
              <div className="asset-pick-grid">
                {assetIds.slice(0, 24).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="asset-swatch"
                    title={id}
                    onClick={() => {
                      onAddImageAsset(id);
                      setOpen(null);
                    }}
                  >
                    <img src={assets[id]} alt="" />
                  </button>
                ))}
              </div>
            </>
          )}
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/*,.psd,image/vnd.adobe.photoshop"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              onAddImageFile(file);
              setOpen(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ShapeMark({ shape }: { shape: LayerShape }) {
  const common: ReactNode = (() => {
    switch (shape) {
      case "circle":
        return <circle cx="12" cy="12" r="7" />;
      case "ellipse":
        return <ellipse cx="12" cy="12" rx="8" ry="5.5" />;
      case "diamond":
        return <path d="m12 3 8 9-8 9-8-9z" />;
      case "triangle":
        return <path d="m12 4 8 15H4z" />;
      case "hex":
        return <path d="m12 3 7 4.2v9.6L12 21l-7-4.2V7.2z" />;
      case "pill":
        return <rect x="4" y="7" width="16" height="10" rx="5" />;
      case "round":
        return <rect x="4" y="6" width="16" height="12" rx="3" />;
      default:
        return <rect x="4" y="6" width="16" height="12" />;
    }
  })();
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      {common}
    </svg>
  );
}
