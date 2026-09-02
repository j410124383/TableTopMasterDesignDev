import { useT } from "@/store/localeStore";
import { ZtInvite } from "@/features/play/ZtInvite";
import { versionStamp } from "@/lib/appVersion";

function isLoopback() {
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function ModeCard({
  mode,
  steps,
}: {
  mode: "lan" | "wan";
  steps: number;
}) {
  const t = useT();
  return (
    <article className={`card join-mode-card ${mode}`}>
      <span className="join-mode-tag">{t(`play.${mode}Mode`)}</span>
      <h2>{t(`play.${mode}Title`)}</h2>
      <p className="muted">{t(`play.${mode}Lead`)}</p>
      <ol className="join-mode-steps">
        {Array.from({ length: steps }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <strong>{t(`play.${mode}${n}t`)}</strong>
            <span className="muted">{t(`play.${mode}${n}`)}</span>
          </li>
        ))}
      </ol>
      {mode === "lan" && isLoopback() && <p className="muted join-mode-note">{t("play.localWarn")}</p>}
    </article>
  );
}

export function JoinGuide() {
  const t = useT();
  return (
    <div className="join-guide-grid">
      <p className="muted join-ver">{t("play.sameVer", { stamp: versionStamp() })}</p>
      <ModeCard mode="lan" steps={4} />
      <ModeCard mode="wan" steps={3} />
      <ZtInvite />
    </div>
  );
}
