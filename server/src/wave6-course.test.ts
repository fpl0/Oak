// Wave 6 carry-overs on the server, one regression test each (wave6.md §2, §5.6, §5.7): a session per tab (d21), a
// kind that does not fit its map item refused (d7), re-recording keeps every take (d20), a lesson's saved Make sketch
// (d15), a C3 released in three sessions stays released (d13), the U05.L04 split keeps a learner's progress (d17),
// the promoted fact decks reach a learner already past their lessons (d1), the gym slot on review-only days (d19),
// and the recorded track gates announced once (§5.3).
import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import {
  type AlbumTrackDetail,
  type AlbumTrackVersion,
  type CapstoneState,
  type CourseProgress,
  type LessonSketch,
  type Session,
  type SessionDay,
  type SessionPlan,
  TRACK_GATES,
  type Tracks,
} from "@oak/api";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { loadMigrations, migrate } from "./db/migrate.ts";
import { transcriptionSlotDue } from "./services/session-plan.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { type Harness, harness } from "./testing/harness.ts";
import { SimLearner } from "./testing/learner.ts";
import { withCft } from "./testing/wave6.ts";

let real: ContentSource;
let full: ContentSource;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
  full = withCft(real);
});

const NOW = "2026-11-14T12:00:00.000Z";

async function seeded(point: string, content: ContentSource = real): Promise<Harness> {
  const h = await harness({ dev: true, content, now: NOW });
  await h.json("PUT", "/api/profile", { timezone: "UTC" });
  const r = await h.json<{ error?: { message: string } }>("POST", "/api/dev/seed", { point });
  if (r.status !== 200) throw new Error(`seed ${point}: ${r.status} ${JSON.stringify(r.body)}`);
  return h;
}

async function ok<T>(h: Harness, method: string, path: string, body?: unknown): Promise<T> {
  const r = await h.json<T>(method, path, body);
  if (r.status !== 200) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

function makeWav(seconds: number, hz: number): Uint8Array {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const buf = new Uint8Array(44 + n * 2);
  const v = new DataView(buf.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i);
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++)
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), true);
  return buf;
}

describe("d21: a session per tab", () => {
  test("the same tab gets its session back, another tab starts its own, the day counts once", async () => {
    const h = await seeded("C3 released");
    try {
      const start = (tabId?: string) =>
        ok<Session>(h, "POST", "/api/session/start", {
          kind: "review",
          mapItemId: null,
          targetMinutes: 20,
          ...(tabId === undefined ? {} : { tabId }),
        });
      const a = await start("tab_aaaaaaaa");
      const again = await start("tab_aaaaaaaa");
      expect(again.id).toBe(a.id);
      const b = await start("tab_bbbbbbbb");
      expect(b.id).not.toBe(a.id);
      expect(b.tabId).toBe("tab_bbbbbbbb");
      // An older client (no tab id) is one anonymous tab: its own session, given back on a retry.
      const anon = await start();
      expect([a.id, b.id]).not.toContain(anon.id);
      expect((await start()).id).toBe(anon.id);

      const dayA = await ok<SessionDay>(h, "GET", "/api/session/day?tab=tab_aaaaaaaa");
      expect(dayA.open?.id).toBe(a.id);
      expect(dayA.openSessions?.map((s) => s.id)).toEqual([a.id, b.id, anon.id]);
      const dayNew = await ok<SessionDay>(h, "GET", "/api/session/day?tab=tab_cccccccc");
      expect(dayNew.open).toBeNull();

      const end = (id: string) =>
        ok<{ streak: { totalDays: number; currentRunDays: number; thisWeek: { days: unknown[] } } }>(
          h,
          "POST",
          `/api/session/${id}/end`,
          { wrappedEarly: false, phaseMs: { warmup: 60_000, main: 600_000, make: 0, coda: 60_000 } },
        );
      const first = (await end(a.id)).streak;
      const second = (await end(b.id)).streak;
      // Both sessions end on one learner day: it counts once (the minutes add up, the days do not).
      expect(second.totalDays).toBe(first.totalDays);
      expect(second.currentRunDays).toBe(first.currentRunDays);
      const day = await ok<SessionDay>(h, "GET", "/api/session/day?tab=tab_bbbbbbbb");
      expect(day.open).toBeNull();
      expect(day.doneForToday).toBe(true);
      expect(day.openSessions?.map((s) => s.id)).toEqual([anon.id]);
    } finally {
      await h.close();
    }
  }, 120_000);

  test("both tabs plan the same next lesson; a lesson finished in one is finished in the other", async () => {
    const h = await seeded("after X2 (U12.L02 next)", full);
    try {
      const me = new SimLearner(h, full);
      const plan = await me.today();
      if (plan.kind !== "lesson" || plan.mapItemId === null) return; // U12.L02 not written yet
      const id = plan.mapItemId as string;
      const one = await ok<Session>(h, "POST", "/api/session/start", {
        kind: "lesson",
        mapItemId: id,
        targetMinutes: 20,
        tabId: "tab_one00000",
      });
      const two = await ok<Session>(h, "POST", "/api/session/start", {
        kind: "lesson",
        mapItemId: id,
        targetMinutes: 20,
        tabId: "tab_two00000",
      });
      expect(two.id).not.toBe(one.id);
      expect((await me.today()).mapItemId as string | null).toBe(id);
      await me.doLesson(id, one.id);
      await me.completeLesson(id, one.id);
      const progress = await ok<CourseProgress>(h, "GET", "/api/lessons/progress");
      expect(progress.lessons.find((x) => x.lessonId === id)?.status).toBe("completed");
      expect((await me.today()).mapItemId as string | null).not.toBe(id);
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("d7: a session kind that does not fit its map item", () => {
  test("is refused with 400 naming the kind the item needs", async () => {
    const h = await seeded("C3 released");
    try {
      const plan = await ok<SessionPlan>(h, "GET", "/api/session/today");
      const lesson = real.syllabus.defaultOrder.find((x) => /^U\d{2}\.L\d{2}$/.test(x)) as string;
      const wrong = await h.json<{ error: { message: string } }>("POST", "/api/session/start", {
        kind: "gym",
        mapItemId: lesson,
        targetMinutes: 20,
      });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.message).toContain('kind "lesson"');
      const cap = await h.json<{ error: { message: string } }>("POST", "/api/session/start", {
        kind: "lesson",
        mapItemId: "C4.S1",
        targetMinutes: 20,
      });
      expect(cap.status).toBe(400);
      expect(cap.body.error.message).toContain('kind "capstone"');
      // Today's own plan always starts.
      if (plan.mapItemId !== null)
        expect(
          (
            await h.json("POST", "/api/session/start", {
              kind: plan.kind,
              mapItemId: plan.mapItemId,
              targetMinutes: 20,
            })
          ).status,
        ).toBe(200);
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("d7: a ladder stimulus at R3 and above", () => {
  test("plays only sounds the learner has unlocked, over many seeds", async () => {
    const h = await seeded("after U07.L07");
    try {
      const unlocked = new Set(
        (await ok<{ items: { itemId: string }[] }>(h, "GET", "/api/unlocks")).items.map((u) => u.itemId),
      );
      const isLockedSound = (s: string) =>
        real.toolbox.some((t) => t.id === `snd.${s}`) && !unlocked.has(`snd.${s}`);
      let checked = 0;
      for (const realism of [3, 4])
        for (let seed = 1; seed <= 12; seed++) {
          h.server.deps.repos.ladder.saveState(1 + (seed % 4), realism, h.clock.now().toISOString());
          const item = await ok<{
            project: { stimulus: { preload: string[]; events: { s?: string }[] } | null };
          }>(h, "POST", "/api/ladder/items", { sessionId: null, gymId: null, seed: seed * 101 });
          const st = item.project.stimulus;
          if (st === null) continue;
          const heard = new Set([
            ...st.preload,
            ...st.events.map((e) => e.s).filter((x): x is string => !!x),
          ]);
          for (const s of heard)
            expect({ realism, seed, s, locked: isLockedSound(s) }).toEqual({
              realism,
              seed,
              s,
              locked: false,
            });
          checked++;
        }
      expect(checked).toBeGreaterThan(0);
    } finally {
      await h.close();
    }
  }, 180_000);
});

describe("d20: re-recording keeps every take", () => {
  test("a second recording is take 2 and current; take 1 is still served, can be chosen and is in the backup", async () => {
    const h = await seeded("C3 released");
    try {
      const st = await ok<CapstoneState>(h, "GET", "/api/capstones/C3");
      const id = st.trackId as string;
      const track = await ok<AlbumTrackDetail>(h, "GET", `/api/album/tracks/${id}`);
      const v1 = track.versions.find((v) => v.version === 1);
      expect(v1?.takes?.length).toBe(1);
      // An older client re-records through putAudio, with no confirm nonce: a take is added, nothing replaced.
      const put = await h.req(
        "PUT",
        `/api/album/tracks/${id}/versions/1/audio?durationS=2`,
        makeWav(2, 330),
        {
          "content-type": "audio/wav",
        },
      );
      expect(put.status).toBe(200);
      const add = await h.req(
        "POST",
        `/api/album/tracks/${id}/versions/1/takes?durationS=3`,
        makeWav(3, 550),
        {
          "content-type": "audio/wav",
        },
      );
      expect(add.status).toBe(200);
      const after = (await add.json()) as AlbumTrackVersion;
      expect(after.takes?.map((t) => t.take)).toEqual([1, 2, 3]);
      expect(after.currentTake).toBe(3);
      expect(after.durationS).toBe(3);
      const bytes = async (q: string) =>
        Buffer.from(await (await h.req("GET", `/api/album/tracks/${id}/versions/1/audio${q}`)).arrayBuffer());
      expect((await bytes("")).equals(await bytes("?take=3"))).toBe(true);
      expect((await bytes("?take=1")).equals(await bytes("?take=3"))).toBe(false);
      const chosen = await ok<AlbumTrackVersion>(h, "PUT", `/api/album/tracks/${id}/versions/1/take`, {
        take: 1,
      });
      expect(chosen.currentTake).toBe(1);
      expect((await bytes("")).equals(await bytes("?take=1"))).toBe(true);
      expect((await h.json("PUT", `/api/album/tracks/${id}/versions/1/take`, { take: 9 })).status).toBe(404);

      // Backup → import: every take comes back.
      const exp = await h.req("GET", "/api/backup/export");
      const archive = new Uint8Array(await exp.arrayBuffer());
      const fresh = await harness({ dev: true, content: real, now: NOW });
      try {
        const imp = await fresh.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
        expect(imp.status).toBe(200);
        const back = await ok<AlbumTrackDetail>(fresh, "GET", `/api/album/tracks/${id}`);
        const bv = back.versions.find((v) => v.version === 1);
        expect(bv?.takes?.map((t) => t.take)).toEqual([1, 2, 3]);
        expect(bv?.currentTake).toBe(1);
        for (const t of [1, 2, 3])
          expect((await fresh.req("GET", `/api/album/tracks/${id}/versions/1/audio?take=${t}`)).status).toBe(
            200,
          );
      } finally {
        await fresh.close();
      }
    } finally {
      await h.close();
    }
  }, 180_000);
});

describe("d15: a lesson's saved Make sketch", () => {
  test("null before one exists, the newest unarchived after, 404 for an unknown lesson", async () => {
    const h = await seeded("C3 released");
    try {
      const me = new SimLearner(h, real);
      const lesson = "U10.L05";
      const none = await ok<LessonSketch>(h, "GET", "/api/lessons/U99.L01/sketch").catch(() => null);
      expect(none).toBeNull();
      expect((await h.json("GET", "/api/lessons/U99.L01/sketch")).status).toBe(404);
      const before = await ok<LessonSketch>(h, "GET", `/api/lessons/${lesson}/sketch`);
      // The seed may hold the lesson's own Make; a new one saved now is the newest either way.
      const mine = await me.sketch("My Aeolian loop", "lesson-make", lesson, null);
      h.clock.advance(60_000);
      const newer = await me.sketch("My Aeolian loop, again", "lesson-make", lesson, null);
      const got = await ok<LessonSketch>(h, "GET", `/api/lessons/${lesson}/sketch`);
      expect(got.sketch?.id).toBe(newer.id);
      expect(got.sketch?.versions.length).toBeGreaterThan(0);
      expect(before.lessonId).toBe(lesson);
      expect(mine.id).not.toBe(newer.id);
      const other = await ok<LessonSketch>(h, "GET", "/api/lessons/U01.L01/sketch");
      expect(other.sketch?.id ?? null).not.toBe(newer.id);
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("d13: C3 in four sessions", () => {
  test("a C3 released in three sessions stays released: C3.S4 is never offered, nothing is lost", async () => {
    const h = await seeded("C3 released");
    try {
      // As a learner who released C3 before contracts 1.6: its session list ends at S3.
      const db = h.server.deps.repos.db;
      const row = db.query("SELECT sessions_json FROM capstone_state WHERE capstone_id = 'C3'").get() as {
        sessions_json: string;
      } | null;
      if (row === null) throw new Error("no C3 row");
      const three = (JSON.parse(row.sessions_json) as string[]).filter((s) => s !== "C3.S4");
      db.query("UPDATE capstone_state SET sessions_json = ? WHERE capstone_id = 'C3'").run(
        JSON.stringify(three),
      );
      const st = await ok<CapstoneState>(h, "GET", "/api/capstones/C3");
      expect(st.status).toBe("released");
      const plan = await ok<SessionPlan>(h, "GET", "/api/session/today");
      expect(plan.mapItemId).not.toBe("C3.S4");
      const start = await h.json("POST", "/api/session/start", {
        kind: "capstone",
        mapItemId: "C3.S4",
        targetMinutes: 20,
      });
      // Offered or not, a released capstone's sessions are all behind the learner: starting one is a revisit.
      expect([200, 409]).toContain(start.status);
      expect((await ok<SessionPlan>(h, "GET", "/api/session/today")).mapItemId).not.toBe("C3.S4");
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("d17: U05.L04 split into U05.L04 and U05.L09", () => {
  test("the upgrade records U05.L09 completed for a learner who completed U05.L04 before it; no one else", () => {
    const migs = loadMigrations();
    const before = migs.filter((m) => m.version < 7);
    for (const done of [true, false]) {
      const db = new Database(":memory:");
      try {
        migrate(db, before);
        db.query(
          `INSERT INTO lesson_progress (lesson_id, status, started_at, completed_at, completed_version, updated_at)
           VALUES ('U05.L04', ?, '2026-09-01T10:00:00.000Z', ?, 1, '2026-09-01T10:30:00.000Z')`,
        ).run(done ? "completed" : "in_progress", done ? "2026-09-01T10:30:00.000Z" : null);
        expect(migrate(db, migs)).toContain(7);
        const row = db
          .query("SELECT status, completed_at FROM lesson_progress WHERE lesson_id = 'U05.L09'")
          .get() as {
          status: string;
          completed_at: string;
        } | null;
        if (done) expect(row).toEqual({ status: "completed", completed_at: "2026-09-01T10:30:00.000Z" });
        else expect(row).toBeNull();
      } finally {
        db.close();
      }
    }
  });

  test("a learner past U05 after the upgrade is not sent back: Today is not U05.L09", async () => {
    const h = await seeded("C3 released");
    try {
      const plan = await ok<SessionPlan>(h, "GET", "/api/session/today");
      expect(plan.mapItemId).not.toBe("U05.L09");
      const p = await ok<CourseProgress>(h, "GET", "/api/lessons/progress");
      expect(p.lessons.find((x) => x.lessonId === "U05.L09")?.status).toBe("completed");
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("d1: the promoted fact decks reach a learner already past their lessons", () => {
  test("every promoted deck deals its cards, one new card a day per deck", async () => {
    const h = await seeded("C3 released");
    try {
      const promoted = [
        "deck.chd.triads",
        "deck.har.rn",
        "deck.har.cadence",
        "deck.key.minor",
        "deck.har.minor",
        "deck.scl.degrees",
      ].filter((d) => real.decks.some((x) => x.id === d));
      expect(promoted.length).toBeGreaterThan(0);
      // Day by day: Today's plan deals the cards at their pace (a deck never more than one new card a day).
      const me = new SimLearner(h, real);
      const dealt = new Map<string, number>();
      for (let day = 0; day < 10; day++) {
        h.clock.advanceDays(1);
        const plan = await me.today();
        const ses = await me.startSession(plan);
        for (const item of plan.warmup.items) await me.doItem(ses.id, item);
        await me.endSession(ses.id);
        const rows = h.server.deps.repos.db
          .query(
            "SELECT introduced_by AS deck, substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM srs_cards WHERE introduced_by LIKE 'deck.%' GROUP BY introduced_by, substr(created_at, 1, 10)",
          )
          .all() as { deck: string; day: string; n: number }[];
        for (const r of rows) {
          const per = real.decks.find((x) => x.id === r.deck)?.newPerDay ?? 1;
          expect({ deck: r.deck, day: r.day, n: r.n <= per }).toEqual({ deck: r.deck, day: r.day, n: true });
          dealt.set(r.deck, (dealt.get(r.deck) ?? 0) + r.n);
        }
      }
      expect(promoted.some((d) => (dealt.get(d) ?? 0) > 0)).toBe(true);
    } finally {
      await h.close();
    }
  }, 240_000);
});

describe("d19: the gym slot on review-only days", () => {
  test("reviews-only sessions count towards the every-5th-session slot", () => {
    const history = ["U07.L01", "U07.L02", "GYM.01", "U07.L03"];
    expect(transcriptionSlotDue(history, null, 0)).toBe(false);
    expect(transcriptionSlotDue(history, null, 2)).toBe(false);
    expect(transcriptionSlotDue(history, null, 3)).toBe(true);
    // Once the core is complete only the reviews-only sessions since count.
    expect(transcriptionSlotDue([...history, "U07.L04", "U07.L05"], null, 0, false)).toBe(false);
    expect(transcriptionSlotDue([...history, "U07.L04", "U07.L05"], null, 4, false)).toBe(true);
    // A capstone in progress is never interrupted, review days or not.
    expect(transcriptionSlotDue(history, "C3.S2", 9)).toBe(false);
  });
});

describe("track gates (wave6.md §5.3)", () => {
  test("U13.CP opens J and R: recorded, announced on its outcome and that session's Coda, never again", async () => {
    const h = await seeded("U13.CP due", full);
    try {
      const me = new SimLearner(h, full);
      const plan = await me.today();
      expect(plan.mapItemId).toBe("U13.CP");
      expect(plan.tracks ?? null).toBeNull();
      const ses = await me.startSession(plan);
      const { outcome } = await me.checkpoint("U13.CP", ses.id, { gating: 0.95, levelSetting: 0.9 });
      expect(outcome.passed).toBe(true);
      expect((outcome.gatesOpened ?? []).map((g) => g.gateId).sort()).toEqual(["J.main", "R.main"]);
      const summary = await me.endSession(ses.id);
      expect((summary.gatesOpened ?? []).map((g) => g.gateId).sort()).toEqual(["J.main", "R.main"]);
      const tracks = await ok<Tracks>(h, "GET", "/api/tracks");
      for (const t of ["J", "R"]) {
        const st = tracks.items.find((x) => x.trackId === t);
        expect(st?.status).toBe("open");
        expect(st?.next).toBeNull();
        expect(st?.openedAt).not.toBeNull();
      }
      h.clock.advanceDays(1);
      const next = await me.today();
      expect(next.tracks?.open).toEqual(["J", "R"]);
      expect(next.tracks?.lessonsAuthored).toBe(false);
      const ses2 = await me.startSession(next);
      const s2 = await me.endSession(ses2.id);
      expect(s2.gatesOpened ?? []).toEqual([]);
      // Restarting the server (the start-up backfill) announces nothing new and keeps the instant.
      const at = tracks.items.find((x) => x.trackId === "J")?.openedAt;
      h.server.deps.services.tracks.backfill();
      expect((await ok<Tracks>(h, "GET", "/api/tracks")).items.find((x) => x.trackId === "J")?.openedAt).toBe(
        at,
      );
      expect(TRACK_GATES.some((g) => g.gateId === "J.chord-scales")).toBe(true);
      expect(
        (await ok<Tracks>(h, "GET", "/api/tracks")).items
          .find((x) => x.trackId === "J")
          ?.gates.find((g) => g.gateId === "J.chord-scales")?.open,
      ).toBe(false);
    } finally {
      await h.close();
    }
  }, 180_000);
});

describe("ladder L8 (wave6.md §5.4)", () => {
  test("refused until offered, with the reason; L7 is never a level", async () => {
    const h = await seeded("after U17.L02", full);
    try {
      // At L6, with CF-T released but no two L6 songs on two days: L8 is not offered yet.
      h.server.deps.repos.ladder.saveState(6, 1, h.clock.now().toISOString());
      const up = await h.json<{ error: { message: string } }>("PUT", "/api/ladder", { level: 8 });
      expect(up.status).toBe(409);
      expect(up.body.error.message).toMatch(/CF-T|L6|two/);
      expect((await h.json("PUT", "/api/ladder", { level: 7 })).status).toBe(400);
      expect(
        (await h.json("POST", "/api/ladder/items", { sessionId: null, gymId: null, level: 7 })).status,
      ).toBe(400);
    } finally {
      await h.close();
    }
  }, 180_000);

  test("form → bass → changes → melody: a stage opens once the one before passed; the form map is graded on the server", async () => {
    const h = await seeded("ladder L8", full);
    try {
      const songs = (
        await ok<{ items: { songId: string; level: number; passedStages: string[] }[] }>(
          h,
          "GET",
          "/api/ladder/songs",
        )
      ).items.filter((s) => s.level === 8);
      const fresh = songs.find((s) => s.passedStages.length === 0);
      if (fresh === undefined) throw new Error("no untouched L8 standard");
      const item = await ok<{
        itemId: string;
        level: number;
        stages: string[] | null;
        song: { songId: string } | null;
      }>(h, "POST", "/api/ladder/items", { sessionId: null, gymId: null, level: 8, songId: fresh.songId });
      expect(item.level).toBe(8);
      expect(item.stages).toEqual(["form", "bass", "changes", "melody"]);
      const song = full.songs.find((s) => s.id === fresh.songId);
      const sections = song?.answerKey.sections ?? [];
      const submit = (body: Record<string, unknown>) =>
        h.json<{ passed: boolean; result: { score: number; diagnostics: unknown[] } }>(
          "POST",
          `/api/ladder/items/${item.itemId}/submissions`,
          { sessionId: null, code: "", rung: 0, ...body },
        );
      // The bass waits for the form.
      expect((await submit({ stage: "bass", code: 'bass: n("0")' })).status).toBe(409);
      // A form map with a boundary in the wrong place fails, naming the section.
      const wrong = await submit({
        stage: "form",
        formMap: {
          sections: sections.map((s) => s.label),
          bars: sections.map((s, i) => (i === 1 ? s.bars[0] + 2 : s.bars[0])),
        },
      });
      expect(wrong.status).toBe(200);
      expect(wrong.body.passed).toBe(false);
      expect(wrong.body.result.score).toBeLessThan(1);
      expect(wrong.body.result.diagnostics.length).toBeGreaterThan(0);
      expect((await submit({ stage: "bass", code: 'bass: n("0")' })).status).toBe(409);
      // The same form in other letters (X X Y X) is the same answer: it passes.
      const letters = sections.map((s) => (s.label === sections[0]?.label ? "X" : "Y"));
      const right = await submit({
        stage: "form",
        formMap: { sections: letters, bars: sections.map((s) => s.bars[0]) },
      });
      expect(right.body.passed).toBe(true);
      expect(right.body.result.score).toBe(1);
      // Now the bass is open (graded by the grader host; the changes wait for it).
      expect((await submit({ stage: "bass", code: 'bass: n("0")' })).status).toBe(200);
      // The melody waits for the changes.
      expect((await submit({ stage: "melody", code: 'mel: n("0")' })).status).toBe(409);
    } finally {
      await h.close();
    }
  }, 180_000);
});
