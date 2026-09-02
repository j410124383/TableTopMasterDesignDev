import { useT } from "@/store/localeStore";

export function ZtInvite() {
  const t = useT();
  return (
    <article className="card join-mode-card zt">
      <span className="join-mode-tag">{t("play.ztMode")}</span>
      <h2>{t("play.ztTitle")}</h2>
      <p className="muted">{t("play.ztLead")}</p>
      <ol className="join-mode-steps">
        {[1, 2, 3, 4, 5].map((n) => (
          <li key={n}>
            <strong>{t(`play.zt${n}t`)}</strong>
            <span className="muted">{t(`play.zt${n}`)}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
