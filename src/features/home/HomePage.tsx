import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { APP_ZIP, zipDownloadReady } from "@/lib/appZip";
import { APP_VERSION, versionStamp } from "@/lib/appVersion";
import { coverSrcOf } from "@/lib/cover";
import { formatTime } from "@/lib/id";
import type { AppIndexEntry, Project } from "@/model/types";
import {
  canPickDirectory,
  displayPathOf,
  exportProjectById,
  exportProjectZipById,
  diskExists,
  loadCachedProject,
  looksLikeFullPath,
  openProjectById,
  PATH_LOST,
  readFileAsText,
  resolveOwnedPath,
  revealInExplorer,
} from "@/persist/storage";
import { OnboardingDock } from "@/features/onboarding/OnboardingDock";
import { useAppStore } from "@/store/appStore";
import { useHomeViewStore } from "@/store/homeViewStore";
import { useT } from "@/store/localeStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { Brand, SiteTags } from "@/ui/Brand";
import { IconCreate, IconDice, IconFolder, IconHome, IconNews, IconPlus, IconStore, IconChat } from "@/ui/Icons";
import { PrefsMenu } from "@/ui/PrefsMenu";
import { MarketPage } from "@/features/market/MarketPage";
import { ForumPage } from "@/features/forum/ForumPage";
import { NewsPage } from "@/features/news/NewsPage";
import { RoomList } from "@/features/play/RoomList";
import { LanInvite } from "@/features/play/LanInvite";
import { WanInvite } from "@/features/play/WanInvite";
import { ZtInvite } from "@/features/play/ZtInvite";
import { ContextMenu } from "@/ui/ContextMenu";
import { CreateProjectDialog, type PickedFolder } from "./CreateProjectDialog";
import { EditProjectDialog } from "./EditProjectDialog";

export function HomePage() {
  const navigate = useNavigate();
  const {
    index,
    error,
    info,
    setError,
    setInfo,
    create,
    open,
    openFile,
    openFolder,
    updateMeta,
    forget,
    relinkById,
    unsubscribeMarket,
  } = useAppStore();
  const completeGuide = useOnboardingStore((s) => s.complete);
  const t = useT();
  const [appZip, setAppZip] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFolder, setCreateFolder] = useState<PickedFolder | null>(null);
  const [cloning, setCloning] = useState<{ name: string; project: Project; sourcePath?: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: AppIndexEntry } | null>(null);
  const [folderGone, setFolderGone] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<AppIndexEntry | null>(null);
  const [editCover, setEditCover] = useState<string>();
  const [query, setQuery] = useState("");
  const [failedId, setFailedId] = useState<string | null>(null);
  const mode = useHomeViewStore((s) => s.mode);
  const setMode = useHomeViewStore((s) => s.setMode);
  const playTab = useHomeViewStore((s) => s.playTab);
  const setPlayTab = useHomeViewStore((s) => s.setPlayTab);
  const shelf = useHomeViewStore((s) => s.shelf);
  const setShelf = useHomeViewStore((s) => s.setShelf);
  const [marketPick, setMarketPick] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void zipDownloadReady().then(setAppZip);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.projects.filter((p) => {
      const origin = p.origin ?? "owned";
      if (mode === "create") {
        if (shelf === "board" && origin !== "owned") return false;
        if (shelf === "subscribed" && origin !== "subscribed") return false;
        if (shelf === "examples" && origin !== "example") return false;
      }
      if (mode === "play") {
        if (playTab !== "host") return false;
        if (shelf === "board" && origin !== "owned") return false;
        if (shelf === "subscribed" && origin !== "subscribed") return false;
        if (shelf === "examples" && origin !== "example") return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.note ?? "").toLowerCase().includes(q) ||
        displayPathOf(p).toLowerCase().includes(q)
      );
    });
  }, [index.projects, query, mode, shelf, playTab]);

  const boardIds = index.projects.filter((p) => !p.origin || p.origin === "owned").map((p) => p.id);
  useEffect(() => {
    let alive = true;
    const owned = index.projects.filter((p) => !p.origin || p.origin === "owned");
    void Promise.all(
      owned.map(async (entry) => {
        const path = resolveOwnedPath(entry, index.projects);
        if (!looksLikeFullPath(path)) return [entry.id, false] as const;
        const exists = await diskExists(path);
        return [entry.id, exists === false] as const;
      }),
    ).then((rows) => {
      if (!alive) return;
      setFolderGone(Object.fromEntries(rows));
    });
    return () => {
      alive = false;
    };
  }, [boardIds.join("|")]);

  const boardCount = index.projects.filter((p) => !p.origin || p.origin === "owned").length;
  const subCount = index.projects.filter((p) => p.origin === "subscribed").length;
  const exCount = index.projects.filter((p) => p.origin === "example").length;

  async function pickProject() {
    try {
      const opened = await openFolder();
      if (opened) {
        navigate("/project/template");
        return;
      }
      if (canPickDirectory()) return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : t("err.open"));
      return;
    }
    fileRef.current?.click();
  }

  async function openProject(id: string) {
    const entry = index.projects.find((p) => p.id === id);
    if (entry && (!entry.origin || entry.origin === "owned") && !looksLikeFullPath(resolveOwnedPath(entry, index.projects))) {
      setFailedId(id);
      setError(PATH_LOST);
      return;
    }
    try {
      await open(id);
      setFailedId(null);
      const opened = useAppStore.getState().index.projects.find((p) => p.id === id);
      if (opened?.origin === "example" || id.startsWith("ex_")) completeGuide("open-example");
      navigate("/project/template");
    } catch (err) {
      setFailedId(id);
      setError(err instanceof Error ? err.message : t("err.open"));
    }
  }

  async function playProject(id: string) {
    const entry = index.projects.find((p) => p.id === id);
    if (entry && (!entry.origin || entry.origin === "owned") && !looksLikeFullPath(resolveOwnedPath(entry, index.projects))) {
      setFailedId(id);
      setError(PATH_LOST);
      return;
    }
    try {
      await open(id);
      setFailedId(null);
      completeGuide("try-play");
      setMode("play");
      setPlayTab("host");
      navigate("/play");
    } catch (err) {
      setFailedId(id);
      setError(err instanceof Error ? err.message : t("err.open"));
    }
  }

  async function unsubscribe(entry: AppIndexEntry) {
    if (!window.confirm(t("card.unsubAsk", { name: entry.name }))) return;
    try {
      const marketId = entry.marketId || entry.id.replace(/^sub_/, "");
      await unsubscribeMarket(marketId);
      setInfo(t("card.unsubOk", { name: entry.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("card.unsubFail"));
    }
  }

  async function relinkEntry(id: string) {
    try {
      await relinkById(id);
      setFailedId(null);
      setError(null);
      navigate("/project/template");
    } catch (err) {
      setFailedId(id);
      setError(err instanceof Error ? err.message : t("err.bind"));
    }
  }

  async function startClone(entry: AppIndexEntry) {
    try {
      const project =
        (await loadCachedProject(entry.id)) ?? (await openProjectById(entry.id)).project;
      const sourcePath = resolveOwnedPath(entry, index.projects);
      setCloning({
        name: entry.name,
        project,
        sourcePath: looksLikeFullPath(sourcePath) ? sourcePath : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("err.cloneSrc"));
    }
  }

  async function revealFolder(entry: AppIndexEntry) {
    let path = resolveOwnedPath(entry, index.projects);
    if (!looksLikeFullPath(path)) {
      const typed = window.prompt(t("card.folderAsk"), path || `F:\\${entry.name}`);
      if (!typed?.trim()) {
        setError(t("card.pathMissing"));
        return;
      }
      path = typed.trim();
      try {
        await updateMeta(entry.id, { localPath: path });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("card.pathMissing"));
        return;
      }
    }
    const opened = await revealInExplorer(path);
    if (opened) {
      if (path !== displayPathOf(entry)) {
        try {
          await updateMeta(entry.id, { localPath: path });
        } catch {
          /* ignore */
        }
      }
      setInfo(t("card.openedFolder", { path }));
      return;
    }
    setError(t("card.folderFail", { path }));
  }

  return (
    <div className="home-root">
      <header className="topbar">
        <Brand />
        <div className="home-mode">
          <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")} title={t("nav.create")}>
            <span className="tab-ico"><IconCreate size={16} /></span>
            <span className="tab-lbl">{t("nav.create")}</span>
          </button>
          <button type="button" className={mode === "play" ? "active" : ""} onClick={() => setMode("play")} title={t("nav.play")}>
            <span className="tab-ico"><IconDice size={16} /></span>
            <span className="tab-lbl">{t("nav.play")}</span>
          </button>
          <button
            type="button"
            className={mode === "market" ? "active" : ""}
            title={t("nav.market")}
            onClick={() => {
              setMode("market");
              completeGuide("visit-market");
            }}
          >
            <span className="tab-ico"><IconStore size={16} /></span>
            <span className="tab-lbl">{t("nav.market")}</span>
          </button>
          <button type="button" className={mode === "news" ? "active" : ""} onClick={() => setMode("news")} title={t("nav.news")}>
            <span className="tab-ico"><IconNews size={16} /></span>
            <span className="tab-lbl">{t("nav.news")}</span>
          </button>
          <button type="button" className={mode === "forum" ? "active" : ""} onClick={() => setMode("forum")} title={t("nav.forum")}>
            <span className="tab-ico"><IconChat size={16} /></span>
            <span className="tab-lbl">{t("nav.forum")}</span>
          </button>
        </div>
        <div className="toolbar">
          <Link className="icon-btn" to="/" title={t("nav.intro")} aria-label={t("nav.intro")}>
            <IconHome size={16} />
          </Link>
          {mode === "create" && (
            <>
              <button className="icon-btn" title={t("nav.open")} aria-label={t("nav.open")} onClick={() => void pickProject()}>
                <IconFolder size={16} />
              </button>
              <button className="icon-btn active" title={t("nav.new")} aria-label={t("nav.new")} onClick={() => setCreating(true)}>
                <IconPlus size={16} />
              </button>
            </>
          )}
          <PrefsMenu />
        </div>
      </header>
      {info && (
        <div className="banner banner-ok" style={{ marginTop: 16 }}>
          <span>{info}</span>
          <button type="button" className="banner-x" aria-label={t("err.dismiss")} onClick={() => setInfo(null)}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="banner" style={{ marginTop: 16 }}>
          <span>{error}</span>
          {failedId && (
            <button
              className="btn btn-small"
              onClick={async () => {
                try {
                  await relinkById(failedId);
                  setFailedId(null);
                  setError(null);
                  navigate("/project/template");
                } catch (err) {
                  setError(err instanceof Error ? err.message : t("err.bind"));
                }
              }}
            >
              {t("err.reselect")}
            </button>
          )}
          <button type="button" className="banner-x" aria-label={t("err.dismiss")} onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      <div className="page">
        <div className="page-head">
          <div>
            <h1>
              {mode === "play"
                ? t("play.title")
                : mode === "market"
                  ? t("market.title")
                  : mode === "news"
                    ? t("news.title")
                    : mode === "forum"
                      ? t("forum.title")
                      : t("create.title")}
            </h1>
            <p className="muted">
              {mode === "play"
                ? t("play.lead")
                : mode === "market"
                  ? t("market.lead")
                  : mode === "news"
                    ? t("news.lead")
                    : mode === "forum"
                      ? t("forum.lead")
                      : t("create.lead")}
            </p>
          </div>
          {index.projects.length > 0 && mode !== "market" && mode !== "news" && mode !== "forum" && (
            <input
              className="search-input"
              placeholder={t("search.ph")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </div>
        {mode === "create" && (
          <div className="home-shelf">
            <button type="button" className={shelf === "board" ? "active" : ""} onClick={() => setShelf("board")}>
              {t("shelf.board", { n: boardCount })}
            </button>
            <button type="button" className={shelf === "subscribed" ? "active" : ""} onClick={() => setShelf("subscribed")}>
              {t("shelf.sub", { n: subCount })}
            </button>
            <button type="button" className={shelf === "examples" ? "active" : ""} onClick={() => setShelf("examples")}>
              {t("shelf.ex", { n: exCount })}
            </button>
          </div>
        )}
        {mode === "play" && (
          <div className="home-shelf">
            <button type="button" className={shelf === "board" ? "active" : ""} onClick={() => setShelf("board")}>
              {t("shelf.board", { n: boardCount })}
            </button>
            <button type="button" className={shelf === "subscribed" ? "active" : ""} onClick={() => setShelf("subscribed")}>
              {t("shelf.sub", { n: subCount })}
            </button>
            <button type="button" className={shelf === "examples" ? "active" : ""} onClick={() => setShelf("examples")}>
              {t("shelf.ex", { n: exCount })}
            </button>
          </div>
        )}
        <div key={`${mode}-${playTab}-${shelf}`} className="tab-pane">
        {mode === "market" && <MarketPage embedded pickId={marketPick} />}
        {mode === "news" && <NewsPage />}
        {mode === "forum" && <ForumPage />}
        {mode === "play" && (
          <div className="play-home-split">
            <section className="play-home-col">
              <div className="play-home-col-head">
                <h2>{t("play.tabHost")}</h2>
                <p className="muted">{t("play.lobbyHostLead")}</p>
              </div>
              {filtered.length === 0 ? (
                <div className="empty">
                  <p>{t("empty.play")}</p>
                </div>
              ) : (
                <div className="grid play-home-projects">
                  {filtered.map((entry, i) => {
                    const cover = coverSrcOf(entry);
                    return (
                      <article
                        key={entry.id}
                        className="card project-card"
                        style={{ ["--i" as string]: i }}
                        onClick={() => playProject(entry.id)}
                      >
                        <div className="cover">
                          {cover ? <img src={cover} alt="" /> : entry.name.slice(0, 1)}
                        </div>
                        <div className="card-body">
                          <h3>{entry.name}</h3>
                          <p className="muted">{formatTime(entry.lastOpenedAt)}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="play-home-col">
              <div className="play-home-col-head">
                <h2>{t("play.tabJoin")}</h2>
                <p className="muted">{t("play.lobbyJoinLead")}</p>
              </div>
              <div className="card join-mode-card lan">
                <span className="join-mode-tag">{t("play.lanMode")}</span>
                <strong>{t("play.joinLanTitle")}</strong>
                <p className="muted" style={{ margin: 0 }}>
                  {t("play.joinLanHint")}
                </p>
                <RoomList
                  onJoin={(code, password) => {
                    setPlayTab("join");
                    setMode("play");
                    setJoinCode(code);
                    navigate(`/play?join=${encodeURIComponent(code)}`, { state: { password } });
                  }}
                />
              </div>
              <div className="card join-mode-card wan">
                <span className="join-mode-tag">{t("play.wanMode")}</span>
                <strong>{t("play.joinWanTitle")}</strong>
                <p className="muted" style={{ margin: 0 }}>
                  {t("play.joinWanHint")}
                </p>
                <div className="row">
                  <input
                    className="grow"
                    placeholder={t("play.joinPh")}
                    value={joinCode}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      const code = joinCode.trim().toUpperCase();
                      if (code.length < 3) {
                        setError(t("play.needCode"));
                        return;
                      }
                      setError(null);
                      setPlayTab("join");
                      setMode("play");
                      navigate(`/play?join=${encodeURIComponent(code)}`);
                    }}
                  >
                    {t("play.joinBtn")}
                  </button>
                </div>
              </div>
            </section>
            <section className="play-home-col play-home-guide">
              <div className="play-home-col-head">
                <h2>联机说明</h2>
                <p className="muted join-ver">{t("play.sameVer", { stamp: versionStamp() })}</p>
              </div>
              <LanInvite />
              <WanInvite />
              <ZtInvite />
            </section>
          </div>
        )}
        {mode !== "market" && mode !== "news" && mode !== "forum" && mode !== "play" && (filtered.length === 0 ? (
          <div className="empty">
            <p>
              {query
                ? t("empty.search", { q: query })
                : shelf === "board"
                  ? t("empty.board")
                  : shelf === "subscribed"
                    ? t("empty.sub")
                    : t("empty.ex")}
            </p>
            {mode === "create" && shelf === "board" && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                {t("nav.new")}
              </button>
            )}
            {mode === "create" && shelf === "board" && (
              <button className="btn" onClick={() => setShelf("examples")}>
                {t("empty.goEx")}
              </button>
            )}
          </div>
        ) : (
          <div className="grid">
            {filtered.map((entry, i) => {
              const cover = coverSrcOf(entry);
              return (
                <article
                  key={entry.id}
                  className="card project-card"
                  style={{ ["--i" as string]: i }}
                  onClick={() => openProject(entry.id)}
                  onContextMenu={(e) => {
                    if (mode !== "create") return;
                    if (entry.origin === "example") return;
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                >
                  <div className="cover">
                    {cover ? <img src={cover} alt="" /> : entry.name.slice(0, 1)}
                  </div>
                  <div className="card-body">
                    <h3>
                      {entry.name}
                      {entry.origin === "subscribed" && <span className="origin-badge">{t("origin.sub")}</span>}
                      {entry.origin === "example" && <span className="origin-badge example">{t("origin.ex")}</span>}
                      {(!entry.origin || entry.origin === "owned") &&
                        !looksLikeFullPath(resolveOwnedPath(entry, index.projects)) && (
                        <span className="origin-badge unbound">{t("card.pathLost")}</span>
                      )}
                      {(!entry.origin || entry.origin === "owned") &&
                        looksLikeFullPath(resolveOwnedPath(entry, index.projects)) &&
                        folderGone[entry.id] && (
                        <span className="origin-badge unbound">{t("card.folderGone")}</span>
                      )}
                    </h3>
                    <div
                      className={`card-path ${
                        (!entry.origin || entry.origin === "owned") && !looksLikeFullPath(resolveOwnedPath(entry, index.projects))
                          ? "is-virtual"
                          : ""
                      }`}
                    >
                      {(!entry.origin || entry.origin === "owned") &&
                      !looksLikeFullPath(resolveOwnedPath(entry, index.projects))
                        ? t("card.pathLost")
                        : resolveOwnedPath(entry, index.projects) || t("card.pathMissing")}
                    </div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                      {t("card.lastOpen", { time: formatTime(entry.lastOpenedAt) })}
                    </div>
                    {entry.note && (
                      <div className="muted" style={{ marginTop: 6 }}>
                        {entry.note}
                      </div>
                    )}
                    <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                      {entry.origin === "example" || entry.origin === "subscribed" ? (
                        <>
                          <button className="btn btn-small btn-primary" onClick={() => void openProject(entry.id)}>
                            {t("card.open")}
                          </button>
                          <button className="btn btn-small" onClick={() => void playProject(entry.id)}>
                            {t("card.play")}
                          </button>
                          <button className="btn btn-small" onClick={() => void startClone(entry)}>
                            {t("card.clone")}
                          </button>
                          {entry.origin === "subscribed" && (
                            <button className="btn btn-small" onClick={() => void unsubscribe(entry)}>
                              {t("card.unsub")}
                            </button>
                          )}
                        </>
                      ) : !looksLikeFullPath(resolveOwnedPath(entry, index.projects)) ? (
                        <>
                          <button className="btn btn-small btn-primary" onClick={() => void relinkEntry(entry.id)}>
                            {t("err.reselect")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-small btn-primary" onClick={() => void openProject(entry.id)}>
                            {t("card.open")}
                          </button>
                          <button className="btn btn-small" onClick={() => void playProject(entry.id)}>
                            {t("card.play")}
                          </button>
                          <button className="btn btn-small" onClick={() => void revealFolder(entry)}>
                            {t("card.folder")}
                          </button>
                          <button
                            className="btn btn-small card-more"
                            type="button"
                            aria-label={t("card.more")}
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              setMenu({ x: r.left, y: r.bottom + 4, entry });
                            }}
                          >
                            ⋯
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
        </div>
      </div>
      <OnboardingDock />
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const text = await readFileAsText(file);
            await openFile(text, file.name);
            navigate("/project/template");
          } catch (err) {
            setError(err instanceof Error ? err.message : t("err.open"));
          }
        }}
      />
      {creating && (
        <CreateProjectDialog
          initialFolder={createFolder}
          onFolderPicked={setCreateFolder}
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            await create(input);
            setCreateFolder(null);
            setShelf("board");
            navigate("/project/template");
          }}
        />
      )}
      {cloning && (
        <CreateProjectDialog
          cloneSource={cloning}
          onClose={() => setCloning(null)}
          onCreate={async (input) => {
            await create({ ...input, fromProject: cloning.project, sourcePath: cloning.sourcePath ?? input.sourcePath });
            setCloning(null);
            setShelf("board");
            navigate("/project/template");
          }}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.entry.origin === "subscribed"
              ? [
                  { label: t("card.open"), onClick: () => void openProject(menu.entry.id) },
                  { label: t("card.clone"), onClick: () => void startClone(menu.entry) },
                  {
                    label: t("card.unsub"),
                    danger: true,
                    onClick: () => void unsubscribe(menu.entry),
                  },
                ]
              : [
            {
              label: t("card.folder"),
              onClick: () => void revealFolder(menu.entry),
            },
            {
              label: t("card.edit"),
              onClick: () => {
                void (async () => {
                  try {
                    const p = await loadCachedProject(menu.entry.id);
                    setEditCover(p ? coverSrcOf(menu.entry) ?? undefined : undefined);
                  } catch {
                    setEditCover(undefined);
                  }
                  setEditing(menu.entry);
                })();
              },
            },
            {
              label: t("card.upload"),
              onClick: () => {
                setMarketPick(menu.entry.id);
                setMode("market");
                completeGuide("visit-market");
              },
            },
            {
              label: t("card.copy"),
              onClick: () => void startClone(menu.entry),
            },
            {
              label: t("card.export"),
              onClick: () =>
                exportProjectById(menu.entry.id).catch((e: Error) => setError(e.message)),
            },
            {
              label: t("card.exportZip"),
              onClick: () =>
                exportProjectZipById(menu.entry.id).catch((e: Error) => setError(e.message)),
            },
            {
              label: t("card.remove"),
              danger: true,
              onClick: () => void forget(menu.entry.id),
            },
          ]
          }
        />
      )}
      <details className="share-mini">
        <summary>{t("share.title")}</summary>
        {appZip ? (
          <a href={APP_ZIP} download>
            {t("share.app", { v: `v${APP_VERSION}` })}
          </a>
        ) : (
          <span className="muted">{t("share.appMissing")}</span>
        )}
        <span className="muted"> · {t("share.how")}</span>
      </details>
      <SiteTags />
      {editing && (
        <EditProjectDialog
          entry={editing}
          coverSrc={editCover}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await updateMeta(editing.id, patch);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
