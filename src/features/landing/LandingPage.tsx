import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "@/brand";
import { APP_ZIP, APP_ZIP_MAC, zipDownloadReady } from "@/lib/appZip";
import { APP_VERSION, versionStamp } from "@/lib/appVersion";
import { useT } from "@/store/localeStore";
import { Brand, SiteTags } from "@/ui/Brand";
import { PrefsMenu } from "@/ui/PrefsMenu";

export { APP_ZIP, APP_ZIP_MAC };

function ZipBtn({
  href,
  ready,
  label,
}: {
  href: string;
  ready: boolean | null;
  label: string;
}) {
  if (ready) {
    return (
      <a className="btn btn-primary land-dl" href={href} download>
        {label}
      </a>
    );
  }
  return (
    <button type="button" className="btn btn-primary land-dl" disabled>
      {label}
    </button>
  );
}

export function LandingPage() {
  const t = useT();
  const [hasWin, setHasWin] = useState<boolean | null>(null);
  const [hasMac, setHasMac] = useState<boolean | null>(null);

  useEffect(() => {
    void zipDownloadReady(APP_ZIP).then(setHasWin);
    void zipDownloadReady(APP_ZIP_MAC).then(setHasMac);
  }, []);

  const v = `v${APP_VERSION}`;
  const bothMissing = hasWin === false && hasMac === false;

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
          <ZipBtn href={APP_ZIP} ready={hasWin} label={t("land.downloadWin", { v })} />
          <ZipBtn href={APP_ZIP_MAC} ready={hasMac} label={t("land.downloadMac", { v })} />
          <Link className="btn" to="/app">
            {t("land.try")}
          </Link>
        </div>
        {bothMissing && <p className="banner">{t("land.missing")}</p>}
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
      <p className="muted land-mac-hint">{t("land.macHint")}</p>

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
