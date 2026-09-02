import { useEffect, useRef, useState } from "react";
import { useT } from "@/store/localeStore";
import { IconChat, IconChevLeft, IconChevRight } from "@/ui/Icons";
import type { PlayPlayer } from "./playTypes";

export type ChatMsg = {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
};

export function PlayChat({
  meId,
  players,
  messages,
  onSend,
}: {
  meId: string;
  players: PlayPlayer[];
  messages: ChatMsg[];
  onSend: (text: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(messages.length);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setSeen(messages.length);
  }, [open, messages.length]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, open]);

  const unread = open ? 0 : Math.max(0, messages.length - seen);

  function submit() {
    const next = text.trim();
    if (!next) return;
    onSend(next);
    setText("");
  }

  return (
    <aside className={`play-chat ${open ? "open" : "collapsed"}`}>
      <button
        type="button"
        className="play-chat-toggle"
        title={open ? t("play.chatFold") : t("play.chat")}
        onClick={() => setOpen((v) => !v)}
      >
        <IconChat size={16} />
        {open ? <span>{t("play.chat")}</span> : null}
        {unread > 0 && <span className="play-chat-badge">{unread > 99 ? "99+" : unread}</span>}
        {open ? <IconChevRight size={14} /> : <IconChevLeft size={14} />}
      </button>
      {open && (
        <>
          <div className="play-chat-list">
            {messages.length === 0 && <p className="muted">{t("play.chatEmpty")}</p>}
            {messages.map((m) => {
              const system = m.from === "system";
              const pl = players.find((p) => p.id === m.from);
              return (
                <div key={m.id} className={`play-chat-msg ${system ? "system" : m.from === meId ? "mine" : ""}`}>
                  <span className="play-chat-name" style={system ? undefined : { color: pl?.color }}>
                    {m.name}
                  </span>
                  <span>{m.text}</span>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <form
            className="play-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={text}
              placeholder={t("play.say")}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="btn btn-small btn-primary">
              {t("play.send")}
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
