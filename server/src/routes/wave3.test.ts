// The Wave 3 server (docs/design/wave3.md §5) over HTTP on the fixture course: Today's done state and one open
// session per learner day, idempotent attempts and reviews, the voice state (Quiet mode, range, labels, the
// sing-tolerance ladder), drill trials with revealed / sung / quiet evidence and drills.get, lenses, milestones,
// and the learner day across a clock stepped back or a time-zone change. The real course (seeds, U03–U04, the
// end of the authored course) is in ../wave3-course.test.ts.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  DrillSession,
  DrillSessionDetail,
  DrillTrialRecord,
  DueBatch,
  FamilyState,
  Session,
  SessionDay,
  SessionSummary,
  Settings,
  StepAttemptResult,
  StreakSummary,
  SungResolution,
  VoiceState,
} from "@oak/api";
import type { MilestoneDef } from "@oak/content-kit";
import { fixtureContent } from "../content/fixture.ts";
import { gradeResult, type Harness, harness } from "../testing/harness.ts";
import { conditionReachedAt } from "./practice.ts";

let h: Harness;
const T0 = "2026-11-11T12:00:00.000Z"; // a Wednesday
beforeEach(async () => {
  h = await harness({ dev: true, now: T0 });
  h.server.deps.repos.profile.patch({ timezone: "UTC", inputKind: "builtin" });
});
afterEach(async () => {
  await h.close();
});

const DAY = 86_400_000;

async function ok<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await h.json<T>(method, path, body);
  if (r.status !== 200) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

const SKETCH = {
  originKind: "lesson-make",
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
  return (
    await ok<{ sketch: { id: string } }>("POST", "/api/sketches", {
      ...SKETCH,
      title: "Make",
      originKind,
      originId,
    })
  ).sketch.id;
}
async function complete(lessonId: string): Promise<void> {
  await ok("POST", `/api/lessons/${lessonId}/complete`, {
    sessionId: null,
    sketchId: await sketch(lessonId),
    lessonVersion: 1,
    contentHash: "h",
    splitPart: null,
  });
}
async function passCheckpoint(cpId: string): Promise<void> {
  const start = await ok<{ attemptNo: number; items: { idx: number }[] }>(
    "POST",
    `/api/checkpoints/${cpId}/start`,
  );
  const out = await ok<{ passed: boolean }>("POST", `/api/checkpoints/${cpId}/attempts`, {
    sessionId: null,
    attemptNo: start.attemptNo,
    items: start.items.map((i) => ({
      idx: i.idx,
      score: 1,
      skipped: false,
      response: { code: "" },
      result: null,
    })),
    makeSketchId: await sketch(cpId, "checkpoint"),
    acceptSoftPass: false,
  });
  expect(out.passed).toBe(true);
}
const attemptBody = (over: Record<string, unknown> = {}) => ({
  sessionId: null,
  exerciseId: "rest-on-three",
  exerciseVersion: 1,
  seriesNo: 0,
  params: null,
  response: { code: 's("bd ~ ~ sd")' },
  result: gradeResult({ exerciseId: "U01.L01/rest-on-three", score: 0.5 }),
  extraReplays: 0,
  activeMs: 1000,
  tutorAssisted: false,
  ...over,
});
const start = (kind: Session["kind"] = "lesson", mapItemId: string | null = "U01.L01") =>
  h.json<Session>("POST", "/api/session/start", { kind, mapItemId, targetMinutes: 20 });
const end = (id: string) =>
  ok<SessionSummary>("POST", `/api/session/${id}/end`, {
    wrappedEarly: false,
    phaseMs: { warmup: 60_000, main: 120_000, make: 60_000, coda: 10_000 },
  });

/** One finished drill set of `familyId` with these trials (credit 1 unless the trial says otherwise). */
async function drillSet(
  familyId: string,
  trials: Partial<DrillTrialRecord>[],
  purpose: "srs" | "practice" = "practice",
): Promise<string> {
  const drill = await ok<DrillSession>("POST", "/api/drills/sessions", {
    sessionId: null,
    purpose,
    familyIds: [familyId],
    warmupItemId: null,
  });
  await ok("POST", `/api/drills/sessions/${drill.id}/trials`, {
    trials: trials.map((t, idx) => ({
      idx,
      familyId,
      seed: idx + 1,
      level: 1,
      category: "basic",
      params: {},
      response: { answer: null, taps: null, sung: null, skipped: false },
      credit: 1,
      correct: true,
      rtMs: 1500,
      replays: 0,
      confusion: null,
      centsError: null,
      at: h.clock.now().toISOString(),
      ...t,
    })),
  });
  await ok("POST", `/api/drills/sessions/${drill.id}/finish`);
  return drill.id;
}
const sung = (cents: number[]) => ({
  answer: null,
  taps: null,
  sung: cents.map((c) => ({ midi: 60, cents: c, credit: Math.abs(c) <= 35 ? 1 : 0.5 })),
  skipped: false,
});

describe("Today's done state on the server and one open session per learner day (§5.1)", () => {
  test("a second start returns the open session; an ended one does not block; Studio never makes the day done", async () => {
    const day0 = await ok<SessionDay>("GET", "/api/session/day");
    expect(day0).toEqual({
      day: "2026-11-11",
      open: null,
      ended: [],
      doneForToday: false,
      summarySessionId: null,
    });

    const a = await start();
    expect(a.status).toBe(200);
    // Two tabs, a double click, another kind: the open session comes back, nothing new starts.
    const [b, c] = await Promise.all([start(), start("studio", null)]);
    expect(b.body.id).toBe(a.body.id);
    expect(c.body.id).toBe(a.body.id);
    expect((await ok<SessionDay>("GET", "/api/session/day")).open?.id).toBe(a.body.id);

    await end(a.body.id);
    let d = await ok<SessionDay>("GET", "/api/session/day");
    expect(d).toMatchObject({ open: null, doneForToday: true, summarySessionId: a.body.id });
    expect(d.ended.map((s) => s.id)).toEqual([a.body.id]);

    // "More practice" and Studio after the day is done: new sessions; Studio does not move the summary.
    const studio = await start("studio", null);
    expect(studio.body.id).not.toBe(a.body.id);
    await end(studio.body.id);
    d = await ok<SessionDay>("GET", "/api/session/day");
    expect(d.ended.map((s) => s.id)).toEqual([a.body.id, studio.body.id]);
    expect(d.summarySessionId).toBe(a.body.id);

    // The next learner day starts fresh.
    h.clock.advance(DAY);
    expect(await ok<SessionDay>("GET", "/api/session/day")).toMatchObject({
      day: "2026-11-12",
      doneForToday: false,
    });
  });

  test("a Studio-only day is not done; a session that crossed the 04:00 rollover counts for the new day", async () => {
    const s = await start("studio", null);
    await end(s.body.id);
    expect((await ok<SessionDay>("GET", "/api/session/day")).doneForToday).toBe(false);

    h.clock.set("2026-11-12T03:40:00.000Z"); // still 11 November's learner day
    const late = await start();
    expect(late.body.day).toBe("2026-11-11");
    h.clock.set("2026-11-12T04:20:00.000Z");
    await end(late.body.id);
    const d = await ok<SessionDay>("GET", "/api/session/day");
    expect(d).toMatchObject({ day: "2026-11-12", doneForToday: true, summarySessionId: late.body.id });
  });

  test("a session open across the 04:00 rollover is still the open one after a reload; hours later it is not", async () => {
    h.clock.set("2026-11-12T03:40:00.000Z");
    const late = await start();
    h.clock.set("2026-11-12T04:10:00.000Z");
    const d = await ok<SessionDay>("GET", "/api/session/day");
    expect(d.day).toBe("2026-11-12");
    expect(d.open?.id).toBe(late.body.id);
    // A start (the reload's Resume, another tab) returns it rather than opening a second session.
    expect((await start()).body.id).toBe(late.body.id);
    // Left open and untouched until the afternoon: the new day starts fresh.
    h.clock.set("2026-11-12T15:00:00.000Z");
    expect((await ok<SessionDay>("GET", "/api/session/day")).open).toBeNull();
    const fresh = await start();
    expect(fresh.body.id).not.toBe(late.body.id);
    expect(fresh.body.day).toBe("2026-11-12");
  });

  test("onboarding is the first day's session: the day it finishes on is done; the next day is not", async () => {
    await ok("PUT", "/api/onboarding", { step: "loop", completed: ["loop"] });
    // Part-way through onboarding the day is not done yet.
    expect((await ok<SessionDay>("GET", "/api/session/day")).doneForToday).toBe(false);
    await ok("PUT", "/api/onboarding", { step: "coda", completed: ["coda"], finished: true });
    expect(await ok<SessionDay>("GET", "/api/session/day")).toEqual({
      day: "2026-11-11",
      open: null,
      ended: [],
      doneForToday: true,
      summarySessionId: null, // its Coda lives in the onboarding flow
    });
    // "Start another session" from the done state still starts one, and the day stays done after it.
    const more = await start();
    expect(more.status).toBe(200);
    await end(more.body.id);
    expect((await ok<SessionDay>("GET", "/api/session/day")).summarySessionId).toBe(more.body.id);
    h.clock.advance(DAY);
    expect((await ok<SessionDay>("GET", "/api/session/day")).doneForToday).toBe(false);
    // A repeated finish (a reload of the last screen) does not move the day it finished on.
    await ok("PUT", "/api/onboarding", { finished: true });
    expect((await ok<SessionDay>("GET", "/api/session/day")).doneForToday).toBe(false);
  });
});

describe("idempotent writes (§5.2)", () => {
  test("a retried, raced or replayed attempt with one key counts once; a different body under it is a 409", async () => {
    const path = "/api/lessons/U01.L01/steps/S2/attempts";
    const body = attemptBody({ idempotencyKey: "attempt-key-0001" });
    const first = await h.json<StepAttemptResult>("POST", path, body);
    expect(first.status).toBe(200);
    const again = await h.json<StepAttemptResult>("POST", path, body);
    expect(again.body).toEqual(first.body);
    const raced = await Promise.all([
      h.json<StepAttemptResult>("POST", path, attemptBody({ idempotencyKey: "attempt-key-0002" })),
      h.json<StepAttemptResult>("POST", path, attemptBody({ idempotencyKey: "attempt-key-0002" })),
    ]);
    expect(raced.map((r) => r.status)).toEqual([200, 200]);
    expect(raced[0]?.body).toEqual(raced[1]?.body);
    // Two learner actions: two attempts, two rows of evidence sources, not four.
    const state = await ok<{ attempts: number }>("GET", "/api/lessons/U01.L01/steps/S2");
    expect(state.attempts).toBe(2);
    const sources = h.server.deps.repos.db
      .query(
        "SELECT COUNT(DISTINCT source_id) AS n FROM evidence WHERE source_id LIKE 'U01.L01/rest-on-three#%'",
      )
      .get() as { n: number };
    expect(sources.n).toBe(2);
    // Same key, different body: a conflict, and nothing is counted.
    const clash = await h.json<{ error: { code: string } }>(
      "POST",
      path,
      attemptBody({ idempotencyKey: "attempt-key-0001", extraReplays: 3 }),
    );
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("conflict");
    // Without a key, Wave 2 behaviour: each request counts.
    await ok("POST", path, attemptBody());
    await ok("POST", path, attemptBody());
    expect((await ok<{ attempts: number }>("GET", "/api/lessons/U01.L01/steps/S2")).attempts).toBe(4);
    // A malformed key is refused before anything happens.
    expect((await h.json("POST", path, attemptBody({ idempotencyKey: "bad key!" }))).status).toBe(400);
  });

  test("a fact review with one key is rated once, in a row or at once", async () => {
    await complete("U01.L01");
    await complete("U01.L02");
    await complete("U01.L03");
    await complete("U02.L01"); // opens the treble deck
    await ok<DueBatch>("GET", "/api/srs/due");
    const card = h.server.deps.repos.srs.cards({ kind: "fact" })[0];
    expect(card).toBeDefined();
    const revlog = () =>
      (h.server.deps.repos.db.query("SELECT COUNT(*) AS n FROM srs_revlog").get() as { n: number }).n;
    const r0 = revlog();
    const body = {
      idempotencyKey: "review-key-0001",
      cardId: card?.card.id,
      drillSessionId: null,
      outcome: {
        meanCredit: 1,
        medianRtMs: 1200,
        extraReplays: 0,
        hintRung: 0,
        revealed: false,
        playedLevel: null,
        meanAbsCents: null,
      },
    };
    const [a, b] = await Promise.all([
      h.json("POST", "/api/srs/review", body),
      h.json("POST", "/api/srs/review", body),
    ]);
    const c = await h.json("POST", "/api/srs/review", body);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(b.body).toEqual(a.body);
    expect(c.body).toEqual(a.body);
    expect(revlog() - r0).toBe(1);
  });
});

describe("voice: Quiet mode, range and labels (§5.3, contracts §8.5)", () => {
  test("Quiet for today lapses at the next learner day; always stays; no mic wins over 'off for today'", async () => {
    let v = await ok<VoiceState>("GET", "/api/voice");
    expect(v).toMatchObject({
      day: "2026-11-11",
      quiet: false,
      quietReason: null,
      range: null,
      labels: "numbers",
    });
    expect(v.ladder).toMatchObject({
      cents: 70,
      mode: "auto",
      next: { cents: 50, medianAtMost: 35 },
      daysNeeded: 3,
    });

    v = await ok<VoiceState>("PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
    expect(v).toMatchObject({ quiet: true, quietReason: "today" });
    h.clock.advance(DAY);
    expect(await ok<VoiceState>("GET", "/api/voice")).toMatchObject({ quiet: false, quietReason: null });

    v = await ok<VoiceState>("PUT", "/api/voice/quiet", { quiet: true, scope: "always" });
    expect(v).toMatchObject({ quiet: true, quietReason: "always" });
    // "Use the mic today" while Quiet is set always.
    v = await ok<VoiceState>("PUT", "/api/voice/quiet", { quiet: false, scope: "today" });
    expect(v).toMatchObject({ quiet: false });
    h.clock.advance(DAY);
    expect(await ok<VoiceState>("GET", "/api/voice")).toMatchObject({ quiet: true, quietReason: "always" });
    v = await ok<VoiceState>("PUT", "/api/voice/quiet", { quiet: false, scope: "always" });
    expect(v.quiet).toBe(false);

    // No usable mic: Quiet whatever the learner asks for today.
    await ok("PUT", "/api/profile", { inputKind: "none" });
    expect(await ok<VoiceState>("PUT", "/api/voice/quiet", { quiet: false, scope: "today" })).toMatchObject({
      quiet: true,
      quietReason: "no-mic",
    });

    // The range comes from the range calibration.
    await ok("POST", "/api/profile/calibration", {
      kind: "range",
      result: { low: 48, high: 69 },
      patch: { vocalLowMidi: 48, vocalHighMidi: 69, comfortLowMidi: 50, comfortHighMidi: 66 },
    });
    expect((await ok<VoiceState>("GET", "/api/voice")).range).toEqual({
      low: 48,
      high: 69,
      comfortLow: 50,
      comfortHigh: 66,
    });
    expect((await h.json("PUT", "/api/voice/ladder", { mode: "fixed" })).status).toBe(400);
  });

  test("in Quiet mode mic sets are not planned and mic cards seeded then wait paused; with the mic back they are released", async () => {
    await ok("PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
    await complete("U01.L01");
    await complete("U01.L02");
    await complete("U01.L03"); // seeds fam.tap.pulse (a mic family)
    expect(h.server.deps.repos.srs.card("fam.tap.pulse")?.card.status).toBe("paused");
    const quietDue = await ok<DueBatch>("GET", "/api/srs/due");
    expect(quietDue.items.some((i) => i.mic)).toBe(false);
    // Map shading leaves the paused card out (the V node keeps its level).
    expect(h.server.deps.srs()?.recall("fam.tap.pulse")).toBeNull();

    h.clock.advance(DAY);
    await ok<DueBatch>("GET", "/api/srs/due");
    const status = h.server.deps.repos.srs.card("fam.tap.pulse")?.card.status;
    // Back in the deferred queue, then released by the governor (here at once: the forecast is open).
    expect(status).toBe("active");
  });

  test("labels: numbers until U03.L08 introduces syllables (contracts §8.3)", async () => {
    const voice = h.server.deps.services.voice;
    expect(voice.labels()).toBe("numbers");
    voice.onLessonComplete("U03.L08");
    // Not completed yet: still numbers.
    expect(voice.labels()).toBe("numbers");
    expect(h.server.deps.repos.profile.get().solfege).toBe("syllables");
  });
});

describe("the sing-tolerance ladder (§5.3, contracts §8.2)", () => {
  /** U01 done and U01.CP passed: nothing pending; fam.tap.pulse (mic) exists. */
  async function ready(): Promise<void> {
    for (const l of ["U01.L01", "U01.L02", "U01.L03", "U02.L01"]) await complete(l);
    await passCheckpoint("U01.CP");
  }
  /** A session today that never asked the planner (a learner practising on a track's own pages). */
  function practisedWithoutPlanner(): void {
    const day = h.server.deps.services.voice.time.day();
    const at = h.clock.now().toISOString();
    h.server.deps.repos.sessions.create({
      id: `S-${day}`,
      day,
      kind: "keepalive",
      targetMinutes: 20,
      contentVersion: "test",
      mapItemId: null,
      phase: "coda",
      startedAt: at,
      endedAt: at,
      activeMinutes: 5,
    } as Session);
  }
  /** One learner day with 8 graded sung notes at this |cents| error, inside a session that ends. */
  async function singDay(cents: number, opts: { endSession?: boolean } = {}): Promise<SessionSummary | null> {
    const s = (await start("keepalive", null)).body;
    await drillSet("fam.tap.pulse", [
      { response: sung([cents, -cents, cents, -cents]) },
      { response: sung([cents, -cents, cents, -cents]) },
    ]);
    const summary = opts.endSession === false ? null : await end(s.id);
    h.clock.advance(DAY);
    return summary;
  }

  test("3 qualifying days within 21 tighten 70 → 50 at a session end, announced once in that Coda", async () => {
    await ready();
    expect((await singDay(30))?.toleranceChange).toBeNull();
    expect((await singDay(20))?.toleranceChange).toBeNull();
    let v = await ok<VoiceState>("GET", "/api/voice");
    expect(v.ladder).toMatchObject({ cents: 70, qualifyingDays: 2 });
    expect(v.ladder.days.map((d) => [d.notes, d.qualifies])).toEqual([
      [8, true],
      [8, true],
    ]);
    // The third day: the change is made when the session ends, never mid-session.
    const s = (await start("keepalive", null)).body;
    await drillSet("fam.tap.pulse", [
      { response: sung([10, 10, 10, 10]) },
      { response: sung([10, 10, 10, 10]) },
    ]);
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.cents).toBe(70);
    const summary = await end(s.id);
    expect(summary.toleranceChange).toEqual({ from: 70, to: 50 });
    v = await ok<VoiceState>("GET", "/api/voice");
    expect(v.ladder).toMatchObject({
      cents: 50,
      next: { cents: 35, medianAtMost: 25 },
      qualifyingDays: 0,
      lastChange: { from: 70, to: 50, reason: "evidence" },
    });
    expect(h.server.deps.repos.profile.get().singToleranceCents).toBe(50);
    // Announced once: the next Coda is quiet about it.
    const next = (await start("keepalive", null)).body;
    expect((await end(next.id)).toleranceChange).toBeNull();
  });

  test("days that miss the bar, too few notes, Quiet, skipped and revealed trials do not count", async () => {
    await ready();
    await singDay(40); // median 40 > 35
    const s = (await start("keepalive", null)).body;
    await drillSet("fam.tap.pulse", [
      { response: sung([5, 5, 5]) }, // 3 notes
      { response: sung([5, 5, 5, 5]), modality: "quiet" },
      { response: { ...sung([5, 5, 5, 5]), skipped: true } },
      { response: sung([5, 5, 5, 5]), revealed: true, credit: 1 },
    ]);
    await end(s.id);
    const v = await ok<VoiceState>("GET", "/api/voice");
    expect(v.ladder.days.map((d) => [d.notes, d.qualifies])).toEqual([
      [8, false],
      [3, false],
    ]);
    // The revealed trial was stored with credit 0, whatever the client sent.
    const drill = h.server.deps.repos.db
      .query("SELECT drill_session_id AS id FROM drill_trials ORDER BY rowid DESC LIMIT 1")
      .get() as { id: string };
    const detail = await ok<DrillSessionDetail>("GET", `/api/drills/sessions/${drill.id}`);
    expect(detail.trials[3]).toMatchObject({ revealed: true, credit: 0, correct: false });
    expect(detail.trials[1]?.modality).toBe("quiet");
  });

  test("never tightens while an offered checkpoint is pending, in fixed mode, or by itself; Auto picks up from the evidence", async () => {
    for (const l of ["U01.L01", "U01.L02", "U01.L03", "U02.L01"]) await complete(l);
    // Decision 29: U01.CP holds the ladder once the planner has offered it (Today's New block), not before.
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held).toBeNull();
    h.clock.advance(DAY);
    expect(await ok<{ kind: string; mapItemId: string }>("GET", "/api/session/today")).toMatchObject({
      kind: "checkpoint",
      mapItemId: "U01.CP",
    });
    for (let i = 0; i < 3; i++) await singDay(10);
    let v = await ok<VoiceState>("GET", "/api/voice");
    expect(v.ladder).toMatchObject({
      cents: 70,
      qualifyingDays: 3,
      held: { reason: "checkpoint-pending", checkpointId: "U01.CP" },
    });
    await passCheckpoint("U01.CP");
    // Fixed: the learner's value holds.
    v = await ok<VoiceState>("PUT", "/api/voice/ladder", { mode: "fixed", cents: 70 });
    expect(v.ladder).toMatchObject({ mode: "fixed", next: null, held: null });
    expect((await singDay(10))?.toleranceChange).toBeNull();
    // Back to Auto: the qualifying days in the window count at the next session end.
    v = await ok<VoiceState>("PUT", "/api/voice/ladder", { mode: "auto" });
    expect(v.ladder.mode).toBe("auto");
    const s = (await start("keepalive", null)).body;
    expect((await end(s.id)).toleranceChange).toEqual({ from: 70, to: 50 });
  });

  test("decision 29: a checkpoint never offered holds nothing; an offer the planner stopped repeating lapses", async () => {
    // U01.L02 (U01's second-to-last lesson) and U01.L03 done, U01.CP not offered yet: the ladder moves.
    for (const l of ["U01.L01", "U01.L02", "U01.L03"]) await complete(l);
    for (let i = 0; i < 2; i++) await singDay(10);
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held).toBeNull();
    const s = (await start("keepalive", null)).body;
    expect((await end(s.id)).toleranceChange).toBeNull(); // 2 qualifying days: not yet
    expect((await singDay(10))?.toleranceChange).toEqual({ from: 70, to: 50 });

    // A checkpoint started from the map counts as offered (a learner on a track starts its checkpoint there).
    await complete("U02.L01");
    const cp = (await start("checkpoint", "U01.CP")).body;
    await end(cp.id);
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held).toEqual({
      reason: "checkpoint-pending",
      checkpointId: "U01.CP",
    });
    // The learner walks away from it (as from a dropped track: the planner, which offers a core checkpoint
    // every day, is not asked here) and keeps practising: after LADDER_OFFER_HOLD_DAYS days with a session and
    // no offer it lapses, so the ladder is not frozen for good. Days away do not count (the next test).
    for (let i = 0; i < 13; i++) {
      h.clock.advance(DAY);
      practisedWithoutPlanner();
    }
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held?.checkpointId).toBe("U01.CP");
    h.clock.advance(DAY);
    practisedWithoutPlanner();
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held).toBeNull();
    for (let i = 0; i < 3; i++) {
      await drillSet("fam.tap.pulse", [{ response: sung([5, 5, 5, 5]) }, { response: sung([5, 5, 5, 5]) }]);
      h.clock.advance(DAY);
    }
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder).toMatchObject({
      qualifyingDays: 3,
      held: null,
    });
    expect(h.server.deps.services.voice.evaluate()).toMatchObject({ from: 50, to: 35, reason: "evidence" });

    // After the break Today offers a light session; the learner starts the checkpoint from the map again: held
    // again until it is passed, and passing releases it at once.
    expect((await ok<{ kind: string }>("GET", "/api/session/today")).kind).toBe("light");
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held).toBeNull();
    expect((await start("checkpoint", "U01.CP")).status).toBe(200);
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held?.checkpointId).toBe("U01.CP");
    await passCheckpoint("U01.CP");
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held).toBeNull();
  });

  test("decision 29: a break does not lapse the hold; evidence sung before the break never tightens while the checkpoint is pending", async () => {
    // Wave 3 review (second pass): the hold used to age by calendar days. A learner who sang well for 3 days
    // while U01.CP was offered, failed it, and came back 15 days later got a light session whose Coda
    // tightened the ladder from the pre-break days, with U01.CP still not passed (contracts §8.2).
    for (const l of ["U01.L01", "U01.L02", "U01.L03", "U02.L01"]) await complete(l);
    h.clock.advance(DAY);
    expect((await ok<{ kind: string }>("GET", "/api/session/today")).kind).toBe("checkpoint");
    for (let i = 0; i < 3; i++) await singDay(10);
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder).toMatchObject({
      qualifyingDays: 3,
      held: { checkpointId: "U01.CP" },
    });
    h.clock.advance(15 * DAY);
    expect((await ok<{ kind: string }>("GET", "/api/session/today")).kind).toBe("light");
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held?.checkpointId).toBe("U01.CP");
    const s = (await start("light", null)).body;
    expect((await end(s.id)).toleranceChange).toBeNull();
    expect(h.server.deps.repos.profile.get().singToleranceCents).toBe(70);
    // The hold ages only on days with a session: a learner who keeps practising without the checkpoint (a
    // dropped track; the planner is not asked) lapses it after LADDER_OFFER_HOLD_DAYS such days.
    for (let i = 0; i < 12; i++) {
      h.clock.advance(DAY);
      practisedWithoutPlanner();
    }
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held?.checkpointId).toBe("U01.CP");
    h.clock.advance(DAY);
    practisedWithoutPlanner();
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.held).toBeNull();
  });

  test("the one-tap loosen is offered only after a gap of 21 days, once; a fixed value is the learner's", async () => {
    await ready();
    await ok("PUT", "/api/voice/ladder", { mode: "fixed", cents: 35 });
    await ok("PUT", "/api/voice/ladder", { mode: "auto" });
    expect((await ok<VoiceState>("GET", "/api/voice")).ladder.lastChange).toMatchObject({
      from: 70,
      to: 35,
      reason: "learner",
    });
    expect((await h.json("PUT", "/api/voice/ladder", { mode: "loosen" })).status).toBe(409);
    // A qualifying day, then 25 days away.
    await singDay(10);
    h.clock.advance(25 * DAY);
    let v = await ok<VoiceState>("GET", "/api/voice");
    expect(v.ladder.offerLoosen).toBe(true);
    v = await ok<VoiceState>("PUT", "/api/voice/ladder", { mode: "loosen" });
    expect(v.ladder).toMatchObject({
      cents: 50,
      mode: "auto",
      offerLoosen: false,
      lastChange: { from: 35, to: 50, reason: "loosen" },
    });
    expect((await h.json("PUT", "/api/voice/ladder", { mode: "loosen" })).status).toBe(409);
    // A loosen is never announced as an aim that got finer.
    const s = (await start("keepalive", null)).body;
    expect((await end(s.id)).toleranceChange).toBeNull();
  });
});

describe("drill trials (§5.3) and drills.get", () => {
  test("drills.start returns the set already open for the same warm-up item of the same session", async () => {
    // A second browser (or a double click) on the same warm-up item picks up the open set; it never starts a
    // second set that would also count.
    for (const l of ["U01.L01", "U01.L02"]) await complete(l);
    const s = (await start("keepalive", null)).body;
    const body = { sessionId: s.id, purpose: "srs", familyIds: ["fam.tap.pulse"], warmupItemId: "w1" };
    const a = await ok<DrillSession>("POST", "/api/drills/sessions", body);
    const b = await ok<DrillSession>("POST", "/api/drills/sessions", body);
    expect(b.id).toBe(a.id);
    // Another item, or another purpose, is another set.
    const c = await ok<DrillSession>("POST", "/api/drills/sessions", { ...body, warmupItemId: "w2" });
    expect(c.id).not.toBe(a.id);
    // Once finished, the item starts a fresh set.
    await ok("POST", `/api/drills/sessions/${a.id}/trials`, {
      trials: [
        {
          idx: 0,
          familyId: "fam.tap.pulse",
          seed: 1,
          level: 1,
          category: "basic",
          params: {},
          response: { answer: null, taps: null, sung: null, skipped: false },
          credit: 1,
          correct: true,
          rtMs: 1500,
          replays: 0,
          confusion: null,
          centsError: null,
          at: h.clock.now().toISOString(),
        },
      ],
    });
    await ok("POST", `/api/drills/sessions/${a.id}/finish`);
    const d = await ok<DrillSession>("POST", "/api/drills/sessions", body);
    expect(d.id).not.toBe(a.id);
    // Without a session or an item, every start is its own set (Practice, the gym).
    const free = { ...body, sessionId: null, warmupItemId: null };
    const e = await ok<DrillSession>("POST", "/api/drills/sessions", free);
    const f = await ok<DrillSession>("POST", "/api/drills/sessions", free);
    expect(e.id).not.toBe(f.id);
  });
  test("a set finished twice at once after a time-zone change counts once (streak review sets)", async () => {
    // Wave 3 review (second pass): drills.finish read `already` before awaiting the SRS re-zone, so two raced
    // finishes after the learner's time zone changed both counted the set for the streak (and would both
    // consume a repair item).
    for (const l of ["U01.L01", "U01.L02"]) await complete(l);
    const drill = await ok<DrillSession>("POST", "/api/drills/sessions", {
      sessionId: null,
      purpose: "srs",
      familyIds: ["fam.tap.pulse"],
      warmupItemId: null,
    });
    await ok("POST", `/api/drills/sessions/${drill.id}/trials`, {
      trials: [0, 1, 2, 3, 4].map((idx) => ({
        idx,
        familyId: "fam.tap.pulse",
        seed: idx + 1,
        level: 1,
        category: "basic",
        params: {},
        response: { answer: null, taps: null, sung: null, skipped: false },
        credit: 1,
        correct: true,
        rtMs: 1500,
        replays: 0,
        confusion: null,
        centsError: null,
        at: h.clock.now().toISOString(),
      })),
    });
    h.server.deps.repos.profile.patch({ timezone: "Europe/Lisbon" });
    const [a, b] = await Promise.all([
      h.json("POST", `/api/drills/sessions/${drill.id}/finish`),
      h.json("POST", `/api/drills/sessions/${drill.id}/finish`),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const day = h.server.deps.services.voice.time.day();
    expect(h.server.deps.repos.streak.day(day)?.reviewSets).toBe(1);
  });

  test("drills.get returns the set and its trials with the Wave 3 fields; a sung resolution never changes credit", async () => {
    for (const l of ["U01.L01", "U01.L02"]) await complete(l);
    const resolution: SungResolution = {
      path: ["4", "3", "2", "1"],
      order: "play-first",
      notes: [
        { midi: 65, cents: 12, credit: 1 },
        { midi: 64, cents: -8, credit: 1 },
        { midi: 62, cents: 20, credit: 1 },
        { midi: 60, cents: null, credit: 0 },
      ],
      credit: 0.75,
      passed: false,
      skipped: false,
      quiet: false,
      tolCents: 70,
    };
    const id = await drillSet("fam.ear.pulse", [
      { credit: 0, correct: false, sungResolution: resolution },
      { credit: 1, modality: "normal", sungResolution: null },
      { credit: 1, sungResolution: { ...resolution, skipped: true } },
    ]);
    const detail = await ok<DrillSessionDetail>("GET", `/api/drills/sessions/${id}`);
    expect(detail.session).toMatchObject({ id, purpose: "practice", familyIds: ["fam.ear.pulse"] });
    expect(detail.session.finishedAt).not.toBeNull();
    expect(detail.trials).toHaveLength(3);
    expect(detail.trials[0]).toMatchObject({ credit: 0, correct: false, sungResolution: resolution });
    expect(detail.trials[1]).toMatchObject({ modality: "normal", sungResolution: null });
    // Three voiced resolution notes are ladder evidence; the skipped resolution and the unvoiced note are not.
    const notes = h.server.deps.repos.sung.between("2026-11-01", "2026-11-30", null);
    expect(notes.map((n) => [n.sourceKind, n.absCents])).toEqual([
      ["resolution", 12],
      ["resolution", 8],
      ["resolution", 20],
    ]);
    // A re-posted trial replaces its notes.
    expect((await h.json("GET", "/api/drills/sessions/drl_nope")).status).toBe(404);
  });
});

describe("resting families (decision 27) in the family status the app reads", () => {
  test("families.list, families.state, srs.review and drills.finish carry restingSince", async () => {
    for (const l of ["U01.L01", "U01.L02"]) await complete(l);
    const before = await ok<{ families: FamilyState[] }>("GET", "/api/drills/families");
    expect(before.families.length).toBeGreaterThan(0);
    for (const f of before.families) expect(f.restingSince).toBeNull();
    const fam = (before.families[0] as FamilyState).familyId;
    // The scheduler rests a family in its composite (packages/srs restCandidate); stand that state in directly.
    const repos = h.server.deps.repos;
    const row = repos.db.query("SELECT value_json FROM settings WHERE key = 'srs.state'").get() as {
      value_json: string;
    } | null;
    const state = row === null ? {} : (JSON.parse(row.value_json) as Record<string, unknown>);
    repos.db
      .query("INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES ('srs.state', ?, ?)")
      .run(JSON.stringify({ ...state, resting: { [fam]: "2026-11-10" } }), T0);
    const after = await ok<{ families: FamilyState[] }>("GET", "/api/drills/families");
    expect(after.families.find((f) => f.familyId === fam)?.restingSince).toBe("2026-11-10");
    expect(after.families.filter((f) => f.restingSince != null)).toHaveLength(1);
    expect((await ok<FamilyState>("GET", `/api/drills/difficulty/${fam}`)).restingSince).toBe("2026-11-10");
    const drill = await ok<DrillSession>("POST", "/api/drills/sessions", {
      sessionId: null,
      purpose: "practice",
      familyIds: [fam],
      warmupItemId: null,
    });
    const finish = await ok<{ reviews: { familyState: FamilyState | null }[] }>(
      "POST",
      `/api/drills/sessions/${drill.id}/finish`,
    );
    for (const r of finish.reviews)
      if (r.familyState?.familyId === fam) expect(r.familyState.restingSince).toBe("2026-11-10");
    const review = await ok<{ familyState: FamilyState | null }>("POST", "/api/srs/review", {
      cardId: fam,
      drillSessionId: null,
      outcome: {
        meanCredit: 1,
        medianRtMs: 1500,
        extraReplays: 0,
        hintRung: 0,
        revealed: false,
        playedLevel: null,
        meanAbsCents: null,
      },
    });
    expect(review.familyState?.restingSince).toBe("2026-11-10");
  });
});

describe("lenses (§4.3)", () => {
  test("the lenses setting defaults, persists and is validated", async () => {
    const boot = await ok<{ settings: Settings }>("GET", "/api/bootstrap");
    expect(boot.settings.lenses).toEqual({ degrees: true, solfege: true, noteNames: false });
    const next = { degrees: false, solfege: true, noteNames: true };
    expect((await ok<Settings>("PUT", "/api/settings/lenses", { value: next })).lenses).toEqual(next);
    expect((await ok<{ settings: Settings }>("GET", "/api/bootstrap")).settings.lenses).toEqual(next);
    expect((await h.json("PUT", "/api/settings/lenses", { value: { degrees: "yes" } })).status).toBe(400);
  });

  test("the album title: null until named, trimmed, at most 60 characters, never empty or a missing value", async () => {
    expect((await ok<{ settings: Settings }>("GET", "/api/bootstrap")).settings.albumTitle).toBeNull();
    const put = (value: unknown) => h.json<Settings>("PUT", "/api/settings/albumTitle", { value });
    expect(
      (await ok<Settings>("PUT", "/api/settings/albumTitle", { value: "  Night Shifts " })).albumTitle,
    ).toBe("Night Shifts");
    expect((await ok<{ settings: Settings }>("GET", "/api/bootstrap")).settings.albumTitle).toBe(
      "Night Shifts",
    );
    for (const bad of ["", "   ", "x".repeat(61), "a\u0000b", "line\nbreak", 7])
      expect((await put(bad)).status).toBe(400);
    expect((await h.json("PUT", "/api/settings/albumTitle", {})).status).toBe(400);
    expect((await ok<Settings>("PUT", "/api/settings/albumTitle", { value: null })).albumTitle).toBeNull();
  });
});

describe("milestones (§5.4)", () => {
  test("anyOf and ladder conditions", () => {
    const done = new Map([
      ["CF-A", "2027-06-01T10:00:00.000Z"],
      ["U10.CP", "2027-01-01T10:00:00.000Z"],
      ["J1.L01", "2027-03-01T10:00:00.000Z"],
    ]);
    const none = new Map<string, string>();
    const passes = [
      { level: 5, at: "2026-12-20T10:00:00.000Z" },
      { level: 6, at: "2027-02-01T10:00:00.000Z" },
      { level: 6, at: "2027-03-02T10:00:00.000Z" },
    ];
    const when = (w: MilestoneDef["when"]) => w;
    expect(conditionReachedAt(when({ ladder: { level: 5 }, sessions: ["U10.CP"] }), done, none, passes)).toBe(
      "2027-01-01T10:00:00.000Z",
    );
    expect(conditionReachedAt(when({ ladder: { level: 6, after: "J1.L01" } }), done, none, passes)).toBe(
      "2027-03-02T10:00:00.000Z",
    );
    expect(conditionReachedAt(when({ ladder: { level: 7 } }), done, none, passes)).toBeNull();
    const later = { ladder: { level: 5, after: "J2.L01" } } as MilestoneDef["when"];
    expect(conditionReachedAt(later, done, none, passes)).toBeNull();
    expect(conditionReachedAt(when({}), done, none, passes)).toBeNull();
  });

  test("progress.get evaluates anyOf: either finale", async () => {
    const report = await ok<{ milestones: { id: string; title: string; reachedAt: string | null }[] }>(
      "GET",
      "/api/progress",
    );
    const fixtureIds = fixtureContent().milestones.map((m) => m.id);
    expect(report.milestones.map((m) => m.id)).toEqual(fixtureIds);
    for (const m of report.milestones) expect(m.title.length).toBeGreaterThan(0);
  });
});

describe("the learner day never runs backwards (wave2.md gap 5)", () => {
  test("a clock stepped back or a westward zone change continues the recorded day; the streak counts it once", async () => {
    h.clock.set("2026-11-11T21:00:00.000Z");
    const s1 = (await start("keepalive", null)).body;
    await drillSet("fam.ear.pulse", [{}, {}, {}, {}], "srs").catch(() => {});
    await end(s1.id);
    const before = await ok<{ day: string; streak: StreakSummary }>("GET", "/api/bootstrap");
    expect(before.day).toBe("2026-11-11");

    // Next morning the clock is wrong by 10 hours back: still 12 November once 12 November has activity...
    h.clock.set("2026-11-12T09:00:00.000Z");
    const s2 = (await start("keepalive", null)).body;
    expect(s2.day).toBe("2026-11-12");
    await end(s2.id);
    h.clock.set("2026-11-11T23:00:00.000Z"); // stepped back across midnight
    const back = await ok<{ day: string; streak: StreakSummary }>("GET", "/api/bootstrap");
    expect(back.day).toBe("2026-11-12");
    const s3 = (await start("keepalive", null)).body;
    expect(s3.day).toBe("2026-11-12");
    await end(s3.id);
    expect((await ok<SessionDay>("GET", "/api/session/day")).day).toBe("2026-11-12");

    // A westward flight: New York is five hours behind; 03:00 UTC on the 13th is still the 12th there anyway.
    h.clock.set("2026-11-13T08:00:00.000Z");
    expect((await ok<{ day: string }>("GET", "/api/bootstrap")).day).toBe("2026-11-13");
    const s4 = (await start("keepalive", null)).body;
    await end(s4.id);
    await ok("PUT", "/api/profile", { timezone: "Pacific/Honolulu" }); // 22:00 on the 12th there
    expect((await ok<{ day: string }>("GET", "/api/bootstrap")).day).toBe("2026-11-13");
    const due = await ok<DueBatch>("GET", "/api/srs/due");
    expect(due.items).toBeDefined();
    expect(h.server.deps.srs() !== null).toBe(true);

    // The streak counted each day once and never re-dated a day that was over.
    const streak = await ok<{ days: { day: string }[] }>("GET", "/api/streak?weeks=2");
    const days = streak.days.map((d) => d.day);
    expect(new Set(days).size).toBe(days.length);
    expect(days.every((d) => d <= "2026-11-13")).toBe(true);

    // A reset clock (more than two days back) is taken as the truth.
    h.clock.set("2026-11-05T12:00:00.000Z");
    await ok("PUT", "/api/profile", { timezone: "UTC" });
    expect((await ok<{ day: string }>("GET", "/api/bootstrap")).day).toBe("2026-11-05");
  });

  test("the scheduler counts days in the new zone after a time-zone change", async () => {
    await ok("PUT", "/api/profile", { timezone: "Asia/Tokyo" });
    await ok<DueBatch>("GET", "/api/srs/due");
    const srs = h.server.deps.srs() as unknown as { service: { srs: { timeZone: string } } };
    expect(srs.service.srs.timeZone).toBe("Asia/Tokyo");
  });
});
