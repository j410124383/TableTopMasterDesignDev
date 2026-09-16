/**
 * Windows 日常入口：起 1420 本地服务，打开 TMD 窗口（Edge/Chrome --app），
 * 关掉窗口后停掉服务。不调用系统默认浏览器。
 */
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 1420;
const URL = `http://127.0.0.1:${PORT}/`;
const showConsole = process.env.TMD_SHOW_CONSOLE === "1" || process.argv.includes("/console");
const profile = join(root, ".tmd-webview");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fail(msg) {
  console.error(msg);
  try {
    spawn("mshta", [`javascript:alert("${msg.replace(/["\\]/g, " ")}");close()`], { windowsHide: false, stdio: "ignore" }).unref?.();
  } catch {
    /* ignore */
  }
}

function findChromium() {
  const locals = process.env.LOCALAPPDATA || "";
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const list = [
    join(locals, "Microsoft/Edge/Application/msedge.exe"),
    join(pf86, "Microsoft/Edge/Application/msedge.exe"),
    join(pf, "Microsoft/Edge/Application/msedge.exe"),
    join(pf, "Google/Chrome/Application/chrome.exe"),
    join(locals, "Google/Chrome/Application/chrome.exe"),
  ];
  return list.find((p) => existsSync(p));
}

async function ready(ms = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const res = await fetch(URL, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      /* still booting */
    }
    await sleep(250);
  }
  return false;
}

function killTree(pid) {
  if (!pid) return;
  try {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).unref?.();
  } catch {
    try {
      process.kill(pid);
    } catch {
      /* ignore */
    }
  }
}

function killPort() {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
      { stdio: "ignore" },
    );
  } catch {
    /* ignore */
  }
}

function profileLock(dir) {
  return ["SingletonLock", "lockfile", "Lock"].map((n) => join(dir, n)).find((p) => existsSync(p));
}

async function waitWindow(child) {
  await sleep(1200);
  if (child.exitCode == null) {
    await new Promise((r) => child.once("exit", r));
    return;
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && !profileLock(profile)) await sleep(200);
  while (profileLock(profile)) await sleep(400);
}

function startServer() {
  const viteJs = join(root, "node_modules/vite/bin/vite.js");
  const args = existsSync(viteJs)
    ? [viteJs, "--host", "0.0.0.0", "--port", String(PORT)]
    : [join(root, "node_modules/npm/bin/npm-cli.js"), "run", "start"];
  return spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, TMD_NO_BROWSER: "1" },
    stdio: showConsole ? "inherit" : "ignore",
    windowsHide: !showConsole,
  });
}

function openWindow() {
  const exe = findChromium();
  if (!exe) return null;
  mkdirSync(profile, { recursive: true });
  return spawn(
    exe,
    [
      `--app=${URL}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=TranslateUI,MediaRouter",
      "--window-size=1280,840",
    ],
    { cwd: root, stdio: "ignore", windowsHide: false },
  );
}

let server = null;
let windowChild = null;
let startedServer = false;

function shutdown() {
  if (windowChild?.pid) killTree(windowChild.pid);
  if (startedServer && server?.pid) killTree(server.pid);
  else killPort();
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

const already = await ready(800);
if (!already) {
  server = startServer();
  startedServer = true;
  server.on("exit", (code) => {
    if (windowChild) killTree(windowChild.pid);
    if (code && code !== 0) process.exit(code);
  });
  if (!(await ready())) {
    fail("本地服务没有在 1420 起来。");
    shutdown();
    process.exit(1);
  }
}

windowChild = openWindow();
if (!windowChild) {
  fail("没找到 Edge / Chrome，无法打开 TMD 窗口。请安装 Microsoft Edge。");
  shutdown();
  process.exit(1);
}

await waitWindow(windowChild);
shutdown();
process.exit(0);
