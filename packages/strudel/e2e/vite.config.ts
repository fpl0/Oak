// Test page for @oak/strudel (port 5192). Serves the mirrored pack at /sounds/* (the Bun/Hono server does
// this in the app) and app/public (for sw.js). Run by playwright.config.ts; never `bunx --bun vite`.
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const PACK_DIR = resolve(import.meta.dirname, "../../../sounds/pack");
const MIME: Record<string, string> = {
  ".json": "application/json",
  ".js": "text/javascript",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

/** /sounds/<ver>/... -> sounds/pack/<ver>/... File names contain spaces: the path MUST be URI-decoded. */
function serveSoundPack(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = req.url ?? "";
    if (!url.startsWith("/sounds/")) {
      next();
      return;
    }
    const rel = normalize(decodeURIComponent(url.slice("/sounds/".length).split("?")[0] ?? ""));
    const abs = join(PACK_DIR, rel);
    if (rel.startsWith("..") || !abs.startsWith(PACK_DIR) || !existsSync(abs) || !statSync(abs).isFile()) {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain");
      res.end(`not in sound pack: ${rel}`);
      return;
    }
    res.setHeader("content-type", MIME[extname(abs)] ?? "application/octet-stream");
    res.setHeader("content-length", statSync(abs).size);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(abs).pipe(res);
  };
  return {
    name: "oak-serve-sound-pack",
    configureServer: (server) => void server.middlewares.use(handler),
  };
}

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: resolve(import.meta.dirname, ".vite"),
  publicDir: resolve(import.meta.dirname, "../../../app/public"),
  plugins: [react(), serveSoundPack()],
  // Crawl both pages up front: a dependency discovered mid-test would reload the page under the spec.
  optimizeDeps: { entries: ["index.html", "render.html", "offline-test.html", "offline-render.html"] },
  server: { port: 5192, strictPort: true, host: "127.0.0.1" },
});
