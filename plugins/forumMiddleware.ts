import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

type Reply = { id: string; author: string; body: string; at: number };
type Thread = {
  id: string;
  title: string;
  author: string;
  body: string;
  at: number;
  replies: Reply[];
};

const file = path.resolve("data/forum/threads.json");

async function load(): Promise<Thread[]> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Thread[];
  } catch {
    return [];
  }
}

async function save(list: Thread[]) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(list, null, 2), "utf8");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function uid() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function handleForum(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  const url = req.url ?? "";
  if (!url.startsWith("/__forum")) {
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
  const parsed = new URL(url, "http://local");
  const parts = parsed.pathname.split("/").filter(Boolean);

  void (async () => {
    try {
      const list = await load();
      if (req.method === "GET" && parts.length === 1) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ threads: list }));
        return;
      }
      if (req.method === "POST" && parts.length === 1) {
        const body = JSON.parse(await readBody(req)) as { title?: string; author?: string; body?: string };
        const title = (body.title ?? "").trim().slice(0, 80);
        const text = (body.body ?? "").trim().slice(0, 4000);
        const author = (body.author ?? "匿名").trim().slice(0, 24) || "匿名";
        if (!title || !text) {
          res.statusCode = 400;
          res.end("need title and body");
          return;
        }
        const thread: Thread = { id: uid(), title, author, body: text, at: Date.now(), replies: [] };
        list.unshift(thread);
        await save(list.slice(0, 200));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ thread }));
        return;
      }
      if (req.method === "POST" && parts[1]) {
        const found = list.find((t) => t.id === parts[1]);
        if (!found) {
          res.statusCode = 404;
          res.end("no thread");
          return;
        }
        const body = JSON.parse(await readBody(req)) as { author?: string; body?: string };
        const text = (body.body ?? "").trim().slice(0, 2000);
        const author = (body.author ?? "匿名").trim().slice(0, 24) || "匿名";
        if (!text) {
          res.statusCode = 400;
          res.end("need body");
          return;
        }
        found.replies.push({ id: uid(), author, body: text, at: Date.now() });
        await save(list);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ thread: found }));
        return;
      }
      res.statusCode = 405;
      res.end();
    } catch {
      res.statusCode = 400;
      res.end("bad json");
    }
  })();
}

export function forumPlugin(): Plugin {
  return {
    name: "forum",
    configureServer(server) {
      server.middlewares.use(handleForum);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleForum);
    },
  };
}
