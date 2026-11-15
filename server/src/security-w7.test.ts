// review:security (Wave 7): the server-side regression tests of the defensive review of Oak as it ships.
//  - `GET /album/tracks/:id/versions/:v/source` (the offline renderer's input) never hands out code from an imported
//    backup that fails the strict lint: the renderer reads that code with the base lint only (contracts §11.3, §11.10).
//  - The app's /dev/* screens are not served by the production server without OAK_DEV (contracts §11.1 rule 7).
//  - The Wave 7 routes sit behind the same Host, Origin and X-Oak rules as every other route (§11.1).
//  - A hostile backup writes nothing outside the data folder (§11.10).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Album } from "@oak/api";
import { createServer, type OakServer } from "./app.ts";
import { fixtureContent } from "./content/fixture.ts";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { readZip, writeZip } from "./lib/zip.ts";
import { sha256 } from "./services/audio-store.ts";
import { isDevScreen } from "./static.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { type Harness, harness } from "./testing/harness.ts";

const NOW = "2026-11-15T12:00:00.000Z";
const URL0 = "http://127.0.0.1:8787";

/** A strict-lint escape that the base lint (the learner's own typing) lets through: the DOM from a canvas. */
const HOSTILE =
  'const d = getDrawContext().canvas.ownerDocument\n$: s("bd*4").fmap(v => d.body.append(d.createElement("script")) && v)';
/** Code the learner may type (a loop is base-legal) but the strict profile refuses. */
const LEARNER_ONLY = 'let n = 0\nfor (const x of [1, 2]) n = n + x\n$: s("bd*4").gain(0.8)';

describe("album.source: imported code reaches the offline renderer only after the strict lint", () => {
  let real: ContentSource;
  let h: Harness;
  let track: { id: string; sketchId: string; sketchVersion: number };
  beforeAll(async () => {
    real = await loadContent({ contentDir: CONTENT_DIR });
    h = await harness({ dev: true, content: real, now: NOW });
    await h.json("PUT", "/api/profile", { timezone: "UTC" });
    const seed = await h.json("POST", "/api/dev/seed", { point: "JC1 released", practice: false });
    if (seed.status !== 200) throw new Error(`seed: ${seed.status} ${JSON.stringify(seed.body)}`);
    const album = await h.json<Album>("GET", "/api/album");
    const t = album.body.tracks.find((x) => x.capstoneId === "JC1");
    if (!t) throw new Error("no JC1 track");
    const v = h.server.deps.repos.album.version(t.id, 1);
    if (!v) throw new Error("no version 1");
    track = { id: t.id, sketchId: v.sketchId, sketchVersion: v.sketchVersion };
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  });

  const setCode = (code: string) =>
    h.server.deps.db.run("UPDATE sketch_versions SET code = ? WHERE sketch_id = ? AND version = ?", [
      code,
      track.sketchId,
      track.sketchVersion,
    ]);
  const source = () => h.json<{ code?: string }>("GET", `/api/album/tracks/${track.id}/versions/1/source`);

  test("the learner's own version is handed out whatever it types (the base lint is the renderer's)", async () => {
    setCode(LEARNER_ONLY);
    const r = await source();
    expect(r.status).toBe(200);
    expect(r.body.code).toBe(LEARNER_ONLY);
  });

  test("after an import, a version that fails the strict lint is refused; one that passes is handed out", async () => {
    const exp = await h.req("GET", "/api/backup/export?audio=0");
    expect(exp.status).toBe(200);
    const archive = new Uint8Array(await exp.arrayBuffer());
    const imp = await h.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
    expect(imp.status).toBe(200);
    // Every imported version is flagged for review (backup.ts markForReview).
    expect(
      h.server.deps.repos.sketches.version(track.sketchId, track.sketchVersion)?.flags.reviewBeforeRun,
    ).toBe(true);
    for (const bad of [HOSTILE, LEARNER_ONLY]) {
      setCode(bad);
      const r = await source();
      expect([bad, r.status]).toEqual([bad, 409]);
      expect(JSON.stringify(r.body)).not.toContain("getDrawContext");
    }
    // Three right answers: strict-clean pieces still export after an import.
    for (const good of [
      'setcpm(90/4)\n$: note("c4 e4 g4 b4").s("piano")',
      '$: s("bd ~ sd ~, hh*8").bank("RolandTR909")',
      'const chords = "<Dm7 G7 C^7>"\n$: chord(chords).voicing().s("piano").room(0.3)',
    ]) {
      setCode(good);
      const r = await source();
      expect([good, r.status]).toEqual([good, 200]);
      expect(r.body.code).toBe(good);
    }
  });
});

describe("the app's /dev screens exist only with OAK_DEV (contracts §11.1 rule 7)", () => {
  test("isDevScreen sees every spelling the router or a case-insensitive disk forgives", () => {
    for (const p of ["/dev", "/dev/qa", "/DEV/qa", "/%64ev/qa", "//dev/telemetry", "/Dev/"])
      expect([p, isDevScreen(p)]).toEqual([p, true]);
    for (const p of ["/", "/devices", "/studio", "/oak", "/album/dev", "/develop"])
      expect([p, isDevScreen(p)]).toEqual([p, false]);
  });

  async function distServer(dev: boolean): Promise<{ s: OakServer; close: () => Promise<void> }> {
    const h = await harness();
    const config = { ...h.server.deps.config, serveDist: true, dev, dbPath: ":memory:" };
    mkdirSync(config.distDir, { recursive: true });
    writeFileSync(join(config.distDir, "index.html"), "<!doctype html><title>Oak</title>");
    const s = await createServer({
      config,
      content: fixtureContent(),
      graders: { learner: () => h.learner, tutor: () => h.tutorHost },
      tutor: false,
      env: {},
      log: () => {},
      startup: false,
    });
    return {
      s,
      close: async () => {
        await s.close();
        await h.close();
      },
    };
  }

  test("production: /dev/* is 404 (not the app document); every other route still gets the app", async () => {
    const { s, close } = await distServer(false);
    try {
      for (const p of ["/dev/qa", "/dev/telemetry", "/DEV/listen", "/%64ev/qa", "/dev"]) {
        const res = await s.app.request(`${URL0}${p}`, { headers: { host: "127.0.0.1:8787" } });
        expect([p, res.status]).toEqual([p, 404]);
        expect(await res.text()).not.toContain("<title>Oak</title>");
      }
      for (const p of ["/", "/studio", "/oak", "/album/x"]) {
        const res = await s.app.request(`${URL0}${p}`, { headers: { host: "127.0.0.1:8787" } });
        expect([p, res.status]).toEqual([p, 200]);
        expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      }
    } finally {
      await close();
    }
  });

  test("dev: the /dev screens are served", async () => {
    const { s, close } = await distServer(true);
    try {
      const res = await s.app.request(`${URL0}/dev/qa`, { headers: { host: "127.0.0.1:8787" } });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>Oak</title>");
    } finally {
      await close();
    }
  });
});

describe("the Wave 7 routes are behind §11.1 like every other route", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await harness({ content: fixtureContent(), now: NOW });
  });
  afterAll(async () => {
    await h?.close();
  });
  const routes: [string, string, unknown?][] = [
    ["GET", "/api/tracks/focus"],
    ["PUT", "/api/tracks/focus", { focus: "J" }],
    ["GET", "/api/course/whole"],
    ["GET", "/api/album/tracks/x/versions/1/source"],
  ];

  test("a rebinding Host, a missing X-Oak, a foreign Origin and a cross-site fetch are each refused", async () => {
    for (const [method, path, body] of routes) {
      const send = (headers: Record<string, string>) =>
        h.server.app.request(`${URL0}${path}`, {
          method,
          headers: { "content-type": "application/json", ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const ok = { host: "127.0.0.1:8787", origin: URL0, "x-oak": "1", "sec-fetch-site": "same-origin" };
      const cases: [string, Record<string, string>][] = [
        ["host", { ...ok, host: "rebind.example:8787" }],
        ["x-oak", { host: ok.host, origin: ok.origin, "sec-fetch-site": "same-origin" }],
        ["origin", { ...ok, origin: "http://evil.example" }],
        ["fetch-site", { ...ok, "sec-fetch-site": "cross-site" }],
      ];
      for (const [why, headers] of cases) {
        const res = await send(headers);
        expect([method, path, why, res.status]).toEqual([method, path, why, 403]);
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
      }
      if (method !== "GET") {
        const { origin: _o, ...noOrigin } = ok;
        const res = await send(noOrigin);
        expect([method, path, "no origin", res.status]).toEqual([method, path, "no origin", 403]);
      }
      const pre = await h.server.app.request(`${URL0}${path}`, {
        method: "OPTIONS",
        headers: { host: ok.host },
      });
      expect([path, "preflight", pre.status]).toEqual([path, "preflight", 403]);
    }
  });
});

describe("restore: a hostile .oakbackup writes nothing outside the data folder (contracts §11.10)", () => {
  test("traversal paths in the manifest or the archive, and __proto__ keys, change nothing", async () => {
    const h = await harness({ now: NOW });
    try {
      const exp = await h.req("GET", "/api/backup/export?audio=0");
      const files = readZip(new Uint8Array(await exp.arrayBuffer()));
      const manifest = JSON.parse(new TextDecoder().decode(files.get("backup.json"))) as Record<
        string,
        unknown
      >;
      const enc = new TextEncoder();
      const bytes = enc.encode("RIFF");
      const outside = join(h.dir, "..", `oak-escape-${process.pid}.wav`);
      const tryImport = async (entries: { name: string; data: Uint8Array }[]) =>
        (await h.destructive("POST", "/api/backup/import", "backup.import", "*", writeZip(entries))).status;
      for (const path of [
        `audio/../../oak-escape-${process.pid}.wav`,
        `album/../../../oak-escape/v1.wav`,
        `album/x/../../v1.wav`,
        "/etc/oak-escape.wav",
        `audio\\..\\..\\oak-escape.wav`,
      ]) {
        const m = { ...manifest, files: [{ path, bytes: bytes.length, sha256: sha256(bytes) }] };
        const status = await tryImport([
          { name: "backup.json", data: enc.encode(JSON.stringify(m)) },
          { name: path, data: bytes },
        ]);
        expect([path, status]).toEqual([path, 400]);
      }
      expect(existsSync(outside)).toBe(false);
      // An entry the manifest does not list is never written, whatever its name.
      const ok = await tryImport([
        { name: "backup.json", data: enc.encode(JSON.stringify(manifest)) },
        { name: `../oak-escape-${process.pid}.wav`, data: bytes },
      ]);
      expect(ok).toBe(200);
      expect(existsSync(outside)).toBe(false);
      // `__proto__` keys in backup.json are data, never the prototype of anything.
      const proto = `{"__proto__":{"polluted":1},${JSON.stringify(manifest).slice(1, -1)},"tables":{"__proto__":{"x":1},${JSON.stringify(manifest.tables).slice(1)}}`;
      expect(
        await tryImport([{ name: "backup.json", data: enc.encode(proto) }]).then((s) =>
          [200, 400].includes(s),
        ),
      ).toBe(true);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).x).toBeUndefined();
    } finally {
      await h.close();
    }
  });
});
