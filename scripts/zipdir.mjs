import { createWriteStream, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { once } from "node:events";

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function dosDate(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2) || 0) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

function shouldSkip(name) {
  if (name === ".vite" || name === ".cache" || name.startsWith("_node_extract")) return true;
  if (/\.(zip|tgz|tar\.gz)$/i.test(name)) return true;
  return false;
}

function collect(dir, rel = "") {
  /** @type {{ rel: string; full: string; dir: boolean }[]} */
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkip(ent.name)) continue;
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push({ rel: r, full, dir: true });
      out.push(...collect(full, r));
    } else if (ent.isFile()) {
      out.push({ rel: r, full, dir: false });
    }
  }
  return out;
}

function unixExec(rel) {
  const name = rel.split("/").pop() ?? "";
  if (name.endsWith(".command") || name.endsWith(".sh")) return true;
  const parts = rel.split("/");
  const inBin = parts.includes("bin");
  if (inBin && (name === "node" || name === "npm" || name === "npx" || name === "corepack" || !name.includes("."))) {
    return true;
  }
  return false;
}

/**
 * Write a zip of `srcDir`. `unix: true` sets Unix executable bits (needed for Mac .command / node).
 */
export async function zipDirectory(srcDir, destFile, { unix = false, includeBase = true } = {}) {
  const prefix = includeBase ? `${basename(srcDir).replaceAll("\\", "/")}/` : "";
  const entries = collect(srcDir);
  const { time, date } = dosDate();
  const out = createWriteStream(destFile);
  let offset = 0;
  /** @type {Buffer[]} */
  const centrals = [];
  const flags = 0x800;

  async function write(buf) {
    if (!out.write(buf)) await once(out, "drain");
    offset += buf.length;
  }

  for (const ent of entries) {
    const name = `${prefix}${ent.rel}`.replaceAll("\\", "/");
    const nameBuf = Buffer.from(ent.dir ? `${name}/` : name, "utf8");
    const data = ent.dir ? Buffer.alloc(0) : readFileSync(ent.full);
    const crc = crc32(data) >>> 0;
    let method = 0;
    let payload = data;
    if (!ent.dir && data.length > 64) {
      try {
        const compressed = deflateRawSync(data, { level: 3 });
        if (compressed.length < data.length) {
          method = 8;
          payload = compressed;
        }
      } catch {
        /* store uncompressed */
      }
    }
    const localOff = offset;
    const need = method === 8 ? 20 : 10;
    await write(u32(0x04034b50));
    await write(u16(need));
    await write(u16(flags));
    await write(u16(method));
    await write(u16(time));
    await write(u16(date));
    await write(u32(crc));
    await write(u32(payload.length));
    await write(u32(data.length));
    await write(u16(nameBuf.length));
    await write(u16(0));
    await write(nameBuf);
    if (payload.length) await write(payload);

    const mode = ent.dir ? 0o40755 : unixExec(ent.rel) ? 0o100755 : 0o100644;
    const ext = unix ? ((mode << 16) >>> 0) | (ent.dir ? 0x10 : 0) : ent.dir ? 0x10 : 0;
    const made = unix ? 0x031e : 20;
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(made),
        u16(need),
        u16(flags),
        u16(method),
        u16(time),
        u16(date),
        u32(crc),
        u32(payload.length),
        u32(data.length),
        u16(nameBuf.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(ext),
        u32(localOff),
        nameBuf,
      ]),
    );
  }

  const cdOff = offset;
  for (const c of centrals) await write(c);
  const n = centrals.length;
  await write(u32(0x06054b50));
  await write(u16(0));
  await write(u16(0));
  await write(u16(n));
  await write(u16(n));
  await write(u32(offset - cdOff));
  await write(u32(cdOff));
  await write(u16(0));
  out.end();
  await once(out, "finish");
}
