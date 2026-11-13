// Mirrors the curated Oak sound pack into sounds/pack/<packVersion>/ and writes sounds/pack.lock.json.
//
//   bun scripts/sounds/mirror.ts            # lock present: reproduce it exactly (frozen); else resolve
//   bun scripts/sounds/mirror.ts --update   # re-resolve from upstream + pack.config.ts, rewrite the lock
//   bun scripts/sounds/mirror.ts --dry-run  # resolve and print the plan/sizes (HEAD only), write nothing
//   add --offline to any of them: the upstream maps are read from the locked pack on disk (they were pruned
//   with the same rules, so pruning again is a no-op), files come from the previous version's directory, and
//   nothing is fetched; a file that would need a download is an error. A version bump that only adds Oak's
//   own derived files (the rendered break) needs no network.
//
// On --update after a PACK_VERSION bump, a file whose source URL is unchanged is copied from the previous
// version's directory when its bytes still match the previous lock (no re-download of an immutable upstream).
//
// Sources are the hosts the strudel.cc REPL prebake uses: strudel.b-cdn.net (sample maps + audio) and
// felixroos.github.io/webaudiofontdata (gm_* WebAudioFont presets). Every JSON `_base` is rewritten to
// `/sounds/<packVersion>/<dir>/` so nothing in the pack points at a third-party host.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import gm from "@strudel/soundfonts/gm.mjs";
import { BRK_DIR, BRK_FILE, BRK_JSON, BRK_LICENCE, renderBreakWav } from "./brk.ts";
import {
  BANK_ALIAS_JSON,
  DRUM_BANKS,
  GM_VARIANTS,
  kitJson,
  type LockFile,
  OAK_ALIASES,
  OAK_KITS,
  PACK_VERSION,
  type PackLock,
  type PackManifest,
  PUBLIC_ROOT,
  SAMPLE_CDN,
  SAMPLE_MAPS,
  SOUNDFONT_CDN,
} from "./pack.config.ts";
import { insideRoot, isSafeSamplePath } from "./paths.ts";

const SOUNDS_DIR = join(import.meta.dirname, "../../sounds");
const PACK_DIR = join(SOUNDS_DIR, "pack");
const LOCK_PATH = join(SOUNDS_DIR, "pack.lock.json");
const CONCURRENCY = 4;
const RETRIES = 4;
const BUDGET_BYTES = 30 * 1024 * 1024;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const update = args.has("--update");
const offline = args.has("--offline");

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;

/** encodeURI but also escape "#" (superdough's loadBuffer does the same before fetching). */
const encodePath = (p: string) => encodeURI(p).replace(/#/g, "%23");

async function fetchRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return res;
      // 4xx other than 408/429 will not get better by retrying
      if (res.status < 500 && res.status !== 408 && res.status !== 429) {
        throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: true });
      }
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if ((err as { fatal?: boolean }).fatal) throw err;
      lastError = err;
    }
  }
  throw new Error(`giving up on ${url} after ${RETRIES + 1} attempts: ${String(lastError)}`);
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T, i);
      }
    }),
  );
  return out;
}

/** Cheap content sniffing so an HTML error page can never land in the pack. */
function validate(path: string, body: Uint8Array) {
  if (body.byteLength === 0) throw new Error(`${path}: empty body`);
  const head = new TextDecoder("latin1").decode(body.subarray(0, 64));
  if (/^\s*<(!doctype|html)/i.test(head)) throw new Error(`${path}: got an HTML page, not audio`);
  if (/\.wav$/i.test(path) && !head.startsWith("RIFF")) throw new Error(`${path}: not a RIFF/WAVE file`);
  if (
    /\.mp3$/i.test(path) &&
    !(head.startsWith("ID3") || (body[0] === 0xff && ((body[1] ?? 0) & 0xe0) === 0xe0))
  )
    throw new Error(`${path}: not an MP3 file`);
  if (/_file\.js$/.test(path)) {
    const text = new TextDecoder().decode(body);
    // fontloader.mjs does `preset.split('={')` then eval('{' + data): both markers must exist
    if (!text.includes("={") || !text.includes("zones"))
      throw new Error(`${path}: not a WebAudioFont preset`);
  }
}

interface Planned {
  /** path below sounds/pack/ */
  path: string;
  sourceUrl: string;
  group: string;
  /** set for derived files: the bytes to write */
  content?: string | Uint8Array;
}

type SampleMap = Record<string, string | string[] | Record<string, string | string[]>>;

/** The pack on disk the lock describes (offline source of the upstream maps and of the break's one-shots). */
async function lockedFile(lock: PackLock | undefined, rel: string): Promise<Uint8Array | null> {
  for (const v of [lock?.packVersion, PACK_VERSION]) {
    if (!v) continue;
    const abs = insideRoot(PACK_DIR, `${v}/${rel}`);
    if (existsSync(abs)) return new Uint8Array(await readFile(abs));
  }
  return null;
}

/** Resolve the full file plan from upstream JSON + pack.config.ts. */
async function resolvePlan(lock: PackLock | undefined): Promise<{ plan: Planned[]; manifest: PackManifest }> {
  const plan: Planned[] = [];
  const v = PACK_VERSION;
  const manifest: PackManifest = {
    packVersion: v,
    publicRoot: PUBLIC_ROOT,
    sampleMaps: [],
    bankAliases: `${PUBLIC_ROOT}/${BANK_ALIAS_JSON}`,
    soundfontUrl: `${PUBLIC_ROOT}/webaudiofontdata/sound`,
    soundfonts: {},
    aliases: {},
  };

  const upstreamCache = new Map<string, Promise<SampleMap>>();
  const localJson = async <T>(rel: string): Promise<T> => {
    const bytes = await lockedFile(lock, rel);
    if (!bytes) throw new Error(`--offline: ${rel} is not in the locked pack`);
    const json = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    delete json._base;
    return json as T;
  };
  const upstreamMap = (json: string): Promise<SampleMap> => {
    let p = upstreamCache.get(json);
    if (!p) {
      p = offline
        ? localJson<SampleMap>(json)
        : fetchRetry(`${SAMPLE_CDN}/${json}`).then((r) => r.json() as Promise<SampleMap>);
      upstreamCache.set(json, p);
    }
    return p;
  };

  for (const spec of SAMPLE_MAPS) {
    const jsonUrl = `${SAMPLE_CDN}/${spec.json}`;
    const upstream = await upstreamMap(spec.json);
    const base = `${PUBLIC_ROOT}/${spec.dir}`;
    const out: SampleMap = { _base: base };
    const group = spec.json.replace(/\.json$/, "");
    const add = (file: string) => {
      if (!isSafeSamplePath(file))
        throw new Error(`upstream ${spec.json} lists an unsafe path: ${JSON.stringify(file)}`);
      plan.push({
        path: `${v}/${spec.dir}${file}`,
        sourceUrl: `${SAMPLE_CDN}/${spec.dir}${encodePath(file)}`,
        group,
      });
      return file;
    };
    for (const [key, value] of Object.entries(upstream)) {
      if (key.startsWith("_")) continue;
      const n = spec.keep(key);
      if (n <= 0) continue;
      if (typeof value === "string") out[key] = [add(value)];
      else if (Array.isArray(value)) out[key] = value.slice(0, n).map(add);
      else {
        // pitched map: { C3: "file" | ["file", ...] }
        out[key] = Object.fromEntries(
          Object.entries(value).map(([note, files]) => [
            note,
            typeof files === "string" ? add(files) : files.slice(0, n).map(add),
          ]),
        );
      }
    }
    plan.push({
      path: `${v}/${spec.json}`,
      sourceUrl: jsonUrl,
      group,
      content: `${JSON.stringify(out, null, 2)}\n`,
    });
    manifest.sampleMaps.push({
      json: `${PUBLIC_ROOT}/${spec.json}`,
      base,
      ...(spec.json.startsWith("tidal-drum-machines") ? { tag: "drum-machines" } : {}),
    });
  }

  // Oak kits: a derived map per kit (`<kit>_<role>` keys) over files of an upstream map, which must list them.
  manifest.kitGains = {};
  for (const [kit, spec] of Object.entries(OAK_KITS)) {
    const upstream = await upstreamMap(spec.json);
    const listed = new Set<string>();
    for (const [key, value] of Object.entries(upstream)) {
      if (key.startsWith("_")) continue;
      const files =
        typeof value === "string" ? [value] : Array.isArray(value) ? value : Object.values(value).flat();
      for (const f of files) listed.add(f);
    }
    // Offline, the local copy of the upstream map is pruned to Oak's banks: the kit's own map lists the rest.
    if (offline)
      for (const [key, value] of Object.entries(await localJson<SampleMap>(kitJson(kit))))
        if (!key.startsWith("_") && Array.isArray(value)) for (const f of value) listed.add(f);
    const base = `${PUBLIC_ROOT}/${spec.dir}`;
    const out: SampleMap = { _base: base };
    for (const [role, def] of Object.entries(spec.roles)) {
      if (!def) continue;
      for (const file of def.files) {
        if (!listed.has(file))
          throw new Error(`pack.config: kit ${kit} ${role}: ${file} is not in upstream ${spec.json}`);
        if (!isSafeSamplePath(file)) throw new Error(`pack.config: kit ${kit} lists an unsafe path ${file}`);
        const path = `${v}/${spec.dir}${file}`;
        if (!plan.some((p) => p.path === path))
          plan.push({ path, sourceUrl: `${SAMPLE_CDN}/${spec.dir}${encodePath(file)}`, group: `kit-${kit}` });
      }
      out[`${kit}_${role}`] = [...def.files];
      manifest.kitGains[`${kit}_${role}`] = def.gain;
    }
    const json = kitJson(kit);
    plan.push({
      path: `${v}/${json}`,
      sourceUrl: `generated:scripts/sounds/pack.config.ts#${kit}`,
      group: `kit-${kit}`,
      content: `${JSON.stringify(out, null, 2)}\n`,
    });
    manifest.sampleMaps.push({ json: `${PUBLIC_ROOT}/${json}`, base, tag: "oak-kit" });
  }

  // bank aliases (RolandTR909 -> TR909 ...), pruned to our banks
  const aliasUrl = `${SAMPLE_CDN}/${BANK_ALIAS_JSON}`;
  const aliasUpstream = offline
    ? await localJson<Record<string, string | string[]>>(BANK_ALIAS_JSON)
    : ((await (await fetchRetry(aliasUrl)).json()) as Record<string, string | string[]>);
  const aliasOut = Object.fromEntries(
    DRUM_BANKS.filter((b) => aliasUpstream[b]).map((b) => [b, aliasUpstream[b]]),
  );
  plan.push({
    path: `${v}/${BANK_ALIAS_JSON}`,
    sourceUrl: aliasUrl,
    group: "tidal-drum-machines",
    content: `${JSON.stringify(aliasOut, null, 2)}\n`,
  });

  // Oak's rendered sounds: the break (`s("brk")`), from the uzu-drumkit one-shots the pack already holds.
  const uzu = SAMPLE_MAPS.find((m) => m.json === "uzu-drumkit.json");
  if (!uzu) throw new Error("pack.config: the break needs the uzu-drumkit map");
  const brk = await renderBreakWav(async (file) => {
    const local = await lockedFile(lock, `${uzu.dir}${file}`);
    if (local) return local;
    if (offline) throw new Error(`--offline: ${uzu.dir}${file} is not in the locked pack`);
    return new Uint8Array(
      await (await fetchRetry(`${SAMPLE_CDN}/${uzu.dir}${encodePath(file)}`)).arrayBuffer(),
    );
  });
  plan.push({
    path: `${v}/${BRK_DIR}${BRK_FILE}`,
    sourceUrl: `generated:scripts/sounds/brk.ts (${BRK_LICENCE})`,
    group: "oak-rendered",
    content: brk,
  });
  plan.push({
    path: `${v}/${BRK_JSON}`,
    sourceUrl: "generated:scripts/sounds/brk.ts",
    group: "oak-rendered",
    content: `${JSON.stringify({ _base: `${PUBLIC_ROOT}/${BRK_DIR}`, brk: [BRK_FILE] }, null, 2)}\n`,
  });
  manifest.sampleMaps.push({
    json: `${PUBLIC_ROOT}/${BRK_JSON}`,
    base: `${PUBLIC_ROOT}/${BRK_DIR}`,
    tag: "oak-rendered",
  });

  // gm_* soundfonts
  const gmMap = gm;
  const seen = new Set<string>();
  for (const [name, indices] of Object.entries(GM_VARIANTS)) {
    const fonts = gmMap[name];
    if (!fonts) throw new Error(`pack.config: unknown gm instrument ${name}`);
    manifest.soundfonts[name] = indices.map((upstreamIndex) => {
      const font = fonts[upstreamIndex];
      if (!font) throw new Error(`pack.config: ${name} has no variant ${upstreamIndex}`);
      if (!font.endsWith("_file"))
        throw new Error(`pack.config: ${name}:${upstreamIndex} is the broken "${font}"`);
      if (!seen.has(font)) {
        seen.add(font);
        plan.push({
          path: `${v}/webaudiofontdata/sound/${font}.js`,
          sourceUrl: `${SOUNDFONT_CDN}/${font}.js`,
          group: "soundfonts",
        });
      }
      return { upstreamIndex, font };
    });
  }
  for (const [alias, spec] of Object.entries(OAK_ALIASES)) {
    const entry = manifest.soundfonts[spec.gm]?.find((f) => f.upstreamIndex === spec.variant);
    if (!entry) throw new Error(`pack.config: alias ${alias} -> ${spec.gm}:${spec.variant} is not mirrored`);
    manifest.aliases[alias] = {
      gm: spec.gm,
      upstreamIndex: spec.variant,
      font: entry.font,
      ...(spec.gain !== undefined ? { gain: spec.gain } : {}),
      ...(spec.release !== undefined ? { release: spec.release } : {}),
      ...(spec.range !== undefined ? { range: spec.range } : {}),
    };
  }
  plan.push({
    path: `${v}/manifest.json`,
    sourceUrl: "generated:scripts/sounds/pack.config.ts",
    group: "manifest",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });

  const dupes = plan.map((p) => p.path).filter((p, i, a) => a.indexOf(p) !== i);
  if (dupes.length) throw new Error(`duplicate paths in plan: ${dupes.join(", ")}`);
  plan.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { plan, manifest };
}

async function readLock(): Promise<PackLock | undefined> {
  if (!existsSync(LOCK_PATH)) return undefined;
  return JSON.parse(await readFile(LOCK_PATH, "utf8")) as PackLock;
}

async function writeAtomic(path: string, data: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.part`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function main() {
  const lock = await readLock();
  const frozen = !!lock && !update;
  if (lock && lock.packVersion !== PACK_VERSION && !update) {
    throw new Error(
      `pack.lock.json is ${lock.packVersion} but pack.config.ts says ${PACK_VERSION}: run with --update`,
    );
  }
  console.log(
    `[mirror] pack ${PACK_VERSION} -> ${relative(process.cwd(), PACK_DIR)} (${frozen ? "frozen" : "resolve"})`,
  );

  const { plan } = await resolvePlan(lock);
  const locked = new Map((lock?.files ?? []).map((f) => [f.path, f]));
  // After a version bump: the previous version's files by source URL (byte-identical upstream, no download).
  const previous =
    lock && lock.packVersion !== PACK_VERSION
      ? new Map(lock.files.filter((f) => !f.derived).map((f) => [f.sourceUrl, f]))
      : new Map<string, LockFile>();
  let copied = 0;

  if (dryRun) {
    const sizes = await pool(plan, CONCURRENCY, async (p) => {
      if (p.content !== undefined)
        return typeof p.content === "string" ? Buffer.byteLength(p.content) : p.content.byteLength;
      if (offline) return (locked.get(p.path) ?? previous.get(p.sourceUrl))?.bytes ?? 0;
      const res = await fetchRetry(p.sourceUrl, {
        method: "HEAD",
        headers: { "accept-encoding": "identity" },
      });
      return Number(res.headers.get("content-length") ?? 0);
    });
    report(plan.map((p, i) => ({ ...p, bytes: sizes[i] ?? 0 })));
    return;
  }

  let downloaded = 0;
  let reused = 0;
  const files = await pool(plan, CONCURRENCY, async (p): Promise<LockFile & { group: string }> => {
    const dest = insideRoot(PACK_DIR, p.path);
    const want = locked.get(p.path);
    let body: Uint8Array;
    if (p.content !== undefined) {
      body = typeof p.content === "string" ? new TextEncoder().encode(p.content) : p.content;
    } else if (want && existsSync(dest) && sha256(await readFile(dest)) === want.sha256) {
      reused++;
      return { path: p.path, sourceUrl: p.sourceUrl, bytes: want.bytes, sha256: want.sha256, group: p.group };
    } else if (
      previous.has(p.sourceUrl) &&
      existsSync(insideRoot(PACK_DIR, (previous.get(p.sourceUrl) as LockFile).path)) &&
      sha256(await readFile(insideRoot(PACK_DIR, (previous.get(p.sourceUrl) as LockFile).path))) ===
        (previous.get(p.sourceUrl) as LockFile).sha256
    ) {
      const prev = previous.get(p.sourceUrl) as LockFile;
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(insideRoot(PACK_DIR, prev.path), dest);
      copied++;
      return { path: p.path, sourceUrl: p.sourceUrl, bytes: prev.bytes, sha256: prev.sha256, group: p.group };
    } else {
      if (offline) throw new Error(`--offline: ${p.path} would need a download from ${p.sourceUrl}`);
      body = new Uint8Array(await (await fetchRetry(p.sourceUrl)).arrayBuffer());
      validate(p.path, body);
      downloaded++;
      if (downloaded % 25 === 0) console.log(`[mirror]   ...${downloaded} downloaded`);
    }
    const hash = sha256(body);
    if (frozen) {
      if (!want) throw new Error(`frozen: ${p.path} is not in pack.lock.json (config changed? run --update)`);
      if (want.sha256 !== hash)
        throw new Error(
          `frozen: sha256 mismatch for ${p.path}\n  lock ${want.sha256}\n  got  ${hash}\n  (${p.sourceUrl})`,
        );
    }
    await writeAtomic(dest, body);
    return {
      path: p.path,
      sourceUrl: p.sourceUrl,
      bytes: body.byteLength,
      sha256: hash,
      group: p.group,
      ...(p.content !== undefined ? { derived: true as const } : {}),
    };
  });

  if (frozen) {
    const missing = [...locked.keys()].filter((path) => !files.some((f) => f.path === path));
    if (missing.length)
      throw new Error(`frozen: lock lists files the config no longer produces: ${missing.join(", ")}`);
  }

  // remove anything in this pack version that is not part of the plan
  const keep = new Set(files.map((f) => join(PACK_DIR, f.path)));
  let removed = 0;
  for (const f of await walk(join(PACK_DIR, PACK_VERSION))) {
    if (!keep.has(f)) {
      await rm(f);
      removed++;
    }
  }

  const groups: PackLock["groups"] = {};
  for (const f of files) {
    const g = groups[f.group] ?? { files: 0, bytes: 0 };
    g.files++;
    g.bytes += f.bytes;
    groups[f.group] = g;
  }
  const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
  const newLock: PackLock = {
    packVersion: PACK_VERSION,
    publicRoot: PUBLIC_ROOT,
    totalBytes,
    fileCount: files.length,
    groups,
    files: files.map(({ group: _group, ...f }) => f),
  };
  if (!frozen) await writeAtomic(LOCK_PATH, `${JSON.stringify(newLock, null, 2)}\n`);

  report(files);
  console.log(
    `[mirror] ${downloaded} downloaded, ${reused} reused, ${copied} copied from the previous version, ${removed} stale removed; lock ${frozen ? "verified" : "written"}`,
  );
  if (totalBytes > BUDGET_BYTES) {
    console.error(`[mirror] WARNING: pack is ${mb(totalBytes)}, over the ${mb(BUDGET_BYTES)} budget`);
    process.exitCode = 2;
  }
}

function report(files: { group: string; bytes: number }[]) {
  const groups = new Map<string, { files: number; bytes: number }>();
  for (const f of files) {
    const g = groups.get(f.group) ?? { files: 0, bytes: 0 };
    g.files++;
    g.bytes += f.bytes;
    groups.set(f.group, g);
  }
  for (const [name, g] of groups)
    console.log(
      `[mirror]   ${name.padEnd(22)} ${String(g.files).padStart(4)} files  ${mb(g.bytes).padStart(9)}`,
    );
  const total = files.reduce((a, f) => a + f.bytes, 0);
  console.log(
    `[mirror]   ${"TOTAL".padEnd(22)} ${String(files.length).padStart(4)} files  ${mb(total).padStart(9)}`,
  );
}

await main();
