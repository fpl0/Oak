// S3 spike: Vite page on port 5183 that serves the mirrored pack at /sounds/* (dev AND preview).
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const PACK_DIR = resolve(import.meta.dirname, "../../sounds/pack");
const MIME: Record<string, string> = {
  ".json": "application/json",
  ".js": "text/javascript",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

/** Tiny static middleware: /sounds/<ver>/... -> sounds/pack/<ver>/... (the Bun/Hono server does this in prod). */
function serveSoundPack(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (!url.startsWith("/sounds/")) return next();
    // file names contain spaces ("Hat Closed-01.wav"): the path MUST be URI-decoded
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
    // the pack version is in the path, so files are immutable
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    createReadStream(abs).pipe(res);
  };
  return {
    name: "oak-serve-sound-pack",
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

export default defineConfig({
  root: import.meta.dirname,
  // keep the dep-optimizer cache inside the spike (default would be the shared <repo>/node_modules/.vite)
  cacheDir: resolve(import.meta.dirname, ".vite"),
  plugins: [serveSoundPack()],
  server: { port: 5183, strictPort: true, host: "127.0.0.1" },
  preview: { port: 5183, strictPort: true, host: "127.0.0.1" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(import.meta.dirname, "index.html"), render: resolve(import.meta.dirname, "render.html") } },
  },
});
