import type { CSSProperties } from "react";
import { create } from "zustand";

export type TableTheme = "acid" | "felt" | "wood" | "night" | "marble";

export const TABLE_THEMES: { id: TableTheme; label: string }[] = [
  { id: "acid", label: "酸性" },
  { id: "felt", label: "绿呢桌" },
  { id: "wood", label: "木桌" },
  { id: "night", label: "夜桌" },
  { id: "marble", label: "石面" },
];

export type WeatherId = "off" | "rain" | "snow";

export const WEATHERS: { id: WeatherId; label: string }[] = [
  { id: "off", label: "晴" },
  { id: "rain", label: "下雨" },
  { id: "snow", label: "下雪" },
];

export type PlayLook = {
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
  shadowStrength: number;
  tableTheme: TableTheme;
  weather: WeatherId;
  /** Hand rail glass opacity 0–1, default 50%. */
  handOpacity: number;
  /** Show opponents’ hand strips on the table. */
  showOppHands: boolean;
};

const KEY = "ceditor-play-look";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return DEFAULT_PLAY_LOOK.handOpacity;
  return Math.min(1, Math.max(0, n));
}

export const DEFAULT_PLAY_LOOK: PlayLook = {
  outline: true,
  outlineColor: "#1a1408",
  outlineWidth: 2,
  shadow: true,
  shadowStrength: 0.55,
  tableTheme: "felt",
  weather: "off",
  handOpacity: 0.5,
  showOppHands: false,
};

function readLook(): PlayLook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PLAY_LOOK };
    const parsed = JSON.parse(raw) as Partial<PlayLook>;
    const theme = TABLE_THEMES.some((t) => t.id === parsed.tableTheme) ? parsed.tableTheme! : DEFAULT_PLAY_LOOK.tableTheme;
    const weather = WEATHERS.some((w) => w.id === parsed.weather) ? parsed.weather! : DEFAULT_PLAY_LOOK.weather;
    const handOpacity = clamp01(parsed.handOpacity ?? DEFAULT_PLAY_LOOK.handOpacity);
    const showOppHands = Boolean(parsed.showOppHands);
    return { ...DEFAULT_PLAY_LOOK, ...parsed, tableTheme: theme, weather, handOpacity, showOppHands };
  } catch {
    return { ...DEFAULT_PLAY_LOOK };
  }
}

type State = PlayLook & {
  setLook: (patch: Partial<PlayLook>) => void;
};

export const usePlayLookStore = create<State>((set, get) => ({
  ...readLook(),
  setLook: (patch) => {
    const next = { ...get(), ...patch };
    const look: PlayLook = {
      outline: next.outline,
      outlineColor: next.outlineColor,
      outlineWidth: next.outlineWidth,
      shadow: next.shadow,
      shadowStrength: next.shadowStrength,
      tableTheme: next.tableTheme ?? "felt",
      weather: next.weather ?? "off",
      handOpacity: clamp01(next.handOpacity ?? DEFAULT_PLAY_LOOK.handOpacity),
      showOppHands: Boolean(next.showOppHands),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(look));
    } catch {
      /* ignore */
    }
    set(look);
  },
}));

export function cardLookStyle(look: PlayLook): CSSProperties {
  const blur = 6 + look.shadowStrength * 18;
  const y = 4 + look.shadowStrength * 10;
  const alpha = 0.18 + look.shadowStrength * 0.42;
  return {
    outline: look.outline ? `${look.outlineWidth}px solid ${look.outlineColor}` : "none",
    outlineOffset: look.outline ? -1 : 0,
    boxShadow: look.shadow ? `0 ${y}px ${blur}px rgba(0,0,0,${alpha})` : "none",
    borderRadius: 7,
  };
}
