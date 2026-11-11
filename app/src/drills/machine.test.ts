import { describe, expect, test } from "bun:test";
import type { DrillFinish, DrillSession, FamilyDef, Trial } from "@oak/api";
import { createRegistry, DEFAULT_PROFILE, gradeTrial, type TrialResponse } from "@oak/drills";
import { createActor, fromCallback, fromPromise, waitFor } from "xstate";
import { families } from "../../../content/families.ts";
import {
  type DrillDeps,
  type DrillInput,
  drillMachine,
  type ResumeState,
  type TrialSource,
} from "./machine.ts";
import { answerOf, expectedValueOf, planDrillSet, surfaceOf } from "./model.ts";

const registry = createRegistry(families, []);
const def = (id: string) => families.find((f) => f.id === id) as FamilyDef;

function session(familyId: string, trials: number, level = 1): DrillSession {
  const d = def(familyId);
  return {
    id: `drl_${familyId}`,
    sessionId: null,
    purpose: "srs",
    familyIds: [familyId as DrillSession["familyIds"][number]],
    setId: `set_${familyId}`,
    levels: { [familyId]: level },
    openCategories: { [familyId]: d.levels[level - 1]?.categories ?? [] },
    focus: {},
    trialsPlanned: trials,
    startedAt: "2026-11-11T10:00:00.000Z",
    finishedAt: null,
  };
}

function sourceFor(s: DrillSession): TrialSource {
  const familyId = s.familyIds[0] as string;
  const { trials } = planDrillSet(registry.family(familyId as never), s, null, DEFAULT_PROFILE);
  return { total: trials.length, at: (i) => trials[i] as (typeof trials)[number] };
}

let clock = 1_000;
const deps: DrillDeps = {
  grade: (trial, response: TrialResponse) =>
    gradeTrial(registry.family(trial.family), trial, response, DEFAULT_PROFILE),
  gradeResolution: () => ({ credit: 0.75, sung: [{ midi: 64, cents: 12, credit: 1 }] }),
  sungOf: () => [{ midi: 61, cents: 30, credit: 1 }],
  now: () => clock,
  iso: () => "2026-11-11T10:01:00.000Z",
};

interface Spy {
  persisted: number[];
  sent: number[];
  finished: number[] | null;
  done: number;
}

function run(
  s: DrillSession,
  opts: { resume?: ResumeState | null; source?: TrialSource; failStart?: number } = {},
) {
  const spy: Spy = { persisted: [], sent: [], finished: null, done: 0 };
  let starts = 0;
  const machine = drillMachine.provide({
    actors: {
      start: fromPromise(async () => {
        starts++;
        if (opts.failStart && starts <= opts.failStart) throw new Error("server is offline");
        return { session: s, source: opts.source ?? sourceFor(s) };
      }),
      present: fromCallback(() => () => {}),
      audition: fromCallback(({ sendBack }) => {
        sendBack({ type: "AUDITION_DONE" });
        return () => {};
      }),
      resolve: fromCallback(() => () => {}),
      finish: fromPromise(async ({ input }) => {
        spy.finished = input.records.map((r) => r.idx);
        return {
          session: { ...s, finishedAt: "2026-11-11T10:02:00.000Z" },
          meanCredit: 1,
          medianRtMs: 800,
          reviews: [],
          evidence: [],
          streak: {} as DrillFinish["streak"],
        } as DrillFinish;
      }),
    },
    actions: {
      persist: (_, p) => spy.persisted.push(p.ctx.index),
      send: (_, p) => spy.sent.push(p.record.idx),
      done: () => {
        spy.done++;
      },
    },
  });
  const input: DrillInput = {
    purpose: "srs",
    familyIds: s.familyIds,
    warmupItemId: null,
    sessionId: null,
    quiet: false,
    resume: opts.resume ?? null,
    deps,
  };
  const actor = createActor(machine, { input });
  actor.start();
  return { actor, spy };
}

/** Answers the current choice trial with the expected answer (or a wrong one). */
function answer(actor: ReturnType<typeof run>["actor"], right: boolean) {
  const ctx = actor.getSnapshot().context;
  const trial = ctx.current?.trial as Trial;
  const surface = surfaceOf(trial, def(trial.family));
  if (surface.kind !== "widget") throw new Error("not a widget trial");
  const expected = expectedValueOf(surface.spec, trial.expected) as string[];
  const value = right
    ? expected
    : [
        ((surface.spec as { options: { id: string }[] }).options.find((o) => o.id !== expected[0])?.id ??
          "x") as string,
      ];
  actor.send({ type: "SUBMIT", answer: answerOf(surface.spec, value) });
}

describe("drill machine", () => {
  test("plays a set of real pitch-compare trials to the summary and records each one", async () => {
    const s = session("fam.pit.compare", 4);
    const { actor, spy } = run(s);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    for (let i = 0; i < 4; i++) {
      expect(actor.getSnapshot().context.index).toBe(i);
      actor.send({ type: "PRESENTED" });
      expect(actor.getSnapshot().matches({ trial: "answering" })).toBe(true);
      clock += 900;
      answer(actor, i !== 2);
      const snap = actor.getSnapshot();
      expect(snap.matches("feedback")).toBe(true);
      expect(snap.context.outcomes[i]?.result.correct).toBe(i !== 2);
      expect(snap.context.records[i]?.rtMs).toBe(900);
      if (i === 2) expect(snap.context.records[i]?.confusion).not.toBeNull();
      actor.send({ type: "NEXT" });
    }
    await waitFor(actor, (st) => st.matches("summary"));
    expect(spy.finished).toEqual([0, 1, 2, 3]);
    expect(spy.sent).toEqual([0, 1, 2, 3]);
    expect(spy.done).toBe(1);
    // Persisted at each trial start and after each answer, always pointing at the next trial to run.
    expect(spy.persisted).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });

  test("an answer given while the stimulus still plays is accepted with a zero response time", async () => {
    const { actor } = run(session("fam.pit.compare", 2));
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    answer(actor, true);
    expect(actor.getSnapshot().context.records[0]?.rtMs).toBe(0);
  });

  test("replays are counted per trial; Show me reveals with no credit; the cue replays the cadence", async () => {
    const { actor } = run(session("fam.pit.compare", 2));
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "REPLAY" });
    expect(actor.getSnapshot().matches({ trial: "presenting" })).toBe(true);
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "REPLAY" });
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "CUE" });
    expect(actor.getSnapshot().matches({ trial: "cueing" })).toBe(true);
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "REVEAL" });
    const ctx = actor.getSnapshot().context;
    expect(ctx.outcomes[0]?.revealed).toBe(true);
    expect(ctx.records[0]).toMatchObject({ credit: 0, correct: false, replays: 2 });
    expect(ctx.records[0]?.response.skipped).toBe(false);
    // Feedback auditions come back to idle.
    actor.send({ type: "AUDITION", what: "answer" });
    expect(actor.getSnapshot().matches({ feedback: "idle" })).toBe(true);
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.replays).toBe(0);
  });

  test("tap trials are graded from the captured taps (perfect taps pass the pulse)", async () => {
    const s = session("fam.rhy.pulse", 1);
    const { actor } = run(s);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    // A widget answer is refused for a tap trial.
    actor.send({ type: "SUBMIT", answer: { choice: ["x"] } });
    expect(actor.getSnapshot().matches({ trial: "presenting" })).toBe(true);
    const trial = actor.getSnapshot().context.current?.trial as Trial;
    const taps = trial.params.tapTargets as number[];
    actor.send({ type: "CAPTURED", taps: taps.map((t) => t + 0.01) });
    const ctx = actor.getSnapshot().context;
    expect(ctx.outcomes[0]?.result.correct).toBe(true);
    expect(ctx.records[0]?.response.taps).toHaveLength(taps.length);
    actor.send({ type: "NEXT" });
    await waitFor(actor, (st) => st.matches("summary"));
  });

  test("a sung part can be skipped with Shift+S: logged, no evidence, no penalty", async () => {
    const { actor } = run(session("fam.pit.match", 2));
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "MIC_ERROR", message: "Microphone access was blocked." });
    expect(actor.getSnapshot().context.micError).toContain("blocked");
    actor.send({ type: "SKIP_SUNG" });
    const rec = actor.getSnapshot().context.records[0];
    expect(rec?.response.skipped).toBe(true);
    actor.send({ type: "NEXT" });
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "CAPTURED", frames: [] });
    expect(actor.getSnapshot().context.outcomes[1]?.sung).toEqual([{ midi: 61, cents: 30, credit: 1 }]);
  });

  test("a sung resolution follows an FET trial that asks for one and never changes its credit", async () => {
    const base = sourceFor(session("fam.pit.compare", 2));
    const source: TrialSource = {
      total: 2,
      at: (i) => {
        const p = base.at(i, []);
        return i === 0
          ? { ...p, trial: { ...p.trial, params: { ...p.trial.params, sungResolution: true } } }
          : p;
      },
    };
    const { actor } = run(session("fam.pit.compare", 2), { source });
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "PRESENTED" });
    answer(actor, true);
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().matches({ resolution: "running" })).toBe(true);
    actor.send({ type: "CAPTURED", frames: [] });
    const ctx = actor.getSnapshot().context;
    expect(ctx.outcomes[0]?.resolutionCredit).toBe(0.75);
    expect(ctx.outcomes[0]?.result.credit).toBe(1);
    expect(ctx.records[0]?.response.sung).toHaveLength(1);
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.index).toBe(1);
    // The second trial has no resolution.
    actor.send({ type: "PRESENTED" });
    answer(actor, true);
    actor.send({ type: "NEXT" });
    await waitFor(actor, (st) => st.matches("summary"));
  });

  test("a resumed set starts at its next trial and finishes with every record", async () => {
    const s = session("fam.pit.compare", 3);
    // Play two trials, keep what was persisted, then resume in a fresh actor.
    const first = run(s);
    await waitFor(first.actor, (st) => st.matches({ trial: "presenting" }));
    for (let i = 0; i < 2; i++) {
      first.actor.send({ type: "PRESENTED" });
      answer(first.actor, true);
      first.actor.send({ type: "NEXT" });
    }
    const ctx = first.actor.getSnapshot().context;
    const before = ctx.current?.trial.seed;
    first.actor.stop();
    const resume: ResumeState = {
      session: s,
      outcomes: ctx.outcomes.slice(0, 2),
      records: ctx.records.slice(0, 2),
    };
    const second = run(s, { resume });
    await waitFor(second.actor, (st) => st.matches({ trial: "presenting" }));
    const snap = second.actor.getSnapshot().context;
    expect(snap.index).toBe(2);
    expect(snap.current?.trial.seed).toBe(before);
    expect(snap.trials).toHaveLength(3);
    second.actor.send({ type: "PRESENTED" });
    answer(second.actor, true);
    second.actor.send({ type: "NEXT" });
    await waitFor(second.actor, (st) => st.matches("summary"));
    expect(second.spy.finished).toEqual([0, 1, 2]);
  });

  test("a set resumed after its last answer goes straight to finishing", async () => {
    const s = session("fam.pit.compare", 1);
    const first = run(s);
    await waitFor(first.actor, (st) => st.matches({ trial: "presenting" }));
    first.actor.send({ type: "PRESENTED" });
    answer(first.actor, true);
    const ctx = first.actor.getSnapshot().context;
    first.actor.stop();
    const second = run(s, { resume: { session: s, outcomes: ctx.outcomes, records: ctx.records } });
    await waitFor(second.actor, (st) => st.matches("summary"));
    expect(second.spy.finished).toEqual([0]);
  });

  test("a failed start can be retried", async () => {
    const { actor } = run(session("fam.pit.compare", 1), { failStart: 1 });
    await waitFor(actor, (st) => st.matches("failed"));
    expect(actor.getSnapshot().context.error).toBe("server is offline");
    actor.send({ type: "RETRY" });
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
  });
});
