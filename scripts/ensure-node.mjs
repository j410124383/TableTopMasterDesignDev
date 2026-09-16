import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const NODE_VERSION = "22.14.0";

const MIRRORS = [
  (file) => `https://cdn.npmmirror.com/binaries/node/v${NODE_VERSION}/${file}`,
  (file) => `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/${file}`,
  (file) => `https://nodejs.org/dist/v${NODE_VERSION}/${file}`,
];

/** @type {Record<string, { archive: string; vendorDir: string; readyRel: string }>} */
export const NODE_RUNTIME = {
  win: {
    archive: `node-v${NODE_VERSION}-win-x64.zip`,
    vendorDir: "node",
    readyRel: "node.exe",
  },
  mac: {
    archive: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    vendorDir: "node-darwin-arm64",
    readyRel: join("bin", "node"),
  },
};

export function bundledNodeDir(root, platform = "win") {
  return join(root, "vendor", NODE_RUNTIME[platform].vendorDir);
}

export function bundledNodeReady(root, platform = "win") {
  return join(bundledNodeDir(root, platform), NODE_RUNTIME[platform].readyRel);
}

export function bundledNodeExe(root) {
  return bundledNodeReady(root, "win");
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function lf(text) {
  return `${text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd()}\n`;
}

/** Windows 展开 darwin tarball 会丢掉 symlink；写成可执行的 sh 包装。 */
function repairDarwinBin(dest) {
  const bin = join(dest, "bin");
  if (!existsSync(bin)) throw new Error("darwin Node 没有 bin/");
  const wraps = [
    ["npm", "../lib/node_modules/npm/bin/npm-cli.js"],
    ["npx", "../lib/node_modules/npm/bin/npx-cli.js"],
    ["corepack", "../lib/node_modules/corepack/dist/corepack.js"],
  ];
  for (const [name, rel] of wraps) {
    const target = join(bin, rel);
    if (!existsSync(target)) continue;
    writeFileSync(
      join(bin, name),
      lf(`#!/bin/sh
basedir=$(cd "$(dirname "$0")" && pwd)
exec "$basedir/node" "$basedir/${rel}" "$@"
`),
      "utf8",
    );
  }
}

export async function ensureBundledNode(root = resolve(import.meta.dirname, ".."), platform = "win") {
  const spec = NODE_RUNTIME[platform];
  if (!spec) throw new Error(`unknown node platform: ${platform}`);
  const dest = bundledNodeDir(root, platform);
  const ready = bundledNodeReady(root, platform);
  if (existsSync(ready)) {
    if (platform === "mac") repairDarwinBin(dest);
    console.log(`bundled node (${platform}) ready: ${ready}`);
    return ready;
  }

  mkdirSync(join(root, "vendor"), { recursive: true });
  const archivePath = join(root, "vendor", spec.archive);
  if (!existsSync(archivePath)) {
    let lastErr = null;
    for (const makeUrl of MIRRORS) {
      const url = makeUrl(spec.archive);
      try {
        console.log(`downloading Node ${NODE_VERSION} (${platform})…\n  ${url}`);
        await download(url, archivePath);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`mirror failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (lastErr) throw lastErr;
  }

  const tmp = join(root, "vendor", `_node_extract_${platform}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const tarCmd =
    platform === "mac"
      ? `tar -xf "${archivePath}" -C "${tmp}" --exclude=bin/npm --exclude=bin/npx --exclude=bin/corepack`
      : `tar -xf "${archivePath}" -C "${tmp}"`;
  try {
    execSync(tarCmd, { stdio: "inherit" });
  } catch (err) {
    const innerGuess = readdirSync(tmp, { withFileTypes: true }).find((e) => e.isDirectory());
    const maybeReady = innerGuess ? join(tmp, innerGuess.name, spec.readyRel) : "";
    if (!maybeReady || !existsSync(maybeReady)) throw err;
    console.warn("tar reported errors; continuing because node binary is present");
  }
  const inner = readdirSync(tmp, { withFileTypes: true }).find((e) => e.isDirectory());
  if (!inner) throw new Error("Node 压缩包里没有目录");
  rmSync(dest, { recursive: true, force: true });
  renameSync(join(tmp, inner.name), dest);
  rmSync(tmp, { recursive: true, force: true });
  if (platform === "mac") repairDarwinBin(dest);
  if (!existsSync(ready)) throw new Error(`展开后仍没有 ${spec.readyRel}`);
  console.log(`bundled node (${platform}) ready: ${ready}`);
  return ready;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  const platform = process.argv[2] === "mac" ? "mac" : "win";
  ensureBundledNode(undefined, platform).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
