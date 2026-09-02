import type { Project } from "@/model/types";
import { spawnProp } from "./playProps";
import { dealProject } from "./playTable";
import type { Piece, PlayProp } from "./playTypes";

const SGS_RULES = `三国杀 · 桌面规则

1. 分发身份：主公、忠臣、反贼、内奸。人数不足时按规则减身份。
2. 主公亮出身份并先选武将，其余暗选后同时亮出。
3. 回合顺序：准备 → 判定 → 摸牌（通常 2 张）→ 出牌 → 弃牌（手牌不超过体力）。
4. 【杀】每回合通常限一次。【闪】可抵消【杀】。【桃】可在自己或濒死时回血。
5. 体力降至 0 进入濒死，需【桃】或技能救回，否则死亡。
6. 反贼死亡，击杀者摸 3 张；忠臣死亡，主公弃掉所有手牌与装备。
7. 主公死亡：若内奸为最后存活则内奸胜，否则反贼胜。主公与忠臣存活且反贼内奸皆灭则忠方胜。`;

export function defaultPropsFor(project: Project): PlayProp[] {
  const key = `${project.meta.id} ${project.meta.name}`;
  if (/mtg|万智/i.test(key)) {
    return [
      spawnProp("life", 0, { x: 120, y: 780, value: 20, label: "林间守护", color: "#7cb342" }),
      spawnProp("life", 1, { x: 1460, y: 780, value: 20, label: "火花对策", color: "#e53935" }),
    ];
  }
  if (/sanguosha|三国/i.test(key)) {
    return [spawnProp("note", 0, { x: 1180, y: 70, text: SGS_RULES, label: "三国杀规则", scale: 1.45, fontSize: 12, fontFamily: "kai" })];
  }
  return [];
}

export function buildPlaySetup(project: Project): { pieces: Piece[]; props: PlayProp[]; anchors: Record<string, { x: number; y: number }> } {
  const dealt = dealProject(project);
  return { pieces: dealt.pieces, props: defaultPropsFor(project), anchors: dealt.anchors };
}

export function applyPlaySetup(project: Project): { pieces: Piece[]; props: PlayProp[]; anchors: Record<string, { x: number; y: number }> } {
  if (project.playSetup?.pieces?.length) {
    const pieces = structuredClone(project.playSetup.pieces) as Piece[];
    const props = structuredClone(project.playSetup.props ?? []) as PlayProp[];
    const anchors: Record<string, { x: number; y: number }> = {};
    for (const p of pieces) {
      if (p.pileId && !anchors[p.pileId]) anchors[p.pileId] = { x: p.x, y: p.y };
    }
    return { pieces, props, anchors };
  }
  return buildPlaySetup(project);
}

export function attachDefaultPlaySetup(project: Project): Project {
  const built = buildPlaySetup(project);
  project.playSetup = { pieces: built.pieces, props: built.props };
  return project;
}
