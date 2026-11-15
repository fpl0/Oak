// "Try again" inside drill trials, proven against the REAL server (the real course, its own temp data dir): the drill
// machine plays the same set twice — once straight, once with practice takes on a right trial and on wrong ones —
// and posts through the server's own routes. The SRS card, mastery, the family's level and stats, the streak and
// the set's rating come out identical; only the stored trials' `retries` differ (docs/design/retry.md §3.3, §4;
// contracts §7.2: the first answer is the trial's credit).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DrillFinish, DrillSession, DrillTrialRecord, FamilyDef, Trial } from "@oak/api";
import { createRegistry, DEFAULT_PROFILE, gradeTrial, type TrialResponse } from "@oak/drills";
import { createActor, fromCallback, fromPromise, waitFor } from "xstate";
import { families } from "../../../content/families.ts";
import { all } from "../../../server/src/db/index.ts";
import { realCourse } from "../../../server/src/testing/course.ts";
import { type Harness, harness } from "../../../server/src/testing/harness.ts";
import { type DrillDeps, drillMachine, shownOutcome } from "./machine.ts";
import { answerOf, expectedValueOf, planDrillSet, surfaceOf } from "./model.ts";

const FAMILY = "fam.pit.compare";
const NOW = "2026-11-11T12:00:00.000Z";
const registry = createRegistry(families, []);
const def = (id: string) => families.find((f) => f.id === id) as FamilyDef;

const deps: DrillDeps = {
  grade: (trial, response: TrialResponse) =>
    gradeTrial(registry.family(trial.family), trial, response, DEFAULT_PROFILE),
  gradeResolution: () => ({ credit: 0, passed: false, sung: [] }),
  sungOf: () => [],
  // Every answer at the same moment it opened: response times cannot differ between the two runs.
  now: () => 0,
  iso: () => NOW,
};

async function learner(): Promise<Harness> {
  const h = await harness({ dev: true, content: await realCourse(), now: NOW });
  h.server.deps.repos.profile.patch({ timezone: "UTC" });
  const seeded = await h.json("POST", "/api/dev/seed", { point: "after U02.CP" });
  expect(seeded.status).toBe(200);
  return h;
}

/** Everything a set can change, without ids or the trial rows. */
async function state(h: Harness) {
  const db = h.server.deps.repos.db;
  const strip = (rows: Record<string, unknown>[]) =>
    rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).filter(([k]) => !/(^id$|_id$|session)/.test(k) || k === "card_id"),
      ),
    );
  return {
    evidence: all(
      db,
      "SELECT skill_id, score, weight, source_kind FROM evidence ORDER BY skill_id, score, weight",
    ),
    skills: all(db, "SELECT * FROM skill_state ORDER BY skill_id"),
    cards: strip(all(db, "SELECT * FROM srs_cards ORDER BY card_id") as Record<string, unknown>[]),
    revlog: strip(all(db, "SELECT * FROM srs_revlog ORDER BY card_id, rowid") as Record<string, unknown>[]),
    difficulty: (await h.json("GET", `/api/drills/difficulty/${FAMILY}`)).body,
    streak: (await h.json("GET", "/api/streak")).body,
  };
}

/**
 * Plays one set of `FAMILY` on the real server through the drill machine. `pattern[i]` is whether trial i's FIRST
 * answer is right; `practice[i]` is the practice takes after it (each right or wrong).
 */
async function playSet(
  h: Harness,
  pattern: boolean[],
  practice: Record<number, boolean[]>,
): Promise<{ finish: DrillFinish; stored: DrillTrialRecord[]; shown: boolean[][] }> {
  const started = await h.json<DrillSession>("POST", "/api/drills/sessions", {
    sessionId: null,
    purpose: "srs",
    familyIds: [FAMILY],
    warmupItemId: null,
  });
  expect(started.status).toBe(200);
  const session = started.body;
  // The same trials in both runs (the server's setId is random): what differs is only the practice takes.
  const { trials } = planDrillSet(
    registry.family(FAMILY as never),
    { ...session, setId: "set_retry_proof" },
    null,
    DEFAULT_PROFILE,
  );
  const total = Math.min(trials.length, pattern.length);
  const url = `/api/drills/sessions/${session.id}/trials`;
  // The runner's best-effort sends, in order (runtime.ts `send`), then `finish` posts every record again.
  let queue: Promise<unknown> = Promise.resolve();
  const post = (records: DrillTrialRecord[]) => {
    queue = queue.then(async () => {
      const r = await h.json("POST", url, { trials: records });
      expect(r.status).toBe(200);
    });
    return queue;
  };
  const machine = drillMachine.provide({
    actors: {
      start: fromPromise(async () => ({
        session,
        source: { total, at: (i: number) => trials[i] as (typeof trials)[number] },
      })),
      present: fromCallback(() => () => {}),
      audition: fromCallback(({ sendBack }) => {
        sendBack({ type: "AUDITION_DONE" });
        return () => {};
      }),
      finish: fromPromise(async ({ input }) => {
        await post(input.records);
        const fin = await h.json<DrillFinish>("POST", `/api/drills/sessions/${session.id}/finish`);
        expect(fin.status).toBe(200);
        return fin.body;
      }),
    },
    actions: {
      persist: () => {},
      send: (_, p) => void post([p.record]),
      done: () => {},
    },
  });
  const actor = createActor(machine, {
    input: {
      purpose: "srs",
      familyIds: [FAMILY as never],
      warmupItemId: null,
      sessionId: null,
      quiet: false,
      tolCents: 50,
      resume: null,
      deps,
    },
  });
  actor.start();
  const answer = (right: boolean) => {
    const trial = actor.getSnapshot().context.current?.trial as Trial;
    const surface = surfaceOf(trial, def(trial.family));
    if (surface.kind !== "widget") throw new Error("not a widget trial");
    const expected = expectedValueOf(surface.spec, trial.expected) as string[];
    const other = (surface.spec as { options: { id: string }[] }).options.find((o) => o.id !== expected[0]);
    actor.send({ type: "SUBMIT", answer: answerOf(surface.spec, right ? expected : [other?.id as string]) });
  };
  const shown: boolean[][] = [];
  for (let i = 0; i < total; i++) {
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }) && st.context.index === i);
    actor.send({ type: "PRESENTED" });
    answer(pattern[i] as boolean);
    const verdicts = [shownOutcome(actor.getSnapshot().context)?.result.correct ?? false];
    for (const right of practice[i] ?? []) {
      actor.send({ type: "RETRY" });
      actor.send({ type: "PRESENTED" });
      answer(right);
      verdicts.push(shownOutcome(actor.getSnapshot().context)?.result.correct ?? false);
    }
    shown.push(verdicts);
    actor.send({ type: "NEXT" });
  }
  await waitFor(actor, (st) => st.matches("summary"));
  const finish = actor.getSnapshot().context.finish as DrillFinish;
  actor.stop();
  return { finish, stored: h.server.deps.repos.srs.trials(session.id), shown };
}

describe("practice takes in a drill set, on the real server", () => {
  let straight: Harness;
  let retried: Harness;
  beforeAll(async () => {
    [straight, retried] = await Promise.all([learner(), learner()]);
  });
  afterAll(async () => {
    await Promise.all([straight?.close(), retried?.close()]);
  });

  test("change neither the SRS card, mastery, the family's level and stats, nor the streak", async () => {
    // Two wrong first answers of six: the set is rated on 4/6, however the practice takes go.
    const pattern = [true, false, true, false, true, true];
    const before = await state(retried);
    expect(await state(straight)).toEqual(before);

    const a = await playSet(straight, pattern, {});
    const b = await playSet(retried, pattern, { 0: [false], 1: [true, true], 3: [true] });

    // The practice takes were judged and shown…
    expect(b.shown[0]).toEqual([true, false]);
    expect(b.shown[1]).toEqual([false, true, true]);
    expect(b.shown[3]).toEqual([false, true]);
    // …and stored only as a count: every trial keeps its first answer.
    expect(b.stored.map((t) => [t.idx, t.correct, t.retries ?? 0])).toEqual([
      [0, true, 1],
      [1, false, 2],
      [2, true, 0],
      [3, false, 1],
      [4, true, 0],
      [5, true, 0],
    ]);
    expect(b.stored.map((t) => t.credit)).toEqual(a.stored.map((t) => t.credit));

    // The set's rating and everything it touches are the straight run's.
    expect(b.finish.meanCredit).toBeCloseTo(a.finish.meanCredit, 10);
    expect(b.finish.reviews.map((r) => r.rating)).toEqual(a.finish.reviews.map((r) => r.rating));
    const after = await state(retried);
    expect(after).toEqual(await state(straight));
    // And the set did count (the comparison is not vacuous).
    expect(after.revlog.length).toBeGreaterThan(before.revlog.length);
  });
});
