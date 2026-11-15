// The Wave 6 schema additions (seventh chords, rhythm II, modes, chromatic harmony, key changes, the finale):
// each new shape parses where it belongs and is refused where it does not, the structural rules of
// `checkExercise`, `checkLessonStructure`, `defineUnit`, `defineSong` and `defineCapstone` catch the mistakes
// an author can make with it, `unimplementedIn` keeps a lesson off a shape the platform does not grade or
// draw yet, and the binding rubrics of contracts §6.6 for C6, C7, CF-A and CF-T are expressible.
import { describe, expect, test } from "bun:test";
import {
  checkExercise,
  checkLessonStructure,
  checkWave6Rule,
  defineCapstone,
  defineSong,
  defineUnit,
  schemaIssues,
} from "./define.ts";
import { ladder, lessonU01L02, mutable } from "./fixtures.test-data.ts";
import {
  COMPOUND_METERS,
  IMPLEMENTED,
  PLANNED,
  plannedOrImplemented,
  SCHEMA_FEATURES,
  type SchemaFeature,
  unimplementedIn,
  unimplementedInCapstoneSessions,
  unimplementedInLesson,
} from "./implemented.ts";
import {
  BEAT_DIVISION_OPTIONS,
  type CapstoneDef,
  CHORD_QUALITIES,
  CHROMATIC_DEGREES,
  CHROMATIC_STEPS,
  CORE_DEVICES,
  DEGREE_SYLLABLES,
  DEGREES,
  DEVICE_NAMES,
  DIATONIC_SEVENTHS,
  type Exercise,
  HARMONIC_MINOR_SEVENTHS,
  KEY_CHANGE_OPTIONS,
  METER_FEEL_OPTIONS,
  MODE_CHARACTERISTIC,
  MODE_DEGREES,
  MODE_OPTIONS,
  OUTSIDE_CHORD_KINDS,
  OUTSIDE_CHORD_OPTIONS,
  PUSH_OPTIONS,
  RUBRIC_RULE_NAMES,
  type RubricRule,
  SCALE_MODES,
  SEVENTH_DEGREES,
  SEVENTH_QUALITIES,
  type SongDef,
} from "./schema/index.ts";
import { CONTENT_SCHEMA_VERSION } from "./version.ts";
import { AnswerSchema, CapstoneDefSchema, ExerciseSchema, RubricRuleSchema, UnitDefSchema } from "./zod.ts";

const base = { version: 1, prompt: "p", skills: [{ skill: "C07", w: 1 }], role: "practice", tests: [] };
const parses = (x: unknown) => schemaIssues(ExerciseSchema, x).length === 0;
const rules = (x: unknown) => checkExercise(x as Exercise, "ex").map((i) => i.rule);
const cue = { context: "tonic-chord", countInBars: 1, click: false, replays: -1 } as const;
const C = { tonic: "C", mode: "major" } as const;
const D = { tonic: "D", mode: "major" } as const;
const G = { tonic: "G", mode: "major" } as const;
const LOOP = 'setcpm(90/4)\n\nchords: chord("<C^7 Am7 Dm7 G7>").voicing().s("rhodes")';
const rule = (body: object) => ({ id: "r", label: "l", required: true, skills: ["H12"], ...body });
const ruleIssues = (body: object) => schemaIssues(RubricRuleSchema, rule(body));
const ruleParses = (body: object) => ruleIssues(body).length === 0;
const ruleRules = (body: object, song = false) =>
  checkWave6Rule(rule(body) as RubricRule, "r", song).map((i) => i.rule);
const identify = (answer: object, correct: object, extra: object = {}) => ({
  ...base,
  kind: "identify",
  id: "x",
  hints: ladder,
  stimulus: { src: "code", code: LOOP, bars: 4, showCode: false },
  cue,
  answer,
  correct,
  ...extra,
});
const make = (rubric: object[], extra: object = {}) => ({
  ...base,
  kind: "code-make",
  id: "m",
  hints: ladder,
  code: { starter: LOOP },
  bars: [4, 8],
  saveAs: "sketch",
  rubric,
  ...extra,
});
/**
 * The lists as Foundation left them, before the Wave 6 Build moved the grader's rules and rule fields into
 * `IMPLEMENTED`: the tests below show that each shape is detected, which only a list without it can show.
 */
const BUILT_RULES = [
  "mode",
  "key-change",
  "modulation",
  "guide-tones",
  "velocity-ghosts",
  "device-count",
  "reharmonize",
] as const;
const BUILT_FEATURES: SchemaFeature[] = [
  "harmony.wrong-quality",
  "contains-rn.kind",
  "contains-rn.in-order",
  "form.contains",
  "form.song",
  "mode.any-of",
  "guide-tones.motion",
  "modulation.via",
  "velocity-ghosts.accents",
  // Rendered by their owners in the Build and moved then (answers, lesson, workbench, notation).
  "staff-input.ties",
  "staff-input.dots",
  "staff-input.triplets",
  "grid.steps",
  "meter.compound",
  "form.map",
  "scale-builder.from",
  "rn-palette.slot-keys",
  // Rendered by the capstone engineer (CF-T's workspace) and moved at integration.
  "capstone.form-map",
  "capstone.session-rubric",
];
const FOUNDATION: typeof IMPLEMENTED = {
  ...IMPLEMENTED,
  rubricRules: IMPLEMENTED.rubricRules.filter((r) => !(BUILT_RULES as readonly string[]).includes(r)),
  features: (IMPLEMENTED.features ?? []).filter((f) => !BUILT_FEATURES.includes(f)),
};
const uses = (x: unknown, impl = FOUNDATION) => unimplementedIn(x as Exercise, impl).map((u) => u.name);
/** `IMPLEMENTED` as it will be once every Wave 6 shape has landed. */
const ALL = plannedOrImplemented();

test("the content schema version is 5 with the Wave 6 shapes", () => {
  expect(CONTENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(5);
});

describe("seventh chords", () => {
  test("the five qualities, as degrees above the root", () => {
    expect([...SEVENTH_QUALITIES]).toEqual(["maj7", "7", "m7", "m7b5", "dim7"]);
    for (const q of SEVENTH_QUALITIES) {
      expect(CHORD_QUALITIES as readonly string[]).toContain(q);
      expect(SEVENTH_DEGREES[q]).toHaveLength(4);
      expect(SEVENTH_DEGREES[q][0]).toBe("1");
      for (const d of SEVENTH_DEGREES[q]) expect(DEGREES as readonly string[]).toContain(d);
    }
    // One half step apart: the 7th of the major seventh against the dominant's (U12.L02).
    expect([SEVENTH_DEGREES.maj7[3], SEVENTH_DEGREES["7"][3]]).toEqual(["7", "b7"]);
    expect(SEVENTH_DEGREES.m7b5).toEqual(["1", "b3", "b5", "b7"]);
  });
  test("the diatonic sevenths of a major and of a minor key", () => {
    expect(DIATONIC_SEVENTHS.major).toEqual(["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"]);
    expect(DIATONIC_SEVENTHS.minor).toEqual(["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"]);
    // The minor key's chords are the relative major's, read from its 6th degree.
    expect([...DIATONIC_SEVENTHS.major.slice(5), ...DIATONIC_SEVENTHS.major.slice(0, 5)]).toEqual([
      ...DIATONIC_SEVENTHS.minor,
    ]);
    expect(HARMONIC_MINOR_SEVENTHS).toEqual({ 5: "7", 7: "dim7" });
  });
  test("a quality pad, a keyboard chord and numerals with sevenths parse", () => {
    expect(
      parses(identify({ ui: "quality-pad", set: [...SEVENTH_QUALITIES] }, { qualities: ["maj7"] })),
    ).toBe(true);
    expect(
      parses(
        identify(
          { ui: "rn-palette", slots: 4, allow: ["sevenths"], labels: ["Bar 1", "Bar 2", "Bar 3", "Bar 4"] },
          { rn: ["Imaj7", "vi7", "ii7", "V7"] },
        ),
      ),
    ).toBe(true);
  });
});

describe("guide tones", () => {
  const sing = (target: object) => ({
    ...base,
    kind: "sing",
    id: "s",
    hints: ladder,
    mode: "guide-tones",
    stimulus: { src: "code", code: LOOP, bars: 4, showCode: false },
    cue,
    target,
    tol: { cents: "learner", octave: "global", driftCompCents: 30, minCoverage: 0.4, passHitRate: 0.8 },
    showTrace: "after",
    labels: "syllables",
    fallback: "identify",
  });
  test("a sung guide-tone line names its line and keeps a Quiet path", () => {
    const ok = sing({ from: "reference", reference: { solutions: [LOOP], bars: 4 }, track: "guide" });
    expect(parses(ok)).toBe(true);
    expect(rules(ok)).toEqual([]);
    expect(rules(sing({ from: "degrees", degrees: ["3", "b7", "3", "b7"] }))).toEqual([]);
    expect(rules(sing({ from: "stimulus" }))).toContain("sing.guide-tones-target");
    expect(rules({ ...ok, fallback: undefined })).toContain("exercise.sing-fallback");
    expect(uses(ok)).toContain("sing.guide-tones");
    expect(uses(ok, ALL)).toEqual([]);
  });
  test("the guide-tones rule: where the line is judged and how far it may move", () => {
    const r = { rule: "guide-tones", track: "mel", harmony: "chords", minRatio: 0.7 };
    expect(ruleParses(r)).toBe(true);
    expect(ruleParses({ ...r, at: "change", maxMoveSemis: 2 })).toBe(true);
    expect(ruleParses({ ...r, at: "sometimes" })).toBe(false);
    expect(ruleParses({ ...r, maxMoveSemis: 0 })).toBe(false);
    expect(uses(make([rule({ ...r, at: "strong" })]))).toEqual(["guide-tones", "guide-tones.motion"]);
  });
});

describe("rhythm II: ties, dots, triplets, compound meter", () => {
  const staff = (durations: string[], ties = false, extra: object = {}) => ({
    ...base,
    kind: "staff-write",
    id: "w",
    hints: ladder,
    answer: {
      ui: "staff-input",
      clef: "treble",
      bars: 2,
      palette: { durations, accidentals: false, ties, rests: true },
    },
    expect: { e: "rhythm", reference: { solutions: [LOOP], bars: 2 } },
    ...extra,
  });
  test("duration tokens: plain, dotted and triplet values", () => {
    expect(rules(staff(["4", "8", "4.", "8t", "2.", "16"], true))).toEqual([]);
    expect(rules(staff(["4", "3"]))).toContain("staff.duration-token");
    expect(rules(staff(["dotted"]))).toContain("staff.duration-token");
    expect(rules(staff(["8t."]))).toContain("staff.duration-token");
  });
  test("ties, dots and triplets on the staff are planned features", () => {
    expect(uses(staff(["4", "8"]))).toEqual([]);
    expect(uses(staff(["4", "8"], true))).toEqual(["staff-input.ties"]);
    expect(uses(staff(["4."]))).toEqual(["staff-input.dots"]);
    expect(uses(staff(["8t"]))).toEqual(["staff-input.triplets"]);
    expect(uses(staff(["4.", "8t"], true), ALL)).toEqual([]);
  });
  test("grids of 6 and 24 steps", () => {
    const grid = (stepsPerBar: number) =>
      identify({ ui: "grid", rows: ["hit"], stepsPerBar, bars: 2 }, { choice: ["x"] }, { meter: "6/8" });
    for (const n of [6, 8, 12, 16, 24]) expect(parses(grid(n))).toBe(true);
    expect(parses(grid(7))).toBe(false);
    expect(uses(grid(6))).toEqual(["grid.steps", "meter.compound"]);
    expect(uses(grid(12))).toEqual(["meter.compound"]);
  });
  test("a lesson or exercise in a compound meter is planned until the surfaces draw it", () => {
    expect([...COMPOUND_METERS]).toEqual(["6/8", "9/8", "12/8"]);
    const def = mutable(lessonU01L02());
    expect(unimplementedInLesson(def, FOUNDATION).map((u) => u.name)).not.toContain("meter.compound");
    (def as { meter: string }).meter = "12/8";
    expect(unimplementedInLesson(def, FOUNDATION).map((u) => u.name)).toEqual(["meter.compound"]);
    // Drawn by every host since the Wave 6 Build.
    expect(unimplementedInLesson(def)).toEqual([]);
    expect(unimplementedInLesson(def, ALL)).toEqual([]);
  });
  test("ghost notes: quiet hits among loud ones", () => {
    const r = { rule: "velocity-ghosts", track: "snare", min: 4 };
    expect(ruleParses(r)).toBe(true);
    expect(ruleParses({ ...r, maxGain: 0.4, on: "16th-offbeat", drum: "snare", accents: 2 })).toBe(true);
    expect(ruleParses({ ...r, accents: 0 })).toBe(false);
    expect(uses(make([rule({ ...r, accents: 2 })]))).toEqual(["velocity-ghosts", "velocity-ghosts.accents"]);
  });
  test("the standard options of U13", () => {
    expect(METER_FEEL_OPTIONS.map((o) => o.id)).toEqual(["simple", "compound"]);
    expect(BEAT_DIVISION_OPTIONS.map((o) => o.id)).toEqual(["duple", "triplet"]);
    expect(PUSH_OPTIONS.map((o) => o.id)).toEqual(["on", "pushed"]);
  });
});

describe("modes", () => {
  test("each colour mode is its parent with one note moved", () => {
    for (const [mode, c] of Object.entries(MODE_CHARACTERISTIC)) {
      const own = MODE_DEGREES[mode as keyof typeof MODE_CHARACTERISTIC];
      const parent = MODE_DEGREES[c.parent];
      expect([mode, own.includes(c.tone), own.includes(c.replaces)]).toEqual([mode, true, false]);
      expect([mode, parent.includes(c.replaces), parent.includes(c.tone)]).toEqual([mode, true, false]);
      expect(own.filter((d) => !parent.includes(d))).toEqual([c.tone]);
    }
    expect(MODE_CHARACTERISTIC.mixolydian.tone).toBe("b7");
    expect(MODE_CHARACTERISTIC.dorian.tone).toBe("6");
    expect(MODE_CHARACTERISTIC.lydian.tone).toBe("#4");
    expect(MODE_CHARACTERISTIC.phrygian.tone).toBe("b2");
  });
  test("which mode: the options are scale modes", () => {
    for (const o of MODE_OPTIONS) expect(SCALE_MODES as readonly string[]).toContain(o.id);
    expect(MODE_OPTIONS.map((o) => o.id)).toEqual([
      "major",
      "mixolydian",
      "lydian",
      "minor",
      "dorian",
      "phrygian",
    ]);
  });
  const builder = (o: object, degrees: string[]) =>
    identify({ ui: "scale-builder", tonic: "G", input: "degrees", ...o }, { degrees });
  const MIXO = ["1", "2", "3", "4", "5", "6", "b7"];
  test("raise or lower one note: the builder opens on a scale", () => {
    const ok = builder({ from: "major", palette: [...MODE_DEGREES.major, "b7", "#4"] }, MIXO);
    expect(parses(ok)).toBe(true);
    expect(rules(ok)).toEqual([]);
    expect(uses(ok)).toEqual(["scale-builder.from"]);
    expect(
      rules(builder({ from: "major", palette: [...MODE_DEGREES.major, "b7"] }, [...MODE_DEGREES.major])),
    ).toContain("scale-builder.from");
    expect(rules(builder({ from: "major", palette: ["1", "2", "3", "4", "5", "6", "b7"] }, MIXO))).toContain(
      "scale-builder.from",
    );
    expect(parses(builder({ from: "ionian" }, MIXO))).toBe(false);
  });
  test("the mode rule: one mode, or the learner's choice of several", () => {
    const r = { rule: "mode", tonic: "G", mode: "mixolydian", requireCharacteristic: true };
    expect(ruleParses(r)).toBe(true);
    expect(ruleRules(r)).toEqual([]);
    const either = { ...r, tonic: "declared", anyOf: ["mixolydian", "dorian"] };
    expect(ruleParses(either)).toBe(true);
    expect(ruleRules(either)).toEqual([]);
    expect(ruleRules({ ...either, mode: "lydian" })).toEqual(["rubric.mode-any-of"]);
    expect(ruleParses({ ...r, anyOf: ["dorian"] })).toBe(false);
    expect(uses(make([rule(either)]))).toEqual(["mode", "mode.any-of"]);
  });
});

describe("chromatic degrees", () => {
  test("the seven of U15.L01, their syllables and their step strings", () => {
    expect([...CHROMATIC_DEGREES]).toEqual(["#4", "b7", "#5", "#1", "b2", "b3", "b6"]);
    expect(CHROMATIC_DEGREES.map((d) => DEGREE_SYLLABLES[d])).toEqual([
      "fi",
      "te",
      "si",
      "di",
      "ra",
      "me",
      "le",
    ]);
    for (const d of CHROMATIC_DEGREES) expect(MODE_DEGREES.major).not.toContain(d);
    // STYLE §6.3: the number is the 0-based step, not the degree.
    expect(CHROMATIC_STEPS["#4"]).toBe("3#");
    expect(CHROMATIC_STEPS.b7).toBe("6b");
    expect(CHROMATIC_STEPS["#5"]).toBe("4#");
    for (const [degree, step] of Object.entries(CHROMATIC_STEPS)) {
      expect(DEGREES as readonly string[]).toContain(degree);
      const n = Number(step.slice(0, -1));
      expect([degree, step.at(-1), n + 1]).toEqual([
        degree,
        degree[0] === "#" ? "#" : "b",
        Number(degree.slice(1)),
      ]);
    }
  });
  test("a chromatic degree pad and a sung chromatic degree with a Quiet path", () => {
    const pad = identify(
      { ui: "degree-pad", set: ["1", "2", "3", "4", "#4", "5", "6", "b7", "7"], syllables: true },
      { degrees: ["#4"] },
    );
    expect(parses(pad)).toBe(true);
    expect(rules(pad)).toEqual([]);
    const sung = {
      ...base,
      kind: "sing",
      id: "s",
      hints: ladder,
      mode: "resolution",
      stimulus: { src: "code", code: LOOP, bars: 1, showCode: false },
      cue,
      target: { from: "degrees", degrees: ["#4", "5"] },
      tol: { cents: "learner", octave: "global", driftCompCents: 30, minCoverage: 0.4, passHitRate: 0.8 },
      showTrace: "after",
      labels: "syllables",
      fallback: "identify",
    };
    expect(parses(sung)).toBe(true);
    expect(rules(sung)).toEqual([]);
  });
});

describe("applied and borrowed chords", () => {
  test("the kinds of chord from outside the key", () => {
    expect([...OUTSIDE_CHORD_KINDS]).toEqual(["secondary-dominant", "applied-leading-tone", "borrowed"]);
    expect(OUTSIDE_CHORD_OPTIONS.map((o) => o.id)).toEqual(["diatonic", ...OUTSIDE_CHORD_KINDS]);
  });
  test("name it, say where it resolves, find its bar", () => {
    expect(
      parses(
        identify(
          {
            ui: "rn-palette",
            slots: 2,
            allow: ["triads", "sevenths", "secondary"],
            labels: ["The chord", "Goes to"],
          },
          { rn: ["V7/V", "V"] },
        ),
      ),
    ).toBe(true);
    expect(
      parses(identify({ ui: "rn-palette", slots: 1, allow: ["triads", "borrowed"] }, { rn: ["iv"] })),
    ).toBe(true);
    expect(parses(identify({ ui: "bar-buttons", bars: 4 }, { number: 2 }))).toBe(true);
  });
  test("contains-rn by kind, and a run of chords in order", () => {
    const any = { rule: "contains-rn", rn: [], min: 1, mustResolve: true, kind: ["secondary-dominant"] };
    expect(ruleParses(any)).toBe(true);
    expect(ruleRules(any)).toEqual([]);
    expect(ruleRules({ rule: "contains-rn", rn: [], min: 1 })).toEqual(["rubric.contains-rn"]);
    const run = { rule: "contains-rn", rn: ["bVI", "bVII", "I"], min: 1, inOrder: true };
    expect(ruleParses(run)).toBe(true);
    expect(ruleRules(run)).toEqual([]);
    expect(ruleRules({ ...run, rn: ["bVI"] })).toEqual(["rubric.contains-rn"]);
    expect(ruleRules({ ...run, kind: ["borrowed"] })).toEqual(["rubric.contains-rn"]);
    expect(ruleParses({ ...any, kind: ["tritone-sub"] })).toBe(false);
    expect(uses(make([rule(any)]))).toEqual(["contains-rn.kind"]);
    expect(uses(make([rule(run)]))).toEqual(["contains-rn.in-order"]);
    expect(uses(make([rule({ rule: "contains-rn", rn: ["V"], min: 1 })]))).toEqual([]);
  });
  test("a reharmonization: the same tune over new chords of the asked kind", () => {
    const r = {
      rule: "reharmonize",
      melody: "mel",
      reference: { solutions: [LOOP], bars: 8 },
      min: 2,
      kinds: ["borrowed", "secondary-dominant"],
    };
    expect(RUBRIC_RULE_NAMES as readonly string[]).toContain("reharmonize");
    expect(ruleParses(r)).toBe(true);
    const { kinds: _kinds, ...anyChords } = r;
    expect(ruleParses({ ...anyChords, harmony: "chords" })).toBe(true);
    expect(ruleParses({ ...r, min: 0 })).toBe(false);
    expect(ruleParses({ ...anyChords, melody: "" })).toBe(false);
    // One required rule carries both halves, so a lesson Make can ask for it (contracts §6.5).
    expect(rules(make([rule(r)]))).toEqual([]);
    expect(uses(make([rule(r)]))).toEqual(["reharmonize", "contains-rn.kind"]);
    expect(IMPLEMENTED.rubricRules).toContain("reharmonize");
  });
});

describe("key changes", () => {
  const plan = [
    { bar: 1, key: C },
    { bar: 9, key: D },
  ];
  test("a key plan: the key in force, bar by bar", () => {
    const ok = identify({ ui: "bar-buttons", bars: 16 }, { number: 9 }, { key: C, keyPlan: plan });
    expect(parses(ok)).toBe(true);
    expect(rules(ok)).toEqual([]);
    expect(uses(ok)).toEqual(["key-plan"]);
    expect(rules({ ...ok, key: undefined })).toContain("key-plan.first");
    expect(rules({ ...ok, key: D })).toContain("key-plan.first");
    expect(rules({ ...ok, keyPlan: [{ bar: 2, key: C }] })).toContain("key-plan.first");
    expect(rules({ ...ok, keyPlan: [...plan].reverse() })).toContain("key-plan.order");
    expect(rules({ ...ok, keyPlan: [plan[0], { bar: 9, key: C }] })).toContain("key-plan.order");
    // A pickup bar is bar 0.
    expect(rules({ ...ok, keyPlan: [{ bar: 0, key: C }, plan[1]] })).toEqual([]);
    expect(parses({ ...ok, keyPlan: [] })).toBe(false);
  });
  test("a pivot chord is one chord named in two keys", () => {
    const pivot = (o: object = {}) =>
      identify(
        {
          ui: "rn-palette",
          slots: 2,
          allow: ["triads"],
          labels: ["In C major", "In G major"],
          slotKeys: [C, G],
          ...o,
        },
        { rn: ["vi", "ii"] },
        { key: C },
      );
    expect(parses(pivot())).toBe(true);
    expect(rules(pivot())).toEqual([]);
    expect(rules(pivot({ slotKeys: [C] }))).toContain("rn-palette.slot-keys");
    expect(rules(pivot({ labels: ["In C major"] }))).toContain("rn-palette.labels");
    expect(uses(pivot())).toEqual(["rn-palette.slot-keys"]);
    expect(KEY_CHANGE_OPTIONS.map((o) => o.id)).toEqual(["none", "pivot", "direct"]);
  });
  test("the rules: a lift (key-change) and a pivot modulation", () => {
    const lift = { rule: "key-change", at: "last", semitones: [1, 2], minBarsAfter: 8, sameMelody: true };
    expect(ruleParses(lift)).toBe(true);
    const mod = { rule: "modulation", to: "dominant", via: "pivot" };
    expect(ruleParses(mod)).toBe(true);
    expect(ruleParses({ rule: "modulation", to: G, atBar: 9, via: "direct" })).toBe(true);
    expect(ruleParses({ ...mod, via: "magic" })).toBe(false);
    expect(uses(make([rule(mod)]))).toEqual(["modulation", "modulation.via"]);
    expect(uses(make([rule(lift)]))).toEqual(["key-change"]);
  });
});

describe("the changes of a standard: no credit for the wrong quality (d11)", () => {
  const harmony = (o: object = {}) => ({
    m: "harmony",
    level: "rn",
    qualityDepth: "seventh",
    inversion: false,
    harmonicRhythm: "given",
    ...o,
  });
  const step = (matcher: object) => ({
    ...base,
    kind: "dictation",
    id: "d",
    hints: ladder,
    domain: "harmony",
    stimulus: { src: "code", code: LOOP, bars: 4, showCode: false },
    cue,
    answer: { ui: "code", starter: LOOP },
    reference: { solutions: [LOOP], bars: 4 },
    matcher,
  });
  test("an exercise opts in; the default stays partial credit", () => {
    expect(parses(step(harmony()))).toBe(true);
    expect(uses(step(harmony()))).toEqual([]);
    expect(parses(step(harmony({ wrongQuality: "none" })))).toBe(true);
    expect(rules(step(harmony({ wrongQuality: "none" })))).toEqual([]);
    expect(uses(step(harmony({ wrongQuality: "none" })))).toEqual(["harmony.wrong-quality"]);
    expect(uses(step(harmony({ wrongQuality: "partial" })))).toEqual([]);
    expect(parses(step(harmony({ wrongQuality: "half" })))).toBe(false);
  });
  test("it needs a level that reads quality", () => {
    expect(rules(step(harmony({ wrongQuality: "none", level: "bass" })))).toContain("harmony.wrong-quality");
    expect(rules(step(harmony({ wrongQuality: "none", level: "root" })))).toContain("harmony.wrong-quality");
  });
});

describe("a Make that opens with an earlier sketch (d15)", () => {
  const r = rule({ rule: "bars", min: 4 });
  test("fromSketch names another lesson, on a lesson's Make", () => {
    const m = make([r], { fromSketch: "U10.L05" });
    expect(parses(m)).toBe(true);
    expect(rules(m)).toEqual([]);
    expect(checkExercise(m as never, "ex", "checkpoint").map((i) => i.rule)).toContain("make.from-sketch");
    expect(parses(make([r], { fromSketch: "the blues" }))).toBe(false);
    // Listed as implemented from Foundation on: without host support the Make opens with Oak's copy.
    expect(uses(m)).toEqual([]);
    expect(uses(m, { ...IMPLEMENTED, features: [] })).toEqual(["make.from-sketch"]);
  });
  test("never the lesson itself", () => {
    const def = mutable(lessonU01L02());
    const last = def.steps.at(-1) as { exercise: { fromSketch?: string } };
    last.exercise.fromSketch = "U01.L01";
    expect(checkLessonStructure(def).map((i) => i.rule)).not.toContain("make.from-sketch");
    last.exercise.fromSketch = def.id;
    expect(checkLessonStructure(def).map((i) => i.rule)).toContain("make.from-sketch");
  });
});

describe("a lesson split out of another (d17)", () => {
  const unit = (splitFrom: string | undefined, order = ["U05.L04", "U05.L09"]) => ({
    id: "U05",
    title: "Triads",
    track: "core",
    lessons: order.map((id) => ({
      id,
      title: id,
      objective: "o",
      introduces: [],
      practises: [],
      ...(id === "U05.L09" && splitFrom ? { splitFrom } : {}),
    })),
  });
  test("it follows the lesson it came from, inside the same unit", () => {
    expect(schemaIssues(UnitDefSchema, unit("U05.L04"))).toEqual([]);
    expect(() => defineUnit(unit("U05.L04") as never)).not.toThrow();
    expect(() => defineUnit(unit("U05.L04", ["U05.L09", "U05.L04"]) as never)).toThrow(/unit.split-from/);
    expect(() => defineUnit(unit("U04.L04") as never)).toThrow(/unit.split-from/);
    expect(() => defineUnit(unit("U05.L09") as never)).toThrow(/unit.split-from/);
  });
});

describe("the form map and the form rule", () => {
  const map = (o: object = {}, correct: object = { sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] }) =>
    identify(
      {
        ui: "form",
        sections: 4,
        vocabulary: "letters",
        input: "map",
        bars: 32,
        sectionBars: [8, 8, 8, 8],
        ...o,
      },
      correct,
    );
  test("the learner cuts the tune into sections and labels them", () => {
    expect(parses(map())).toBe(true);
    expect(rules(map())).toEqual([]);
    expect(uses(map())).toEqual(["form.map"]);
    expect(schemaIssues(AnswerSchema, { sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] })).toEqual([]);
  });
  test("it needs the tune's length and one start per section, in order, from bar 1", () => {
    expect(rules(map({ bars: undefined }))).toContain("form.map-bars");
    expect(rules(map({ sectionBars: [8, 8, 8, 4] }))).toContain("form.map-bars");
    expect(rules(map({}, { sections: ["A", "A", "B", "A"] }))).toContain("form.map-correct");
    expect(rules(map({}, { sections: ["A", "A", "B", "A"], bars: [1, 9, 17] }))).toContain(
      "form.map-correct",
    );
    expect(rules(map({}, { sections: ["A", "A", "B", "A"], bars: [2, 9, 17, 25] }))).toContain(
      "form.map-correct",
    );
    expect(rules(map({}, { sections: ["A", "A", "B", "A"], bars: [1, 17, 9, 25] }))).toContain(
      "form.map-correct",
    );
    expect(rules(map({}, { sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 33] }))).toContain(
      "form.map-correct",
    );
    expect(rules(map({ input: "label" }))).toContain("form.map-bars");
  });
  test("the form contains a bridge; the arrangement keeps the song's sections", () => {
    const bridge = { rule: "form", pattern: "*", contains: ["bridge"] };
    expect(ruleParses(bridge)).toBe(true);
    expect(ruleRules(bridge)).toEqual([]);
    expect(ruleRules({ ...bridge, contains: ["middle eight"] })).toEqual(["rubric.form-contains"]);
    expect(ruleRules({ rule: "form", pattern: "AABA", contains: ["B"] })).toEqual([]);
    expect(uses(make([rule(bridge)]))).toEqual(["form.contains"]);
    const song = { rule: "form", pattern: "@song", extra: ["intro", "outro"] };
    expect(ruleParses(song)).toBe(true);
    expect(ruleRules(song, true)).toEqual([]);
    expect(ruleRules(song)).toEqual(["rubric.form-song"]);
    expect(ruleRules({ rule: "form", pattern: "AABA", extra: ["intro"] }, true)).toEqual([
      "rubric.form-song",
    ]);
    expect(ruleRules({ ...song, extra: ["coda"] }, true)).toEqual(["rubric.form-song"]);
    expect(rules(make([rule(song)]))).toContain("rubric.form-song");
  });
});

describe("devices", () => {
  test("named as the grader reports them; the finale's six come first", () => {
    expect([...CORE_DEVICES]).toEqual([
      "secondary dominant",
      "borrowed chord",
      "modulation",
      "suspension",
      "syncopated bass",
      "modal colour",
    ]);
    expect(DEVICE_NAMES).toHaveLength(10);
    const r = { rule: "device-count", devices: [...CORE_DEVICES], min: 4 };
    expect(ruleParses(r)).toBe(true);
    expect(ruleRules(r)).toEqual([]);
    expect(ruleParses({ ...r, devices: ["secondary-dominant"] })).toBe(false);
    expect(ruleRules({ ...r, min: 7 })).toEqual(["rubric.device-count"]);
  });
});

describe("songs: sections and a key plan", () => {
  const song = (o: object = {}, key: object = {}): SongDef =>
    ({
      id: "song.five-foot-two",
      title: "Five Foot Two, Eyes of Blue",
      year: 1925,
      status: "US-PD",
      provenance: { source: "Leo Feist, Inc., New York, first edition", year: 1925 },
      verifiedBy: "a human",
      key: C,
      meter: "4/4",
      bpm: 120,
      form: "AABA",
      answerKey: {
        bars: 32,
        code: LOOP,
        layers: { melody: "mel" },
        sections: [
          { label: "A", bars: [1, 8] },
          { label: "A", bars: [9, 16] },
          { label: "B", bars: [17, 24] },
          { label: "A", bars: [25, 32] },
        ],
        ...key,
      },
      ...o,
    }) as SongDef;
  const rulesOf = (f: () => unknown) => {
    try {
      f();
      return [];
    } catch (e) {
      return (e as { issues: { rule: string }[] }).issues.map((i) => i.rule);
    }
  };
  test("sections cover the tune, one after the other", () => {
    expect(rulesOf(() => defineSong(song()))).toEqual([]);
    expect(
      rulesOf(() =>
        defineSong(
          song(
            {},
            {
              sections: [
                { label: "A", bars: [1, 8] },
                { label: "B", bars: [17, 32] },
              ],
            },
          ),
        ),
      ),
    ).toEqual(["song.sections"]);
    expect(rulesOf(() => defineSong(song({}, { sections: [{ label: "A", bars: [1, 16] }] })))).toEqual([
      "song.sections",
    ]);
  });
  test("a key plan starts in the song's key and stays inside the tune", () => {
    const plan = [
      { bar: 1, key: C },
      { bar: 17, key: D },
    ];
    expect(rulesOf(() => defineSong(song({ keyPlan: plan })))).toEqual([]);
    expect(rulesOf(() => defineSong(song({ keyPlan: [{ bar: 1, key: D }] })))).toEqual(["song.key-plan"]);
    expect(rulesOf(() => defineSong(song({ keyPlan: [plan[0], { bar: 40, key: D }] })))).toEqual([
      "song.key-plan",
    ]);
    expect(rulesOf(() => defineSong(song({ keyPlan: [...plan, { bar: 9, key: G }] })))).toEqual([
      "song.key-plan",
    ]);
  });
});

describe("the binding rubrics of contracts §6.6 for C6, C7 and CF-A are expressible", () => {
  const r = (id: string, body: object) => ({ id, label: id, required: true, skills: ["H12"], ...body });
  const C6 = [
    r("mode", {
      rule: "mode",
      tonic: "declared",
      mode: "mixolydian",
      anyOf: ["mixolydian", "dorian"],
      requireCharacteristic: true,
    }),
    r("bars", { rule: "bars", min: 16 }),
  ];
  const C7 = [
    r("secondary", { rule: "contains-rn", rn: [], kind: ["secondary-dominant"], min: 1, mustResolve: true }),
    r("mixture", { rule: "contains-rn", rn: ["bVI", "bVII", "I"], min: 1, inOrder: true }),
    r("lift", { rule: "key-change", at: "last", semitones: [1, 2], minBarsAfter: 8, sameMelody: true }),
    r("bars", { rule: "bars", min: 32 }),
  ];
  const CFA = [
    r("devices", { rule: "device-count", devices: [...CORE_DEVICES], min: 4 }),
    r("bridge", { rule: "form", pattern: "*", contains: ["bridge"] }),
    r("duration", { rule: "duration-sec", min: 120 }),
  ];
  test.each([
    ["C6", C6],
    ["C7", C7],
    ["CF-A", CFA],
  ])("%s", (_name, rubric) => {
    for (const x of rubric) expect([x.id, schemaIssues(RubricRuleSchema, x)]).toEqual([x.id, []]);
    const brief = {
      ...base,
      kind: "compose-brief",
      id: "brief",
      hints: ladder,
      role: "capstone",
      brief: "b",
      code: { starter: LOOP },
      rubric,
      review: { tutor: "offer" },
    };
    expect(parses(brief)).toBe(true);
    expect(rules(brief)).toEqual([]);
    // Everything they use is implemented or planned for this wave: no `custom` rule is left.
    expect(uses(brief, ALL)).toEqual([]);
    expect(rubric.some((x) => (x as { rule?: string }).rule === "custom")).toBe(false);
  });
});

describe("capstones: four sessions, and CF-T in gym slots", () => {
  const melody = {
    m: "melody",
    pitch: "key-relative",
    wPitch: 0.8,
    wRhythm: 0.2,
    rhythmTol: [1, 16],
  } as const;
  const changes = {
    m: "harmony",
    level: "rn",
    qualityDepth: "seventh",
    inversion: false,
    harmonicRhythm: "given",
    wrongQuality: "none",
  } as const;
  const cft = (
    o: { bassAfter?: string[]; formMap?: object | null; s4?: object; kind?: string } = {},
  ): CapstoneDef =>
    ({
      id: "CF-T",
      title: "CF-T Core Finale: Standard Transcription",
      objective: "o",
      sessions: 4,
      opensAfter: { lessonsCompleted: ["U15.L01"] },
      inGymSlots: true,
      kind: o.kind ?? "transcribe",
      version: 1,
      meter: "4/4",
      song: ["song.five-foot-two", "song.aint-she-sweet", "song.bye-bye-blackbird"],
      reviewRevisions: 2,
      canDo: [],
      sessionDefs: [
        {
          id: "CF-T.S1",
          title: "Form & bass",
          goal: "g",
          ...(o.formMap === null
            ? {}
            : {
                formMap: o.formMap ?? { id: "form-map", vocabulary: "letters", boundaries: "asked", pass: 1 },
              }),
          checks: [
            {
              id: "bass",
              phrase: [1, 4],
              layer: "bass",
              pass: 0.9,
              matcher: { ...melody, pitch: "absolute" },
              after: o.bassAfter ?? ["form-map"],
            },
          ],
        },
        {
          id: "CF-T.S2",
          title: "Changes",
          goal: "g",
          checks: [
            {
              id: "changes",
              phrase: [1, 4],
              layer: "chords",
              pass: 0.85,
              stages: ["bass", "quality", "rn"],
              matcher: changes,
              after: ["bass"],
            },
          ],
        },
        {
          id: "CF-T.S3",
          title: "Melody",
          goal: "g",
          checks: [
            { id: "melody", phrase: [1, 4], layer: "melody", pass: 0.9, matcher: melody, after: ["changes"] },
          ],
        },
        {
          id: "CF-T.S4",
          title: "Arrange",
          goal: "g",
          rubric: [
            {
              id: "roles",
              label: "Drums, bass, chords and melody",
              required: true,
              skills: ["F02"],
              rule: "tracks",
              min: 4,
              roles: ["drums", "bass", "chords", "melody"],
            },
            {
              id: "form",
              label: "The song's own sections, in order",
              required: true,
              skills: ["F03"],
              rule: "form",
              pattern: "@song",
              extra: ["intro", "outro"],
            },
          ],
          review: true,
          release: true,
          ...(o.s4 ?? {}),
        },
      ],
    }) as unknown as CapstoneDef;
  test("form map, then bass, changes and melody in order, then the arrangement", () => {
    expect(schemaIssues(CapstoneDefSchema, cft())).toEqual([]);
    expect(() => defineCapstone(cft())).not.toThrow();
    expect(cft().sessions).toBe(4);
    expect(cft().inGymSlots).toBe(true);
  });
  test("a check may wait for the form map; ids are unique across both", () => {
    expect(() => defineCapstone(cft({ bassAfter: ["form"] }))).toThrow(/capstone.check-after/);
    expect(() => defineCapstone(cft({ formMap: null }))).toThrow(/capstone.check-after/);
    expect(() =>
      defineCapstone(
        cft({ formMap: { id: "bass", vocabulary: "letters", boundaries: "asked", pass: 1 }, bassAfter: [] }),
      ),
    ).toThrow();
  });
  test("a session rubric and a form map belong to a transcribe capstone", () => {
    const issues = (() => {
      try {
        defineCapstone({ ...cft(), kind: "compose" } as CapstoneDef);
        return [];
      } catch (e) {
        return (e as { issues: { rule: string }[] }).issues.map((i) => i.rule);
      }
    })();
    expect(issues).toContain("capstone.form-map");
    expect(issues).toContain("capstone.session-rubric");
    expect(() =>
      defineCapstone(
        cft({
          s4: {
            rubric: [
              { id: "x", label: "l", required: true, skills: [], rule: "bars", min: 32 },
              { id: "x", label: "l", required: true, skills: [], rule: "bars", min: 64 },
            ],
          },
        }),
      ),
    ).toThrow(/rubric.duplicate-rule/);
  });
  test("what its sessions use that the platform must build", () => {
    const names = unimplementedInCapstoneSessions(cft(), FOUNDATION).map((u) => u.name);
    for (const f of [
      "capstone.form-map",
      "form.map",
      "harmony.wrong-quality",
      "capstone.session-rubric",
      "form.song",
    ])
      expect(names).toContain(f);
    expect(unimplementedInCapstoneSessions(cft(), ALL)).toEqual([]);
  });
});

describe("IMPLEMENTED, PLANNED and the Wave 6 shapes", () => {
  const WAVE6: SchemaFeature[] = [
    "key-plan",
    "rn-palette.slot-keys",
    "grid.steps",
    "form.map",
    "scale-builder.from",
    "staff-input.ties",
    "staff-input.dots",
    "staff-input.triplets",
    "meter.compound",
    "sing.guide-tones",
    "harmony.wrong-quality",
    "contains-rn.kind",
    "contains-rn.in-order",
    "form.contains",
    "form.song",
    "mode.any-of",
    "guide-tones.motion",
    "modulation.via",
    "velocity-ghosts.accents",
    "make.from-sketch",
    "capstone.form-map",
    "capstone.session-rubric",
  ];
  test("every Wave 6 feature is a schema feature, planned or implemented, never both", () => {
    for (const f of WAVE6) {
      expect(SCHEMA_FEATURES as readonly string[]).toContain(f);
      const planned = (PLANNED.features ?? []).includes(f);
      const implemented = (IMPLEMENTED.features ?? []).includes(f);
      expect([f, planned !== implemented]).toEqual([f, true]);
    }
  });
  test("the rules of C6, C7 and CF-A are planned or implemented, never both", () => {
    for (const r of [
      "mode",
      "key-change",
      "modulation",
      "guide-tones",
      "velocity-ghosts",
      "device-count",
      "reharmonize",
    ] as const) {
      const planned = PLANNED.rubricRules.includes(r);
      const implemented = IMPLEMENTED.rubricRules.includes(r);
      expect([r, planned !== implemented]).toEqual([r, true]);
    }
    for (const r of PLANNED.rubricRules) expect(RUBRIC_RULE_NAMES as readonly string[]).toContain(r);
  });
});
