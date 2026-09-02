import { GUIDE_TASKS, useOnboardingStore } from "@/store/onboardingStore";
import { useT } from "@/store/localeStore";

export function OnboardingDock({ corner = "default" }: { corner?: "default" | "play" }) {
  const { open, done, dismiss, reopen } = useOnboardingStore();
  const t = useT();
  const finished = done.length >= GUIDE_TASKS.length;
  if (finished) return null;

  if (!open) {
    return (
      <button type="button" className={`guide-fab ${corner === "play" ? "play-corner" : ""}`} onClick={reopen}>
        {t("guide.fab", { done: done.length, total: GUIDE_TASKS.length })}
      </button>
    );
  }

  return (
    <aside className={`guide-dock ${corner === "play" ? "play-corner" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{t("guide.title")}</strong>
        <button type="button" className="btn btn-small" onClick={dismiss}>
          {finished ? t("guide.fold") : t("guide.later")}
        </button>
      </div>
      <p className="muted" style={{ margin: "6px 0 10px" }}>
        {finished ? t("guide.done") : t("guide.intro")}
      </p>
      <ol className="guide-list">
        {GUIDE_TASKS.map((task, i) => {
          const ok = done.includes(task.id);
          return (
            <li key={task.id} className={ok ? "done" : ""}>
              <span className="guide-idx">{ok ? "✓" : i + 1}</span>
              <div>
                <div>{t(`guide.${task.id}`)}</div>
                {!ok && <div className="muted">{t(`guide.${task.id}.h`)}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
