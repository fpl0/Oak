// Wave 4 answer kinds, graded end to end with the headless realm (AUTHORING §17.2–§17.4): chord names with
// their accepted spellings, quality pads, Roman numerals by degree, quality and bass (never by string),
// function and cadence strips, chords built on the staff, staged chord dictation (bass as degrees or names),
// by-ear transcription in parts and staged transcribe steps. Every miss names the actual mistake.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AnswerUi, ExBase, Exercise, ExerciseOf, GradeResult, NEvent } from "@oak/content-kit";
import { CADENCE_OPTIONS, FUNCTION_OPTIONS, rat } from "@oak/content-kit";
import { ev, headlessDeps } from "../analyze/__support__/fixtures.ts";
import { renderFeedback, unknownCodes } from "../feedback/catalog.ts";
import type { ExerciseResponse, GradeContext } from "../types.ts";
import { gradeAnswer, sameRn } from "./answers.ts";
import { gradeWith, stagePassed } from "./index.ts";

setDefaultTimeout(30_000);

const deps = headlessDeps();
const C = { tonic: "C", mode: "major" } as const;
const G = { tonic: "G", mode: "major" } as const;
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
  exerciseGlobalId: "U06.L02/test",
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
  ...o,
});
const grade = (exercise: Exercise, response: ExerciseResponse, c: Partial<GradeContext> = {}) =>
  gradeWith({ exercise, response, ctx: ctx(c) }, deps);
const ids = (r: { diagnostics: { id: string }[] }): string[] => r.diagnostics.map((d) => d.id);
const textOf = (r: { diagnostics: GradeResult["diagnostics"] }, id: string): string => {
  const d = r.diagnostics.find((x) => x.id === id);
  if (!d) throw new Error(`no ${id} in ${ids(r).join(", ")}`);
  return renderFeedback(d);
};

describe("chord names (text, normalize: chord)", () => {
  const ui: AnswerUi = { ui: "text", normalize: "chord" };
  const check = (exp: string[], got: string[], spelling: "strict" | "enharmonic" = "enharmonic") =>
    gradeAnswer(ui, { text: exp }, { text: got }, { key: C, spelling });
  test("C°, Co and Cdim are one answer; C+ and Caug one; slash chords name the bass", () => {
    for (const x of ["C°", "Co", "Cdim"]) expect(check(["Co"], [x]).score).toBe(1);
    for (const x of ["C+", "Caug"]) expect(check(["Caug"], [x]).score).toBe(1);
    expect(check(["C/E"], ["C/E"]).score).toBe(1);
    expect(check(["Am"], ["A-"]).score).toBe(1);
  });
  test("a miss names the root, the quality or the bass apart", () => {
    expect(textOf(check(["Am"], ["Em"]), "id.chord-root")).toBe(
      "Am, not Em: the chord is built on A, not E.",
    );
    expect(textOf(check(["Am"], ["A"]), "id.chord-quality")).toBe(
      "Am, not A: right root, but the chord is minor, not major.",
    );
    expect(textOf(check(["Bo"], ["Bm"]), "id.chord-quality")).toContain("diminished, not minor");
    expect(textOf(check(["C/E"], ["C"]), "id.chord-inversion")).toBe(
      "C/E, not C: right chord, but the lowest note is E, not C.",
    );
  });
  test("strict spelling: C♯ is not D♭; enharmonic accepts it", () => {
    expect(check(["C#m"], ["Dbm"], "enharmonic").score).toBe(1);
    const r = check(["C#m"], ["Dbm"], "strict");
    expect(r.score).toBe(0);
    expect(ids(r)).toContain("id.chord-spelling");
  });
});

describe("quality pad", () => {
  test("a miss says what the right quality is made of", () => {
    const r = gradeAnswer(
      { ui: "quality-pad", set: ["maj", "min", "dim", "aug"] },
      { qualities: ["dim"] },
      { qualities: ["min"] },
    );
    expect(r.score).toBe(0);
    expect(textOf(r, "id.quality")).toBe(
      "That was diminished, not minor: diminished is two minor 3rds stacked: tense, narrow.",
    );
  });
});

describe("Roman numerals: by degree, quality and bass, never by string", () => {
  const palette = (allow: ("triads" | "inversions")[] = ["triads"]): AnswerUi => ({
    ui: "rn-palette",
    slots: 4,
    allow,
  });
  test("I V vi IV in C; viio, vii°, VII° are one numeral; V7 is not V", () => {
    expect(
      gradeAnswer(palette(), { rn: ["I", "V", "vi", "IV"] }, { rn: ["I", "V", "vi", "IV"] }, { key: C })
        .score,
    ).toBe(1);
    expect(sameRn("vii°", "viio", C)).toBe(true);
    expect(sameRn("V", "V7", C)).toBe(false);
  });
  test("another degree is named with both chords; the case is named as major vs minor", () => {
    const r = gradeAnswer(
      palette(),
      { rn: ["I", "V", "vi", "IV"] },
      { rn: ["I", "V", "IV", "IV"] },
      { key: C },
    );
    expect(r.score).toBe(0.75);
    expect(textOf(r, "harmony.rn-degree")).toBe(
      "Chord 3: IV is built on degree 4 (F); this chord is vi, built on degree 6 (Am).",
    );
    const c = gradeAnswer(
      palette(),
      { rn: ["I", "V", "vi", "IV"] },
      { rn: ["I", "V", "VI", "IV"] },
      { key: C },
    );
    expect(ids(c)).toContain("harmony.rn-case");
  });
  test("quality beyond case: vii° answered as vii", () => {
    const r = gradeAnswer(palette(), { rn: ["viio"] }, { rn: ["vii"] }, { key: C });
    expect(textOf(r, "harmony.rn-quality")).toBe(
      "Chord 1: right degree, but vii° is diminished, not minor (vii).",
    );
  });
  test("inversions are graded only when the palette allows them (U06.L11): V6 vs V", () => {
    expect(gradeAnswer(palette(), { rn: ["V6"] }, { rn: ["V"] }, { key: C }).score).toBe(1);
    const r = gradeAnswer(palette(["triads", "inversions"]), { rn: ["V6"] }, { rn: ["V"] }, { key: C });
    expect(r.score).toBe(0);
    expect(textOf(r, "harmony.rn-inversion")).toBe(
      "Chord 1: right chord, but its 3rd is in the bass, so it is V6, not V (root in the bass).",
    );
  });
  test("the same text in another key is another chord: ii in G is Am", () => {
    expect(sameRn("ii", "ii", G)).toBe(true);
    expect(gradeAnswer(palette(), { rn: ["ii"] }, { rn: ["II"] }, { key: G }).score).toBe(0);
  });
});

describe("slot-choice strips (function, cadence)", () => {
  const strip = (options = FUNCTION_OPTIONS, slots = 4): AnswerUi => ({
    ui: "slot-choice",
    slots,
    options: [...options],
  });
  test("a function strip T PD D T: a miss names the bar and both labels", () => {
    const r = gradeAnswer(strip(), { choice: ["T", "PD", "D", "T"] }, { choice: ["T", "D", "D", "T"] });
    expect(r.score).toBe(0.75);
    expect(r.slots).toEqual([1, 0, 1, 1]);
    expect(textOf(r, "harmony.function")).toBe(
      "Bar 2: this chord is PD: away (predominant), not D: tension (dominant).",
    );
  });
  test("cadences per phrase with partial credit (IAC for PAC)", () => {
    const r = gradeAnswer(
      strip(CADENCE_OPTIONS, 2),
      { choice: ["HC", "PAC"] },
      { choice: ["HC", "IAC"] },
      { partial: { PAC: { IAC: 0.5 } } },
    );
    expect(r.score).toBe(0.75);
    expect(textOf(r, "harmony.cadence")).toContain("Phrase 2: that ending is Perfect authentic");
  });
  test("labels name the slots; an empty slot is counted", () => {
    const r = gradeAnswer(
      {
        ui: "slot-choice",
        slots: 2,
        options: [
          { id: "ct", label: "chord tone" },
          { id: "nct", label: "not a chord tone" },
        ],
        labels: ["Note 1", "Note 2"],
      },
      { choice: ["ct", "nct"] },
      { choice: ["nct"] },
    );
    expect(textOf(r, "id.slot")).toBe("Note 1: chord tone, not not a chord tone.");
    expect(ids(r)).toContain("id.missing");
  });
});

describe("chords built on the staff (staff-expect.chords)", () => {
  const ex = (
    o: Partial<{ symbols: string[]; spelling: "strict" | "enharmonic"; bass: boolean }> = {},
  ): ExerciseOf<"staff-write"> => ({
    ...base("staff-write"),
    answer: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      palette: { durations: ["2"], accidentals: true, ties: false, rests: false, chords: true },
    },
    expect: { e: "chords", symbols: ["C", "G/B"], spelling: "strict", bass: true, ...o },
  });
  const chord = (at: number, notes: [string, number][]): NEvent[] =>
    notes.map(([w, m]) => ({
      ...ev({ onset: rat(at, 2), dur: rat(1, 2), midi: m, track: "staff" }),
      written: w,
    }));
  test("C then G/B, any stacking and octave: passes", async () => {
    const r = await grade(ex(), {
      staff: [
        ...chord(0, [
          ["G3", 55],
          ["C4", 60],
          ["E4", 64],
        ]),
        ...chord(1, [
          ["B3", 59],
          ["D4", 62],
          ["G4", 67],
        ]),
      ],
    });
    expect(r.score).toBeLessThan(1);
    // C with G lowest is C/G: the bass is checked.
    expect(ids(r)).toContain("harmony.inversion");
    const ok = await grade(ex(), {
      staff: [
        ...chord(0, [
          ["C4", 60],
          ["E4", 64],
          ["G4", 67],
        ]),
        ...chord(1, [
          ["B3", 59],
          ["D4", 62],
          ["G4", 67],
        ]),
      ],
    });
    expect(ok.status).toBe("pass");
    expect(ok.score).toBe(1);
  });
  test("a wrong note is harmony.pcset; a missing chord is named; a misspelling under strict", async () => {
    const wrong = await grade(ex(), {
      staff: [
        ...chord(0, [
          ["C4", 60],
          ["E4", 64],
          ["A4", 69],
        ]),
      ],
    });
    expect(ids(wrong)).toEqual(expect.arrayContaining(["harmony.pcset", "harmony.missing-chord"]));
    const spelled = await grade(ex({ symbols: ["E"], bass: false }), {
      staff: chord(0, [
        ["E4", 64],
        ["Ab4", 68],
        ["B4", 71],
      ]),
    });
    expect(ids(spelled)).toContain("staff.enharmonic");
    expect(spelled.status).toBe("fail");
  });
});

describe("staged chord dictation (dictation.stage-answers)", () => {
  const ex: ExerciseOf<"dictation"> = {
    ...base("dictation"),
    domain: "harmony",
    stimulus: { src: "code", code: "", bars: 4, loop: true, showCode: false },
    cue: { kind: "none" } as never,
    answer: { ui: "rn-palette", slots: 4, allow: ["triads"] },
    stages: ["bass", "quality", "rn"],
    stageAnswers: {
      bass: { ui: "degree-pad", set: ["1", "2", "3", "4", "5", "6"], sequenceLen: 4, syllables: false },
      quality: { ui: "quality-pad", set: ["maj", "min"] },
      rn: { ui: "rn-palette", slots: 4, allow: ["triads"] },
    },
    reference: {
      solutions: [
        'chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")\nbass: n("<0 4 5 3>").scale("C2:major")',
      ],
      bars: 4,
    },
    matcher: { m: "harmony", level: "rn", qualityDepth: "triad", inversion: false, harmonicRhythm: "given" },
  };
  test("bass as degrees, then qualities, then numerals: all right passes", async () => {
    const r = await grade(ex, {
      answer: {
        stages: {
          bass: ["1", "5", "6", "4"],
          quality: ["maj", "maj", "min", "maj"],
          rn: ["I", "V", "vi", "IV"],
        },
      },
    });
    expect(r.status).toBe("pass");
    expect(stagePassed(r, "bass")).toBe(true);
  });
  test("the bass stage alone: graded as degrees (or note names), the next stage opens at 0.8", async () => {
    const one = await grade(ex, { answer: { stages: { bass: ["1", "5", "6", "4"] } } });
    expect(stagePassed(one, "bass")).toBe(true);
    expect(one.status).toBe("fail");
    const names = await grade(ex, { answer: { stages: { bass: ["C", "G", "A", "F"] } } });
    expect(stagePassed(names, "bass")).toBe(true);
    const off = await grade(ex, { answer: { stages: { bass: ["1", "5", "4", "4"] } } });
    expect(stagePassed(off, "bass")).toBe(false);
    expect(textOf(off, "harmony.bass")).toBe("Chord 3 (bar 3): bass is 4; you should hear 6.");
  });
  test("a numeral miss names the degree", async () => {
    const r = await grade(ex, {
      answer: {
        stages: {
          bass: ["1", "5", "6", "4"],
          quality: ["maj", "maj", "min", "maj"],
          rn: ["I", "V", "IV", "IV"],
        },
      },
    });
    expect(r.status).toBe("fail");
    expect(ids(r)).toContain("harmony.rn-degree");
    expect(unknownCodes(r.diagnostics)).toEqual([]);
  });
});

describe("by-ear transcription in parts (by-ear.parts)", () => {
  const ref =
    'bass: note("<c2 g1 a1 f1>").s("piano")\nchords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")';
  const ex: ExerciseOf<"dictation"> = {
    ...base("dictation"),
    domain: "harmony",
    stimulus: { src: "code", code: ref, bars: 4, loop: true, showCode: false },
    cue: { kind: "none" } as never,
    answer: { ui: "code", starter: "" },
    reference: { solutions: [ref], bars: 4 },
    matcher: {
      m: "all",
      of: [
        { m: "melody", pitch: "absolute", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 8], track: "bass" },
        { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
      ],
    },
    byEar: {
      ab: true,
      rates: [1, 0.75],
      accepts: "exact",
      parts: [
        {
          track: "bass",
          label: "The bass",
          matcher: {
            m: "melody",
            pitch: "absolute",
            wPitch: 0.8,
            wRhythm: 0.2,
            rhythmTol: [1, 8],
            track: "bass",
          },
        },
        {
          track: "chords",
          label: "The chords",
          matcher: { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
          pass: 0.8,
        },
      ],
    } as never,
  };
  test("the bass part alone is graded on its own track", async () => {
    const r = await grade(ex, { code: 'bass: note("<c2 g1 a1 f1>").s("piano")', part: "bass" });
    expect(r.status).toBe("pass");
    const wrong = await grade(ex, { code: 'bass: note("<c2 g1 g1 f1>").s("piano")', part: "bass" });
    expect(wrong.status).toBe("fail");
  });
  test("then the chords over it; the whole is graded by the step's matcher", async () => {
    const r = await grade(ex, { code: ref, part: "chords" });
    expect(r.status).toBe("pass");
    expect((await grade(ex, { code: ref })).status).toBe("pass");
  });
});

describe("staged transcribe steps (transcribe.stages)", () => {
  const ref =
    'bass: note("<c2 g1 a1 f1>").s("piano")\nchords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")';
  const ex: ExerciseOf<"transcribe-step"> = {
    ...base("transcribe-step"),
    projectId: "p",
    ladder: 3,
    stimulus: { src: "code", code: ref, bars: 4, loop: true, showCode: false },
    layer: "chords",
    bars: [1, 4],
    grading: {
      mode: "auto",
      reference: { solutions: [ref], bars: 4 },
      matcher: {
        m: "harmony",
        level: "rn",
        qualityDepth: "triad",
        inversion: false,
        harmonicRhythm: "given",
      },
      stages: [
        {
          stage: "bass",
          matcher: {
            m: "melody",
            pitch: "octave-free",
            wPitch: 0.7,
            wRhythm: 0.3,
            rhythmTol: [1, 16],
            track: "@bass",
          },
          pass: 0.8,
        },
        {
          stage: "quality",
          matcher: {
            m: "harmony",
            level: "quality",
            qualityDepth: "triad",
            inversion: false,
            harmonicRhythm: "given",
          },
          pass: 0.8,
        },
        {
          stage: "rn",
          matcher: {
            m: "harmony",
            level: "rn",
            qualityDepth: "triad",
            inversion: false,
            harmonicRhythm: "given",
          },
          pass: 0.8,
        },
      ],
    },
    studio: { minRate: 0.25, overlay: true },
  };
  test("each stage has its own matcher and pass mark", async () => {
    const bass = await grade(ex, { code: 'bass: note("<c3 g2 a2 f2>").s("piano")', stage: "bass" });
    expect(bass.status).toBe("pass");
    const rn = await grade(ex, { code: ref, stage: "rn" });
    expect(rn.status).toBe("pass");
    const wrongRn = await grade(ex, {
      code: 'bass: note("<c2 g1 a1 f1>").s("piano")\nchords: n("<[0,2,4] [4,6,8] [3,5,7] [3,5,7]>").scale("C3:major").s("piano")',
      stage: "rn",
    });
    expect(wrongRn.status).toBe("fail");
  });
});
