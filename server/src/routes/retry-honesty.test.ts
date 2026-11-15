// The adversarial half of the retry review (docs/design/retry.md §3–§4): a learner who tries to RAISE their record
// by trying again — a right answer fifty times, a reveal then a right answer, the same check posted twice or from
// two tabs at once, a checkpoint handed in from two tabs — must leave mastery, the SRS, the lesson's results and
// the streak exactly where the policy says. Through the real routes, on the fixture course. (A fact card is rated
// once per sitting by the client, which owns the sitting: app/src/drills/retry.ts `factSitting`.)
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { StepAttemptResult, StepState } from "@oak/api";
import { all, get } from "../db/index.ts";
import { gradeResult, type Harness, harness } from "../testing/harness.ts";

let h: Harness;
beforeEach(async () => {
  h = await harness({ now: "2026-11-11T12:00:00.000Z" });
  h.server.deps.repos.profile.patch({ timezone: "UTC" });
});
afterEach(async () => {
  await h.close();
});

async function complete(lessonId: string) {
  const s = await h.json<{ sketch: { id: string } }>("POST", "/api/sketches", {
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
    originKind: "lesson-make",
    originId: lessonId,
  });
  expect(s.status).toBe(200);
  const r = await h.json("POST", `/api/lessons/${lessonId}/complete`, {
    sessionId: null,
    sketchId: s.body.sketch.id,
    lessonVersion: 1,
    contentHash: "h",
    splitPart: null,
  });
  expect(r.status).toBe(200);
}

/** One graded check of U01.L02's S2 (`rest-on-three`, skill R06, seeds fam.rhy.read). */
function checkBody(score: number, idempotencyKey?: string) {
  return {
    sessionId: null,
    exerciseId: "rest-on-three",
    exerciseVersion: 1,
    seriesNo: 0,
    params: null,
    response: { code: score >= 0.8 ? 'drums: s("bd bd ~ bd")' : 'drums: s("bd bd bd bd")' },
    result: gradeResult({ exerciseId: "U01.L02/rest-on-three", score }),
    extraReplays: 0,
    activeMs: 20_000,
    tutorAssisted: false,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  };
}
async function check(score: number, idempotencyKey?: string): Promise<StepAttemptResult> {
  const r = await h.json<StepAttemptResult>(
    "POST",
    "/api/lessons/U01.L02/steps/S2/attempts",
    checkBody(score, idempotencyKey),
  );
  expect(r.status).toBe(200);
  return r.body;
}
const stepState = async () => (await h.json<StepState>("GET", "/api/lessons/U01.L02/steps/S2")).body;

const db = () => h.server.deps.repos.db;
const evidence = () =>
  all<{ skill_id: string; score: number; weight: number; source_kind: string }>(
    db(),
    "SELECT skill_id, score, weight, source_kind FROM evidence ORDER BY id",
  );
const revlog = () => get<{ n: number }>(db(), "SELECT COUNT(*) AS n FROM srs_revlog")?.n ?? 0;
const record = async () => ({
  evidence: evidence(),
  skills: all(db(), "SELECT * FROM skill_state ORDER BY skill_id"),
  cards: all(db(), "SELECT * FROM srs_cards ORDER BY card_id"),
  revlog: revlog(),
  exercise: all(db(), "SELECT * FROM exercise_results ORDER BY exercise_id"),
  progress: all(db(), "SELECT lesson_id, status, best_score FROM lesson_progress ORDER BY lesson_id"),
  passed: all(db(), "SELECT step_id, passed FROM step_state ORDER BY step_id"),
  streak: (await h.json("GET", "/api/streak")).body,
});

describe("a lesson step tried again", () => {
  beforeEach(async () => {
    await complete("U01.L01");
  });

  test("a right answer repeated fifty times counts once: one evidence row, one rating, one best score", async () => {
    const first = await check(1);
    expect(first.attempt.practice).toBe(false);
    expect(first.evidence).toEqual([expect.objectContaining({ skillId: "R06", weight: 1, score: 1 })]);
    const after1 = await record();
    for (let i = 0; i < 50; i++) {
      const p = await check(i % 7 === 3 ? 0.1 : 1);
      expect(p.attempt.practice).toBe(true);
      expect(p.evidence).toEqual([]);
      expect(p.reviews).toEqual([]);
    }
    expect(await record()).toEqual(after1);
    expect((await stepState()).attempts).toBe(51);
  });

  test("a reveal, then Try again and a right answer: the step finishes, never as known", async () => {
    await check(0.2);
    await check(0.3);
    const hint = await h.json<StepState>("POST", "/api/lessons/U01.L02/steps/S2/hints", { reveal: false });
    expect(hint.status).toBe(200);
    for (let i = 0; i < 2; i++)
      await h.json<StepState>("POST", "/api/lessons/U01.L02/steps/S2/hints", { reveal: false });
    const revealed = await h.json<StepState>("POST", "/api/lessons/U01.L02/steps/S2/hints", { reveal: true });
    expect(revealed.body.rung).toBe(4);
    const revs = revlog();
    const pass = await check(1);
    expect(pass.attempt.practice).toBe(false);
    expect(pass.state.passed).toBe(true);
    // Rung 4 multiplies the score by 0 (contracts §5.3): the retry's evidence is a zero at 0.3, no new rating.
    expect(pass.evidence).toEqual([expect.objectContaining({ skillId: "R06", score: 0, weight: 0.3 })]);
    expect(revlog()).toBe(revs);
    // And from there every take is practice.
    const before = await record();
    expect((await check(1)).attempt.practice).toBe(true);
    expect(await record()).toEqual(before);
  });

  test("the same Check posted twice (a resend with its key) is one attempt", async () => {
    const a = await check(1, "retry-honesty-0001");
    const b = await check(1, "retry-honesty-0001");
    expect(b).toEqual(a);
    expect((await stepState()).attempts).toBe(1);
    expect(evidence().filter((e) => e.skill_id === "R06")).toHaveLength(1);
  });

  test("two tabs checking the same step at once: exactly one counts as the first attempt", async () => {
    const [a, b] = await Promise.all([
      h.json<StepAttemptResult>("POST", "/api/lessons/U01.L02/steps/S2/attempts", checkBody(1, "tab-a-0001")),
      h.json<StepAttemptResult>("POST", "/api/lessons/U01.L02/steps/S2/attempts", checkBody(1, "tab-b-0001")),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.attempt.practice, b.body.attempt.practice].sort()).toEqual([false, true]);
    expect(evidence().filter((e) => e.skill_id === "R06")).toEqual([
      expect.objectContaining({ weight: 1, score: 1, source_kind: "step" }),
    ]);
  });

  test("a reload between the result and Try again: the server says the next take is practice", async () => {
    await check(1);
    // A reload reads the step's state afresh; nothing on the client has to remember the pass.
    expect(await stepState()).toMatchObject({ passed: true, practiceNext: true });
    expect((await check(0)).attempt.practice).toBe(true);
    expect(await stepState()).toMatchObject({ passed: true, practiceNext: true });
  });
});

describe("a checkpoint handed in from two tabs at once", () => {
  test("one hand-in counts; the other is refused and changes nothing", async () => {
    for (const l of ["U01.L01", "U01.L02", "U01.L03", "U02.L01"]) await complete(l);
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
    const [a, b] = await Promise.all([submit(0.2), submit(1)]);
    expect([a.status, b.status]).toEqual([200, 409]);
    expect(a.body.passed).toBe(false);
    const cp = evidence().filter((e) => e.source_kind === "checkpoint");
    expect(cp.length).toBeGreaterThan(0);
    expect(cp.every((e) => e.score === 0.2)).toBe(true);
  });
});
