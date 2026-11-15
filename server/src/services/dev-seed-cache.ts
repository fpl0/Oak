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
// of the requesting server's clock after its build. A build's history hangs on the instant it was made at (item k at
// that time of day, k days back), so a build holds the clock at one instant, and a restore made later moves every
// instant of the learner later by the time that has passed (`shiftInstants`): the restored learner is the one a fresh
// build at the restoring instant makes — the same minutes since each review, the same recall — and never one who
// waited up to an hour longer. Due dates stay where they are: they are the first instant of a learner day, and the
// day is the same. The /dev/listen verdicts are not the learner's: they stay as they are, as the build keeps them.
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
import { type Db, schemaVersion, tableNames } from "../db/index.ts";
import { triggerDdl } from "../db/migrate.ts";
import type { AppDeps } from "../deps.ts";
import { learnerDay } from "../lib/days.ts";
import { LearnerTime } from "./context.ts";
import { seededNext } from "./dev-seed.ts";

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
  /** The dev clock's instant the build was made at (the clock is held there while it builds). */
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

  /** The newest snapshot of `key` that may stand for a fresh build at `now`. */
  #usable(key: string, now: Date): { dir: string; meta: SnapshotMeta } | null {
    for (const e of this.#entries(key)) {
      const { builtAt, timeZone, rolloverHour } = e.meta;
      const age = now.getTime() - builtAt;
      const sameDay =
        learnerDay(now, timeZone, rolloverHour) === learnerDay(new Date(builtAt), timeZone, rolloverHour);
      // A build made on the very first instant of a day has events that look like due dates: never restored later.
      const movable = age === 0 || !isDayStart(builtAt, timeZone, rolloverHour);
      if (age >= 0 && age <= SNAPSHOT_MAX_AGE_MS && sameDay && movable) return e;
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
    // The instant this seed stands for: a build is made at it, a restore is moved to it.
    const now = this.d.clock.now();
    const hit = this.#usable(key, now);
    if (hit !== null) {
      try {
        const { builtAt, timeZone, rolloverHour } = hit.meta;
        await this.restore(hit.dir, { ms: now.getTime() - builtAt, timeZone, rolloverHour });
        this.stats.restored++;
        // Least recently used: a restore counts as a use (own folder only; a shared entry is never touched).
        if (!this.shared) utimesSync(hit.dir, new Date(), new Date());
        const time = new LearnerTime(this.d.services.ctx);
        return {
          ...hit.meta.result,
          point: body.point,
          next: seededNext(this.d),
          day: time.day(),
        };
      } catch (e) {
        // The snapshot could not be read (removed under us): build instead, as without a cache.
        this.d.log(
          `dev seed: snapshot not restored, building (${e instanceof Error ? e.message : String(e)})`,
        );
      }
    } else if (this.#entries(key).length > 0) this.stats.expired++;
    // The clock is held at `now` while the seed builds, so the whole history hangs on that one instant and a later
    // restore can be moved by exactly the time that has passed.
    const clock = this.d.devClock;
    const result = clock === null ? await build() : await clock.at(now, build);
    this.#keep(key, result, now.getTime());
    this.stats.built++;
    return result;
  }

  /** Takes the snapshot of the learner as the build made at `builtAt` left it: written aside, then renamed into place. */
  #keep(key: string, result: DevSeedResult, builtAt: number): void {
    // A server's own folder keeps one entry per key (no other server reads it).
    if (!this.shared) for (const e of this.#entries(key)) rmSync(e.dir, { recursive: true, force: true });
    this.#cap();
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
   * append-only triggers dropped and recreated, then the audio and album folders. `later` moves the learner's instants
   * by the time that has passed since the build (`shiftInstants`).
   */
  async restore(dir: string, later: SnapshotAge | null = null): Promise<void> {
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
        if (later !== null && later.ms !== 0) shiftInstants(db, names, later);
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

/** How much later than its build a snapshot is restored, and the seeded learner's calendar. */
export interface SnapshotAge {
  ms: number;
  timeZone: string;
  rolloverHour: number;
}

const INSTANT = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g;

/** The first instant of a learner day (the rollover): what a due date is snapped to (packages/srs `schedule`). */
function isDayStart(ms: number, timeZone: string, rolloverHour: number): boolean {
  return (
    learnerDay(new Date(ms), timeZone, rolloverHour) !== learnerDay(new Date(ms - 1), timeZone, rolloverHour)
  );
}

/**
 * Moves every instant stored in `tables` (a column's value, or inside its JSON) `later.ms` later, as a build made
 * that much later writes it: every event of a build is a whole number of days before the instant it was made at.
 * Instants on the first instant of a learner day stay: they are due dates snapped to the rollover, and a build made
 * later on the same day snaps them to the same instant. An instant that would move to another learner day throws
 * (the caller builds instead): the day columns beside it would no longer be its day.
 */
export function shiftInstants(db: Db, tables: readonly string[], later: SnapshotAge): void {
  const { ms, timeZone, rolloverHour } = later;
  const moved = new Map<string, string>();
  const move = (iso: string): string => {
    let out = moved.get(iso);
    if (out === undefined) {
      const t = Date.parse(iso);
      if (isDayStart(t, timeZone, rolloverHour)) out = iso;
      else {
        const to = new Date(t + ms);
        if (learnerDay(new Date(t), timeZone, rolloverHour) !== learnerDay(to, timeZone, rolloverHour))
          throw new Error("the seed snapshot's history would move to another learner day");
        out = to.toISOString();
      }
      moved.set(iso, out);
    }
    return out;
  };
  for (const t of tables) {
    const cols = (
      db.query(`PRAGMA main.table_info("${t}")`).all() as { name: string; type: string }[]
    ).filter((c) => !/INT|REAL|FLOA|DOUB|BLOB/i.test(c.type));
    for (const c of cols) {
      const rows = db
        .query(
          `SELECT rowid AS r, "${c.name}" AS v FROM main."${t}" WHERE "${c.name}" LIKE '%-__T__:__:__.___Z%'`,
        )
        .all() as { r: number; v: unknown }[];
      if (rows.length === 0) continue;
      const put = db.query(`UPDATE main."${t}" SET "${c.name}" = ? WHERE rowid = ?`);
      for (const row of rows) {
        if (typeof row.v !== "string") continue;
        const v = row.v.replace(INSTANT, move);
        if (v !== row.v) put.run(v, row.r);
      }
    }
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
