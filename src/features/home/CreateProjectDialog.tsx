import { useMemo, useState, type DragEvent } from "react";
import { CARD_SIZE_PRESETS, DEFAULT_CARD_SIZE } from "@/model/sizes";
import { STARTER_TEMPLATES, type StarterId } from "@/model/starters";
import type { Project } from "@/model/types";
import { folderDisplayName, canPickDirectory } from "@/persist/fsAccess";
import {
  composeProjectPath,
  findOwnedPathConflict,
  inferSaveDirPath,
  looksLikeFullPath,
  pickDirectory,
  pickLocalFolder,
  readFileAsDataUrl,
} from "@/persist/storage";
import { folderNameOf } from "@/persist/nodeFs";
import { useAppStore } from "@/store/appStore";
import { Modal, armPickerGhostClick } from "@/ui/Modal";

export type PickedFolder = {
  handle?: FileSystemDirectoryHandle;
  name: string;
  path?: string;
};

type Props = {
  onClose: () => void;
  initialFolder?: PickedFolder | null;
  onFolderPicked?: (folder: PickedFolder) => void;
  /** 从案例 / 订阅 / 已有工程写入一个全新的本地文件夹 */
  cloneSource?: { name: string; project: Project; sourcePath?: string };
  onCreate: (input: {
    name: string;
    note?: string;
    size: { w: number; h: number };
    coverAsset?: string;
    starter?: StarterId;
    fromProject?: Project;
    handle?: FileSystemDirectoryHandle;
    makeSubfolder: boolean;
    parentPath?: string;
    pathLabel?: string;
    sourcePath?: string;
  }) => Promise<void>;
};

function applyHandle(
  dir: FileSystemDirectoryHandle,
  setFolder: (f: PickedFolder) => void,
  onFolderPicked?: (folder: PickedFolder) => void,
): string {
  const name = folderDisplayName(dir);
  const next = { handle: dir, name };
  setFolder(next);
  onFolderPicked?.(next);
  return name;
}

export function CreateProjectDialog({
  onClose,
  onCreate,
  initialFolder,
  onFolderPicked,
  cloneSource,
}: Props) {
  const isClone = Boolean(cloneSource);
  const projects = useAppStore((s) => s.index.projects);
  const [name, setName] = useState(cloneSource?.name ?? "未命名卡牌集");
  const [folder, setFolder] = useState<PickedFolder | null>(initialFolder ?? null);
  const [parentPath, setParentPath] = useState(() =>
    initialFolder ? inferSaveDirPath(initialFolder.name, useAppStore.getState().index.projects) : "",
  );
  const [makeSubfolder, setMakeSubfolder] = useState(true);
  const [note, setNote] = useState("");
  const [starter, setStarter] = useState<StarterId>("empty");
  const [preset, setPreset] = useState("poker");
  const [w, setW] = useState(cloneSource?.project.meta.defaultSize.w ?? DEFAULT_CARD_SIZE.w);
  const [h, setH] = useState(cloneSource?.project.meta.defaultSize.h ?? DEFAULT_CARD_SIZE.h);
  const [cover, setCover] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const localPath = useMemo(
    () => composeProjectPath(parentPath, name, makeSubfolder),
    [parentPath, name, makeSubfolder],
  );
  const pathClash = useMemo(
    () => (localPath ? findOwnedPathConflict(localPath, projects) : undefined),
    [localPath, projects],
  );

  function afterPick(dir: FileSystemDirectoryHandle) {
    const folderName = applyHandle(dir, setFolder, onFolderPicked);
    setParentPath((prev) => {
      if (looksLikeFullPath(prev) && prev.replace(/[\\/]+$/, "").toLowerCase().endsWith(folderName.toLowerCase())) {
        return prev.replace(/[\\/]+$/, "");
      }
      return inferSaveDirPath(folderName, projects) || prev;
    });
    setError(null);
  }

  async function onBrowseClick() {
    setError(null);
    try {
      const native = await pickLocalFolder();
      if (native === undefined) return;
      if (native) {
        setFolder({ name: folderNameOf(native), path: native });
        setParentPath(native);
        onFolderPicked?.({ name: folderNameOf(native), path: native });
        return;
      }
    } catch {
      /* fall back to browser picker */
    }
    if (!canPickDirectory()) {
      setError("当前浏览器不支持选择文件夹，请改用系统 Chrome 或 Edge 打开本页");
      return;
    }
    try {
      const dir = await pickDirectory();
      if (!dir) return;
      afterPick(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "选择文件夹失败");
    } finally {
      armPickerGhostClick();
    }
  }

  async function onFolderDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const item = [...e.dataTransfer.items].find((i) => i.kind === "file");
    const getter = (
      item as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle>;
      }
    )?.getAsFileSystemHandle;
    if (!getter) {
      setError("拖放未得到文件夹。请改用「浏览」。");
      return;
    }
    try {
      const handle = await getter.call(item);
      if (!handle || handle.kind !== "directory") {
        setError("请拖入文件夹，不要拖单个文件。");
        return;
      }
      afterPick(handle as FileSystemDirectoryHandle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "拖放文件夹失败");
    }
  }

  async function submit() {
    if (!name.trim()) {
      setError("请填写项目名称");
      return;
    }
    if (!folder && !looksLikeFullPath(parentPath)) {
      setError("请先浏览选择一个本地文件夹");
      return;
    }
    if (!looksLikeFullPath(parentPath)) {
      setError("浏览后会自动填入完整路径。若没有出现，请再选一次保存位置。");
      return;
    }
    if (pathClash) {
      setError(`路径已被工作板项目「${pathClash.name}」占用：${localPath}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        note: note.trim() || undefined,
        size: { w, h },
        coverAsset: cover,
        starter: isClone ? "empty" : starter,
        fromProject: cloneSource?.project,
        sourcePath: cloneSource?.sourcePath,
        handle: folder?.handle,
        makeSubfolder,
        parentPath: parentPath.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setBusy(false);
    }
  }

  const starterNames = STARTER_TEMPLATES.map((t) => t.name);

  function pickStarter(id: StarterId) {
    const info = STARTER_TEMPLATES.find((t) => t.id === id);
    setStarter(id);
    if (info) {
      setW(info.size.w);
      setH(info.size.h);
      const found = CARD_SIZE_PRESETS.find((p) => p.id !== "custom" && p.w === info.size.w && p.h === info.size.h);
      setPreset(found?.id ?? "custom");
      if (!name.trim() || starterNames.includes(name) || name === "未命名卡牌集") {
        setName(id === "empty" ? "未命名卡牌集" : info.name);
      }
    }
  }

  return (
    <Modal onClose={onClose} closeOnBackdrop={false}>
      <h2>{isClone ? "创建本地工程" : "新建项目"}</h2>
      {isClone && (
        <p className="hint" style={{ padding: 0, marginTop: -8 }}>
          将把「{cloneSource!.name}」写入保存位置下的同名文件夹。工作板只收录磁盘上的真实工程。
        </p>
      )}
      <div className="form">
        <div className="field">
          <label>项目名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {!isClone && (
          <div className="field">
            <label>以模版创建</label>
            <div className="starter-grid">
              {STARTER_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`starter-card ${starter === t.id ? "active" : ""}`}
                  onClick={() => pickStarter(t.id)}
                >
                  <strong>{t.name}</strong>
                  <span>{t.desc}</span>
                </button>
              ))}
            </div>
            <p className="hint" style={{ padding: 0 }}>
              默认空白。勾选模版后，创建才会带入该模版的蓝图和示例卡牌。
            </p>
          </div>
        )}
        <div className="field">
          <label>保存位置（必选）</label>
          <div
            className={`folder-drop ${dragOver ? "over" : ""} ${folder ? "has-folder" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => void onFolderDrop(e)}
          >
            {folder ? (
              <div className="folder-picked">
                <strong>{folder.path || parentPath || folder.name}</strong>
                <span>已选中，中文名称可以正常使用</span>
              </div>
            ) : (
              <span>点右侧浏览，选中后会自动填入完整路径</span>
            )}
            <button className="btn" type="button" onClick={() => void onBrowseClick()}>
              浏览…
            </button>
          </div>
          {looksLikeFullPath(parentPath) ? (
            <p className="hint" style={{ padding: 0, marginTop: 8 }}>
              保存位置路径已自动填入。
            </p>
          ) : (
          <div className="field" style={{ marginTop: 8 }}>
            <label>此位置的路径</label>
            <input
              value={parentPath}
              onChange={(e) => setParentPath(e.target.value)}
              placeholder={folder ? `例如 F:\\${folder.name}` : "例如 F:\\卡牌"}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="hint" style={{ padding: 0 }}>
              点「浏览」会弹出系统文件夹窗口并自动填入路径。
            </p>
          </div>
          )}
          <label className="row" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={makeSubfolder}
              onChange={(e) => setMakeSubfolder(e.target.checked)}
            />
            在保存位置下创建与项目同名的文件夹
          </label>
        </div>
        <div className="field">
          <label>本地路径（自动生成）</label>
          <input value={localPath || "选择保存位置并填写项目名称后生成"} readOnly spellCheck={false} />
          {pathClash && (
            <p className="hint" style={{ padding: 0, color: "var(--danger)" }}>
              与工作板「{pathClash.name}」路径重复，请改名称或换保存位置。
            </p>
          )}
        </div>
        {!isClone && (
          <div className="field">
            <label>默认卡牌尺寸</label>
            <select
              value={preset}
              onChange={(e) => {
                const id = e.target.value;
                setPreset(id);
                const found = CARD_SIZE_PRESETS.find((p) => p.id === id);
                if (found && id !== "custom") {
                  setW(found.w);
                  setH(found.h);
                }
              }}
            >
              {CARD_SIZE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.id !== "custom" ? `(${p.w}×${p.h} mm)` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isClone && preset === "custom" && (
          <div className="row">
            <div className="field grow">
              <label>宽 mm</label>
              <input type="number" value={w} onChange={(e) => setW(Number(e.target.value))} />
            </div>
            <div className="field grow">
              <label>高 mm</label>
              <input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} />
            </div>
          </div>
        )}
        <div className="field">
          <label>备注</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {!isClone && (
          <div className="field">
            <label>封面</label>
            <div className="cover-pick">
              {cover && <img src={cover} alt="" />}
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setCover(await readFileAsDataUrl(file));
                }}
              />
            </div>
          </div>
        )}
        {error && <div className="banner">{error}</div>}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || (!folder && !looksLikeFullPath(parentPath)) || Boolean(pathClash)}
            onClick={submit}
            type="button"
          >
            {busy ? "写入中…" : isClone ? "写入本地并打开" : "创建并打开"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
