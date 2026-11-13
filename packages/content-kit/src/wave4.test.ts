// The Wave 4 schema additions (harmony, album and transcription): each new shape parses where it belongs
// and is refused where it does not, the structural rules of `checkExercise`, `checkLessonStructure` and
// `defineCapstone` catch the mistakes an author can make with it, and `unimplementedIn` keeps a lesson off
// a shape the platform does not grade yet (`PLANNED` until the Build phase moves it into `IMPLEMENTED`).
import { describe, expect, test } from "bun:test";
import { checkExercise, checkLessonStructure, defineCapstone, schemaIssues } from "./define.ts";
import { ladder, lessonU01L02, mutable } from "./fixtures.test-data.ts";
import {
  GRADER_READY,
  IMPLEMENTED,
  PLANNED,
  plannedOrImplemented,
  SCHEMA_FEATURES,
  unimplementedIn,
  unimplementedInLesson,
} from "./implemented.ts";
import {
  CADENCE_OPTIONS,
  CADENCE_TYPES,
  type CapstoneDef,
  type Exercise,
  FUNCTION_OPTIONS,
  HARMONIC_FUNCTIONS,
  RUBRIC_RULE_NAMES,
  WORKBENCH_PANEL_TOOLS,
  WORKBENCH_PANELS,
} from "./schema/index.ts";
import { CONTENT_SCHEMA_VERSION } from "./version.ts";
import { ExerciseSchema, RubricRuleSchema, StepUiSchema } from "./zod.ts";

const base = { version: 1, prompt: "p", skills: [{ skill: "C01", w: 1 }], role: "practice", tests: [] };
const parses = (x: unknown) => schemaIssues(ExerciseSchema, x).length === 0;
const rules = (x: unknown) => checkExercise(x as Exercise, "ex").map((i) => i.rule);
const TRIADS = 'setcpm(84/4)\n\nchords: n("<[0,2,4] [3,5,7]>").scale("C3:major").s("piano")';
const LOOP = `${TRIADS}\nbass: n("<0 3>").scale("C2:major").s("ebass")`;
const ref = { solutions: [LOOP], bars: 2 };
const cue = { context: "tonic-chord", countInBars: 1, click: false, replays: -1 } as const;
const rule = (body: object) => ({ id: "r", label: "l", required: true, skills: ["C01"], ...body });
const ruleParses = (body: object) => schemaIssues(RubricRuleSchema, rule(body)).length === 0;

test("the content schema version is 3 with the Wave 4 shapes", () => {
  expect(CONTENT_SCHEMA_VERSION).toBe(3);
});

describe("slot-choice: a function strip or a cadence per phrase", () => {
  const strip = (o: object = {}, correct: string[] = ["T", "PD", "D", "T"]) => ({
    ...base,
    kind: "identify",
    id: "strip",
    hints: ladder,
    stimulus: { src: "code", code: TRIADS, bars: 2, showCode: false },
    cue,
    answer: { ui: "slot-choice", slots: 4, options: FUNCTION_OPTIONS, ...o },
    correct: { choice: correct },
  });
  test("one option id per slot, from the shared options", () => {
    expect(parses(strip())).toBe(true);
    expect(rules(strip({ labels: ["Bar 1", "Bar 2", "Bar 3", "Bar 4"] }))).toEqual([]);
    expect(FUNCTION_OPTIONS.map((o) => o.id)).toEqual([...HARMONIC_FUNCTIONS]);
    for (const o of CADENCE_OPTIONS) expect(CADENCE_TYPES as readonly string[]).toContain(o.id);
  });
  test("wrong counts and unknown ids are caught", () => {
    expect(rules(strip({ labels: ["Bar 1"] }))).toEqual(["slot-choice.labels"]);
    expect(rules(strip({}, ["T", "PD", "D"]))).toEqual(["slot-choice.correct"]);
    expect(rules(strip({}, ["T", "PD", "D", "X"]))).toEqual(["slot-choice.correct"]);
    expect(parses(strip({ slots: 0 }))).toBe(false);
    expect(parses(strip({ options: [FUNCTION_OPTIONS[0]] }))).toBe(false);
  });
});

describe("chords on the staff", () => {
  const write = (palette: object, expect: object) => ({
    ...base,
    kind: "staff-write",
    id: "build",
    hints: ladder,
    answer: {
      ui: "staff-input",
      clef: "grand",
      bars: 2,
      palette: { durations: ["2"], accidentals: true, ties: false, rests: false, ...palette },
    },
    expect,
  });
  const chords = { e: "chords", symbols: ["C", "G/B"], spelling: "strict", bass: true };
  test("symbols with a slash for the bass, spelled strictly or by sound", () => {
    expect(parses(write({ chords: true }, chords))).toBe(true);
    expect(rules(write({ chords: true }, chords))).toEqual([]);
    expect(parses(write({ chords: true }, { ...chords, spelling: "loose" }))).toBe(false);
    expect(parses(write({ chords: true }, { ...chords, symbols: [] }))).toBe(false);
  });
  test("chords need a palette that stacks notes", () => {
    expect(rules(write({}, chords))).toEqual(["staff.chords-palette"]);
  });
});

describe("staged chord dictation: bass, then quality, then numeral", () => {
  const dictation = (o: object = {}) => ({
    ...base,
    kind: "dictation",
    id: "loop",
    hints: ladder,
    domain: "harmony",
    stimulus: { src: "code", code: LOOP, bars: 2, showCode: false },
    cue,
    answer: { ui: "rn-palette", slots: 2, allow: ["triads"] },
    stages: ["bass", "quality", "rn"],
    reference: ref,
    matcher: { m: "harmony", level: "rn", qualityDepth: "triad", inversion: false, harmonicRhythm: "given" },
    stageAnswers: {
      bass: { ui: "degree-pad", set: ["1", "2", "3", "4", "5", "6"], sequenceLen: 2, syllables: false },
      quality: { ui: "quality-pad", set: ["maj", "min"] },
      rn: { ui: "rn-palette", slots: 2, allow: ["triads"] },
    },
    ...o,
  });
  test("a widget per stage, sequential by default", () => {
    expect(parses(dictation())).toBe(true);
    expect(rules(dictation({ stageFlow: "sequential", stagePass: 0.8 }))).toEqual([]);
    expect(parses(dictation({ stageFlow: "random" }))).toBe(false);
  });
  test("a stage without a widget, a widget without a stage, chord stages out of order", () => {
    expect(rules(dictation({ stages: ["bass", "quality"] }))).toEqual(["dictation.stage-answers"]);
    expect(rules(dictation({ stages: ["bass", "quality", "rn", "tonic"] }))).toEqual([
      "dictation.stage-answers",
    ]);
    const swapped = dictation({ stages: ["quality", "bass", "rn"] });
    expect(rules(swapped)).toEqual(["dictation.stage-order"]);
    const loose = dictation({ stageAnswers: undefined, stagePass: 0.8 });
    expect(rules(loose)).toEqual(["dictation.stage-answers"]);
  });
});

describe("by-ear transcription in parts, bass first", () => {
  const bassPart = {
    track: "bass",
    label: "The bass: one note a bar",
    matcher: { m: "melody", pitch: "absolute", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 8], track: "bass" },
  };
  const chordPart = {
    track: "chords",
    label: "The chords above it",
    matcher: { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
    pass: 0.8,
  };
  const byEar = (parts: object[]) => ({
    ...base,
    kind: "dictation",
    id: "by-ear",
    hints: ladder,
    domain: "harmony",
    stimulus: { src: "code", code: LOOP, bars: 2, showCode: false },
    cue,
    answer: { ui: "code", starter: 'setcpm(84/4)\n\nbass: n("⟪0⟫").scale("C2:major").s("ebass")' },
    reference: ref,
    matcher: { m: "pcset", perOnset: true, bass: true },
    byEar: { ab: true, rates: [1, 0.75], accepts: "exact", parts },
  });
  test("the bass, then the chords", () => {
    expect(parses(byEar([bassPart, chordPart]))).toBe(true);
    // The step's own matcher is a pcset (no pitch mode): `accepts` still needs a pitched one.
    expect(rules(byEar([bassPart, chordPart]))).toEqual(["by-ear.accepts-matcher"]);
    const pitched = {
      ...byEar([bassPart, chordPart]),
      matcher: { m: "all", of: [bassPart.matcher, chordPart.matcher] },
    };
    expect(rules(pitched)).toEqual([]);
  });
  test("chords before the bass, or one track twice, are caught", () => {
    const x = (parts: object[]) => ({
      ...byEar(parts),
      matcher: { m: "all", of: [bassPart.matcher, chordPart.matcher] },
    });
    expect(rules(x([chordPart, bassPart]))).toEqual(["by-ear.bass-first"]);
    expect(rules(x([bassPart, { ...chordPart, track: "bass" }]))).toEqual(["by-ear.parts-tracks"]);
    expect(parses(byEar([]))).toBe(false);
  });
});

describe("staged transcription and what is given", () => {
  const step = (o: object = {}, stages?: object[]) => ({
    ...base,
    kind: "transcribe-step",
    id: "chords-bass-first",
    hints: ladder,
    projectId: "x1",
    ladder: 5,
    stimulus: { src: "capstone-song", bars: [1, 9], layers: ["bass", "chords"] },
    layer: "chords",
    bars: [1, 9],
    grading: {
      mode: "auto",
      reference: ref,
      matcher: {
        m: "harmony",
        level: "rn",
        qualityDepth: "triad",
        inversion: false,
        harmonicRhythm: "given",
      },
      ...(stages ? { stages } : {}),
    },
    studio: { minRate: 0.5, overlay: true },
    given: { meter: true, key: true, tonic: true, pickup: true },
    ...o,
  });
  const st = (stage: string) => ({
    stage,
    matcher: { m: "harmony", level: stage, qualityDepth: "triad", inversion: false, harmonicRhythm: "given" },
    pass: 0.8,
  });
  test("bass → quality → rn, inside a capstone", () => {
    const x = step({}, [st("bass"), st("quality"), st("rn")]);
    expect(parses(x)).toBe(true);
    expect(checkExercise(x as unknown as Exercise, "ex", "capstone").map((i) => i.rule)).toEqual([]);
  });
  test("stages out of order, or the capstone's song outside a capstone", () => {
    const x = step({}, [st("rn"), st("bass")]);
    expect(checkExercise(x as unknown as Exercise, "ex", "capstone").map((i) => i.rule)).toEqual([
      "transcribe.stage-order",
    ]);
    expect(rules(step())).toEqual(["stimulus.capstone-song"]);
    expect(parses(step({ given: { meter: true, colour: true } }))).toBe(false);
  });
});

describe("rubric: the voice-leading gate, a window on the progression, pickups, qualities, inversions", () => {
  test("new fields and rules parse", () => {
    expect(
      ruleParses({
        rule: "voice-leading",
        track: "chords",
        maxMovePerVoice: 2,
        voices: 3,
        commonTones: true,
        noCrossing: true,
      }),
    ).toBe(true);
    expect(
      ruleParses({ rule: "progression", schema: "schema.axis", allowRotation: true, bars: [1, 6] }),
    ).toBe(true);
    expect(ruleParses({ rule: "pickup", track: "mel", units: [1, 1] })).toBe(true);
    expect(ruleParses({ rule: "chord-qualities", contains: ["min"], min: 1 })).toBe(true);
    expect(ruleParses({ rule: "chord-inversions", min: 1, of: [1] })).toBe(true);
    for (const r of ["pickup", "chord-qualities", "chord-inversions"])
      expect(RUBRIC_RULE_NAMES as readonly string[]).toContain(r);
  });
  test("malformed rules are refused", () => {
    expect(ruleParses({ rule: "voice-leading", track: "chords", maxMovePerVoice: 2, voices: 0 })).toBe(false);
    expect(ruleParses({ rule: "chord-inversions", min: 1, of: [3] })).toBe(false);
    expect(ruleParses({ rule: "chord-qualities", contains: ["minor"] })).toBe(false);
    expect(ruleParses({ rule: "progression", rn: ["I"], bars: [0, 4] })).toBe(false);
  });
  test("a backwards window and a qualities rule that asks for nothing are caught", () => {
    const make = (r: object) => ({
      ...base,
      kind: "code-make",
      id: "make",
      hints: ladder,
      code: { starter: TRIADS },
      bars: [2, 4],
      rubric: [rule(r)],
      saveAs: "sketch",
    });
    expect(rules(make({ rule: "progression", rn: ["I", "IV"], bars: [4, 1] }))).toEqual([
      "rubric.bars-window",
    ]);
    expect(rules(make({ rule: "chord-qualities" }))).toEqual(["rubric.chord-qualities"]);
  });
});

describe("step UI: panels opened by a step, a lead sheet", () => {
  const ui = { panels: { roll: true, staff: "lead", keyboard: false } };
  test("panels name toolbox rows; a lead sheet takes a chord track or a chart", () => {
    expect(schemaIssues(StepUiSchema, { ...ui, initialPanels: ["key", "circle"] })).toEqual([]);
    expect(schemaIssues(StepUiSchema, { ...ui, initialPanels: ["mixer"] }).length).toBeGreaterThan(0);
    expect(Object.keys(WORKBENCH_PANEL_TOOLS).sort()).toEqual([...WORKBENCH_PANELS].sort());
    expect(schemaIssues(StepUiSchema, { ...ui, leadSheet: { chords: "chords", title: "Aura Lee" } })).toEqual(
      [],
    );
    const chart = { chart: [{ bar: 0, beat: 3, symbol: "G" }] };
    expect(schemaIssues(StepUiSchema, { ...ui, leadSheet: { chords: chart, degrees: false } })).toEqual([]);
    expect(
      schemaIssues(StepUiSchema, { ...ui, leadSheet: { chords: { chart: [] } } }).length,
    ).toBeGreaterThan(0);
  });
  test("a lead sheet lives in the lead staff panel; a panel is opened once", () => {
    const def = mutable(lessonU01L02());
    const step = def.steps[0] as { ui: object };
    step.ui = { panels: { roll: true, staff: "treble", keyboard: false }, leadSheet: { chords: "chords" } };
    expect(checkLessonStructure(def).map((i) => i.rule)).toContain("lead-sheet.staff-panel");
    step.ui = { panels: { roll: true, staff: false, keyboard: false }, initialPanels: ["key", "key"] };
    expect(checkLessonStructure(def).map((i) => i.rule)).toContain("step.initial-panels");
  });
});

describe("capstone sessions: phrase checks, starter, review, release", () => {
  const melody = { m: "melody", pitch: "key-relative", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 16] };
  const harmony = {
    m: "harmony",
    level: "rn",
    qualityDepth: "triad",
    inversion: false,
    harmonicRhythm: "given",
  };
  const x1 = (o: { s1?: object; s3?: object } = {}): CapstoneDef =>
    ({
      id: "X1",
      title: "X1 Folk Transcription",
      objective: "o",
      sessions: 3,
      opensAfter: { checkpoints: ["U07.CP"], capstones: ["C2"] },
      kind: "transcribe",
      version: 1,
      meter: "4/4",
      song: ["song.aura-lee", "song.red-river-valley"],
      sessionDefs: [
        {
          id: "X1.S1",
          title: "Phrases 1–2",
          goal: "g",
          checks: [
            {
              id: "p1",
              phrase: 1,
              layer: "melody",
              matcher: melody,
              pass: 0.85,
              given: { meter: true, pickup: true },
            },
            { id: "p2", phrase: 2, layer: "melody", matcher: melody, pass: 0.85 },
          ],
          ...o.s1,
        },
        {
          id: "X1.S2",
          title: "Phrases 3–4",
          goal: "g",
          checks: [{ id: "p34", phrase: [3, 4], layer: "melody", matcher: melody, pass: 0.85 }],
        },
        {
          id: "X1.S3",
          title: "Chords",
          goal: "g",
          checks: [
            {
              id: "chords",
              phrase: [1, 4],
              layer: "chords",
              matcher: harmony,
              pass: 0.8,
              stages: ["bass", "quality", "rn"],
            },
          ],
          review: true,
          release: true,
          ...o.s3,
        },
      ],
      reviewRevisions: 1,
      canDo: ["cd.transcribe.folk-tune"],
    }) as unknown as CapstoneDef;
  test("phrase checks per session, review and release in the last one", () => {
    expect(defineCapstone(x1()).sessionDefs[2]?.release).toBe(true);
  });
  test("release before the end, stages on a melody, a repeated check id are refused", () => {
    expect(() => defineCapstone(x1({ s1: { release: true } }))).toThrow(/capstone.release-last/);
    expect(() =>
      defineCapstone(
        x1({
          s1: {
            checks: [{ id: "p1", phrase: 1, layer: "melody", matcher: melody, pass: 0.85, stages: ["bass"] }],
          },
        }),
      ),
    ).toThrow(/capstone.check-stages/);
    expect(() =>
      defineCapstone(
        x1({ s3: { checks: [{ id: "p2", phrase: [2, 1], layer: "melody", matcher: melody, pass: 0.85 }] } }),
      ),
    ).toThrow(/capstone.check-id|capstone.check-phrase/);
  });
});

describe("IMPLEMENTED, PLANNED and the shapes inside a kind", () => {
  test("Wave 4 adds the harmony rules and widgets the grader and the app already handle", () => {
    for (const r of [
      "cadence",
      "chord-tones-strong",
      "progression",
      "contains-rn",
      "harmonic-rhythm",
      "voice-leading",
    ])
      expect(IMPLEMENTED.rubricRules as readonly string[]).toContain(r);
    expect(IMPLEMENTED.matchers).toContain("harmony");
    expect(IMPLEMENTED.answerUis).toEqual(expect.arrayContaining(["quality-pad", "rn-palette"]));
  });
  test("PLANNED lists every Wave 4 shape not yet implemented, and nothing already implemented", () => {
    expect([...(PLANNED.features ?? []), ...(IMPLEMENTED.features ?? [])].sort()).toEqual(
      [...SCHEMA_FEATURES].sort(),
    );
    for (const f of IMPLEMENTED.features ?? []) expect(PLANNED.features).not.toContain(f);
    for (const r of PLANNED.rubricRules) expect(IMPLEMENTED.rubricRules).not.toContain(r);
    for (const a of PLANNED.answerUis) expect(IMPLEMENTED.answerUis).not.toContain(a);
    const both = plannedOrImplemented();
    expect(both.answerUis).toContain("slot-choice");
    expect(both.rubricRules).toContain("pickup");
  });
  test("Build (grader): the grader-only rules and features are implemented; grader-ready ones wait for renderers", () => {
    for (const r of ["pickup", "chord-qualities", "chord-inversions"])
      expect(IMPLEMENTED.rubricRules as readonly string[]).toContain(r);
    expect(IMPLEMENTED.features).toEqual(expect.arrayContaining(["voice-leading.gate", "progression.bars"]));
    for (const f of GRADER_READY.features ?? []) expect(SCHEMA_FEATURES as readonly string[]).toContain(f);
  });
  test("Integration: shapes graded here and rendered by the app are implemented; grader-ready ones are not", () => {
    expect(IMPLEMENTED.answerUis).toContain("slot-choice");
    expect(IMPLEMENTED.features).toEqual(
      expect.arrayContaining([
        "staff-expect.chords",
        "dictation.stage-answers",
        "by-ear.parts",
        "lead-sheet",
        "step.initial-panels",
        "step.gate-check",
      ]),
    );
    for (const f of GRADER_READY.features ?? []) expect(IMPLEMENTED.features).not.toContain(f);
    expect(PLANNED.features).toEqual(["transcribe.stages", "stimulus.capstone-song"]);
  });
  test("non-chord-tones (U07.L04–L05): a track, optional harmony and roles, a count", () => {
    expect(ruleParses({ rule: "non-chord-tones", track: "mel", min: 2 })).toBe(true);
    expect(
      ruleParses({
        rule: "non-chord-tones",
        track: "mel",
        harmony: "band.chords",
        roles: ["passing", "neighbour"],
        min: 1,
      }),
    ).toBe(true);
    expect(ruleParses({ rule: "non-chord-tones", track: "mel", roles: ["neighbor"], min: 1 })).toBe(false);
    expect(ruleParses({ rule: "non-chord-tones", track: "mel", min: 0 })).toBe(false);
    expect(IMPLEMENTED.rubricRules as readonly string[]).toContain("non-chord-tones");
  });
  test("a lesson using a planned shape is reported until it moves into IMPLEMENTED", () => {
    const gate = {
      ...base,
      kind: "code-modify",
      id: "hand-voiced-cadence",
      hints: ladder,
      code: { starter: TRIADS },
      reference: ref,
      matcher: {
        m: "all",
        of: [
          { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
          {
            m: "rubric",
            rules: [
              rule({
                rule: "voice-leading",
                track: "chords",
                maxMovePerVoice: 2,
                voices: 3,
                commonTones: true,
              }),
            ],
          },
        ],
      },
      target: { audible: true },
    } as unknown as Exercise;
    // Implemented in Build (grader); a planned feature is still reported.
    expect(unimplementedIn(gate)).toEqual([]);
    const notYet = { ...IMPLEMENTED, features: [] };
    expect(unimplementedIn(gate, notYet).map((u) => `${u.what}:${u.name}`)).toEqual([
      "feature:voice-leading.gate",
    ]);
    expect(unimplementedIn(gate, plannedOrImplemented())).toEqual([]);
    const def = mutable(lessonU01L02());
    (def.steps[0] as { ui: object }).ui = {
      panels: { roll: true, staff: false, keyboard: false },
      initialPanels: ["circle"],
    };
    // Implemented at integration; a platform without the feature still reports it.
    expect(unimplementedInLesson(def)).toEqual([]);
    expect(unimplementedInLesson(def, notYet).map((u) => u.name)).toContain("step.initial-panels");
  });
});

describe("the voicing gate's second chance (U05.L08 S1)", () => {
  test("a gate-check step is the first, graded step", () => {
    const def = mutable(lessonU01L02());
    const steps = def.steps as { gateCheck?: true; graded?: boolean }[];
    (steps[0] as { gateCheck?: true }).gateCheck = true;
    expect(checkLessonStructure(def).map((i) => i.rule)).toContain("step.gate-check");
    const graded = def.steps.findIndex((s) => s.graded);
    delete (steps[0] as { gateCheck?: true }).gateCheck;
    (steps[graded] as { gateCheck?: true }).gateCheck = true;
    expect(checkLessonStructure(def).map((i) => i.rule)).toContain("step.gate-check");
    expect(unimplementedInLesson(def).map((u) => u.name)).not.toContain("step.gate-check");
    expect(unimplementedInLesson(def, { ...IMPLEMENTED, features: [] }).map((u) => u.name)).toContain(
      "step.gate-check",
    );
  });
  test("chord-qualities: anyOf, with a count", () => {
    expect(ruleParses({ rule: "chord-qualities", anyOf: ["dim", "aug"], min: 1 })).toBe(true);
    expect(ruleParses({ rule: "chord-qualities", anyOf: [] })).toBe(false);
  });
});
