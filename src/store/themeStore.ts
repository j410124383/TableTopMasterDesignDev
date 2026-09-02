import { create } from "zustand";

export type ThemeId = "dark" | "light" | "felt";

const KEY = "ceditor-theme";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "dark", label: "酸性" },
  { id: "light", label: "浅色" },
  { id: "felt", label: "夜光" },
];

export function readStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "felt") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  document.documentElement.style.colorScheme = id === "light" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

type ThemeState = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
