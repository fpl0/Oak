// Verifies sounds/pack/ against sounds/pack.lock.json (offline; no network).
//
//   bun scripts/sounds/check.ts
//
// Fails (exit 1) when: a locked file is missing, its size or sha256 differs, an unlocked file exists in the
// pack version directory, a sample map still points at a remote host / a `_base` does not end in "/", a
// sample map references a file that is not in the pack, or the manifest references an unmirrored font.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PACK_VERSION, type PackLock, type PackManifest, PUBLIC_ROOT } from "./pack.config.ts";

const SOUNDS_DIR = join(import.meta.dirname, "../../sounds");
const PACK_DIR = join(SOUNDS_DIR, "pack");
const LOCK_PATH = join(SOUNDS_DIR, "pack.lock.json");

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

async function walk(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

if (!existsSync(LOCK_PATH)) {
  console.error("[check] sounds/pack.lock.json is missing: run `bun scripts/sounds/mirror.ts --update`");
  process.exit(1);
}
const lock = JSON.parse(await readFile(LOCK_PATH, "utf8")) as PackLock;
if (lock.packVersion !== PACK_VERSION)
  fail(`lock is ${lock.packVersion}, pack.config.ts says ${PACK_VERSION}`);
if (!existsSync(join(PACK_DIR, lock.packVersion))) {
  console.error(`[check] sounds/pack/${lock.packVersion}/ is missing: run \`bun scripts/sounds/mirror.ts\``);
  process.exit(1);
}

// 1. every locked file exists with the locked size and hash
let bytes = 0;
const lockedPaths = new Set<string>();
for (const f of lock.files) {
  lockedPaths.add(f.path);
  const abs = join(PACK_DIR, f.path);
  if (!existsSync(abs)) {
    fail(`missing: ${f.path}`);
    continue;
  }
  const body = await readFile(abs);
  bytes += body.byteLength;
  if (body.byteLength !== f.bytes) fail(`size: ${f.path} is ${body.byteLength} B, lock says ${f.bytes} B`);
  const hash = createHash("sha256").update(body).digest("hex");
  if (hash !== f.sha256) fail(`sha256: ${f.path}\n    lock ${f.sha256}\n    disk ${hash}`);
  if (!f.derived && !/^https:\/\//.test(f.sourceUrl)) fail(`sourceUrl: ${f.path} has no https source`);
}
if (lock.fileCount !== lock.files.length)
  fail(`fileCount ${lock.fileCount} != files.length ${lock.files.length}`);
const lockTotal = lock.files.reduce((a, f) => a + f.bytes, 0);
if (lock.totalBytes !== lockTotal) fail(`totalBytes ${lock.totalBytes} != sum of files ${lockTotal}`);

// 2. nothing unlocked on disk
for (const rel of await walk(join(PACK_DIR, lock.packVersion))) {
  const path = `${lock.packVersion}/${rel}`;
  if (!lockedPaths.has(path)) fail(`unlocked file on disk: ${path}`);
}

// 3. sample maps are fully local and resolvable
const readJson = async <T>(rel: string) =>
  JSON.parse(await readFile(join(PACK_DIR, lock.packVersion, rel), "utf8")) as T;
const toPackPath = (url: string) => `${lock.packVersion}${url.slice(PUBLIC_ROOT.length)}`;
let manifest: PackManifest | undefined;
try {
  manifest = await readJson<PackManifest>("manifest.json");
} catch (err) {
  fail(`manifest.json unreadable: ${String(err)}`);
}
let sampleRefs = 0;
if (manifest) {
  for (const map of manifest.sampleMaps) {
    const rel = map.json.slice(PUBLIC_ROOT.length + 1);
    const json = await readJson<Record<string, unknown>>(rel);
    const base = json._base;
    if (typeof base !== "string" || !base.startsWith(`${PUBLIC_ROOT}/`) || !base.endsWith("/"))
      fail(
        `${rel}: _base must be a local path under ${PUBLIC_ROOT}/ ending in "/", got ${JSON.stringify(base)}`,
      );
    if (base !== map.base) fail(`${rel}: _base ${String(base)} differs from manifest base ${map.base}`);
    const text = JSON.stringify(json);
    if (/https?:\/\/|github:|bubo:|shabda/.test(text)) fail(`${rel}: still contains a remote reference`);
    for (const [key, value] of Object.entries(json)) {
      if (key.startsWith("_")) continue;
      const refs = (
        Array.isArray(value) ? value : Object.values(value as Record<string, string | string[]>)
      ).flat();
      for (const ref of refs as string[]) {
        sampleRefs++;
        if (!lockedPaths.has(toPackPath(`${base}${ref}`)))
          fail(`${rel}: ${key} -> ${ref} is not in the pack`);
      }
    }
  }
  for (const [name, fonts] of Object.entries(manifest.soundfonts)) {
    for (const { font } of fonts) {
      if (!font.endsWith("_file")) fail(`manifest: ${name} lists broken font ${font}`);
      if (!lockedPaths.has(toPackPath(`${manifest.soundfontUrl}/${font}.js`)))
        fail(`manifest: ${name} font ${font} not in pack`);
    }
  }
  for (const [alias, a] of Object.entries(manifest.aliases)) {
    if (!manifest.soundfonts[a.gm]?.some((f) => f.font === a.font))
      fail(`manifest: alias ${alias} -> ${a.font} not mirrored`);
  }
}

if (errors.length) {
  console.error(`[check] FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `[check] ok: ${lock.files.length} files, ${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)} MiB), ` +
    `${sampleRefs} sample refs resolved, ${Object.keys(manifest?.soundfonts ?? {}).length} gm instruments, pack ${lock.packVersion}`,
);
