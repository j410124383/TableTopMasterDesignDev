export type NewsKind = "expo" | "contest" | "shop" | "award";

export type NewsEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  place: string;
  kind: NewsKind;
  blurb: string;
  href: string;
};

export type NewsStory = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  href: string;
  kind: NewsKind;
};

/** 公开日程，便于日历打点。日期以各官方页面 2026 年信息为准。 */
export const NEWS_EVENTS: NewsEvent[] = [
  {
    id: "wodc-reg",
    title: "第七届 WODC 报名截稿",
    start: "2026-05-31",
    place: "线上 · 游卡",
    kind: "contest",
    blurb: "世界原创桌游设计大赛（WODC）报名截止：2026-05-31 23:59（北京时间）。未商业化原创作品可投稿。",
    href: "https://wodc.yokagames.com/",
  },
  {
    id: "ukge",
    title: "UK Games Expo 2026",
    start: "2026-05-29",
    end: "2026-05-31",
    place: "英国伯明翰 NEC",
    kind: "expo",
    blurb: "英国最大桌面游戏展，20 周年。展览、试玩与赛事同场。",
    href: "https://www.ukgamesexpo.co.uk/",
  },
  {
    id: "origins",
    title: "Origins Game Fair 2026",
    start: "2026-06-17",
    end: "2026-06-21",
    place: "美国哥伦布",
    kind: "expo",
    blurb: "北美老牌桌游展，展厅 6 月 18–21 日对公众开放。",
    href: "https://www.originsgamefair.com/",
  },
  {
    id: "wodc-prelim",
    title: "WODC 初赛审核",
    start: "2026-06-01",
    end: "2026-07-31",
    place: "线上 · 游卡",
    kind: "contest",
    blurb: "第七届 WODC：6 月审核初赛，6–7 月公布初赛并进入复赛。",
    href: "https://wodc.yokagames.com/",
  },
  {
    id: "wodc-semi",
    title: "WODC 复赛截稿",
    start: "2026-09-01",
    place: "线上 · 游卡",
    kind: "contest",
    blurb: "第七届 WODC：7–8 月复赛，9 月复赛截稿，10 月公布复赛并进入决赛。",
    href: "https://wodc.yokagames.com/",
  },
  {
    id: "wodc-final",
    title: "WODC 决赛与颁奖窗口",
    start: "2026-10-01",
    end: "2026-12-31",
    place: "线上 / 线下交流 · 游卡",
    kind: "contest",
    blurb: "10 月公布复赛并进入决赛，11–12 月公布结果并颁奖。",
    href: "https://wodc.yokagames.com/",
  },
  {
    id: "sdj",
    title: "Spiel des Jahres 2026 揭晓",
    start: "2026-07-12",
    place: "德国",
    kind: "award",
    blurb: "年度游戏：Dito!（JinxO）；专家奖 Rebirth；儿童奖 Mooki Island。",
    href: "https://www.spiel-des-jahres.de/en/dito-is-spiel-des-jahres-2026/",
  },
  {
    id: "gencon",
    title: "Gen Con 2026",
    start: "2026-07-30",
    end: "2026-08-02",
    place: "美国印第安纳波利斯",
    kind: "expo",
    blurb: "北美规模最大的桌面游戏年会，展商、赛事与试玩集中在一周。",
    href: "https://www.gencon.com/",
  },
  {
    id: "dicecon",
    title: "北京 DICE CON 2026",
    start: "2026-08-21",
    end: "2026-08-23",
    place: "北京全国农业展览馆 11 号馆",
    kind: "expo",
    blurb: "第十届北京国际桌面游戏展，亚洲最大桌游商展之一，主题「见所未见」。",
    href: "https://www.thebeijinger.com/events/2026/aug/dice-con-2026-tenth-beijing-international-board-game-convention",
  },
  {
    id: "spiel",
    title: "SPIEL Essen 2026",
    start: "2026-10-22",
    end: "2026-10-25",
    place: "德国埃森 Messe Essen",
    kind: "expo",
    blurb: "全球最大桌游展。周四至周六 10:00–19:00，周日至 18:00。大量新作首发。",
    href: "https://www.spiel-essen.de/en/visit/tickets-opening-hours",
  },
];

export const NEWS_STORIES: NewsStory[] = [
  {
    id: "dice-story",
    kicker: "展会",
    title: "北京 DC：第十届 DICE CON 在农展馆收官",
    body: "2026 年 8 月 21–23 日，第十届北京国际桌面游戏展在全国农业展览馆 11 号馆举办，汇聚 Asmodee、Oink、新天鹅堡等 200 余家单位。现场可试玩、听 DICE TALK，也是国内玩家摸新作的主场之一。",
    href: "https://www.iyingdi.com/tz/post/5675970",
    kind: "expo",
  },
  {
    id: "wodc-story",
    kicker: "比赛",
    title: "世界原创桌游设计大赛 WODC 进行中",
    body: "由游卡承办的 WODC 面向全球未出版原创作品。2026 年第七届：3–5 月报名（5 月 31 日截稿），6 月初赛，9 月复赛截稿，10 月决赛，年底颁奖。适合想把原型送去专业评审的作者。",
    href: "https://wodc.yokagames.com/",
    kind: "contest",
  },
  {
    id: "sdj-story",
    kicker: "奖项",
    title: "2026 德国年度游戏：Dito!",
    body: "Spiel des Jahres 评委会 7 月 12 日公布：年度游戏为 Dito!（英美发行名 JinxO）；专家奖 Rebirth（Knizia）；儿童奖 Mooki Island。想看「大众能上手」的新作，可从这份名单倒查。",
    href: "https://www.spiel-des-jahres.de/en/dito-is-spiel-des-jahres-2026/",
    kind: "award",
  },
  {
    id: "core-shop",
    kicker: "店铺",
    title: "地核桌游：淘宝搜品牌，聚会作当家",
    body: "地核桌游做轻松聚会向，代表作包括《猩猩相惜》《猴猴玩啊》《以鹅传鹅》等。没有单独官网商城时，可在淘宝搜索「地核桌游」找授权现货与众筹版。本栏仅为资讯入口，不代销。",
    href: "https://s.taobao.com/search?q=%E5%9C%B0%E6%A0%B8%E6%A1%8C%E6%B8%B8",
    kind: "shop",
  },
  {
    id: "spiel-story",
    kicker: "展会",
    title: "埃森 SPIEL：十月全球新作窗口",
    body: "SPIEL Essen 2026 定于 10 月 22–25 日在埃森举行，是每年新作密度最高的展会。出版方预告可在 BoardGameGeek 的 SPIEL Essen 2026 Preview 列表里跟。",
    href: "https://www.spiel-essen.de/",
    kind: "expo",
  },
];

export const NEWS_ADS = [
  {
    id: "ad-dice",
    title: "北京 DICE CON",
    line: "亚洲最大桌游商展 · 农展馆",
    href: "https://www.thebeijinger.com/events/2026/aug/dice-con-2026-tenth-beijing-international-board-game-convention",
  },
  {
    id: "ad-wodc",
    title: "投稿 WODC",
    line: "世界原创设计赛 · 游卡承办",
    href: "https://wodc.yokagames.com/",
  },
  {
    id: "ad-core",
    title: "地核桌游淘宝",
    line: "猩猩相惜 / 猴猴玩啊",
    href: "https://s.taobao.com/search?q=%E5%9C%B0%E6%A0%B8%E6%A1%8C%E6%B8%B8",
  },
];

export function eventOnDay(iso: string, ev: NewsEvent) {
  const d = iso;
  const end = ev.end ?? ev.start;
  return d >= ev.start && d <= end;
}

export function isoDay(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
