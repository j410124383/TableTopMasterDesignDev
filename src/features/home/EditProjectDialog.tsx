import { useState } from "react";
import type { AppIndexEntry } from "@/model/types";
import { readFileAsDataUrl } from "@/persist/storage";
import { Modal } from "@/ui/Modal";

type Props = {
  entry: AppIndexEntry;
  coverSrc?: string;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    note?: string;
    coverAsset?: string;
    localPath?: string;
  }) => Promise<void>;
};

export function EditProjectDialog({ entry, coverSrc, onClose, onSave }: Props) {
  const [name, setName] = useState(entry.name);
  const [note, setNote] = useState(entry.note ?? "");
  const [localPath, setLocalPath] = useState(entry.localPath ?? entry.path ?? "");
  const [cover, setCover] = useState<string | undefined>(coverSrc);
  const [busy, setBusy] = useState(false);

  return (
    <Modal onClose={onClose} closeOnBackdrop={false}>
        <h2>项目信息</h2>
        <div className="form">
          <div className="field">
            <label>名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>备注</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
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
          <div className="field">
            <label>本地文件夹</label>
            <input
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="例如 F:\卡牌\三国杀"
              spellCheck={false}
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={onClose} type="button">
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !name.trim()}
              type="button"
              onClick={async () => {
                setBusy(true);
                await onSave({
                  name: name.trim(),
                  note: note.trim() || undefined,
                  coverAsset: cover,
                  localPath: localPath.trim() || undefined,
                });
              }}
            >
              保存
            </button>
          </div>
        </div>
    </Modal>
  );
}
