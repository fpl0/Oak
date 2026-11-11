// Regression tests for the defects the Wave 2 data review found, plus the data-safety scenarios it walked:
// a late qualifying day in a settled week, a clock behind a settled week, mastery after time away, the
// 12-minute cap on "a little more" review, a crash between writes, backup → restore → the same plan, a
// content edit in the middle of a lesson, and learner days across DST and odd offsets.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type {
  CourseProgress,
  DueBatch,
  SessionPlan,
  SkillMap,
  StreakSummary,
  StreakWeek,
  Unlock,
} from "@oak/api";
import type { LessonDef } from "@oak/content-kit";
import type { ContentSource } from "./content/types.ts";
import { addDays, dayStartInstant, learnerDay } from "./lib/days.ts";
import { computeSkill, type EvidenceItem, type SkillInput } from "./services/mastery.ts";
import { realCourse } from "./testing/course.ts";
import { type Harness, harness } from "./testing/harness.ts";
import { SimLearner } from "./testing/learner.ts";

let course: ContentSource;
beforeAll(async () => {
  course = await realCourse();
});

const sketch = (title: string) => ({
  title,
  originKind: "free",
  originId: null,
  sessionId: null,
  code: 's("bd sd")',
  bpm: 96,
  meter: "4/4",
  key: null,
  analysis: null,
  note: null,
  tutorAssisted: false,
  band: null,
  flags: { lockedTools: [], previewTools: [] },
  ranOk: true,
});

async function qualifyAt(h: Harness, iso: string): Promise<void> {
  h.clock.set(iso);
  const r = await h.json("POST", "/api/sketches", sketch("x"));
  expect(r.status).toBe(200);
}
const weeksOf = async (h: Harness) =>
  (await h.json<{ summary: StreakSummary; weeks: StreakWeek[] }>("GET", "/api/streak?weeks=12")).body;

describe("the weekly streak never lies (§7.8)", () => {
  test("a late day in a week met with banked rests leaves it met (it used to reopen it and miss it)", async () => {
    const h = await harness({ now: "2026-11-02T12:00:00.000Z" });
    try {
      await h.json("PUT", "/api/profile", { timezone: "UTC", weeklyGoal: 5 });
      // Two full weeks (two rests banked), then a week of 3 days met with both rests.
      for (const start of [2, 9])
        for (let i = 0; i < 5; i++)
          await qualifyAt(h, `2026-11-${String(start + i).padStart(2, "0")}T12:00:00.000Z`);
      for (let i = 0; i < 3; i++) await qualifyAt(h, `2026-11-${16 + i}T12:00:00.000Z`);
      h.clock.set("2026-11-23T12:00:00.000Z");
      const before = await weeksOf(h);
      expect(before.weeks.find((w) => w.weekStart === "2026-11-16")?.status).toBe("met-banked");
      expect(before.summary.weeks).toBe(3);
      // The clock steps back into that week (a zone change, a session ended after the rollover): one more day.
      await qualifyAt(h, "2026-11-22T12:00:00.000Z");
      for (const at of ["2026-11-23T13:00:00.000Z", "2026-11-26T13:00:00.000Z"]) {
        h.clock.set(at);
        const after = await weeksOf(h);
        const w = after.weeks.find((x) => x.weekStart === "2026-11-16");
        expect(w).toMatchObject({ status: "met-banked", qualifyingDays: 4, bankedUsed: 2 });
        expect(after.summary.weeks).toBe(3);
        expect(after.summary.totalDays).toBe(14);
      }
    } finally {
      await h.close();
    }
  });

  test("a late day can settle an open tie, and never unsettles a met week", async () => {
    const h = await harness({ now: "2026-11-02T12:00:00.000Z" });
    try {
      await h.json("PUT", "/api/profile", { timezone: "UTC", weeklyGoal: 3 });
      for (let i = 0; i < 2; i++) await qualifyAt(h, `2026-11-0${2 + i}T12:00:00.000Z`);
      h.clock.set("2026-11-09T12:00:00.000Z");
      expect((await weeksOf(h)).weeks[0]?.status).toBe("tie-open");
      await qualifyAt(h, "2026-11-08T20:00:00.000Z"); // Sunday of the short week, recorded late
      h.clock.set("2026-11-09T13:00:00.000Z");
      const w = await weeksOf(h);
      expect(w.weeks[0]).toMatchObject({ weekStart: "2026-11-02", status: "met", qualifyingDays: 3 });
      expect(w.summary.weeks).toBe(1);
    } finally {
      await h.close();
    }
  });

  test("with the clock behind a settled week, the runs do not shrink", async () => {
    const h = await harness({ now: "2026-11-02T12:00:00.000Z" });
    try {
      await h.json("PUT", "/api/profile", { timezone: "UTC", weeklyGoal: 3 });
      for (const d of ["02", "03", "04", "09", "10", "11"]) await qualifyAt(h, `2026-11-${d}T12:00:00.000Z`);
      h.clock.set("2026-11-16T12:00:00.000Z");
      const now = (await weeksOf(h)).summary;
      expect([now.weeks, now.longestWeeks]).toEqual([2, 2]);
      // Monday 05:00 UTC read from Los Angeles is still Sunday of the week before.
      h.clock.set("2026-11-16T05:00:00.000Z");
      await h.json("PUT", "/api/profile", { timezone: "America/Los_Angeles" });
      const back = (await weeksOf(h)).summary;
      expect(back.longestWeeks).toBe(2);
      expect(back.weeks).toBe(2);
    } finally {
      await h.close();
    }
  });
});

describe("mastery moves only on evidence (§7.5)", () => {
  const ev = (day: string, score: number, n: number): EvidenceItem[] =>
    Array.from({ length: n }, (_, i) => ({
      score,
      weight: 1,
      day,
      at: `${day}T10:00:00.000Z`,
      sourceKind: "step",
      sourceId: `x#${day}${i}`,
    }));
  const input = (evidence: EvidenceItem[], today: string, previous: SkillInput["previous"]): SkillInput => ({
    kind: "concept",
    evidence,
    today,
    lessonOpen: true,
    introduced: true,
    cards: [],
    familyAtMastery: null,
    checkpointPassed: null,
    noMic: false,
    previous,
    checkpointDay: null,
  });

  test("practiced and mastered nodes keep their level through a year away; P itself still decays", () => {
    const practiced = [...ev("2026-01-05", 0.8, 6), ...ev("2026-01-06", 0.75, 4)];
    const then = computeSkill(input(practiced, "2026-01-06", null));
    expect(then.level).toBe("practiced");
    const later = computeSkill(
      input(practiced, "2027-01-06", {
        level: "practiced",
        debt: false,
        debtReason: null,
        provisional: false,
      }),
    );
    expect(later.level).toBe("practiced");
    expect(later.P).toBeLessThan(0.6);

    const strong = [...ev("2026-01-05", 1, 6), ...ev("2026-01-07", 1, 6)];
    const m = computeSkill(input(strong, "2026-01-07", null));
    expect(m.level).toBe("mastered");
    const away = computeSkill(
      input(strong, "2026-09-07", { level: "mastered", debt: false, debtReason: null, provisional: false }),
    );
    expect(away.level).toBe("mastered");
    // With the clock behind the latest evidence the level is the same too.
    const behind = computeSkill(
      input(strong, "2026-01-01", { level: "mastered", debt: false, debtReason: null, provisional: false }),
    );
    expect(behind.level).toBe("mastered");
  });

  test("new evidence still demotes: a run of misses after the gap takes mastery away", () => {
    const strong = [...ev("2026-01-05", 1, 4), ...ev("2026-01-07", 1, 4)];
    const misses = [...strong, ...ev("2026-09-07", 0, 6)];
    const r = computeSkill(
      input(misses, "2026-09-07", { level: "mastered", debt: false, debtReason: null, provisional: false }),
    );
    expect(r.level).not.toBe("mastered");
  });
});

/** A learner through the HTTP API for `days` weekdays from onboarding. */
async function learnerWithHistory(days: number): Promise<{ h: Harness; me: SimLearner }> {
  const h = await harness({ dev: true, content: course, now: "2026-11-09T18:00:00.000Z" });
  const me = new SimLearner(h, course, 11);
  await me.api("PUT", "/api/profile", { timezone: "UTC" });
  const first = await me.today();
  const ses = await me.startSession(first);
  const sk = await me.sketch("Sketch 001", "lesson-make", "U00.L01", ses.id);
  await me.api("PUT", "/api/onboarding", { step: "coda", sketchId: sk.id, finished: true });
  await me.endSession(ses.id);
  for (let d = 0; d < days; d++) {
    h.clock.advanceDays(1);
    const plan = await me.today();
    const s = await me.startSession(plan);
    for (const item of plan.warmup.items) await me.doItem(s.id, item);
    if (plan.kind === "lesson" && plan.mapItemId !== null) {
      await me.doLesson(plan.mapItemId, s.id);
      await me.completeLesson(plan.mapItemId, s.id);
    } else if (plan.kind === "checkpoint" && plan.mapItemId !== null) {
      await me.checkpoint(plan.mapItemId, s.id, { gating: 0.95, levelSetting: 0.9 });
    }
    await me.endSession(s.id);
  }
  h.clock.advanceDays(1);
  return { h, me };
}

describe("'a little more' review stops at 12 minutes a day (§7.4), on the server", () => {
  test("after 12 minutes of review today, a reload of /practice/review gets no more", async () => {
    const { h, me } = await learnerWithHistory(12);
    try {
      const ses = await me.api<{ id: string }>("POST", "/api/session/start", {
        kind: "review",
        mapItemId: null,
        targetMinutes: 20,
      });
      const { cards } = await me.api<{ cards: { cardId: string; kind: string }[] }>(
        "GET",
        "/api/drills/families",
      );
      const family = cards.find((c) => c.kind === "family")?.cardId;
      expect(family).toBeDefined();
      const reviewed = () =>
        (h.server.deps.srs() as unknown as { reviewedTodaySec(): number }).reviewedTodaySec();
      // Free practice sets of that family until the day holds 12 minutes of review.
      for (let n = 0; reviewed() < 720 && n < 60; n++) {
        const item = {
          id: `p${n}`,
          kind: "srs",
          familyId: family,
          members: [],
          cardIds: [family],
          estSec: 60,
          mic: false,
        };
        await me.doItem(ses.id, item as never);
      }
      expect(reviewed()).toBeGreaterThanOrEqual(720);
      const more = await me.api<DueBatch>("GET", "/api/srs/due?more=1");
      expect(more).toMatchObject({ items: [], plannedSec: 0, moreAvailable: false });
      // The day's first block (Today's warm-up) is not the "more" offer: it still plans, but offers no more.
      const base = await me.api<DueBatch>("GET", "/api/srs/due");
      expect(base.moreAvailable).toBe(false);
    } finally {
      await h.close();
    }
  }, 120_000);

  test("a 'more' offer is never an empty block", async () => {
    // After a 4-day gap the backlog waits partly for later days (§7.9): it used to be offered as "more".
    const { h, me } = await learnerWithHistory(30);
    try {
      h.clock.advanceDays(4);
      const ses = await me.api<{ id: string }>("POST", "/api/session/start", {
        kind: "review",
        mapItemId: null,
        targetMinutes: 20,
      });
      let batch = await me.api<DueBatch>("GET", "/api/srs/due");
      for (let i = 0; i < 6; i++) {
        for (const item of batch.items) await me.doItem(ses.id, item);
        if (!batch.moreAvailable) break;
        batch = await me.api<DueBatch>("GET", "/api/srs/due?more=1");
        expect(batch.items.filter((x) => x.kind !== "listen").length).toBeGreaterThan(0);
      }
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("a crash between writes leaves nothing half-written (transactions)", () => {
  test("a failure inside lesson completion rolls back the progress, unlocks and terms", async () => {
    const { h, me } = await learnerWithHistory(2);
    try {
      const plan = await me.today();
      expect(plan.kind).toBe("lesson");
      const id = plan.mapItemId as string;
      const ses = await me.startSession(plan);
      await me.doLesson(id, ses.id);
      const sk = await me.sketch("Make", "lesson-make", id, ses.id);
      const before = {
        unlocks: (await me.api<{ items: Unlock[] }>("GET", "/api/unlocks")).items.length,
        terms: (await me.api<{ items: unknown[] }>("GET", "/api/terms/introduced")).items.length,
      };
      // The can-do ledger throws half-way through the completion (after progress, unlocks and terms).
      const cando = h.server.deps.services.cando;
      const original = cando.evaluate.bind(cando);
      cando.evaluate = () => {
        throw new Error("disk full");
      };
      const def = me.lesson(id);
      const body = {
        sessionId: ses.id,
        sketchId: sk.id,
        lessonVersion: def.version,
        contentHash: "h",
        splitPart: null,
      };
      const failed = await h.json("POST", `/api/lessons/${id}/complete`, body);
      expect(failed.status).toBe(500);
      const p = await me.api<CourseProgress>("GET", "/api/lessons/progress");
      expect(p.lessons.find((l) => l.lessonId === id)?.status).not.toBe("completed");
      expect((await me.api<{ items: Unlock[] }>("GET", "/api/unlocks")).items.length).toBe(before.unlocks);
      expect((await me.api<{ items: unknown[] }>("GET", "/api/terms/introduced")).items.length).toBe(
        before.terms,
      );
      // The retry after the fault succeeds once, completely.
      cando.evaluate = original;
      const ok = await h.json<{ progress: { status: string } }>("POST", `/api/lessons/${id}/complete`, body);
      expect(ok.status).toBe(200);
      expect(ok.body.progress.status).toBe("completed");
    } finally {
      await h.close();
    }
  }, 120_000);

  test("a failure inside a graded attempt stores no attempt, no evidence and no step state", async () => {
    const { h, me } = await learnerWithHistory(2);
    try {
      const plan = await me.today();
      const id = plan.mapItemId as string;
      const def = me.lesson(id);
      const step = def.steps.find((s) => s.exercise !== undefined && s.graded === true);
      if (step?.exercise === undefined) throw new Error("no graded step");
      const count = () =>
        (h.server.deps.db.query("SELECT COUNT(*) AS n FROM step_attempts").get() as { n: number }).n;
      const evidence = () =>
        (h.server.deps.db.query("SELECT COUNT(*) AS n FROM evidence").get() as { n: number }).n;
      const before = { attempts: count(), evidence: evidence() };
      const cando = h.server.deps.services.cando;
      const original = cando.evaluate.bind(cando);
      cando.evaluate = () => {
        throw new Error("disk full");
      };
      await expect(me.attempt(id, step.id, step.exercise.id, 1, null, step.exercise.version)).rejects.toThrow(
        /500/,
      );
      expect({ attempts: count(), evidence: evidence() }).toEqual(before);
      const state = await me.api<{ attempts: number; passed: boolean }>(
        "GET",
        `/api/lessons/${id}/steps/${step.id}`,
      );
      expect(state).toMatchObject({ attempts: 0, passed: false });
      cando.evaluate = original;
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("retries and two tabs", () => {
  test("a drill set finished twice, in a row or at once, is reviewed and counted once", async () => {
    const { h, me } = await learnerWithHistory(6);
    try {
      const { cards } = await me.api<{ cards: { cardId: string; kind: string }[] }>(
        "GET",
        "/api/drills/families",
      );
      const family = cards.find((c) => c.kind === "family")?.cardId as string;
      const ses = await me.api<{ id: string }>("POST", "/api/session/start", {
        kind: "review",
        mapItemId: null,
        targetMinutes: 20,
      });
      const revlog = () =>
        (h.server.deps.db.query("SELECT COUNT(*) AS n FROM srs_revlog").get() as { n: number }).n;
      const sets = async () =>
        (await me.api<{ summary: StreakSummary }>("GET", "/api/streak?weeks=1")).summary.thisWeek.days.reduce(
          (n, d) => n + d.reviewSets,
          0,
        );
      for (const mode of ["serial", "parallel"] as const) {
        const drill = await me.api<{ id: string; trialsPlanned: number }>("POST", "/api/drills/sessions", {
          sessionId: ses.id,
          purpose: "srs",
          familyIds: [family],
          warmupItemId: null,
        });
        const trials = Array.from({ length: Math.max(4, drill.trialsPlanned) }, (_, idx) => ({
          idx,
          familyId: family,
          seed: idx + 1,
          level: 1,
          category: "all",
          params: {},
          response: { answer: null, taps: null, sung: null, skipped: false },
          credit: 1,
          correct: true,
          rtMs: 1500,
          replays: 0,
          confusion: null,
          centsError: null,
          at: h.clock.now().toISOString(),
        }));
        await me.api("POST", `/api/drills/sessions/${drill.id}/trials`, { trials });
        const [r0, s0] = [revlog(), await sets()];
        const path = `/api/drills/sessions/${drill.id}/finish`;
        const results =
          mode === "serial"
            ? [await h.json("POST", path), await h.json("POST", path)]
            : await Promise.all([h.json("POST", path), h.json("POST", path)]);
        for (const r of results) expect(r.status).toBe(200);
        expect(revlog() - r0).toBe(1);
        expect((await sets()) - s0).toBe(1);
        // Trials after the finish are refused, not appended.
        expect((await h.json("POST", `/api/drills/sessions/${drill.id}/trials`, { trials })).status).toBe(
          409,
        );
      }
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("backup → restore → the same plan (§11.10)", () => {
  test("a fresh server that imports the archive plans the same day, streak, map and next unlocks", async () => {
    const { h: a } = await learnerWithHistory(10);
    const b = await harness({ dev: true, content: course, now: a.clock.now().toISOString() });
    try {
      await b.json("PUT", "/api/profile", { timezone: "UTC" });
      // B has its own state first (a plan computed and cached), which the import must replace.
      expect((await b.json("GET", "/api/session/today")).status).toBe(200);
      const read = async (h: Harness) => ({
        plan: (await h.json<SessionPlan>("GET", "/api/session/today")).body,
        streak: (await h.json<StreakSummary>("GET", "/api/streak?weeks=8")).body,
        map: (await h.json<SkillMap>("GET", "/api/skills/map")).body.nodes.map((n) => [
          n.skillId,
          n.level,
          n.freshness,
        ]),
        next: (await h.json("GET", "/api/unlocks/next")).body,
        progress: (await h.json<CourseProgress>("GET", "/api/lessons/progress")).body,
        due: (await h.json<DueBatch>("GET", "/api/srs/due")).body,
      });
      const res = await a.req("GET", "/api/backup/export?audio=1");
      const archive = new Uint8Array(await res.arrayBuffer());
      const imported = await b.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
      expect(imported.status).toBe(200);
      const [x, y] = [await read(a), await read(b)];
      expect(y.plan).toEqual(x.plan);
      expect(y.due).toEqual(x.due);
      expect(y.streak).toEqual(x.streak);
      expect(y.map).toEqual(x.map);
      expect(y.next).toEqual(x.next);
      expect(y.progress).toEqual(x.progress);
      // And the next day too: the restored learner goes on exactly as the original would.
      a.clock.advanceDays(1);
      b.clock.advanceDays(1);
      expect((await read(b)).plan).toEqual((await read(a)).plan);
    } finally {
      await a.close();
      await b.close();
    }
  }, 180_000);
});

describe("a content edit in the middle of a lesson (§11.7)", () => {
  test("an exercise bumped while the learner is on it: the old attempt is honoured, the lesson completes", async () => {
    const { h, me } = await learnerWithHistory(2);
    const dir = h.dir;
    try {
      const plan = await me.today();
      const id = plan.mapItemId as string;
      const def = me.lesson(id);
      const graded = def.steps.filter((s) => s.exercise !== undefined && s.graded === true);
      expect(graded.length).toBeGreaterThan(0);
      const ses = await me.startSession(plan);
      const first = graded[0];
      if (first?.exercise === undefined) throw new Error("no graded step");
      await me.attempt(id, first.id, first.exercise.id, 1, ses.id, first.exercise.version);
      // The author bumps every exercise of the lesson and the lesson version; the server restarts on it.
      const bumped: LessonDef = {
        ...def,
        version: def.version + 1,
        steps: def.steps.map((s) =>
          s.exercise === undefined
            ? s
            : ({ ...s, exercise: { ...s.exercise, version: s.exercise.version + 1 } } as typeof s),
        ),
      };
      const edited: ContentSource = {
        ...course,
        lessons: course.lessons.map((l) => (l.id === id ? bumped : l)),
      };
      const { createServer } = await import("./app.ts");
      const { testConfig } = await import("./config.ts");
      await h.server.close();
      const server = await createServer({
        tutor: false,
        validateResponses: true,
        env: {},
        log: () => {},
        config: testConfig(dir, { dev: true }),
        content: edited,
        graders: { learner: () => h.learner, tutor: () => h.tutorHost },
        clock: h.clock,
      });
      (h as { server: typeof server }).server = server;
      const rail = await me.api<{ steps: { stepId: string; passed: boolean }[] }>(
        "GET",
        `/api/lessons/${id}/steps`,
      );
      expect(rail.steps.find((s) => s.stepId === first.id)?.passed).toBe(true);
      // A tab still on the old version sends version 1 for the next step: accepted, not a 500.
      const second = graded[1];
      if (second?.exercise !== undefined) {
        const r = await h.json("POST", `/api/lessons/${id}/steps/${second.id}/attempts`, {
          sessionId: ses.id,
          exerciseId: second.exercise.id,
          exerciseVersion: second.exercise.version,
          seriesNo: 0,
          params: null,
          response: { code: "x" },
          result: {
            exerciseId: `${id}/${second.exercise.id}`,
            exerciseVersion: second.exercise.version,
            attemptNo: 1,
            firstAttempt: true,
            mode: "lesson",
            status: "pass",
            score: 1,
            adjustedScore: 1,
            dims: {},
            constraints: [],
            diagnostics: [],
            messages: [],
            assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
          },
          extraReplays: 0,
          activeMs: 1000,
          tutorAssisted: false,
        });
        expect(r.status).toBe(200);
      }
      for (const s of graded.slice(2))
        if (s.exercise !== undefined)
          await me.attempt(id, s.id, s.exercise.id, 1, ses.id, s.exercise.version + 1);
      const sk = await me.sketch("Make", "lesson-make", id, ses.id);
      const done = await me.api<{ progress: { status: string; completedVersion: number | null } }>(
        "POST",
        `/api/lessons/${id}/complete`,
        { sessionId: ses.id, sketchId: sk.id, lessonVersion: def.version, contentHash: "h", splitPart: null },
      );
      expect(done.progress.status).toBe("completed");
      await me.endSession(ses.id);
      const session = await me
        .api<{ contentVersion: string }>("GET", `/api/session/${ses.id}/summary`)
        .catch(() => null);
      void session;
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("learner days across DST and odd offsets (§7.8)", () => {
  const zones = [
    "UTC",
    "Europe/Lisbon",
    "Europe/Berlin",
    "America/New_York",
    "America/Santiago",
    "America/Havana",
    "Australia/Lord_Howe",
    "Asia/Kathmandu",
    "Pacific/Chatham",
    "Pacific/Kiritimati",
  ];
  test("each day starts at its rollover instant and the instant before belongs to the day before", () => {
    const problems: string[] = [];
    for (const tz of zones)
      for (const hour of [0, 1, 2, 3, 4, 5, 23])
        for (let d = 0; d < 366; d += 1) {
          const day = addDays("2026-01-01", d);
          const start = dayStartInstant(day, tz, hour);
          if (learnerDay(start, tz, hour) !== day)
            problems.push(`${tz} ${hour}h ${day}: start is ${learnerDay(start, tz, hour)}`);
          const before = new Date(start.getTime() - 1);
          if (learnerDay(before, tz, hour) !== addDays(day, -1))
            problems.push(`${tz} ${hour}h ${day}: instant before is ${learnerDay(before, tz, hour)}`);
        }
    // A rollover hour that does not exist on a spring-forward day starts at the first instant after it.
    expect(problems.slice(0, 10)).toEqual([]);
  });

  test("every instant belongs to exactly one learner day, and days never go backwards with time", () => {
    for (const tz of zones) {
      let prev = learnerDay(new Date("2026-01-01T00:00:00Z"), tz);
      for (
        let t = Date.parse("2026-01-01T00:00:00Z");
        t < Date.parse("2027-01-01T00:00:00Z");
        t += 15 * 60_000
      ) {
        const day = learnerDay(new Date(t), tz);
        expect(day >= prev).toBe(true);
        if (day !== prev) expect(day).toBe(addDays(prev, 1));
        prev = day;
      }
    }
  });
});

afterAll(() => {});
