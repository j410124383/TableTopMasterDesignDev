import { create } from "zustand";

export type GuideTaskId = "open-example" | "try-play" | "clone-board" | "visit-market" | "upload";

export type GuideTask = {
  id: GuideTaskId;
  title: string;
  hint: string;
};

export const GUIDE_TASKS: GuideTask[] = [
  { id: "open-example", title: "打开案例「扑克牌」", hint: "桌游创作 → 案例，点开扑克牌看蓝图。" },
  { id: "try-play", title: "试玩抽一张牌", hint: "回首页点「试玩」，用案例或工作板开一局。" },
  { id: "clone-board", title: "把案例加入工作板", hint: "打开案例后点「加入工作板」，选一个本地文件夹。" },
  { id: "visit-market", title: "逛一逛游戏市集", hint: "首页第三栏能看到官方案例扑克牌。" },
  { id: "upload", title: "从工作板上传一个项目", hint: "市集里用下拉框选工作板项目，或在卡片上点「上传到市集」。" },
];

const KEY = "ceditor-onboarding";

type Saved = { done: GuideTaskId[]; dismissed: boolean; seen: boolean };

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { done: [], dismissed: false, seen: false };
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return {
      done: Array.isArray(parsed.done) ? (parsed.done as GuideTaskId[]) : [],
      dismissed: !!parsed.dismissed,
      seen: !!parsed.seen,
    };
  } catch {
    return { done: [], dismissed: false, seen: false };
  }
}

type State = Saved & {
  open: boolean;
  complete: (id: GuideTaskId) => void;
  dismiss: () => void;
  reopen: () => void;
  markSeen: () => void;
};

export const useOnboardingStore = create<State>((set, get) => {
  const saved = readSaved();
  return {
    ...saved,
    open: !saved.dismissed,
    complete: (id) => {
      if (get().done.includes(id)) return;
      const done = [...get().done, id];
      const finished = done.length >= GUIDE_TASKS.length;
      const next = { done, dismissed: finished ? true : get().dismissed, seen: true };
      localStorage.setItem(KEY, JSON.stringify(next));
      set({ done, seen: true, dismissed: next.dismissed, open: finished ? false : get().open });
    },
    dismiss: () => {
      const next = { done: get().done, dismissed: true, seen: true };
      localStorage.setItem(KEY, JSON.stringify(next));
      set({ dismissed: true, seen: true, open: false });
    },
    reopen: () => set({ open: true, dismissed: false }),
    markSeen: () => {
      const next = { done: get().done, dismissed: get().dismissed, seen: true };
      localStorage.setItem(KEY, JSON.stringify(next));
      set({ seen: true });
    },
  };
});
