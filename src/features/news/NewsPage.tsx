import { useMemo, useState } from "react";
import { eventOnDay, isoDay, NEWS_ADS, NEWS_EVENTS, NEWS_STORIES } from "./newsData";

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

export function NewsPage() {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [picked, setPicked] = useState(() =>
    isoDay(today.getFullYear(), today.getMonth() + 1, today.getDate()),
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startPad = (first.getDay() + 6) % 7;
    const days = new Date(year, month, 0).getDate();
    const out: { iso?: string; day?: number }[] = Array.from({ length: startPad }, () => ({}));
    for (let d = 1; d <= days; d++) out.push({ iso: isoDay(year, month, d), day: d });
    return out;
  }, [year, month]);

  const dayEvents = NEWS_EVENTS.filter((e) => eventOnDay(picked, e));
  const monthEvents = NEWS_EVENTS.filter((e) => e.start.slice(0, 7) === `${year}-${String(month).padStart(2, "0")}` || (e.end && e.end.slice(0, 7) === `${year}-${String(month).padStart(2, "0")}`));

  return (
    <div className="news-layout">
      <aside className="news-cal card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-small" onClick={() => setCursor(new Date(year, month - 2, 1))}>
            上月
          </button>
          <strong>
            {year} 年 {month} 月
          </strong>
          <button type="button" className="btn btn-small" onClick={() => setCursor(new Date(year, month, 1))}>
            下月
          </button>
        </div>
        <div className="news-cal-week">
          {WEEK.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="news-cal-grid">
          {cells.map((c, i) => {
            if (!c.iso) return <span key={`e${i}`} />;
            const hit = NEWS_EVENTS.some((e) => eventOnDay(c.iso!, e));
            return (
              <button
                key={c.iso}
                type="button"
                className={`${c.iso === picked ? "picked" : ""} ${hit ? "has-ev" : ""}`}
                onClick={() => setPicked(c.iso!)}
              >
                {c.day}
              </button>
            );
          })}
        </div>
        <div className="news-cal-list">
          <strong>{picked} 节点</strong>
          {dayEvents.length === 0 ? (
            <p className="muted">这天没有标出的大赛或展会。本月还有 {monthEvents.length} 条。</p>
          ) : (
            dayEvents.map((e) => (
              <a key={e.id} href={e.href} target="_blank" rel="noreferrer" className="news-ev">
                <span className={`news-tag ${e.kind}`}>{e.kind === "expo" ? "展会" : e.kind === "contest" ? "比赛" : e.kind === "award" ? "奖项" : "店铺"}</span>
                {e.title}
              </a>
            ))
          )}
          {monthEvents.length > 0 && (
            <>
              <strong style={{ marginTop: 10 }}>本月一览</strong>
              {monthEvents.map((e) => (
                <button key={e.id} type="button" className="news-ev ghost" onClick={() => setPicked(e.start)}>
                  {e.start.slice(5)} {e.title}
                </button>
              ))}
            </>
          )}
        </div>
      </aside>
      <div className="news-main">
        <div className="news-ads">
          {NEWS_ADS.map((ad) => (
            <a key={ad.id} className="news-ad" href={ad.href} target="_blank" rel="noreferrer">
              <strong>{ad.title}</strong>
              <span>{ad.line}</span>
            </a>
          ))}
        </div>
        {NEWS_STORIES.map((s) => (
          <article key={s.id} className="card news-story">
            <div className={`news-tag ${s.kind}`}>{s.kicker}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <a href={s.href} target="_blank" rel="noreferrer">
              查看来源
            </a>
          </article>
        ))}
        <p className="muted news-disclaimer">
          展会与截稿日期来自各主办方公开页面，可能调整。广告位为资讯入口，TMD 不代收报名或售票。
        </p>
      </div>
    </div>
  );
}
