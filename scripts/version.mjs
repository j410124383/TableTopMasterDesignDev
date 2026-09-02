import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Bump together with package.json major when the play wire format cannot talk to older zips. */
export const PLAY_PROTOCOL = 2;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function pad(n) {
  return String(n).padStart(2, "0");
}

export function packBuildId(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function readAppVersion() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return String(pkg.version);
}

function readPackedFile(file) {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    if (!raw.version) return null;
    return {
      name: "TMD",
      version: String(raw.version),
      protocol: Number(raw.protocol) || PLAY_PROTOCOL,
      build: String(raw.build || "dev"),
    };
  } catch {
    return null;
  }
}

export function versionInfo() {
  return (
    readPackedFile(join(root, "tmd-version.json")) ??
    readPackedFile(join(root, "public", "tmd-version.json")) ?? {
      name: "TMD",
      version: readAppVersion(),
      protocol: PLAY_PROTOCOL,
      build: "dev",
    }
  );
}

export function makePackedInfo(d = new Date()) {
  return {
    name: "TMD",
    version: readAppVersion(),
    protocol: PLAY_PROTOCOL,
    build: packBuildId(d),
  };
}

export function versionText(info = versionInfo()) {
  return `TMD ${info.version}  构建 ${info.build}  联机协议 ${info.protocol}`;
}

export function versionNotes(info = versionInfo()) {
  return [
    `TMD ${info.version}`,
    `构建 ${info.build}`,
    `联机协议 ${info.protocol}`,
    "",
    "两边电脑必须是同一个 zip、同一个版本号才能稳定联机。",
    "对照方法：左上角 TMD 下方的版本，或启动时黑窗口第一行。",
    "",
    "版本规则",
    "- 修订号 +1：修 bug、改文案、同一联机协议",
    "- 次版本 +1：新功能，联机协议仍兼容",
    "- 主版本 +1：联机协议变了，必须换新包",
    "- 每次打包写入构建时刻，用来确认是不是同一份包",
    "- 0.x 仍是开发期，换包后请两边一起更新",
  ].join("\n");
}
