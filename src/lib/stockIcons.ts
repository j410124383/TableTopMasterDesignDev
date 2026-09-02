export type StockIcon = {
  id: string;
  name: string;
  src: string;
};

function svg(body: string, viewBox = "0 0 24 24"): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="#ffffff">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export const STOCK_ICONS: StockIcon[] = [
  { id: "star", name: "星星", src: svg('<path d="M12 2.4 14.7 8l6.3.7-4.7 4.3 1.3 6.2L12 16.6 6.4 19.2 7.7 13 3 8.7 9.3 8z"/>') },
  { id: "heart", name: "红心", src: svg('<path d="M12 20.4S3.2 14.2 3.2 8.8A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.8 2.4c0 5.4-8.8 11.6-8.8 11.6z"/>') },
  { id: "diamond", name: "方块", src: svg('<path d="m12 2.5 8 9.5-8 9.5-8-9.5z"/>') },
  { id: "club", name: "梅花", src: svg('<path d="M12 4a3.4 3.4 0 0 1 1.4 6.5A3.5 3.5 0 1 1 9.2 14H11l-1.6 5.2h5.2L13 14h1.8a3.5 3.5 0 1 1-4.2-3.5A3.4 3.4 0 0 1 12 4z"/>') },
  { id: "spade", name: "黑桃", src: svg('<path d="M12 3 4.8 12.2A4.4 4.4 0 0 0 11 16.4L9.6 21h4.8L13 16.4a4.4 4.4 0 0 0 6.2-4.2z"/>') },
  { id: "sword", name: "剑", src: svg('<path d="M20.4 3.6 13 11l-1.4-1.4 7.4-7.4z"/><path d="M12.2 10.2 8 18l-3.2.8.8-3.2 7.8-5.4z"/><path d="M7 14.5 9.5 17"/>') },
  { id: "shield", name: "盾", src: svg('<path d="M12 2.8 20 6v6.2c0 4.6-3.2 7.6-8 9-4.8-1.4-8-4.4-8-9V6z"/>') },
  { id: "bolt", name: "闪电", src: svg('<path d="M13 2 5.5 13h5.2L9.4 22 18.6 10h-5.4z"/>') },
  { id: "fire", name: "火焰", src: svg('<path d="M12 2.4s2.2 3.4 2.2 6.2c0 1.4-.6 2.6-1.4 3.4 2.8-.2 5.2-2.2 5.2-5.4 2.4 2.4 3.2 5 3.2 7.4 0 4.6-3.8 8-9.2 8s-9.2-3.4-9.2-8c0-4.2 3.4-7.4 9.2-11.6z"/>') },
  { id: "leaf", name: "叶子", src: svg('<path d="M20 4s-8-.8-12.4 3.6S4 18 4 18s6.2.4 10.8-4S20 4 20 4z"/><path d="M8 16c3-3 6.5-6.8 10.4-10.4" fill="none" stroke="#ffffff" stroke-width="1.6"/>') },
  { id: "sun", name: "太阳", src: svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>') },
  { id: "moon", name: "月亮", src: svg('<path d="M16.4 3.6A8.6 8.6 0 1 0 20.4 14 7 7 0 0 1 16.4 3.6z"/>') },
  { id: "skull", name: "骷髅", src: svg('<path d="M12 3.2A7.4 7.4 0 0 0 4.6 10.4c0 3 1.6 4.6 2.8 5.4V19h9.2v-3.2c1.2-.8 2.8-2.4 2.8-5.4A7.4 7.4 0 0 0 12 3.2z"/><circle cx="9.2" cy="11" r="1.5"/><circle cx="14.8" cy="11" r="1.5"/><path d="M10 16h4"/>') },
  { id: "crown", name: "皇冠", src: svg('<path d="m4 16 2-8 6 5 6-5 2 8H4z"/><path d="M5 18h14v2H5z"/>') },
  { id: "gem", name: "宝石", src: svg('<path d="m12 2.8 5.2 4.2L12 21.2 6.8 7z"/><path d="M6.8 7h10.4"/>') },
  { id: "potion", name: "药水", src: svg('<path d="M9.2 3.2h5.6v3.2l3.4 6.2A5.4 5.4 0 0 1 12 21.2a5.4 5.4 0 0 1-6.2-8.6L9.2 6.4z"/>') },
  { id: "gear", name: "齿轮", src: svg('<path d="M10.2 2.4h3.6l.6 2.4 2.2 1.2 2.4-.6 1.8 3.2-1.8 1.8.2 2.4 1.6 1.8-1.8 3.2-2.4-.6-2.2 1.2-.6 2.4h-3.6l-.6-2.4-2.2-1.2-2.4.6L3.2 15l1.8-1.8-.2-2.4L3.2 9l1.8-3.2 2.4.6 2.2-1.2z"/><circle cx="12" cy="12" r="2.6" fill="#000000"/>') },
  { id: "flag", name: "旗帜", src: svg('<path d="M6 3.2v17.6"/><path d="M7.2 4.4h11.2l-2.4 4 2.4 4H7.2z"/>') },
  { id: "plus", name: "加号", src: svg('<path d="M11 4h2v16h-2z"/><path d="M4 11h16v2H4z"/>') },
  { id: "check", name: "对勾", src: svg('<path d="M4.8 12.4 9.6 17.2 19.2 6.8l-1.8-1.6-7.8 8.4-3-3z"/>') },
  { id: "dot", name: "圆点", src: svg('<circle cx="12" cy="12" r="7"/>') },
  { id: "mana-w", name: "白法力", src: svg('<circle cx="12" cy="12" r="9"/><path d="M12 5.2 13.6 10h5l-4 3 1.6 5L12 15.2 7.8 18l1.6-5-4-3h5z" fill="#111"/>') },
  { id: "mana-u", name: "蓝法力", src: svg('<circle cx="12" cy="12" r="9"/><path d="M12 4.8c3.4 2.6 5.4 5 5.4 7.6A5.4 5.4 0 1 1 8 9.2C9.4 7.2 10.8 5.8 12 4.8z" fill="#111"/>') },
  { id: "mana-b", name: "黑法力", src: svg('<circle cx="12" cy="12" r="9"/><path d="M12 5c3.2 2.8 5 5.4 5 8.2A5 5 0 0 1 7 13.2C7 10.4 8.8 7.8 12 5z" fill="#111"/>') },
  { id: "mana-r", name: "红法力", src: svg('<circle cx="12" cy="12" r="9"/><path d="m12 5.2 2.2 5.4 5.6.4-4.4 3.6 1.4 5.4L12 16.6 7.2 20l1.4-5.4-4.4-3.6 5.6-.4z" fill="#111"/>') },
  { id: "mana-g", name: "绿法力", src: svg('<circle cx="12" cy="12" r="9"/><path d="M12 5.4c2.8 2.6 4.6 5 4.6 7.4A4.6 4.6 0 1 1 8.6 10C9.8 8 11 6.6 12 5.4z" fill="#111"/>') },
];

export function stockIconAssetId(id: string) {
  return `stock-icon:${id}`;
}
