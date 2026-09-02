import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const NODE_VERSION = "22.14.0";
const ZIP_NAME = `node-v${NODE_VERSION}-win-x64.zip`;
const MIRRORS = [
  `https://cdn.npmmirror.com/binaries/node/v${NODE_VERSION}/${ZIP_NAME}`,
  `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/${ZIP_NAME}`,
  `https://nodejs.org/dist/v${NODE_VERSION}/${ZIP_NAME}`,
];

export function bundledNodeDir(root) {
  return join(root, "vendor", "node");
}

export function bundledNodeExe(root) {
  return join(bundledNodeDir(root), "node.exe");
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

export async function ensureBundledNode(root = resolve(import.meta.dirname, "..")) {
  const dest = bundledNodeDir(root);
  const exe = bundledNodeExe(root);
  if (existsSync(exe)) {
    console.log(`bundled node ready: ${exe}`);
    return exe;
  }

  mkdirSync(join(root, "vendor"), { recursive: true });
  const zipPath = join(root, "vendor", ZIP_NAME);
  if (!existsSync(zipPath)) {
    let lastErr = null;
    for (const url of MIRRORS) {
      try {
        console.log(`downloading Node ${NODE_VERSION}…\n  ${url}`);
        await download(url, zipPath);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`mirror failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (lastErr) throw lastErr;
  }

  const tmp = join(root, "vendor", "_node_extract");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execSync(`tar -xf "${zipPath}" -C "${tmp}"`, { stdio: "inherit" });
  const inner = readdirSync(tmp, { withFileTypes: true }).find((e) => e.isDirectory());
  if (!inner) throw new Error("Node zip 里没有目录");
  rmSync(dest, { recursive: true, force: true });
  renameSync(join(tmp, inner.name), dest);
  rmSync(tmp, { recursive: true, force: true });
  if (!existsSync(exe)) throw new Error("展开后仍没有 node.exe");
  console.log(`bundled node ready: ${exe}`);
  return exe;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  ensureBundledNode().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
