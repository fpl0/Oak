// The Wave 5 shapes the player hosts, against the real grader realm: every authored test of the dev fixture
// (U11.L99) through `gradeStep` as the player sends it (the form strip, the 12-bar grid, the scale builder, the
// shuffle tapped, the investigate question, "match this sound" on the `controls` matcher and the bass-line Make); and every musical claim of the fixture checked in headless Strudel and `@oak/theory`.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AttemptResponse, Exercise, SessionId } from "@oak/api";
import { evaluateForGrading, gradeExercise, initRealm } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { degreeOf, readChord, scaleDegrees } from "@oak/theory";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import fixture, {
  AABA,
  FIXTURE5_CONTEXT,
  FIXTURE5_EXTRA,
  HARMONICS,
  MAKE_PASS,
  MATCH_REFERENCE,
  SHUFFLE,
  SONG,
  STRAIGHT_TAPS,
  SWUNG_TAPS,
} from "./dev/wave5-fixture.ts";
import { type GradeEnv, type GraderDeps, gradeStep, NEUTRAL_PROFILE } from "./grading.ts";
import { answerSpecOf, partsOf } from "./model.ts";
import { answerMissing, isMatchSound, stepScopePanel } from "./wave5.ts";

setDefaultTimeout(60_000);

const deps: GraderDeps = {
  grade: (req) => gradeExercise(req),
  evaluate: (code, bars, meter) => evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }),
};

beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

const env: GradeEnv = {
  ownerId: fixture.id,
  key: fixture.key,
  meter: fixture.meter,
  bpm: fixture.bpm,
  unlocked: new Set([
    ...unlockedAt(courseGraph(), toolbox, FIXTURE5_CONTEXT as SessionId),
    ...FIXTURE5_EXTRA,
  ]) as GradeEnv["unlocked"],
  allowPreview: false,
  profile: NEUTRAL_PROFILE,
};
const opts = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };
const exOf = (id: string) => fixture.steps.find((s) => s.id === id)?.exercise as Exercise;

describe("every authored test of the fixture, through the player's grading path", () => {
  for (const step of fixture.steps) {
    const ex = step.exercise;
    if (!ex) continue;
    for (const t of ex.tests) {
      test(`${step.id} ${ex.id}: ${t.name} → ${t.expect}`, async () => {
        const r = await gradeStep(deps, env, ex, t.response as AttemptResponse, opts);
        if (r.status !== t.expect)
          console.log(step.id, t.name, r.status, r.score, r.diagnostics.map((d) => d.id).join(" "));
        expect(r.status).toBe(t.expect);
      });
    }
  }
  test("a wrong answer says something specific (never an empty verdict)", async () => {
    for (const id of ["S2", "S3", "S4"]) {
      const ex = exOf(id);
      const wrong = ex.tests.find((t) => t.expect === "fail");
      const r = await gradeStep(deps, env, ex, wrong?.response as AttemptResponse, opts);
      expect(r.status).toBe("fail");
      expect(r.diagnostics.length, `${id}: a finding`).toBeGreaterThan(0);
    }
  });
});

describe("the fixture's shapes, as the player reads them", () => {
  test("the three Wave 5 answers resolve to their surfaces; a missing widget is noticed", () => {
    expect(answerSpecOf(exOf("S2"))?.ui).toBe("form");
    expect(answerSpecOf(exOf("S3"))?.ui).toBe("bar-grid");
    expect(answerSpecOf(exOf("S4"))?.ui).toBe("scale-builder");
    const none = (s: { ui: string }) => !["form", "bar-grid", "scale-builder"].includes(s.ui);
    for (const id of ["S2", "S3", "S4"]) expect(answerMissing(exOf(id), none)).toBe(true);
    for (const id of ["S5", "S6", "S7", "S8", "S9"]) expect(answerMissing(exOf(id), none)).toBe(false);
  });

  test("S1 opens the form map; S7 the scope with the harmonics probe; S8 the filter probe on the bass", () => {
    const ui = (id: string) => fixture.steps.find((s) => s.id === id)?.ui;
    expect(ui("S1")?.initialPanels).toEqual(["form"]);
    expect(stepScopePanel(ui("S1"))).toBeNull();
    expect(stepScopePanel(ui("S7"))).toEqual({
      panels: ["scope"],
      source: { kind: "master" },
      probe: { kind: "harmonics", track: null },
    });
    expect(stepScopePanel(ui("S8"))?.probe).toEqual({ kind: "filter", track: "bass" });
    expect(isMatchSound(exOf("S8"))).toBe(true);
    for (const s of fixture.steps)
      if (s.exercise) for (const p of partsOf(s.exercise)) expect(p.id.length).toBeGreaterThan(0);
  });
});

describe("the music is right (headless Strudel, @oak/theory)", () => {
  test("S1: the verse is Am F C G and the chorus F G Am Am, the bass on each root, the tune on chord tones", async () => {
    const r = await evalHeadless(SONG, 16);
    const chordsAt = (bar: number) =>
      r.events
        .filter((e) => e.track === "chords" && Number(e.onset) === bar && e.midi !== null)
        .map((e) => e.midi as number);
    const names = Array.from({ length: 8 }, (_, b) => {
      const ms = chordsAt(b);
      return readChord(ms, Math.min(...ms))?.code ?? "?";
    });
    expect(names).toEqual(["Am", "F", "C", "G", "F", "G", "Am", "Am"]);
    const bass = r.events.filter((e) => e.track === "bass").map((e) => (e.midi as number) % 12);
    // A F C G | F G A A, as pitch classes.
    expect(bass.slice(0, 8)).toEqual([9, 5, 0, 7, 5, 7, 9, 9]);
    expect(r.events.some((e) => Number(e.onset) >= 15)).toBe(true);
    // Every tune note on beat 1 or 3 is a tone of the chord under it (bars 1–8: verse then chorus).
    for (let bar = 0; bar < 8; bar++) {
      const chordPcs = new Set(chordsAt(bar).map((m) => m % 12));
      const strong = r.events.filter(
        (e) =>
          e.track === "mel" &&
          (Number(e.onset) === bar || Math.abs(Number(e.onset) - (bar + 0.5)) < 1e-9) &&
          e.midi !== null,
      );
      for (const e of strong) expect(chordPcs.has((e.midi as number) % 12), `bar ${bar + 1}`).toBe(true);
    }
  });

  test("S2: bars 1, 2 and 4 are one tune and bar 3 another (AABA)", async () => {
    const r = await evalHeadless(AABA, 4);
    const bar = (b: number) =>
      r.events.filter((e) => Number(e.onset) >= b && Number(e.onset) < b + 1).map((e) => e.midi);
    expect(bar(1)).toEqual(bar(0));
    expect(bar(3)).toEqual(bar(0));
    expect(bar(2)).not.toEqual(bar(0));
    // A minor: C A C, then D C B G (down past home to the G below it).
    expect(bar(0)).toEqual([60, 57, 60]);
    expect(bar(2)).toEqual([62, 60, 59, 55]);
  });

  test("S4: the A minor pentatonic is A C D E G, degrees 1 ♭3 4 5 ♭7 of A minor", async () => {
    const r = await evalHeadless('n("0 1 2 3 4").scale("A3:minor:pentatonic")', 1);
    const midis = r.events.map((e) => e.midi as number);
    expect(midis).toEqual([57, 60, 62, 64, 67]);
    const key = { tonic: "A", mode: "minor" } as const;
    expect(midis.map((m) => degreeOf(m, key).degree)).toEqual(["1", "b3", "4", "5", "b7"]);
    expect(scaleDegrees({ tonic: "A", mode: "minor pentatonic" })).toEqual(["1", "b3", "4", "5", "b7"]);
    expect(exOf("S4").kind === "fact" && exOf("S4")).toMatchObject({
      correct: { degrees: ["1", "b3", "4", "5", "b7"] },
    });
  });

  test("S6: the swung hats land two thirds through each beat; the taps are those times", async () => {
    const r = await evalHeadless(SHUFFLE, 1);
    const hats = r.events.filter((e) => e.track === "hats").map((e) => Number(e.onset));
    // In cycles (one bar = 1): 0, 1/6, 1/4, 5/12 … — each off-beat at 2/3 of a quarter.
    expect(hats.length).toBe(8);
    const beat = 1 / 4;
    for (let b = 0; b < 4; b++) {
      expect(hats[2 * b]).toBeCloseTo(b * beat, 6);
      expect(hats[2 * b + 1]).toBeCloseTo((b + 2 / 3) * beat, 6);
    }
    const bar = (60 / fixture.bpm) * 4;
    for (const [i, t] of SWUNG_TAPS.entries()) expect(t / bar).toBeCloseTo(hats[i] as number, 6);
    expect(STRAIGHT_TAPS[1]).not.toBeCloseTo(SWUNG_TAPS[1] as number, 3);
  });

  test("S7: a2 and its first six harmonics (110 … 660 Hz on the nearest keys)", async () => {
    const r = await evalHeadless(HARMONICS, 2);
    expect(r.events.map((e) => e.midi)).toEqual([45, 45, 57, 64, 69, 73, 76]);
  });

  test("S8: the sound to match is the bass with its cutoff at 400 Hz; S9's bass is on the roots", async () => {
    const m = await evalHeadless(MATCH_REFERENCE, 2);
    expect(m.events.every((e) => e.value.cutoff === 400 || e.value.lpf === 400)).toBe(true);
    const b = await evalHeadless(MAKE_PASS, 4);
    expect(b.events.filter((e) => e.track === "bass").map((e) => (e.midi as number) % 12)).toEqual([
      9, 5, 0, 7,
    ]);
  });
});
