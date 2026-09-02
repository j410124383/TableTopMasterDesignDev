import { PLAYER_COLORS } from "@/features/play/playTypes";
import { GENDERS, PLAYER_KINDS, usePlayProfileStore } from "@/store/playProfileStore";
import { useT } from "@/store/localeStore";
import { AVATARS, PlayAvatar } from "./PlayAvatar";

export function PlayProfileCard({ compact = false }: { compact?: boolean }) {
  const profile = usePlayProfileStore();
  const t = useT();
  const preview = PLAYER_COLORS[0];
  return (
    <div className={`play-profile-card ${compact ? "compact" : ""}`}>
      <div className="play-profile-head">
        <PlayAvatar id={profile.avatar} color={preview} size={compact ? 36 : 48} name={profile.name} />
        <div>
          <strong>{profile.name || t("profile.unnamed")}</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {t(`gender.${profile.gender}`)} · {t(`kind.${profile.kind}`)}
          </div>
        </div>
      </div>
      <div className="field">
        <label>{t("profile.name")}</label>
        <input value={profile.name} onChange={(e) => profile.setProfile({ name: e.target.value })} maxLength={16} />
      </div>
      <div className="field">
        <label>{t("profile.avatar")}</label>
        <div className="avatar-pick">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={profile.avatar === a.id ? "active" : ""}
              title={t(`avatar.${a.id}`)}
              onClick={() => profile.setProfile({ avatar: a.id })}
            >
              <PlayAvatar id={a.id} color={preview} size={32} name={t(`avatar.${a.id}`)} />
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <div className="field grow">
          <label>{t("profile.gender")}</label>
          <select value={profile.gender} onChange={(e) => profile.setProfile({ gender: e.target.value as typeof profile.gender })}>
            {GENDERS.map((g) => (
              <option key={g.id} value={g.id}>
                {t(`gender.${g.id}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>{t("profile.kind")}</label>
          <select value={profile.kind} onChange={(e) => profile.setProfile({ kind: e.target.value as typeof profile.kind })}>
            {PLAYER_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {t(`kind.${k.id}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
        {t("profile.seatHint")}
      </p>
    </div>
  );
}
