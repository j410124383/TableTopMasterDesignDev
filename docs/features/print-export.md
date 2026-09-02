# 打印与导出（Print & Export）

> `[反推]` 路由：`/project/print`。源码：`src/features/print/`。

## 用户故事

- 作为设计者，我希望在 A4 等纸张上自动拼版多张卡，以便家用打印机输出。
- 作为设计者，我希望导出 PDF 或 PNG，并可选裁切线、双面。
- 作为设计者，我希望一次导出多个卡牌集。

## 界面与交互

### 拼版设置（左侧）

`[反推]` `PrintSettings` 字段：

| 设置 | 选项 |
|------|------|
| 卡牌集 | 多选 checkbox，全选/清空 |
| 纸张 | A4 / Letter / Legal / Tabloid / 自定义 |
| 方向 | 纵/横 |
| 边距、间距、出血 | mm 数值 |
| 裁切线 | 开关、颜色、长度 |
| 偏移 X/Y | mm |
| 双面 | duplex |
| DPI | 导出分辨率 |
| 文件名模板 | 支持 {project} {deck} {index} {face} 等 |
| 模式 | print（标准）/ tts（桌游模拟器行列拼版） |

设置写入 `Project.print`，修改 debounce merge。

### 预览（右侧）

- 按页浏览拼版结果（SheetCards）
- 分页交互与图鉴一致：`1 2 3 … n` + 输入跳转（见 [ui-consistency.md](./ui-consistency.md)）
- 切换正面/背面预览
- 缩放 slider
- 范围：全部页 / 当前页
- 显示每页槽位数与总页数

### 导出动作

`[反推]`

- **导出 PDF** — `exportPrintPdf()`，pdf-lib 生成
- **导出 PNG** — 单卡或按页批量 `exportCardPngs()`
- 导出时显示 busy / progress / error
- 下载经 `downloadBytes()`

### 拼版逻辑

- `buildPrintJobs()` — 按选中 sets 生成 jobs
- `flattenPrintPages()` — 双面时正背配对
- `layoutSheets.ts` — 计算纸上能放几张、分页

## 数据与状态

- 持久化：`Project.print?: PrintSettings`
- 默认：`DEFAULT_PRINT` from `model/defaults`
- 渲染 DPI：`PRINT_DPI`（导出），预览 DPI 独立

## 验收标准

- [ ] 切换纸张/方向后预览页数更新
- [ ] 拼版预览分页为 `1 2 3 … n` 且可输入跳转
- [ ] 多卡牌集选中后合并导出
- [ ] PDF 下载成功，尺寸与 mm 设置一致
- [ ] 裁切线、出血在导出中可见（若开启）
- [ ] duplex 模式正背页配对正确
- [ ] 文件名模板替换正确
- [ ] print 设置关闭项目再打开仍保留

## 已知限制 / 不做

`[反推]`

- 不含专业印刷 CMYK 分色
- 不含刀模 PDF/X-4 标准
- TTS 模式为特殊拼版，非通用桌游箱规则

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-02 | `[反推]` 初稿 |
| 2026-09-02 | 拼版预览分页与图鉴统一：1…n + 跳转 |
