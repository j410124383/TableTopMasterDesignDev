import { useEffect, useState } from "react";
import { useT } from "@/store/localeStore";
import { fetchRooms, joinRoomGate, type PublicRoom } from "./roomsApi";

export function RoomList({ onJoin }: { onJoin: (code: string, password?: string) => void }) {
  const t = useT();
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => {
      void fetchRooms().then((list) => {
        if (live) setRooms(list);
      });
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!rooms.length) {
    return <p className="muted">{t("play.noRooms")}</p>;
  }

  return (
    <div className="room-list">
      {rooms.map((r) => (
        <div key={r.id} className="room-row">
          <div>
            <strong>{r.id}</strong>
            <div className="muted">
              {r.hostName ? t("play.hostOf", { name: r.hostName }) : r.name}
              {r.hostName && r.name ? ` · ${r.name}` : ""}
              {r.version ? ` · v${r.version}` : ""}
              {" · "}
              {t("play.people", { n: r.players })}
              {r.maxPlayers ? `/${r.maxPlayers}` : ""}
              {r.locked ? ` · ${t("play.hasPw")}` : ""}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={async () => {
              let pw = "";
              if (r.locked) {
                pw = window.prompt(t("play.roomPw")) ?? "";
              }
              const gate = await joinRoomGate(r.id, pw);
              if (gate === "pw") {
                window.alert(t("play.badPw"));
                return;
              }
              if (gate === "full") {
                window.alert(t("play.full"));
                return;
              }
              if (gate === "offline") {
                window.alert(t("play.fail.studio.h"));
                return;
              }
              if (gate === "gone") {
                window.alert(t("play.gone"));
                return;
              }
              onJoin(r.id, pw);
            }}
          >
            {t("play.joinBtn")}
          </button>
        </div>
      ))}
    </div>
  );
}
