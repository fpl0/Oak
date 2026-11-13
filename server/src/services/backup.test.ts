import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tableNames } from "../db/index.ts";
import { crc32, readZip, writeZip, ZipError } from "../lib/zip.ts";
import { BROWSER, gradeResult, type Harness, harness } from "../testing/harness.ts";
import { dailyBackup, KEEP_DAILY, lastAutomatic } from "./backup.ts";

const wav = (() => {
  const n = 400;
  const b = new Uint8Array(44 + n * 2);
  const v = new DataView(b.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i);
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + 2 * i, (i * 37) % 2000, true);
  return b;
})();

describe("zip", () => {
  test("CRC-32 of a known string", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  test("round trip, and damage is detected", () => {
    const entries = [
      { name: "backup.json", data: new TextEncoder().encode('{"a":1}') },
      { name: "audio/x.wav", data: wav },
    ];
    const zip = writeZip(entries);
    const back = readZip(zip);
    expect([...back.keys()]).toEqual(["backup.json", "audio/x.wav"]);
    expect(back.get("audio/x.wav")).toEqual(wav);
    const bad = zip.slice();
    bad[43] = (bad[43] ?? 0) ^ 0xff; // header 30 + name 11: byte 43 is entry data
    expect(() => readZip(bad)).toThrow(ZipError);
    expect(() => readZip(new TextEncoder().encode("not a zip at all, sorry"))).toThrow(ZipError);
  });
});

let a: Harness;
let b: Harness;
beforeEach(async () => {
  a = await harness();
  b = await harness();
});
afterEach(async () => {
  await a.close();
  await b.close();
});

async function seed(h: Harness): Promise<{ audioId: string; trackId: string }> {
  h.server.deps.repos.profile.patch({ displayName: "Filipe", weeklyGoal: 4, timezone: "UTC" });
  const sk = await h.json<{ sketch: { id: string } }>("POST", "/api/sketches", {
    title: "Groove",
    originKind: "lesson-make",
    originId: "U01.L01",
    sessionId: null,
    code: 's("bd ~ sd hh")',
    bpm: 96,
    meter: "4/4",
    key: { tonic: "C", mode: "major" },
    analysis: null,
    note: "first",
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: true,
  });
  await h.json("POST", "/api/lessons/U01.L01/complete", {
    sessionId: null,
    sketchId: sk.body.sketch.id,
    lessonVersion: 1,
    contentHash: "h",
    splitPart: null,
  });
  await h.server.deps.services.course.attempt("U01.L02", "S2", {
    sessionId: null,
    exerciseId: "rest-on-three",
    exerciseVersion: 1,
    seriesNo: 0,
    params: null,
    response: { code: "x" },
    result: gradeResult({ exerciseId: "U01.L02/rest-on-three" }),
    extraReplays: 0,
    activeMs: 1,
    tutorAssisted: false,
  });
  const audio = await h.json<{ id: string }>("POST", "/api/audio?name=take.wav", wav, {
    "content-type": "audio/wav",
  });
  await h.req("PUT", `/api/audio/${audio.body.id}/peaks`, new Uint8Array([9, 9, 9]));
  const track = await h.json<{ id: string }>("POST", "/api/album/tracks", {
    capstoneId: null,
    side: "Bside",
    title: "B1",
    flavour: null,
    sketchId: sk.body.sketch.id,
    sketchVersion: 1,
    linerNotesMd: "notes",
    theoryTags: [],
    attribution: null,
  });
  await h.req("PUT", `/api/album/tracks/${track.body.id}/versions/1/audio`, wav, {
    "content-type": "audio/wav",
  });
  // Tutor history is append-only: the import must carry it across its triggers.
  const repos = h.server.deps.repos;
  repos.tutor.createConversation({
    id: "lesson:U01.L02:2026-11-11:chat",
    key: { subjectKind: "lesson", subjectId: "U01.L02", day: "2026-11-11", lane: "chat" },
    effort: "medium",
    prefixVersion: "p1",
    model: "claude-opus-5-5",
    at: "2026-11-11T12:00:00.000Z",
  });
  repos.tutor.append(
    "lesson:U01.L02:2026-11-11:chat",
    {
      role: "user",
      kind: "chat",
      text: "Why a rest?",
      learnerCode: null,
      cardIds: [],
      review: null,
      stepId: null,
      rung: null,
      summary: null,
      backend: null,
      excluded: false,
      errorKind: null,
    },
    new Date("2026-11-11T12:00:01.000Z"),
  );
  return { audioId: audio.body.id, trackId: track.body.id };
}

function dump(h: Harness): Record<string, unknown[]> {
  const db = h.server.deps.db;
  return Object.fromEntries(tableNames(db).map((t) => [t, db.query(`SELECT * FROM "${t}"`).all()]));
}

describe("backup", () => {
  test("export → import round trip with audio; secrets never included", async () => {
    const { audioId, trackId } = await seed(a);
    a.server.deps.secrets.savePasted(`sk-ant-secret-${"z".repeat(30)}`);
    const info = await a.json<{ bytesWithAudio: number; bytesWithoutAudio: number }>("GET", "/api/backup");
    expect(info.body.bytesWithAudio).toBeGreaterThan(info.body.bytesWithoutAudio + 2 * wav.length);
    const res = await a.req("GET", "/api/backup/export?audio=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(".oakbackup");
    const archive = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(archive)).not.toContain("sk-ant-secret");
    const files = readZip(archive);
    expect([...files.keys()].sort()).toEqual(
      ["backup.json", `audio/${audioId}.peaks`, `audio/${audioId}.wav`, `album/${trackId}/v1.wav`].sort(),
    );

    expect((await b.req("POST", "/api/backup/import", archive)).status).toBe(428);
    const imported = await b.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
    expect(imported.status).toBe(200);
    const result = (await imported.json()) as {
      tables: number;
      rows: number;
      audioFiles: number;
      migratedFrom: null;
      safetyCopy: string;
    };
    expect(result.audioFiles).toBe(3);
    expect(result.migratedFrom).toBeNull();
    expect(existsSync(result.safetyCopy)).toBe(true);
    // Imported code is flagged for the strict lint before its first run (§11.3); everything else is equal.
    const flagged = dump(b);
    for (const t of ["sketch_versions", "album_track_versions"]) {
      const rows = flagged[t] as { flags_json: string }[];
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(JSON.parse(r.flags_json)).toMatchObject({ reviewBeforeRun: true });
        const { reviewBeforeRun: _, ...rest } = JSON.parse(r.flags_json) as Record<string, unknown>;
        r.flags_json = JSON.stringify(rest);
      }
    }
    // Wave 5 (c2): imported transcription versions and typed lesson attempts carry the review marks too.
    for (const r of (flagged.transcription_versions ?? []) as { review_before_run: number }[]) {
      expect(r.review_before_run).toBe(1);
      r.review_before_run = 0;
    }
    for (const r of (flagged.step_attempts ?? []) as { imported: number; code: string | null }[]) {
      expect(r.imported).toBe(r.code === null ? 0 : 1);
      r.imported = 0;
    }
    expect(flagged).toEqual(dump(a));
    const sketch = await b.json<{ versions: { flags: { reviewBeforeRun?: boolean } }[] }>(
      "GET",
      `/api/sketches/${(flagged.sketches as { id: string }[])[0]?.id}`,
    );
    expect(sketch.body.versions[0]?.flags.reviewBeforeRun).toBe(true);
    // Triggers are back: history is still append-only after the import.
    expect(() => b.server.deps.db.run("DELETE FROM tutor_messages")).toThrow(/append-only/);
    expect(() => b.server.deps.db.run("DELETE FROM unlocks")).toThrow(/never deleted/);
    // Audio is served from the new data directory.
    const media = { host: "127.0.0.1:8787", "sec-fetch-site": "same-origin" };
    const got = await b.server.app.request(`http://127.0.0.1:8787/api/audio/${audioId}`, { headers: media });
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(wav);
    const track = await b.server.app.request(
      `http://127.0.0.1:8787/api/album/tracks/${trackId}/versions/1/audio`,
      { headers: media },
    );
    expect(track.status).toBe(200);
    expect(b.server.deps.secrets.source()).toBe("none");
  });

  test("import moves the replaced learner's unreferenced audio beside the safety copy", async () => {
    // a has no audio at all: everything b recorded becomes unreferenced.
    const old = await seed(b);
    const archive = new Uint8Array(await (await a.req("GET", "/api/backup/export?audio=0")).arrayBuffer());
    const res = await b.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
    expect(res.status).toBe(200);
    const result = (await res.json()) as { orphanedFiles: number; safetyCopy: string };
    // b's take, its peaks and its album version.
    expect(result.orphanedFiles).toBe(3);
    const { audioDir, albumDir } = b.server.deps.config;
    expect(readdirSync(audioDir)).toEqual([]);
    expect(readdirSync(albumDir)).toEqual([]);
    const aside = result.safetyCopy.replace(/\.db$/, "-audio");
    expect(readdirSync(join(aside, "audio")).sort()).toEqual([`${old.audioId}.peaks`, `${old.audioId}.wav`]);
    expect(readdirSync(join(aside, "album", old.trackId))).toEqual(["v1.wav"]);
  });

  test("export without audio carries the tables only", async () => {
    await seed(a);
    const res = await a.req("GET", "/api/backup/export?audio=0");
    const files = readZip(new Uint8Array(await res.arrayBuffer()));
    expect([...files.keys()]).toEqual(["backup.json"]);
    const manifest = JSON.parse(new TextDecoder().decode(files.get("backup.json"))) as {
      format: string;
      files?: unknown;
      tables: Record<string, unknown[]>;
    };
    expect(manifest.format).toBe("oak-backup");
    expect(manifest.files).toBeUndefined();
    expect(manifest.tables.sketches).toHaveLength(1);
  });

  test("a damaged, foreign or newer archive is refused and nothing changes", async () => {
    await seed(b);
    const before = dump(b);
    const tryImport = async (bytes: Uint8Array) =>
      (await b.destructive("POST", "/api/backup/import", "backup.import", "*", bytes)).status;
    expect(await tryImport(new TextEncoder().encode("garbage"))).toBe(400);
    expect(
      await tryImport(
        writeZip([{ name: "backup.json", data: new TextEncoder().encode('{"format":"other"}') }]),
      ),
    ).toBe(400);
    const newer = {
      format: "oak-backup",
      formatVersion: 1,
      schemaVersion: 99,
      contentVersion: null,
      exportedAt: "2026-11-11T00:00:00.000Z",
      tables: {},
    };
    expect(
      await tryImport(
        writeZip([{ name: "backup.json", data: new TextEncoder().encode(JSON.stringify(newer)) }]),
      ),
    ).toBe(400);
    const lying = {
      ...newer,
      schemaVersion: 1,
      files: [{ path: `audio/${"a".repeat(64)}.wav`, bytes: 3, sha256: "0".repeat(64) }],
    };
    expect(
      await tryImport(
        writeZip([
          { name: "backup.json", data: new TextEncoder().encode(JSON.stringify(lying)) },
          { name: `audio/${"a".repeat(64)}.wav`, data: new Uint8Array([1, 2, 3]) },
        ]),
      ),
    ).toBe(400);
    expect(dump(b)).toEqual(before);
  });

  test("data reset empties every table and the audio folders, after a safety copy", async () => {
    await seed(a);
    const r = await a.destructive("POST", "/api/data/reset", "data.reset", "*");
    expect(r.status).toBe(200);
    const d = dump(a);
    expect(Object.values(d).every((rows) => rows.length === 0)).toBe(true);
    expect(readdirSync(a.server.deps.config.audioDir)).toEqual([]);
    expect(readdirSync(a.server.deps.config.backupsDir).some((f) => f.startsWith("pre-reset-"))).toBe(true);
    // The app still works: the profile is recreated with defaults.
    expect((await a.json<{ weeklyGoal: number }>("GET", "/api/profile")).body.weeklyGoal).toBe(5);
  });

  test("the daily backup runs once a day and keeps 14", () => {
    const dir = join(a.dir, "daily");
    const db = a.server.deps.db;
    expect(dailyBackup(db, dir, "2026-11-11")).toBe(join(dir, "oak-20261111.db"));
    expect(dailyBackup(db, dir, "2026-11-11")).toBeNull();
    for (let i = 1; i <= 20; i++) writeFileSync(join(dir, `oak-202610${String(i).padStart(2, "0")}.db`), "x");
    dailyBackup(db, dir, "2026-11-12");
    const files = readdirSync(dir).filter((f) => /^oak-\d{8}\.db$/.test(f));
    expect(files).toHaveLength(KEEP_DAILY);
    expect(files.sort().at(-1)).toBe("oak-20261112.db");
    expect(lastAutomatic(dir)).toBe("2026-11-12");
  });

  test("a server start makes today's automatic backup", () => {
    expect(
      readdirSync(a.server.deps.config.backupsDir).filter((f) => /^oak-\d{8}\.db$/.test(f)),
    ).toHaveLength(1);
    void BROWSER;
  });
});
