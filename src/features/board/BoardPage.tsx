import { useRef, useState } from "react";
import { ingestImageFile } from "@/lib/ingestAsset";
import { createBoardPiece, boardLongestMm, boardThicknessMm } from "@/model/board";
import type { BoardPiece } from "@/model/types";
import { useAppStore } from "@/store/appStore";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { HelpTip } from "@/ui/HelpTip";
import { SplitHandle, usePaneSize } from "@/ui/Splitter";
import { probeBoardAlpha } from "./boardCutout";

const ACCEPT = "image/*,.psd,image/vnd.adobe.photoshop";

function assetUrl(project: { assets: Record<string, string> }, id: string) {
  return project.assets[id] ?? "";
}

function BoardThumb({ src, name }: { src: string; name: string }) {
  return (
    <div className="board-thumb">
      {src ? <img src={src} alt="" /> : <span className="muted">{name}</span>}
    </div>
  );
}

export function BoardPage() {
  const { current, currentPath, patchProject, setError } = useAppStore();
  const [selId, setSelId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [alphaHint, setAlphaHint] = useState<string | null>(null);
  const [rightW, setRightW] = usePaneSize("board-right", 300);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  if (!current) return <div className="page">未打开项目</div>;
  const project = current;
  const boards = project.boards ?? [];
  const board = boards.find((b) => b.id === selId) ?? boards[0];
  const src = board?.textureAssetId ? assetUrl(project, board.textureAssetId) : "";

  async function importNew(file: File) {
    const got = await ingestImageFile(file, currentPath, project.assets);
    const stem = file.name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim() || `板件 ${boards.length + 1}`;
    const piece = createBoardPiece(stem, got.id);
    patchProject((p) => ({
      ...p,
      assets: { ...p.assets, [got.id]: got.src },
      boards: [...(p.boards ?? []), piece],
    }));
    setSelId(piece.id);
    setAlphaHint(null);
  }

  function rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchProject((p) => ({
      ...p,
      boards: (p.boards ?? []).map((b) => (b.id === id ? { ...b, name: trimmed } : b)),
    }));
    setRenaming(null);
  }

  function duplicate(id: string) {
    const srcBoard = boards.find((b) => b.id === id);
    if (!srcBoard) return;
    const copy: BoardPiece = { ...srcBoard, id: createBoardPiece().id, name: `${srcBoard.name} 副本` };
    patchProject((p) => ({ ...p, boards: [...(p.boards ?? []), copy] }));
    setSelId(copy.id);
  }

  function remove(id: string) {
    patchProject((p) => ({ ...p, boards: (p.boards ?? []).filter((b) => b.id !== id) }));
    if (selId === id) setSelId(null);
  }

  function patchBoard(recipe: (b: BoardPiece) => BoardPiece, mergeKey?: string) {
    if (!board) return;
    patchProject(
      (p) => ({
        ...p,
        boards: (p.boards ?? []).map((b) => (b.id === board.id ? recipe(b) : b)),
      }),
      mergeKey ? { mergeKey } : undefined,
    );
  }

  async function importTexture(file: File) {
    if (!board) return;
    try {
      const got = await ingestImageFile(file, currentPath, project.assets);
      const img = new Image();
      img.onload = () => {
        const probe = probeBoardAlpha(img);
        setAlphaHint(probe.hasAlpha ? null : "这张图没有透明通道，会当成矩形板。换透明 PNG 才能扣外形。");
      };
      img.src = got.src;
      patchProject((p) => ({
        ...p,
        assets: { ...p.assets, [got.id]: got.src },
        boards: (p.boards ?? []).map((b) => (b.id === board.id ? { ...b, textureAssetId: got.id } : b)),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "贴图导入失败");
    }
  }

  const items: MenuItem[] = menu
    ? [
        { label: "选中", onClick: () => setSelId(menu.id) },
        {
          label: "重命名",
          onClick: () => {
            const b = boards.find((x) => x.id === menu.id);
            setNameDraft(b?.name ?? "");
            setRenaming(menu.id);
          },
        },
        { label: "复制", onClick: () => duplicate(menu.id) },
        { label: "删除", danger: true, onClick: () => remove(menu.id) },
      ]
    : [];

  return (
    <div className="page box-page spec-page">
      <div className="page-head page-head-compact">
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <h1>板件</h1>
          <HelpTip>
            <p>左边点块，右边改贴图、板厚、最长边。上传透明 PNG，按 alpha 扣外形。</p>
            <p>做好后可在产品渲染的「板件」栏拖进场景。</p>
          </HelpTip>
        </div>
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importNew(f);
            }}
          />
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            新建板件
          </button>
        </div>
      </div>
      <div className="spec-layout" style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${rightW}px` }}>
        <div className="spec-lib-main">
          {boards.length === 0 ? (
            <div className="empty">还没有板件。点右上角导入一张透明 PNG。</div>
          ) : (
            <div className="bp-grid">
              {boards.map((item) => {
                const thumb = assetUrl(project, item.textureAssetId);
                const on = board?.id === item.id;
                return (
                  <article
                    key={item.id}
                    className={`bp-tile ${on ? "is-selected" : ""}`}
                    onClick={() => setSelId(item.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelId(item.id);
                      setMenu({ x: e.clientX, y: e.clientY, id: item.id });
                    }}
                  >
                    <div className="bp-faces box-lib-faces">
                      <BoardThumb src={thumb} name={item.name} />
                    </div>
                    {renaming === item.id ? (
                      <form
                        className="bp-rename"
                        onSubmit={(e) => {
                          e.preventDefault();
                          rename(item.id, nameDraft);
                        }}
                      >
                        <input
                          autoFocus
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onBlur={() => rename(item.id, nameDraft)}
                        />
                      </form>
                    ) : (
                      <h3>{item.name}</h3>
                    )}
                    <p className="muted">
                      最长边 {boardLongestMm(item)} mm · 厚 {boardThicknessMm(item)} mm
                      {item.textureAssetId && !assetUrl(project, item.textureAssetId) ? " · 贴图丢失" : ""}
                    </p>
                  </article>
                );
              })}
              <button type="button" className="bp-tile bp-tile-new" onClick={() => fileRef.current?.click()}>
                + 新建板件
              </button>
            </div>
          )}
        </div>
        <SplitHandle onDelta={(dx) => setRightW(Math.min(440, Math.max(220, rightW + dx)))} />
        <aside className="box-side">
          {board ? (
            <div className="form">
              <div className="bp-spec-preview board-edit-view" style={{ minHeight: 160 }}>
                {src ? <img src={src} alt="" /> : <p className="muted">还没有贴图</p>}
              </div>
              <div className="field">
                <label>名称</label>
                <input value={board.name} onChange={(e) => patchBoard((b) => ({ ...b, name: e.target.value }))} />
              </div>
              <input
                ref={replaceRef}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void importTexture(f);
                }}
              />
              <div className="row">
                <button type="button" className="btn" onClick={() => replaceRef.current?.click()}>
                  {board.textureAssetId ? "更换贴图" : "导入贴图"}
                </button>
              </div>
              {alphaHint ? <p className="muted">{alphaHint}</p> : <p className="muted">推荐透明 PNG。无 alpha 的图按矩形板。</p>}
              <div className="field">
                <label>板厚 mm</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={boardThicknessMm(board)}
                  onChange={(e) => patchBoard((b) => ({ ...b, thicknessMm: Math.max(0, Number(e.target.value) || 0) }), "board-thick")}
                />
              </div>
              <div className="field">
                <label>最长边 mm</label>
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={boardLongestMm(board)}
                  onChange={(e) => patchBoard((b) => ({ ...b, longestMm: Math.max(1, Number(e.target.value) || 40) }), "board-long")}
                />
              </div>
              <p className="muted">另一边按贴图像素比缩放。产品渲染里这块板趴地、正面朝上。</p>
            </div>
          ) : (
            <p className="muted">点左侧板件块，在这里改贴图和厚度。</p>
          )}
        </aside>
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
