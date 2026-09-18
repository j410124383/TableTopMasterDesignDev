# Agent 指南 — 桌游大师（TMD）

本项目的**唯一真相来源**是 [`docs/`](docs/) 目录下的规格文档。

## 所有更新文档先行（硬规则）

功能、交互、数据结构、UI **一律先改文档**。用户在对话里提的需求，先写入 `docs/` 和 changelog `[待同步]`，**不要直接改产品代码**。

等用户说「按文档同步」或「实现 changelog 里待同步的项」再动手。

例外：纯 bugfix（文档已有行为、实现写错）可先改代码，changelog 补 `[待补文档]`。

## 开始任何实现前

1. 读 [`docs/README.md`](docs/README.md) 了解协作协议
2. 读 [`docs/handbook.md`](docs/handbook.md)：**片区所有权**和「改 X 动哪」表。只动所属片区，复用已有轮子，禁止再抄一套 3D / 卡面 / 工作锁
3. 读相关规格：
   - 产品意图 → [`docs/vision.md`](docs/vision.md)
   - 架构约束 → [`docs/architecture.md`](docs/architecture.md)
   - 数据结构 → [`docs/data-model.md`](docs/data-model.md)
   - 功能细节 → [`docs/features/`](docs/features/) 对应文件
4. 检查 [`docs/changelog.md`](docs/changelog.md) 中的 `[待同步]` 项

## 优先级

- **文档与代码冲突时，以文档为准**（除非用户明确说「先改代码」）
- 标注 `[反推]` 的段落表示未经产品确认，实现时按现状对齐，用户修改文档后再同步
- 小范围 bugfix 可直接改代码，但须在 changelog 追加 `[待补文档]` 或简要说明

## 收到「按文档同步」类指令时

1. 确定范围（哪个 feature / changelog 条目）
2. 列出文档 vs 代码差异（简短 bullet）
3. 最小 diff 实现
4. 对照 feature 文档「验收标准」自检
5. 将 changelog `[待同步]` 改为 `[已同步 vX.Y.Z]`（版本见 package.json）

## 禁止

- 在文档未更新时擅自扩展产品行为
- 跳过 spec 直接按对话碎片改 UI/交互
- 修改 [`docs/changelog.md`](docs/changelog.md) 中用户写的 `[待同步]` 意图（仅可更新状态）

## 代码约定

- 遵循现有模块分层与 [handbook.md](docs/handbook.md) 片区边界
- 包装盒网格/印刷/材质只在 `features/box`；产品渲染只组合，不复制 tray / shader
- 数据变更经 `appStore.patchProject()`，保持 undo 栈
- 新字段先更新 data-model.md，再改 types.ts

## 项目命令

```bash
npm run dev      # 开发
npm run build    # 构建
npm run start    # 局域网访问 1420
```
