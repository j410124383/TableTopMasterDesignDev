import { create } from "zustand";

export type HomeMode = "create" | "play" | "market" | "news" | "forum";
export type PlayTab = "host" | "join" | "profile";
export type HomeShelf = "board" | "subscribed" | "examples";

const KEY = "ceditor-home-view";

type Snap = { mode: HomeMode; playTab: PlayTab; shelf: HomeShelf };

function readSnap(): Partial<Snap> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}") as Partial<Snap>;
  } catch {
    return {};
  }
}

function writeSnap(s: Snap) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const init = readSnap();

type State = Snap & {
  setMode: (mode: HomeMode) => void;
  setPlayTab: (playTab: PlayTab) => void;
  setShelf: (shelf: HomeShelf) => void;
  remember: (patch: Partial<Snap>) => void;
};

export const useHomeViewStore = create<State>((set, get) => ({
  mode: init.mode ?? "create",
  playTab: init.playTab ?? "join",
  shelf: init.shelf ?? "board",
  setMode: (mode) => {
    const next = { ...get(), mode };
    writeSnap(next);
    set({ mode });
  },
  setPlayTab: (playTab) => {
    const next = { ...get(), playTab };
    writeSnap(next);
    set({ playTab });
  },
  setShelf: (shelf) => {
    const next = { ...get(), shelf };
    writeSnap(next);
    set({ shelf });
  },
  remember: (patch) => {
    const cur = get();
    const next = { mode: cur.mode, playTab: cur.playTab, shelf: cur.shelf, ...patch };
    writeSnap(next);
    set(patch);
  },
}));

export function rememberHome(patch: Partial<Snap>) {
  useHomeViewStore.getState().remember(patch);
}
