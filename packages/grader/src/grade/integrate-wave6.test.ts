// Wave 6 integration (packages): the seams the U12–U17 authors, the capstone and finale authors and the repertoire
// author reported against the grader, each pinned on real Strudel 1.2.6 output with the case that was wrong and
// the case that must stay right. Sources: scratchpad/w6/build-author-*.md (apiNotes), build-author-finale.md,
// build-author-repertoire.md.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExBase, ExerciseOf, GradeResult, KeySpec, Matcher, RubricRule } from "@oak/content-kit";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { sectionsFromAst } from "../analyze/sections.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import { runMatcher } from "../match/index.ts";
import type { RubricContext } from "../rubric/context.ts";
import { evalRule } from "../rubric/rules.ts";
import type { ExerciseResponse, GradeContext } from "../types.ts";
import { gradeAnswer, keyboardCheck } from "./answers.ts";
import { gradeWith } from "./index.ts";

setDefaultTimeout(60_000);

const C: KeySpec = { tonic: "C", mode: "major" };
const rule = (body: Record<string, unknown>): RubricRule =>
  ({ id: "i6", label: "i6", required: true, skills: [], ...body }) as unknown as RubricRule;
async function run(body: Record<string, unknown>, code: string, bars: number, key: KeySpec | null = C) {
  const s = sectionsFromAst(code);
  const total = s && "totalBars" in s ? s.totalBars : null;
  const n = await strudel(code, bars);
  const ctx: RubricContext = {
    meter: "4/4",
    code,
    params: {},
    bars,
    ...(total ? { totalBars: total } : {}),
    ...(key ? { key } : {}),
  };
  return evalRule(rule(body), n, ctx);
}

describe("contains-rn `min` counts one pass of the loop (U15.L03, L04, L06)", () => {
  // An eight-bar loop with ONE secondary dominant (E7 → Am, V7/vi), graded over sixteen bars as a lesson does.
  const ONE = `setcpm(100/4)
chords: chord("<C E7 Am F C G C C>").voicing().s("piano")`;
  const TWO = `setcpm(100/4)
chords: chord("<C E7 Am D7 G G C C>").voicing().s("piano")`;
  const kind = { rule: "contains-rn", rn: [], kind: ["secondary-dominant"], min: 2, mustResolve: true };
  test("one door heard twice is one door: `min: 2` is not met", async () => {
    const out = await run(kind, ONE, 16);
    expect([out.ok, out.value]).toEqual([false, 1]);
  });
  test("two doors in one pass meet `min: 2`", async () => {
    const out = await run(kind, TWO, 16);
    expect([out.ok, out.value]).toEqual([true, 2]);
  });
  test("the numeral list counts the same way, and `min: 1` still reads the whole window", async () => {
    expect((await run({ rule: "contains-rn", rn: ["V7/vi"], min: 2 }, ONE, 16)).ok).toBe(false);
    expect((await run({ rule: "contains-rn", rn: ["V7/vi"], min: 1 }, ONE, 16)).ok).toBe(true);
    expect((await run({ rule: "contains-rn", rn: ["V7/vi", "V7/V"], min: 2 }, TWO, 16)).ok).toBe(true);
  });
  test("a piece that does not repeat is one pass: two doors in different halves count twice", async () => {
    const LONG = `setcpm(100/4)
chords: chord("<C E7 Am F C G C C C A7 Dm G C G C C>").voicing().s("piano")`;
    expect((await run(kind, LONG, 16)).value).toBe(2);
  });
});

describe("guide-tones `maxMoveSemis` reads one pass, not the jump back to the top (U12.L05)", () => {
  // Am7 D7 G7 Cmaj7 twice over, the line G F♯ F E (7th, 3rd, 7th, 3rd): half steps all the way down. The loop
  // starts again from E to G, three half steps: that is the top of the loop, not a move of the line.
  const LOOP = `setcpm(90/4)
chords: chord("<Am7 D7 G7 C^7>").voicing().s("piano")
mel: note("<g4 f#4 f4 e4>").s("sine")`;
  const rubric = {
    rule: "guide-tones",
    track: "mel",
    harmony: "chords",
    minRatio: 1,
    at: "change",
    maxMoveSemis: 2,
  };
  test("a falling 3rd/7th line passes when the loop plays twice", async () => {
    const out = await run(rubric, LOOP, 8);
    expect(out.ok).toBe(true);
  });
  test("a leap INSIDE the pass still fails and is named", async () => {
    const out = await run(rubric, LOOP.replace("<g4 f#4 f4 e4>", "<g4 c5 f4 e4>"), 8);
    expect(out.ok).toBe(false);
    expect(out.detail).toContain("into bar 2 the line moves 5 half steps (G to C)");
  });
});

describe("bass-line: a chord struck again is no change (U17.L04)", () => {
  // Chords re-struck on beats 1 and 3, the bass root then 5th: every change starts on its root.
  const CODE = `setcpm(100/4)
chords: chord("<C F G C>").voicing().struct("x ~ x ~").s("piano")
bass: n("<[0 4] [3 7] [4 8] [0 4]>").scale("C2:major").s("bass")`;
  test("root then 5th under a re-struck chord is a root on every change", async () => {
    const out = await run(
      { rule: "bass-line", track: "bass", harmony: "chords", roots: { on: "change", minRatio: 0.9 } },
      CODE,
      4,
    );
    expect(out.ok).toBe(true);
    expect(out.detail).toContain("roots on 100%");
  });
  test("a bass that starts each chord on its 3rd still fails", async () => {
    const out = await run(
      { rule: "bass-line", track: "bass", harmony: "chords", roots: { on: "change", minRatio: 0.9 } },
      CODE.replace("<[0 4] [3 7] [4 8] [0 4]>", "<[2 4] [5 7] [6 8] [2 4]>"),
      4,
    );
    expect(out.ok).toBe(false);
  });
});

describe("chord-tones-strong under comping on the off-beats (U15.L05)", () => {
  // The 1920s guitar: chords on beats 2 and 4 only. The tune's beats 1 and 3 are judged against the bar's chord.
  const CODE = `setcpm(120/4)
chords: chord("<C A7 Dm G7>").voicing().struct("~ x ~ x").s("piano")
mel: note("<[e4 d4 g4 f4] [c#4 d4 e4 d4] [f4 e4 a4 g4] [b3 c4 d4 c4]>").s("piano")`;
  const r = {
    rule: "chord-tones-strong",
    minRatio: 0.75,
    melody: "mel",
    harmony: "chords",
    strength: "strong",
  };
  test("strong beats are read against the bar's chord and pass", async () => {
    const out = await run(r, CODE, 4);
    expect(out.ok).toBe(true);
    expect(out.value).toBe(1);
  });
  test("a wrong note on a strong beat is now seen (it fell through before)", async () => {
    const out = await run(r, CODE.replace("[e4 d4 g4 f4]", "[f4 d4 a4 f4]"), 4);
    expect(out.value).toBeLessThan(1);
  });
});

describe("ends-on-degree reads the key in force at the last bar (U17.L01)", () => {
  const LIFT = `setcpm(100/4)
mel: n("<0 2 4 2 4 5 [6 7] 7>").scale("<C4:major!6 G4:major!2>").s("piano")`;
  test("a tune that ends on G after the scale moves to G ends on 1", async () => {
    const out = await run(
      { rule: "ends-on-degree", degrees: ["1"], track: "mel" },
      LIFT.replace("[6 7] 7", "[6 7] 0"),
      8,
    );
    expect(out.ok).toBe(true);
  });
  test("with no key change the declared key stands, as before", async () => {
    const out = await run(
      { rule: "ends-on-degree", degrees: ["1"], track: "mel" },
      `setcpm(100/4)\nmel: n("<0 2 4 4>").scale("C4:major").s("piano")`,
      4,
    );
    expect([out.ok, out.detail]).toEqual([false, "it ends on 5; the brief asks for 1"]);
  });
});

describe("mode: the home chord's share of an arranged piece is out of its own bars (C6)", () => {
  const SHORT = `setcpm(100/4)
const chordsA = chord("<G F G F G F G G>").voicing().s("piano")
const melA = n("<[6 4 2 0] [6 ~ 4 2] [0 2 4 6] [6 4 2 0] [6 4 2 0] [6 ~ 4 2] [0 2 4 6] [0 ~ ~ ~]>").scale("G4:mixolydian").s("piano")
chords: arrange([8, chordsA])
mel: arrange([8, melA])`;
  test("an eight-bar arranged vamp graded over sixteen bars is home in 5 of its 8 bars", async () => {
    const out = await run(
      {
        rule: "mode",
        tonic: "declared",
        mode: "mixolydian",
        anyOf: ["mixolydian", "dorian"],
        requireCharacteristic: true,
      },
      SHORT,
      16,
      null,
    );
    expect(out.ok).toBe(true);
    expect(out.detail).toContain("home in 63% of the bars");
  });
});

describe("a brief with the learner's own tonic raises no key mismatch (C6)", () => {
  const deps = headlessDeps();
  const base = <K extends string>(kind: K, id = "x"): ExBase<K> => ({
    kind,
    id,
    version: 1,
    prompt: "",
    skills: [],
    role: "capstone",
    hints: null,
    tests: [],
  });
  const ctx = (o: Partial<GradeContext> = {}): GradeContext => ({
    exerciseGlobalId: "C6/brief",
    mode: "capstone",
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
  const brief = (rubric: RubricRule[]): ExerciseOf<"compose-brief"> =>
    ({
      ...base("compose-brief", "c6"),
      brief: "",
      rubric,
      code: { starter: "" },
      album: { slot: "C6" },
      review: { tutor: "offer" },
    }) as unknown as ExerciseOf<"compose-brief">;
  // An E Dorian vamp (the notes of D major) that misses the bar count: it fails, never for being "in the wrong key".
  const CODE = `setcpm(92/4)
chords: chord("<Em7 A7>").voicing().s("piano")
mel: n("<[0 2 5 4] [5 4 2 0]>").scale("E4:dorian").s("piano")`;
  const grade = (rubric: RubricRule[], response: ExerciseResponse): Promise<GradeResult> =>
    gradeWith({ exercise: brief(rubric), response, ctx: ctx() }, deps);
  test("mode with tonic declared: no harmony.key-mismatch", async () => {
    const r = await grade(
      [
        rule({ rule: "mode", tonic: "declared", mode: "dorian", requireCharacteristic: true }),
        rule({ rule: "bars", min: 16 }),
      ],
      { code: CODE },
    );
    expect(r.status).toBe("fail");
    expect(r.diagnostics.map((d) => d.id)).not.toContain("harmony.key-mismatch");
  });
  test("a brief in a stated key still says so first", async () => {
    const r = await grade([rule({ rule: "bars", min: 16 })], { code: CODE });
    expect(r.diagnostics.map((d) => d.id)).toContain("harmony.key-mismatch");
  });
});

describe("syncopation and tuplets on `*` read each line on its own (U13)", () => {
  // Chords pushed an eighth before beat 3 (held through it) beside straight hats: the hats must not cut the hold.
  const PUSH = `setcpm(100/4)
drums: s("hh*8, bd ~ ~ ~").gain(.5)
chords: chord("<C F>").voicing().struct("x ~ ~ x@4 ~ ~ ~ ~").s("piano")`;
  test("the pushed chord counts beside the hats", async () => {
    const all = await run({ rule: "syncopation", track: "*", min: 1 }, PUSH, 2);
    const own = await run({ rule: "syncopation", track: "chords", min: 1 }, PUSH, 2);
    expect(own.ok).toBe(true);
    expect(all.ok).toBe(true);
    expect(all.value).toBe(own.value);
  });
  const TRIP = `setcpm(90/4)
drums: s("hh*8").gain(.4)
mel: note("<[c4 [e4 f4 g4] a4 g4]>").s("piano")`;
  test("a triplet in the tune counts beside straight eighths in the hats", async () => {
    const all = await run({ rule: "tuplets", track: "*", min: 1, division: 3 }, TRIP, 1);
    expect([all.ok, all.value]).toEqual([true, 1]);
  });
});

describe("dictation: a code answer keeps its constraints (U17.L04)", () => {
  const deps = headlessDeps();
  const ex = {
    kind: "dictation",
    id: "lift",
    version: 1,
    prompt: "",
    skills: [],
    role: "check",
    hints: null,
    tests: [],
    domain: "melody",
    key: { tonic: "C", mode: "major" },
    stimulus: { src: "code", bars: 4, loop: true, showCode: false, code: "" },
    cue: { context: "none", countInBars: 0, click: false, replays: 6 },
    answer: {
      ui: "code",
      starter: 'setcpm(100/4)\nmel: n("<0 2 4 0>").scale("C4:major").s("piano")',
      constraints: [{ c: "must-not-use", tool: "tb.transpose" }],
    },
    reference: {
      solutions: ['setcpm(100/4)\nmel: n("<0 2 4 0>").scale("<C4:major!2 D4:major!2>").s("piano")'],
      bars: 4,
    },
    matcher: { m: "melody", pitch: "absolute", wPitch: 1, wRhythm: 0, rhythmTol: [1, 16] },
  } as unknown as ExerciseOf<"dictation">;
  const c: GradeContext = {
    exerciseGlobalId: "U17.L04/lift",
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
    lint: { profile: "graded", unlocked: new Set(), allowPreview: true, meter: "4/4", key: null },
  };
  test("the patterned scale passes; the same notes by .transpose() fail on the constraint", async () => {
    const ok = await gradeWith(
      { exercise: ex, response: { code: ex.reference.solutions[0] as string }, ctx: c },
      deps,
    );
    expect(ok.status).toBe("pass");
    const cheat = await gradeWith(
      {
        exercise: ex,
        response: {
          code: 'setcpm(100/4)\nmel: n("<0 2 4 0>").scale("C4:major").transpose("<0!2 2!2>").s("piano")',
        },
        ctx: c,
      },
      deps,
    );
    expect(cheat.status).toBe("fail");
    expect(cheat.diagnostics.map((d) => d.id)).toContain("code.must-not-use");
  });
});

describe("note names on the keyboard follow the chord and the key (U15.L03, U16.L02)", () => {
  test("E7's G♯ is G♯, never A♭; a missing B♭ is written with its sign", () => {
    const e7 = keyboardCheck({ midi: [64, 68, 71, 74] }, [64, 71, 74], "octave-free", "chord", { key: C });
    expect(e7.diagnostics.map((d) => [d.id, d.params])).toEqual([["kb.missing-note", { exp: "G♯" }]]);
    const bb = keyboardCheck({ pcs: [7, 10, 2] }, [7, 2], "octave-free", "chord", {
      key: { tonic: "F", mode: "major" },
    });
    expect(renderFeedback(bb.diagnostics[0] as never)).toBe("B♭ is missing.");
  });
});

describe("a numeral's case, written with its sign (U14.L05)", () => {
  test("♭ii for ♭II reads with signs", () => {
    const r = gradeAnswer(
      { ui: "rn-palette", slots: 1, allow: ["triads"] } as never,
      { rn: ["bII"] } as never,
      { rn: ["bii"] } as never,
      { key: { tonic: "E", mode: "phrygian" } },
    );
    const d = r.diagnostics.find((x) => x.id === "harmony.rn-case");
    expect(d).toBeDefined();
    if (d) expect(renderFeedback(d)).toBe("Chord 1: ♭ii → ♭II. Upper case = major, lower = minor.");
    expect(r.score).toBeLessThan(1);
  });
});

describe("changes are scored by the bar (contracts §6.6, CF.md; d11)", () => {
  const changes: Matcher = {
    m: "harmony",
    level: "rn",
    qualityDepth: "seventh",
    inversion: false,
    harmonicRhythm: "given",
    weights: { bass: 0 },
    wrongQuality: "none",
  };
  const ref = `setcpm(120/4)
chords: chord("<C^7 [Dm7 G7] C^7 [Am7 D7]>").voicing().s("piano")`;
  test("one wrong chord of a two-chord bar costs the whole bar: 3 of 4 bars", async () => {
    const want = await strudel(ref, 4);
    const got = await strudel(ref.replace("[Dm7 G7]", "[Dm7 Gm7]"), 4);
    const m = runMatcher(changes, want, got, { meter: "4/4", key: C, params: {}, bars: 4 } as never);
    expect(m.score).toBeCloseTo(0.75, 5);
    const right = runMatcher(changes, want, await strudel(ref, 4), {
      meter: "4/4",
      key: C,
      params: {},
      bars: 4,
    } as never);
    expect(right.score).toBe(1);
  });
});

describe("a chord struck three times in a bar is one pcset finding (U14.L03)", () => {
  test("the wrong bar is named once, with every stroke's notes marked", async () => {
    const ref = `setcpm(100/4)\nchords: chord("<C F>").voicing().struct("x x x ~").s("rhodes")`;
    const want = await strudel(ref, 2);
    const got = await strudel(ref.replace("<C F>", "<C Fm>"), 2);
    const m = runMatcher({ m: "pcset", perOnset: true, bass: false } as Matcher, want, got, {
      meter: "4/4",
      key: C,
      params: {},
      bars: 2,
    } as never);
    const pcset = m.diagnostics.filter((d) => d.id === "harmony.pcset");
    expect(pcset).toHaveLength(1);
    expect(pcset[0]?.where?.bar).toBe(2);
    // More than the first stroke's notes are marked.
    expect(pcset[0]?.where?.noteIds?.length ?? 0).toBeGreaterThan(3);
  });
});
