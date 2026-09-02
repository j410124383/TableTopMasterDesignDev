import { uid } from "@/lib/id";
import { APP_VERSION, APP_BUILD, PLAY_PROTOCOL } from "@/lib/appVersion";
import { buildIceServers, peerConfig } from "./iceServers";
import type { PlayEnvelope } from "./playTypes";

export type PlayNet = {
  send: (partial: Omit<PlayEnvelope, "id" | "at" | "room">) => void;
  close: () => void;
};

export type WanKind = "address" | "signaling" | "room" | "nat" | "module" | "busy";

export type WanStatus = {
  ok: boolean;
  detail: string;
  phase?: "connecting" | "connected" | "failed";
  kind?: WanKind;
  step?: "broker" | "peer" | "channel";
  code?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function peerIdOf(room: string) {
  return `ceditor${room.toLowerCase()}`;
}

type WireConn = {
  id: string;
  open: boolean;
  send: (data: string) => void;
  close: () => void;
};

function parseWire(raw: unknown): PlayEnvelope | null {
  try {
    const msg = (typeof raw === "string" ? JSON.parse(raw) : raw) as PlayEnvelope;
    if (!msg?.id || !msg.kind) return null;
    return msg;
  } catch {
    return null;
  }
}

function waitConnOpen(conn: { open?: boolean; on: Function }, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (conn.open) {
      resolve(true);
      return;
    }
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), ms);
    conn.on("open", () => finish(true));
    conn.on("error", () => finish(false));
    conn.on("close", () => finish(false));
  });
}

export function createPlayNet(
  room: string,
  onMessage: (msg: PlayEnvelope) => void,
  opts?: { wan?: boolean; asHost?: boolean; onWan?: (status: WanStatus) => void; onPeer?: () => void },
): PlayNet {
  const seen = new Set<string>();
  const ch = new BroadcastChannel(`ceditor-play-${room}`);
  let closed = false;
  let after = 0;
  const wanConns: WireConn[] = [];
  const pending: string[] = [];
  let wanPeer: { destroy: () => void } | null = null;
  const asHost = opts?.asHost !== false;
  const wanWanted = Boolean(opts?.wan);

  const ingest = (raw: unknown) => {
    const msg = parseWire(raw);
    if (!msg) return;
    if (seen.has(msg.id)) return;
    seen.add(msg.id);
    if (seen.size > 400) {
      seen.clear();
      seen.add(msg.id);
    }
    onMessage(msg);
  };

  const relayWan = (text: string, except?: WireConn) => {
    for (const c of wanConns) {
      if (c === except) continue;
      try {
        c.send(text);
      } catch {
        /* ignore */
      }
    }
  };

  const flushPending = () => {
    if (!wanConns.length || !pending.length) return;
    const batch = pending.splice(0, pending.length);
    for (const text of batch) relayWan(text);
  };

  const bind = (conn: { peer?: string; open?: boolean; on: Function; send: (d: unknown) => void; close: () => void }) => {
    const id = String(conn.peer || uid("pc"));
    for (let i = wanConns.length - 1; i >= 0; i--) {
      if (wanConns[i].id === id && !wanConns[i].open) {
        try {
          wanConns[i].close();
        } catch {
          /* ignore */
        }
        wanConns.splice(i, 1);
      }
    }
    if (wanConns.some((c) => c.id === id && c.open)) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
      return false;
    }
    const wrapped: WireConn = {
      id,
      open: Boolean(conn.open),
      send: (d) => conn.send(d),
      close: () => conn.close(),
    };
    wanConns.push(wrapped);
    conn.on("data", (d: unknown) => {
      ingest(d);
      if (asHost) {
        const text = typeof d === "string" ? d : JSON.stringify(d);
        relayWan(text, wrapped);
      }
    });
    conn.on("close", () => {
      wrapped.open = false;
      const i = wanConns.indexOf(wrapped);
      if (i >= 0) wanConns.splice(i, 1);
    });
    conn.on("open", () => {
      wrapped.open = true;
      flushPending();
    });
    if (conn.open) flushPending();
    return true;
  };

  ch.onmessage = (ev) => ingest(ev.data);

  async function poll() {
    try {
      const head = await fetch(`/__play/${encodeURIComponent(room)}?head=1`, { cache: "no-store" });
      if (head.ok) {
        const data = (await head.json()) as { after?: number };
        after = data.after ?? after;
      }
    } catch {
      /* start from 0; PlayPage ignores stale kicks */
    }
    while (!closed) {
      try {
        const res = await fetch(`/__play/${encodeURIComponent(room)}?after=${after}`, { cache: "no-store" });
        if (!res.ok) {
          await sleep(1600);
          continue;
        }
        const data = (await res.json()) as { after?: number; messages?: PlayEnvelope[] };
        after = data.after ?? after;
        for (const m of data.messages ?? []) ingest(m);
      } catch {
        await sleep(1600);
      }
    }
  }
  void poll();

  if (wanWanted && typeof window !== "undefined") {
    const tell = (status: WanStatus) => opts?.onWan?.(status);
    if (!window.isSecureContext) {
      tell({
        ok: false,
        phase: "failed",
        kind: "address",
        detail: `地址不对：当前是 ${window.location.host}。异地联机必须在本机用 http://localhost:1420/ 打开再填房号，不要用别人的局域网 IP。`,
      });
    } else {
      void (async () => {
        try {
          const iceServers = await buildIceServers();
          const { default: Peer } = await import("peerjs");
          tell({ ok: true, phase: "connecting", kind: "signaling", step: "broker", detail: "正在连接互联网信令…" });
          const makePeer = (relayOnly = false) =>
            asHost ? new Peer(peerIdOf(room), peerConfig(iceServers, relayOnly)) : new Peer(peerConfig(iceServers, relayOnly));
          let peer = makePeer(false);
          wanPeer = peer;
          let brokerOpen = false;
          const brokerTimer = window.setTimeout(() => {
            if (closed || brokerOpen) return;
            tell({
              ok: false,
              phase: "failed",
              kind: "signaling",
              step: "broker",
              code: "timeout",
              detail: "信令服务器连不上（PeerJS，15 秒无响应）。不是房号写错，是这台电脑访问不了联机服务器：检查是否能上网、公司网/校园网防火墙、代理或地区网络拦截。",
            });
          }, 15000);
          const onPeerError = (err: { type?: string; message?: string }) => {
            if (closed) return;
            const type = err.type ?? "";
            const kind =
              type === "peer-unavailable"
                ? "room"
                : type === "unavailable-id"
                  ? "busy"
                  : type === "webrtc" || type === "disconnected"
                    ? "nat"
                    : type === "browser-incompatible"
                      ? "module"
                      : "signaling";
            if (type === "peer-unavailable") {
              tell({
                ok: true,
                phase: "connecting",
                kind: "room",
                step: "peer",
                code: type,
                detail: "信令已通，但还找不到这个房号。房主可能还没开成异地通道，或房号写错。正在重试…",
              });
              return;
            }
            if (type === "webrtc") {
              tell({
                ok: true,
                phase: "connecting",
                kind: "nat",
                step: "channel",
                code: type,
                detail: "直连被防火墙挡住了，正在改走中继重试（先别关）。两边请关掉 VPN。",
              });
              return;
            }
            tell({
              ok: false,
              phase: type === "unavailable-id" ? "failed" : kind === "signaling" ? "failed" : "connecting",
              kind,
              step: kind === "nat" ? "channel" : "broker",
              code: type,
              detail:
                type === "unavailable-id"
                  ? "房号已被占用，换一个再开。"
                  : `互联网信令失败（${type || err.message || "error"}）。不是卡牌问题，是连不上联机服务器。`,
            });
          };
          peer.on("error", onPeerError);
          const waitBroker = () =>
            new Promise<boolean>((resolve) => {
              let settled = false;
              const finish = (ok: boolean) => {
                if (settled) return;
                settled = true;
                resolve(ok);
              };
              window.setTimeout(() => finish(false), 15000);
              peer.on("open", () => {
                brokerOpen = true;
                window.clearTimeout(brokerTimer);
                finish(true);
              });
            });
          const openedBroker = await waitBroker();
          if (closed || !openedBroker) return;
          if (asHost) {
            tell({
              ok: true,
              phase: "connected",
              kind: "signaling",
              step: "broker",
              detail: "异地通道已开。把房号发给对方，让他们自己开工坊后在「加入游戏」里填房号。",
            });
            let iceFails = 0;
            peer.on("connection", (conn) => {
              bind(conn);
              const ready = () => {
                if (closed) return;
                iceFails = 0;
                tell({ ok: true, phase: "connected", step: "channel", detail: "有玩家从互联网加入，正在同步桌面…" });
                opts?.onPeer?.();
              };
              if (conn.open) {
                ready();
                return;
              }
              void waitConnOpen(conn, 25000).then((ok) => {
                if (ok) {
                  ready();
                  return;
                }
                if (closed) return;
                iceFails += 1;
                try {
                  conn.close();
                } catch {
                  /* ignore */
                }
                if (iceFails >= 4) {
                  tell({
                    ok: false,
                    phase: "failed",
                    kind: "nat",
                    step: "channel",
                    detail: "多次通道都没打开。两边 NAT/防火墙挡住了直连和中继。请双方关掉 VPN 后再试；仍不行就用 Tailscale/ZeroTier 组成虚拟局域网，然后按「同一 Wi‑Fi」方式打开对方的 100.x 地址。",
                  });
                } else {
                  tell({
                    ok: true,
                    phase: "connecting",
                    kind: "nat",
                    step: "channel",
                    detail: `有人连上来了，但这一条数据通道没打开（${iceFails}/4）。不是房号问题，正在等对方改走中继重试。双方请先关 VPN。`,
                  });
                }
              });
            });
            return;
          }
          const target = peerIdOf(room);
          const attemptConnect = async (label: string, ms: number) => {
            tell({ ok: true, phase: "connecting", kind: "room", step: "peer", detail: label });
            const remote = peer.connect(target, { reliable: true, serialization: "json" });
            const opened = await waitConnOpen(remote, ms);
            if (closed) return true;
            if (opened && bind(remote)) {
              tell({ ok: true, phase: "connected", kind: "room", step: "channel", detail: "已连上房主，正在接收牌组…" });
              opts?.onPeer?.();
              return true;
            }
            try {
              remote.close();
            } catch {
              /* ignore */
            }
            return false;
          };
          for (let attempt = 0; attempt < 4 && !closed; attempt++) {
            if (
              await attemptConnect(
                attempt === 0 ? "信令已通，正在打洞连接房主…" : `直连未通，继续打洞（${attempt + 1}/4）…`,
                18000,
              )
            ) {
              return;
            }
            await sleep(600);
          }
          if (closed) return;
          tell({
            ok: true,
            phase: "connecting",
            kind: "nat",
            step: "channel",
            detail: "直连打洞失败，正在改走 TURN 中继（可穿透大部分家用 NAT/防火墙）…",
          });
          try {
            peer.destroy();
          } catch {
            /* ignore */
          }
          peer = makePeer(true);
          wanPeer = peer;
          brokerOpen = false;
          peer.on("error", onPeerError);
          const relayOpen = await new Promise<boolean>((resolve) => {
            const timer = window.setTimeout(() => resolve(false), 15000);
            peer.on("open", () => {
              window.clearTimeout(timer);
              resolve(true);
            });
            peer.on("error", () => {
              /* wait for timeout unless we already opened */
            });
          });
          if (closed) return;
          if (relayOpen) {
            for (let attempt = 0; attempt < 3 && !closed; attempt++) {
              if (await attemptConnect(`中继连接房主（${attempt + 1}/3）…`, 20000)) return;
              await sleep(800);
            }
          }
          if (!closed) {
            tell({
              ok: false,
              phase: "failed",
              kind: "nat",
              step: "channel",
              detail: "直连和中继都没打开数据通道。请双方关掉 VPN/代理后再试。仍不行：用 Tailscale 或 ZeroTier 组成虚拟局域网，然后按「同一 Wi‑Fi」打开对方的 100.x:1420 地址（不要再填异地房号）。",
            });
          }
        } catch (err) {
          tell({
            ok: false,
            phase: "failed",
            kind: "module",
            detail: `互联网模块加载失败（${err instanceof Error ? err.message : "import"}）。局域网仍可用。`,
          });
        }
      })();
    }
  }

  return {
    send(partial) {
      const msg: PlayEnvelope = {
        ...partial,
        id: uid("net"),
        at: Date.now(),
        room,
        appVersion: APP_VERSION,
        build: APP_BUILD,
        protocol: PLAY_PROTOCOL,
      };
      seen.add(msg.id);
      try {
        ch.postMessage(msg);
      } catch {
        /* ignore */
      }
      void fetch(`/__play/${encodeURIComponent(room)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(msg),
      }).catch(() => undefined);
      const text = JSON.stringify(msg);
      if (wanConns.length) {
        relayWan(text);
        return;
      }
      if (wanWanted && msg.kind !== "cursor") {
        pending.push(text);
        if (pending.length > 250) {
          const drop = pending.findIndex((row) => row.includes('"kind":"cursor"') || !row.includes('"kind":"pack"'));
          pending.splice(drop >= 0 ? drop : 0, 1);
        }
      }
    },
    close() {
      closed = true;
      pending.length = 0;
      ch.close();
      wanConns.forEach((c) => {
        try {
          c.close();
        } catch {
          /* ignore */
        }
      });
      wanConns.length = 0;
      try {
        wanPeer?.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

export function newRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const PLAY_ID_KEY = "ceditor-play-id";
const CLAIM_CH = "ceditor-play-id-claim";

let claimedId: string | null = null;
let claimChannel: BroadcastChannel | null = null;

function readStoredPlayerId(): string | null {
  try {
    return sessionStorage.getItem(PLAY_ID_KEY);
  } catch {
    return null;
  }
}

function writeStoredPlayerId(id: string) {
  try {
    sessionStorage.setItem(PLAY_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

function listenForClaims(id: string) {
  if (claimChannel) return;
  try {
    claimChannel = new BroadcastChannel(CLAIM_CH);
    claimChannel.onmessage = (ev) => {
      if (ev.data?.type === "who" && ev.data.id === id) {
        claimChannel?.postMessage({ type: "have", id });
      }
    };
  } catch {
    claimChannel = null;
  }
}

export function loadPlayerId(): string {
  if (claimedId) return claimedId;
  try {
    const hit = readStoredPlayerId();
    if (hit) {
      claimedId = hit;
      return hit;
    }
    const id = uid("pl");
    writeStoredPlayerId(id);
    claimedId = id;
    return id;
  } catch {
    const id = uid("pl");
    claimedId = id;
    return id;
  }
}

/** Unique per tab when BroadcastChannel works. Never blocks joining. */
export async function claimPlayerId(): Promise<string> {
  const id = loadPlayerId();
  window.setTimeout(() => listenForClaims(id), 0);
  return id;
}

export function loadPlayerName(): string {
  try {
    return localStorage.getItem("ceditor-play-name") || "玩家";
  } catch {
    return "玩家";
  }
}

export function savePlayerName(name: string) {
  try {
    localStorage.setItem("ceditor-play-name", name);
  } catch {
    /* ignore */
  }
}
