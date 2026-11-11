// Minimal Vite page for the workbench e2e (port 5193), independent of the app shell. Run on Node:
//   node node_modules/vite/bin/vite.js --config app/src/workbench/e2e/vite.config.ts
// It serves the self-hosted sound pack (sounds/pack) at /sounds itself, so no API server is needed.
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const packRoot = join(repoRoot, "sounds", "pack");
const PORT = 5193;

const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".js": "text/javascript",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

function soundPack(): Plugin {
  return {
    name: "oak-e2e-sounds",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/sounds/")) return next();
        const rel = decodeURIComponent(url.slice("/sounds/".length).split("?")[0] ?? "");
        const file = normalize(join(packRoot, rel));
        if (!file.startsWith(packRoot) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: here,
  cacheDir: join(here, ".vite-cache"),
  plugins: [react(), soundPack()],
  resolve: {
    alias: {
      "@content": join(repoRoot, "content"),
      "@app": join(repoRoot, "app", "src"),
    },
  },
  define: { "process.env.NODE_ENV": JSON.stringify("development") },
  server: { host: "127.0.0.1", port: PORT, strictPort: true, fs: { allow: [repoRoot] } },
  worker: { format: "es" },
  optimizeDeps: {
    include: ["react", "react-dom/client", "react/jsx-runtime", "abcjs"],
  },
});
