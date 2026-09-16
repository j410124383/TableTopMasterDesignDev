import { versionText } from "./version.mjs";
import { listLanLinks } from "./lanDetect.mjs";

console.log(versionText());
console.log("TMD 本机：http://localhost:1420/");
const links = listLanLinks(1420);
const zt = links.filter((l) => l.kind === "zerotier" || l.kind === "tailscale" || l.kind === "pgy");
const lan = links.filter((l) => l.kind !== "zerotier" && l.kind !== "tailscale" && l.kind !== "pgy");
if (zt.length) {
  console.log("虚拟局域网（ZeroTier / 蒲公英 / Tailscale）：对方不要再双击启动脚本，用浏览器打开：");
  for (const l of zt) console.log(`  ${l.url}/`);
}
console.log("同一 Wi-Fi：对方不要再双击启动脚本，请用浏览器打开：");
if (!lan.length && !zt.length) console.log("  （没找到局域网 IP）");
for (const l of lan) console.log(`  ${l.url}/`);
console.log("优先：ZeroTier 用 10. 开头；家里 Wi-Fi 用 192.168. 开头。");
if (process.platform === "win32") {
  console.log("打不开时用管理员命令提示符运行：");
  console.log("  netsh advfirewall firewall add rule name=\"TMD LAN 1420\" dir=in action=allow protocol=TCP localport=1420");
} else {
  console.log("若局域网打不开，到「系统设置 → 网络 → 防火墙」允许 Node 接受传入连接。");
}
