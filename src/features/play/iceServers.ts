type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN: IceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.qq.com:3478" },
  { urls: "stun:stun.miwifi.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Metered Open Relay static-auth (public Nextcloud-style secret). Needed when both sides are behind NAT. */
async function openRelayTurn(): Promise<IceServer | null> {
  try {
    const expiry = Math.floor(Date.now() / 1000) + 6 * 3600;
    const username = `${expiry}:tmd`;
    const credential = await hmacSha1Base64("openrelayprojectsecret", username);
    return {
      urls: [
        "turn:staticauth.openrelay.metered.ca:80",
        "turn:staticauth.openrelay.metered.ca:80?transport=tcp",
        "turn:staticauth.openrelay.metered.ca:443",
        "turns:staticauth.openrelay.metered.ca:443?transport=tcp",
      ],
      username,
      credential,
    };
  } catch {
    return null;
  }
}

function extraTurnFromStorage(): IceServer[] {
  try {
    const raw = localStorage.getItem("tmd-turn");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IceServer | IceServer[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

export async function buildIceServers(): Promise<IceServer[]> {
  const turn = await openRelayTurn();
  return [...STUN, ...(turn ? [turn] : []), ...extraTurnFromStorage()];
}

export function peerConfig(iceServers: IceServer[], relayOnly = false) {
  return {
    debug: 0,
    config: {
      iceServers,
      iceTransportPolicy: relayOnly ? ("relay" as const) : ("all" as const),
      iceCandidatePoolSize: 8,
    },
  };
}
