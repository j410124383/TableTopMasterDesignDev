# 桌游大师（TMD）文档索引

> **文档是唯一真相来源。** 代码服从文档，而非对话碎片。

## 文档结构

| 文档 | 用途 |
|------|------|
| [vision.md](./vision.md) | 产品愿景、目标用户、核心场景 |
| [architecture.md](./architecture.md) | 技术栈、模块地图、状态与持久化 |
| [data-model.md](./data-model.md) | Project / Blueprint / CardSet 等数据结构 |
| [features/](./features/) | 各功能模块的交互规格与验收标准 |
| [changelog.md](./changelog.md) | 文档变更与代码同步记录 |

## 协作协议

### 你要加/改功能时

1. **只改文档**（通常是 `docs/features/*.md` 的「界面与交互」和「验收标准」；有新字段先改 [data-model.md](./data-model.md)）
2. 在 [changelog.md](./changelog.md) 写一行：`[待同步] 功能名 - 简述变更`
3. **先不要改代码。** 对 Agent 说：**「按文档同步 xxx」** 或 **「实现 changelog 里待同步的项」**

对话里描述需求 ≠ 可以开工写代码。Agent 应把需求落到文档后停下。

### Agent 维护代码时

1. 读相关 `docs/` 文件
2. 列出与代码的差异
3. 按最小 diff 实现
4. 对照「验收标准」自检
5. 把 changelog 中 `[待同步]` 改为 `[已同步 vX.Y.Z]`

### 优先级规则

| 场景 | 规则 |
|------|------|
| 你刚更新了 feature 文档 / 对话里提了新产品行为 | **文档先行**，changelog `[待同步]`，等「按文档同步」再改代码 |
| 发现代码 bug（与已有文档不符） | 先修 bug，changelog 记「待补文档」 |
| 文档写了但实现成本高 | Agent 说明，等你决定砍 scope 或分期 |

### `[反推]` 标记

初稿中标注 `[反推]` 的段落表示从现有代码反推、**未经产品确认**。审阅时请优先修改这些段落。

## 功能规格索引

桌游创作维度：

- [pieces.md](./features/pieces.md) — 卡牌（规格预览块、蓝图与数据集；纸厚与卡芯）
- [boards.md](./features/boards.md) — 板件（与包装盒并列；贴图 alpha 扣形 + 厚度）
- [packaging.md](./features/packaging.md) — 包装盒（方盒参数、一张贴图与铺法、棱倒角、每面 UV 壳、单盒渲染）
- [product-render.md](./features/product-render.md) — 产品渲染（场景库、透视/等距、控制杆、布局模版、描边与滤镜）
- [rulebook.md](./features/rulebook.md) — 说明书

卡牌内的现有能力：

- [template-editor.md](./features/template-editor.md) — 蓝图编辑、图层、变量绑定
- [sets-and-deck.md](./features/sets-and-deck.md) — 数据集浏览、卡组表格编辑
- [print-export.md](./features/print-export.md) — 打印拼版 / TTS / 单图；PDF 与 PNG/JPG 导出

其它：

- [play-mode.md](./features/play-mode.md) — 对战、联机、牌桌
- [workspace-home.md](./features/workspace-home.md) — 首页、项目、工作区
- [offline-pack.md](./features/offline-pack.md) — Windows / Mac 离线 zip（解压双击启动，内置 Node）
- [desktop-app.md](./features/desktop-app.md) — 日常用 TMD 窗口，不经系统浏览器；为后期序列帧打底
- [market-community.md](./features/market-community.md) — 市场、论坛、新闻
- [ui-consistency.md](./features/ui-consistency.md) — 颜色、文件导入、次级界面等 UI 约定
