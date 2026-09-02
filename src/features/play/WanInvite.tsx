import { useT } from "@/store/localeStore";

export function WanInvite() {
  const t = useT();
  return (
    <article className="card join-mode-card wan">
      <span className="join-mode-tag">{t("play.wanMode")}</span>
      <h2>{t("play.wanTitle")}</h2>
      <p className="muted">{t("play.wanLead")}</p>
      <p className="muted">{t("play.fail.nat.h")}</p>
      <ol className="join-mode-steps">
        {[1, 2, 3].map((n) => (
          <li key={n}>
            <strong>{t(`play.wan${n}t`)}</strong>
            <span className="muted">{t(`play.wan${n}`)}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
