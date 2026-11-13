// The dev seeder's snapshots (OAK_DEV=1 only; `POST /api/dev/seed` is a dev route). Building a point replays every
// default-order session through the real services (0.5–5 s idle for a Wave 5 point, more under load), and the e2e
// suites seed the same points again and again. So the first build of a request is kept as a snapshot of the whole
// learner — `VACUUM INTO` of oak.db plus a copy of the audio and album folders — and the same request later restores
// it instead of replaying: every table of the learner replaced from the snapshot in one transaction (append-only
// triggers dropped and recreated, as the backup import does), the audio folders replaced, no pre-reset safety copy.
//
// A restore is the build it was taken from, table by table and file by file (dev-seed-cache.test.ts), never another
// option set: the key is the point and every option of the request, the content version, the schema version and (for
// a shared folder) the server's own code. A snapshot is used only on the learner day it was built on and for one hour
// of the requesting server's clock after its build: the restored learner is the built one who waited up to an hour
// longer before opening Oak, never one whose "yesterday" moved. The /dev/listen verdicts are not the learner's: they
// stay as they are, as the build keeps them.
//
// Where: `<dataDir>/dev-seed-cache/` (this server only, emptied when it starts seeding), or `OAK_SEED_CACHE_DIR`, a
// folder several dev servers share (the e2e stacks: a point built by one shard is restored by every other). Entries
// are written to a temporary folder and renamed into place, never changed afterwards, and removed only two hours after
// they stopped being usable, so a server never reads a half-written or vanishing snapshot. Off with `OAK_SEED_CACHE=0`.
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { DevSeedRequest, DevSeedResult } from "@oak/api";
import { schemaVersion, tableNames } from "../db/index.ts";
import { triggerDdl } from "../db/migrate.ts";
import type { AppDeps } from "../deps.ts";
import { learnerDay } from "../lib/days.ts";
import { LearnerTime } from "./context.ts";

/** How long a snapshot stands for a fresh build of the same request, in (dev) clock milliseconds. */
export const SNAPSHOT_MAX_AGE_MS = 3_600_000;
/** A shared folder's entries are removed this long (wall clock) after they were written. */
const PRUNE_AFTER_MS = 3 * SNAPSHOT_MAX_AGE_MS;
/** At most this many snapshots in a server's own folder (the least recently used goes first). */
export const SNAPSHOT_LIMIT = 64;
/** QA data that survives a seed (the build keeps it): never replaced from a snapshot. */
const KEPT_TABLES = new Set(["listen_marks"]);
const META = "meta.json";

interface SnapshotMeta {
  key: string;
  /** The dev clock's instant when the build finished. */
  builtAt: number;
  /** The seeded learner's calendar, to tell whether "today" is still the build's day. */
  timeZone: string;
  rolloverHour: number;
  result: DevSeedResult;
}

/** The cache key: the point as the planner reads it, every option of the request, the content and the schema. */
export function snapshotKey(d: Pick<AppDeps, "content" | "db">, body: DevSeedRequest): string {
  return JSON.stringify([
    body.point.trim().replace(/\s+/g, " ").toLowerCase(),
    body.gapDays ?? null,
    body.targetMinutes ?? null,
    body.practice ?? true,
    body.mic ?? true,
    body.recordings ?? true,
    d.content.contentVersion ?? "unbuilt",
    schemaVersion(d.db),
  ]);
}

export function seedCacheEnabled(): boolean {
  return process.env.OAK_SEED_CACHE !== "0";
}

const REPO = resolve(import.meta.dirname, "../../..");

/**
 * A hash of the code a seed runs (the server, the packages and the lockfile), so a shared folder never hands one
 * server's build to a server running other code.
 */
export function codeHash(root = REPO): string {
  const h = createHash("sha256");
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(abs);
      } else if (/\.(ts|tsx|json)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
        h.update(abs.slice(root.length));
        h.update(readFileSync(abs));
      }
    }
  };
  walk(join(root, "server", "src"));
  const packages = join(root, "packages");
  if (existsSync(packages)) for (const p of readdirSync(packages).sort()) walk(join(packages, p, "src"));
  const lock = join(root, "bun.lock");
  if (existsSync(lock)) h.update(readFileSync(lock));
  return h.digest("hex").slice(0, 16);
}

export class SeedCache {
  readonly root: string;
  readonly shared: boolean;
  readonly #code: string;
  #n = 0;
  /** Counts, for the tests. */
  readonly stats = { built: 0, restored: 0, expired: 0 };

  constructor(
    private readonly d: AppDeps,
    sharedDir: string | null = null,
    /** The code the snapshots in a shared folder were built by (default: this checkout's, `codeHash`). */
    code?: string,
  ) {
    this.shared = sharedDir !== null;
    this.root = sharedDir ?? join(d.config.dataDir, "dev-seed-cache");
    // A server's own folder starts empty; a shared one keeps what other servers built (it is keyed by their code).
    if (!this.shared) rmSync(this.root, { recursive: true, force: true });
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.#code = this.shared ? (code ?? codeHash()) : "own";
    if (this.shared) this.#prune();
  }

  #name(key: string): string {
    return createHash("sha256").update(`${this.#code}\n${key}`).digest("hex").slice(0, 32);
  }

  /** Every entry of `key`, newest first: `<name>-<builtAt>` folders. */
  #entries(key: string): { dir: string; meta: SnapshotMeta }[] {
    const prefix = `${this.#name(key)}-`;
    const out: { dir: string; meta: SnapshotMeta }[] = [];
    for (const f of readdirSync(this.root)) {
      if (!f.startsWith(prefix) || f.includes(".tmp")) continue;
      const dir = join(this.root, f);
      try {
        const meta = JSON.parse(readFileSync(join(dir, META), "utf8")) as SnapshotMeta;
        if (meta.key === key) out.push({ dir, meta });
      } catch {
        // Not an entry (yet): ignored.
      }
    }
    return out.sort((a, b) => b.meta.builtAt - a.meta.builtAt);
  }

  /** The newest snapshot of `key` that may stand for a fresh build now. */
  #usable(key: string): { dir: string; meta: SnapshotMeta } | null {
    const now = this.d.clock.now();
    for (const e of this.#entries(key)) {
      const { builtAt, timeZone, rolloverHour } = e.meta;
      const age = now.getTime() - builtAt;
      const sameDay =
        learnerDay(now, timeZone, rolloverHour) === learnerDay(new Date(builtAt), timeZone, rolloverHour);
      if (age >= 0 && age <= SNAPSHOT_MAX_AGE_MS && sameDay) return e;
    }
    return null;
  }

  /** A shared folder: entries written long ago (wall clock) and stray temporary folders go. */
  #prune(): void {
    const cutoff = Date.now() - PRUNE_AFTER_MS;
    for (const f of readdirSync(this.root)) {
      const dir = join(this.root, f);
      try {
        if (statSync(dir).mtimeMs < cutoff) rmSync(dir, { recursive: true, force: true });
      } catch {
        // Another server removed it first.
      }
    }
  }

  /** A server's own folder: at most SNAPSHOT_LIMIT entries, the least recently used removed first. */
  #cap(): void {
    if (this.shared) return;
    const all = readdirSync(this.root)
      .filter((f) => !f.includes(".tmp"))
      .map((f) => ({ dir: join(this.root, f), at: statSync(join(this.root, f)).mtimeMs }))
      .sort((a, b) => a.at - b.at);
    for (const e of all.slice(0, Math.max(0, all.length - SNAPSHOT_LIMIT + 1)))
      rmSync(e.dir, { recursive: true, force: true });
  }

  /** Seeds `body`: restores its snapshot when there is a usable one, else builds it with `build` and keeps one. */
  async seed(body: DevSeedRequest, build: () => Promise<DevSeedResult>): Promise<DevSeedResult> {
    const t0 = performance.now();
    const before = this.stats.restored;
    const out = await this.#seed(body, build);
    // `OAK_SEED_LOG=<file>`: one JSON line per seed (what was asked, built or restored, how long), to measure.
    const log = process.env.OAK_SEED_LOG?.trim();
    if (log)
      try {
        appendFileSync(
          log,
          `${JSON.stringify({
            key: snapshotKey(this.d, body),
            source: this.stats.restored > before ? "restored" : "built",
            ms: Math.round(performance.now() - t0),
          })}\n`,
        );
      } catch {
        /* measuring only */
      }
    return out;
  }

  async #seed(body: DevSeedRequest, build: () => Promise<DevSeedResult>): Promise<DevSeedResult> {
    const key = snapshotKey(this.d, body);
    const hit = this.#usable(key);
    if (hit !== null) {
      try {
        await this.restore(hit.dir);
        this.stats.restored++;
        // Least recently used: a restore counts as a use (own folder only; a shared entry is never touched).
        if (!this.shared) utimesSync(hit.dir, new Date(), new Date());
        const time = new LearnerTime(this.d.services.ctx);
        return {
          ...hit.meta.result,
          point: body.point,
          next: this.d.services.gates.nextMapItem(),
          day: time.day(),
        };
      } catch (e) {
        // The snapshot could not be read (removed under us): build instead, as without a cache.
        this.d.log(
          `dev seed: snapshot not restored, building (${e instanceof Error ? e.message : String(e)})`,
        );
      }
    } else if (this.#entries(key).length > 0) this.stats.expired++;
    const result = await build();
    this.#keep(key, result);
    this.stats.built++;
    return result;
  }

  /** Takes the snapshot of the learner as the build left it: written aside, then renamed into place. */
  #keep(key: string, result: DevSeedResult): void {
    // A server's own folder keeps one entry per key (no other server reads it).
    if (!this.shared) for (const e of this.#entries(key)) rmSync(e.dir, { recursive: true, force: true });
    this.#cap();
    const builtAt = this.d.clock.now().getTime();
    const final = join(this.root, `${this.#name(key)}-${builtAt}`);
    const tmp = `${final}.tmp-${process.pid}-${++this.#n}`;
    mkdirSync(tmp, { recursive: true, mode: 0o700 });
    try {
      const { audioDir, albumDir } = this.d.config;
      this.d.db.run("VACUUM INTO ?", [join(tmp, "oak.db")]);
      copyDir(audioDir, join(tmp, "audio"));
      copyDir(albumDir, join(tmp, "album"));
      const profile = this.d.repos.profile.get();
      const meta: SnapshotMeta = {
        key,
        builtAt,
        timeZone: profile.timezone,
        rolloverHour: profile.rolloverHour,
        result,
      };
      writeFileSync(join(tmp, META), JSON.stringify(meta));
      renameSync(tmp, final);
    } catch {
      // Another server wrote the same entry first (or the disk refused): the build stands without a snapshot.
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  /**
   * Replaces the learner with the snapshot in `dir`: every table (but the kept QA tables) in one transaction with the
   * append-only triggers dropped and recreated, then the audio and album folders.
   */
  async restore(dir: string): Promise<void> {
    const db = this.d.db;
    const names = tableNames(db).filter((t) => !KEPT_TABLES.has(t));
    const triggers = triggerDdl(db);
    // Read the audio first: a snapshot that cannot be read leaves the learner as it was.
    const staging = join(this.d.config.dataDir, `.seed-restore-${process.pid}`);
    rmSync(staging, { recursive: true, force: true });
    copyDir(join(dir, "audio"), join(staging, "audio"));
    copyDir(join(dir, "album"), join(staging, "album"));
    db.run("ATTACH DATABASE ? AS seed_snapshot", [join(dir, "oak.db")]);
    db.run("PRAGMA foreign_keys = OFF");
    try {
      db.transaction(() => {
        for (const t of triggers) db.run(`DROP TRIGGER IF EXISTS "${t.name}"`);
        for (const t of [...names].reverse()) db.run(`DELETE FROM main."${t}"`);
        for (const t of names) {
          const cols = (db.query(`PRAGMA main.table_info("${t}")`).all() as { name: string }[])
            .map((c) => `"${c.name}"`)
            .join(", ");
          db.run(`INSERT INTO main."${t}" (${cols}) SELECT ${cols} FROM seed_snapshot."${t}"`);
        }
        for (const t of triggers) db.run(t.sql);
        const fk = db.query("PRAGMA main.foreign_key_check").all();
        if (fk.length > 0) throw new Error("the seed snapshot's rows do not fit together (foreign keys)");
      }).immediate();
    } finally {
      db.run("PRAGMA foreign_keys = ON");
      db.run("DETACH DATABASE seed_snapshot");
    }
    const { audioDir, albumDir } = this.d.config;
    for (const [from, to] of [
      [join(staging, "audio"), audioDir],
      [join(staging, "album"), albumDir],
    ] as const) {
      rmSync(to, { recursive: true, force: true });
      if (existsSync(from)) renameSync(from, to);
      else mkdirSync(to, { recursive: true, mode: 0o700 });
    }
    rmSync(staging, { recursive: true, force: true });
    // The SRS adapter keeps the cards' recall for one second of the clock (`SrsAdapter.recall`); a build's writes
    // drop it, so a restore drops it too: one read at another instant replaces it.
    const srs = this.d.srs();
    const clock = this.d.devClock;
    if (srs !== null && clock !== null)
      await clock.at(new Date(this.d.clock.now().getTime() - 86_400_000), () => srs.recall(""));
  }
}

function copyDir(from: string, to: string): void {
  if (!existsSync(from)) return;
  cpSync(from, to, { recursive: true });
}

const caches = new WeakMap<AppDeps, SeedCache>();

/** The server's seed cache (one per server), or null when it is off. */
export function seedCacheOf(d: AppDeps): SeedCache | null {
  if (!seedCacheEnabled() || d.devClock === null) return null;
  let c = caches.get(d);
  if (c === undefined) {
    const shared = process.env.OAK_SEED_CACHE_DIR?.trim();
    c = new SeedCache(d, shared ? resolve(shared) : null);
    caches.set(d, c);
  }
  return c;
}
