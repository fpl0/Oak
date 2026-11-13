// Capstone grading for Wave 4 (contracts §6.4, §6.6): C2 "Four-Chord Song" in capstone mode in more than one
// flavour, with known-wrong variants, and X1 "Folk Transcription" phrase checks against a song's answer key
// (key-relative melody per phrase at 0.85, chords staged bass first at 0.80, meter/key/pickup given).
// Music checked by hand in C major: the loop C G Am F C G, then G C (a V–I with the melody on 1, a PAC).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExBase, ExerciseOf, GradeResult, PhraseCheck, RubricRule, SongDef } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { headlessDeps } from "../analyze/__support__/fixtures.ts";
import type { GradeContext } from "../types.ts";
import { gradeWith } from "./index.ts";
import { capstoneLength } from "./ladder.ts";
import { phraseCheckPassed, phraseCheckRequest, phraseWindow } from "./phrase-check.ts";

setDefaultTimeout(60_000);
const deps = headlessDeps();
const C = { tonic: "C", mode: "major" } as const;
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
  exerciseGlobalId: "C2/brief",
  mode: "capstone",
  key: C,
  meter: "4/4",
  bpm: 96,
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0,
  tutorHints: 0,
  extraReplays: 0,
  lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
  ...o,
});

// The C2 rubric of contracts §6.6 (content/capstones.ts carries the same rules; progression with `bars`).
const req = (id: string, body: Record<string, unknown>): RubricRule =>
  ({ id, label: id, required: true, skills: [], ...body }) as unknown as RubricRule;
const C2_RUBRIC: RubricRule[] = [
  req("bars", { rule: "bars", min: 8, max: 8 }),
  req("roles", { rule: "tracks", min: 2, roles: ["chords", "melody"] }),
  req("schema", { rule: "progression", schema: "schema.axis", allowRotation: true, bars: [1, 6] }),
  req("cadence", { rule: "cadence", types: ["PAC", "IAC", "PC"], at: "last" }),
  req("chord-tones", {
    rule: "chord-tones-strong",
    minRatio: 0.6,
    melody: "@melody",
    harmony: "@chords",
    strength: "strong",
  }),
  req("range", { rule: "range", track: "@melody", maxSpan: 19 }),
  req("motif", { rule: "motif-reuse", track: "@melody", minRatio: 0.5 }),
];
const C2: ExerciseOf<"compose-brief"> = {
  ...base("compose-brief", "brief"),
  brief: "Loop, then land.",
  rubric: C2_RUBRIC,
  code: { starter: "" },
  saveAs: "album",
} as unknown as ExerciseOf<"compose-brief">;
const grade = (code: string): Promise<GradeResult> =>
  gradeWith({ exercise: C2, response: { code }, ctx: ctx() }, deps);
const failing = (r: GradeResult): string[] => (r.rubric ?? []).filter((x) => !x.ok).map((x) => x.ruleId);

const MEL =
  'mel: n("<[4 4 2 ~] [4 4 1 ~] [5 5 2 ~] [3 3 0 ~] [4 4 2 ~] [4 4 1 ~] [4 4 1 ~] [0@4]>").scale("C4:major").s("piano")';
const POP = `setcpm(96/4)
chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]>").scale("C3:major").s("piano")
${MEL}`;
const JAZZ = `setcpm(88/4)
chords: chord("<C^7 G7 Am7 F^7 C^7 G7 G7 C^7>").voicing().s("piano")
bass: n("<0 4 5 3 0 4 4 0>").scale("C2:major").s("piano")
${MEL}`;

describe("C2 Four-Chord Song in capstone mode", () => {
  test("pop flavour (hand-stacked triads): every required rule met", async () => {
    const r = await grade(POP);
    expect(failing(r)).toEqual([]);
    expect(r.status).toBe("pass");
    expect(r.mode).toBe("capstone");
  });
  test("jazz-soul flavour (sevenths through chord().voicing(), a root bass): the triad core passes", async () => {
    const r = await grade(JAZZ);
    expect(failing(r)).toEqual([]);
  });
  test("any rotation of the loop in bars 1–6 (Am F C G Am F, then G C)", async () => {
    const rotated = POP.replace(
      "<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8]",
      "<[5,7,9] [3,5,7] [0,2,4] [4,6,8] [5,7,9] [3,5,7]",
    );
    const r = await grade(rotated);
    expect(failing(r)).not.toContain("schema");
  });
  test("bar 3 is IV where the loop wants vi: the schema rule fails and says so", async () => {
    const r = await grade(POP.replace("[4,6,8] [5,7,9] [3,5,7] [0,2,4]", "[4,6,8] [3,5,7] [3,5,7] [0,2,4]"));
    expect(failing(r)).toContain("schema");
    const row = (r.rubric ?? []).find((x) => x.ruleId === "schema");
    expect(String(row?.diag?.params.detail)).toContain("bar 3 is IV (F); the loop wants vi (Am) there");
  });
  test("no landing (bars 7–8 stay on V): the cadence rule fails", async () => {
    const r = await grade(POP.replace("[4,6,8] [4,6,8] [0,2,4]>", "[4,6,8] [0,2,4] [4,6,8]>"));
    expect(failing(r)).toContain("cadence");
  });
  test("a melody that never repeats its bar-1 idea fails motif reuse", async () => {
    const r = await grade(
      POP.replace(
        MEL,
        'mel: n("<[4 2 0 ~] [1 2 4 6] [7 5 4 2] [0 1 3 5] [6 4 2 0] [1 3 5 4] [2 6 5 1] [0@4]>").scale("C4:major").s("piano")',
      ),
    );
    expect(failing(r)).toContain("motif");
  });
  test("length comes from the code's structure: an arranged 8-bar song, never played", () => {
    const L = capstoneLength("mel: arrange([4, a], [4, b])", [], 96 / 60 / 4);
    expect(L.totalBars).toBe(8);
    expect(L.durationSec).toBeCloseTo(20, 5);
  });
});

// A synthetic folk tune with a one-beat pickup: 8 bars after the pickup, two 4-bar phrases (the shape of
// Red River Valley; the real answer keys are author:songs').
const TUNE = "<[~ ~ ~ 4] [0 2 4 ~] [4 2 4 5] [4 ~ 2 ~] [~ ~ ~ 4] [1 3 4 ~] [4 3 2 1] [0 ~ ~ ~] [~ ~ ~ ~]>";
const SONG: SongDef = {
  id: "song.test-tune",
  title: "Test tune",
  year: "trad",
  status: "trad",
  provenance: { source: "test", year: 1900 },
  verifiedBy: "test",
  key: C,
  meter: "4/4",
  bpm: 90,
  pickup: { units: [1, 1] },
  form: "two phrases",
  answerKey: {
    bars: 9,
    code: "",
    layers: {
      melody: `n("${TUNE}").scale("C4:major").s("piano")`,
      bass: 'n("<~ 0 4 0 [0 ~ ~ 4] 4 4 0 ~>").scale("C2:major").s("piano")',
      chords:
        'n("<~ [0,2,4] [4,6,8] [0,2,4] [0,2,4] [4,6,8] [4,6,8] [0,2,4] ~>").scale("C3:major").s("piano")',
    },
    phrases: [
      [1, 4],
      [5, 8],
    ],
  },
} as SongDef;
const melody: PhraseCheck = {
  id: "phrase-1",
  phrase: 1,
  layer: "melody",
  pass: 0.85,
  matcher: { m: "melody", pitch: "key-relative", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 16] },
  given: { meter: true, key: true, tonic: true, pickup: true },
};
const chordsCheck: PhraseCheck = {
  id: "chords",
  phrase: [1, 2],
  layer: "chords",
  pass: 0.8,
  stages: ["bass", "quality", "rn"],
  matcher: { m: "harmony", level: "rn", qualityDepth: "triad", inversion: false, harmonicRhythm: "given" },
};
const rctx = {
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
const check = (c: PhraseCheck, code: string, stage?: "bass" | "quality" | "rn") =>
  gradeWith(
    phraseCheckRequest({
      capstoneId: "X1",
      check: c,
      song: SONG,
      code,
      ...(stage ? { stage } : {}),
      ctx: rctx,
    }),
    deps,
  );

describe("X1 phrase checks", () => {
  test("a phrase begins with its pickup and ends where the next phrase's pickup starts", () => {
    const w1 = phraseWindow(SONG, 1);
    expect(R.str(w1.from)).toBe("3/4");
    expect(R.str(w1.to)).toBe("19/4");
    const w2 = phraseWindow(SONG, 2);
    expect(R.str(w2.from)).toBe("19/4");
    expect(R.str(w2.to)).toBe("35/4");
  });
  test("phrase 1 right and phrase 2 not yet written: phrase 1 passes, phrase 2 fails", async () => {
    const draft = `setcpm(90/4)\nmel: n("<[~ ~ ~ 4] [0 2 4 ~] [4 2 4 5] [4 ~ 2 ~] [~ ~ ~ ~]>").scale("C4:major").s("piano")`;
    const r1 = await check(melody, draft);
    expect(r1.status).toBe("pass");
    expect(phraseCheckPassed(r1)).toBe(true);
    expect(r1.mode).toBe("capstone");
    const r2 = await check({ ...melody, id: "phrase-2", phrase: 2 }, draft);
    expect(r2.status).toBe("fail");
  });
  test("key-relative: the whole tune written in D passes; a wrong note in bar 2 is named", async () => {
    const inD = `setcpm(90/4)\nmel: n("${TUNE}").scale("D4:major").s("piano")`;
    expect((await check(melody, inD)).status).toBe("pass");
    const wrong = `setcpm(90/4)\nmel: n("${TUNE.replace("[4 2 4 5]", "[4 2 4 6]")}").scale("C4:major").s("piano")`;
    const r = await check(melody, wrong);
    expect(r.score).toBeLessThan(1);
    // A revealed check never counts.
    const revealed = await gradeWith(
      phraseCheckRequest({
        capstoneId: "X1",
        check: melody,
        song: SONG,
        code: inD,
        ctx: { ...rctx, rung: 4 },
      }),
      deps,
    );
    expect(phraseCheckPassed(revealed)).toBe(false);
  });
  test("chords bass first, then quality, then numerals, each at 0.80", async () => {
    const bass = `setcpm(90/4)\nbass: ${SONG.answerKey.layers.bass}`;
    const both = `${bass}\nchords: ${SONG.answerKey.layers.chords}`;
    expect((await check(chordsCheck, bass, "bass")).status).toBe("pass");
    expect((await check(chordsCheck, both, "quality")).status).toBe("pass");
    expect((await check(chordsCheck, both, "rn")).status).toBe("pass");
    // One bar of eight wrong is still above 0.80; IV and vi where I and V are is not.
    const oneBar = both.replace("[0,2,4] [4,6,8] [0,2,4] [0,2,4]", "[0,2,4] [3,5,7] [0,2,4] [0,2,4]");
    expect((await check(chordsCheck, oneBar, "rn")).status).toBe("pass");
    const wrong = both.replace(
      "[0,2,4] [4,6,8] [0,2,4] [0,2,4] [4,6,8] [4,6,8] [0,2,4]",
      "[3,5,7] [5,7,9] [3,5,7] [3,5,7] [5,7,9] [5,7,9] [3,5,7]",
    );
    const r = await check(chordsCheck, wrong, "rn");
    expect(r.status).toBe("fail");
  });
});
