import { BRAND } from "@/brand";
import { versionStamp } from "@/lib/appVersion";
import { useT } from "@/store/localeStore";

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden>
      <img src="/favicon.svg" width={size} height={size} alt="" />
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <div className="brand">
      <BrandMark size={compact ? 28 : 36} />
      <div className="brand-copy">
        <span className="brand-name">{BRAND.name}</span>
        <span className="brand-slogan">{BRAND.full}</span>
        <span className="brand-version" title={t("brand.verHint")}>
          {versionStamp()}
        </span>
      </div>
    </div>
  );
}

export function SiteTags() {
  const t = useT();
  return (
    <footer className="site-tags site-tags-dock">
      <div className="site-tags-peek">{BRAND.name}</div>
      <div className="site-tags-panel">
        <span className="tag-free">{t("brand.free")}</span>
        <span>{BRAND.name}</span>
        <span>{versionStamp()}</span>
        <span>{BRAND.full}</span>
        <span>{t("brand.slogan")}</span>
        <span>
          {t("brand.contact")} · {BRAND.author}
        </span>
        <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
      </div>
    </footer>
  );
}
