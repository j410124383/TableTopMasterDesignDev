import { useT } from "@/store/localeStore";
import type { DiagStep, JoinKind } from "./joinDiag";

export function JoinWaitPanel({
  code,
  failed,
  kind,
  hint,
  steps,
  packNote,
  report,
  onBack,
  onCopy,
  title: titleOverride,
  alwaysBack,
}: {
  code: string;
  failed: boolean;
  kind?: JoinKind | string;
  hint: string;
  steps: DiagStep[];
  packNote?: string;
  report: string;
  onBack: () => void;
  onCopy?: () => void;
  title?: string;
  alwaysBack?: boolean;
}) {
  const t = useT();
  const title = titleOverride ?? (failed ? t(kind ? `play.fail.${kind}` : "play.fail.unknown") : t("play.netConnecting"));
  const showBack = alwaysBack || failed;
  return (
    <div className="page play-lobby play-net-wait">
      {!failed && <span className="play-net-spin" aria-hidden />}
      {code ? <p className="play-wait-kicker">{t("play.room", { code })}</p> : <p className="play-wait-kicker">{t("play.solo")}</p>}
      <h1 className={`play-wait-title ${failed ? "fail" : ""}`}>{title}</h1>
      <p className="muted play-wait-hint">{hint || packNote || t("play.netConnecting")}</p>
      <ol className="join-diag-steps">
        {steps.map((s) => (
          <li key={s.id} className={`join-diag-step ${s.status}`}>
            <span className="join-diag-mark" aria-hidden>
              {s.status === "ok" ? "✓" : s.status === "fail" ? "×" : s.status === "skip" ? "–" : "·"}
            </span>
            <span>
              <strong>{t(`play.diag.${s.id}`)}</strong>
              {s.note ? <span className="muted"> {s.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {showBack && (
        <div className="row play-wait-actions">
          <button type="button" className="btn btn-primary" onClick={onBack}>
            {t("play.back")}
          </button>
          {failed && onCopy && report ? (
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.clipboard.writeText(report).then(onCopy)}
            >
              {t("play.copyDiag")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
