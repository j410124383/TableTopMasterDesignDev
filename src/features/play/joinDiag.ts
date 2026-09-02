import { joinRoomGate } from "./roomsApi";

export type JoinKind = "address" | "offline" | "studio" | "signaling" | "room" | "nat" | "pack" | "module" | "busy";

export type DiagStatus = "wait" | "ok" | "fail" | "skip";

export type DiagStep = {
  id: string;
  status: DiagStatus;
  note?: string;
};

export type JoinEnv = {
  online: boolean;
  host: string;
  localhost: boolean;
  lanIp: boolean;
  secure: boolean;
  href: string;
  studioOk: boolean;
  version?: string;
  build?: string;
  localRoom: "ok" | "pw" | "full" | "gone" | "offline";
};

export async function inspectJoinEnv(code: string): Promise<JoinEnv> {
  const host = window.location.hostname;
  const localhost = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  const lanIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  let studioOk = false;
  let version: string | undefined;
  let build: string | undefined;
  try {
    const res = await fetch("/__version", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { version?: string; build?: string };
      studioOk = true;
      version = data.version;
      build = data.build;
    }
  } catch {
    studioOk = false;
  }
  const localRoom = await joinRoomGate(code);
  return {
    online: navigator.onLine,
    host,
    localhost,
    lanIp,
    secure: window.isSecureContext,
    href: window.location.href,
    studioOk,
    version,
    build,
    localRoom,
  };
}

export function classifyPeerError(type?: string): JoinKind {
  switch (type) {
    case "peer-unavailable":
      return "room";
    case "unavailable-id":
      return "busy";
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed":
    case "ssl-unavailable":
      return "signaling";
    case "webrtc":
    case "disconnected":
      return "nat";
    case "browser-incompatible":
      return "module";
    default:
      return "signaling";
  }
}

export function formatJoinReport(input: {
  code: string;
  env?: JoinEnv | null;
  kind?: JoinKind | string;
  phase?: string;
  peerCode?: string;
  pack?: { got: number; total: number } | null;
  lastDetail?: string;
  stamp?: string;
}): string {
  const env = input.env;
  return [
    `TMD ${input.stamp ?? ""}`.trim(),
    `房号 ${input.code}`,
    `阶段 ${input.phase ?? "?"}  分类 ${input.kind ?? "?"}`,
    input.peerCode ? `PeerJS ${input.peerCode}` : "",
    env
      ? [
          `地址 ${env.href}`,
          `hostname ${env.host}  localhost=${env.localhost}  lanIp=${env.lanIp}  secure=${env.secure}  online=${env.online}`,
          `工坊 ${env.studioOk ? "ok" : "fail"} ${env.version ?? ""} ${env.build ?? ""}`,
          `本地房间 ${env.localRoom}`,
        ].join("\n")
      : "",
    input.pack ? `牌组 ${input.pack.got}/${input.pack.total}` : "",
    input.lastDetail ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function emptyJoinSteps(): DiagStep[] {
  return [
    { id: "env", status: "wait" },
    { id: "studio", status: "wait" },
    { id: "local", status: "wait" },
    { id: "signaling", status: "wait" },
    { id: "host", status: "wait" },
    { id: "pack", status: "wait" },
  ];
}

export function patchSteps(list: DiagStep[], id: string, status: DiagStatus, note?: string): DiagStep[] {
  return list.map((s) => (s.id === id ? { ...s, status, note } : s));
}
