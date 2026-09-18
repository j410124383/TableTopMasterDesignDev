import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "desktop", "dist", "TMD.exe");
if (!existsSync(from)) {
  console.error("desktop/dist/TMD.exe 不存在。先运行 npm run desktop:exe");
  process.exit(1);
}
mkdirSync(join(root, "public"), { recursive: true });
const dest = join(root, "TMD.exe");
try {
  copyFileSync(from, dest);
  console.log("wrote TMD.exe");
} catch (err) {
  const alt = join(root, "TMD.exe.new");
  copyFileSync(from, alt);
  console.warn(`TMD.exe 正在运行，无法覆盖。已写到 TMD.exe.new。请关掉旧窗口后把 TMD.exe.new 改名为 TMD.exe。`);
  console.warn(err instanceof Error ? err.message : err);
}
