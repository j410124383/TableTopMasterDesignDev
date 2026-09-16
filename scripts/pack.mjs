import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, copyFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { execSync } from "node:child_process";
import { ensureBundledNode, bundledNodeDir } from "./ensure-node.mjs";
import { makePackedInfo, versionNotes, versionText } from "./version.mjs";
import { zipDirectory } from "./zipdir.mjs";

const root = resolve(import.meta.dirname, "..");
const packed = makePackedInfo();
const releaseDir = join(root, "release");
const staging = join(releaseDir, `TMD-${packed.version}`);
const stagingMac = join(releaseDir, `TMD-${packed.version}-mac`);

const zipWinName = "TMD-offline.zip";
const zipMacName = "TMD-offline-mac.zip";
const zipWinPath = join(releaseDir, zipWinName);
const zipMacPath = join(releaseDir, zipMacName);

await ensureBundledNode(root, "win");
await ensureBundledNode(root, "mac");

const include = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "index.html",
  "src",
  "plugins",
  "public",
  "scripts/print-lan.mjs",
  "scripts/version.mjs",
  "scripts/lanDetect.mjs",
  "scripts/run-desktop.mjs",
  "scripts/hide-console.vbs",
];

function copyFiltered(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(sep);
      if (parts.includes(".vite") || parts.includes(".cache") || parts.some((p) => p.startsWith("_node_extract"))) return false;
      if (/\.(zip|tgz|tar\.gz)$/i.test(src)) return false;
      return true;
    },
  });
}

function writeLf(dest, lines) {
  writeFileSync(dest, `${lines.join("\n")}\n`.replace(/\r\n/g, "\n"), "utf8");
}

function stageCommon(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  mkdirSync(join(dest, "scripts"), { recursive: true });
  for (const item of include) {
    const from = join(root, item);
    if (!existsSync(from)) continue;
    copyFiltered(from, join(dest, item));
  }
  writeFileSync(join(dest, "tmd-version.json"), `${JSON.stringify(packed, null, 2)}\n`, "utf8");
  writeFileSync(join(dest, "VERSION.txt"), `${versionNotes(packed)}\n`, "utf8");
}

function copyLauncherLf(fromName, dest) {
  const raw = readFileSync(join(root, fromName), "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  writeFileSync(dest, raw.endsWith("\n") ? raw : `${raw}\n`, "utf8");
}

mkdirSync(releaseDir, { recursive: true });
stageCommon(staging);
copyFiltered(bundledNodeDir(root, "win"), join(staging, "vendor", "node"));
copyFiltered(join(root, "打开卡牌工坊.bat"), join(staging, "打开卡牌工坊.bat"));
const exeSrc = join(root, "TMD.exe");
if (!existsSync(exeSrc)) {
  console.log("building TMD.exe…");
  execSync("npm run desktop:exe", { cwd: root, stdio: "inherit" });
}
if (!existsSync(exeSrc)) throw new Error("缺少 TMD.exe，无法打 Windows 包");
copyFileSync(exeSrc, join(staging, "TMD.exe"));
writeLf(join(staging, "使用说明.txt"), [
  "TMD · TABLETOP MASTER DESIGN",
  versionText(packed),
  "Windows 解压包（已内置 Node.js，不需要去 nodejs.org / 不需要 VPN）",
  "",
  "两边联机请先看 VERSION.txt 或左上角版本号是否一致。",
  "",
  "1. 右键「解压到 TMD」——不要只在压缩包里双击",
  "2. 进入解压出的 TMD 文件夹",
  "3. 双击 TMD.exe",
  "4. 出现 TMD 窗口。关掉窗口即结束。同一 Wi-Fi 对方用浏览器打开局域网地址，不要再双击启动。",
  "",
  "第一次若还没有 node_modules，脚本会用国内镜像自动安装依赖。",
  "苹果电脑请改用 TMD-offline-mac.zip，不要解压这份。",
  "",
]);

if (existsSync(zipWinPath)) rmSync(zipWinPath);
const ps1 = join(root, "scripts", "_zip.ps1");
writeFileSync(
  ps1,
  [
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$src = ${JSON.stringify(staging)}`,
    `$dst = ${JSON.stringify(zipWinPath)}`,
    "[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $dst, [System.IO.Compression.CompressionLevel]::Fastest, $true)",
  ].join("\r\n"),
  "utf8",
);
console.log("zipping Windows pack…");
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, { stdio: "inherit" });
rmSync(ps1, { force: true });
cpSync(zipWinPath, join(root, "public", zipWinName));
console.log(`packed ${zipWinPath}`);

stageCommon(stagingMac);
copyFiltered(bundledNodeDir(root, "mac"), join(stagingMac, "vendor", "node"));
copyLauncherLf("打开卡牌工坊.command", join(stagingMac, "打开卡牌工坊.command"));
writeLf(join(stagingMac, "使用说明.txt"), [
  "TMD · TABLETOP MASTER DESIGN",
  versionText(packed),
  "Mac（Apple 芯片 / M 系列）解压包。已内置 Node.js，不需要去 nodejs.org，不需要 VPN。",
  "Intel Mac 请不要用这份。",
  "",
  "两边联机请先看 VERSION.txt 或左上角版本号是否一致。",
  "",
  "1. 解压成真正的文件夹——不要只在压缩包里双击文件",
  "2. 进入解压出的文件夹",
  "3. 双击「打开卡牌工坊.command」",
  "4. 用 Chrome 或 Edge 打开 http://localhost:1420/ ，不要用 Safari。不要关终端窗口。",
  "",
  "若系统提示无法打开未识别的开发者：按住 Control 点该文件 → 打开（或右键 → 打开）。",
  "若双击没反应：打开「终端」，进入解压目录后执行：",
  "  chmod +x 打开卡牌工坊.command",
  "然后再双击。",
  "",
  "第一次若还没有 node_modules，脚本会用国内镜像自动安装依赖。",
  "",
]);

if (existsSync(zipMacPath)) rmSync(zipMacPath);
console.log("zipping Mac pack (unix exec bits)…");
await zipDirectory(stagingMac, zipMacPath, { unix: true, includeBase: true });
cpSync(zipMacPath, join(root, "public", zipMacName));
console.log(`packed ${zipMacPath}`);
console.log(`copied public/${zipWinName}  public/${zipMacName}`);
console.log(versionText(packed));
