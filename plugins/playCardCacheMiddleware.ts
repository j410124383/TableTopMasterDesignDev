import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

const CACHE_DIR = path.resolve("data/play-cache");
const HASH_RE = /^[a-f0-9]{16}$/i;

function clientIsLocal(req: IncomingMessage): boolean {
  const ip = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
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
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function clientCanRead(req: IncomingMessage): boolean {
  if (clientIsLocal(req)) return true;
  const ip = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  return isPrivateLanIp(ip);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function cachePath(hash: string): string {
  return path.join(CACHE_DIR, `${hash.toLowerCase()}.png`);
}

function handlePlayCard(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  const url = req.url?.split("?")[0] ?? "";
  const m = /^\/__play\/card\/([a-f0-9]{16})\.png$/i.exec(url);
  if (!m) {
    next();
    return;
  }
  const hash = m[1]!.toLowerCase();
  if (!HASH_RE.test(hash)) {
    res.statusCode = 400;
    res.end("bad hash");
    return;
  }

  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,HEAD,PUT,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const file = cachePath(hash);

  if (req.method === "HEAD" || req.method === "GET") {
    if (!clientCanRead(req)) {
      res.statusCode = 403;
      res.end("remote");
      return;
    }
    if (!existsSync(file)) {
      res.statusCode = 404;
      res.end("missing");
      return;
    }
    const st = statSync(file);
    res.statusCode = 200;
    res.setHeader("content-type", "image/png");
    res.setHeader("content-length", String(st.size));
    res.setHeader("cache-control", "public, max-age=86400");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
    return;
  }

  if (req.method === "PUT") {
    if (!clientIsLocal(req)) {
      res.statusCode = 403;
      res.end("local only");
      return;
    }
    void readBody(req).then(async (buf) => {
      if (buf.length < 32 || buf.length > 8 * 1024 * 1024) {
        res.statusCode = 400;
        res.end("size");
        return;
      }
      mkdirSync(CACHE_DIR, { recursive: true });
      await writeFile(file, buf);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, hash }));
    });
    return;
  }

  res.statusCode = 405;
  res.end();
}

export function playCardCachePlugin(): Plugin {
  return {
    name: "play-card-cache",
    configureServer(server) {
      server.middlewares.use(handlePlayCard);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handlePlayCard);
    },
  };
}
