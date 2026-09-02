# 市场与社区（Market & Community）

> `[反推]` 路由：`/market` 或 HomePage 内嵌。数据：`data/market/`、`data/forum/`。源码：`src/features/market/`、`forum/`、`news/`。

## 用户故事

- 作为用户，我希望浏览官方/用户上架的项目并订阅到本地。
- 作为作者，我希望把自己的项目上架到市场。
- 作为社区成员，我希望在论坛发帖、看新闻。

## 界面与交互

### 市场（MarketPage）

`[反推]`

**Tab**：

- 发现 — 全部 market items
- 我的 — 当前用户上架项

**MarketItem 字段**：

id, name, author, kind, desc, cover, rating, rates, subs, ownerId, official, projectId

**操作**：

- 浏览列表、查看详情
- **订阅** — subscribeMarket → 本地 index 增加 origin=subscribed 条目
- **取消订阅** — unsubscribeMarket
- **上架** — uploadMarket：从 owned 项目选择，填描述
- **更新/下架** — updateMarket / unlistMarket
- 官方种子：ensureOfficialMarket / marketSeed

**API**：开发服务器 `GET/POST /__market`（静态 data 或 vite 插件）

### 论坛（ForumPage）

`[反推]`

- 读取 `GET /__forum` → threads.json
- 发帖 POST title/body/author（playProfile 昵称）
- 回复帖子
- 服务不可用时显示 forum.down

### 新闻（NewsPage）

`[反推]`

- 静态新闻数据 newsData.ts
- 展示更新公告、版本信息

## 数据与状态

- `data/market/index.json` + `data/market/items/*`
- `data/forum/threads.json`
- AppIndexEntry.marketId / origin=subscribed 关联订阅
- marketAuthorId() — 本机作者标识（非登录账号）

## 验收标准

- [ ] 市场列表可加载，官方项可见
- [ ] 订阅后项目出现在首页且可打开
- [ ] 取消订阅后从列表移除
- [ ]  owned 项目可上架、更新描述、下架
- [ ] 论坛可发帖、回复、刷新列表
- [ ] 新闻页可浏览条目

## 已知限制 / 不做

`[反推]`

- 无真实用户账号/OAuth，作者 ID 为本地生成
- 市场数据为静态文件 + 开发服务器 API，非生产级 CDN
- 无付费、无 DRM、无下载计数防刷
- 论坛无 moderation、无 rich text

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-02 | `[反推]` 初稿 |
