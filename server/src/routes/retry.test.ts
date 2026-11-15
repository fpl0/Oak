// The retry policy over HTTP on the fixture course (docs/design/retry.md §3–§4): an exercise can be done again
// after any result, and a retry never farms or punishes. A practice attempt is stored with its grade (and counted
// in the series' attempts) and changes neither mastery, the SRS, the exercise's results, the lesson's best score
// nor the streak; "Try a new one" never earns a second first attempt; a drill trial keeps its first answer; a checkpoint
// handed in cannot be handed in again with better answers; a capstone version's rules count once.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { StepAttemptResult, StepState } from "@oak/api";
import { all, get } from "../db/index.ts";
import { realCourse } from "../testing/course.ts";
import { gradeResult, type Harness, harness } from "../testing/harness.ts";

let h: Harness;
beforeEach(async () => {
  h = await harness({ now: "2026-11-11T12:00:00.000Z" });
  h.server.deps.repos.profile.patch({ timezone: "UTC" });
});
afterEach(async () => {
  await h.close();
});

const SKETCH = {
  title: "Make",
  sessionId: null,
  code: 's("bd ~ sd hh")',
  bpm: 96,
  meter: "4/4",
  key: null,
  analysis: null,
  note: null,
  tutorAssisted: false,
  band: null,
  flags: { lockedTools: [], previewTools: [] },
  ranOk: true,
};

async function sketch(originId: string, originKind = "lesson-make"): Promise<string> {
  const r = await h.json<{ sketch: { id: string } }>("POST", "/api/sketches", {
    ...SKETCH,
    originKind,
    originId,
  });
  expect(r.status).toBe(200);
  return r.body.sketch.id;
}

async function complete(lessonId: string) {
  const r = await h.json("POST", `/api/lessons/${lessonId}/complete`, {
    sessionId: null,
    sketchId: await sketch(lessonId),
    lessonVersion: 1,
    contentHash: "h",
    splitPart: null,
  });
  expect(r.status).toBe(200);
}

/** One graded check of U01.L02's S2 (`rest-on-three`, skill R06). */
async function check(score: number, seriesNo = 0): Promise<StepAttemptResult> {
  const r = await h.json<StepAttemptResult>("POST", "/api/lessons/U01.L02/steps/S2/attempts", {
    sessionId: null,
    exerciseId: "rest-on-three",
    exerciseVersion: 1,
    seriesNo,
    params: null,
    response: { code: score >= 0.8 ? 'drums: s("bd bd ~ bd")' : 'drums: s("bd bd bd bd")' },
    result: gradeResult({ exerciseId: "U01.L02/rest-on-three", score }),
    extraReplays: 0,
    activeMs: 20_000,
    tutorAssisted: false,
  });
  expect(r.status).toBe(200);
  return r.body;
}

const stepState = async () => (await h.json<StepState>("GET", "/api/lessons/U01.L02/steps/S2")).body;

/** Everything a practice attempt must leave alone. */
async function snapshot() {
  const db = h.server.deps.repos.db;
  return {
    evidence: all(db, "SELECT skill_id, score, weight, source_kind FROM evidence ORDER BY id"),
    skills: all(db, "SELECT * FROM skill_state ORDER BY skill_id"),
    cards: all(db, "SELECT * FROM srs_cards ORDER BY card_id"),
    revlog: get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM srs_revlog")?.n,
    exercise: all(db, "SELECT * FROM exercise_results ORDER BY exercise_id"),
    progress: all(db, "SELECT lesson_id, status, best_score FROM lesson_progress ORDER BY lesson_id"),
    stepState: all(db, "SELECT step_id, series_no, rung, passed FROM step_state ORDER BY step_id"),
    streak: (await h.json("GET", "/api/streak")).body,
  };
}

describe("a lesson step", () => {
  beforeEach(async () => {
    await complete("U01.L01");
  });

  test("fail, retry, pass count as the contracts say; then any take is practice and changes nothing", async () => {
    expect((await stepState()).practiceNext).toBe(false);
    const a1 = await check(0.4);
    expect(a1.attempt.practice).toBe(false);
    expect(a1.evidence).toEqual([expect.objectContaining({ skillId: "R06", weight: 1, sourceKind: "step" })]);
    const a2 = await check(1);
    expect(a2.evidence).toEqual([
      expect.objectContaining({ skillId: "R06", weight: 0.3, sourceKind: "retry" }),
    ]);
    expect(a2.state).toMatchObject({ passed: true, attempts: 2, practiceNext: true });

    // From here every take is practice: a right one and, above all, a wrong one (a retry never punishes).
    const before = await snapshot();
    const p1 = await check(1);
    const p2 = await check(0.2);
    for (const [i, p] of [p1, p2].entries()) {
      expect(p.attempt.practice).toBe(true);
      expect(p.attempt.attemptNo).toBe(3 + i);
      expect(p.evidence).toEqual([]);
      expect(p.reviews).toEqual([]);
      expect(p.testedOut).toEqual([]);
      expect(p.state).toMatchObject({ passed: true, attempts: 3 + i, practiceNext: true });
    }
    expect(p2.attempt.passed).toBe(false);
    expect(await snapshot()).toEqual(before);
    // Both takes are kept (telemetry, the grading-problem queue): the history has four rows, two of them practice.
    const rows = h.server.deps.repos.lessons.attemptsOfStep("U01.L02", "S2");
    expect(rows.map((r) => [r.passed, r.practice])).toEqual([
      [false, false],
      [true, false],
      [true, true],
      [false, true],
    ]);
  });

  test('"Try a new one" after a fail starts a series, never a second first attempt', async () => {
    await check(0.3);
    const ns = await h.json<StepState>("POST", "/api/lessons/U01.L02/steps/S2/series");
    expect(ns.body).toMatchObject({ seriesNo: 1, attempts: 0, rung: 0, practiceNext: false });
    const next = await check(1, 1);
    expect(next.attempt.practice).toBe(false);
    expect(next.evidence).toEqual([expect.objectContaining({ weight: 0.3, sourceKind: "retry" })]);
    expect(next.reviews).toEqual([]);
  });

  test("a replay of a completed lesson is practice from its first take", async () => {
    await check(1);
    await complete("U01.L02");
    expect((await stepState()).practiceNext).toBe(true);
    const before = await snapshot();
    const replay = await check(0);
    expect(replay.attempt.practice).toBe(true);
    expect(replay.evidence).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });
});

describe("a drill trial", () => {
  test("a retry inside a trial keeps the first answer; the set's rating follows the first answers", async () => {
    await complete("U01.L01");
    await complete("U01.L02");
    const start = await h.json<{ id: string }>("POST", "/api/drills/sessions", {
      sessionId: null,
      purpose: "srs",
      familyIds: ["fam.ear.pulse"],
      warmupItemId: null,
    });
    const trial = (idx: number, credit: number, retries?: number) => ({
      idx,
      familyId: "fam.ear.pulse",
      seed: 1000 + idx,
      level: 1,
      category: "basic",
      params: {},
      response: { answer: null, taps: null, sung: null, skipped: false },
      credit,
      correct: credit >= 1,
      rtMs: 2000 + idx * 100,
      replays: 0,
      confusion: null,
      centsError: null,
      at: "2026-11-11T12:01:00.000Z",
      ...(retries === undefined ? {} : { retries }),
    });
    const url = `/api/drills/sessions/${start.body.id}/trials`;
    // Two wrong first answers of six…
    const first = [trial(0, 1), trial(1, 0), trial(2, 0), trial(3, 1), trial(4, 1), trial(5, 1)];
    expect((await h.json("POST", url, { trials: first })).status).toBe(200);
    // …retried until right: the runner re-sends both with the practice count.
    expect((await h.json("POST", url, { trials: [trial(1, 1, 1), trial(2, 1, 2)] })).status).toBe(200);
    const stored = h.server.deps.repos.srs.trials(start.body.id);
    expect(stored.map((t) => [t.idx, t.credit, t.retries ?? 0])).toEqual([
      [0, 1, 0],
      [1, 0, 1],
      [2, 0, 2],
      [3, 1, 0],
      [4, 1, 0],
      [5, 1, 0],
    ]);
    const fin = await h.json<{ meanCredit: number; reviews: { rating: string }[] }>(
      "POST",
      `/api/drills/sessions/${start.body.id}/finish`,
    );
    // Mean credit 4/6 ≈ 0.67: Hard (contracts §7.2), not the Easy six right answers would have given.
    expect(fin.body.meanCredit).toBeCloseTo(4 / 6, 10);
    expect(fin.body.reviews).toEqual([expect.objectContaining({ rating: "Hard" })]);
  });
});

describe("a checkpoint and a capstone", () => {
  async function openC0() {
    for (const l of ["U01.L01", "U01.L02", "U01.L03", "U02.L01"]) await complete(l);
  }

  test("a checkpoint handed in cannot be handed in again with better answers", async () => {
    await openC0();
    const start = await h.json<{ attemptNo: number; items: { idx: number }[] }>(
      "POST",
      "/api/checkpoints/U01.CP/start",
    );
    expect(start.status).toBe(200);
    const submit = (score: number) =>
      h.json<{ passed: boolean }>("POST", "/api/checkpoints/U01.CP/attempts", {
        sessionId: null,
        attemptNo: start.body.attemptNo,
        items: start.body.items.map((i) => ({
          idx: i.idx,
          score,
          skipped: false,
          response: { code: "" },
          result: null,
        })),
        makeSketchId: null,
        acceptSoftPass: false,
      });
    expect((await submit(0.2)).body.passed).toBe(false);
    const before = await snapshot();
    expect((await submit(1)).status).toBe(409);
    expect(await snapshot()).toEqual(before);
  });

  test("checking the same capstone version again is practice: its rules count once", async () => {
    // The fixture's C0 has no brief: this one test runs on the real course, seeded past U02.CP (C0 open).
    const real = await harness({ dev: true, content: await realCourse(), now: "2026-11-11T12:00:00.000Z" });
    try {
      real.server.deps.repos.profile.patch({ timezone: "UTC" });
      expect((await real.json("POST", "/api/dev/seed", { point: "after U02.CP" })).status).toBe(200);
      const made = await real.json<{ sketch: { id: string } }>("POST", "/api/sketches", {
        ...SKETCH,
        originKind: "capstone",
        originId: "C0",
      });
      const sk = made.body.sketch.id;
      const brief = real.server.deps.content.capstoneDef("C0")?.brief as
        | { id: string; rubric?: { id: string; required: boolean }[] }
        | undefined;
      const rubric = (brief?.rubric ?? []).map((r) => ({ ruleId: r.id, required: r.required, ok: true }));
      expect(rubric.length).toBeGreaterThan(0);
      const checkTrack = () =>
        real.json<{ lastResult: { score: number } | null }>("POST", "/api/capstones/C0/checks", {
          sessionId: null,
          sketchId: sk,
          sketchVersion: 1,
          result: gradeResult({ exerciseId: `C0/${brief?.id}`, score: 0.95, mode: "capstone", rubric }),
        });
      const rubricRows = () =>
        get<{ n: number }>(
          real.server.deps.repos.db,
          "SELECT COUNT(*) AS n FROM evidence WHERE source_id = ?",
          `C0:${sk}#v1`,
        )?.n ?? 0;
      expect((await checkTrack()).status).toBe(200);
      const once = rubricRows();
      expect(once).toBeGreaterThan(0);
      const again = await checkTrack();
      expect(again.status).toBe(200);
      expect(again.body.lastResult?.score).toBe(0.95);
      expect(rubricRows()).toBe(once);
    } finally {
      await real.close();
    }
  });
});
