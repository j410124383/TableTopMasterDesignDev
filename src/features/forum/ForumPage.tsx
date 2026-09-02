import { useEffect, useState } from "react";
import { usePlayProfileStore } from "@/store/playProfileStore";
import { useT } from "@/store/localeStore";

type Reply = { id: string; author: string; body: string; at: number };
type Thread = {
  id: string;
  title: string;
  author: string;
  body: string;
  at: number;
  replies: Reply[];
};

function when(at: number) {
  return new Date(at).toLocaleString();
}

export function ForumPage() {
  const t = useT();
  const name = usePlayProfileStore((s) => s.name);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [err, setErr] = useState("");

  async function refresh() {
    try {
      const res = await fetch("/__forum", { cache: "no-store" });
      if (!res.ok) throw new Error("forum down");
      const data = (await res.json()) as { threads?: Thread[] };
      setThreads(data.threads ?? []);
    } catch {
      setErr(t("forum.down"));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const current = threads.find((x) => x.id === open);

  async function postThread() {
    setErr("");
    const res = await fetch("/__forum", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, author: name }),
    });
    if (!res.ok) {
      setErr(t("forum.need"));
      return;
    }
    setTitle("");
    setBody("");
    await refresh();
  }

  async function postReply() {
    if (!current) return;
    const res = await fetch(`/__forum/${encodeURIComponent(current.id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: reply, author: name }),
    });
    if (!res.ok) return;
    setReply("");
    await refresh();
  }

  return (
    <div className="forum-layout">
      <aside className="card forum-compose">
        <strong>{t("forum.new")}</strong>
        <p className="muted">{t("forum.lead")}</p>
        <input value={title} placeholder={t("forum.titlePh")} onChange={(e) => setTitle(e.target.value)} />
        <textarea value={body} placeholder={t("forum.bodyPh")} onChange={(e) => setBody(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={() => void postThread()}>
          {t("forum.post")}
        </button>
        {err && <p className="muted">{err}</p>}
        <p className="muted">{t("forum.as", { name })}</p>
      </aside>
      <div className="forum-main">
        {threads.length === 0 && <p className="muted">{t("forum.empty")}</p>}
        {threads.map((th) => (
          <article key={th.id} className={`card forum-thread ${open === th.id ? "open" : ""}`}>
            <button type="button" className="forum-head" onClick={() => setOpen(open === th.id ? null : th.id)}>
              <strong>{th.title}</strong>
              <span className="muted">
                {th.author} · {when(th.at)} · {th.replies.length}
              </span>
            </button>
            {open === th.id && (
              <div className="forum-body">
                <p>{th.body}</p>
                {th.replies.map((r) => (
                  <div key={r.id} className="forum-reply">
                    <span className="muted">
                      {r.author} · {when(r.at)}
                    </span>
                    <p>{r.body}</p>
                  </div>
                ))}
                <div className="row">
                  <input
                    className="grow"
                    value={reply}
                    placeholder={t("forum.replyPh")}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <button type="button" className="btn btn-small btn-primary" onClick={() => void postReply()}>
                    {t("forum.reply")}
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
