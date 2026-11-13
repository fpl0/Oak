// Wave 3 integration: the grader defects the authors and reviewers reported, each reproduced first and
// pinned here on the headless realm.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type {
  Diagnostic,
  ExBase,
  Exercise,
  ExerciseOf,
  GradeResult,
  Matcher,
  RubricRule,
} from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { gradeSung } from "@oak/pitch";
import { PROFILE as PITCH_PROFILE } from "../../../pitch/src/fixtures.test-data.ts";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { melodyLine, motifReuse } from "../analyze/melody.ts";
import { renderFeedback, toolText } from "../feedback/catalog.ts";
import { runMatcher } from "../match/index.ts";
import { evaluateRubric } from "../rubric/index.ts";
import type { ExerciseResponse, GradeContext, NormalizeContext } from "../types.ts";
import { intervalSlots } from "./answers.ts";
import { gradeWith } from "./index.ts";
import { judgeSungPattern } from "./sing.ts";

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
  exerciseGlobalId: "U03.L10/test",
  mode: "lesson",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 80,
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0,
  tutorHints: 0,
  extraReplays: 0,
  lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
  ...o,
});
const grade = (exercise: Exercise, response: ExerciseResponse): Promise<GradeResult> =>
  gradeWith({ exercise, response, ctx: ctx() }, deps);
const ids = (r: { diagnostics: readonly Diagnostic[] }): string[] => r.diagnostics.map((d) => d.id);
const said = (r: { diagnostics: readonly Diagnostic[] }, id: string): string => {
  const d = r.diagnostics.find((x) => x.id === id);
  if (!d) throw new Error(`no ${id} in ${ids(r).join(", ")}`);
  return renderFeedback(d);
};
const nctx: NormalizeContext = { meter: "4/4", key: { tonic: "C", mode: "major" } };
const deg = (pattern: string, key = "C4:major") => `mel: n("${pattern}").scale("${key}").s("piano")`;

// U03.L10's Swing Low: 3 1 | 3 1 6, | 5, (bar 4 silent), by ear, any key.
const SWING = "<[2@2 0@2] [2@2 0 -2] [-3@4] ~>";
const STARTER = `mel: n("⟪0 ~ ~ ~⟫").scale("C4:major").s("piano")`;
const byEar: ExerciseOf<"dictation"> = {
  ...base("dictation", "swing-low"),
  domain: "melody",
  stimulus: { src: "code", code: deg(SWING), bars: 4, showCode: false },
  cue: { context: "tonic-chord", countInBars: 1, click: false, replays: -1 },
  answer: { ui: "code", starter: STARTER },
  reference: { solutions: [deg(SWING)], bars: 4 },
  matcher: {
    m: "melody",
    pitch: "transposition-invariant",
    wPitch: 0.8,
    wRhythm: 0.2,
    rhythmTol: rat(1, 16),
  },
  byEar: { ab: true, rates: [1, 0.75], accepts: "any-key" },
} as ExerciseOf<"dictation">;

describe("by-ear transcription (U03.L10)", () => {
  test("a note an octave off reads as the right note an octave higher, not '6 (la) where the source has 6 (la)'", async () => {
    const r = await grade(byEar, { code: deg("<[2@2 0@2] [2@2 0 5] [-3@4] ~>") });
    const first = said(r, "melody.first-difference");
    expect(first).toBe(
      "The first difference is in bar 2, 4: 6 (la) is the right note, but an octave higher than the source.",
    );
    expect(said(r, "melody.octave")).toBe("Bar 2, 4: right note, an octave higher.");
  });

  test("moved two scale steps in C: wrong degrees in C, never 'one step too high' or 'right tune in E♭'", async () => {
    const r = await grade(byEar, { code: deg("<[4@2 2@2] [4@2 2 0] [-1@4] ~>") });
    expect(r.status).toBe("fail");
    expect(ids(r)).not.toContain("melody.index-shift");
    expect(ids(r)).not.toContain("melody.transposed");
    expect(said(r, "melody.wrong-degree")).toBe("Bar 1, 1: you have 5 (sol); the melody has 3 (mi).");
  });

  test("the degrees typed into n: one melody.index-shift, no wrong key", async () => {
    const r = await grade(byEar, { code: deg("<[3@2 1@2] [3@2 1 -1] [-2@4] ~>") });
    expect(ids(r)).toContain("melody.index-shift");
    expect(ids(r)).not.toContain("melody.wrong-degree");
    expect(ids(r)).not.toContain("melody.transposed");
  });

  test("the right tune in F still passes and is said to be in F", async () => {
    const r = await grade(byEar, { code: deg(SWING, "F4:major") });
    expect(r.status).toBe("pass");
    expect(said(r, "melody.transposed")).toBe("Right tune, but in F major, not C major.");
  });

  test("the starter handed back unchanged is code.unchanged (AUTHORING §9), not a list of missing notes", async () => {
    const r = await grade(byEar, { code: deg("0 ~ ~ ~") });
    expect(ids(r)).toEqual(["code.unchanged"]);
  });
});

describe("events matcher: the index slip (U03.L02 'degrees typed as n')", () => {
  const ODE = "<[2 2 3 4] [4 3 2 1]>";
  const EVENTS: Matcher = { m: "events", pitch: "absolute", rhythm: "onsets", durations: false };
  test("every note one degree high: one melody.index-shift, not eight wrong-degree lines", async () => {
    const m = runMatcher(
      EVENTS,
      await strudel(deg(ODE), 2),
      await strudel(deg("<[3 3 4 5] [5 4 3 2]>"), 2),
      nctx,
    );
    expect(ids(m)).toEqual(["melody.index-shift"]);
    expect(renderFeedback(m.diagnostics[0] as Diagnostic)).toBe(
      "Every note is one step too high. `n` counts from 0, so degree 3 is `n(2)`.",
    );
    expect(m.score).toBe(0);
  });
  test("one wrong note stays one wrong-degree line; two steps off is not an index slip", async () => {
    const one = runMatcher(
      EVENTS,
      await strudel(deg(ODE), 2),
      await strudel(deg("<[2 2 3 5] [4 3 2 1]>"), 2),
      nctx,
    );
    expect(ids(one)).toEqual(["melody.wrong-degree"]);
    const two = runMatcher(
      EVENTS,
      await strudel(deg(ODE), 2),
      await strudel(deg("<[4 4 5 6] [6 5 4 3]>"), 2),
      nctx,
    );
    expect(ids(two)).not.toContain("melody.index-shift");
  });
});

describe("interval names: the spelling on the page decides (U04.CP name-the-quality)", () => {
  test("F up to B is A4: TT, A4 and 4A pass; d5 does not", () => {
    for (const got of ["TT", "A4", "4A", "tritone"])
      expect([got, intervalSlots(["TT"], [got], { spelled: ["A4"] }).score]).toEqual([got, 1]);
    const d5 = intervalSlots(["TT"], ["d5"], { spelled: ["A4"] });
    expect(d5.score).toBe(0);
    expect(renderFeedback(d5.diagnostics[0] as Diagnostic)).toBe(
      "That was TT (tritone), not diminished 5th. Count the letter names from the lower note, both ends included.",
    );
  });
  test("a tritone called P4 or P5 is a quality slip (count the half steps), not a letter-count slip", () => {
    const p4 = intervalSlots(["TT"], ["P4"], { spelled: ["A4"] });
    expect(ids(p4)).toEqual(["id.interval-quality"]);
    expect(renderFeedback(p4.diagnostics[0] as Diagnostic)).toBe(
      "Right size, a 4th, but TT (tritone), not P4. Count the half steps: 6, not 5.",
    );
    // Without the page's spelling the tritone keeps both names.
    expect(intervalSlots(["TT"], ["d5"]).score).toBe(1);
    expect(ids(intervalSlots(["TT"], ["P5"]))).toEqual(["id.interval-quality"]);
  });
  test("graded end to end, the stimulus' own spelling is read", async () => {
    const ex: ExerciseOf<"fact"> = {
      ...base("fact"),
      stimulus: {
        src: "code",
        code: `mel: note("<[c4 e4] [d4 a4] [f4 b4]>")`,
        bars: 3,
        showCode: false,
        showStaff: true,
      },
      answer: { ui: "text", normalize: "interval" },
      correct: { text: ["M3", "P5", "TT"] },
      spelling: "strict",
      order: "sequence",
    };
    expect((await grade(ex, { answer: { text: ["M3", "P5", "TT"] } })).status).toBe("pass");
    expect((await grade(ex, { answer: { text: ["M3", "P5", "4A"] } })).status).toBe("pass");
    expect((await grade(ex, { answer: { text: ["M3", "P5", "d5"] } })).status).toBe("fail");
  });
});

describe("sung degree patterns name the first wrong degree", () => {
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  const held = () => {
    const out = [];
    for (let t = 0; t < 2.7; t += 512 / 48000) {
      const on = t > 0.1 && t < 2.6;
      out.push({ t, hz: on ? hz(60) : 0, clarity: on ? 0.97 : 0.1, rms: on ? 0.1 : 0.0005 });
    }
    return out;
  };
  const targets = [60, 64, 67, 64, 60].map((midi, i) => ({
    midi,
    on: 0.1 + i * 0.5,
    off: 0.1 + (i + 1) * 0.5,
  }));
  const tol = {
    cents: 50 as const,
    octave: "global" as const,
    driftCompCents: 30,
    minCoverage: 0.4,
    passHitRate: 0.8,
  };
  const judge = (mode: "echo" | "degree", diagnostics?: Diagnostic[]) => {
    const r = gradeSung(held(), targets, tol, mode, PITCH_PROFILE);
    return judgeSungPattern({
      degrees: ["1", "3", "5", "3", "1"],
      key: { tonic: "C", mode: "major" },
      labels: "numbers",
      notes: r.notes,
      diagnostics: diagnostics ?? r.diagnostics,
      mode,
    });
  };
  test("echo: a held 1 under 1-3-5-3-1 says note 1 was right and the pattern goes on", () => {
    const ds = judge("echo");
    expect(ds.map((d) => d.id)).toEqual(["sing.too-short"]);
    expect(renderFeedback(ds[0] as Diagnostic)).toBe(
      "You sang 1 of 5 notes; the pattern goes on with 3, 5, 3, 1.",
    );
  });
  test("timed: the held 1 is named under note 2", () => {
    const ds = judge("degree");
    expect(renderFeedback(ds.find((d) => d.id === "sing.wrong-degree") as Diagnostic)).toBe(
      "Note 2: you sang 1; the pattern has 3 here.",
    );
  });
  test("a host that passes the per-note result without pitch's diagnostics still gets the findings", () => {
    const ds = judge("degree", []);
    expect(ds.filter((d) => d.id === "sing.wrong-degree").length).toBe(3);
    expect(renderFeedback(ds[0] as Diagnostic)).toBe("Note 2: you sang 1; the pattern has 3 here.");
  });
});

describe("motif reuse measures one period of the learner's loop", () => {
  const rule = (o: Partial<{ minRatio: number; shape: "semitones" | "steps" | "either" }> = {}): RubricRule =>
    ({
      id: "same-shape",
      label: "Bar 2 keeps bar 1's shape",
      required: true,
      skills: [],
      rule: "motif-reuse",
      track: "@melody",
      minRatio: 0.5,
      unitBars: 1,
      ...o,
    }) as RubricRule;
  const run = async (code: string, o: Parameters<typeof rule>[0] = {}, bars = 16) => {
    const n = await strudel(code, bars);
    return evaluateRubric([rule(o)], n, { ...nctx, code, params: {}, bars }).rows[0];
  };
  test("a 2-bar riff with another shape in bar 2 is 0 of 2, not '14 of 16 bars'", async () => {
    const row = await run(`mel: note("<[c4 e4 g4 e4] [g4 f4 e4 d4]>").s("piano")`);
    expect(row?.ok).toBe(false);
    expect(row?.value).toBe(0);
    expect(renderFeedback(row?.diag as Diagnostic)).toBe(
      "Bar 2 keeps bar 1's shape: in one pass of your 2-bar loop, 0 of 2 bars repeat the shape of an earlier one (0%); at least 50%",
    );
  });
  test("the answer a 4th up is 1 of 2; the starter with a silent bar 2 is 0 of 1", async () => {
    expect((await run(`mel: note("<[c4 e4 g4 e4] [f4 a4 c5 a4]>").s("piano")`))?.value).toBe(0.5);
    expect((await run(`mel: note("<[c4 e4 g4 e4] ~>").s("piano")`))?.value).toBe(0);
  });
  test("diatonic shape: [2 4 6 4] after [0 2 4 2] is reuse by scale steps, not by half steps", async () => {
    const code = deg("<[0 2 4 2] [2 4 6 4]>");
    expect((await run(code))?.ok).toBe(false);
    expect((await run(code, { shape: "steps" }))?.ok).toBe(true);
    expect((await run(code, { shape: "either" }))?.ok).toBe(true);
    // An exact copy moved by a named interval counts either way.
    expect((await run(deg("<[0 2 4 2] [3 5 7 5]>"), { shape: "steps" }))?.ok).toBe(true);
  });
  test("motifReuse trims to the period it is given", async () => {
    const n = await strudel(deg("<[0 2 4 2] [4 3 2 1]>"), 16);
    const notes = melodyLine(n.all);
    expect(motifReuse(notes, 1).ratio).toBeGreaterThan(0.8);
    expect(motifReuse(notes, 1, { periodBars: 2 })).toMatchObject({ ratio: 0, units: 2, bars: 2 });
  });
});

describe("tools are named as written, not by ID", () => {
  test("toolText", () => {
    const code = (id: string) =>
      ({
        "tb.mini.stack": ",",
        "tb.transpose.interval": '.transpose("3M")',
        "tb.n.range": "negative and ≥7 n",
      })[id] ?? null;
    expect(toolText("tb.mini.stack", code)).toBe("`,`");
    expect(toolText("tb.transpose.interval", code)).toBe('`.transpose("3M")`');
    expect(toolText("tb.n.range", code)).toBe("negative and ≥7 n");
    expect(toolText("tb.legato")).toBe("`legato`");
  });
});
