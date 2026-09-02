import { createEmptyProject } from "@/model/defaults";
import { STARTER_TEMPLATES } from "@/model/starters";

const OFFICIAL = [
  { starter: "poker" as const, desc: "54 张标准扑克，适合先试玩再拆开学蓝图。" },
  { starter: "sanguosha" as const, desc: "标准包牌面案例，可订阅后试玩。" },
];

export async function ensureOfficialMarket() {
  const res = await fetch("/__market");
  if (!res.ok) return;
  const data = (await res.json()) as { items?: { official?: boolean; name?: string }[] };
  const have = new Set((data.items ?? []).filter((i) => i.official).map((i) => i.name));
  for (const row of OFFICIAL) {
    const info = STARTER_TEMPLATES.find((s) => s.id === row.starter);
    if (!info || have.has(info.name)) continue;
    const project = createEmptyProject({
      name: info.name,
      note: `官方案例 · ${info.desc}`,
      size: info.size,
      starter: info.id,
    });
    project.meta.id = `official_${info.id}`;
    await fetch("/__market", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        item: {
          id: `mkt_official_${info.id}`,
          name: info.name,
          author: "TMD",
          kind: "官方案例",
          desc: row.desc,
          official: true,
          ownerId: "official",
        },
        project,
      }),
    });
  }
}
