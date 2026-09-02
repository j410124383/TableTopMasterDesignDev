import { useEffect, useRef, useState } from "react";
import { PlayProfileCard } from "@/ui/PlayProfileCard";
import { PlayAvatar } from "@/ui/PlayAvatar";
import { usePlayProfileStore } from "@/store/playProfileStore";
import { useT } from "@/store/localeStore";

export function ProfileMenu() {
  const t = useT();
  const profile = usePlayProfileStore();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="play-look-wrap prefs-menu" ref={wrapRef}>
      <button
        type="button"
        className={`icon-btn profile-menu-btn ${open ? "active" : ""}`}
        title={t("play.editProfile")}
        aria-label={t("play.editProfile")}
        onClick={() => setOpen((v) => !v)}
      >
        <PlayAvatar id={profile.avatar} color={profile.color || "#d6ff3c"} size={22} name={profile.name} />
      </button>
      {open && (
        <div className="play-look-panel card prefs-panel look-profile">
          <PlayProfileCard compact />
        </div>
      )}
    </div>
  );
}
