import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { forumPlugin } from "./plugins/forumMiddleware";
import { fsPlugin } from "./plugins/fsMiddleware";
import { marketPlugin } from "./plugins/marketMiddleware";
import { playNetPlugin } from "./plugins/playNetMiddleware";
import { playCardCachePlugin } from "./plugins/playCardCacheMiddleware";
import { PLAY_PROTOCOL, versionInfo } from "./scripts/version.mjs";

const tmd = versionInfo();

const host = process.env.TAURI_DEV_HOST;

function zipNoSpa() {
  return {
    name: "zip-no-spa",
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0] ?? "";
          if (/\.zip$/i.test(url) && !res.writableEnded) {
            res.statusCode = 404;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("zip not found");
            return;
          }
          next();
        });
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), playNetPlugin(), playCardCachePlugin(), marketPlugin(), forumPlugin(), fsPlugin(), zipNoSpa()],
  define: {
    __APP_VERSION__: JSON.stringify(tmd.version),
    __APP_BUILD__: JSON.stringify(tmd.build),
    __PLAY_PROTOCOL__: JSON.stringify(tmd.protocol ?? PLAY_PROTOCOL),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    open: true,
    host: host || "0.0.0.0",
    allowedHosts: true,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/release/**", "**/data/**", "**/public/*.zip", "**/public/fonts/**", "**/vendor/**"],
    },
  },
});
