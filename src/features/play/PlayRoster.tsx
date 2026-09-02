import { useRef, useState } from "react";
import { useT } from "@/store/localeStore";
import { ContextMenu } from "@/ui/ContextMenu";
import { IconCrown } from "@/ui/Icons";
import { PLAYER_COLORS, type PlayPlayer } from "./playTypes";

const COLOR_NAMES: Record<string, string> = {
  "#d6ff3c": "酸黄",
  "#00f0ff": "青",
  "#ff2bd6": "粉",
  "#7dffb3": "绿",
  "#ff8a3c": "橙",
  "#c084fc": "紫",
};

export function PlayRoster({
  players,
  meId,
  hostId,
  canHost,
  latencyMs,
  peekId,
  onPeek,
  onColor,
  onKick,
}: {
  players: PlayPlayer[];
  meId: string;
  hostId: string;
  canHost: boolean;
  latencyMs?: number;
  peekId?: string | null;
  onPeek: (id: string | null) => void;
  onColor: (id: string, color: string) => void;
  onKick: (id: string) => void;
}) {
  const t = useT();
  const colorRef = useRef<HTMLInputElement>(null);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const ordered = [...players].sort((a, b) => {
    if (a.id === hostId || a.host) return -1;
    if (b.id === hostId || b.host) return 1;
    return 0;
  });
  let guestN = 0;

  function pickCustom(id: string) {
    setColorFor(id);
    window.requestAnimationFrame(() => colorRef.current?.click());
  }

  return (
    <div className="play-roster">
      <input
        ref={colorRef}
        type="color"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (colorFor) onColor(colorFor, e.target.value);
        }}
      />
      {ordered.map((p) => {
        const host = p.id === hostId || !!p.host;
        if (!host) guestN += 1;
        const mine = p.id === meId;
        const canEdit = mine || canHost;
        const peeking = peekId === p.id;
        return (
          <div key={p.id} className="play-roster-chip">
            <button
              type="button"
              className={`play-roster-btn ${mine ? "mine" : ""} ${host ? "host" : ""} ${peeking ? "peek" : ""}`}
              style={{ borderColor: p.color || "var(--line)" }}
              onClick={() => {
                if (mine) {
                  onPeek(null);
                  return;
                }
                onPeek(peeking ? null : p.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!canEdit && !(canHost && !mine)) return;
                setMenu({ x: e.clientX, y: e.clientY, id: p.id });
              }}
            >
              <span className="play-roster-dot" style={{ background: p.color || "transparent" }} />
              {host ? (
                <span className="play-roster-role">
                  {t("play.hostBadge")} <IconCrown size={13} />
                </span>
              ) : (
                <span className="play-roster-role">{t("play.playerN", { n: guestN })}</span>
              )}
              <span className="play-roster-name">{p.name || t("play.player")}</span>
              {host && latencyMs != null && <span className="play-roster-ms">{latencyMs}ms</span>}
              {!p.color && <span className="muted">{t("play.spectate")}</span>}
            </button>
          </div>
        );
      })}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...((players.find((p) => p.id === menu.id) && (menu.id === meId || canHost)
              ? [
                  {
                    label: "改色",
                    submenu: [
                      { label: "旁观（无色）", color: "transparent", onClick: () => onColor(menu.id, "") },
                      ...PLAYER_COLORS.map((c) => ({
                        label: COLOR_NAMES[c] ?? c,
                        color: c,
                        disabled: players.some((o) => o.id !== menu.id && o.color === c),
                        onClick: () => onColor(menu.id, c),
                      })),
                      { label: "选择颜色…", onClick: () => pickCustom(menu.id) },
                    ],
                  },
                ]
              : [])),
            ...(canHost && menu.id !== meId
              ? [{ label: t("play.kick"), danger: true, onClick: () => onKick(menu.id) }]
              : []),
          ]}
        />
      )}
    </div>
  );
}
