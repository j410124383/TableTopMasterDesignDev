import { create } from "zustand";
import { type Locale, translate } from "@/i18n/dict";

const KEY = "ceditor-locale";

function readLocale(): Locale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "zh";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function applyLocale(locale: Locale) {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* ignore */
  }
}

type State = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useLocaleStore = create<State>((set) => ({
  locale: readLocale(),
  setLocale: (locale) => {
    applyLocale(locale);
    set({ locale });
  },
}));

export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

export function bootLocale() {
  applyLocale(useLocaleStore.getState().locale);
}
