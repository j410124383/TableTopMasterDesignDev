import { LOCALES } from "@/i18n/dict";
import { useLocaleStore, useT } from "@/store/localeStore";

export function LocaleSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocaleStore();
  const t = useT();
  return (
    <label className="theme-switch" title={t("lang.label")}>
      {!compact && <span className="muted">{t("lang.label")}</span>}
      <select value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
        {LOCALES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
