import { useEffect, useRef, useState } from "react";
import { IconBtn } from "@/ui/IconBtn";
import { IconGear } from "@/ui/Icons";
import { LocaleSwitch } from "@/ui/LocaleSwitch";
import { ThemeSwitch } from "@/ui/ThemeSwitch";
import { ProfileMenu } from "@/ui/ProfileMenu";
import { useT } from "@/store/localeStore";

export function PrefsMenu() {
  const t = useT();
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
    <>
      <ProfileMenu />
      <div className="play-look-wrap prefs-menu" ref={wrapRef}>
        <IconBtn title={t("theme.label")} active={open} onClick={() => setOpen((v) => !v)}>
          <IconGear />
        </IconBtn>
        {open && (
          <div className="play-look-panel card prefs-panel">
            <ThemeSwitch />
            <LocaleSwitch />
          </div>
        )}
      </div>
    </>
  );
}
