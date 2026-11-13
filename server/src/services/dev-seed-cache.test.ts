// The dev seeder's snapshots (dev-seed-cache.ts): a repeated `POST /api/dev/seed` restores the build it was taken
// from, table by table and file by file; one test's writes never reach the next seed; another option set, another
// day, an hour later or new content never restores a snapshot; and the /dev/listen verdicts stay as the build keeps
// them. The real course, so the points carry sketches, album recordings and an own-audio file.
import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { DevSeedResult, SessionPlan } from "@oak/api";
import { loadContent } from "../content/loader.ts";
import type { ContentSource } from "../content/types.ts";
import { tableNames } from "../db/index.ts";
import { CONTENT_DIR } from "../testing/course.ts";
import { type Harness, harness } from "../testing/harness.ts";
import { buildSeed } from "./dev-seed.ts";
import {
  codeHash,
  SeedCache,
  SNAPSHOT_MAX_AGE_MS,
  seedCacheEnabled,
  seedCacheOf,
  snapshotKey,
} from "./dev-seed-cache.ts";

setDefaultTimeout(120_000);

let real: ContentSource;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
});

const NOW = "2026-11-13T12:00:00.000Z";
let h: Harness | null = null;
afterEach(async () => {
  await h?.close();
  h = null;
});

async function server(): Promise<Harness> {
  h = await harness({ dev: true, content: real, now: NOW });
  return h;
}

async function seed(x: Harness, body: Record<string, unknown>): Promise<DevSeedResult> {
  const r = await x.json<DevSeedResult>("POST", "/api/dev/seed", body);
  if (r.status !== 200)
    throw new Error(`seed ${JSON.stringify(body)} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Every row of every table (sorted, so the order rows were written in does not count), and every audio file. */
function learner(x: Harness, opts: { listen?: boolean } = {}): Record<string, unknown> {
  const db = x.server.deps.db;
  const out: Record<string, unknown> = {};
  for (const t of tableNames(db)) {
    if (t === "listen_marks" && opts.listen !== true) continue;
    out[t] = (db.query(`SELECT * FROM "${t}"`).all() as Record<string, unknown>[])
      .map((r) => JSON.stringify(r, (_k, v) => (v instanceof Uint8Array ? [...v] : v)))
      .sort();
  }
  const { audioDir, albumDir } = x.server.deps.config;
  out["files:audio"] = files(audioDir);
  out["files:album"] = files(albumDir);
  return out;
}

function files(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out[relative(dir, abs)] = createHash("sha256").update(readFileSync(abs)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

function backups(x: Harness): string[] {
  const dir = x.server.deps.config.backupsDir;
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith("pre-reset")) : [];
}

const cache = (x: Harness) => {
  const c = seedCacheOf(x.server.deps);
  if (c === null) throw new Error("the seed cache is off");
  return c;
};

describe("dev seed snapshots", () => {
  test("a repeated seed restores the build it was taken from, table by table and file by file", async () => {
    const x = await server();
    // A point with an own-audio recording (audio/) and one with released album tracks and their recordings (album/).
    for (const point of ["own-audio project", "C2 released"]) {
      const built = await seed(x, { point });
      const atBuild = learner(x);
      expect(
        Object.keys(atBuild["files:audio"] as object).length +
          Object.keys(atBuild["files:album"] as object).length,
      ).toBeGreaterThan(0);
      const plan = (await x.json<SessionPlan>("GET", "/api/session/today")).body;
      await seed(x, { point: "after U03.L02" });
      expect(learner(x)).not.toEqual(atBuild);
      const before = { ...cache(x).stats };
      const backupsBefore = backups(x).length;
      const restored = await seed(x, { point });
      expect(cache(x).stats.restored).toBe(before.restored + 1);
      expect(cache(x).stats.built).toBe(before.built);
      expect(learner(x)).toEqual(atBuild);
      expect(restored).toEqual(built);
      expect((await x.json<SessionPlan>("GET", "/api/session/today")).body).toEqual(plan);
      // A restore makes no pre-reset safety copy (a build does).
      expect(backups(x).length).toBe(backupsBefore);
    }
  });

  test("one test's writes never reach the next seed; the /dev/listen verdicts stay", async () => {
    const x = await server();
    await seed(x, { point: "own-audio project" });
    const atBuild = learner(x);
    // What a test does after its seed: a sketch, a profile change, an uploaded recording, a whole lesson session.
    expect(
      (
        await x.json("POST", "/api/sketches", {
          title: "A test's sketch",
          originKind: "free",
          originId: null,
          code: 'drums: s("bd")',
          bpm: 100,
          meter: "4/4",
          key: { tonic: "C", mode: "major" },
          analysis: null,
          note: null,
          tutorAssisted: false,
          band: null,
          flags: { lockedTools: [], previewTools: [] },
          ranOk: true,
          sessionId: null,
        })
      ).status,
    ).toBe(200);
    expect((await x.json("PUT", "/api/profile", { targetMinutes: 25, quiet: true })).status).toBe(200);
    const plan = (await x.json<SessionPlan>("GET", "/api/session/today")).body;
    expect(
      (
        await x.json("POST", "/api/session/start", {
          kind: plan.kind,
          mapItemId: plan.mapItemId,
          targetMinutes: 20,
        })
      ).status,
    ).toBe(200);
    expect(
      (await x.json("PUT", "/api/dev/listen/tb.example%2F1", { verdict: "ok", hash: "h1", note: "" })).status,
    ).toBe(200);
    const marks = learner(x, { listen: true }).listen_marks;
    expect(learner(x)).not.toEqual(atBuild);

    await seed(x, { point: "own-audio project" });
    expect(cache(x).stats.restored).toBe(1);
    expect(learner(x)).toEqual(atBuild);
    // The QA verdict made after the build is kept, as a build keeps it.
    expect(learner(x, { listen: true }).listen_marks).toEqual(marks);
    expect((marks as string[]).length).toBe(1);
  });

  test("another option set, a new day, an hour later or a clock moved back builds again", async () => {
    const x = await server();
    await seed(x, { point: "after U03.L02" });
    await seed(x, { point: "after U03.L02", mic: false });
    await seed(x, { point: "after U03.L02", gapDays: 4 });
    await seed(x, { point: "after U03.L02", targetMinutes: 25 });
    await seed(x, { point: "after U03.L02", practice: false });
    expect(cache(x).stats).toEqual({ built: 5, restored: 0, expired: 0 });
    const quiet = (await x.json<{ inputKind: string }>("GET", "/api/profile")).body;
    // The same options in another spelling are the same request.
    await seed(x, { point: "  After  U03.L02 ", practice: false });
    expect(cache(x).stats.restored).toBe(1);
    expect(quiet.inputKind).toBe("builtin");

    // Within the hour: restored. Past the hour: built again.
    x.clock.advance(SNAPSHOT_MAX_AGE_MS - 60_000);
    await seed(x, { point: "after U03.L02" });
    expect(cache(x).stats.restored).toBe(2);
    x.clock.advance(120_000);
    await seed(x, { point: "after U03.L02" });
    expect(cache(x).stats).toMatchObject({ built: 6, restored: 2, expired: 1 });
    // The dev clock moved back past the build: built again.
    await x.json("PUT", "/api/dev/clock", { advanceMs: -600_000 });
    await seed(x, { point: "after U03.L02" });
    expect(cache(x).stats).toMatchObject({ built: 7, expired: 2 });
    // A new learner day (the 04:00 rollover passed): built again, and the learner's yesterday is the new one.
    await x.json("PUT", "/api/dev/clock", { reset: true });
    await seed(x, { point: "after U03.L02" });
    x.clock.set("2026-11-14T12:00:00.000Z");
    const next = await seed(x, { point: "after U03.L02" });
    expect(cache(x).stats).toMatchObject({ expired: 3 });
    expect(next.lastActiveDay).not.toBe(null);
    expect(next.day > (next.lastActiveDay as string)).toBe(true);
  });

  test("the key holds every option, the content version and the schema version", async () => {
    const x = await server();
    const d = x.server.deps;
    const base = snapshotKey(d, { point: "after U03.L02" });
    expect(snapshotKey(d, { point: "AFTER u03.l02" })).toBe(base);
    for (const body of [
      { point: "after U03.L03" },
      { point: "after U03.L02", mic: false },
      { point: "after U03.L02", gapDays: 0 },
      { point: "after U03.L02", targetMinutes: 20 as const },
      { point: "after U03.L02", practice: false },
      { point: "after U03.L02", recordings: false },
    ])
      expect(snapshotKey(d, body)).not.toBe(base);
    expect(base).toContain(JSON.stringify(d.content.contentVersion));
    expect(
      snapshotKey(
        { ...d, content: { ...d.content, contentVersion: "other" } as never },
        { point: "after U03.L02" },
      ),
    ).not.toBe(base);
  });

  test("an unknown point answers 400 and leaves the learner as it was", async () => {
    const x = await server();
    await seed(x, { point: "after U03.L02" });
    const atBuild = learner(x);
    const r = await x.json("POST", "/api/dev/seed", { point: "after U99.L99" });
    expect(r.status).toBe(400);
    expect(learner(x)).toEqual(atBuild);
  });

  test("snapshots live under the data dir and are capped; OAK_SEED_CACHE=0 turns them off", async () => {
    const x = await server();
    await seed(x, { point: "after U01.L03" });
    const root = join(x.server.deps.config.dataDir, "dev-seed-cache");
    expect(readdirSync(root).length).toBe(1);
    expect(statSync(join(root, readdirSync(root)[0] as string, "oak.db")).size).toBeGreaterThan(0);
    expect(seedCacheEnabled()).toBe(true);
    const saved = process.env.OAK_SEED_CACHE;
    process.env.OAK_SEED_CACHE = "0";
    try {
      expect(seedCacheEnabled()).toBe(false);
      expect(seedCacheOf(x.server.deps)).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.OAK_SEED_CACHE;
      else process.env.OAK_SEED_CACHE = saved;
    }
  });

  test("a production server (no OAK_DEV) has no seed and no snapshots", async () => {
    const p = await harness({ content: real, now: NOW });
    try {
      expect(seedCacheOf(p.server.deps)).toBeNull();
      const r = await p.json("POST", "/api/dev/seed", { point: "after U03.L02" });
      expect(r.status).not.toBe(200);
      expect(existsSync(join(p.server.deps.config.dataDir, "dev-seed-cache"))).toBe(false);
    } finally {
      await p.close();
    }
  });

  test("a shared folder (OAK_SEED_CACHE_DIR): one server's build is another's restore, for the same code only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oak-seed-shared-"));
    const a = await harness({ dev: true, content: real, now: NOW });
    const b = await harness({ dev: true, content: real, now: NOW });
    try {
      const body = { point: "own-audio project" };
      const ca = new SeedCache(a.server.deps, dir, "code-1");
      const built = await ca.seed(body, () => buildSeed(a.server.deps, body));
      const atBuild = learner(a);
      // The second server, the same code: restored, the same learner table by table and file by file.
      const cb = new SeedCache(b.server.deps, dir, "code-1");
      const restored = await cb.seed(body, () => buildSeed(b.server.deps, body));
      expect(cb.stats).toEqual({ built: 0, restored: 1, expired: 0 });
      expect(learner(b)).toEqual(atBuild);
      expect(restored).toEqual(built);
      // Other code: never another server's build.
      const other = new SeedCache(b.server.deps, dir, "code-2");
      await other.seed(body, () => buildSeed(b.server.deps, body));
      expect(other.stats).toEqual({ built: 1, restored: 0, expired: 0 });
      // Entries are folders renamed into place (no temporary folder left), one per code.
      const entries = readdirSync(dir);
      expect(entries.some((f) => f.includes(".tmp"))).toBe(false);
      expect(entries.length).toBe(2);
      // A shared folder is kept when a server starts using it; entries written long ago are removed.
      const old = new Date(Date.now() - 4 * SNAPSHOT_MAX_AGE_MS);
      utimesSync(join(dir, entries[0] as string), old, old);
      new SeedCache(a.server.deps, dir, "code-1");
      expect(readdirSync(dir).length).toBe(1);
    } finally {
      await a.close();
      await b.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the code hash of a checkout is stable", () => {
    const h1 = codeHash();
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    expect(codeHash()).toBe(h1);
  });
});
