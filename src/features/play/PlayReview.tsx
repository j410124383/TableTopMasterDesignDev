import type { CardReview } from "./playTypes";

export type ReviewRow = { id: string; name: string; score: number; text: string };

export function PlayReview({
  rows,
  focusId,
  onFocus,
  onChange,
  onDelete,
  onSendChat,
  onClose,
  onExport,
}: {
  rows: ReviewRow[];
  focusId: string | null;
  onFocus: (id: string) => void;
  onChange: (id: string, next: CardReview) => void;
  onDelete: (id: string) => void;
  onSendChat: (row: ReviewRow) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  const focus = rows.find((r) => r.id === focusId) ?? rows[0];
  return (
    <aside className="play-review play-review-dock" onPointerDown={(e) => e.stopPropagation()}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>批注</strong>
        <button type="button" className="btn btn-small" onClick={onClose}>
          关闭
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        独立窗口。右键卡牌可写批注。可编辑、删除，或发到聊天一起看。
      </p>
      {rows.length === 0 ? (
        <p className="muted">还没有批注。右键一张牌选「写批注」。</p>
      ) : (
        <ul className="play-review-list">
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" className={row.id === focus?.id ? "active" : ""} onClick={() => onFocus(row.id)}>
                {row.name} · {row.score}/10
              </button>
            </li>
          ))}
        </ul>
      )}
      {focus && (
        <>
          <p>{focus.name}</p>
          <label className="field">
            分数 {focus.score}
            <input
              type="range"
              min={1}
              max={10}
              value={focus.score}
              onChange={(e) => onChange(focus.id, { score: Number(e.target.value), text: focus.text })}
            />
          </label>
          <label className="field">
            批注
            <textarea
              value={focus.text}
              onChange={(e) => onChange(focus.id, { score: focus.score, text: e.target.value })}
            />
          </label>
          <div className="row">
            <button type="button" className="btn btn-small" onClick={() => onSendChat(focus)}>
              发到聊天
            </button>
            <button type="button" className="btn btn-small btn-danger" onClick={() => onDelete(focus.id)}>
              删除
            </button>
          </div>
        </>
      )}
      <button type="button" className="btn btn-small" onClick={onExport}>
        导出会议纪要 MD
      </button>
    </aside>
  );
}

export function reviewsToMarkdown(projectName: string, rows: { name: string; score: number; text: string }[]) {
  const lines = [`# ${projectName} 试玩纪要`, "", ...rows.map((r) => `## ${r.name}\n- 分数：${r.score}/10\n- 评语：${r.text || "（无）"}\n`)];
  return lines.join("\n");
}
