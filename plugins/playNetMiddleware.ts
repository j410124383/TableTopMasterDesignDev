import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { listLanLinks } from "../scripts/lanDetect.mjs";
import { versionInfo } from "../scripts/version.mjs";

type Item = { seq: number; msg: unknown };
type Room = { next: number; items: Item[]; waiters: Array<(items: Item[]) => void> };

const rooms = new Map<string, Room>();

type RoomMeta = {
  id: string;
  name: string;
  hostName?: string;
  players: number;
  maxPlayers: number;
  private: boolean;
  passwordHash?: string;
  updatedAt: number;
  version?: string;
  protocol?: number;
};

const ROOM_TTL_MS = 12_000;
const ROOM_ITEM_CAP = 2400;
const ROOM_ITEM_KEEP = 2000;

function dropRoom(id: string) {
  roomMeta.delete(id);
  rooms.delete(id);
}
const roomMeta = new Map<string, RoomMeta>();

function hashPw(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

function roomOf(id: string): Room {
  let r = rooms.get(id);
  if (!r) {
    r = { next: 1, items: [], waiters: [] };
    rooms.set(id, r);
  }
  return r;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function bindInfo(httpServer: { address?: () => string | { address: string; port: number } | null } | null | undefined) {
  const addr = httpServer?.address?.();
  const port = typeof addr === "object" && addr ? addr.port : Number(process.env.PORT) || 1420;
  const address = typeof addr === "object" && addr ? addr.address : "0.0.0.0";
  const loopbackOnly = address === "127.0.0.1" || address === "::1";
  const links = listLanLinks(port);
  return { address, port, loopbackOnly, origins: links.map((l) => l.url), links };
}

function handleRooms(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  const url = req.url ?? "";
  if (!url.startsWith("/__rooms")) {
    next();
    return;
  }
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const parsed = new URL(url, "http://local");
  const parts = parsed.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && parts.length === 1) {
    const now = Date.now();
    for (const [id, r] of [...roomMeta.entries()]) {
      if (now - r.updatedAt >= ROOM_TTL_MS) dropRoom(id);
    }
    const list = [...roomMeta.values()]
      .filter((r) => !r.private)
      .map(({ passwordHash, ...pub }) => ({ ...pub, locked: Boolean(passwordHash) }));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ rooms: list }));
    return;
  }

  if (req.method === "POST" && parts.length === 1) {
    void readBody(req).then((text) => {
      try {
        const body = JSON.parse(text) as {
          id?: string;
          name?: string;
          hostName?: string;
          players?: number;
          maxPlayers?: number;
          private?: boolean;
          password?: string;
          version?: string;
          protocol?: number;
        };
        const id = (body.id ?? "").trim().toUpperCase();
        if (id.length < 3) {
          res.statusCode = 400;
          res.end("bad room");
          return;
        }
        const prev = roomMeta.get(id);
        roomMeta.set(id, {
          id,
          name: body.name ?? prev?.name ?? "试玩房",
          hostName: (body.hostName ?? prev?.hostName)?.trim() || undefined,
          players: body.players ?? prev?.players ?? 1,
          maxPlayers: Math.max(1, Math.min(16, body.maxPlayers ?? prev?.maxPlayers ?? 8)),
          private: Boolean(body.private),
          passwordHash: body.password ? hashPw(body.password) : body.private ? prev?.passwordHash : undefined,
          updatedAt: Date.now(),
          version: (body.version ?? prev?.version)?.trim() || undefined,
          protocol: typeof body.protocol === "number" ? body.protocol : prev?.protocol,
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.statusCode = 400;
        res.end("bad json");
      }
    });
    return;
  }

  if (req.method === "DELETE" && parts[1] && parts.length === 2) {
    dropRoom(decodeURIComponent(parts[1]).toUpperCase());
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && parts[1] && parts[2] === "join") {
    void readBody(req).then((text) => {
      const id = decodeURIComponent(parts[1]).toUpperCase();
      const meta = roomMeta.get(id);
      if (!meta) {
        res.statusCode = 404;
        res.end("no room");
        return;
      }
      let password = "";
      try {
        password = (JSON.parse(text) as { password?: string }).password ?? "";
      } catch {
        password = "";
      }
      if (meta.passwordHash && hashPw(password) !== meta.passwordHash) {
        res.statusCode = 403;
        res.end("bad password");
        return;
      }
      if (meta.maxPlayers && meta.players >= meta.maxPlayers) {
        res.statusCode = 409;
        res.end("full");
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.statusCode = 405;
  res.end();
}

function handlePlay(
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
  getBind: () => ReturnType<typeof bindInfo>,
) {
  const url = req.url ?? "";
  if (url.startsWith("/__rooms")) {
    handleRooms(req, res, next);
    return;
  }
  if (url.startsWith("/__version")) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(versionInfo()));
    return;
  }
  if (url.startsWith("/__lan")) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(getBind()));
    return;
  }
  if (!url.startsWith("/__play/")) {
    next();
    return;
  }
  const parsed = new URL(url, "http://local");
  const roomId = decodeURIComponent(parsed.pathname.replace("/__play/", "")).trim();
  if (!roomId) {
    res.statusCode = 400;
    res.end("missing room");
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
  const room = roomOf(roomId);
  if (req.method === "POST") {
    void readBody(req).then((text) => {
      try {
        const msg = JSON.parse(text);
        const item = { seq: room.next++, msg };
        room.items.push(item);
        if (room.items.length > ROOM_ITEM_CAP) room.items.splice(0, room.items.length - ROOM_ITEM_KEEP);
        const waiters = room.waiters.splice(0);
        waiters.forEach((w) => w([item]));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, seq: item.seq }));
      } catch {
        res.statusCode = 400;
        res.end("bad json");
      }
    });
    return;
  }
  if (req.method === "GET") {
    if (parsed.searchParams.get("head") === "1") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ after: Math.max(0, room.next - 1), messages: [] }));
      return;
    }
    const after = Number(parsed.searchParams.get("after") || 0);
    const fresh = room.items.filter((i) => i.seq > after);
    const reply = (items: Item[]) => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          after: items.at(-1)?.seq ?? after,
          messages: items.map((i) => i.msg),
        }),
      );
    };
    if (fresh.length) {
      reply(fresh);
      return;
    }
    const timer = setTimeout(() => {
      room.waiters = room.waiters.filter((w) => w !== waiter);
      reply([]);
    }, 9000);
    const waiter = (items: Item[]) => {
      clearTimeout(timer);
      reply(items);
    };
    room.waiters.push(waiter);
    return;
  }
  res.statusCode = 405;
  res.end();
}

export function playNetPlugin(): Plugin {
  return {
    name: "play-net",
    configureServer(server) {
      const getBind = () => bindInfo(server.httpServer);
      server.middlewares.use((req, res, next) => handlePlay(req, res, next, getBind));
    },
    configurePreviewServer(server) {
      const getBind = () => bindInfo(server.httpServer);
      server.middlewares.use((req, res, next) => handlePlay(req, res, next, getBind));
    },
  };
}
