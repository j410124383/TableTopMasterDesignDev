import { CARD_SIZE_PRESETS, presetBySize } from "@/model/sizes";
import { downloadProjectJson, readFileAsDataUrl } from "@/persist/storage";
import { useAppStore } from "@/store/appStore";
import { SiteTags } from "@/ui/Brand";
import { ThemeSwitch } from "@/ui/ThemeSwitch";

export function SettingsPage() {
  const { current, patchProject, persist, relinkFolder, currentPath, dirty } = useAppStore();
  if (!current) return null;
  const preset = presetBySize(current.meta.defaultSize);

  return (
    <div className="page" style={{ width: "100%", maxWidth: 640 }}>
      <div className="page-head">
        <div>
          <h1>项目设置</h1>
          <p className="muted">工程目录：{currentPath ?? "未绑定"}</p>
        </div>
      </div>
      <div className="form card" style={{ padding: 20 }}>
        <div className="field">
          <label>外观</label>
          <ThemeSwitch />
        </div>
        <div className="field">
          <label>项目名称</label>
          <input
            value={current.meta.name}
            onChange={(e) =>
              patchProject((p) => ({ ...p, meta: { ...p.meta, name: e.target.value } }), {
                mergeKey: "meta-name",
              })
            }
          />
        </div>
        <div className="field">
          <label>备注</label>
          <textarea
            value={current.meta.note ?? ""}
            onChange={(e) =>
              patchProject((p) => ({ ...p, meta: { ...p.meta, note: e.target.value } }), {
                mergeKey: "meta-note",
              })
            }
          />
        </div>
        <div className="field">
          <label>默认卡牌尺寸</label>
          <select
            value={preset}
            onChange={(e) => {
              const found = CARD_SIZE_PRESETS.find((p) => p.id === e.target.value);
              if (!found || found.id === "custom") return;
              patchProject((p) => ({
                ...p,
                meta: { ...p.meta, defaultSize: { w: found.w, h: found.h } },
                blueprints: p.blueprints.map((t) => ({ ...t, size: { w: found.w, h: found.h } })),
              }));
            }}
          >
            {CARD_SIZE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="field grow">
            <label>宽 mm</label>
            <input
              type="number"
              value={current.meta.defaultSize.w}
              onChange={(e) => {
                const w = Number(e.target.value);
                patchProject(
                  (p) => ({
                    ...p,
                    meta: { ...p.meta, defaultSize: { ...p.meta.defaultSize, w } },
                    blueprints: p.blueprints.map((t) => ({ ...t, size: { ...t.size, w } })),
                  }),
                  { mergeKey: "size-w" },
                );
              }}
            />
          </div>
          <div className="field grow">
            <label>高 mm</label>
            <input
              type="number"
              value={current.meta.defaultSize.h}
              onChange={(e) => {
                const h = Number(e.target.value);
                patchProject(
                  (p) => ({
                    ...p,
                    meta: { ...p.meta, defaultSize: { ...p.meta.defaultSize, h } },
                    blueprints: p.blueprints.map((t) => ({ ...t, size: { ...t.size, h } })),
                  }),
                  { mergeKey: "size-h" },
                );
              }}
            />
          </div>
        </div>
        <div className="field">
          <label>封面</label>
          <div className="cover-pick">
            {current.meta.coverAsset && (
              <img
                src={current.assets[current.meta.coverAsset] ?? current.meta.coverAsset}
                alt=""
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const data = await readFileAsDataUrl(file);
                patchProject((p) => ({
                  ...p,
                  assets: { ...p.assets, cover: data },
                  meta: { ...p.meta, coverAsset: "cover" },
                }));
              }}
            />
          </div>
        </div>
        <div className="toolbar">
          <button className="btn btn-primary" disabled={!dirty} onClick={() => void persist()}>
            保存到磁盘
          </button>
          <button className="btn" onClick={() => void relinkFolder()}>
            重新绑定文件夹
          </button>
          <button className="btn" onClick={() => downloadProjectJson(current)}>
            导出合并 JSON
          </button>
        </div>
      </div>
      <SiteTags />
    </div>
  );
}
