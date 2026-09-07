import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { applyProjectFonts } from "@/lib/fonts";
import { uid } from "@/lib/id";
import { downloadProjectJson, downloadProjectZip, getProjectHandle, looksLikeFullPath } from "@/persist/storage";
import { CreateProjectDialog } from "@/features/home/CreateProjectDialog";
import { useAppStore } from "@/store/appStore";
import { useT } from "@/store/localeStore";
import { useEditorStore } from "@/store/editorStore";
import { IconBtn } from "@/ui/IconBtn";
import {
  IconBox,
  IconBook,
  IconCards,
  IconDice,
  IconExport,
  IconFolder,
  IconGear,
  IconGrid,
  IconHelp,
  IconImage,
  IconLayers,
  IconPrint,
  IconRedo,
  IconSave,
  IconShot,
  IconSpec,
  IconUndo,
  IconVars,
} from "@/ui/Icons";
import { ShortcutsHelp } from "@/ui/ShortcutsHelp";
import { OnboardingDock } from "@/features/onboarding/OnboardingDock";
import { Brand } from "@/ui/Brand";
import { versionStamp } from "@/lib/appVersion";
import { PrefsMenu } from "@/ui/PrefsMenu";

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
}

export function WorkspaceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    current,
    currentPath,
    dirty,
    saving,
    close,
    persist,
    error,
    info,
    past,
    future,
    undo,
    redo,
    patchProject,
    relinkFolder,
    setInfo,
    setError,
    currentOrigin,
    create,
  } = useAppStore();
  const {
    selectedId,
    setSelected,
    face,
    clipboard,
    setClipboard,
    patchView,
    fitView,
    centerZoom,
    view,
    blueprintId,
  } = useEditorStore();
  const [help, setHelp] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [hideReadonly, setHideReadonly] = useState(false);
  const t = useT();

  useEffect(() => {
    if (current) void applyProjectFonts(current);
  }, [current]);

  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      void persist();
    }, 500);
    return () => window.clearTimeout(t);
  }, [dirty, current, persist]);

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        if (!isTypingTarget(e.target)) {
          e.preventDefault();
          setHelp((v) => !v);
          return;
        }
      }
      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        await persist();
        return;
      }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        const handle = current ? await getProjectHandle(current.meta.id) : undefined;
        if (handle) setInfo(`项目文件夹：${handle.name}（浏览器无法直接打开资源管理器）`);
        else void relinkFolder();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (ctrl && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        setSelected(null);
        setHelp(false);
      }
      if (e.key === "Home") {
        e.preventDefault();
        fitView();
      }
      if (e.key === "End") {
        e.preventDefault();
        centerZoom(1);
      }
      if (ctrl && e.key.toLowerCase() === "b") {
        e.preventDefault();
        patchView({ showBleed: !useEditorStore.getState().view.showBleed });
      }
      if (ctrl && e.key.toLowerCase() === "g") {
        e.preventDefault();
        patchView({ showGrid: !useEditorStore.getState().view.showGrid });
      }
      if (!current || !location.pathname.includes("template")) return;
      const bp = current.blueprints.find((b) => b.id === (blueprintId ?? current.blueprints[0]?.id));
      if (!bp) return;
      const layers = face === "front" ? bp.frontLayers : bp.backLayers;
      const selected = layers.find((l) => l.id === selectedId);

      const apply = (nextLayers: typeof layers) => {
        patchProject((p) => ({
          ...p,
          blueprints: p.blueprints.map((b) =>
            b.id === bp.id
              ? { ...b, frontLayers: face === "front" ? nextLayers : b.frontLayers, backLayers: face === "back" ? nextLayers : b.backLayers }
              : b,
          ),
        }));
      };

      if (ctrl && e.key.toLowerCase() === "c" && selected) {
        setClipboard(structuredClone(selected));
      }
      if (ctrl && e.key.toLowerCase() === "v" && clipboard) {
        const copy = { ...structuredClone(clipboard), id: uid("ly"), x: clipboard.x + 2, y: clipboard.y + 2 };
        apply([...layers, copy]);
        setSelected(copy.id);
      }
      if (ctrl && e.key.toLowerCase() === "d" && selected) {
        e.preventDefault();
        const copy = { ...structuredClone(selected), id: uid("ly"), x: selected.x + 2, y: selected.y + 2 };
        apply([...layers, copy]);
        setSelected(copy.id);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        apply(layers.filter((l) => l.id !== selected.id));
        setSelected(null);
      }
      if (ctrl && e.key === "ArrowUp" && selected) {
        e.preventDefault();
        const i = layers.findIndex((l) => l.id === selected.id);
        if (i >= 0 && i < layers.length - 1) {
          const next = [...layers];
          [next[i + 1], next[i]] = [next[i], next[i + 1]];
          apply(next);
        }
      }
      if (ctrl && e.key === "ArrowDown" && selected) {
        e.preventDefault();
        const i = layers.findIndex((l) => l.id === selected.id);
        if (i > 0) {
          const next = [...layers];
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
          apply(next);
        }
      }
      if (e.key === "F2" && selected) {
        e.preventDefault();
        const name = window.prompt("图层名称", selected.name);
        if (name) {
          apply(layers.map((l) => (l.id === selected.id ? { ...l, name } : l)));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    current,
    selectedId,
    face,
    clipboard,
    location.pathname,
    persist,
    undo,
    redo,
    patchProject,
    relinkFolder,
    setInfo,
    setSelected,
    setClipboard,
    patchView,
    fitView,
    centerZoom,
    blueprintId,
  ]);

  const libraryOpen = useEditorStore((s) => s.libraryOpen);
  const setLibraryOpen = useEditorStore((s) => s.setLibraryOpen);
  const boxLibraryOpen = useEditorStore((s) => s.boxLibraryOpen);
  const setBoxLibraryOpen = useEditorStore((s) => s.setBoxLibraryOpen);
  const editingBlueprint = location.pathname.includes("template") && !libraryOpen;
  const editingBox = location.pathname.startsWith("/project/box") && !boxLibraryOpen;

  if (!current) return <Navigate to="/app" replace />;

  const set = current.sets.find((s) => s.id === useEditorStore.getState().setId) ?? current.sets[0];
  const cardCount = set?.cards.length ?? 0;
  const printCount = set?.cards.reduce((s, c) => s + c.qty, 0) ?? 0;
  const bp = current.blueprints.find((b) => b.id === (blueprintId ?? current.blueprints[0]?.id));
  const selected = (face === "front" ? bp?.frontLayers : bp?.backLayers)?.find((l) => l.id === selectedId);

  const pieces = ["/project/specs", "/project/template", "/project/sets", "/project/deck"].some((p) => location.pathname.startsWith(p));
  const showPieceSub = pieces || location.pathname.startsWith("/project/vars");
  const packing = location.pathname.startsWith("/project/box");
  const shooting = location.pathname.startsWith("/project/shot");
  const manual = location.pathname.startsWith("/project/manual");

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="row">
          {editingBlueprint ? (
            <button type="button" className="btn btn-primary btn-small" onClick={() => setLibraryOpen(true)}>
              ← 返回蓝图库
            </button>
          ) : null}
          {editingBox ? (
            <button type="button" className="btn btn-primary btn-small" onClick={() => setBoxLibraryOpen(true)}>
              ← 返回包装库
            </button>
          ) : null}
          <button
            className={`btn btn-ghost btn-small ${editingBlueprint || editingBox ? "topbar-close-muted" : ""}`}
            onClick={() => {
              void persist();
              close();
              navigate("/app");
            }}
          >
            {t("ws.close")}
          </button>
          <Brand compact />
          <strong>{current.meta.name}</strong>
          {currentOrigin === "subscribed" && <span className="origin-badge">{t("origin.sub")}</span>}
          {currentOrigin === "example" && <span className="origin-badge example">{t("origin.ex")}</span>}
          <span className="muted" style={{ fontSize: 12 }}>{currentPath}</span>
        </div>
        <nav className="tabs dim-tabs">
          <NavLink to="/project/template" className={() => `tab ${pieces ? "active" : ""}`} title={t("ws.pieces")}>
            <span className="tab-ico"><IconLayers size={15} /></span>
            <span className="tab-lbl">{t("ws.pieces")}</span>
          </NavLink>
          <NavLink to="/project/box" className={() => `tab ${packing ? "active" : ""}`} title={t("ws.box")}>
            <span className="tab-ico"><IconBox size={15} /></span>
            <span className="tab-lbl">{t("ws.box")}</span>
          </NavLink>
          <NavLink to="/project/manual" className={() => `tab ${manual ? "active" : ""}`} title={t("ws.manual")}>
            <span className="tab-ico"><IconBook size={15} /></span>
            <span className="tab-lbl">{t("ws.manual")}</span>
          </NavLink>
          <span className="tab-split" />
          <NavLink to="/project/vars" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.vars")}>
            <span className="tab-ico"><IconVars size={15} /></span>
            <span className="tab-lbl">{t("ws.vars")}</span>
          </NavLink>
          <NavLink to="/project/media" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.media")}>
            <span className="tab-ico"><IconImage size={15} /></span>
            <span className="tab-lbl">{t("ws.media")}</span>
          </NavLink>
          <NavLink to="/project/stage" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.stage")}>
            <span className="tab-ico"><IconDice size={15} /></span>
            <span className="tab-lbl">{t("ws.stage")}</span>
          </NavLink>
          <NavLink to="/project/shot" className={() => `tab ${shooting ? "active" : ""}`} title={t("ws.shot")}>
            <span className="tab-ico"><IconShot size={15} /></span>
            <span className="tab-lbl">{t("ws.shot")}</span>
          </NavLink>
          <NavLink to="/project/print" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.print")}>
            <span className="tab-ico"><IconPrint size={15} /></span>
            <span className="tab-lbl">{t("ws.print")}</span>
          </NavLink>
          <NavLink to="/project/settings" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.settings")}>
            <span className="tab-ico"><IconGear size={15} /></span>
            <span className="tab-lbl">{t("ws.settings")}</span>
          </NavLink>
        </nav>
        <div className="row">
          <IconBtn title="撤销 Ctrl+Z" disabled={!past.length} onClick={undo}>
            <IconUndo />
          </IconBtn>
          <IconBtn title="重做 Ctrl+Y" disabled={!future.length} onClick={redo}>
            <IconRedo />
          </IconBtn>
          <span className="status-dot">{saving ? "保存中…" : dirty ? "未保存" : "已保存"}</span>
          <IconBtn title="保存到文件夹 Ctrl+S" onClick={() => void persist()}>
            <IconSave />
          </IconBtn>
          <IconBtn title="绑定 / 更换工程文件夹" onClick={() => void relinkFolder()}>
            <IconFolder />
          </IconBtn>
          <IconBtn title="导出合并 JSON" onClick={() => downloadProjectJson(current)}>
            <IconExport />
          </IconBtn>
          <button type="button" className="btn btn-small" onClick={() => downloadProjectZip(current)}>
            ZIP
          </button>
          <IconBtn title="快捷键 ?" onClick={() => setHelp(true)}>
            <IconHelp />
          </IconBtn>
          <PrefsMenu />
        </div>
      </header>
      {showPieceSub && (
        <nav className="tabs sub-tabs">
          <NavLink to="/project/specs" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.pieceSpec")}>
            <span className="tab-ico"><IconSpec size={15} /></span>
            <span className="tab-lbl">{t("ws.pieceSpec")}</span>
          </NavLink>
          <NavLink to="/project/template" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.blueprint")}>
            <span className="tab-ico"><IconLayers size={15} /></span>
            <span className="tab-lbl">{t("ws.blueprint")}</span>
          </NavLink>
          <NavLink to="/project/sets" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.sets")}>
            <span className="tab-ico"><IconGrid size={15} /></span>
            <span className="tab-lbl">{t("ws.sets")}</span>
          </NavLink>
          <NavLink to="/project/deck" className={({ isActive }) => `tab ${isActive ? "active" : ""}`} title={t("ws.deck")}>
            <span className="tab-ico"><IconCards size={15} /></span>
            <span className="tab-lbl">{t("ws.deck")}</span>
          </NavLink>
        </nav>
      )}
      {currentOrigin === "owned" && currentPath && !looksLikeFullPath(currentPath) && (
        <div className="banner">
          <span>{t("ws.needPath")}</span>
          <button className="btn btn-small btn-primary" onClick={() => void relinkFolder()}>
            {t("err.reselect")}
          </button>
        </div>
      )}
      {!hideReadonly && (currentOrigin === "subscribed" || currentOrigin === "example") && (
        <div className="banner">
          <span>{currentOrigin === "example" ? t("ws.readonlyEx") : t("ws.readonlySub")}</span>
          <button className="btn btn-small btn-primary" onClick={() => setCloneOpen(true)}>
            {currentOrigin === "example" ? t("ws.toBoard") : t("ws.saveAs")}
          </button>
          <button type="button" className="banner-x" aria-label="关闭" onClick={() => setHideReadonly(true)}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="banner">
          <span>{error}</span>
          <button className="btn btn-small" onClick={() => void relinkFolder()}>重新选择</button>
          <button type="button" className="banner-x" aria-label="关闭" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {info && (
        <div className="banner banner-ok">
          <span>{info}</span>
          <button type="button" className="banner-x" aria-label="关闭" onClick={() => setInfo(null)}>
            ×
          </button>
        </div>
      )}
      <div className="workspace-body">
        <div key={location.pathname} className="workspace-pane">
          <Outlet />
        </div>
      </div>
      <footer className="statusbar">
        <span>{currentPath ?? "未绑定文件夹"}</span>
        <span>缩放 {Math.round(view.zoom * 100)}%</span>
        <span>{face === "front" ? "正面" : "背面"}</span>
        <span>{selected ? `图层 ${selected.name}` : "未选图层"}</span>
        <span>
          {cardCount} 种 / {printCount} 张
        </span>
        <span>{Object.keys(current.assets).length} 素材</span>
        <span title="TMD">{versionStamp()}</span>
      </footer>
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      {cloneOpen && current && (
        <CreateProjectDialog
          cloneSource={{ name: current.meta.name, project: current, sourcePath: currentPath ?? undefined }}
          onClose={() => setCloneOpen(false)}
          onCreate={async (input) => {
            await create({ ...input, fromProject: current, sourcePath: input.sourcePath ?? currentPath ?? undefined });
            setCloneOpen(false);
            navigate("/project/template");
          }}
        />
      )}
      <OnboardingDock />
    </div>
  );
}
