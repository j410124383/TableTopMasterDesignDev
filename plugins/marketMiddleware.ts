import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

type Item = {
  id: string;
  name: string;
  author: string;
  kind: string;
  desc: string;
  cover?: string;
  rating: number;
  rates: number;
  subs: number;
  createdAt: string;
  ownerId?: string;
  official?: boolean;
  projectId?: string;
  comments?: { score: number; text: string; at: string }[];
};

type Store = { items: Item[] };

const root = path.resolve("data/market");
const indexFile = path.join(root, "index.json");

async function loadStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(indexFile, "utf8")) as Store;
  } catch {
    return { items: [] };
  }
}

async function saveStore(store: Store) {
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, "items"), { recursive: true });
  await writeFile(indexFile, JSON.stringify(store, null, 2), "utf8");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function handleMarket(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  const url = req.url ?? "";
  if (!url.startsWith("/__market")) {
    next();
    return;
  }
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const parsed = new URL(url, "http://local");
  const parts = parsed.pathname.split("/").filter(Boolean);

  void (async () => {
    try {
      if (req.method === "GET" && parts.length === 1) {
        const store = await loadStore();
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ items: store.items }));
        return;
      }
      if (req.method === "GET" && parts[1] && parts[2] === "project") {
        const file = path.join(root, "items", `${parts[1]}.json`);
        const text = await readFile(file, "utf8");
        res.setHeader("content-type", "application/json");
        res.end(text);
        return;
      }
      if (req.method === "POST" && parts.length === 1) {
        const body = JSON.parse(await readBody(req)) as { item?: Partial<Item>; project?: unknown };
        if (!body.item?.name || !body.project) {
          res.statusCode = 400;
          res.end("missing");
          return;
        }
        const raw = JSON.stringify(body.project);
        if (raw.length > 12_000_000) {
          res.statusCode = 413;
          res.end("too large");
          return;
        }
        const store = await loadStore();
        const item: Item = {
          id: body.item.official && body.item.id ? String(body.item.id) : `mkt_${Date.now().toString(36)}`,
          name: String(body.item.name),
          author: String(body.item.author ?? "匿名"),
          kind: String(body.item.kind ?? "桌游玩家"),
          desc: String(body.item.desc ?? ""),
          cover: body.item.cover,
          rating: 0,
          rates: 0,
          subs: 0,
          createdAt: new Date().toISOString(),
          ownerId: String(body.item.ownerId ?? ""),
          official: !!body.item.official,
          projectId: body.item.projectId ? String(body.item.projectId) : undefined,
        };
        if (item.official && store.items.some((i) => i.id === item.id || (i.official && i.name === item.name))) {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, item: store.items.find((i) => i.id === item.id || (i.official && i.name === item.name)), skipped: true }));
          return;
        }
        store.items.unshift(item);
        await saveStore(store);
        await writeFile(path.join(root, "items", `${item.id}.json`), raw, "utf8");
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, item }));
        return;
      }
      if (req.method === "POST" && parts[1] && parts[2] === "rate") {
        const body = JSON.parse(await readBody(req)) as { score?: number; comment?: string };
        const store = await loadStore();
        const item = store.items.find((i) => i.id === parts[1]);
        if (!item) {
          res.statusCode = 404;
          res.end("missing");
          return;
        }
        const score = Math.min(5, Math.max(1, Number(body.score) || 3));
        item.rating = (item.rating * item.rates + score) / (item.rates + 1);
        item.rates += 1;
        const comment = String(body.comment ?? "").trim();
        if (comment) {
          item.comments = [...(item.comments ?? []), { score, text: comment.slice(0, 200), at: new Date().toISOString() }].slice(-40);
        }
        await saveStore(store);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, item }));
        return;
      }
      if (req.method === "PATCH" && parts[1] && !parts[2]) {
        const body = JSON.parse(await readBody(req)) as { ownerId?: string; item?: Partial<Item>; project?: unknown };
        const store = await loadStore();
        const item = store.items.find((i) => i.id === parts[1]);
        if (!item) {
          res.statusCode = 404;
          res.end("missing");
          return;
        }
        if (!item.official && body.ownerId && item.ownerId && body.ownerId !== item.ownerId) {
          res.statusCode = 403;
          res.end("not owner");
          return;
        }
        if (item.official) {
          res.statusCode = 403;
          res.end("official");
          return;
        }
        if (body.item?.name) item.name = String(body.item.name);
        if (body.item?.desc !== undefined) item.desc = String(body.item.desc);
        if (body.item?.author) item.author = String(body.item.author);
        if (body.item?.cover !== undefined) item.cover = body.item.cover;
        if (body.item?.projectId) item.projectId = String(body.item.projectId);
        if (body.project) {
          const raw = JSON.stringify(body.project);
          if (raw.length > 12_000_000) {
            res.statusCode = 413;
            res.end("too large");
            return;
          }
          await writeFile(path.join(root, "items", `${item.id}.json`), raw, "utf8");
        }
        await saveStore(store);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, item }));
        return;
      }
      if (req.method === "DELETE" && parts[1] && !parts[2]) {
        const body = JSON.parse(await readBody(req)) as { ownerId?: string };
        const store = await loadStore();
        const item = store.items.find((i) => i.id === parts[1]);
        if (!item) {
          res.statusCode = 404;
          res.end("missing");
          return;
        }
        if (item.official || (item.ownerId && body.ownerId !== item.ownerId)) {
          res.statusCode = 403;
          res.end("not owner");
          return;
        }
        store.items = store.items.filter((i) => i.id !== item.id);
        await saveStore(store);
        try {
          await unlink(path.join(root, "items", `${item.id}.json`));
        } catch {
          /* ignore */
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "POST" && parts[1] && parts[2] === "unsubscribe") {
        const store = await loadStore();
        const item = store.items.find((i) => i.id === parts[1]);
        if (!item) {
          res.statusCode = 404;
          res.end("missing");
          return;
        }
        item.subs = Math.max(0, (item.subs ?? 1) - 1);
        await saveStore(store);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, item }));
        return;
      }
      if (req.method === "POST" && parts[1] && parts[2] === "subscribe") {
        const store = await loadStore();
        const item = store.items.find((i) => i.id === parts[1]);
        if (!item) {
          res.statusCode = 404;
          res.end("missing");
          return;
        }
        item.subs += 1;
        await saveStore(store);
        const text = await readFile(path.join(root, "items", `${item.id}.json`), "utf8");
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, item, project: JSON.parse(text) }));
        return;
      }
      res.statusCode = 405;
      res.end();
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : "market error");
    }
  })();
}

export function marketPlugin(): Plugin {
  return {
    name: "market",
    configureServer(server) {
      server.middlewares.use(handleMarket);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleMarket);
    },
  };
}
