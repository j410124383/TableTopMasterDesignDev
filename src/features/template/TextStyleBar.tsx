import type { Layer } from "@/model/types";
import { FONT_PRESETS } from "@/model/sizes";
import { ColorField } from "@/ui/ColorField";
import { IconBtn } from "@/ui/IconBtn";
import {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconAutosize,
  IconBold,
  IconClip,
  IconEllipsis,
  IconFit,
  IconItalic,
  IconStrike,
  IconUnderline,
  IconValignBottom,
  IconValignMiddle,
  IconValignTop,
} from "@/ui/Icons";

type Props = {
  layer: Layer;
  fonts: string[];
  onStyle: (partial: Layer["style"]) => void;
  onUploadFont: () => void;
  boundColor?: string;
  boundBackground?: string;
  onColorMenu?: (e: { clientX: number; clientY: number; preventDefault: () => void }) => void;
  onBackgroundMenu?: (e: { clientX: number; clientY: number; preventDefault: () => void }) => void;
};

export function TextStyleBar({
  layer,
  fonts,
  onStyle,
  onUploadFont,
  boundColor,
  boundBackground,
  onColorMenu,
  onBackgroundMenu,
}: Props) {
  const s = layer.style;
  const weight = Number(s.fontWeight ?? 400);
  const bold = weight >= 600;
  return (
    <div className="text-style">
      <div className="text-style-row">
        <select
          className="text-font-select"
          title="字体"
          value={s.fontFamily ?? FONT_PRESETS[3]}
          onChange={(e) => onStyle({ fontFamily: e.target.value })}
        >
          {fonts.map((f) => (
            <option key={f} value={f}>
              {f.split(",")[0]}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-small" onClick={onUploadFont}>
          字体文件
        </button>
      </div>
      <div className="text-style-row">
        <IconBtn title="粗体" active={bold} onClick={() => onStyle({ fontWeight: bold ? 400 : 700 })}>
          <IconBold />
        </IconBtn>
        <IconBtn title="斜体" active={!!s.italic} onClick={() => onStyle({ italic: !s.italic })}>
          <IconItalic />
        </IconBtn>
        <IconBtn title="下划线" active={!!s.underline} onClick={() => onStyle({ underline: !s.underline })}>
          <IconUnderline />
        </IconBtn>
        <IconBtn title="删除线" active={!!s.strikethrough} onClick={() => onStyle({ strikethrough: !s.strikethrough })}>
          <IconStrike />
        </IconBtn>
        <span className="view-sep" />
        <label className="dpi-field" title="字号 mm">
          Aa
          <input
            type="number"
            step={0.1}
            value={s.fontSizeMm ?? 4}
            onChange={(e) => onStyle({ fontSizeMm: Number(e.target.value) })}
          />
        </label>
        <label className="dpi-field" title="行高">
          ↕
          <input
            type="number"
            step={0.05}
            value={s.lineHeight ?? 1.25}
            onChange={(e) => onStyle({ lineHeight: Number(e.target.value) })}
          />
        </label>
        <label className="dpi-field" title="字距 mm">
          AV
          <input
            type="number"
            step={0.05}
            value={s.letterSpacingMm ?? 0}
            onChange={(e) => onStyle({ letterSpacingMm: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="text-style-row">
        <IconBtn title="左对齐" active={(s.align ?? "center") === "left"} onClick={() => onStyle({ align: "left" })}>
          <IconAlignLeft />
        </IconBtn>
        <IconBtn title="水平居中" active={(s.align ?? "center") === "center"} onClick={() => onStyle({ align: "center" })}>
          <IconAlignCenter />
        </IconBtn>
        <IconBtn title="右对齐" active={s.align === "right"} onClick={() => onStyle({ align: "right" })}>
          <IconAlignRight />
        </IconBtn>
        <IconBtn title="两端对齐" active={s.align === "justify"} onClick={() => onStyle({ align: "justify" })}>
          <IconAlignJustify />
        </IconBtn>
        <span className="view-sep" />
        <IconBtn title="顶对齐" active={s.valign === "top"} onClick={() => onStyle({ valign: "top" })}>
          <IconValignTop />
        </IconBtn>
        <IconBtn title="垂直居中" active={(s.valign ?? "middle") === "middle"} onClick={() => onStyle({ valign: "middle" })}>
          <IconValignMiddle />
        </IconBtn>
        <IconBtn title="底对齐" active={s.valign === "bottom"} onClick={() => onStyle({ valign: "bottom" })}>
          <IconValignBottom />
        </IconBtn>
      </div>
      <div className="text-style-row">
        <IconBtn title="自动缩字" active={!!s.autosize} onClick={() => onStyle({ autosize: !s.autosize })}>
          <IconAutosize />
        </IconBtn>
        <IconBtn title="裁切溢出" active={(s.overflow ?? "clip") === "clip"} onClick={() => onStyle({ overflow: "clip" })}>
          <IconClip />
        </IconBtn>
        <IconBtn title="省略号" active={s.overflow === "ellipsis"} onClick={() => onStyle({ overflow: "ellipsis" })}>
          <IconEllipsis />
        </IconBtn>
        <IconBtn title="缩小适应" active={s.overflow === "shrink"} onClick={() => onStyle({ overflow: "shrink" })}>
          <IconFit />
        </IconBtn>
        {s.autosize || s.overflow === "shrink" ? (
          <>
            <label className="dpi-field" title="最小字号 mm">
              min
              <input
                type="number"
                step={0.1}
                value={s.fontSizeMinMm ?? 2}
                onChange={(e) => onStyle({ fontSizeMinMm: Number(e.target.value) })}
              />
            </label>
            <label className="dpi-field" title="最大字号 mm">
              max
              <input
                type="number"
                step={0.1}
                value={s.fontSizeMaxMm ?? s.fontSizeMm ?? 4}
                onChange={(e) => onStyle({ fontSizeMaxMm: Number(e.target.value) })}
              />
            </label>
          </>
        ) : null}
      </div>
      <ColorField
        label="文字色"
        value={s.color}
        fallback="#ffffff"
        onChange={(c) => onStyle({ color: c })}
        boundField={boundColor}
        onContextMenu={onColorMenu}
      />
      <ColorField
        label="文字背景"
        value={s.background}
        fallback="#00000000"
        onChange={(c) => onStyle({ background: c })}
        boundField={boundBackground}
        onContextMenu={onBackgroundMenu}
      />
      <div className="text-style-row">
        <label className="dpi-field" title="段距 mm">
          ¶
          <input
            type="number"
            step={0.1}
            value={s.paragraphSpacingMm ?? 0}
            onChange={(e) => onStyle({ paragraphSpacingMm: Number(e.target.value) })}
          />
        </label>
        <label className="dpi-field grow" title="文字描边 mm">
          描边
          <input
            type="number"
            step={0.05}
            value={s.textStrokeWidthMm ?? 0}
            onChange={(e) => onStyle({ textStrokeWidthMm: Number(e.target.value) })}
          />
        </label>
      </div>
      <ColorField label="描边色" value={s.textStroke} fallback="#000000" onChange={(c) => onStyle({ textStroke: c })} />
      <div className="text-style-row" title="TMP Margins · 文本框内边距 mm">
        <label className="dpi-field">
          边距L
          <input
            type="number"
            step={0.1}
            value={s.marginLeftMm ?? 0}
            onChange={(e) => onStyle({ marginLeftMm: Number(e.target.value) })}
          />
        </label>
        <label className="dpi-field">
          T
          <input
            type="number"
            step={0.1}
            value={s.marginTopMm ?? 0}
            onChange={(e) => onStyle({ marginTopMm: Number(e.target.value) })}
          />
        </label>
        <label className="dpi-field">
          R
          <input
            type="number"
            step={0.1}
            value={s.marginRightMm ?? 0}
            onChange={(e) => onStyle({ marginRightMm: Number(e.target.value) })}
          />
        </label>
        <label className="dpi-field">
          B
          <input
            type="number"
            step={0.1}
            value={s.marginBottomMm ?? 0}
            onChange={(e) => onStyle({ marginBottomMm: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
