// Wave 6 `key-plan` (contracts §6.8; U17): an exercise whose example or answer changes key says where
// (`ExBase.keyPlan`), and from that bar on every degree, syllable and numeral is read in the key in force. Also the
// `rn-palette` with a key per slot (`rn-palette.slot-keys`: a pivot chord named in two keys). Real Strudel output.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AnswerUi, Exercise, KeyPlanEntry, KeySpec, Matcher, RubricRule } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { keysByBar } from "../analyze/key-plan.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import { keyAtOnset } from "../match/common.ts";
import { runMatcher } from "../match/index.ts";
import { evalRule } from "../rubric/rules.ts";
import type { GradeContext } from "../types.ts";
import { foldRefined, gradeAnswer } from "./answers.ts";
import { gradeWith } from "./index.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };
const D: KeySpec = { tonic: "D", mode: "major" };
const G: KeySpec = { tonic: "G", mode: "major" };
const PLAN: KeyPlanEntry[] = [
  { bar: 1, key: C },
  { bar: 3, key: D },
];
const texts = (ds: readonly Parameters<typeof renderFeedback>[0][]): string[] =>
  ds.map((d) => renderFeedback(d));

describe("the key in force at an onset", () => {
  test("bars are 1-based; with a pickup, cycle 0 is bar 0", () => {
    expect(keyAtOnset({ keyPlan: PLAN }, rat(0), C)).toEqual(C);
    expect(keyAtOnset({ keyPlan: PLAN }, rat(3, 2), C)).toEqual(C);
    expect(keyAtOnset({ keyPlan: PLAN }, rat(2), C)).toEqual(D);
    expect(keyAtOnset({ keyPlan: PLAN, pickup: { units: rat(1) } }, rat(2), C)).toEqual(C);
    expect(keyAtOnset({ keyPlan: PLAN, pickup: { units: rat(1) } }, rat(3), C)).toEqual(D);
    expect(keyAtOnset({}, rat(8), G)).toEqual(G);
  });
});

describe("a melody across a lift", () => {
  const MELODY: Matcher = {
    m: "melody",
    pitch: "key-relative",
    wPitch: 0.6,
    wRhythm: 0.4,
    rhythmTol: rat(1, 32),
  };
  const REF = 'mel: n("<[4 4 5 4] [7 ~ 6 ~]>").scale("<C4:major!2 D4:major!2>").s("piano")';
  const ctx = { meter: "4/4" as const, key: C, keyPlan: PLAN };
  test("the same plan passes, written with a key plan or in note names", async () => {
    const ref = await strudel(REF, 4);
    expect(runMatcher(MELODY, ref, await strudel(REF, 4), ctx).score).toBe(1);
    const names = 'mel: note("<[g4 g4 a4 g4] [c5 ~ b4 ~] [a4 a4 b4 a4] [d5 ~ c#5 ~]>").s("piano")';
    const r = runMatcher(MELODY, ref, await strudel(names, 4), ctx);
    expect(r.score).toBe(1);
    expect(r.diagnostics.map((d) => d.id)).not.toContain("melody.transposed");
  });
  test("a wrong note after the lift is named in the new key: 5 in D, not 6 in C", async () => {
    const ref = await strudel(REF, 4);
    const slip = REF.replace('n("<[4 4 5 4] [7 ~ 6 ~]>")', 'n("<[4 4 5 4] [7 ~ 6 ~] [3 4 5 4] [7 ~ 6 ~]>")');
    const r = runMatcher(MELODY, ref, await strudel(slip, 4), ctx);
    expect(r.score).toBeLessThan(1);
    expect(texts(r.diagnostics)).toEqual(["Bar 3, 1: you have 4 (fa); the melody has 5 (sol)."]);
  });
  test("the lift left out: bars 3–4 still in C are wrong notes of D, named in D", async () => {
    const ref = await strudel(REF, 4);
    const flat = 'mel: n("<[4 4 5 4] [7 ~ 6 ~]>").scale("C4:major").s("piano")';
    const r = runMatcher(MELODY, ref, await strudel(flat, 4), ctx);
    expect(r.score).toBeLessThan(0.85);
    expect(texts(r.diagnostics)).toEqual([
      "From bar 3 the tune is in D major; yours is still in C major there. Move those bars 2 half steps up: give the line its key plan.",
    ]);
  });
  test("without a plan the Wave 3 reading stands: each side in its own key", async () => {
    const one = 'mel: n("<[4 4 5 4] [7 ~ 6 ~]>").scale("C4:major").s("piano")';
    const inD = one.replace("C4:major", "D4:major");
    const r = runMatcher(MELODY, await strudel(one, 2), await strudel(inD, 2), { meter: "4/4", key: C });
    expect(r.score).toBe(1);
    expect(r.diagnostics.map((d) => d.id)).toEqual(["melody.transposed"]);
  });
});

describe("numerals across a key change", () => {
  const RN: Matcher = {
    m: "harmony",
    level: "rn",
    qualityDepth: "triad",
    inversion: false,
    harmonicRhythm: "given",
  };
  const ctx = { meter: "4/4" as const, key: C, keyPlan: PLAN };
  test("a wrong chord after the lift is named by its numeral in the new key", async () => {
    const ref = await strudel('chords: chord("<C G D A>").voicing()', 4);
    const ans = await strudel('chords: chord("<C G D G>").voicing()', 4);
    const r = runMatcher(RN, ref, ans, ctx);
    // In D: A is V, G is IV. (Read in C they would be V/ii and V.)
    expect(texts(r.diagnostics)).toEqual(["Chord 4: IV, expected V."]);
  });
  test("a rule reads an authored plan before anything in the notes", async () => {
    const code = 'chords: chord("<C G D A>").voicing()';
    const n = await strudel(code, 4);
    expect(keysByBar(n, 4, { key: C, keyPlan: PLAN }).map((k) => k.tonic)).toEqual(["C", "C", "D", "D"]);
    const rule = {
      id: "v",
      label: "v",
      required: true,
      skills: [],
      rule: "contains-rn",
      rn: ["V"],
      min: 2,
    } as unknown as RubricRule;
    // V of C in bar 2 and V of D in bar 4.
    const withPlan = evalRule(rule, n, {
      meter: "4/4",
      code,
      params: {},
      bars: 4,
      totalBars: 4,
      key: C,
      keyPlan: PLAN,
    });
    expect(withPlan.ok).toBe(true);
    const without = evalRule(rule, n, { meter: "4/4", code, params: {}, bars: 4, totalBars: 4, key: C });
    expect(without.value).toBe(1);
  });
});

describe("rn-palette with a key per slot (a pivot chord, U17.L01)", () => {
  const ui: AnswerUi = {
    ui: "rn-palette",
    slots: 2,
    allow: ["triads"],
    labels: ["In C major", "In G major"],
    slotKeys: [C, G],
  };
  test("Am is vi in C and ii in G", () => {
    const r = gradeAnswer(ui, { rn: ["vi", "ii"] }, { rn: ["vi", "ii"] }, { key: C });
    expect([r.score, r.slots]).toEqual([1, [1, 1]]);
  });
  test("the same numeral twice is right in one key only, and the miss is read in the slot's key", () => {
    const r = gradeAnswer(ui, { rn: ["vi", "ii"] }, { rn: ["vi", "vi"] }, { key: C });
    expect(r.slots).toEqual([1, 0]);
    expect(texts(foldRefined(r.diagnostics))).toEqual([
      "Chord 2: vi is built on degree 6 (Em); this chord is ii, built on degree 2 (Am).",
    ]);
  });
  test("an empty slot is asked for; a case slip is a case slip", () => {
    const empty = gradeAnswer(ui, { rn: ["vi", "ii"] }, { rn: ["vi"] }, { key: C });
    expect(empty.slots).toEqual([1, 0]);
    expect(empty.diagnostics.map((d) => d.id)).toEqual(["id.missing"]);
    const cased = gradeAnswer(ui, { rn: ["vi", "ii"] }, { rn: ["VI", "ii"] }, { key: C });
    expect(cased.diagnostics.map((d) => [d.id, d.where?.slot])).toEqual([["harmony.rn-case", 1]]);
  });
  test("without slotKeys every slot is read in the exercise's key, as before", () => {
    const plain: AnswerUi = { ui: "rn-palette", slots: 2, allow: ["triads"] };
    expect(gradeAnswer(plain, { rn: ["vi", "ii"] }, { rn: ["vi", "ii"] }, { key: C }).score).toBe(1);
  });
});

describe("a bass dictation answered on the degree pad (U15.L05, U17.L04)", () => {
  const deps = headlessDeps();
  const gctx = (): GradeContext => ({
    exerciseGlobalId: "U15.L05/test",
    mode: "lesson",
    key: C,
    meter: "4/4",
    bpm: 100,
    params: {},
    attemptNo: 1,
    firstAttempt: true,
    rung: 0,
    tutorHints: 0,
    extraReplays: 0,
    lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
  });
  const dictation = (o: Record<string, unknown> = {}) =>
    ({
      kind: "dictation",
      id: "bass",
      version: 1,
      prompt: "",
      skills: [],
      role: "check",
      hints: null,
      tests: [],
      domain: "bass",
      stimulus: { src: "code", code: "", bars: 6, loop: true, showCode: false },
      cue: { kind: "none" },
      answer: { ui: "degree-pad", set: ["1", "2", "3", "5", "6", "7"], sequenceLen: 6, syllables: false },
      reference: {
        solutions: [
          'mel: note("<c5 b4 a4 c5 b4 c5>").s("piano")\nchords: chord("<C E7 A7 D7 G7 C>").voicing()\nbass: note("<c2 e2 a2 d2 g2 c2>").s("sawtooth")',
        ],
        bars: 6,
      },
      matcher: {
        m: "melody",
        pitch: "key-relative",
        wPitch: 1,
        wRhythm: 0,
        rhythmTol: rat(1, 16),
        track: "@bass",
      },
      ...o,
    }) as never;
  test("the degrees are the bass line's (1 3 6 2 5 1), not the top line's (1 7 6 1 7 1)", async () => {
    const right = await gradeWith(
      {
        exercise: dictation(),
        response: { answer: { degrees: ["1", "3", "6", "2", "5", "1"] } },
        ctx: gctx(),
      },
      deps,
    );
    expect(right.status).toBe("pass");
    const top = await gradeWith(
      {
        exercise: dictation(),
        response: { answer: { degrees: ["1", "7", "6", "1", "7", "1"] } },
        ctx: gctx(),
      },
      deps,
    );
    expect(top.status).toBe("fail");
  });
  test("with a key plan each root is a degree of the key in force (D♭, then D)", async () => {
    const Db: KeySpec = { tonic: "Db", mode: "major" };
    const ex = dictation({
      key: Db,
      keyPlan: [
        { bar: 1, key: Db },
        { bar: 3, key: D },
      ],
      reference: { solutions: ['bass: note("<db2 ab2 d2 a2>").s("sawtooth")'], bars: 4 },
      stimulus: { src: "code", code: "", bars: 4, loop: true, showCode: false },
    });
    const r = await gradeWith(
      { exercise: ex, response: { answer: { degrees: ["1", "5", "1", "5"] } }, ctx: gctx() },
      deps,
    );
    expect(r.status).toBe("pass");
  });
});

describe("a `matches` rule with two solutions passes on either (U17.L02: a half or a whole step up)", () => {
  const deps = headlessDeps();
  const liftCtx: GradeContext = {
    exerciseGlobalId: "U17.L02/lift",
    mode: "lesson",
    key: C,
    meter: "4/4",
    bpm: 100,
    params: {},
    attemptNo: 1,
    firstAttempt: true,
    rung: 0,
    tutorHints: 0,
    extraReplays: 0,
    lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
  };
  const lift = (to: string) =>
    `setcpm(100/4)\nmel: n("<[0 2 4 2] [4 ~ 2 ~]>").scale("<C4:major!2 ${to}4:major!2>").s("piano")`;
  const make = {
    kind: "code-make",
    id: "lift",
    version: 1,
    prompt: "",
    skills: [],
    role: "check",
    hints: null,
    tests: [],
    code: { starter: "" },
    bars: [4, 4],
    saveAs: "sketch",
    rubric: [
      {
        id: "lift",
        label: "The tune lifts by a half or a whole step",
        required: true,
        skills: [],
        rule: "matches",
        reference: { solutions: [lift("D"), lift("Db")], bars: 4 },
        matcher: { m: "melody", pitch: "absolute", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 16] },
        min: 0.95,
      },
    ],
  } as unknown as Exercise;
  const ok = async (code: string) =>
    (await gradeWith({ exercise: make, response: { code }, ctx: liftCtx }, deps)).rubric?.[0]?.ok;
  test("a whole step and a half step both pass; a minor third does not", async () => {
    expect(await ok(lift("D"))).toBe(true);
    expect(await ok(lift("Db"))).toBe(true);
    expect(await ok(lift("Eb"))).toBe(false);
  });
});
