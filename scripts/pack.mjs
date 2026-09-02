import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { execSync } from "node:child_process";
import { ensureBundledNode } from "./ensure-node.mjs";
import { makePackedInfo, versionNotes, versionText } from "./version.mjs";

const root = resolve(import.meta.dirname, "..");
const packed = makePackedInfo();
const staging = join(root, "release", `TMD-${packed.version}`);
const zipName = "TMD-offline.zip";
const zipPath = join(root, "release", zipName);
const publicZip = join(root, "public", zipName);

await ensureBundledNode(root);

const include = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "index.html",
  "打开卡牌工坊.bat",
  "src",
  "plugins",
  "public",
  "vendor",
  "scripts/print-lan.mjs",
  "scripts/version.mjs",
  "scripts/lanDetect.mjs",
];

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(join(staging, "scripts"), { recursive: true });

function copyFiltered(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(sep);
      if (parts.includes(".vite") || parts.includes(".cache") || parts.includes("_node_extract")) return false;
      if (/\.zip$/i.test(src)) return false;
      return true;
    },
  });
}

for (const item of include) {
  const from = join(root, item);
  if (!existsSync(from)) continue;
  copyFiltered(from, join(staging, item));
}

writeFileSync(join(staging, "tmd-version.json"), `${JSON.stringify(packed, null, 2)}\n`, "utf8");
writeFileSync(join(staging, "VERSION.txt"), `${versionNotes(packed)}\n`, "utf8");
writeFileSync(
  join(staging, "使用说明.txt"),
  [
    "TMD · TABLETOP MASTER DESIGN",
    versionText(packed),
    "解压包（已内置 Node.js，不需要去 nodejs.org / 不需要 VPN）",
    "",
    "两边联机请先看 VERSION.txt 或左上角版本号是否一致。",
    "",
    "1. 右键「解压到 TMD」——不要只在压缩包里双击",
    "2. 进入解压出的 TMD 文件夹",
    "3. 双击「打开卡牌工坊.bat」",
    "4. 浏览器打开 http://localhost:1420/ ，不要关那个黑窗口",
    "",
    "第一次若还没有 node_modules，脚本会用国内镜像自动安装依赖。",
    "",
  ].join("\n"),
  "utf8",
);

if (existsSync(zipPath)) rmSync(zipPath);
const ps1 = join(root, "scripts", "_zip.ps1");
writeFileSync(
  ps1,
  [
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$src = ${JSON.stringify(staging)}`,
    `$dst = ${JSON.stringify(zipPath)}`,
    "[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $dst, [System.IO.Compression.CompressionLevel]::Fastest, $true)",
  ].join("\r\n"),
  "utf8",
);
console.log("zipping with Windows ZipFile (Explorer-compatible)…");
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, { stdio: "inherit" });
rmSync(ps1, { force: true });
cpSync(zipPath, publicZip);
console.log(`packed ${zipPath}`);
console.log(`copied ${publicZip}`);
console.log(versionText(packed));
