import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ensureOfficialMarket } from "@/features/market/marketSeed";
import { useAppStore, marketAuthorId } from "@/store/appStore";
import { useT } from "@/store/localeStore";
import { rememberHome } from "@/store/homeViewStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { usePlayProfileStore } from "@/store/playProfileStore";
import { Brand } from "@/ui/Brand";
import { PrefsMenu } from "@/ui/PrefsMenu";

export type MarketItem = {
  id: string;
  name: string;
  author: string;
  kind: string;
  desc: string;
  cover?: string;
  rating: number;
  rates: number;
  subs: number;
  ownerId?: string;
  official?: boolean;
  projectId?: string;
};

export function MarketPage({
  embedded = false,
  pickId,
}: {
  embedded?: boolean;
  pickId?: string | null;
}) {
  const navigate = useNavigate();
  const profile = usePlayProfileStore();
  const { index, subscribeMarket, unsubscribeMarket, uploadMarket, updateMarket, unlistMarket } = useAppStore();
  const complete = useOnboardingStore((s) => s.complete);
  const t = useT();
  const [items, setItems] = useState<MarketItem[]>([]);
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"discover" | "mine">("discover");
  const owned = useMemo(
    () => index.projects.filter((p) => !p.origin || p.origin === "owned"),
    [index.projects],
  );
  const subscribedIds = useMemo(
    () => new Set(index.projects.filter((p) => p.origin === "subscribed").map((p) => p.marketId || p.id.replace(/^sub_/, ""))),
    [index.projects],
  );
  const [selectedId, setSelectedId] = useState(pickId ?? owned[0]?.id ?? "");

  useEffect(() => {
    if (pickId) setSelectedId(pickId);
  }, [pickId]);

  async function reload() {
    await ensureOfficialMarket();
    const res = await fetch("/__market");
    const data = (await res.json()) as { items?: MarketItem[] };
    setItems(data.items ?? []);
  }

  useEffect(() => {
    complete("visit-market");
    void reload();
  }, [complete]);

  const mine = items.filter((i) => !i.official && i.ownerId === marketAuthorId());
  const shown = tab === "mine" ? mine : items;
  const selected = owned.find((p) => p.id === selectedId);
  const listed = mine.find((i) => i.projectId === selectedId);

  const body = (
    <>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>{t("market.title")}</h1>
            <p className="muted">{t("market.lead")}</p>
          </div>
        </div>
      )}
      {error && <div className="banner">{error}</div>}
      <div className="home-shelf" style={{ marginBottom: 14 }}>
        <button type="button" className={tab === "discover" ? "active" : ""} onClick={() => setTab("discover")}>
          {t("market.discover")}
        </button>
        <button type="button" className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
          {t("market.mine")}
        </button>
      </div>
      <div className="card play-join-card">
        <strong>{t("market.uploadTitle")}</strong>
        <p className="muted" style={{ margin: "6px 0 8px" }}>
          {t("market.uploadHint", { name: profile.name })}
        </p>
        {owned.length === 0 ? (
          <p className="muted">{t("market.noBoard")}</p>
        ) : (
          <>
            <label className="field">
              {t("market.pick")}
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                {owned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <textarea value={desc} placeholder={t("market.desc")} onChange={(e) => setDesc(e.target.value)} />
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selectedId || busy}
                onClick={async () => {
                  if (!selectedId) return;
                  setBusy(true);
                  setError(null);
                  try {
                    if (listed) await updateMarket(listed.id, selectedId, desc);
                    else await uploadMarket(selectedId, desc);
                    setDesc("");
                    await reload();
                    setTab("mine");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "上传失败");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {listed ? t("market.update", { name: selected?.name ?? "" }) : t("market.upload", { name: selected?.name ?? "" })}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="grid" style={{ marginTop: 20 }}>
        {shown.length === 0 && (
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            <p>{tab === "mine" ? t("market.emptyMine") : t("market.emptyAll")}</p>
          </div>
        )}
        {shown.map((item) => (
          <article key={item.id} className="card project-card" style={{ cursor: "default" }}>
            <div className="cover">{item.cover ? <img src={item.cover} alt="" /> : item.name.slice(0, 1)}</div>
            <div className="card-body">
              <h3>
                {item.name}
                {item.official && <span className="origin-badge example">{t("origin.ex")}</span>}
              </h3>
              <div className="muted">
                {item.author} · {item.kind} · {item.rating.toFixed(1)} 分 · {item.subs} 订阅
              </div>
              <p className="muted">{item.desc}</p>
              <div className="card-actions">
                {subscribedIds.has(item.id) ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm(t("card.unsubAsk", { name: item.name }))) return;
                      setBusy(true);
                      try {
                        await unsubscribeMarket(item.id);
                        rememberHome({ mode: "create" });
                        await reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : t("card.unsubFail"));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t("card.unsub")}
                  </button>
                ) : (
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await subscribeMarket(item.id);
                      rememberHome({ mode: "play", playTab: "host" });
                      navigate("/play");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "订阅失败");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("market.subPlay")}
                </button>
                )}
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={async () => {
                    const score = Number(window.prompt(t("market.rate") + " 1-5", "5"));
                    if (!score) return;
                    const comment = window.prompt("短评（可空）", "") ?? "";
                    await fetch(`/__market/${item.id}/rate`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ score, comment }),
                    });
                    await reload();
                  }}
                >
                  {t("market.rate")}
                </button>
                {tab === "mine" && !item.official && (
                  <>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!item.projectId || busy}
                      onClick={async () => {
                        if (!item.projectId) return;
                        setBusy(true);
                        try {
                          await updateMarket(item.id, item.projectId, desc || item.desc);
                          await reload();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "更新失败");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {t("market.refresh")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(t("market.unlistAsk", { name: item.name }))) return;
                        setBusy(true);
                        try {
                          await unlistMarket(item.id);
                          await reload();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "下架失败");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {t("market.unlist")}
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );

  if (embedded) return <div className="market-embed">{body}</div>;

  return (
    <div className="home-root">
      <header className="topbar">
        <Brand />
        <div className="toolbar">
          <Link className="btn" to="/app">
            {t("nav.home")}
          </Link>
          <PrefsMenu />
        </div>
      </header>
      <div className="page">{body}</div>
    </div>
  );
}
