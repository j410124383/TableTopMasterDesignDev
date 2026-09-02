import { useEffect, useState } from "react";

const KEY = "ceditor-play-notebook";

function loadNote() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function PlayNotebook({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(loadNote);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, text);
    } catch {
      /* ignore */
    }
  }, [text]);

  return (
    <aside className="play-notebook" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>私密笔记本</strong>
        <button type="button" className="btn btn-small" onClick={onClose}>
          关闭
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        只有你能看见，不会同步给桌上其他人。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="记暗号、手牌、计谋…"
      />
    </aside>
  );
}
