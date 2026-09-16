import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "desktop", "dist", "TMD.exe");
if (!existsSync(from)) {
  console.error("desktop/dist/TMD.exe 不存在。先运行 npm run desktop:exe");
  process.exit(1);
}
copyFileSync(from, join(root, "TMD.exe"));
mkdirSync(join(root, "public"), { recursive: true });
console.log("wrote TMD.exe");
