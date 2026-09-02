import { THEMES, useThemeStore } from "@/store/themeStore";
import { useT } from "@/store/localeStore";

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useThemeStore();
  const t = useT();
  return (
    <label className="theme-switch" title={t("theme.label")}>
      {!compact && <span className="muted">{t("theme.label")}</span>}
      <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
        {THEMES.map((item) => (
          <option key={item.id} value={item.id}>
            {t(`theme.${item.id}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
