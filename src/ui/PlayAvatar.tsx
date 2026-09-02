export const AVATARS = [
  { id: "jester", name: "小丑" },
  { id: "spark", name: "电光" },
  { id: "fox", name: "狐狸" },
  { id: "orb", name: "光球" },
  { id: "blade", name: "刃" },
  { id: "bloom", name: "花" },
  { id: "ghost", name: "影" },
  { id: "ace", name: "A" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];

export function PlayAvatar({
  id = "jester",
  color = "#d6ff3c",
  size = 36,
  name,
}: {
  id?: string;
  color?: string;
  size?: number;
  name?: string;
}) {
  return (
    <div className={`play-avatar av-${id}`} style={{ width: size, height: size, color }} title={name}>
      <span className="play-avatar-body" />
      <span className="play-avatar-head" />
      <span className="play-avatar-hat" />
    </div>
  );
}

const KEY = "ceditor-play-avatar";

export function loadAvatarId(): AvatarId {
  try {
    const v = localStorage.getItem(KEY);
    if (AVATARS.some((a) => a.id === v)) return v as AvatarId;
  } catch {
    /* ignore */
  }
  return "jester";
}

export function saveAvatarId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
