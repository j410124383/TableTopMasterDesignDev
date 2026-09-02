import os from "node:os";

const skip = /vethernet|hyper-v|vmware|virtualbox|wsl|bluetooth|loopback|docker|clash|vpn/i;

const VIRTUAL = /zerotier|\bzt|tailscale|oray|pgyvisitor|\bpgy\b|蒲公英/i;

export function ifaceKind(name, address) {
  if (/zerotier|\bzt/i.test(name)) return "zerotier";
  if (/oray|pgyvisitor|\bpgy\b|蒲公英/i.test(name)) return "pgy";
  if (/tailscale/i.test(name) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) return "tailscale";
  if (/^192\.168\./.test(address)) return "wifi";
  return "lan";
}

function keepIface(name) {
  if (VIRTUAL.test(name)) return true;
  if (/tun|tap/i.test(name)) return false;
  return !skip.test(name);
}

function kindScore(kind, address) {
  if (kind === "zerotier" || kind === "tailscale" || kind === "pgy") return 0;
  if (address.startsWith("192.168.")) return 1;
  if (address.startsWith("10.")) return 2;
  return 3;
}

export function listLanLinks(port = 1420) {
  const links = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (!keepIface(name)) continue;
    for (const inf of list ?? []) {
      const address = String(inf.address ?? "");
      if ((inf.family !== "IPv4" && inf.family !== 4) || inf.internal || address.startsWith("169.254.")) continue;
      const kind = ifaceKind(name, address);
      links.push({
        url: `http://${address}:${port}`,
        address,
        iface: name,
        kind,
      });
    }
  }
  links.sort((a, b) => kindScore(a.kind, a.address) - kindScore(b.kind, b.address) || a.address.localeCompare(b.address));
  return links;
}

export function lanOrigins(port = 1420) {
  return listLanLinks(port).map((l) => l.url);
}
