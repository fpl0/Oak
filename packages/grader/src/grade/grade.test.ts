// The grade pipeline on every exercise kind, with the realm replaced by the headless evaluator. Each
// exercise carries the known-wrong-variant pattern of AUTHORING §8: a right answer passes, and each wrong
// variant fails with its own feedback code.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExBase, Exercise, ExerciseOf, GradeResult, Matcher, NEvent } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { ev, headlessDeps } from "../analyze/__support__/fixtures.ts";
import { renderFeedback, unknownCodes } from "../feedback/catalog.ts";
import type { ExerciseResponse, GradeContext, MatchResult } from "../types.ts";
import { blanksOfSolution, diffRanges, gradeWith } from "./index.ts";

setDefaultTimeout(30_000);

const deps = headlessDeps();
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
const ctx = (o: Partial<GradeContext> = {}): GradeContext => ({
  exerciseGlobalId: "U03.L02/test",
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
  lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
  ...o,
});
const grade = (
  exercise: Exercise,
  response: ExerciseResponse,
  c: Partial<GradeContext> = {},
): Promise<GradeResult> => gradeWith({ exercise, response, ctx: ctx(c) }, deps);
const ids = (r: GradeResult): string[] => r.diagnostics.map((d) => d.id);
const noUnknownCodes = (r: GradeResult): void => expect(unknownCodes(r.diagnostics)).toEqual([]);

describe("code-modify (exercises §2.5 'end-on-home')", () => {
  const ex: ExerciseOf<"code-modify"> = {
    ...base("code-modify", "end-on-home"),
    key: { tonic: "C", mode: "major" },
    code: { starter: 'setcpm(100/4)\n$: n("⟪4 2 3 1 2 0 1 1⟫").scale("C4:major").s("piano")' },
    reference: {
      solutions: ['setcpm(100/4)\n$: n("4 2 3 1 2 0 1 0").scale("C4:major").s("piano")'],
      bars: 1,
    },
    matcher: {
      m: "rubric",
      rules: [
        {
          id: "tonic",
          label: "Ends on degree 1",
          required: true,
          skills: [],
          rule: "ends-on-degree",
          degrees: ["1"],
          track: "*",
        },
      ],
    },
    constraints: [{ c: "max-changed-tokens", n: 1 }],
    target: { audible: false },
  };
  test("the reference passes, perfectly", async () => {
    const r = await grade(ex, {
      code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 0").scale("C4:major").s("piano")',
    });
    expect(r.status).toBe("pass");
    expect(r.score).toBe(1);
    expect(r.adjustedScore).toBe(1);
    expect(ids(r)).toContain("pass.perfect");
    expect(r.eval?.bpm).toBeCloseTo(100, 6);
    noUnknownCodes(r);
  });
  test("the tonic an octave up also passes", async () => {
    const r = await grade(ex, {
      code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 7").scale("C4:major").s("piano")',
    });
    expect(r.status).toBe("pass");
  });
  test("unchanged starter: fail with code.unchanged", async () => {
    const r = await grade(ex, {
      code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 1").scale("C4:major").s("piano")',
    });
    expect(r.status).toBe("fail");
    expect(ids(r)).toEqual(["code.unchanged"]);
  });
  test("ends on 5: fail with melody.ends-on and the unmet rule", async () => {
    const r = await grade(ex, {
      code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 4").scale("C4:major").s("piano")',
    });
    expect(r.status).toBe("fail");
    expect(ids(r)).toContain("melody.ends-on");
    expect(ids(r)).toContain("rubric.unmet");
    const m = r.diagnostics.find((d) => d.id === "melody.ends-on");
    expect(renderFeedback(m as never)).toBe("It ends on 5; the brief asks for 1.");
    expect(m?.where?.beatLabel).toBe("4&");
    noUnknownCodes(r);
  });
  test("two changes where one is allowed: code.too-many-changes fails the step", async () => {
    const r = await grade(ex, {
      code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 0 0").scale("C4:major").s("piano")',
    });
    expect(r.status).toBe("fail");
    expect(ids(r)).toContain("code.too-many-changes");
    expect(r.constraints[0]?.ok).toBe(false);
  });
  test("a syntax error is status error, not an attempt", async () => {
    const r = await grade(ex, { code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 0".scale("C4:major")' });
    expect(r.status).toBe("error");
    expect(r.adjustedScore).toBe(0);
    expect(ids(r)[0]).toMatch(/^eval\./);
  });
  test("hint rung 2 and two extra replays scale the evidence", async () => {
    const r = await grade(
      ex,
      { code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 0").scale("C4:major").s("piano")' },
      { rung: 2, extraReplays: 2 },
    );
    expect(r.adjustedScore).toBeCloseTo(0.8 * 0.81, 6);
    expect(r.assist).toEqual({ rung: 2, tutorHints: 0, extraReplays: 2, revealed: false });
  });
});

describe("code-modify with a melody matcher", () => {
  const ex: ExerciseOf<"code-modify"> = {
    ...base("code-modify"),
    code: { starter: 'mel: n("⟪0 2 4 2⟫").scale("C4:major")' },
    reference: { solutions: ['mel: n("0 2 4 7").scale("C4:major")'], bars: 1 },
    matcher: { m: "melody", pitch: "key-relative", wPitch: 0.7, wRhythm: 0.3, rhythmTol: rat(0) },
    target: { audible: true },
  };
  test("right: pass; a wrong last degree: melody.wrong-degree; silence: eval.silent", async () => {
    expect((await grade(ex, { code: 'mel: n("0 2 4 7").scale("C4:major")' })).status).toBe("pass");
    const wrong = await grade(ex, { code: 'mel: n("0 2 4 5").scale("C4:major")' });
    expect(wrong.status).toBe("fail");
    expect(ids(wrong)).toEqual(["melody.wrong-degree"]);
    expect(wrong.messages[0]?.text).toBe("Bar 1, 4: you have 6 (la); the melody has 1 (do).");
    expect(wrong.overlay?.answer.filter((a) => !a.ok).length).toBe(1);
    const silent = await grade(ex, { code: 'mel: n("~ ~ ~ ~").scale("C4:major")' });
    expect(silent.status).toBe("fail");
    expect(ids(silent)).toEqual(["eval.silent"]);
  });
});

describe("code-fill", () => {
  const ex: ExerciseOf<"code-fill"> = {
    ...base("code-fill"),
    code: { starter: 'note("c4 ⟦mid⟧ g4")' },
    blanks: [{ id: "mid", input: "text" }],
    reference: { solutions: ['note("c4 e4 g4")'], bars: 1 },
    matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
  };
  test("solution blanks are recovered from the reference", () => {
    expect(blanksOfSolution('note("c4 ⟦mid⟧ g4")', 'note("c4 e4 g4")')).toEqual({ mid: "e4" });
  });
  test("right blank passes; a wrong one names the blank; an empty one is fill.blank-empty", async () => {
    expect((await grade(ex, { blanks: { mid: "e4" } })).status).toBe("pass");
    const wrong = await grade(ex, { blanks: { mid: "f4" } });
    expect(wrong.status).toBe("fail");
    expect(ids(wrong)).toContain("fill.blank-wrong");
    expect(wrong.diagnostics.find((d) => d.id === "fill.blank-wrong")?.where?.blank).toBe("mid");
    expect(ids(wrong)).toContain("melody.wrong-degree");
    const empty = await grade(ex, { blanks: { mid: " " } });
    expect(ids(empty)).toEqual(["fill.blank-empty"]);
  });
});

describe("error-hunt", () => {
  const starter = 'note("c4 e4 a4 c5")';
  const ex: ExerciseOf<"error-hunt"> = {
    ...base("error-hunt"),
    code: { starter },
    reference: { solutions: ['note("c4 e4 g4 c5")'], bars: 1 },
    matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
    locateVia: "code",
  };
  const a4 = { from: starter.indexOf("a4"), to: starter.indexOf("a4") + 2 };
  test("bug ranges default to the token diff", () => {
    expect(diffRanges(starter, 'note("c4 e4 g4 c5")')).toEqual([a4]);
  });
  test("found and fixed: pass with 0.4·locate + 0.6·fix = 1", async () => {
    const r = await grade(ex, { clicks: [a4], code: 'note("c4 e4 g4 c5")' });
    expect(r.status).toBe("pass");
    expect(r.score).toBe(1);
    expect(ids(r)).toContain("hunt.found");
  });
  test("a click elsewhere first: hunt.not-here, half locate credit", async () => {
    const e4 = { from: starter.indexOf("e4"), to: starter.indexOf("e4") + 2 };
    const r = await grade(ex, { clicks: [e4, a4], code: 'note("c4 e4 g4 c5")' });
    expect(ids(r)).toContain("hunt.not-here");
    expect(r.dims.locate?.score).toBe(0.5);
    expect(r.score).toBeCloseTo(0.8, 6);
  });
  test("a click on an event (staff) is resolved through its code location", async () => {
    const n = await deps.evaluate(starter, { mode: "lesson", bars: 1, lint: null, meter: "4/4" });
    if (!n.ok) throw new Error("eval");
    const evs = deps.normalize(n, { meter: "4/4" }).all;
    const bad = evs.find((e) => e.midi === 69) as NEvent;
    const r = await grade({ ...ex, locateVia: "staff" }, { clicks: [bad.id] });
    expect(r.dims.locate?.score).toBe(1);
    expect(r.status).toBe("fail");
  });
});

describe("code-make and compose-brief", () => {
  const make: ExerciseOf<"code-make"> = {
    ...base("code-make"),
    code: { starter: "" },
    bars: [1, 4],
    saveAs: "sketch",
    rubric: [
      {
        id: "backbeat",
        label: "Snare on 2 and 4",
        required: true,
        skills: [],
        rule: "onsets",
        track: "*",
        drum: "snare",
        contains: [rat(1, 4), rat(3, 4)],
        perBar: true,
      },
      {
        id: "tempo",
        label: "Between 70 and 140 BPM",
        required: false,
        skills: [],
        rule: "tempo-bpm",
        min: 70,
        max: 140,
      },
    ],
  };
  test("the required rule decides; a suggestion never fails the step", async () => {
    const ok = await grade(make, { code: 'setcpm(160/4)\ndrums: s("bd sd bd sd")' });
    expect(ok.status).toBe("pass");
    expect(ok.rubric?.map((r) => [r.ruleId, r.ok])).toEqual([
      ["backbeat", true],
      ["tempo", false],
    ]);
    expect(ok.rubric?.[1]?.diag?.severity).toBe("info");
    const bad = await grade(make, { code: 'setcpm(100/4)\ndrums: s("bd bd bd sd")' });
    expect(bad.status).toBe("fail");
    expect(bad.rubric?.[0]?.ok).toBe(false);
    expect(bad.messages[0]?.text).toContain("Snare on 2 and 4");
  });
  test("more bars than the brief: make.beyond-brief, still a pass", async () => {
    const r = await grade(make, { code: 'drums: s("<[bd sd bd sd]!7 [bd sd [bd bd] sd]>")' });
    expect(r.status).toBe("pass");
    expect(ids(r)).toContain("make.beyond-brief");
  });

  const song = `setcpm(100/4)
const drumsVerse = s("bd ~ sd ~")
const drumsChorus = s("bd sd bd sd, hh*8")
const melVerse = n("<[0 2 4 2] [4 2 1 ~]>").scale("C4:major").s("piano")
const melChorus = n("<[7 9 11 9] [11 ~ 9 ~]>").scale("C4:major").s("piano")
drums: arrange([4, drumsVerse], [4, drumsChorus], [4, drumsVerse], [4, drumsChorus])
mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus])`;
  const compose: ExerciseOf<"compose-brief"> = {
    ...base("compose-brief"),
    brief: "",
    code: { starter: "" },
    review: { tutor: "offer" },
    rubric: [
      {
        id: "form",
        label: "Verse, chorus, verse, chorus",
        required: true,
        skills: [],
        rule: "form",
        pattern: "verse chorus verse chorus",
      },
      {
        id: "contrast",
        label: "The chorus stands out",
        required: true,
        skills: [],
        rule: "contrast",
        a: { section: "chorus" },
        b: { section: "verse" },
        axes: ["pitch", "density", "energy"],
        minAxes: 2,
      },
    ],
    minDurationSec: 30,
  };
  test("an arranged song passes form, contrast and duration (computed from the AST), with an analysis", async () => {
    const r = await grade(compose, { code: song }, { mode: "capstone" });
    expect(r.rubric?.map((x) => [x.ruleId, x.ok])).toEqual([
      ["form", true],
      ["contrast", true],
      ["min-duration", true],
    ]);
    expect(r.status).toBe("pass");
    expect(r.analysis?.bars).toBe(16);
    expect(r.analysis?.durationSec).toBeCloseTo(38.4, 1);
    expect(r.analysis?.form).toBe("verse chorus verse chorus");
  });
  test("tracks that disagree about the sections: form.inconsistent-arrange", async () => {
    const r = await grade(
      compose,
      {
        code: song.replace(
          "mel: arrange([4, melVerse], [4, melChorus]",
          "mel: arrange([4, melVerse], [2, melChorus]",
        ),
      },
      { mode: "capstone" },
    );
    expect(r.status).toBe("fail");
    expect(ids(r)).toContain("form.inconsistent-arrange");
  });
});

describe("answer kinds", () => {
  test("identify: degrees per slot, id.wrong at the slot, partial score", async () => {
    const ex: ExerciseOf<"identify"> = {
      ...base("identify"),
      stimulus: { src: "code", code: "", bars: 1, showCode: false },
      cue: { context: "cadence", countInBars: 0, click: false, replays: 3 },
      answer: { ui: "degree-pad", set: ["1", "2", "3", "4", "5", "6", "7"], syllables: false },
      correct: { degrees: ["1", "5", "6", "4"] },
    };
    expect((await grade(ex, { answer: { degrees: ["1", "5", "6", "4"] } })).status).toBe("pass");
    const r = await grade(ex, { answer: { degrees: ["1", "5", "4", "4"] } });
    expect(r.status).toBe("fail");
    expect(r.score).toBe(0.75);
    expect(r.diagnostics[0]?.where?.slot).toBe(3);
    expect(renderFeedback(r.diagnostics[0] as never)).toBe("That was 6, not 4. Listen to both.");
  });
  test("identify with a partial map: a near miss earns its credit", async () => {
    const ex: ExerciseOf<"identify"> = {
      ...base("identify"),
      stimulus: { src: "code", code: "", bars: 1, showCode: false },
      cue: { context: "none", countInBars: 0, click: false, replays: 3 },
      answer: {
        ui: "choice",
        options: [
          { id: "m3", label: "m3" },
          { id: "M3", label: "M3" },
        ],
      },
      correct: { choice: ["M3"] },
      partial: { M3: { m3: 0.5 } },
    };
    const r = await grade(ex, { answer: { choice: ["m3"] } });
    expect(r.score).toBe(0.5);
    expect(ids(r)).toEqual(["id.partial"]);
  });
  test("fact with strict spelling: D# for Eb is spell.enharmonic and fails", async () => {
    const ex: ExerciseOf<"fact"> = {
      ...base("fact"),
      answer: { ui: "text", normalize: "note" },
      correct: { text: ["Eb"] },
      spelling: "strict",
      order: "sequence",
      key: { tonic: "Bb", mode: "major" },
    };
    expect((await grade(ex, { answer: { text: ["e♭"] } })).status).toBe("pass");
    const r = await grade(ex, { answer: { text: ["D#"] } });
    expect(r.status).toBe("fail");
    expect(ids(r)).toEqual(["spell.enharmonic"]);
    expect(renderFeedback(r.diagnostics[0] as never)).toBe(
      "D# sounds right, but in Bb major it's spelled Eb.",
    );
  });
  test("fact: Roman numerals compare on the chord they name", async () => {
    const ex: ExerciseOf<"fact"> = {
      ...base("fact"),
      answer: { ui: "rn-palette", slots: 4, allow: ["triads"] },
      correct: { rn: ["I", "V", "vi", "IV"] },
      spelling: "enharmonic",
      order: "sequence",
    };
    expect((await grade(ex, { answer: { rn: ["I", "V", "vi", "IV"] } })).status).toBe("pass");
    const r = await grade(ex, { answer: { rn: ["I", "V", "VI", "IV"] } });
    expect(ids(r)).toEqual(["harmony.rn-case"]);
  });
  test("keyboard: a C major chord with E♭ for E names the missing and the extra note", async () => {
    const ex: ExerciseOf<"keyboard"> = {
      ...base("keyboard"),
      answer: { ui: "keyboard", range: ["c3", "c5"], mode: "chord" },
      expect: { pcs: [0, 4, 7] },
      pitchMode: "octave-free",
    };
    expect((await grade(ex, { answer: { midi: [48, 64, 67] } })).status).toBe("pass");
    const r = await grade(ex, { answer: { midi: [60, 63, 67] } });
    expect(ids(r).sort()).toEqual(["kb.extra-note", "kb.missing-note"]);
  });
  test("staff-write pitches: F#4 right, Gb4 enharmonic; key signature of D major", async () => {
    const ex: ExerciseOf<"staff-write"> = {
      ...base("staff-write"),
      key: { tonic: "D", mode: "major" },
      answer: {
        ui: "staff-input",
        clef: "treble",
        bars: 1,
        palette: { durations: ["4"], accidentals: true, ties: false, rests: false },
      },
      expect: { e: "pitches", spelled: ["F#4"], order: "sequence", withOctave: true },
    };
    const right = await grade(ex, { staff: [ev({ onset: rat(0), midi: 66, track: "staff" })] });
    expect(right.status).toBe("pass");
    const gb = { ...ev({ onset: rat(0), midi: 66, track: "staff" }), written: "Gb4" };
    // Staff writing names the slip: sounds right, written against the key (Wave 3).
    expect(ids(await grade(ex, { staff: [gb] }))).toEqual(["staff.enharmonic"]);
  });
  test("parsons: a listed order passes; a distractor is named", async () => {
    const ex: ExerciseOf<"parsons"> = {
      ...base("parsons"),
      blocks: [
        { id: "a", text: "setcpm(120/4)" },
        { id: "b", text: 'drums: s("bd sd")' },
      ],
      distractors: [{ id: "z", text: 'drums: s("bd bd")' }],
      assemble: "lines",
      accept: { orders: [["a", "b"]] },
    };
    expect((await grade(ex, { order: ["a", "b"] })).status).toBe("pass");
    expect(ids(await grade(ex, { order: ["a", "z"] }))).toContain("parsons.distractor");
    expect(ids(await grade(ex, { order: ["b", "a"] }))).toContain("parsons.swap");
  });
  test("run-investigate: a click on the 3rd degree is resolved by evaluation", async () => {
    const code = 'note("c4 e4 g4")';
    const ex: ExerciseOf<"run-investigate"> = {
      ...base("run-investigate"),
      code: { starter: code },
      mustPlayLoops: 1,
      questions: [{ q: "click-code", prompt: "", target: { degree: "3" } }],
    };
    const e4 = { from: code.indexOf("e4"), to: code.indexOf("e4") + 2 };
    const g4 = { from: code.indexOf("g4"), to: code.indexOf("g4") + 2 };
    expect((await grade(ex, { click: e4 })).status).toBe("pass");
    expect(ids(await grade(ex, { click: g4 }))).toEqual(["investigate.not-here"]);
    expect((await grade({ ...ex, questions: [] }, { click: g4 })).status).toBe("ungraded");
  });
});

describe("dictation stages (exercises §2.5 'loop-1')", () => {
  const ex: ExerciseOf<"dictation"> = {
    ...base("dictation", "loop-1"),
    domain: "harmony",
    key: { tonic: "G", mode: "major" },
    stimulus: { src: "code", bars: 4, loop: true, showCode: false, code: "" },
    cue: { context: "cadence", countInBars: 0, click: false, replays: 6 },
    stages: ["bass", "quality", "rn"],
    stageWeights: [0.4, 0.3, 0.3],
    answer: { ui: "rn-palette", slots: 4, allow: ["triads"] },
    reference: {
      solutions: [
        'setcpm(92/4)\n$: note("<[b3,d4,g4] [a3,d4,f#4] [b3,e4,g4] [c4,e4,g4]>").s("rhodes").gain(.5)\n$: n("<0 4 5 3>").scale("G2:major").s("ebass")',
      ],
      bars: 4,
    },
    matcher: { m: "harmony", level: "rn", qualityDepth: "triad", inversion: false, harmonicRhythm: "given" },
  };
  test("right: pass", async () => {
    const r = await grade(
      ex,
      {
        answer: {
          stages: {
            bass: ["1", "5", "6", "4"],
            quality: ["maj", "maj", "min", "maj"],
            rn: ["I", "V", "vi", "IV"],
          },
        },
      },
      { key: { tonic: "G", mode: "major" } },
    );
    expect(r.status).toBe("pass");
  });
  test("ii for V: fail with harmony.bass on chord 2", async () => {
    const r = await grade(
      ex,
      {
        answer: {
          stages: {
            bass: ["1", "2", "6", "4"],
            quality: ["maj", "min", "min", "maj"],
            rn: ["I", "ii", "vi", "IV"],
          },
        },
      },
      { key: { tonic: "G", mode: "major" } },
    );
    expect(r.status).toBe("fail");
    expect(ids(r)).toContain("harmony.bass");
    expect(r.diagnostics.find((d) => d.id === "harmony.bass")?.where?.slot).toBe(2);
  });
});

describe("performance and composite kinds", () => {
  const tap: ExerciseOf<"tap"> = {
    ...base("tap"),
    mode: "along",
    stimulus: { src: "code", code: "", bars: 2, showCode: false },
    cue: { context: "none", countInBars: 1, click: true, replays: -1 },
    bars: 2,
    target: "beat",
    tol: { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.9, passTiming: 0.5 },
  };
  const perf = (
    o: Partial<MatchResult & { pass: boolean; f1: number; timing: number }>,
  ): ExerciseResponse => ({
    performance: { score: 0.9, dims: {}, diagnostics: [], ...o } as MatchResult,
  });
  test("tap: the pitch package's pass wins; otherwise F1 ≥ passF1 and timing ≥ passTiming", async () => {
    expect((await grade(tap, perf({ pass: true }))).status).toBe("pass");
    const r = await grade(tap, perf({ score: 0.8, f1: 0.85, timing: 0.9 } as never));
    expect(r.status).toBe("fail");
    expect((await grade(tap, perf({ score: 0.95, f1: 1, timing: 0.6 } as never))).status).toBe("pass");
  });
  test("sing: no voice is status error; a skipped step with a fallback is ungraded", async () => {
    const sing: ExerciseOf<"sing"> = {
      ...base("sing"),
      mode: "pitch",
      stimulus: { src: "code", code: "", bars: 1, showCode: false },
      cue: { context: "tonic-chord", countInBars: 0, click: false, replays: 2 },
      target: { from: "degrees", degrees: ["1"] },
      tol: { cents: "learner", octave: "per-note", driftCompCents: 0, minCoverage: 0.4, passHitRate: 0.8 },
      showTrace: "live",
      fallback: "identify",
    };
    const nv = await grade(
      sing,
      perf({ score: 0, diagnostics: [{ id: "sing.no-voice", severity: "error", params: { db: -60 } }] }),
    );
    expect(nv.status).toBe("error");
    const skipped = await grade(sing, { skipped: true });
    expect(skipped.status).toBe("ungraded");
    expect(skipped.modality).toBe("fallback");
  });
  test("all: every part must pass; the score is the weighted mean", async () => {
    const choice: ExerciseOf<"identify"> = {
      ...base("identify"),
      stimulus: { src: "code", code: "", bars: 1, showCode: false },
      cue: { context: "none", countInBars: 0, click: false, replays: 3 },
      answer: { ui: "choice", options: [] },
      correct: { choice: ["a"] },
    };
    const ex: ExerciseOf<"all"> = {
      ...base("all"),
      parts: [choice, { ...choice, correct: { choice: ["b"] } }],
      weights: [1, 3],
    };
    expect(
      (await grade(ex, { parts: [{ answer: { choice: ["a"] } }, { answer: { choice: ["b"] } }] })).status,
    ).toBe("pass");
    const r = await grade(ex, { parts: [{ answer: { choice: ["a"] } }, { answer: { choice: ["a"] } }] });
    expect(r.status).toBe("fail");
    expect(r.score).toBe(0.25);
  });
  test("predict and listen are ungraded; transcribe self-grading is ungraded", async () => {
    const p: ExerciseOf<"predict"> = {
      ...base("predict"),
      code: 's("bd")',
      bars: 1,
      mode: "count",
      correct: 1,
    };
    expect((await grade(p, { answer: { number: 1 } })).status).toBe("ungraded");
    const l: ExerciseOf<"listen"> = { ...base("listen"), items: [] };
    expect((await grade(l, { answer: {} })).status).toBe("ungraded");
  });
});

describe("transcribe-step and staff answers against a reference", () => {
  const matcher: Matcher = {
    m: "melody",
    pitch: "key-relative",
    wPitch: 0.7,
    wRhythm: 0.3,
    rhythmTol: rat(0),
  };
  test("auto-graded transcription: ≥ 0.85 passes", async () => {
    const ex: ExerciseOf<"transcribe-step"> = {
      ...base("transcribe-step"),
      projectId: "p",
      ladder: 1,
      stimulus: { src: "code", code: "", bars: 2, showCode: false },
      layer: "melody",
      bars: [1, 2],
      grading: {
        mode: "auto",
        reference: { solutions: ['mel: n("0 2 4 5 4 2 1 0").scale("C4:major")'], bars: 1 },
        matcher,
      },
      studio: { minRate: 0.5, overlay: true },
    };
    expect((await grade(ex, { code: 'mel: n("0 2 4 5 4 2 1 0").scale("C4:major")' })).status).toBe("pass");
    const close = await grade(ex, { code: 'mel: n("0 2 4 5 4 2 2 0").scale("C4:major")' });
    expect(close.score).toBeGreaterThanOrEqual(0.85);
    expect(close.status).toBe("pass");
    expect(ids(close)).toContain("pass.close");
  });
});

export type { MatchResult };

describe("compare (the tutor's compare_haps)", () => {
  const lint = {
    profile: "graded" as const,
    unlocked: new Set<never>(),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  };
  test("two pieces of code by melody: a wrong note is found; identical code passes", async () => {
    const { compareWith } = await import("./compare.ts");
    const same = await compareWith(
      {
        learnerCode: 'mel: note("c4 e4 g4")',
        target: { kind: "code", code: 'mel: note("c4 e4 g4")' },
        fromBar: 1,
        bars: 1,
        mode: "melody",
        key: { tonic: "C", mode: "major" },
        meter: "4/4",
        lint,
      },
      deps,
    );
    expect(same.status).toBe("pass");
    const diff = await compareWith(
      {
        learnerCode: 'mel: note("c4 f4 g4")',
        target: { kind: "code", code: 'mel: note("c4 e4 g4")' },
        fromBar: 1,
        bars: 1,
        mode: "melody",
        key: { tonic: "C", mode: "major" },
        meter: "4/4",
        lint,
      },
      deps,
    );
    expect(diff.status).toBe("fail");
    expect(diff.diagnostics.map((d) => d.id)).toEqual(["melody.wrong-degree"]);
  });
});
