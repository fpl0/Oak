// Ladder L8 / CF-T seam (docs/design/wave6.md §3.2): the stage order and marks, the form map graded by shape, and
// the code stages as phrase checks. The song here is a made-up 32-bar AABA skeleton, not a repertoire entry.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Exercise, SongDef } from "@oak/content-kit";
import { headlessDeps } from "../analyze/__support__/fixtures.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import type { GradeContext } from "../types.ts";
import { gradeWith } from "./index.ts";
import {
  formMapKey,
  gradeFormMap,
  nextStandardStage,
  STANDARD_LADDER_MATCHERS,
  STANDARD_LADDER_PASS,
  STANDARD_LADDER_STAGES,
  type StandardCodeStage,
  songFormOf,
  standardLadderCheck,
  standardLadderPassed,
  standardLadderRequest,
} from "./standard-ladder.ts";

const SONG = {
  id: "song.test-standard",
  title: "Test Standard",
  year: 1925,
  status: "US-PD",
  provenance: { source: "test", year: 1925 },
  verifiedBy: "test",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 120,
  form: "AABA",
  answerKey: {
    bars: 32,
    code: "",
    layers: {
      bass: 'note("<c2 e2 a2 d2>").s("sawtooth")',
      chords: 'chord("<C E7 A7 D7>").voicing()',
      melody: 'note("<e4 g#4 c#5 f#4>").s("piano")',
    },
    phrases: [
      [1, 8],
      [9, 16],
      [17, 24],
      [25, 32],
    ],
    sections: [
      { label: "A", bars: [1, 8] },
      { label: "A", bars: [9, 16] },
      { label: "B", bars: [17, 24] },
      { label: "A", bars: [25, 32] },
    ],
  },
} as unknown as SongDef;

describe("stages", () => {
  test("form map, then bass, then changes, then melody, with CF-T's marks", () => {
    expect(STANDARD_LADDER_STAGES).toEqual(["form", "bass", "changes", "melody"]);
    expect(STANDARD_LADDER_PASS).toEqual({ form: 1, bass: 0.9, changes: 0.85, melody: 0.9 });
    expect(nextStandardStage([])).toBe("form");
    expect(nextStandardStage(["form", "bass"])).toBe("changes");
    expect(nextStandardStage(["form", "bass", "changes", "melody"])).toBeNull();
  });
  test("the changes read sevenths and give a wrong quality no credit (d11)", () => {
    expect(STANDARD_LADDER_MATCHERS.changes).toMatchObject({
      m: "harmony",
      level: "rn",
      qualityDepth: "seventh",
      wrongQuality: "none",
    });
  });
  test("a code stage is a phrase check over the whole tune, graded in capstone mode", () => {
    const check = standardLadderCheck({ itemId: "lad.8.test", level: 8, stage: "changes" }, SONG);
    expect(check).toMatchObject({ id: "lad.8.test.changes", phrase: [1, 4], layer: "chords", pass: 0.85 });
    const req = standardLadderRequest({
      item: { itemId: "lad.8.test", level: 8, stage: "melody" },
      song: SONG,
      code: 'mel: note("e4")',
      ctx: {} as never,
    });
    expect(req.ctx.mode).toBe("capstone");
    expect(req.ctx.exerciseGlobalId).toBe("ladder/lad.8.test");
  });
});

describe("the form map", () => {
  test("the key of a song", () => {
    expect(formMapKey(SONG)).toEqual({ labels: ["A", "A", "B", "A"], bars: [1, 9, 17, 25], letters: "AABA" });
    expect(formMapKey({ answerKey: { bars: 8, code: "", layers: {} } })).toBeNull();
  });
  test("right starts and the right shape pass, whatever the labels are called", () => {
    for (const sections of [
      ["A", "A", "B", "A"],
      ["verse", "verse", "bridge", "verse"],
      ["X", "X", "Y", "X"],
    ]) {
      const r = gradeFormMap({ sections, bars: [1, 9, 17, 25] }, SONG);
      expect([r.score, r.passed, r.got]).toEqual([1, true, "AABA"]);
    }
  });
  test("a wrong label fails that section only", () => {
    const r = gradeFormMap({ sections: ["A", "B", "B", "A"], bars: [1, 9, 17, 25] }, SONG);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0.75);
    expect(r.sections.map((s) => s.ok)).toEqual([true, false, true, true]);
    expect([r.expected, r.got]).toEqual(["AABA", "ABBA"]);
  });
  test("a missing boundary costs its section and does not rename the later ones", () => {
    // The learner heard the two A sections as one: three sections, the bridge and the last A in place.
    const r = gradeFormMap({ sections: ["A", "B", "A"], bars: [1, 17, 25] }, SONG);
    expect(r.sections.map((s) => [s.startOk, s.labelOk])).toEqual([
      [true, true],
      [false, false],
      [true, true],
      [true, true],
    ]);
    expect(r.score).toBe(0.75);
    expect(r.passed).toBe(false);
  });
  test("a boundary where the tune has none is reported and lowers the score", () => {
    const r = gradeFormMap({ sections: ["A", "A", "A", "B", "A"], bars: [1, 5, 9, 17, 25] }, SONG);
    expect(r.extra).toEqual([5]);
    expect(r.score).toBe(0.8);
    expect(r.passed).toBe(false);
  });
  test("a song without sections cannot be asked", () => {
    expect(() =>
      gradeFormMap({ sections: [], bars: [] }, { answerKey: { bars: 8, code: "", layers: {} } }),
    ).toThrow();
  });
});

// --- Wave 6 Build: the code stages graded on real Strudel output, and CF-T.S4's arrangement -------------------
describe("L8 / CF-T: the code stages, graded (contracts §6.6: bass ≥ 0.90, changes ≥ 0.85 per bar, melody ≥ 0.90)", () => {
  setDefaultTimeout(60_000);
  const deps = headlessDeps();
  const ctx = {
    params: {},
    attemptNo: 1,
    firstAttempt: true,
    rung: 0 as const,
    tutorHints: 0,
    extraReplays: 0,
    lint: {
      profile: "graded" as const,
      unlocked: new Set<never>(),
      allowPreview: false,
      meter: "4/4" as const,
      key: null,
    },
  };
  const grade = (stage: StandardCodeStage, code: string, phrase?: number | [number, number]) =>
    gradeWith(
      standardLadderRequest({
        item: { itemId: "lad.8.test", level: 8, stage, ...(phrase !== undefined ? { phrase } : {}) },
        song: SONG,
        code: `setcpm(120/4)\n${code}`,
        ctx,
      }),
      deps,
    );
  const BASS = 'bass: note("<c2 e2 a2 d2>").s("sawtooth")';
  const CHORDS = 'chords: chord("<C E7 A7 D7>").voicing()';
  const MEL = 'mel: note("<e4 g#4 c#5 f#4>").s("piano")';
  test("the answer key passes every stage, in capstone mode and in the recording's key", async () => {
    for (const [stage, code] of [
      ["bass", BASS],
      ["changes", CHORDS],
      ["melody", MEL],
    ] as const) {
      const r = await grade(stage, code);
      expect([stage, r.mode, r.score, standardLadderPassed(stage, r)]).toEqual([stage, "capstone", 1, true]);
    }
  });
  test("changes: plain triads for the three dominants earn nothing for their bars (d11), named from bar 2", async () => {
    const r = await grade("changes", 'chords: chord("<C E A D>").voicing()');
    expect(standardLadderPassed("changes", r)).toBe(false);
    expect(r.score).toBeCloseTo(0.25, 6);
    const first = (r.diagnostics ?? []).find((d) => d.id === "harmony.rn-quality");
    expect(first?.where?.bar).toBe(2);
    expect(renderFeedback(first as NonNullable<typeof first>)).toBe(
      "Chord 2: right degree, but V7/vi is dominant 7th, not major (V/vi).",
    );
  });
  test("changes ≥ 0.85 per bar: four wrong bars in thirty-two pass (28/32), five do not", async () => {
    const bars = (wrong: number) =>
      Array.from({ length: 32 }, (_, i) =>
        i % 4 === 1 ? (i < wrong * 4 ? "Em7" : "E7") : ["C", "", "A7", "D7"][i % 4],
      );
    const four = await grade("changes", `chords: chord("<${bars(4).join(" ")}>").voicing()`);
    expect(four.score).toBeCloseTo(28 / 32, 6);
    expect(standardLadderPassed("changes", four)).toBe(true);
    const five = await grade("changes", `chords: chord("<${bars(5).join(" ")}>").voicing()`);
    expect(five.score).toBeCloseTo(27 / 32, 6);
    expect(standardLadderPassed("changes", five)).toBe(false);
    // A minor chord for a dominant: named as such, at the first such bar.
    expect((five.diagnostics ?? []).find((d) => d.where?.bar === 2)?.id).toBe("harmony.rn");
  });
  test("melody: at 0.90, in the recording's key (d12)", async () => {
    const moved = await grade("melody", 'mel: note("<f#4 a#4 d#5 g#4>").s("piano")');
    expect(standardLadderPassed("melody", moved)).toBe(false);
    expect((moved.diagnostics ?? []).map((d) => renderFeedback(d))).toContain(
      "Right tune, but in D major. This step wants it as it plays, in C major: move every note 2 half steps down.",
    );
    // One wrong note in four bars of a 32-bar tune: 31/32 of the pitches.
    const slip = await grade(
      "melody",
      'mel: note("<e4 g#4 c#5 f#4>").s("piano").when("<1 0!31>", x => x.add(note(1)))',
    );
    expect(slip.score).toBeGreaterThanOrEqual(0.9);
    expect(standardLadderPassed("melody", slip)).toBe(true);
  });
  test("one section at a time: a check on the bridge reads bars 17–24 only", async () => {
    const check = standardLadderCheck({ itemId: "lad.8.test", level: 8, stage: "changes", phrase: 3 }, SONG);
    expect(check.phrase).toBe(3);
    // Wrong everywhere but in the bridge: the bridge's check passes; the whole tune's does not.
    const draft = 'chords: chord("<F!16 C E7 A7 D7 C E7 A7 D7 F!8>").voicing()';
    expect(standardLadderPassed("changes", await grade("changes", draft, 3))).toBe(true);
    expect(standardLadderPassed("changes", await grade("changes", draft))).toBe(false);
  });
  test("bass: a line that never leaves the tonic fails", async () => {
    const r = await grade("bass", 'bass: note("c2").s("sawtooth")');
    expect(standardLadderPassed("bass", r)).toBe(false);
  });
});

describe("CF-T.S4: the arrangement keeps the song's sections (`form` with `@song`)", () => {
  setDefaultTimeout(60_000);
  const deps = headlessDeps();
  const rubric = [
    {
      id: "form",
      label: "The song's form",
      required: true,
      skills: [],
      rule: "form",
      pattern: "@song",
      extra: ["intro", "outro"],
    },
  ];
  const exercise = {
    kind: "compose-brief",
    id: "arrange",
    version: 1,
    prompt: "",
    skills: [],
    role: "check",
    hints: null,
    tests: [],
    brief: "",
    rubric,
    code: { starter: "" },
    saveAs: "album",
  } as unknown as Exercise;
  const gctx = (songForm?: ReturnType<typeof songFormOf>): GradeContext => ({
    exerciseGlobalId: "CF-T/arrange",
    mode: "capstone",
    key: { tonic: "C", mode: "major" },
    meter: "4/4",
    bpm: 120,
    params: {},
    attemptNo: 1,
    firstAttempt: true,
    rung: 0,
    tutorHints: 0,
    extraReplays: 0,
    lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
    ...(songForm ? { songForm } : {}),
  });
  const arrangement = (sections: string) => `setcpm(120/4)
const chordsIntro = chord("<C G7>").voicing()
const chordsA = chord("<C E7 A7 D7>").voicing()
const chordsB = chord("<E7 A7 D7 G7>").voicing()
chords: arrange(${sections}).s("piano")`;
  test("the song's form as the rule reads it", () => {
    expect(songFormOf(SONG)).toEqual([
      { label: "A", bars: 8 },
      { label: "A", bars: 8 },
      { label: "B", bars: 8 },
      { label: "A", bars: 8 },
    ]);
    expect(songFormOf({ answerKey: { bars: 8, code: "", layers: {} } })).toBeNull();
  });
  test("A A B A with an intro passes; a missing bridge says so", async () => {
    const full = "[4, chordsIntro], [8, chordsA], [8, chordsA], [8, chordsB], [8, chordsA]";
    const ok = await gradeWith(
      { exercise, response: { code: arrangement(full) }, ctx: gctx(songFormOf(SONG)) },
      deps,
    );
    expect(ok.status).toBe("pass");
    const short = "[4, chordsIntro], [8, chordsA], [8, chordsA], [8, chordsA]";
    const r = await gradeWith(
      { exercise, response: { code: arrangement(short) }, ctx: gctx(songFormOf(SONG)) },
      deps,
    );
    expect(r.status).toBe("fail");
    expect(r.rubric?.[0]?.diag?.params.detail).toBe(
      "your arrangement has 3 of the song's 4 sections (A A A); the song goes A A B A",
    );
  });
  test("without the song the line cannot be checked, and says so instead of passing", async () => {
    const full = "[8, chordsA], [8, chordsA], [8, chordsB], [8, chordsA]";
    const r = await gradeWith({ exercise, response: { code: arrangement(full) }, ctx: gctx() }, deps);
    expect(r.status).toBe("fail");
    expect((r.diagnostics ?? []).map((d) => d.id)).toContain("rubric.unknown");
  });
});
