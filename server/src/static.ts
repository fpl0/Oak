// Files outside /api: the self-hosted sound pack (`/sounds/manifest.json` no-cache, `/sounds/<version>/*`
// immutable with Range, paths URL-decoded) and, in production, the built app from `dist/` with SPA
// fallback. HTML gets the CSP from security.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import type { Hono } from "hono";
import { serveFile } from "./services/audio-store.ts";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".sf2": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};
export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** One path segment used as a directory name: no separators, and not `.`/`..` (or any all-dot name). */
export function safeSegment(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && !/^\.+$/.test(name);
}

/** `root/rel` when it stays inside `root` and is a file; `null` otherwise. */
export function safeFile(root: string, rel: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const abs = resolve(root, `.${sep}${decoded}`);
  const r = relative(root, abs);
  if (r === "" || r.startsWith("..") || resolve(root, r) !== abs) return null;
  try {
    return statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

/** The pack version being served: `sounds/pack.lock.json`'s `packVersion`, else the newest pack directory. */
export function packVersion(soundsDir: string): string | null {
  const lock = join(dirname(soundsDir), "pack.lock.json");
  try {
    const v = (JSON.parse(readFileSync(lock, "utf8")) as { packVersion?: unknown }).packVersion;
    if (typeof v === "string" && safeSegment(v)) return v;
  } catch {
    /* no lock file: look at the directories */
  }
  if (!existsSync(soundsDir)) return null;
  const dirs = readdirSync(soundsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && safeSegment(e.name))
    .map((e) => e.name)
    .sort();
  return dirs.at(-1) ?? null;
}

export function staticRoutes(
  app: Hono,
  opts: { soundsDir: string; distDir: string; serveDist: boolean },
): void {
  app.get("/sounds/manifest.json", (c) => {
    const v = packVersion(opts.soundsDir);
    const abs = v === null ? null : safeFile(opts.soundsDir, `${v}/manifest.json`);
    if (abs === null)
      return c.json(
        { error: { code: "not_found", message: "the sound pack is not installed (bun run sounds:mirror)" } },
        404,
      );
    return serveFile(abs, c.req.raw, { mime: "application/json; charset=utf-8", cacheControl: "no-cache" });
  });
  app.get("/sounds/:version/*", (c) => {
    const version = c.req.param("version");
    if (!safeSegment(version)) return c.notFound();
    const rest = c.req.path.slice(`/sounds/${version}/`.length);
    const abs = safeFile(join(opts.soundsDir, version), rest);
    if (abs === null) return c.notFound();
    return serveFile(abs, c.req.raw, {
      mime: contentType(abs),
      cacheControl: "public, max-age=31536000, immutable",
    });
  });

  if (!opts.serveDist) return;
  const index = join(opts.distDir, "index.html");
  app.get("*", (c) => {
    const path = c.req.path;
    if (path.startsWith("/api/") || path === "/api" || path.startsWith("/mcp/")) return c.notFound();
    const abs = path === "/" ? null : safeFile(opts.distDir, path.slice(1));
    if (abs !== null) {
      const hashed = /\/assets\//.test(path);
      return serveFile(abs, c.req.raw, {
        mime: contentType(abs),
        cacheControl: hashed ? "public, max-age=31536000, immutable" : "no-cache",
      });
    }
    // SPA fallback: every route of the app is served the same document.
    if (!existsSync(index)) return c.text("Oak is not built yet: run `bun run build`.", 503);
    return serveFile(index, c.req.raw, { mime: "text/html; charset=utf-8", cacheControl: "no-cache" });
  });
}
