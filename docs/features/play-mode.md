# 对战模式（Play Mode）

> `[反推]` 路由：`/play`（独立）、`/project/stage`（项目内 setup）。源码：`src/features/play/`。

## 用户故事

- 作为玩家，我希望在虚拟牌桌上洗牌、发牌、拖拽卡牌，以便测试游戏流程。
- 作为主持人，我希望开房间让朋友联机，局域网或广域网加入。
- 作为设计者，我希望用当前项目的卡牌集直接上桌，无需额外导出。

## 界面与交互

### 入口

- **HomePage** 对战 Tab：房间列表、局域网/广域网/中继邀请
- **/play**：独立对战页，可不带项目（join by code）
- **/project/stage**：`PlayPage setupMode` — 选集、布局后开桌

### 牌桌（PlayPage）

`[反推]` 核心能力：

| 能力 | 说明 |
|------|------|
| 牌堆 | 多 pile，拖拽整堆移动 |
| 手牌 | 每人手牌区，face up/down |
| 发牌 | dealNToEach、洗牌 shuffle |
| 传牌 | passHandsClockwise |
| 卡牌拖拽 | 单卡在堆间移动 |
| 缩放平移 | 牌桌视口 |
| 道具 | token、计数器（PlayToolbox） |
| 笔迹 | PlayDrawLayer 共享标注 |
| 聊天 | PlayChat |
| 笔记 | PlayNotebook |
| 复盘 | PlayReview → Markdown 导出 |
| 天气/主题 | playLookStore 装饰 |
| BGM | playBgm 背景音乐 |

### 联机

`[反推]`

- **PeerJS** P2P 数据同步（playNet.ts）
- **房间 API**（roomsApi.ts）：发布/取消发布、加入门禁
- 邀请方式：
  - LanInvite — 局域网
  - WanInvite — 广域网
  - ZtInvite — 中继
- JoinWaitPanel — 加入等待与诊断（joinDiag.ts）
- playSync — 状态包同步（makePackBuffer / sendPlayBundle）
- 协议版本：PLAY_PROTOCOL（appVersion.ts）

### 卡牌渲染

- playCardCache — 对战专用缩略图缓存
- 从 Project sets + blueprints 解析 Template 渲染
- warmPlayCardCache 预热

### 玩家

- playProfileStore — 昵称、头像、颜色
- PlayRoster — 座位列表
- withRoomSeats — 房间座位分配

## 数据与状态

- 牌桌运行时状态：**非持久化**（内存 + P2P 同步）
- `Project.playSetup` — 默认桌布布局快照（可选保存）
- playTypes：Piece, PlayPlayer, PlayProp, PlayStroke, CardReview 等

## 验收标准

- [ ] 单机可洗牌、发牌、拖拽卡与牌堆
- [ ] 开房后另一浏览器/设备可加入
- [ ] 联机后牌桌状态一致（拖拽、发牌同步）
- [ ] 项目内 stage 可选择卡牌集上桌
- [ ] 加入失败时诊断步骤可读（joinDiag）
- [ ] 聊天、笔迹在联机时同步
- [ ] 卡面缩略图与项目 fields 一致

## 已知限制 / 不做

`[反推]`

- 无内置 TCG/桌游规则引擎（无自动响应「出牌合法性」）
- 无防作弊、无权威服务器裁决
- 广域网联机依赖 PeerJS/中继，网络环境受限时可能失败
- 复杂多人状态冲突采用 last-write 式同步，非 CRDT

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-02 | `[反推]` 初稿 |
