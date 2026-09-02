import { useEffect, useMemo, useRef, useState } from "react";
import {
  absolutizeAssetSrc,
  displayAssetPath,
  ingestImageFile,
  refreshAssetsFromDisk,
} from "@/lib/ingestAsset";
import { isPsdFile } from "@/lib/psd";
import type { Layer, Project } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { useEditorStore } from "@/store/editorStore";
import { pageSlice, Pager } from "@/ui/Pager";

const PAGE_SIZE = 48;

type Tab = "all" | "unused" | "used";

function canPreview(src: string | undefined): boolean {
  if (!src) return false;
  return (
    src.startsWith("data:image") ||
    src.startsWith("blob:") ||
    src.startsWith("/__fs/") ||
    /^https?:/i.test(src) ||
    src.startsWith("assets/")
  );
}

function collectUsed(project: Project): Set<string> {
  const used = new Set<string>();
  const add = (v?: string) => {
    if (v && project.assets[v] != null) used.add(v);
  };
  const walk = (layers: Layer[]) => {
    for (const l of layers) add(l.text);
  };
  for (const bp of project.blueprints ?? []) {
    walk(bp.frontLayers);
    walk(bp.backLayers);
  }
  for (const t of project.templates ?? []) walk(t.layers);
  for (const s of project.sets ?? []) {
    for (const c of s.cards) for (const v of Object.values(c.fields)) add(v);
  }
  for (const d of project.decks ?? []) {
    for (const c of d.cards) for (const v of Object.values(c.fields)) add(v);
  }
  for (const b of project.boxes ?? []) add(b.textureAssetId);
  add(project.meta.coverAsset);
  for (const f of project.fonts ?? []) add(f.assetId);
  for (const v of project.variables ?? []) add(v.replacement);
  return used;
}

export function MediaPage() {
  const { current, currentPath, patchProject, setError, setInfo } = useAppStore();
  const selectedId = useEditorStore((s) => s.selectedId);
  const face = useEditorStore((s) => s.face);
  const replaceRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [px, setPx] = useState<{ w: number; h: number } | null>(null);

  const assets = current?.assets ?? {};
  const used = useMemo(() => (current ? collectUsed(current) : new Set<string>()), [current]);
  const keys = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.keys(assets).filter((k) => {
      if (q && !k.toLowerCase().includes(q)) return false;
      if (tab === "used") return used.has(k);
      if (tab === "unused") return !used.has(k);
      return true;
    });
  }, [assets, filter, tab, used]);
  const pageKeys = pageSlice(keys, page, PAGE_SIZE);

  const detailId = detail && assets[detail] != null ? detail : null;
  const detailSrc = detailId ? absolutizeAssetSrc(assets[detailId]!, currentPath) : null;

  useEffect(() => {
    setPx(null);
    if (!detailSrc || !canPreview(detailSrc)) return;
    const img = new Image();
    img.onload = () => setPx({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = detailSrc;
  }, [detailSrc]);

  if (!current) return null;

  const template = current.templates.find((t) => t.face === face);
  const selected = template?.layers.find((l) => l.id === selectedId);

  async function upload(files: FileList | File[]) {
    const next: Record<string, string> = { ...current!.assets };
    try {
      for (const file of Array.from(files)) {
        const isImg = file.type.startsWith("image/") || isPsdFile(file);
        if (!isImg) continue;
        const { id, src } = await ingestImageFile(file, currentPath, current!.assets);
        next[id] = src;
      }
      patchProject((p) => ({ ...p, assets: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    }
  }

  async function refreshAll() {
    setBusy(true);
    try {
      const got = await refreshAssetsFromDisk(current!.assets, currentPath);
      patchProject((p) => ({ ...p, assets: got.assets }));
      const miss = got.missing.length ? `，找不到 ${got.missing.length} 个` : "";
      setInfo(`已更新 ${got.ok} 个素材，跳过 ${got.skipped} 个无路径${miss}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    patchProject((p) => {
      const next = { ...p.assets };
      delete next[id];
      return { ...p, assets: next };
    });
    if (detail === id) setDetail(null);
    if (picked === id) setPicked(null);
  }

  return (
    <div className="page media-page">
      <div className="page-head">
        <div>
          <h1>素材库</h1>
          <p className="muted">点缩略图打开预览与路径。「一键更新」按工程路径从磁盘刷新，不改 id。</p>
        </div>
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="筛选 id"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            上传图片
          </button>
          <button className="btn" disabled={busy} onClick={() => void refreshAll()}>
            {busy ? "更新中…" : "一键更新"}
          </button>
        </div>
      </div>
      <div className="view-tabs">
        {(
          [
            ["all", "全部"],
            ["unused", "未引用"],
            ["used", "已引用"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`view-tab ${tab === id ? "active" : ""}`}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
      >
        把图片 / PSD 拖到这里，或点上传。本页 {keys.length} / 共 {Object.keys(assets).length} 个。
      </div>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="image/*,.psd,image/vnd.adobe.photoshop"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          e.target.value = "";
          if (files) void upload(files);
        }}
      />
      <input
        ref={replaceRef}
        hidden
        type="file"
        accept="image/*,.psd,image/vnd.adobe.photoshop"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const id = detail ?? picked;
          if (!file || !id) return;
          try {
            const got = await ingestImageFile(file, currentPath, current.assets, { replaceId: id });
            patchProject((p) => ({ ...p, assets: { ...p.assets, [got.id]: got.src } }));
          } catch (err) {
            setError(err instanceof Error ? err.message : "覆盖失败");
          }
        }}
      />
      <div className="media-grid">
        {pageKeys.map((id) => {
          const raw = assets[id];
          const src = absolutizeAssetSrc(raw, currentPath);
          return (
            <article
              key={id}
              className={`media-card ${detail === id || picked === id ? "active" : ""}`}
              onClick={() => {
                setPicked(id);
                setDetail(id);
              }}
            >
              {canPreview(src) ? <img src={src} alt="" /> : <div className="media-fallback">文件</div>}
              <div className="media-meta">
                <code>{id}</code>
                {!used.has(id) ? <span className="muted">未引用</span> : <span className="muted">已引用</span>}
              </div>
            </article>
          );
        })}
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={keys.length} onChange={setPage} />
      {detailId && detailSrc && (
        <div className="modal-backdrop box-uv-backdrop" onClick={() => setDetail(null)}>
          <div className="box-uv-panel" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <header className="box-uv-head">
              <div>
                <h2>{detailId}</h2>
              </div>
              <button type="button" className="btn" onClick={() => setDetail(null)}>
                关闭
              </button>
            </header>
            <div className="box-uv-body media-detail-body">
              <div className="media-detail-preview">
                {canPreview(detailSrc) ? <img src={detailSrc} alt="" /> : <div className="media-fallback">无法预览</div>}
              </div>
              <aside className="box-uv-side">
                <div className="field">
                  <label>assetId</label>
                  <code>{detailId}</code>
                </div>
                <div className="field">
                  <label>引用</label>
                  <p className="muted">{used.has(detailId) ? "已引用" : "未引用"}</p>
                </div>
                {px ? (
                  <div className="field">
                    <label>像素</label>
                    <p className="muted">
                      {px.w} × {px.h}
                    </p>
                  </div>
                ) : null}
                <div className="field">
                  <label>路径</label>
                  <p className="muted" style={{ wordBreak: "break-all" }}>
                    {displayAssetPath(assets[detailId]!, currentPath)}
                  </p>
                </div>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-small" onClick={() => void navigator.clipboard.writeText(detailId)}>
                    复制 id
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() =>
                      void navigator.clipboard.writeText(displayAssetPath(assets[detailId]!, currentPath))
                    }
                  >
                    复制路径
                  </button>
                  <button type="button" className="btn btn-small btn-primary" onClick={() => replaceRef.current?.click()}>
                    重新链接
                  </button>
                  {selected && (selected.type === "image" || selected.type === "icon") && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        const layerId = selected.id;
                        const which = face;
                        const id = detailId;
                        patchProject((p) => ({
                          ...p,
                          blueprints: p.blueprints.map((bp) => {
                            const layers = which === "front" ? bp.frontLayers : bp.backLayers;
                            if (!layers.some((l) => l.id === layerId)) return bp;
                            const nextLayers = layers.map((l) => (l.id === layerId ? { ...l, text: id } : l));
                            return which === "front" ? { ...bp, frontLayers: nextLayers } : { ...bp, backLayers: nextLayers };
                          }),
                        }));
                      }}
                    >
                      指派图层
                    </button>
                  )}
                  <button type="button" className="btn btn-small btn-danger" onClick={() => remove(detailId)}>
                    删除
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
