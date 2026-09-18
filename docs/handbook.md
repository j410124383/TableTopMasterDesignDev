# 程序手册 — 片区、轮子、怎么改才快

给 **改代码的人 / Agent** 看，不是给玩家看的说明书。产品交互仍以 [`features/`](./features/) 为准。本文件回答三件事：改哪一片、调用哪个现成轮子、怎样避免把全仓拖进一次微调。

入口：[AGENTS.md](../AGENTS.md) → 本手册 → 对应 `docs/features/*.md`。

## 为什么微调会超过 5 分钟

仓库分层本身是清楚的（`features/` 按路由、`model/` 管数据、`BoxGl` 共用）。慢，是因为 **一次需求被当成全仓 3D 重写**：

| 慢的原因 | 实际例子 |
|----------|----------|
| 跨片区复制 | 产品渲染自己用 `boxMesh` 冒充天地盒，丢掉 `coverBase`，包装页好好的、场景里「丢失」 |
| 缓存键绑错生命周期 | `lidOpen` 写进贴图 cache key → 开合变成重载印刷图 + 工作锁 |
| 文档入口散 | `architecture.md` 仍标 `[反推]`、桌面栈还写 Tauri；Agent 每次重新摸文件 |
| 没有所有权 | 改套合轴去动 shader、改镜头去重建网格、改底色去换 `assets` 引用 |

**优化策略不是推倒重写。** 先把片区钉死、轮子强制复用；viewport 合并这类清理单独立项，禁止夹在修 bug 里做。

## 片区（独立维护边界）

每个片区只拥有自己的网格/贴图/页面。跨片区 **只通过已经存在的函数** 拿结果，禁止把实现再抄一份。

```
卡牌 2D          板件           包装 3D              产品场景              影棚
drawCard.ts      boardCutout    boxGeom / boxDraw    shotResolve 只组合    模版+演员+播放条
sets / print     BoardPage      BoxPage / BoxGl      ShotPage / gizmo      StudioPage
     \              \                \                     \                    /
      \              \                +---- BoxGl.drawScene <------------------+
       +---- 卡面 PNG --------------------------------------+
                              数据一律 appStore.patchProject
```

| 片区 | 目录 | 拥有 | 禁止拥有 |
|------|------|------|----------|
| **卡牌 2D** | `src/features/template` `sets` `deck` `print`；`src/render/` | 蓝图图层、卡面烘焙、拼版导出 | 包装托盘网格、WebGL shader |
| **板件** | `src/features/board`；`src/model/board.ts` | alpha 扣形 + 厚度 | 包装 UV、卡牌圆角冒充板 |
| **包装 3D** | `src/features/box`；`src/model/box.ts` | 方盒/天地盒网格、UV、印刷铺法、材质、开合位移、单盒视口 | 场景实例、`ProductShotItem`、变换控制杆 |
| **产品场景** | `src/features/shot`；`src/model/shot.ts` `shotCamera.ts` | 场景物件位姿、卡牌集形态、摄像机、后期、实例 `lidOpen`；**只出静帧**；**场景模型导出器（ASCII FBX）** | tray 建模、烫金 shader、印刷 `textureFit`、序列帧按钮 |
| **影棚** | `src/features/studio`；`src/model/studio.ts` | 模版、演员槽、操作机/渲染机、轨迹、主光跟随、开盒整体居中、演员 `stack`/`lidOpen`、播放进度、序列写盘；布景只 **引用** `ProductShot`；导出模型只 **调用** 场景导出器 | 自由控制杆、tray 建模、第二套 WebGL、第二套网格拼接、把序列做回产品渲染页、在包装页改开盒居中 |
| **对战** | `src/features/play` | 牌桌、联机、房间 | 包装网格、产品摄像机、影棚模版 |
| **桌面壳** | `desktop/` `scripts/` `plugins/` | TMD.exe、sidecar、`/__fs/` | 任何产品几何 |
| **共用 UI** | `src/ui/` | 颜色、分页、分栏、工作锁、问号 | 业务页私有再造一套 |
| **数据** | `src/model/` `src/persist/` `src/store/appStore.ts` | 类型、归一化、undo | 页面 JSX |

**所有权测试**：改完之后，diff 是否只落在 1 个片区 + 必要的 1 个调用点？超过两个片区改实现（不是改一句调用），先停下来。

## 必须复用的轮子

新功能先查这张表。表里有的，**禁止再写一个**。

| 要做的事 | 调用 | 规格 |
|----------|------|------|
| 画一只包装盒（含天地、内外壁、烫金/UV） | `resolvePackagingDrawItems` / `packagingPartMeshes` / `packagingLookOf`（`boxDraw.ts` `boxGeom.ts`） | [packaging.md](./features/packaging.md) |
| 天盒拉开 | `boxLidLiftVec` + 位移；网格按 **合盖** 建，开合不当贴图过期 | 同上；产品实例用 `item.lidOpen` |
| 印刷盖住底色 | `SceneDrawItem.coverBase = true` | 包装材质；产品场景必须原样传下去 |
| 画 3D 场景 | `BoxGl.drawScene` | 禁止第二套 WebGL |
| 分辨率红框 / 中键平移 | `filmGate.ts` | 包装与产品共用 |
| 角落前/后/左/右 | `axisWidget.ts` | 同上 |
| 导出 PNG 到 `渲染图/` | `saveRenderPng.ts` | 包装与产品共用 |
| 写出序列帧到 `序列帧/` | 同一套出图路径，按帧改位姿再写 | 只在影棚；禁止产品渲染页再做一份 |
| 导出模型到 `导出模型/` | 产品场景一套导出器（走 `shotResolve` / `boxDraw` 已有网格，写 ASCII FBX） | [product-render.md](./features/product-render.md)；影棚只调用，导当前播放头 |
| 卡面 / 卡背 | `render/drawCard.ts` + `cardCache` | 蓝图、打印、对战、产品卡 都走这里 |
| 板件扣形 | `boardCutout.ts` | [boards.md](./features/boards.md) |
| 颜色 | `ColorField` | [ui-consistency.md](./features/ui-consistency.md) |
| 工作锁 | `ui/WorkLock` | 只锁读图/出图/写盘 |
| 分页 / 分栏 / 问号 | `Pager` `Splitter` `HelpTip` | 同上 |
| 改项目数据 | `appStore.patchProject(recipe, { mergeKey })` | 320ms 同 key 合并 undo |
| 毫米↔像素 | `lib/mm.ts` | 禁止各页自己乘 DPI |

## 改 X 动哪几份（速查）

先改对应 feature 文档和 changelog，再按下表动代码。**只动表里的文件。**

| 用户说 | 文档 | 代码（通常就这些） |
|--------|------|-------------------|
| 天地盒口/套合轴/壁厚/帽盖尺寸 | packaging.md、data-model | `model/box.ts` `boxGeom.ts`；页面 `BoxPage.tsx` |
| 天盒口沿半圆抠手（上下/左右开口、半径） | packaging.md、data-model | `model/box.ts` `boxGeom.ts`（只改天盒开口圈网格）；`BoxPage.tsx` 勾选+半径。产品/影棚只吃 `packagingPartMeshes`，禁止第二套缺口 |
| 包装 UV / 铺法 | packaging.md | `UvEditor.tsx` `boxTexture.ts`；网格采样仍在 `boxGeom.ts` |
| 底色、金属、烫金、UV 光油 | packaging.md、data-model | `boxGl.ts`（shader）`boxDraw.ts`（look）`BoxPage.tsx`（滑条） |
| 包装视口开合跟手 | packaging.md | `BoxViewport.tsx` 预览位移；**松手**才 `lidOpen` |
| 产品场景里盒子丢了 / 贴图镂空 | product-render.md | `shotResolve.ts`：调用 `boxDraw`，**保留 `coverBase`**；占位用 `packagingPartMeshes` 不是 `boxMesh` |
| 产品场景里开合 | product-render.md、data-model `ProductShotItem.lidOpen` | `ShotPage.tsx` 控件；`shotResolve` **compose 位移**；cache key **不含** `lidOpen` |
| 宣传镜头 / 转台 / 开盒视频 / 卡牌排列序列 | studio.md、data-model `Studio` | `features/studio`；盒子仍 `boxDraw`；布景调用 `shotResolve`（冻结、去掉与演员重复的件）；播放条不准出锁 |
| 影棚灯/FOV、操作机≠渲染机、转台轨迹 | studio.md、data-model `viewCamera` / `lookThrough` | `StudioPage` 右栏照抄 ShotPage 灯/机控件；视口画渲染机锥体+圆轨迹（导出不含）；拖轨道只改 `lookThrough` 那台 |
| 转台主光跟随 | studio.md `lightsFollowTurn` | 预览/序列把 key.yaw += 转台 Δyaw；**不准**进贴图 cache、不准出锁 |
| 影棚开盒居中（不要天盒往外冒） | studio.md | 只在影棚 compose 补偿位移，钉天+地 AABB 中心；**不改** `boxLidLiftVec` / 包装预览 |
| 影棚演员形态 / 开合 | studio.md、data-model `StudioActor` | 控件复用 ShotPage 选中物体；写入演员 `stack`/`face`/`lidOpen`；模版 Tab 只留秒数 |
| 导出模型给 Maya | product-render.md、studio.md | `features/shot` 写 ASCII FBX；影棚调用；目录 `导出模型/`；禁止第二套 tessellate |
| 卡面圆角/纸厚/卡芯 | pieces.md | `model/piece.ts`；产品薄片 `shotResolve` `roundedSlabMesh` |
| 卡牌集牌组/一字/扇形 | product-render.md | `shotStack.ts` 只动形态；不要改 `boxGeom` |
| 控制杆 / 世界本地轴 | product-render.md | `shotGizmo.ts` |
| 工作锁误伤转镜头 | ui-consistency.md、`.cursor/rules/work-lock.mdc` | 视口的贴图签名不要用 `assets` 对象身份；不要 `patchProject` 就 lock |
| 窗口最大化、启动版本号 | desktop-app.md | `desktop/Program.cs`；版本读 `package.json` |
| 打印拼版 | print-export.md | `features/print/*`；卡图仍 `drawCard` |

产品渲染里的包装盒：**包装片区出 mesh+贴图+look，场景片区只乘 `itemModel` 和开合位移。** `shotResolve` 里盒子分支应短，长了就是又造轮子。

## 缓存与工作锁（别把预览变成加载）

三层生命周期必须分开：

| 层 | 何时重建 | 例子 |
|----|----------|------|
| **贴图** | assetId / 铺法 / 印刷图字节变了 | `loadPackagingLayerTextures` |
| **网格** | 长宽高、壁厚、套合轴、UV 壳、倒角、天盒口沿缺口 | `packagingPartMeshes(..., lidOpen=0)` |
| **位姿** | 摄像机、物件 transform、开合、底色、灯光、**影棚播放进度 / 主光跟随** | 只改 uniform / matrix，**不出锁** |

禁止：

- 把 `lidOpen`、摄像机、`assets` 对象引用放进贴图 cache key
- 任何 `patchProject` 都 `WorkLock`
- 为了开合预览重跑 `ensureBoxFaces` / `loadFittedBoxTexture`

## 数据怎么改

1. 新字段：先 `docs/data-model.md`，再 `src/model/types.ts`，再 `normalize`（旧工程缺省）。
2. 运行时写入：`patchProject`；滑条用 `mergeKey`（如 `shot-lid`、`box-orbit`）。
3. 场景实例 ≠ 资产：`ProductShotItem.lidOpen` 覆盖包装盒 `box.lidOpen`，不要为了拍一张开盒图去改包装页默认。

## 以后怎么维护才快

1. **先翻本手册「改 X 动哪」**，再读那一份 feature。不要从 `src/` 全文搜索开始。
2. **直接改** = 同一轮写文档 + 实现，但 diff 仍受片区约束。
3. 纯 bugfix：文档已有行为、代码写错 → 先改代码，changelog `[待补文档]`。
4. 发现缺轮子：提到共用层（`boxDraw` / `ui/`），不要在页面里长出第二份。
5. 一次 PR / 一轮对话不要还历史债。下面「以后再做」单独立项。

## 以后再做（不要夹带）

这些能减重复，但会碰到所有 3D 页，必须单独开需求：

- 抽出共用视口壳（轨道、红框、小坐标、WorkLock 策略），`BoxViewport` / `ShotViewport` / 影棚视口只留差异
- `architecture.md` 去掉过时 `[反推]`（日常窗口是 WebView2 `TMD.exe`，不是 Tauri）
- 产品渲染错落层厚 `[待补文档]`
- 影棚后期：开盒后出牌模版、成片清单、GLB 布景（见 studio.md「后期做」）

## 自检（改完 30 秒）

- [ ] 只动了一个片区的实现，外加必要调用？
- [ ] 盒子仍走 `boxDraw` / `coverBase`，没有新的实心 `boxMesh` 占位？
- [ ] 开合/镜头/底色/影棚播放条没有进贴图加载、没有工作锁？
- [ ] 颜色/锁/分页/分栏用的是 `src/ui`？
- [ ] changelog 状态对（待同步 / 已同步 / 待补文档）？
