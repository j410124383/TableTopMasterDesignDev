import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "@/brand";
import { APP_ZIP, zipDownloadReady } from "@/lib/appZip";
import { APP_VERSION, versionStamp } from "@/lib/appVersion";
import { useT } from "@/store/localeStore";
import { Brand, SiteTags } from "@/ui/Brand";
import { PrefsMenu } from "@/ui/PrefsMenu";

export { APP_ZIP };

export function LandingPage() {
  const t = useT();
  const [hasZip, setHasZip] = useState<boolean | null>(null);

  useEffect(() => {
    void zipDownloadReady().then(setHasZip);
  }, []);

  return (
    <div className="land-root">
      <header className="topbar">
        <Brand />
        <div className="toolbar">
          <Link className="btn" to="/app">
            {t("nav.studio")}
          </Link>
          <PrefsMenu />
        </div>
      </header>

      <section className="land-hero">
        <p className="land-kicker">{t("land.kicker")}</p>
        <h1 className="land-mark">{BRAND.name}</h1>
        <p className="land-full">{BRAND.full}</p>
        <p className="land-lead">{t("land.hero")}</p>
        <p className="muted">{t("land.sub")}</p>
        <div className="land-cta">
          {hasZip ? (
            <a className="btn btn-primary land-dl" href={APP_ZIP} download>
              {t("land.download", { v: `v${APP_VERSION}` })}
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              {t("land.download", { v: `v${APP_VERSION}` })}
            </button>
          )}
          <Link className="btn" to="/app">
            {t("land.try")}
          </Link>
        </div>
        {hasZip === false && <p className="banner">{t("land.missing")}</p>}
        <p className="muted">{t("land.ver", { stamp: versionStamp() })}</p>
      </section>

      <section className="land-steps">
        {[1, 2, 3].map((n) => (
          <article key={n} className="card land-card">
            <span className="land-num">{n}</span>
            <h2>{t(`land.step${n}t`)}</h2>
            <p className="muted">{t(`land.step${n}`)}</p>
          </article>
        ))}
      </section>

      <section className="land-feats">
        {[1, 2, 3].map((n) => (
          <article key={n} className="card land-card">
            <h2>{t(`land.feat${n}t`)}</h2>
            <p className="muted">{t(`land.feat${n}`)}</p>
          </article>
        ))}
      </section>

      <SiteTags />
    </div>
  );
}
