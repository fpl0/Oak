// Wave 3 answer kinds, graded end to end with the headless realm: staff writing (pitch only and pitch with
// rhythm) with octave, accidental and enharmonic slips told apart; key signatures (count, order, sharps
// for a flat key); sung degree patterns judged from @oak/pitch's per-note result; by-ear transcription;
// interval names; and the events matcher's explicit `onsets+durations`.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExBase, Exercise, ExerciseOf, GradeResult, NEvent, SingTolerance } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { strudelInterval } from "@oak/theory";
import { ev, headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { renderFeedback, unknownCodes } from "../feedback/catalog.ts";
import { eventsMatch } from "../match/events.ts";
import { melodyMatch } from "../match/melody.ts";
import type { PerformanceResult } from "../perf/index.ts";
import { performancePasses, rhythmSlots, singTargets } from "../perf/index.ts";
import { evalHeadless } from "../testing.ts";
import type { ExerciseResponse, GradeContext } from "../types.ts";
import { byEarMatcher, defaultSingLabels, gradeWith } from "./index.ts";

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
  exerciseGlobalId: "U03.L05/test",
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
const errors = (r: GradeResult): string[] =>
  r.diagnostics.filter((d) => d.severity === "error" || d.severity === "warn").map((d) => d.id);
const text = (r: GradeResult, id: string): string => {
  const d = r.diagnostics.find((x) => x.id === id);
  if (!d) throw new Error(`no ${id} in ${ids(r).join(", ")}`);
  return renderFeedback(d);
};
const noUnknown = (r: GradeResult): void => expect(unknownCodes(r.diagnostics)).toEqual([]);
/** A staff note as the staff widget sends it: sounding MIDI and the written spelling. */
const note = (written: string, midi: number, beat: number, dur = rat(1, 4)): NEvent => ({
  ...ev({ onset: rat(beat, 4), dur, midi, track: "staff" }),
  written,
});

describe("staff writing, pitch only, in a key", () => {
  const ex: ExerciseOf<"staff-write"> = {
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
  const write = (...xs: [string, number][]) => ({ staff: xs.map(([w, m], i) => note(w, m, i)) });

  test("right passes", async () => {
    const r = await grade(ex, write(["G4", 67], ["F#4", 66], ["E4", 64], ["D4", 62]));
    expect(r.status).toBe("pass");
    expect(r.score).toBe(1);
  });
  test("F natural where the key makes it sharp: staff.accidental names the signature", async () => {
    const r = await grade(ex, write(["G4", 67], ["F4", 65], ["E4", 64], ["D4", 62]));
    expect(r.status).toBe("fail");
    expect(errors(r)).toEqual(["staff.accidental"]);
    expect(text(r, "staff.accidental")).toBe(
      "Note 2: F4 should be F#4: same line or space, different accidental: in G major the key signature already makes every F sharp.",
    );
    // The terse arrow stays, as information, for authored overrides of spell.wrong.
    expect(r.diagnostics.find((d) => d.id === "spell.wrong")?.severity).toBe("info");
    noUnknown(r);
  });
  test("an octave slip is staff.octave, with the direction", async () => {
    const r = await grade(ex, write(["G4", 67], ["F#4", 66], ["E4", 64], ["D5", 74]));
    expect(errors(r)).toEqual(["staff.octave"]);
    expect(text(r, "staff.octave")).toBe(
      "Note 4: D5 is the right note, an octave too high. D4 sits seven lines and spaces lower.",
    );
  });
  test("the right sound misspelled in the key is staff.enharmonic, half credit", async () => {
    const r = await grade(ex, write(["G4", 67], ["Gb4", 66], ["E4", 64], ["D4", 62]));
    expect(r.status).toBe("fail");
    expect(errors(r)).toEqual(["staff.enharmonic"]);
    expect(r.score).toBeCloseTo(0.875, 5);
    expect(text(r, "staff.enharmonic")).toBe(
      "Note 2: Gb4 sounds right, but in G major it is written F#4: in G major the key signature already makes every F sharp.",
    );
  });
  test("three slips, three codes; a plain wrong note keeps spell.wrong", async () => {
    const r = await grade(ex, write(["G5", 79], ["F4", 65], ["E4", 64], ["C4", 60]));
    expect(errors(r).sort()).toEqual(["spell.wrong", "staff.accidental", "staff.octave"]);
  });
});

describe("staff writing, pitch and rhythm (events)", () => {
  const ex: ExerciseOf<"staff-write"> = {
    ...base("staff-write"),
    answer: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      key: { tonic: "D", mode: "major" },
      palette: { durations: ["4", "2"], accidentals: true, ties: false, rests: false },
    },
    expect: {
      e: "events",
      reference: { solutions: ['note("d4 f#4 a4 d5").s("piano")'], bars: 1 },
      matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: true },
    },
  };
  const right = () => [note("D4", 62, 0), note("F#4", 66, 1), note("A4", 69, 2), note("D5", 74, 3)];
  test("right passes", async () => {
    expect((await grade(ex, { staff: right() })).status).toBe("pass");
  });
  test("octave, accidental and enharmonic are three findings at bar and beat", async () => {
    const xs = right();
    xs[3] = note("D4", 62, 3); // an octave low
    xs[1] = note("F4", 65, 1); // forgot the signature's sharp
    const r = await grade(ex, { staff: xs });
    expect(r.status).toBe("fail");
    expect(errors(r).sort()).toEqual(["staff.accidental", "staff.octave"]);
    expect(text(r, "staff.accidental")).toContain("Bar 1, 2: F4 should be F#4");
    expect(text(r, "staff.octave")).toContain("Bar 1, 4: D4 is the right note, an octave too low.");
    const enh = right();
    enh[1] = note("Gb4", 66, 1);
    const e = await grade(ex, { staff: enh });
    expect(e.status).toBe("fail");
    expect(errors(e)).toEqual(["staff.enharmonic"]);
    expect(text(e, "staff.enharmonic")).toContain(
      "Bar 1, 2: Gb4 sounds right, but in D major it is written F#4",
    );
    noUnknown(e);
  });
  test("a rhythm slip stays a rhythm finding", async () => {
    const xs = right();
    xs[3] = note("D5", 74, 3, rat(1, 8));
    const r = await grade(ex, { staff: xs });
    expect(errors(r)).toEqual(["rhythm.duration"]);
  });
});

describe("key-signature answers", () => {
  const ks = (tonic: string, order?: "sequence" | "set"): ExerciseOf<"staff-write"> => ({
    ...base("staff-write"),
    answer: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      mode: "key-signature",
      palette: { durations: [], accidentals: true, ties: false, rests: false },
    },
    expect: { e: "key-signature", key: { tonic, mode: "major" }, ...(order ? { order } : {}) },
  });
  const put = (...xs: string[]) => ({ answer: { text: xs } });
  test("right, in order or as a set", async () => {
    expect((await grade(ks("D", "sequence"), put("F#", "C#"))).status).toBe("pass");
    expect((await grade(ks("Eb", "sequence"), put("Bb", "Eb", "Ab"))).status).toBe("pass");
    expect((await grade(ks("Eb"), put("Ab", "Bb", "Eb"))).status).toBe("pass");
    expect((await grade(ks("C"), put())).status).toBe("pass");
    expect((await grade(ks("A"), put("f♯", "c♯", "g♯"))).status).toBe("pass");
  });
  test("wrong order (only when the step asks for the written order)", async () => {
    const r = await grade(ks("A", "sequence"), put("C#", "F#", "G#"));
    expect(r.status).toBe("fail");
    expect(ids(r)).toEqual(["keysig.order"]);
    expect(text(r, "keysig.order")).toBe(
      "Right sharps, written in another order. A signature always reads F C G D A E B: here F# C# G#.",
    );
    expect(r.score).toBeGreaterThan(0);
  });
  test("sharps for a flat key", async () => {
    const r = await grade(ks("F"), put("F#"));
    expect(ids(r)).toEqual(["keysig.type"]);
    expect(text(r, "keysig.type")).toBe(
      "F major is a flat key: its signature is Bb. Sharps and flats never mix in a key signature.",
    );
  });
  test("wrong count names how many", async () => {
    const r = await grade(ks("E"), put("F#", "C#", "G#"));
    expect(ids(r)).toEqual(["keysig.count"]);
    expect(text(r, "keysig.count")).toBe("E major has 4 sharps: F# C# G# D#. You wrote F# C# G#.");
    expect(text(await grade(ks("F"), put()), "keysig.count")).toBe("F major has 1 flat: Bb. You wrote none.");
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.score).toBeLessThan(1);
  });
  test("other notes, and anything at all for C major", async () => {
    expect(ids(await grade(ks("D"), put("F#", "G#")))).toEqual(["keysig.wrong"]);
    expect(ids(await grade(ks("C"), put("F#")))).toEqual(["keysig.wrong"]);
  });
});

describe("sung degree patterns", () => {
  const tol: SingTolerance = {
    cents: "learner",
    octave: "per-note",
    driftCompCents: 30,
    minCoverage: 0.4,
    passHitRate: 0.8,
  };
  const sing = (
    degrees: string[],
    o: Partial<ExerciseOf<"sing">> = {},
    octaves?: number[],
  ): ExerciseOf<"sing"> => ({
    ...base("sing"),
    mode: "echo",
    stimulus: { src: "code", code: 'n("0 2 4").scale("C4:major")', bars: 1, showCode: false },
    cue: { context: "none", countInBars: 0, click: false, replays: -1 },
    target: { from: "degrees", degrees: degrees as never, ...(octaves ? { octaves } : {}) },
    tol,
    showTrace: "after",
    fallback: "skip",
    ...o,
  });
  /** What @oak/pitch's gradeSung reports, from what was sung (raw MIDI, `null` = missed), per-note folding. */
  const perf = (targets: number[], sung: (number | null)[]): PerformanceResult => {
    const notes = targets.map((t, i) => {
      const s = sung[i] ?? null;
      if (s === null)
        return {
          index: i,
          targetMidi: t,
          sungMidi: null,
          cents: null,
          coverage: 0,
          credit: 0,
          octaveShift: 0,
          feedback: "sing.missed",
        };
      const raw = (s - t) * 100;
      const folded = ((((raw + 600) % 1200) + 1200) % 1200) - 600;
      const shift = Math.round((raw - folded) / 1200);
      const ok = Math.abs(folded) <= 70;
      return {
        index: i,
        targetMidi: t,
        sungMidi: t + folded / 100,
        cents: folded,
        coverage: 1,
        credit: ok ? 1 : 0,
        octaveShift: shift,
        feedback: ok ? null : "sing.wrong-note",
      };
    });
    const diagnostics = notes.flatMap((n, i) =>
      n.feedback
        ? [
            {
              id: n.feedback as "sing.missed",
              severity: "error" as const,
              params: { i: i + 1, exp: "x" },
              where: { slot: i },
            },
          ]
        : [],
    );
    const pitch = notes.reduce((a, n) => a + n.credit, 0) / notes.length;
    const missed = notes.filter((n) => n.feedback === "sing.missed").length;
    return {
      score: pitch,
      pass: pitch >= 0.8 && missed <= 1,
      dims: { pitch: { score: pitch, weight: 1 } },
      diagnostics,
      notes,
    };
  };
  test("all right passes, with no pattern findings", async () => {
    const r = await grade(sing(["1", "3", "5", "3", "1"]), {
      performance: perf([60, 64, 67, 64, 60], [60, 64, 67, 64, 60]),
    });
    expect(r.status).toBe("pass");
    expect(errors(r)).toEqual([]);
  });
  test("a wrong degree is named as a degree, and a right contour is said", async () => {
    const r = await grade(sing(["1", "3", "5", "3", "1"]), {
      performance: perf([60, 64, 67, 64, 60], [60, 64, 65, 64, 60]),
    });
    expect(ids(r)).toContain("sing.wrong-degree");
    expect(ids(r)).not.toContain("sing.wrong-note");
    expect(text(r, "sing.wrong-degree")).toBe("Note 3: you sang 4; the pattern has 5 here.");
    expect(ids(r)).toContain("sing.contour-right");
    noUnknown(r);
  });
  test("from U03.L08 the labels are syllables, numbers still shown", async () => {
    const r = await grade(
      sing(["1", "3", "5", "3", "1"]),
      { performance: perf([60, 64, 67, 64, 60], [60, 64, 65, 64, 60]) },
      { exerciseGlobalId: "U03.L08/echo" },
    );
    expect(text(r, "sing.wrong-degree")).toBe("Note 3: you sang fa (4); the pattern has sol (5) here.");
    expect(defaultSingLabels("U03.L07/x")).toBe("numbers");
    expect(defaultSingLabels("U03.CP/x")).toBe("syllables");
    expect(defaultSingLabels("U04.L01/x")).toBe("syllables");
    expect(defaultSingLabels("C1.S1/x")).toBe("numbers");
    // The step's own `labels` wins.
    const own = await grade(
      sing(["1", "3", "5", "3", "1"], { labels: "numbers" }),
      { performance: perf([60, 64, 67, 64, 60], [60, 64, 65, 64, 60]) },
      { exerciseGlobalId: "U04.L01/x" },
    );
    expect(text(own, "sing.wrong-degree")).toBe("Note 3: you sang 4; the pattern has 5 here.");
  });
  test("a wrong degree with the wrong direction is not called a right contour", async () => {
    const r = await grade(sing(["1", "3", "5"]), { performance: perf([60, 64, 67], [60, 64, 62]) });
    expect(ids(r)).toContain("sing.wrong-degree");
    expect(ids(r)).not.toContain("sing.contour-right");
  });
  test("stopping early is one sing.too-short naming what was left", async () => {
    const r = await grade(sing(["1", "3", "5", "3", "1"]), {
      performance: perf([60, 64, 67, 64, 60], [60, 64, 67, null, null]),
    });
    expect(r.status).toBe("fail");
    expect(ids(r)).not.toContain("sing.missed");
    expect(text(r, "sing.too-short")).toBe("You sang 3 of 5 notes; the pattern goes on with 3, 1.");
  });
  test("one missed note in the middle stays sing.missed", async () => {
    const r = await grade(sing(["1", "3", "5", "3", "1"]), {
      performance: perf([60, 64, 67, 64, 60], [60, null, 67, 64, 60]),
    });
    expect(ids(r)).toContain("sing.missed");
    expect(ids(r)).not.toContain("sing.too-short");
  });
  test("1-3-5-1' sung with the top note folded down: credited, and the pattern is explained", async () => {
    const ex = sing(["1", "3", "5", "1"], {}, [0, 0, 0, 1]);
    const r = await grade(ex, { performance: perf([60, 64, 67, 72], [60, 64, 67, 60]) });
    expect(r.status).toBe("pass");
    expect(text(r, "sing.octave-folded")).toBe(
      "Note 4: right degree (1), but the pattern goes up to it and you sang it an octave lower. Counted as right.",
    );
  });
  test("sing-echo of a melody: the wrong note is named by its degree in the key", async () => {
    const echo = {
      ...sing(["1"]),
      target: { from: "stimulus" as const },
      key: { tonic: "G", mode: "major" as const },
    };
    // G4 B4 D5 B4 G4 (1 3 5 3 1 in G), the third note sung as C5 (4).
    const r = await grade(echo, { performance: perf([67, 71, 74, 71, 67], [67, 71, 72, 71, 67]) });
    expect(text(r, "sing.wrong-degree")).toBe("Note 3: you sang 4; the pattern has 5 here.");
  });
  test("the targets honour octaves and a rhythm", () => {
    const k = { tonic: "D", mode: "major" } as const;
    const t = singTargets(
      { from: "degrees", degrees: ["1", "3", "5", "1"], octaves: [0, 0, 0, 1] },
      null,
      k,
      "4/4",
      0.5,
    );
    expect(t.map((x) => x.midi)).toEqual([62, 66, 69, 74]);
    expect(t.map((x) => x.on)).toEqual([0, 0.5, 1, 1.5]);
    const r = singTargets(
      { from: "degrees", degrees: ["1", "2", "3", "4", "5"], rhythm: "x x [x x] x" },
      null,
      k,
      "4/4",
      0.5,
    );
    expect(r.map((x) => x.on)).toEqual([0, 0.5, 1, 1.25, 1.5]);
    expect(r[2]?.off).toBe(1.25);
    expect(rhythmSlots("x@3 x")).toEqual([
      { on: 0, dur: 0.75 },
      { on: 0.75, dur: 0.25 },
    ]);
    expect(rhythmSlots("x _ ~ x")).toEqual([
      { on: 0, dur: 0.5 },
      { on: 0.75, dur: 0.25 },
    ]);
    expect(rhythmSlots("x!3 [x x]@1").map((s) => s.on)).toEqual([0, 0.25, 0.5, 0.75, 0.875]);
    // A pattern longer than the rhythm takes the rhythm again in the next bar.
    const two = singTargets(
      { from: "degrees", degrees: ["1", "2", "3"], rhythm: "x x" },
      null,
      k,
      "4/4",
      0.5,
    );
    expect(two.map((x) => x.on)).toEqual([0, 1, 2]);
  });
  test("the lenient first sing passes any covered pitch within 100 cents", () => {
    const lenient: SingTolerance = { ...tol, lenient: true };
    const p = (cents: number): PerformanceResult => ({
      score: 0,
      pass: false,
      dims: {},
      diagnostics: [],
      notes: [{ credit: 0, feedback: "sing.wrong-note", cents, coverage: 0.9 }],
    });
    expect(performancePasses("sing", p(90), lenient)).toBe(true);
    expect(performancePasses("sing", p(140), lenient)).toBe(false);
    expect(performancePasses("sing", p(90), tol)).toBe(false);
  });
});

describe("by-ear transcription (DictationEx.byEar)", () => {
  const SRC = 'setcpm(100/4)\nmel: n("<[0 2 4 2] [4 2 1 0]>").scale("C4:major").s("piano")';
  const ex = (accepts: "exact" | "any-octave" | "any-key"): ExerciseOf<"dictation"> => ({
    ...base("dictation"),
    domain: "melody",
    stimulus: { src: "code", code: SRC, bars: 2, showCode: false },
    cue: { context: "none", countInBars: 1, click: false, replays: -1 },
    answer: { ui: "code", starter: "" },
    reference: { solutions: [SRC], bars: 2 },
    matcher: {
      m: "melody",
      pitch:
        accepts === "exact"
          ? "absolute"
          : accepts === "any-octave"
            ? "octave-free"
            : "transposition-invariant",
      wPitch: 0.7,
      wRhythm: 0.3,
      rhythmTol: rat(0),
    },
    byEar: { ab: true, rates: [1, 0.75, 0.5], accepts },
  });
  const code = (mini: string, scale = "C4:major") =>
    `setcpm(100/4)\nmel: n("${mini}").scale("${scale}").s("piano")`;
  test("the source itself passes", async () => {
    expect((await grade(ex("exact"), { code: SRC })).status).toBe("pass");
  });
  test("one wrong note: the first difference is named by bar and beat", async () => {
    const r = await grade(ex("exact"), { code: code("<[0 2 4 2] [4 3 1 0]>") });
    // One note in eight: 0.91, a pass at the transcription threshold (0.85), still reported.
    expect(r.score).toBeLessThan(1);
    expect(ids(r)).toContain("melody.wrong-degree");
    expect(text(r, "melody.first-difference")).toBe(
      "The first difference is in bar 2, 2: 4 (fa) where the source has 3 (mi).",
    );
    expect(ids(r)).toContain("melody.pitch-only");
    noUnknown(r);
  });
  test("a rhythm slip is a rhythm finding, with where the note belongs", async () => {
    const r = await grade(ex("exact"), { code: code("<[0 2 4 2] [4 2 [1 0] ~]>") });
    expect(ids(r)).toContain("melody.rhythm-note");
    expect(text(r, "melody.rhythm-note")).toBe(
      "Bar 2, 3&: 1 (do) is the right note, but it starts at bar 2, 4 in the source.",
    );
    expect(ids(r)).not.toContain("melody.wrong-degree");
    expect(text(r, "melody.first-difference")).toContain(
      "bar 2, 3&: 1 (do) is the right note at the wrong time",
    );
    expect(r.dims.pitch?.score).toBe(1);
    expect((r.dims.rhythm?.score ?? 1) < 1).toBe(true);
  });
  test("transposed: one finding where the rule wants it as heard; a pass where any key is fine", async () => {
    const inD = code("<[0 2 4 2] [4 2 1 0]>", "D4:major");
    const exact = await grade(ex("exact"), { code: inD });
    expect(exact.status).toBe("fail");
    expect(ids(exact)).toContain("melody.wrong-key");
    expect(ids(exact)).not.toContain("melody.wrong-degree");
    expect(text(exact, "melody.wrong-key")).toBe(
      "Right tune, but in D major. This step wants it as it plays, in C major: move every note 2 semitones down.",
    );
    expect((await grade(ex("any-key"), { code: inD })).status).toBe("pass");
    const octave = code("<[0 2 4 2] [4 2 1 0]>", "C5:major");
    expect(ids(await grade(ex("exact"), { code: octave }))).toContain("melody.wrong-octave");
    expect((await grade(ex("any-octave"), { code: octave })).status).toBe("pass");
  });
  test("the rule decides the comparison, whatever the matcher says", () => {
    const loose = {
      m: "melody",
      pitch: "transposition-invariant",
      wPitch: 1,
      wRhythm: 0,
      rhythmTol: rat(0),
    } as const;
    expect(byEarMatcher(loose, "exact")).toMatchObject({ pitch: "absolute" });
    expect(byEarMatcher({ m: "all", of: [loose] }, "any-octave")).toMatchObject({
      of: [{ pitch: "octave-free" }],
    });
  });
});

describe("interval answers", () => {
  const ex: ExerciseOf<"identify"> = {
    ...base("identify"),
    stimulus: { src: "code", code: 'note("c4 e4")', bars: 1, showCode: false },
    cue: { context: "none", countInBars: 0, click: false, replays: -1 },
    answer: { ui: "text", normalize: "interval" },
    correct: { text: ["M3"] },
  };
  test("any spelling of the name passes, Strudel's included", async () => {
    for (const t of ["M3", "major 3rd", "major third", "3M"])
      expect([t, (await grade(ex, { answer: { text: [t] } })).status]).toEqual([t, "pass"]);
  });
  test("right number, wrong quality; wrong number", async () => {
    const q = await grade(ex, { answer: { text: ["m3"] } });
    expect(ids(q)).toEqual(["id.interval-quality"]);
    expect(text(q, "id.interval-quality")).toBe(
      "Right size, a 3rd, but M3 (major 3rd), not m3. Count the semitones: 4, not 3.",
    );
    const n = await grade(ex, { answer: { text: ["P4"] } });
    expect(ids(n)).toEqual(["id.interval-number"]);
    expect(text(n, "id.interval-number")).toBe(
      "That was M3 (major 3rd), not perfect 4th. Count the letter names from the lower note, both ends included.",
    );
  });
  test("the tritone by any name", async () => {
    const tt = { ...ex, correct: { text: ["A4"] } };
    expect((await grade(tt, { answer: { text: ["TT"] } })).status).toBe("pass");
    expect((await grade(tt, { answer: { text: ["tritone"] } })).status).toBe("pass");
    expect((await grade(tt, { answer: { text: ["d5"] } })).status).toBe("fail");
  });
});

describe("events matcher: rhythm options say what they compare", () => {
  test("onsets+durations is what exact always did; onsets alone ignores lengths", async () => {
    const ref = await strudel('note("c4 [e4 ~] g4 c5")');
    const ans = await strudel('note("c4 e4 g4 c5")');
    const c = { meter: "4/4" as const };
    const exact = eventsMatch(
      ref,
      ans,
      { m: "events", pitch: "absolute", rhythm: "exact", durations: false },
      c,
    );
    const explicit = eventsMatch(
      ref,
      ans,
      { m: "events", pitch: "absolute", rhythm: "onsets+durations", durations: false },
      c,
    );
    const onsets = eventsMatch(
      ref,
      ans,
      { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
      c,
    );
    expect(explicit.score).toBe(exact.score);
    expect(explicit.diagnostics.map((d) => d.id)).toEqual(["rhythm.duration"]);
    expect(onsets.score).toBe(1);
    expect(
      eventsMatch(ref, ans, { m: "events", pitch: "absolute", rhythm: "onsets", durations: true }, c).score,
    ).toBe(explicit.score);
  });
});

describe("Strudel interval strings play what they name (headless Strudel)", () => {
  test("every interval up and down from C4", async () => {
    const names = ["m2", "M2", "m3", "M3", "P4", "A4", "d5", "P5", "m6", "M6", "m7", "M7", "P8", "M10"];
    const semis: Record<string, number> = {
      m2: 1,
      M2: 2,
      m3: 3,
      M3: 4,
      P4: 5,
      A4: 6,
      d5: 6,
      P5: 7,
      m6: 8,
      M6: 9,
      m7: 10,
      M7: 11,
      P8: 12,
      M10: 16,
    };
    for (const name of names)
      for (const dir of ["up", "down"] as const) {
        const s = strudelInterval(name, dir);
        const res = await evalHeadless(`note("c4").transpose("${s}")`, 1);
        expect([s, res.events[0]?.midi]).toEqual([s, 60 + (dir === "up" ? 1 : -1) * (semis[name] as number)]);
      }
  });
});

describe("melody matcher: index shift on a tune with repeated notes", () => {
  test("Ode to Joy written with degree numbers instead of n = degree − 1", async () => {
    const ref = await strudel('n("[2 2 3 4] [4 3 2 1] [0 0 1 2] [2 1 1 ~]").scale("C4:major").slow(4)', 4);
    const ans = await strudel('n("[3 3 4 5] [5 4 3 2] [1 1 2 3] [3 2 2 ~]").scale("C4:major").slow(4)', 4);
    for (const pitch of ["absolute", "key-relative"] as const) {
      const m = melodyMatch(
        ref,
        ans,
        { m: "melody", pitch, wPitch: 0.7, wRhythm: 0.3, rhythmTol: rat(0) },
        {
          meter: "4/4",
          key: { tonic: "C", mode: "major" },
        },
      );
      expect([pitch, m.diagnostics.map((d) => d.id)]).toEqual([pitch, ["melody.index-shift"]]);
      expect(renderFeedback(m.diagnostics[0] as NonNullable<(typeof m.diagnostics)[0]>)).toBe(
        "Every note is one step too high. `n` counts from 0, so degree 3 is `n(2)`.",
      );
    }
    // One wrong note is not an index shift.
    const one = await strudel('n("[2 2 3 4] [4 3 2 1] [0 0 1 2] [2 1 2 ~]").scale("C4:major").slow(4)', 4);
    const m = melodyMatch(
      ref,
      one,
      { m: "melody", pitch: "absolute", wPitch: 0.7, wRhythm: 0.3, rhythmTol: rat(0) },
      {
        meter: "4/4",
        key: { tonic: "C", mode: "major" },
      },
    );
    expect(m.diagnostics.map((d) => d.id)).toEqual(["melody.wrong-degree"]);
  });
});
