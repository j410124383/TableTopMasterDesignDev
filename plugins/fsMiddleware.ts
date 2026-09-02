import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { psdBufferToPng } from "./psdToPng";

const execFileAsync = promisify(execFile);

const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
  ".psd",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
]);

async function readFileAsServed(disk: string): Promise<{ buf: Buffer; type: string }> {
  const ext = path.extname(disk).toLowerCase();
  const raw = await readFile(disk);
  if (ext === ".psd") {
    return { buf: psdBufferToPng(raw), type: "image/png" };
  }
  return { buf: raw, type: mimeOf(disk) };
}

async function indexImageTree(imagesRoot: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string, relParts: string[]) => {
    let entries: Awaited<ReturnType<typeof readdir>> = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ent.name.startsWith("_")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, [...relParts, ent.name]);
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".psd"].includes(ext)) continue;
      const stem = ent.name.replace(/\.[^.]+$/, "");
      const id = [...relParts, stem].join("/");
      out[id] = `assets/images/${[...relParts, ent.name].join("/")}`;
    }
  };
  await walk(imagesRoot, []);
  return out;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeWinPath(raw: string): string | null {
  const p = raw.trim();
  if (!p || p.includes("\0") || /[\r\n]/.test(p)) return null;
  if (/^[A-Za-z]:[\\/]/.test(p)) return p;
  if (p.startsWith("\\\\") && p.length > 3) return p;
  return null;
}

function clientIsLocal(req: IncomingMessage): boolean {
  const raw = req.socket.remoteAddress ?? "";
  const ip = raw.replace(/^::ffff:/, "");
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.address === ip) return true;
    }
  }
  return false;
}

function isPrivateLanIp(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** 局域网访客可读工程素材；写操作仍只允许本机。 */
function clientCanReadAssetFile(req: IncomingMessage): boolean {
  if (clientIsLocal(req)) return true;
  const ip = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  return isPrivateLanIp(ip);
}

function diskIsServableAsset(disk: string): boolean {
  const norm = disk.replaceAll("\\", "/").toLowerCase();
  return norm.includes("/assets/") || norm.includes("/public/fonts/") || norm.includes("/渲染图/");
}

function json(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function pickFolderWin(): Promise<{ path?: string; cancel?: boolean }> {
  const out = path.join(os.tmpdir(), `tmd-pick-${Date.now()}.txt`);
  const escaped = out.replace(/'/g, "''");
  const ps = `
    $OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
    Add-Type -AssemblyName System.Windows.Forms
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = '选择文件夹'
    $d.ShowNewFolderButton = $true
    $form = New-Object System.Windows.Forms.Form
    $form.TopMost = $true
    $form.StartPosition = 'CenterScreen'
    $form.Size = New-Object System.Drawing.Size(1,1)
    $form.Show() | Out-Null
    $form.Hide()
    $r = $d.ShowDialog($form)
    $form.Dispose()
    if ($r -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
    [IO.File]::WriteAllText('${escaped}', $d.SelectedPath, [Text.UTF8Encoding]::new($false))
  `;
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-STA", "-Command", ps], {
      timeout: 180000,
      windowsHide: false,
    });
    const picked = (await readFile(out, "utf8")).trim();
    await unlink(out).catch(() => undefined);
    const pathOk = safeWinPath(picked);
    return pathOk ? { path: pathOk } : {};
  } catch (err) {
    await unlink(out).catch(() => undefined);
    const code = (err as { code?: number | string }).code;
    if (code === 2 || code === "2") return { cancel: true };
    return {};
  }
}

async function readJsonDir(dir: string): Promise<unknown[]> {
  try {
    const names = await readdir(dir);
    const out: unknown[] = [];
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      out.push(JSON.parse(await readFile(path.join(dir, n), "utf8")));
    }
    return out;
  } catch {
    return [];
  }
}

function mimeOf(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".gif") return "image/gif";
  if (ext === ".psd") return "image/png"; // 工程引用 .psd；读取时即时解码供显示
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".otf") return "font/otf";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function extFromDataUrl(src: string): string {
  if (src.startsWith("data:image/png")) return ".png";
  if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) return ".jpg";
  if (src.startsWith("data:image/webp")) return ".webp";
  if (src.startsWith("data:image/svg")) return ".svg";
  if (src.includes("font/ttf") || src.startsWith("data:font/ttf")) return ".ttf";
  if (src.includes("font/otf")) return ".otf";
  return ".bin";
}

function sanitizeAssetFile(id: string, ext: string): string {
  const safe = id.replace(/[<>:"|?*]/g, "_").replace(/\\/g, "/");
  return safe.endsWith(ext) ? safe : `${safe}${ext}`;
}

async function writeJsonDir(dir: string, items: { id?: string }[], prefix: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const keep = new Set(items.map((it, i) => `${it.id || `${prefix}-${i}`}.json`));
  try {
    for (const name of await readdir(dir)) {
      if (name.endsWith(".json") && !keep.has(name)) await unlink(path.join(dir, name));
    }
  } catch {
    /* empty */
  }
  for (const [i, item] of items.entries()) {
    const id = item.id || `${prefix}-${i}`;
    await writeFile(path.join(dir, `${id}.json`), JSON.stringify(item, null, 2), "utf8");
  }
}

async function writeSplitProject(dir: string, project: Record<string, unknown>): Promise<void> {
  const meta = (project.meta ?? {}) as { name?: string; id?: string };
  const name = (typeof meta.name === "string" ? meta.name : "project").replace(/[\\/:*?"<>|]/g, "_").trim() || "project";
  const dataDir = path.join(dir, "data");
  const imagesDir = path.join(dir, "assets", "images");
  const fontsDir = path.join(dir, "assets", "fonts");
  await mkdir(imagesDir, { recursive: true });
  await mkdir(fontsDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  const fonts = (Array.isArray(project.fonts) ? project.fonts : []) as { assetId?: string }[];
  const fontIds = new Set(fonts.map((f) => f.assetId).filter(Boolean) as string[]);
  const assets = (project.assets ?? {}) as Record<string, string>;
  const assetIndex: Record<string, string> = {};

  for (const [id, src] of Object.entries(assets)) {
    if (typeof src !== "string" || !src) continue;
    if (src.startsWith("data:")) {
      const ext = extFromDataUrl(src);
      const relName = sanitizeAssetFile(id, ext);
      const destDir = fontIds.has(id) || ext === ".ttf" || ext === ".otf" ? fontsDir : imagesDir;
      const rel = path.join(path.relative(dir, destDir), relName).replaceAll("\\", "/");
      const comma = src.indexOf(",");
      const b64 = comma >= 0 ? src.slice(comma + 1) : "";
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await writeFile(path.join(dir, rel), Buffer.from(b64, "base64"));
      assetIndex[id] = rel;
    } else if (src.startsWith("/__fs/file")) {
      let filePath = "";
      try {
        filePath = new URL(src, "http://local").searchParams.get("p") ?? "";
      } catch {
        filePath = "";
      }
      const disk = safeWinPath(filePath);
      if (!disk) continue;
      const relTry = path.relative(dir, disk);
      if (relTry && !relTry.startsWith("..") && !path.isAbsolute(relTry)) {
        assetIndex[id] = relTry.replaceAll("\\", "/");
        continue;
      }
      const ext = path.extname(disk) || ".png";
      const relName = sanitizeAssetFile(id, ext);
      const destDir = fontIds.has(id) ? fontsDir : imagesDir;
      const rel = path.join(path.relative(dir, destDir), relName).replaceAll("\\", "/");
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await copyFile(disk, path.join(dir, rel));
      assetIndex[id] = rel;
    } else {
      assetIndex[id] = src.replaceAll("\\", "/");
    }
  }

  await writeFile(
    path.join(dir, `${name}.ceditor`),
    JSON.stringify({ info: "Card Editor project folder", format: "ceditor-folder-v1" }, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "project.json"),
    JSON.stringify(
      {
        schemaVersion: project.schemaVersion ?? 1,
        format: "ceditor-folder-v1",
        meta: project.meta,
        print: project.print,
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeJsonDir(path.join(dataDir, "blueprints"), (project.blueprints as { id?: string }[]) ?? [], "bp");
  await writeJsonDir(path.join(dataDir, "sets"), (project.sets as { id?: string }[]) ?? [], "set");
  await writeJsonDir(path.join(dataDir, "templates"), (project.templates as { id?: string }[]) ?? [], "tpl");
  await writeJsonDir(path.join(dataDir, "decks"), (project.decks as { id?: string }[]) ?? [], "deck");
  await writeJsonDir(path.join(dataDir, "boxes"), (project.boxes as { id?: string }[]) ?? [], "box");
  await writeFile(path.join(dataDir, "variables.json"), JSON.stringify(project.variables ?? [], null, 2), "utf8");
  await writeFile(path.join(dataDir, "fonts.json"), JSON.stringify(project.fonts ?? [], null, 2), "utf8");
  await writeFile(path.join(dataDir, "assets.json"), JSON.stringify(assetIndex, null, 2), "utf8");
  await writeFile(path.join(dataDir, "export.json"), JSON.stringify(project.print ?? {}, null, 2), "utf8");
  await writeFile(path.join(dataDir, "rulebooks.json"), JSON.stringify(project.rulebooks ?? [], null, 2), "utf8");
}

async function readProjectFolder(dir: string): Promise<unknown> {
  const rootFile = path.join(dir, "project.json");
  try {
    const raw = JSON.parse(await readFile(rootFile, "utf8")) as Record<string, unknown>;
    if (raw?.meta && (raw.templates || raw.sets || raw.blueprints || raw.decks)) return raw;
  } catch {
    /* try split format */
  }
  const dataDir = path.join(dir, "data");
  const parsed = JSON.parse(await readFile(path.join(dataDir, "project.json"), "utf8")) as {
    schemaVersion?: number;
    meta: unknown;
    print?: unknown;
  };
  const readSide = async (name: string) => {
    try {
      return JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
    } catch {
      return name.endsWith(".json") ? [] : {};
    }
  };
  const assetIndex = ((await readSide("assets.json")) ?? {}) as Record<string, string>;
  // 扫磁盘补上未登记的图（含用户手放的 CardPSD/*.psd）
  const scanned = await indexImageTree(path.join(dir, "assets", "images"));
  for (const [id, rel] of Object.entries(scanned)) {
    if (!assetIndex[id]) assetIndex[id] = rel;
  }
  const assets: Record<string, string> = {};
  for (const [id, rel] of Object.entries(assetIndex)) {
    if (rel.startsWith("data:")) assets[id] = rel;
    else if (rel.startsWith("/__fs/file")) assets[id] = rel;
    else {
      const full = path.join(dir, rel.replaceAll("/", path.sep));
      assets[id] = `/__fs/file?p=${encodeURIComponent(full)}${rel.toLowerCase().endsWith(".psd") ? "&v=a2" : ""}`;
    }
  }
  return {
    schemaVersion: parsed.schemaVersion,
    meta: parsed.meta,
    templates: await readJsonDir(path.join(dataDir, "templates")),
    decks: await readJsonDir(path.join(dataDir, "decks")),
    blueprints: await readJsonDir(path.join(dataDir, "blueprints")),
    sets: await readJsonDir(path.join(dataDir, "sets")),
    boxes: await readJsonDir(path.join(dataDir, "boxes")),
    variables: (await readSide("variables.json")) ?? [],
    fonts: (await readSide("fonts.json")) ?? [],
    print: (await readSide("export.json")) ?? parsed.print,
    rulebooks: (await readSide("rulebooks.json")) ?? [],
    assets,
  };
}

function handleFs(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  const url = req.url ?? "";
  if (!url.startsWith("/__fs") && url !== "/__ping") {
    next();
    return;
  }
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (url === "/__ping" || url.startsWith("/__ping?")) {
    json(res, { ok: true, at: Date.now() });
    return;
  }

  if (req.method === "GET" && url.startsWith("/__fs/file")) {
    if (!clientCanReadAssetFile(req)) {
      json(res, { error: "remote" }, 403);
      return;
    }
    void (async () => {
      try {
        const u = new URL(url, "http://local");
        const disk = safeWinPath(u.searchParams.get("p") ?? "");
        if (!disk) {
          res.statusCode = 400;
          res.end("bad path");
          return;
        }
        if (!clientIsLocal(req) && !diskIsServableAsset(disk)) {
          res.statusCode = 403;
          res.end("path");
          return;
        }
        const ext = path.extname(disk).toLowerCase();
        if (!IMAGE_EXTS.has(ext)) {
          res.statusCode = 403;
          res.end("type");
          return;
        }
        const { buf, type } = await readFileAsServed(disk);
        res.statusCode = 200;
        res.setHeader("content-type", type);
        res.setHeader("cache-control", ext === ".psd" ? "no-cache" : "public, max-age=3600");
        res.end(buf);
      } catch (err) {
        res.statusCode = 404;
        res.end(err instanceof Error ? err.message : "missing");
      }
    })();
    return;
  }

  if (req.method === "POST" && url.startsWith("/__fs/psd-png")) {
    if (!clientIsLocal(req)) {
      json(res, { error: "remote" }, 403);
      return;
    }
    void (async () => {
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        const png = psdBufferToPng(Buffer.concat(chunks));
        res.statusCode = 200;
        res.setHeader("content-type", "image/png");
        res.end(png);
      } catch (err) {
        res.statusCode = 400;
        res.end(err instanceof Error ? err.message : "psd convert failed");
      }
    })();
    return;
  }

  if (req.method === "POST" && url.startsWith("/__fs/pick")) {
    if (!clientIsLocal(req)) {
      json(res, { error: "remote" }, 403);
      return;
    }
    void readBody(req).then(() => pickFolderWin()).then((picked) => {
      if (picked.cancel) {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (!picked.path) {
        json(res, { error: "pick-failed" }, 500);
        return;
      }
      json(res, { path: picked.path });
    });
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }

  void readBody(req).then(async (text) => {
    let body: { path?: string; text?: string; project?: unknown; name?: string; base64?: string } = {};
    try {
      body = JSON.parse(text || "{}") as typeof body;
    } catch {
      res.statusCode = 400;
      res.end("bad json");
      return;
    }
    const disk = safeWinPath(body.path ?? "");
    if (!disk) {
      res.statusCode = 400;
      res.end("bad path");
      return;
    }

    try {
      if (url.startsWith("/__fs/write-file")) {
        if (!clientIsLocal(req)) {
          json(res, { error: "remote" }, 403);
          return;
        }
        const b64 = typeof body.base64 === "string" ? body.base64 : "";
        if (!b64) {
          res.statusCode = 400;
          res.end("missing base64");
          return;
        }
        await mkdir(path.dirname(disk), { recursive: true });
        await writeFile(disk, Buffer.from(b64, "base64"));
        json(res, { ok: true, url: `/__fs/file?p=${encodeURIComponent(disk)}` });
        return;
      }
      if (url.startsWith("/__fs/reveal")) {
        await access(disk, constants.F_OK);
        const child = spawn("explorer", [disk], { detached: true, stdio: "ignore" });
        child.unref();
        json(res, { ok: true });
        return;
      }
      if (url.startsWith("/__fs/exists")) {
        try {
          const st = await stat(disk);
          json(res, { ok: true, isDir: st.isDirectory() });
        } catch {
          json(res, { ok: false, isDir: false });
        }
        return;
      }
      if (url.startsWith("/__fs/mkdir")) {
        if (!clientIsLocal(req)) {
          json(res, { error: "remote" }, 403);
          return;
        }
        await mkdir(disk, { recursive: true });
        json(res, { ok: true });
        return;
      }
      if (url.startsWith("/__fs/list")) {
        const names = await readdir(disk, { withFileTypes: true });
        json(res, {
          files: names.filter((n) => n.isFile()).map((n) => n.name),
          dirs: names.filter((n) => n.isDirectory()).map((n) => n.name),
        });
        return;
      }
      if (url.startsWith("/__fs/write-project")) {
        if (!clientIsLocal(req)) {
          json(res, { error: "remote" }, 403);
          return;
        }
        await mkdir(disk, { recursive: true });
        const project = (body.project ?? {}) as Record<string, unknown>;
        await writeSplitProject(disk, project);
        json(res, { ok: true });
        return;
      }
      if (url.startsWith("/__fs/read-project")) {
        json(res, { project: await readProjectFolder(disk) });
        return;
      }
      res.statusCode = 405;
      res.end();
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : "fs error");
    }
  });
}

export function fsPlugin(): Plugin {
  return {
    name: "local-fs",
    configureServer(server) {
      server.middlewares.use(handleFs);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleFs);
    },
  };
}
