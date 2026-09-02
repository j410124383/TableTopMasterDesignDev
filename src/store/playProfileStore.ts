import { create } from "zustand";
import { PLAYER_COLORS } from "@/features/play/playTypes";
import { loadAvatarId, saveAvatarId } from "@/ui/PlayAvatar";
import { loadPlayerName, savePlayerName } from "@/features/play/playNet";

export type GenderId = "male" | "female" | "other";
export type PlayerKind = "developer" | "player";

export const GENDERS: { id: GenderId; label: string }[] = [
  { id: "male", label: "男" },
  { id: "female", label: "女" },
  { id: "other", label: "其他" },
];

export const PLAYER_KINDS: { id: PlayerKind; label: string }[] = [
  { id: "player", label: "桌游玩家" },
  { id: "developer", label: "开发者" },
];

export type PlayProfile = {
  name: string;
  avatar: string;
  gender: GenderId;
  kind: PlayerKind;
  color: string;
};

const KEY = "ceditor-play-profile";

function readProfile(): PlayProfile {
  const fallback: PlayProfile = {
    name: loadPlayerName(),
    avatar: loadAvatarId(),
    gender: "other",
    kind: "player",
    color: PLAYER_COLORS[0],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayProfile>;
    return {
      name: parsed.name?.trim() || fallback.name,
      avatar: parsed.avatar || fallback.avatar,
      gender: parsed.gender === "male" || parsed.gender === "female" ? parsed.gender : "other",
      kind: parsed.kind === "developer" ? "developer" : "player",
      color: parsed.color || fallback.color,
    };
  } catch {
    return fallback;
  }
}

function persist(profile: PlayProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
  savePlayerName(profile.name);
  saveAvatarId(profile.avatar);
}

type State = PlayProfile & {
  setProfile: (patch: Partial<PlayProfile>) => void;
};

export const usePlayProfileStore = create<State>((set, get) => ({
  ...readProfile(),
  setProfile: (patch) => {
    const next = { ...get(), ...patch };
    const profile: PlayProfile = {
      name: next.name,
      avatar: next.avatar,
      gender: next.gender,
      kind: next.kind,
      color: next.color,
    };
    persist(profile);
    set(profile);
  },
}));
