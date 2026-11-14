// The Wave 5 schema additions (bass lines, form, minor, pentatonic and blues, the sound side lessons): each
// new shape parses where it belongs and is refused where it does not, the structural rules of
// `checkExercise`, `checkLessonStructure`, `defineUnit` and `defineCapstone` catch the mistakes an author can
// make with it, and `unimplementedIn` keeps a lesson off a shape the platform does not grade yet.
import { describe, expect, test } from "bun:test";
import {
  checkExercise,
  checkLessonStructure,
  checkMinorDegrees,
  defineCapstone,
  defineUnit,
  schemaIssues,
} from "./define.ts";
import { ladder, lessonU01L02, mutable } from "./fixtures.test-data.ts";
import {
  IMPLEMENTED,
  PLANNED,
  plannedOrImplemented,
  SCHEMA_FEATURES,
  unimplementedIn,
  unimplementedInCapstoneSessions,
  unimplementedInLesson,
} from "./implemented.ts";
import {
  BASS_MEMBERS,
  type CapstoneDef,
  DEGREE_SYLLABLES,
  DEGREES,
  type Exercise,
  FEEL_OPTIONS,
  FORM_SECTION_NAMES,
  formLetters,
  MINOR_OPTIONS,
  MINOR_THIRD_MODES,
  MODE_DEGREES,
  PROBE_KINDS,
  PROBE_TOOLS,
  RUBRIC_RULE_NAMES,
  SCALE_COLOUR_OPTIONS,
  SCALE_MODES,
  WORKBENCH_PANEL_TOOLS,
} from "./schema/index.ts";
import { CONTENT_SCHEMA_VERSION } from "./version.ts";
import { ExerciseSchema, RubricRuleSchema, StepUiSchema, UnitDefSchema } from "./zod.ts";

const base = { version: 1, prompt: "p", skills: [{ skill: "B01", w: 1 }], role: "practice", tests: [] };
const parses = (x: unknown) => schemaIssues(ExerciseSchema, x).length === 0;
const rules = (x: unknown) => checkExercise(x as Exercise, "ex").map((i) => i.rule);
const cue = { context: "tonic-chord", countInBars: 1, click: false, replays: -1 } as const;
const LOOP = 'setcpm(90/4)\n\nchords: n("<[0,2,4] [5,7,9]>").scale("C3:major").s("piano")';
const rule = (body: object) => ({ id: "r", label: "l", required: true, skills: ["B01"], ...body });
const ruleParses = (body: object) => schemaIssues(RubricRuleSchema, rule(body)).length === 0;
const identify = (answer: object, correct: object) => ({
  ...base,
  kind: "identify",
  id: "x",
  hints: ladder,
  stimulus: { src: "code", code: LOOP, bars: 2, showCode: false },
  cue,
  answer,
  correct,
});

test("the content schema version is 4 with the Wave 5 shapes", () => {
  expect(CONTENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(4);
});

describe("modes, degrees and do-based minor syllables", () => {
  test("every mode lists its degrees; the minors are spelled ♭3 ♭6 ♭7 against major", () => {
    for (const m of SCALE_MODES) {
      expect(MODE_DEGREES[m][0]).toBe("1");
      for (const d of MODE_DEGREES[m]) expect(DEGREES as readonly string[]).toContain(d);
    }
    expect(MODE_DEGREES.minor).toEqual(["1", "2", "b3", "4", "5", "b6", "b7"]);
    expect(MODE_DEGREES["harmonic minor"]).toContain("7");
    expect(MODE_DEGREES["melodic minor"]).toEqual(["1", "2", "b3", "4", "5", "6", "7"]);
    expect(MODE_DEGREES["major pentatonic"]).toEqual(["1", "2", "3", "5", "6"]);
    expect(MODE_DEGREES["minor pentatonic"]).toEqual(["1", "b3", "4", "5", "b7"]);
    expect(MODE_DEGREES.blues).toEqual(["1", "b3", "4", "b5", "5", "b7"]);
    for (const m of MINOR_THIRD_MODES) expect(MODE_DEGREES[m]).toContain("b3");
  });
  test("1 is do in minor too; ♭3 ♭6 ♭7 are me, le, te", () => {
    expect(MODE_DEGREES.minor.map((d) => DEGREE_SYLLABLES[d])).toEqual([
      "do",
      "re",
      "me",
      "fa",
      "sol",
      "le",
      "te",
    ]);
    expect(DEGREE_SYLLABLES.b5).toBe("se");
  });
});

describe("form: label or order the sections of a piece heard", () => {
  const form = (o: object = {}, sections = ["verse", "chorus", "verse", "chorus"]) =>
    identify(
      { ui: "form", sections: 4, vocabulary: ["verse", "chorus", "bridge"], input: "label", ...o },
      { sections },
    );
  test("names or letters, one per section", () => {
    expect(parses(form())).toBe(true);
    expect(rules(form())).toEqual([]);
    expect(rules(form({ vocabulary: "letters" }, ["A", "A", "B", "A"]))).toEqual([]);
    expect(rules(form({ input: "order", sectionBars: [8, 8, 8, 8] }))).toEqual([]);
    expect(rules(form({}, ["verse", "chorus2", "verse", "chorus"]))).toEqual([]);
  });
  test("wrong counts, unknown names and letters out of order are caught", () => {
    expect(rules(form({}, ["verse", "chorus"]))).toContain("form.correct");
    expect(rules(form({}, ["verse", "hook", "verse", "chorus"]))).toContain("form.vocabulary");
    expect(rules(form({ vocabulary: "letters" }, ["B", "A", "B", "A"]))).toContain("form.letters");
    expect(rules(form({ sectionBars: [8, 8] }))).toContain("form.section-bars");
    expect(parses(form({ vocabulary: ["verse", "hook"] }))).toBe(false);
    expect(parses(form({ sections: 1 }))).toBe(false);
  });
  test("letters by first appearance: names and letters are one shape", () => {
    expect(formLetters(["verse", "chorus", "verse", "chorus"])).toBe("ABAB");
    expect(formLetters(["A", "A", "B", "A"])).toBe("AABA");
    expect(formLetters(["verse", "chorus2", "bridge", "chorus"])).toBe("ABCB");
    expect(formLetters(["B", "A", "B"])).toBe("ABA");
    expect([...FORM_SECTION_NAMES]).toContain("chorus");
  });
});

describe("bar-grid: a numeral or chord symbol per bar of a twelve-bar chart", () => {
  const BLUES = ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"];
  const grid = (o: object = {}, correct: object = { rn: BLUES }) =>
    identify(
      { ui: "bar-grid", bars: 12, perRow: 4, entry: "rn", qualities: ["7"], given: [1], ...o },
      correct,
    );
  test("one entry per bar", () => {
    expect(parses(grid())).toBe(true);
    expect(rules(grid())).toEqual([]);
    expect(
      rules(
        grid(
          { entry: "symbol" },
          { text: ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"] },
        ),
      ),
    ).toEqual([]);
  });
  test("a short chart, the wrong answer field or a given bar outside it is caught", () => {
    expect(rules(grid({}, { rn: BLUES.slice(0, 8) }))).toContain("bar-grid.correct");
    expect(rules(grid({ entry: "symbol" }))).toContain("bar-grid.correct");
    expect(rules(grid({ given: [13] }))).toContain("bar-grid.given");
    expect(parses(grid({ qualities: [] }))).toBe(false);
  });
});

describe("scale-builder: the notes of a scale on a keyboard or by degree", () => {
  const build = (o: object = {}, degrees: string[] = ["1", "b3", "4", "5", "b7"]) =>
    identify({ ui: "scale-builder", tonic: "A", input: "degrees", palette: [...DEGREES], ...o }, { degrees });
  test("a set of degrees with home in it", () => {
    expect(parses(build())).toBe(true);
    expect(rules(build())).toEqual([]);
    expect(rules(build({ input: "keyboard", palette: undefined, range: ["a3", "a4"] }))).toEqual([]);
  });
  test("no home, a repeated degree, or an answer missing from the pad is caught", () => {
    expect(rules(build({}, ["b3", "5"]))).toContain("scale-builder.correct");
    expect(rules(build({}, ["1", "b3", "b3"]))).toContain("scale-builder.correct");
    expect(rules(build({ palette: ["1", "2", "3", "4", "5", "6", "7"] }))).toContain("scale-builder.palette");
  });
});

describe("standard options for feel, minors and scale colours", () => {
  test("ids are stable and the minor and colour ids are scale modes", () => {
    expect(FEEL_OPTIONS.map((o) => o.id)).toEqual(["straight", "swung"]);
    for (const o of [...MINOR_OPTIONS, ...SCALE_COLOUR_OPTIONS])
      expect(SCALE_MODES as readonly string[]).toContain(o.id);
  });
});

describe("controls: match this sound within a tolerance", () => {
  const TARGET = 'setcpm(90/4)\n\nbass: note("c2 c2 g1 c2").s("sawtooth").lpf(400)';
  const match = (controls: object[], kind = "code-modify") => ({
    ...base,
    skills: [{ skill: "D03", w: 1 }],
    kind,
    id: "match",
    hints: ladder,
    code: { starter: 'setcpm(90/4)\n\nbass: note("c2 c2 g1 c2").s("sawtooth").lpf(⟪2000⟫)' },
    reference: { solutions: [TARGET], bars: 1 },
    matcher: { m: "controls", controls },
    target: { audible: true, showRoll: false },
  });
  test("a log tolerance on cutoff, linear on times, exact on names", () => {
    const ok = match([
      { control: "lpf", scale: "log", tol: 0.5 },
      { control: "release", scale: "linear", tol: 0.1 },
      { control: "s", scale: "exact", tol: 0 },
    ]);
    expect(parses(ok)).toBe(true);
    expect(rules(ok)).toEqual([]);
  });
  test("a control listed twice or a negative tolerance is caught", () => {
    expect(
      rules(
        match([
          { control: "lpf", scale: "log", tol: 0.5 },
          { control: "lpf", scale: "linear", tol: 10 },
        ]),
      ),
    ).toContain("controls.unique");
    expect(parses(match([{ control: "lpf", scale: "log", tol: -1 }]))).toBe(false);
    expect(parses(match([]))).toBe(false);
  });
  test("implemented since the grader reads control values (Wave 5 Build)", () => {
    expect(IMPLEMENTED.matchers).toContain("controls");
    expect(PLANNED.matchers).not.toContain("controls");
    expect(
      unimplementedIn(match([{ control: "lpf", scale: "log", tol: 0.5 }]) as unknown as Exercise).map(
        (u) => u.name,
      ),
    ).not.toContain("controls");
    // Against the Foundation list it was planned: `unimplementedIn` still reports it for an older impl.
    expect(
      unimplementedIn(match([{ control: "lpf", scale: "log", tol: 0.5 }]) as unknown as Exercise, {
        ...IMPLEMENTED,
        matchers: IMPLEMENTED.matchers.filter((m) => m !== "controls"),
      }).map((u) => u.name),
    ).toContain("controls");
  });
});

describe("rubric rules for bass lines, sections, minor and blues", () => {
  test("bass-line: roots, members, approach", () => {
    expect(ruleParses({ rule: "bass-line", track: "bass", roots: { on: "change", minRatio: 0.75 } })).toBe(
      true,
    );
    expect(
      ruleParses({
        rule: "bass-line",
        track: "bass",
        harmony: "chords",
        members: { allowed: ["root", "fifth", "octave"], minRatio: 0.9, each: true },
        approach: { min: 2, kinds: ["chromatic"] },
      }),
    ).toBe(true);
    expect(
      ruleParses({ rule: "bass-line", track: "bass", members: { allowed: ["ninth"], minRatio: 1 } }),
    ).toBe(false);
    expect([...BASS_MEMBERS]).toEqual(["root", "fifth", "octave", "third", "approach"]);
  });
  test("every rule may read one section; contrast and key-change may not take one", () => {
    expect(ruleParses({ rule: "progression", schema: "schema.aeolian", section: { section: "verse" } })).toBe(
      true,
    );
    expect(ruleParses({ rule: "contains-rn", rn: ["V"], min: 1, section: { bars: [12, 12] } })).toBe(true);
    expect(ruleParses({ rule: "groove-lock", kick: "drums", bass: "bass", min: 0.5, section: "last" })).toBe(
      true,
    );
    expect(ruleParses({ rule: "bars", min: 4, section: { section: "" } })).toBe(false);
  });
  test("the new fields of existing rules parse", () => {
    expect(ruleParses({ rule: "ends-on-degree", degrees: ["1"], track: "mel", over: "i" })).toBe(true);
    expect(ruleParses({ rule: "blues-form", variant: "standard", choruses: 2, quickChangeOk: true })).toBe(
      true,
    );
    expect(ruleParses({ rule: "degree-set", track: "mel", anyOf: ["b3", "b5"], minCount: 2 })).toBe(true);
    expect(ruleParses({ rule: "chord-qualities", subsetOf: ["7"], depth: "seventh" })).toBe(true);
    expect(ruleParses({ rule: "notates", view: "lead-sheet", melody: "mel" })).toBe(true);
    expect(RUBRIC_RULE_NAMES).toContain("bass-line");
    expect(RUBRIC_RULE_NAMES).toContain("notates");
  });
  const make = (rubric: object[]) => ({
    ...base,
    kind: "code-make",
    id: "make",
    hints: ladder,
    code: { starter: LOOP },
    bars: [2, 8],
    rubric,
    saveAs: "sketch",
  });
  test("structural mistakes are caught", () => {
    expect(rules(make([rule({ rule: "bass-line", track: "bass" })]))).toContain("rubric.bass-line");
    expect(rules(make([rule({ rule: "degree-set", track: "mel" })]))).toContain("rubric.degree-set");
    expect(rules(make([rule({ rule: "bars", min: 4, section: { bars: [5, 2] } })]))).toContain(
      "rubric.section",
    );
    expect(
      rules(
        make([
          rule({
            rule: "contrast",
            a: { section: "verse" },
            b: { section: "chorus" },
            axes: ["pitch"],
            minAxes: 1,
            section: "last",
          }),
        ]),
      ),
    ).toContain("rubric.section");
  });
  test("new fields and rules are reported against an implementation that does not list them", () => {
    // The Foundation lists (before the grader's Build moved them into IMPLEMENTED).
    const foundation = {
      ...IMPLEMENTED,
      rubricRules: IMPLEMENTED.rubricRules.filter(
        (r) =>
          ![
            "bass-line",
            "notates",
            "groove-lock",
            "duration-sec",
            "form",
            "contrast",
            "swing",
            "syncopation",
            "blues-form",
          ].includes(r),
      ),
      features: (IMPLEMENTED.features ?? []).filter(
        (f) =>
          ![
            "rubric.section",
            "chord-qualities.depth",
            "degree-set.any-of",
            "ends-on-degree.over",
            "blues-form.choruses",
          ].includes(f),
      ),
    };
    const uses = (r: object) =>
      unimplementedIn(make([rule(r)]) as unknown as Exercise, foundation).map((u) => `${u.what}:${u.name}`);
    expect(uses({ rule: "bass-line", track: "bass", roots: { on: "change", minRatio: 0.75 } })).toContain(
      "rubric-rule:bass-line",
    );
    expect(uses({ rule: "progression", schema: "schema.aeolian", section: { section: "verse" } })).toContain(
      "feature:rubric.section",
    );
    expect(uses({ rule: "chord-qualities", subsetOf: ["7"], depth: "seventh" })).toContain(
      "feature:chord-qualities.depth",
    );
    expect(uses({ rule: "degree-set", track: "mel", anyOf: ["b3"] })).toContain("feature:degree-set.any-of");
    expect(uses({ rule: "ends-on-degree", degrees: ["1"], track: "mel", over: "i" })).toContain(
      "feature:ends-on-degree.over",
    );
    expect(uses({ rule: "blues-form", variant: "standard", choruses: 2 })).toContain(
      "feature:blues-form.choruses",
    );
    // Wave 5 Build (grader): the current lists grade all of them.
    const now = (r: object) => unimplementedIn(make([rule(r)]) as unknown as Exercise);
    expect(now({ rule: "bass-line", track: "bass", roots: { on: "change", minRatio: 0.75 } })).toEqual([]);
    expect(now({ rule: "blues-form", variant: "standard", choruses: 2 })).toEqual([]);
    expect(now({ rule: "progression", schema: "schema.aeolian", section: { section: "verse" } })).toEqual([]);
    // A unit spec may promise every planned shape.
    const all = plannedOrImplemented();
    for (const r of ["bass-line", "notates", "groove-lock", "form", "contrast", "swing", "blues-form"])
      expect(all.rubricRules).toContain(r as never);
    for (const f of SCHEMA_FEATURES) expect(all.features).toContain(f);
  });
});

describe("minor keys: degree pads and sung degrees are do-based", () => {
  const A_MINOR = { tonic: "A", mode: "minor" } as const;
  const pad = (set: string[], degrees: string[]) =>
    identify({ ui: "degree-pad", set, syllables: true }, { degrees }) as unknown as Exercise;
  test("a minor pad offers ♭3 and every right answer", () => {
    expect(checkMinorDegrees(pad(["1", "2", "b3", "4", "5", "b6", "b7"], ["b3"]), A_MINOR, "ex")).toEqual([]);
    expect(
      checkMinorDegrees(pad(["1", "2", "3", "4", "5", "6", "7"], ["3"]), A_MINOR, "ex").map((i) => i.rule),
    ).toContain("minor.degree-pad");
    expect(
      checkMinorDegrees(pad(["1", "b3", "5"], ["b7"]), A_MINOR, "ex")
        .map((i) => i.message)
        .join(" "),
    ).toContain("b7");
    // A major key is left alone.
    expect(checkMinorDegrees(pad(["1", "3", "5"], ["3"]), { tonic: "C", mode: "major" }, "ex")).toEqual([]);
  });
  test("a sung 3 in minor is caught", () => {
    const sing = {
      ...base,
      kind: "sing",
      id: "sing",
      hints: ladder,
      mode: "degree",
      stimulus: { src: "code", code: LOOP, bars: 1, showCode: false },
      cue: { context: "cadence", countInBars: 1, click: false, replays: -1 },
      target: { from: "degrees", degrees: ["1", "3", "5"] },
      tol: { cents: "learner", octave: "global", driftCompCents: 30, minCoverage: 0.4, passHitRate: 0.8 },
      showTrace: "live",
      labels: "syllables",
      fallback: "skip",
    } as unknown as Exercise;
    expect(checkMinorDegrees(sing, A_MINOR, "ex").map((i) => i.rule)).toEqual(["minor.sung-degree"]);
  });
  test("checkLessonStructure applies the lesson's key", () => {
    const def = mutable(lessonU01L02());
    def.key = { tonic: "A", mode: "minor" };
    const s1 = def.steps[0] as { kind: string; exercise?: unknown };
    s1.kind = "ear";
    s1.exercise = pad(["1", "3", "5"], ["3"]);
    expect(checkLessonStructure(def).map((i) => i.rule)).toContain("minor.degree-pad");
  });
});

describe("panels and probes for the sound lessons", () => {
  const ui = { panels: { roll: true, staff: false, keyboard: false } };
  test("scope, spectrum and form open with their toolbox rows; probes need theirs", () => {
    expect(WORKBENCH_PANEL_TOOLS.scope).toBe("tb.scope");
    expect(WORKBENCH_PANEL_TOOLS.spectrum).toBe("tb.fscope");
    expect(WORKBENCH_PANEL_TOOLS.form).toBe("tb.lens.form");
    expect(PROBE_TOOLS).toEqual({ filter: "tb.lpf", envelope: "tb.adsr", harmonics: "tb.partials" });
    for (const k of PROBE_KINDS)
      expect(schemaIssues(StepUiSchema, { ...ui, probe: { kind: k, track: "bass" } })).toEqual([]);
    expect(schemaIssues(StepUiSchema, { ...ui, probe: { kind: "lfo" } }).length).toBeGreaterThan(0);
    expect(schemaIssues(StepUiSchema, { ...ui, initialPanels: ["scope"] })).toEqual([]);
  });
  test("a lesson that opens them is checked against the platform's list (implemented at Wave 5 integration)", () => {
    const def = mutable(lessonU01L02());
    (def.steps[0] as { ui: object }).ui = { ...ui, initialPanels: ["scope"], probe: { kind: "envelope" } };
    expect(unimplementedInLesson(def).map((u) => u.name)).toEqual([]);
    const before = { ...IMPLEMENTED, features: ["step.initial-panels" as const] };
    const names = unimplementedInLesson(def, before).map((u) => u.name);
    expect(names).toContain("panel.wave5");
    expect(names).toContain("step.probe");
  });
});

describe("side lessons", () => {
  const unit = (side: boolean, optional: boolean, track = "A", id = "A1") => ({
    id,
    title: "Arrangement & Sound",
    track,
    lessons: [
      {
        id: `${id}.L01`,
        title: "Waves & Harmonics",
        objective: "o",
        introduces: [],
        practises: [],
        ...(optional ? { optional: true } : {}),
        ...(side ? { side: true } : {}),
      },
    ],
  });
  test("an optional track lesson may be a side lesson; a core or required one may not", () => {
    expect(schemaIssues(UnitDefSchema, unit(true, true))).toEqual([]);
    expect(() => defineUnit(unit(true, true) as never)).not.toThrow();
    expect(() => defineUnit(unit(true, false) as never)).toThrow(/unit.side-lesson/);
    expect(() => defineUnit(unit(true, true, "core", "U08") as never)).toThrow(/unit.side-lesson/);
  });
});

describe("capstones: three sessions, staged X2", () => {
  const melody = {
    m: "melody",
    pitch: "key-relative",
    wPitch: 0.8,
    wRhythm: 0.2,
    rhythmTol: [1, 16],
  } as const;
  const x2 = (after: string[] = ["bass"]): CapstoneDef =>
    ({
      id: "X2",
      title: "X2 Blues Transcription",
      objective: "o",
      sessions: 2,
      opensAfter: { capstones: ["C5"] },
      kind: "transcribe",
      version: 1,
      meter: "4/4",
      song: ["song.careless-love"],
      reviewRevisions: 2,
      canDo: [],
      sessionDefs: [
        {
          id: "X2.S1",
          title: "Bass, then changes",
          goal: "g",
          checks: [
            {
              id: "bass",
              phrase: [1, 4],
              layer: "bass",
              pass: 0.9,
              matcher: { ...melody, pitch: "absolute" },
            },
            {
              id: "changes",
              phrase: [1, 4],
              layer: "chords",
              pass: 0.85,
              stages: ["bass", "quality", "rn"],
              matcher: {
                m: "harmony",
                level: "rn",
                qualityDepth: "seventh",
                inversion: false,
                harmonicRhythm: "given",
              },
              after,
            },
          ],
        },
        {
          id: "X2.S2",
          title: "Melody",
          goal: "g",
          checks: [
            {
              id: "melody",
              phrase: [1, 4],
              layer: "melody",
              pass: 0.85,
              matcher: melody,
              after: ["changes"],
            },
          ],
          review: true,
          release: true,
        },
      ],
    }) as unknown as CapstoneDef;
  test("checks open in order: bass, changes, melody", () => {
    expect(() => defineCapstone(x2())).not.toThrow();
    expect(() => defineCapstone(x2(["melody"]))).toThrow(/capstone.check-after/);
    expect(unimplementedInCapstoneSessions(x2())).toEqual([]);
    const before = { ...IMPLEMENTED, features: [] };
    expect(unimplementedInCapstoneSessions(x2(), before).map((u) => u.name)).toContain(
      "capstone.check-after",
    );
  });
});

describe("the binding rubrics of contracts §6.6 for C3, C4 and C5 are expressible", () => {
  const r = (id: string, body: object) => ({ id, label: id, required: true, skills: ["F02"], ...body });
  const C3 = [
    r("form", { rule: "form", pattern: "verse chorus verse chorus" }),
    r("contrast", {
      rule: "contrast",
      a: { section: "chorus" },
      b: { section: "verse" },
      axes: ["pitch", "density", "harmony", "register", "energy"],
      minAxes: 2,
    }),
    r("length", { rule: "duration-sec", min: 90 }),
    r("lock", { rule: "groove-lock", kick: "kick", bass: "bass", min: 0.5 }),
    r("lead-sheet", { rule: "notates", view: "lead-sheet", melody: "mel" }),
  ];
  const C4 = [
    r("aeolian-verse", {
      rule: "progression",
      schema: "schema.aeolian",
      allowRotation: true,
      section: { section: "verse" },
    }),
    r("major-v", { rule: "contains-rn", rn: ["V"], min: 1, mustResolve: true }),
    r("minor-colour", { rule: "degree-set", track: "mel", contains: ["b3", "b6"] }),
    r("home", { rule: "ends-on-degree", degrees: ["1"], track: "mel", over: "i" }),
    r("tempo", { rule: "tempo-bpm", min: 60, max: 95 }),
  ];
  const C5 = [
    r("blues", { rule: "blues-form", variant: "standard", quickChangeOk: true, choruses: 2 }),
    r("sevenths", { rule: "chord-qualities", subsetOf: ["7"], depth: "seventh" }),
    r("shuffle", {
      rule: "swing",
      track: ["hats", "@drums"],
      drums: ["hatClosed", "hatOpen", "ride"],
      subdivision: 8,
      ratio: [1.6, 2.4],
    }),
    r("turnaround", { rule: "contains-rn", rn: ["V"], min: 1, section: { bars: [12, 12] } }),
    r("blue-notes", { rule: "degree-set", track: "mel", anyOf: ["b3", "b5"], minCount: 2 }),
    r("riff", { rule: "motif-reuse", track: "mel", minRatio: 0.6 }),
  ];
  test.each([
    ["C3", C3],
    ["C4", C4],
    ["C5", C5],
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
  });
});
