const GROUPS = [
  {
    title: "项目",
    items: [
      ["Ctrl + S", "保存到工程文件夹"],
      ["Ctrl + Z / Y", "撤销 / 重做"],
      ["Ctrl + Shift + F", "显示工程文件夹名"],
      ["?", "打开此快捷键说明"],
    ],
  },
  {
    title: "画布",
    items: [
      ["滚轮", "缩放"],
      ["右键 / 中键 / 空格拖拽", "平移"],
      ["双击画布 / Home", "适合窗口"],
      ["End", "100% 居中"],
      ["Ctrl + G", "网格显隐"],
      ["Ctrl + B", "出血显隐"],
      ["Shift 拖拽", "轴向移动"],
    ],
  },
  {
    title: "图层",
    items: [
      ["Ctrl + C / V / D", "复制 / 粘贴 / 再制"],
      ["Delete", "删除选中图层"],
      ["Ctrl + ↑ / ↓", "调整图层顺序"],
      ["F2", "重命名图层"],
      ["Esc", "取消选中"],
    ],
  },
];

type Props = { onClose: () => void };

export function ShortcutsHelp({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>快捷键</h2>
        <div className="shortcut-grid">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h4>{g.title}</h4>
              <dl>
                {g.items.map(([k, v]) => (
                  <div key={k} className="shortcut-row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="button" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
