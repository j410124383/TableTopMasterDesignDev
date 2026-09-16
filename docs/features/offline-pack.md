# 离线包（Windows / Mac）

> 把工坊打成「解压就能开」的 zip，发给另一台电脑。不要求对方安装 Node.js，也不做签名的 `.app` / `.dmg`。

## 用户故事

- 作为 Windows 用户，我希望解压后双击 bat，浏览器里打开工坊。
- 作为用苹果电脑（Apple 芯片）的人，我希望拿到一份 Mac 专用 zip，解压后双击启动脚本，不必自己装 Node。
- 作为打包的人，我希望在 **Windows 上就能打出 Mac 包**（下载 macOS 版 Node 打进 zip），不必找一台 Mac 来编译。

## 范围

**做**：

- Windows 离线 zip（现有能力保留）
- **Mac 离线 zip**（Apple 芯片 `darwin-arm64`）
- 一次 `npm run pack` 打出两份；落地页 / 首页可分别下载

**不做**：

- Intel Mac（`darwin-x64`）
- Linux 包
- Tauri `.app` / `.dmg`、苹果签名与公证（窗口版 Mac 包见 [desktop-app.md](./desktop-app.md)，须在 Mac 上编）
- 把 Windows 的 `node.exe` 塞进 Mac 包（对方打不开）

## 产物

| 文件 | 对象 | 启动 |
|------|------|------|
| `TMD-offline.zip` | Windows x64 | **`TMD.exe`**（`打开卡牌工坊.bat` 可作后备） |
| `TMD-offline-mac.zip` | macOS Apple 芯片（M 系列） | `打开卡牌工坊.command` |

两份都写入 `release/`，并复制到 `public/`，开发站刷新后可下载。

Windows 文件名 **不要改**（已有人按 `TMD-offline.zip` 下）。Mac 用带 `-mac` 的名字，避免把 Windows 包误发给苹果电脑。

包内都带对应系统的 Node.js（版本与现网 Windows 包同一档，当前 22.x），对方 **不用** 去 nodejs.org、**不用 VPN**。第一次启动若还没有 `node_modules`，脚本用国内镜像 `npm install`。

两包源码与版本号相同。联机仍要求两边 **同一版本 zip**；Windows 与 Mac 互开房可以，只要版本/协议一致。

## 界面与交互

### 落地页（`/`）

下载区两个主按钮，并排：

1. **下载 Windows** — `TMD-offline.zip`（有文件才可点，没有则禁用并提示站长跑 `npm run pack`）
2. **下载 Mac（Apple 芯片）** — `TMD-offline-mac.zip`（同样：有文件才可点）

按钮文案带版本号，例如「下载 Windows v0.3.19」。缺哪份只禁用哪颗，不要两份都没有时假装能下。

三步说明按系统写清，不要只写 bat：

1. 下载对应系统的 zip
2. 解压成真正的文件夹（不要只在压缩包里双击）
3. Windows：双击 **`TMD.exe`**，出现 TMD 窗口（不是系统浏览器）；关掉窗口即结束。Mac：双击 `打开卡牌工坊.command`，不要关终端。浏览器打开 `http://localhost:1420/`。Mac 请用 **Chrome 或 Edge**，不要用 Safari。

Mac 额外一句（可放步骤旁或包内 `使用说明.txt`）：若系统提示无法打开未识别的开发者，**右键 → 打开**；若双击没反应，打开「终端」进入解压目录执行 `chmod +x 打开卡牌工坊.command` 后再双击。

### 工作室首页「下载与发送」

与落地页一致：Windows / Mac 两个下载链接；缺哪份显示哪份还没打好。说明里写清苹果电脑下 `-mac` 那份。

## 打包命令

在 **Windows 开发机**上：

```bash
npm run pack
```

一次打出 Windows + Mac 两份 zip。允许内置 Node 按需下载（Windows zip 与 macOS tarball 各一份，缓存在 `vendor/`，互不覆盖）。

不必单独再跑 `pack:mac`；若实现成分命令，`pack` 仍须打齐两份。

## Mac 启动脚本

`打开卡牌工坊.command`：

- 切到脚本所在目录（解压后的工坊根）
- 使用包内 macOS Node，**不要**依赖系统全局 Node
- 启动前对脚本自身和内置 `node` 做 `chmod +x`（Windows 打的 zip 经常丢掉 Unix 可执行位）
- 无 `node_modules` 时：`npm install --registry=https://registry.npmmirror.com`
- 打印本机与局域网地址（与 Windows 黑窗口同一套信息，防火墙那行 Windows 专用命令可改成 macOS 提示或省略）
- `npm run start`，并用 `open http://localhost:1420/` 打开默认浏览器
- 终端保持开着；关掉即停服务

包内 `使用说明.txt` 用 Mac 步骤（解压、双击 `.command`、右键打开、Chrome），不要照抄 Windows 的 bat / 防火墙 netsh。

## 验收标准

- [ ] `npm run pack` 在 Windows 上生成 `release/TMD-offline.zip` 与 `release/TMD-offline-mac.zip`，并复制到 `public/`
- [ ] Windows 包仍含 `打开卡牌工坊.bat` + Windows `node.exe`，行为与现在一致
- [ ] Mac 包含 `打开卡牌工坊.command` + macOS `darwin-arm64` 的 Node，**不含** `node.exe`
- [ ] Mac 包可在 Apple 芯片 Mac 上解压后启动，浏览器打开 `http://localhost:1420/`，不必预先安装 Node
- [ ] 落地页与首页能分别下载两份；缺文件的按钮禁用并说明原因
- [ ] Mac 使用说明写明右键打开、chmod、用 Chrome/Edge

## 已知限制 / 不做

- 不做 Intel Mac 包
- 不做签名应用；Gatekeeper 可能拦第一次打开
- Safari 的文件夹选取能力弱，Mac 试用以 Chrome / Edge 为准
- 不在 Windows 上交叉编译 Tauri `.app`

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-10 | 新增 Mac（Apple 芯片）离线 zip；Windows 上一次 pack 打出两份 |
