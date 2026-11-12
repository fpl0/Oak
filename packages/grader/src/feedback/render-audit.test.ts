// Every catalog entry rendered from a REALISTIC diagnostic (Wave 3 integration). A template slot that no
// caller fills renders as a hole: U03.L02's `.scale("G:major")` read '"" has no octave…' because the catalog
// said `{text}` and the lint passes `{scale}`. Here the diagnostics come from the real producers (the
// toolbox lint on code, the grade pipeline on the production realm, the matchers, the answer checks, the
// rubric, @oak/pitch's sung and tap graders), never from hand-written params. For each one: no slot is left
// empty (beyond the entry's declared optional ones) and the text has no braces, no empty quotes and no
// "undefined". Then coverage: every catalog entry with a slot is either reached here or listed in
// `NOT_REACHED` with the reason; a new code must join one or the other.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type {
  Diagnostic,
  ExBase,
  Exercise,
  ExerciseOf,
  LintContext,
  Matcher,
  NEvent,
  RubricRule,
  SingTolerance,
} from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { gradeSung, gradeTaps } from "@oak/pitch";
import { PROFILE as PITCH_PROFILE } from "../../../pitch/src/fixtures.test-data.ts";
import { ev, line, norm, strudel } from "../analyze/__support__/fixtures.ts";
import {
  gradeAnswer,
  intervalSlots,
  keyboardCheck,
  keySignatureCheck,
  spelledNotes,
} from "../grade/answers.ts";
import { checkConstraints } from "../grade/constraints.ts";
import { evalFailureDiagnostics } from "../grade/index.ts";
import { judgeSungPattern } from "../grade/sing.ts";
import { gradeExercise, initRealm } from "../index.ts";
import { lintOak } from "../lint/oak.ts";
import { ALL_UNLOCKED, TOOLBOX, unlockedAt } from "../lint/toolbox.test-data.ts";
import { runMatcher } from "../match/index.ts";
import { evaluateRubric } from "../rubric/index.ts";
import type { ExerciseResponse, GradeContext, NormalizeContext } from "../types.ts";
import { FEEDBACK_CATALOG, renderFeedback, unfilledSlots } from "./catalog.ts";

setDefaultTimeout(60_000);

/** Codes with a slot that no producer here can reach, and why. Keep it short; prefer adding a case. */
const NOT_REACHED: Record<string, string> = {
  // Emitted, but the case needs a realm limit or a log line this corpus does not trigger.
  "eval.timeout": "needs a pattern past the realm's time limit",
  "eval.too-many-events": "needs a pattern past the event cap",
  "eval.query": "needs a query-time failure inside the realm",
  "eval.runtime": "needs a Strudel log line from the realm (runtime/facts.test renders one)",
  "eval.truncated": "needs a piece past the mode's bar cap (runtime.test reaches it)",
  // Emitted by matchers on shapes this corpus does not build (match.test reaches most of them).
  "harmony.schema-rotation": "needs a schema loop matcher (match.test)",
  "harmony.missing-chord": "needs a given harmonic rhythm with a change left out (match.test)",
  "harmony.extra-chord": "needs a given harmonic rhythm with a change added",
  "rhythm.subdivision": "needs a swung or tuplet answer (match.test)",
  "rhythm.period": "needs a period mismatch (match.test)",
  "rhythm.swing-missing": "needs a swing matcher (match.test)",
  "rhythm.pickup-missing": "needs a pickup context (match.test)",
  "kb.bass": "needs a keyboard answer in bass mode",
  "code.tempo-factor": "needs a tempo line written without the division",
  "parsons.missing": "needs a Parsons exercise with blocks left out",
  "fill.blank-wrong": "slot comes from where.blank; needs a code-fill exercise",
  "fill.blank-empty": "slot comes from where.blank; needs a code-fill exercise",
  "parsons.swap": "slot comes from where.slot; needs a Parsons exercise",
  "id.confusion": "a drills summary line (packages/drills fills it)",
  // @oak/pitch's per-note findings on takes this corpus does not synthesise (sung/taps tests reach some).
  "sing.early": "needs a timed take sung early",
  "sing.late": "needs a timed take sung late",
  "sing.drift": "needs a whole take drifting (pitch sung.test)",
  "sing.unstable": "needs a wobbling note",
  "sing.sharp": "needs a note within twice the tolerance (pitch sung.test)",
  "sing.flat": "needs a note within twice the tolerance",
  "sing.octave-jump": "needs one note an octave off (pitch adversarial.test)",
  "sing.clipped": "needs a clipped take (pitch take.test)",
  "tap.offset": "needs a whole take offset past the report threshold (pitch taps.test)",
  "tap.rushing": "needs taps speeding up (pitch taps.test)",
  "tap.dragging": "needs taps slowing down",
  // In the catalog for the tutor and older content; no Wave 3 producer emits them.
  "code.no-pitch": "not emitted",
  "code.locked-fn": "not emitted",
  "code.mini-avoids": "not emitted: the constraint was replaced by must-not-use (contracts §5.4)",
  "code.mini-uses": "not emitted: the constraint was replaced by must-use (contracts §5.4)",
  "code.must-not-call": "not emitted: the constraint was replaced by must-not-use (contracts §5.4)",
  "harmony.not-in-key": "not emitted",
  "form.wrong": "not emitted",
  "staff.wrong-note": "not emitted: staff answers report melody.* and staff.octave/accidental/enharmonic",
  "staff.missing-note": "not emitted: staff answers report melody.missing-note",
  "staff.extra-note": "not emitted: staff answers report melody.extra-note",
  "staff.rhythm": "not emitted: staff rhythm answers report rhythm.*",
};

const reached = new Map<string, { d: Diagnostic; source: string }[]>();
function collect(source: string, ds: readonly Diagnostic[]): void {
  for (const d of ds) reached.set(d.id, [...(reached.get(d.id) ?? []), { d, source }]);
}

// --- producers --------------------------------------------------------------------------------------

const base = <K extends string>(kind: K, id = "x"): ExBase<K> => ({
  kind,
  id,
  version: 1,
  prompt: "",
  skills: [],
  role: "check",
  hints: null,
  tests: [],
});
const lintCtx = (o: Partial<LintContext> = {}): LintContext => ({
  profile: "graded",
  unlocked: ALL_UNLOCKED,
  allowPreview: false,
  meter: "4/4",
  key: null,
  ...o,
});
const gctx = (o: Partial<GradeContext> = {}): GradeContext => ({
  exerciseGlobalId: "U03.L02/audit",
  mode: "lesson",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 100,
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0,
  tutorHints: 0,
  extraReplays: 0,
  lint: lintCtx(),
  ...o,
});
async function grade(
  source: string,
  exercise: Exercise,
  response: ExerciseResponse,
  o: Partial<GradeContext> = {},
): Promise<void> {
  const r = await gradeExercise({ exercise, response, ctx: gctx(o) });
  collect(source, r.diagnostics);
}
const T = "setcpm(100/4)\n\n";
const mel = (pattern: string, scale = "C4:major") => `${T}mel: n("${pattern}").scale("${scale}").s("piano")`;
const modify = (solution: string, matcher: Matcher, starter = mel("<[0 0 0 0] [0 0 0 0]>"), bars = 2) =>
  ({
    ...base("code-modify"),
    code: { starter },
    reference: { solutions: [solution], bars },
    matcher,
    target: { audible: true, showRoll: false },
  }) as ExerciseOf<"code-modify">;
const MELODY: Matcher = { m: "melody", pitch: "absolute", wPitch: 0.7, wRhythm: 0.3, rhythmTol: rat(1, 16) };
const EVENTS: Matcher = { m: "events", pitch: "absolute", rhythm: "onsets", durations: false };
const nctx: NormalizeContext = { meter: "4/4", key: { tonic: "C", mode: "major" } };

beforeAll(async () => {
  await initRealm({ toolbox: [...TOOLBOX], lockdown: false });

  // 1. The toolbox lint, as the realm runs it (graded profile) and as content CI does (content profile).
  const lintCases: [string, Partial<LintContext>?][] = [
    [`${T}mel: n("0 2 4").scale("G:major").s("piano")`],
    [`${T}mel: n("0 2 4").scale("C major").s("piano")`],
    [`${T}mel: n("0 7#").scale("C4:major").s("piano")`],
    [`${T}mel: note('c4 e4')`],
    [`${T}mel: n("0 2 4").s("piano")`],
    [`${T}chords: chord("<Cmaj Dm>").voicing()`],
    [`${T}chords: chord("<C+ Am>").voicing()`],
    [`${T}chords: chord("<c Am>").voicing()`],
    [`${T}chords: chord("<C/E Am>").voicing()`],
    [`${T}chords: chord("<C13#11>").dict("lefthand").voicing()`],
    [`${T}mel: note("c4 e4").mode("above")`],
    [`${T}mel: n("0 1").add("2").scale("C4:major")`],
    [`${T}hats: s("hh*8").swingBy(1/3, 3)`],
    [`${T}hats: s("hh*8").swingBy("1/3", 4)`],
    [`mel: note("c4 e4")`],
    [`setcps(1)\n\nmel: note("c4 e4")`],
    [`setcpm("120")\n\nmel: note("c4 e4")`],
    [`${T}mel: n("0..7").scale("C4:major")`],
    [`${T}mel: note("c4 e4").late("1/8")`],
    [`${T}mel: n("0 2").scale("C4:major").transpose(2)`],
    [`${T}mel: note("c4 e4").s("piano").nudge(0.1)`],
    [`${T}$: s("bd*2")`],
    [`${T}Snare: s("~ sd ~ sd")`],
    [`${T}_drums: s("bd")\nhats: s("hh*8")`],
    [`${T}guitarz: s("bd")`],
    [`${T}drums: s("bd")\ndrums: s("sd")`],
    [`${T}drums: s("bd")\nnote("c4")`],
    [`${T}mel: note("c e g")`],
    [`${T}mel: note("fs5 bf4")`],
    [`${T}drums: s("bd").bank("NotABank")`],
    [`${T}mel: note("c4").s("zzzsynth")`],
    [`${T}mel: note("c4").s("piano").piano()`],
    [`${T}mel: n("0 2 4").scale("C4:major").s("piano")`, { unlocked: unlockedAt("tb.note") }],
    [`${T}drums: s("bd ~ sd ~").bank("RolandTR909")`, { unlocked: unlockedAt("tb.s") }],
    [`${T}mel: note("[c4 e4]*2")`, { unlocked: unlockedAt("tb.note", "tb.s") }],
    [
      `${T}mel: n("0 2 4").scale("C4:dorian").s("piano")`,
      { unlocked: unlockedAt("tb.n", "tb.scale", "tb.s") },
    ],
    [`${T}chords: chord("<Cm7>").voicing()`, { unlocked: unlockedAt("tb.chord", "tb.voicing") }],
    [`${T}mel: n("0 2 4").scale("C4:major").s("piano")`, { unlocked: new Set(), allowPreview: true }],
    [`${T}mel: note("c4").fast(this)`],
    [
      `${T}const v = s("<bd sd>")\nconst w = s("<hh oh>")\ndrums: arrange([3, v], [2, v])\nhats: arrange([3, w], [2, w])`,
      { profile: "content" },
    ],
  ];
  for (const [code, o] of lintCases)
    collect(
      "lint",
      lintOak(code, lintCtx(o), TOOLBOX).diagnostics.map((l) => ({
        id: l.id,
        severity: l.severity,
        params: l.params,
      })),
    );

  // 2. The grade pipeline on the production realm: lint findings, evaluation errors, matchers, folds.
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), {
    code: `${T}mel: n("<[2 2 3 4] [4 3 2 1]>").scale("G:major").s("piano")`,
  });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), { code: `${T}mel: n("<[2 2 3 4]").s(` });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), {
    code: `${T}mel: n("<[2 2 3").s("piano")`,
  });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), { code: `${T}const x = 1` });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), { code: `${T}mel: s("~")` });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), {
    code: mel("<[3 3 4 5] [5 4 3 2]>"),
  });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), {
    code: mel("<[2 2 3 4] [4 3 2 1]>", "C5:major"),
  });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), { code: mel("[2 2 3 4] [4 3 2 1]") });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), { code: mel("<[2 5 3 4] [4 3 2 1]>") });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS), { code: mel("<[0 0 0 0] [0 0 0 0]>") });
  await grade(
    "grade",
    modify(mel("<[2 2 3 4] [4 3 2 1]>"), {
      m: "melody",
      pitch: "transposition-invariant",
      wPitch: 0.8,
      wRhythm: 0.2,
      rhythmTol: rat(1, 16),
    }),
    { code: mel("<[2 2 3 4] [4 3 2 1]>", "F4:major") },
  );
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), MELODY), { code: mel("<[2 2 3] [4 3 2 1 0]>") });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), MELODY), {
    code: mel("<[2 2 3 4] [4 3 2 1]>", "C3:major"),
  });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), MELODY), {
    code: mel("<[2 2 [3 4] ~] [4 3 2 1]>"),
  });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), MELODY), { code: mel("<[2 3 4 5] [5 4 3 2]>") });
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), MELODY), { code: mel("<[2 2 2 4] [4 3 2 4]>") });
  // must-use / constraints, rubric `uses`, a Make.
  await grade(
    "grade",
    {
      ...modify(mel("<[2 2 3 4] [4 3 2 1]>"), EVENTS),
      constraints: [
        { c: "must-use", tool: "tb.mini.stack", feedback: "code.must-use" },
        { c: "must-not-use", tool: "tb.note", why: "write degrees", feedback: "code.must-not-use" },
        { c: "must-call", fn: "legato", feedback: "code.must-call" },
        { c: "must-not-call", fn: "transpose", why: "keep the key", feedback: "code.must-not-call" },
        { c: "mini-uses", op: "alt", feedback: "code.mini-uses" },
        { c: "arg-matches", fn: "scale", argIndex: 0, pattern: "^D", feedback: "code.arg-mismatch" },
        { c: "edit-only-regions", feedback: "code.edit-outside" },
        { c: "tempo", bpm: 120, feedback: "code.tempo" },
      ],
    } as ExerciseOf<"code-modify">,
    { code: `setcpm(90/4)\n\nmel: note("e4 e4 f4 g4").transpose(2).s("piano")` },
  );
  await grade(
    "grade",
    {
      ...base("code-make"),
      code: { starter: mel("<[0 2 4 2] ~>") },
      bars: [2, 4],
      saveAs: "sketch",
      rubric: [
        {
          id: "a",
          label: "Reuses its shape",
          required: true,
          skills: [],
          rule: "motif-reuse",
          track: "@melody",
          minRatio: 0.5,
        },
        { id: "b", label: "Joined notes", required: false, skills: [], rule: "uses", tool: "tb.legato" },
        {
          id: "c",
          label: "Ends home",
          required: false,
          skills: [],
          rule: "ends-on-degree",
          track: "@melody",
          degrees: ["1"],
        },
        { id: "d", label: "Eight bars", required: false, skills: [], rule: "bars", min: 8 },
        {
          id: "e",
          label: "Mostly steps",
          required: false,
          skills: [],
          rule: "step-ratio",
          track: "@melody",
          min: 0.9,
        },
        {
          id: "f",
          label: "In C",
          required: false,
          skills: [],
          rule: "in-key",
          key: { tonic: "C", mode: "major" },
          minRatio: 1,
        },
      ] as RubricRule[],
    } as ExerciseOf<"code-make">,
    { code: mel("<[0 2 4 2] [6 1 3 5]>") },
  );
  await grade(
    "grade",
    {
      ...base("code-make"),
      code: { starter: mel("<[0 2 4 2] ~>") },
      bars: [2, 4],
      saveAs: "sketch",
      rubric: [{ id: "a", label: "Plays", required: true, skills: [], rule: "uses", tool: "tb.n" }],
    } as ExerciseOf<"code-make">,
    { code: mel("<[0 2 4 2] ~>") },
  );

  // 3. Answers: identify, fact, keyboard, staff writing, key signatures, intervals.
  collect(
    "answers",
    gradeAnswer({ ui: "choice", options: [] }, { choice: ["a"] }, { choice: ["b"] }).diagnostics,
  );
  collect(
    "answers",
    gradeAnswer(
      { ui: "choice", options: [] },
      { choice: ["a", "b"] },
      { choice: ["b"] },
      { partial: { b: { a: 0.5 } } },
    ).diagnostics,
  );
  collect(
    "answers",
    gradeAnswer({ ui: "text", normalize: "note" }, { text: ["C", "E"] }, { text: ["C"] }).diagnostics,
  );
  collect("answers", gradeAnswer({ ui: "number" }, { number: 3 }, { number: 4 }).diagnostics);
  collect(
    "answers",
    gradeAnswer(
      { ui: "text", normalize: "rn" },
      { text: ["I", "vi"] },
      { text: ["I", "VI"] },
      { key: nctx.key ?? null },
    ).diagnostics,
  );
  collect("answers", intervalSlots(["M3", "P5", "TT"], ["m3", "P4", "P4"]).diagnostics);
  collect("answers", intervalSlots(["TT"], ["d5"], { spelled: ["A4"] }).diagnostics);
  collect("answers", keySignatureCheck({ tonic: "D", mode: "major" }, ["C#", "F#"], "sequence").diagnostics);
  collect("answers", keySignatureCheck({ tonic: "D", mode: "major" }, ["F#"], "set").diagnostics);
  collect("answers", keySignatureCheck({ tonic: "Bb", mode: "major" }, ["F#", "C#"], "set").diagnostics);
  collect("answers", keySignatureCheck({ tonic: "D", mode: "major" }, ["F#", "Bb"], "set").diagnostics);
  collect(
    "answers",
    spelledNotes(["F#4", "A4"], ["Gb4", "A5"], {
      strict: true,
      order: "sequence",
      key: { tonic: "D", mode: "major" },
      withOctave: true,
    }).diagnostics,
  );
  collect("answers", keyboardCheck({ midi: [60, 64, 67] }, [60, 63, 79], "absolute", "chord").diagnostics);
  collect("answers", keyboardCheck({ midi: [60, 64, 67] }, [60, 64], "absolute", "chord").diagnostics);
  collect(
    "answers",
    keyboardCheck({ midi: [60, 64, 67] }, [60, 64, 67, 70], "absolute", "chord").diagnostics,
  );
  collect("answers", keyboardCheck({ midi: [60, 64, 67] }, [72, 64, 67], "absolute", "sequence").diagnostics);
  const staffNote = (written: string, midi: number, beat: number): NEvent => ({
    ...ev({ onset: rat(beat, 4), dur: rat(1, 4), midi, track: "staff" }),
    written,
  });
  const staffEx: ExerciseOf<"staff-write"> = {
    ...base("staff-write"),
    answer: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      key: { tonic: "G", mode: "major" },
      palette: { durations: ["4"], accidentals: true, ties: false, rests: false },
    },
    expect: { e: "pitches", spelled: ["G4", "F#4", "E4", "D4"], order: "sequence", withOctave: true },
  };
  await grade("staff", staffEx, {
    staff: [staffNote("G5", 79, 0), staffNote("F4", 65, 1), staffNote("Fb4", 64, 2), staffNote("D4", 62, 3)],
  });
  await grade(
    "staff",
    {
      ...staffEx,
      expect: {
        e: "events",
        reference: { solutions: [mel("[4 3 2 1]", "G4:major")], bars: 1 },
        matcher: EVENTS,
      },
    } as ExerciseOf<"staff-write">,
    { staff: [staffNote("G4", 67, 0), staffNote("E4", 64, 2)] },
  );

  // 4. Matchers on evaluated code: rhythm, harmony, by-ear.
  const drums = await strudel(`drums: s("bd ~ sd ~, hh*4")`);
  const drumsOff = await strudel(`drums: s("~ bd ~ sd, hh*4")`);
  const drumsLess = await strudel(`drums: s("bd ~ ~ ~, hh*4")`);
  const drumsMore = await strudel(`drums: s("bd bd sd sd, hh*4")`);
  const RHYTHM: Matcher = {
    m: "rhythm",
    tol: rat(1, 32),
    durations: true,
    perRole: true,
    displacementCredit: 0.5,
  };
  for (const a of [drumsOff, drumsLess, drumsMore])
    collect("rhythm", runMatcher(RHYTHM, drums, a, nctx).diagnostics);
  collect(
    "rhythm",
    runMatcher(
      RHYTHM,
      await strudel(`bass: note("c2 ~ ~ ~").s("ebass")`),
      await strudel(`bass: note("c2 ~").s("ebass")`),
      nctx,
    ).diagnostics,
  );
  collect("rhythm", runMatcher(RHYTHM, drums, norm(line("mel", "C4:4 E4:4 G4:4 C5:4")), nctx).diagnostics);
  const HARMONY: Matcher = {
    m: "harmony",
    level: "full",
    qualityDepth: "triad",
    inversion: true,
    harmonicRhythm: "graded",
  };
  const LEVELS = ["full", "root", "quality", "rn", "bass"] as const;
  const chordsRef = await strudel(`chords: note("<[c3,e3,g3] [a2,c3,e3] [f2,a2,c3] [g2,b2,d3]>")`, 4);
  for (const code of [
    `chords: note("<[c3,e3,g3] [a2,c#3,e3] [f2,a2,c3] [g2,b2,d3]>")`,
    `chords: note("<[c3,e3,g3] [a2,c3,e3] [f2,ab2,c3] [g2,b2,d3]>")`,
    `chords: note("<[c3,e3,g3] [d3,f3,a3] [f2,a2,c3] [g2,b2,d3]>")`,
    `chords: note("<[c3,e3,g3] [[a2,c3,e3] [f2,a2,c3]] [f2,a2,c3] [g2,b2,d3]>")`,
    `chords: note("<[c3,e3,g3] [c3,e3,g3] [f2,a2,c3] [g2,b2,d3]>")`,
    `chords: note("<[c3,e3,g3] [a2,c3,e3] [f2,a2,c3] [bb2,d3,f3]>")`,
    `chords: note("<[c3,e3,g3] [c3,e3,a3] [f2,a2,c3] [g2,b2,d3]>")`,
  ])
    for (const level of LEVELS)
      collect(
        "harmony",
        runMatcher({ ...HARMONY, level } as Matcher, chordsRef, await strudel(code, 4), nctx).diagnostics,
      );
  collect(
    "harmony",
    runMatcher(
      { m: "pcset", perOnset: true, bass: false },
      chordsRef,
      await strudel(`chords: note("<[c4,e4] [a3,c4] [f3,a3] [g3,b3]>")`, 4),
      nctx,
    ).diagnostics,
  );
  collect("harmony", runMatcher(HARMONY, chordsRef, norm(line("x", "C4:4")), nctx).diagnostics);
  collect("melody", runMatcher(MELODY, chordsRef, norm(), nctx).diagnostics);
  const swing = await strudel(`mel: n("<[2@2 0@2] [2@2 0 -2] [-3@4] ~>").scale("C4:major")`, 4);
  const byEar = (pitch: "absolute" | "octave-free" | "transposition-invariant"): Matcher => ({
    m: "melody",
    pitch,
    wPitch: 0.8,
    wRhythm: 0.2,
    rhythmTol: rat(1, 16),
  });
  for (const [pitch, code] of [
    ["transposition-invariant", `mel: n("<[2@2 0@2] [2@2 0 5] [-3@4] ~>").scale("C4:major")`],
    ["transposition-invariant", `mel: n("<[2@2 0@2] [2 0@2 -2] [-3@4] ~>").scale("C4:major")`],
    ["absolute", `mel: n("<[2@2 0@2] [2@2 0 -2] [-3@4] ~>").scale("D4:major")`],
    ["absolute", `mel: n("<[2@2 0@2] [2@2 0 -2] [-3@4] ~>").scale("C5:major")`],
  ] as const)
    collect(
      "by-ear",
      runMatcher(byEar(pitch), swing, await strudel(code, 4), {
        ...nctx,
        transcription: true,
      } as NormalizeContext).diagnostics,
    );
  collect(
    "melody",
    runMatcher(
      { m: "melody", pitch: "key-relative", wPitch: 1, wRhythm: 0, rhythmTol: rat(1, 16) },
      swing,
      await strudel(`mel: n("<[2@2 0@2] [2@2 0 -2] [-3@4] ~>").scale("D4:major")`, 4),
      nctx,
    ).diagnostics,
  );

  const RHYTHM_ALL: Matcher = {
    m: "rhythm",
    tol: rat(1, 32),
    durations: false,
    perRole: false,
    displacementCredit: 0.5,
  };
  collect(
    "rhythm",
    runMatcher(
      RHYTHM_ALL,
      await strudel(`drums: s("bd sd bd sd")`),
      await strudel(`drums: s("bd ~ bd sd")`),
      nctx,
    ).diagnostics,
  );
  collect("answers", keySignatureCheck({ tonic: "D", mode: "major" }, ["F#", "G#"], "set").diagnostics);
  collect(
    "answers",
    gradeAnswer(
      { ui: "choice", options: [] },
      { choice: ["maj"] },
      { choice: ["dom7"] },
      { partial: { maj: { dom7: 0.5 } } },
    ).diagnostics,
  );
  collect("answers", keyboardCheck({ midi: [60, 62, 64] }, [60, 63, 64], "absolute", "sequence").diagnostics);
  await grade("grade", modify(mel("<[2 2 3 4] [4 3 2 1]>"), MELODY), {
    code: `mel: n("<[2 2 3 4] [4 3 2 1]>").scale("C4:major").s("piano")`,
  });

  // 5. Rubric rows (rubric.unmet / rubric.met) straight from the rules.
  const piece = await strudel(mel("<[0 2 4 2] [4 3 2 1]>"), 2);
  const rows = evaluateRubric(
    [
      {
        id: "r1",
        label: "Ends on 1",
        required: true,
        skills: [],
        rule: "ends-on-degree",
        track: "@melody",
        degrees: ["1"],
      },
      {
        id: "r2",
        label: "Reuse",
        required: true,
        skills: [],
        rule: "motif-reuse",
        track: "@melody",
        minRatio: 0.5,
      },
      { id: "r3", label: "Legato", required: false, skills: [], rule: "uses", tool: "tb.legato" },
    ] as RubricRule[],
    piece,
    { ...nctx, code: mel("<[0 2 4 2] [4 3 2 1]>"), params: {}, bars: 2 },
  );
  collect("rubric", rows.extra);
  collect(
    "rubric",
    rows.rows.flatMap((r) => (r.diag ? [r.diag] : [])),
  );

  // 6. Evaluation failures as the realm reports them.
  collect(
    "eval",
    evalFailureDiagnostics(
      {
        ok: false,
        error: { kind: "eval", message: "Unexpected token ')'", line: 3 },
        logs: [],
        lint: null,
        ms: 1,
      },
      4,
    ),
  );
  collect(
    "eval",
    evalFailureDiagnostics(
      {
        ok: false,
        error: { kind: "eval", message: "[mini] parse error at 1:4", line: 2 },
        logs: [],
        lint: null,
        ms: 1,
      },
      4,
    ),
  );

  // 7. Constraint rows the pipeline did not reach above.
  for (const row of checkConstraints(
    [
      { c: "max-tokens-changed", max: 1, feedback: "code.too-many-changes" },
      { c: "labels", min: 3 },
      { c: "no-note-names" },
      { c: "arg-matches", fn: "legato", argIndex: 0, pattern: "^1$" },
      { c: "arg-matches", fn: "s", argIndex: 0, pattern: "^rhodes$" },
      { c: "max-changed-tokens", n: 1 },
      { c: "no-randomness" },
      { c: "max-chars", n: 10 },
    ] as never,
    {
      code: `${T}mel: note("<[e4 e4 f4 g4] [g4 f4 e4 d4]>").sometimes(x => x.fast(2)).s("piano")`,
      starter: mel("<[0 0 0 0] [0 0 0 0]>"),
      params: {},
      meter: "4/4",
      bpm: 100,
      cpsSet: true,
      tracks: ["mel"],
    },
  ))
    if (row.diag) collect("constraints", [row.diag]);

  // 8. Singing and tapping: @oak/pitch's graders on synthetic frames, then the pattern judge.
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  const frames = (notes: [number, number, number][]) => {
    const out = [];
    for (let t = 0; t < 3.2; t += 512 / 48000) {
      const n = notes.find(([, on, off]) => t >= on && t < off);
      out.push({ t, hz: n ? hz(n[0]) : 0, clarity: n ? 0.97 : 0.1, rms: n ? 0.1 : 0.0005 });
    }
    return out;
  };
  const tol: SingTolerance = {
    cents: 50,
    octave: "global",
    driftCompCents: 30,
    minCoverage: 0.4,
    passHitRate: 0.8,
  };
  const targets = [60, 64, 67, 64, 60].map((midi, i) => ({
    midi,
    on: 0.1 + i * 0.5,
    off: 0.1 + (i + 1) * 0.5,
  }));
  const sungPerf = (sung: [number, number, number][], mode: "degree" | "echo") =>
    gradeSung(frames(sung), targets, tol, mode, PITCH_PROFILE);
  const takes: [[number, number, number][], "degree" | "echo"][] = [
    [[[60, 0.1, 2.6]], "degree"],
    [[[60, 0.1, 2.6]], "echo"],
    [
      [
        [60, 0.15, 0.55],
        [64, 0.65, 1.05],
        [65, 1.15, 1.55],
      ],
      "degree",
    ],
    [[], "degree"],
  ];
  for (const [sung, mode] of takes) {
    const r = sungPerf(sung, mode);
    collect("pitch", r.diagnostics);
    collect(
      "sing-pattern",
      judgeSungPattern({
        degrees: ["1", "3", "5", "3", "1"],
        key: { tonic: "C", mode: "major" },
        labels: "numbers",
        notes: r.notes,
        diagnostics: r.diagnostics,
        mode,
      }),
    );
  }
  const folded = gradeSung(
    frames([
      [60, 0.15, 0.55],
      [64, 0.65, 1.05],
      [67, 1.15, 1.55],
      [60, 1.65, 2.05],
    ]),
    [60, 64, 67, 72].map((midi, i) => ({ midi, on: 0.1 + i * 0.5, off: 0.1 + (i + 1) * 0.5 })),
    { ...tol, octave: "per-note" },
    "degree",
    PITCH_PROFILE,
  );
  collect(
    "sing-pattern",
    judgeSungPattern({
      degrees: ["1", "3", "5", "1"],
      key: { tonic: "C", mode: "major" },
      labels: "syllables",
      notes: folded.notes,
      diagnostics: folded.diagnostics,
    }),
  );
  const tapTol = {
    windowMs: "auto" as const,
    tempo: "locked" as const,
    forgiveOffset: false,
    passF1: 0.9,
    passTiming: 0.5,
  };
  const beats = [0, 0.5, 1, 1.5, 2, 2.5].map((s) => s * 1000);
  collect(
    "taps",
    gradeTaps([40, 540, 1040, 1540, 2040, 2200, 2540], beats, tapTol, PITCH_PROFILE).diagnostics,
  );
  collect("taps", gradeTaps([0, 500, 1000], beats, tapTol, PITCH_PROFILE).diagnostics);
  collect(
    "taps",
    gradeTaps(
      beats.map((b) => b + 70),
      beats,
      { ...tapTol, forgiveOffset: true },
      PITCH_PROFILE,
    ).diagnostics,
  );
});

// --- the audit ----------------------------------------------------------------------------------

const HOLES: [RegExp, string][] = [
  [/[{}]/, "a literal brace"],
  [/""|``|''/, "empty quotes"],
  [/(?<![\w)])\(\s*\)/, "empty brackets"],
  [/\bundefined\b|\bNaN\b|\bnull\b|\[object/, "a stray value"],
  [/\s[,;](?=\s|$)|\s\.(?=\s|$)/, "a space before punctuation"],
  [//, "a hole marker"],
];

describe("every reached diagnostic renders whole", () => {
  if (process.env.OAK_AUDIT_DUMP)
    test("dump", () => {
      for (const [id, l] of [...reached].sort())
        console.log(id, [...new Set(l.map((x) => x.source))].join(","));
    });
  test("no slot left empty, no hole in the text", () => {
    const bad: string[] = [];
    for (const [id, list] of reached)
      for (const { d, source } of list) {
        const text = renderFeedback(d);
        const missing = unfilledSlots(d);
        if (missing.length) bad.push(`${id} (${source}): no ${missing.join(", ")} → "${text}"`);
        for (const [re, what] of HOLES) if (re.test(text)) bad.push(`${id} (${source}): ${what} → "${text}"`);
      }
    expect(bad).toEqual([]);
  });

  test("U03.L02 home-is-g: the scale with no octave is named in the message", () => {
    const d = reached.get("code.scale-no-octave")?.[0]?.d as Diagnostic;
    expect(renderFeedback(d)).toBe('"G:major" has no octave, so it plays in octave 3. Write "G4:major".');
  });

  test("a tool is named as it is written, never by its ID", () => {
    for (const id of ["code.must-use", "code.must-not-use", "rubric.unmet", "rubric.met"])
      for (const { d } of reached.get(id) ?? []) expect(renderFeedback(d)).not.toMatch(/\btb\.[a-z]/);
  });
});

describe("coverage of the catalog", () => {
  test("every entry with a slot is reached, or listed in NOT_REACHED with a reason", () => {
    const withSlots = Object.values(FEEDBACK_CATALOG)
      .filter((t) => /\{\w+\}/.test(t.template))
      .map((t) => t.id);
    const missing = withSlots.filter((id) => !reached.has(id) && !(id in NOT_REACHED));
    expect(missing).toEqual([]);
    // A NOT_REACHED line that a case now reaches must go.
    const stale = Object.keys(NOT_REACHED).filter((id) => reached.has(id));
    expect(stale).toEqual([]);
    for (const id of Object.keys(NOT_REACHED)) expect(id in FEEDBACK_CATALOG).toBe(true);
  });
});
