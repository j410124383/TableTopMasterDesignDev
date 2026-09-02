export type PublicRoom = {
  id: string;
  name: string;
  hostName?: string;
  players: number;
  maxPlayers?: number;
  private: boolean;
  locked?: boolean;
  updatedAt: number;
  version?: string;
  protocol?: number;
};

export async function fetchRooms(): Promise<PublicRoom[]> {
  try {
    const res = await fetch("/__rooms", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { rooms?: PublicRoom[] };
    return data.rooms ?? [];
  } catch {
    return [];
  }
}

export async function publishRoom(input: {
  id: string;
  name: string;
  hostName?: string;
  players: number;
  maxPlayers?: number;
  private: boolean;
  password?: string;
  version?: string;
  protocol?: number;
}) {
  await fetch("/__rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => undefined);
}

export async function unpublishRoom(id: string) {
  await fetch(`/__rooms/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
}

export async function joinRoomGate(id: string, password = ""): Promise<"ok" | "pw" | "full" | "gone" | "offline"> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), 4000);
  try {
    const res = await fetch(`/__rooms/${encodeURIComponent(id)}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
      signal: ac.signal,
    });
    if (res.ok) return "ok";
    if (res.status === 403) return "pw";
    if (res.status === 409) return "full";
    if (res.status === 404) return "gone";
    return "ok";
  } catch {
    return "offline";
  } finally {
    window.clearTimeout(timer);
  }
}
