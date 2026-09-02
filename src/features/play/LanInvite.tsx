import { useEffect, useState } from "react";
import { useT } from "@/store/localeStore";

type LanLink = { url: string; kind?: string; address?: string };
type LanInfo = { origins?: string[]; links?: LanLink[]; loopbackOnly?: boolean; address?: string };

function kindLabel(kind: string | undefined, t: (k: string) => string) {
  if (kind === "zerotier") return t("play.linkZt");
  if (kind === "pgy") return t("play.linkPgy");
  if (kind === "tailscale") return t("play.linkTs");
  if (kind === "wifi") return t("play.linkWifi");
  return t("play.linkLan");
}

export function LanInvite() {
  const t = useT();
  const [info, setInfo] = useState<LanInfo | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    void fetch("/__lan", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LanInfo | null) => setInfo(data))
      .catch(() => undefined);
  }, []);

  const links: LanLink[] =
    info?.links?.length
      ? info.links
      : (info?.origins ?? []).map((url) => ({ url, kind: "lan" }));
  const virtual = links.filter((l) => l.kind === "zerotier" || l.kind === "tailscale" || l.kind === "pgy");
  const local = links.filter((l) => l.kind !== "zerotier" && l.kind !== "tailscale" && l.kind !== "pgy");

  return (
    <article className="card join-mode-card lan">
      <span className="join-mode-tag">{t("play.lanMode")}</span>
      <h2>{t("play.lanAddrTitle")}</h2>
      {info?.loopbackOnly ? (
        <p className="muted">{t("play.lanLoopback")}</p>
      ) : (
        <p className="muted">{t("play.lanHint")}</p>
      )}
      {virtual.length > 0 && (
        <>
          <p className="muted" style={{ marginBottom: 0 }}>
            {t("play.ztAddrHint")}
          </p>
          {virtual.map((l) => (
            <div key={l.url} className="row">
              <code className="grow">
                {kindLabel(l.kind, t)} · {l.url}/
              </code>
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={() => void navigator.clipboard.writeText(`${l.url}/`).then(() => setCopied(l.url))}
              >
                {copied === l.url ? t("play.copiedLan") : t("play.copyLink")}
              </button>
            </div>
          ))}
        </>
      )}
      {local.map((l) => (
        <div key={l.url} className="row">
          <code className="grow">
            {kindLabel(l.kind, t)} · {l.url}/
          </code>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void navigator.clipboard.writeText(`${l.url}/`).then(() => setCopied(l.url))}
          >
            {copied === l.url ? t("play.copiedLan") : t("play.copyLink")}
          </button>
        </div>
      ))}
      {links.length === 0 && <p className="muted">{t("play.lanNone")}</p>}
    </article>
  );
}
