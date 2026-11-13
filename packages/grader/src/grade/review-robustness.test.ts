// Regression tests of the Wave 4 adversarial review (review:robustness), grading side. Each is a valid answer the
// builders had not tried, or a wrong answer that looked right; each is now graded right with a message that names
// the fault. Music checked by hand in C major (C2: the loop C G Am F C G, then G C).
//  - a locked tool called through a computed name (`p["voicing"]()`) is still the locked tool;
//  - C2 `progression`: one chord a bar (a second chord inside a bar breaks the loop even when every downbeat
//    follows it); a wrong quality is named with its symbol;
//  - C2 `cadence`: a failed cadence names its two chords ("ii → I: no cadence"), never "ends with none";
//  - a chord track played as a broken chord (`.arp()`, unlocked at U05.L04) is read bar by bar;
//  - an `all` matcher passes only when every member does (X1: a tune in the wrong mode with perfect rhythm);
//  - X1 phrase checks read the learner's melody by role: `melody:` or `tune:` is not "no line".
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExerciseOf, GradeResult, PhraseCheck, RubricRule, SongDef } from "@oak/content-kit";
import { toolbox } from "../../../../content/toolbox.ts";
import { headlessDeps } from "../analyze/__support__/fixtures.ts";
import { lintOak } from "../lint/oak.ts";
import type { GradeContext } from "../types.ts";
import { gradeWith } from "./index.ts";
import { phraseCheckRequest } from "./phrase-check.ts";

setDefaultTimeout(120_000);
const deps = headlessDeps();
const C = { tonic: "C", mode: "major" } as const;

describe("the lint: a locked tool called by a computed name (contracts §3.1 rule 6, §3.3)", () => {
  const unlocked = new Set(
    toolbox.filter((t) => t.unlock.condition === undefined && t.id !== "tb.chord").map((t) => t.id),
  );
  const lint = (code: string) =>
    lintOak(
      `setcpm(90/4)\n${code}`,
      { profile: "graded", unlocked, allowPreview: false, meter: "4/4", key: null },
      toolbox,
    ).diagnostics.map((d) => `${d.id}:${d.severity}`);
  test('p["voicing"]() and p["voi" + "cing"]() are the locked voicing()', () => {
    expect(lint('chords: note("<[c4,e4,g4] [c4,f4,a4]>")["voicing"]()')).toContain("code.locked-tool:error");
    expect(lint('chords: n("0")["chord"]("<C F>")["voi" + "cing"]()')).toContain("code.locked-tool:error");
  });
  test("a method named at run time cannot be checked: an error in a graded step, nothing for a number index", () => {
    expect(lint('const k = "voicing"\nchords: note("c4")[k]()')).toContain(
      "lint.strict.computed-member:error",
    );
    expect(lint('mel: note("c4 e4").fmap((v) => [1, 2][0])')).not.toContain(
      "lint.strict.computed-member:error",
    );
  });
});

// The C2 rubric of contracts §6.6 (content/capstones.ts carries the same rules).
const req = (id: string, body: Record<string, unknown>): RubricRule =>
  ({ id, label: id, required: true, skills: [], ...body }) as unknown as RubricRule;
const C2_RUBRIC: RubricRule[] = [
  req("bars", { rule: "bars", min: 8, max: 8 }),
  req("schema", { rule: "progression", schema: "schema.axis", allowRotation: true, bars: [1, 6] }),
  req("cadence", { rule: "cadence", types: ["PAC", "IAC", "PC"], at: "last" }),
];
const C2 = {
  kind: "compose-brief",
  id: "brief",
  version: 1,
  prompt: "",
  skills: [],
  role: "check",
  hints: null,
  tests: [],
  brief: "Loop, then land.",
  rubric: C2_RUBRIC,
  code: { starter: "" },
  saveAs: "album",
} as unknown as ExerciseOf<"compose-brief">;
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
const MEL =
  'mel: n("<[4 4 2 ~] [4 4 1 ~] [5 5 2 ~] [3 3 0 ~] [4 4 2 ~] [4 4 1 ~] [4 4 1 ~] [0@4]>").scale("C4:major").s("piano")';
const song = (chords: string) => `setcpm(96/4)\nchords: ${chords}\n${MEL}`;
const sym = (s: string) => song(`chord("<${s}>").voicing().s("piano")`);
const row = async (code: string, id: string) => {
  const r: GradeResult = await gradeWith({ exercise: C2, response: { code }, ctx: ctx() }, deps);
  const x = (r.rubric ?? []).find((y) => y.ruleId === id);
  return { ok: x?.ok ?? false, detail: String(x?.diag?.params.detail ?? "") };
};

describe("C2 progression: one chord a bar (contracts §6.6)", () => {
  test("every downbeat follows the loop but each bar holds two chords: fails, naming the bar and both chords", async () => {
    const r = await row(sym("[C F] [G C] [Am G] [F G] [C F] [G C] G C"), "schema");
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("bar 1 has 2 chords (I (C), IV (F)); the loop takes one chord a bar in bars 1–6");
  });
  test("the same chord struck four times a bar is still one chord a bar", async () => {
    expect(
      (await row(sym("C G Am F C G G C").replace(".voicing()", '.struct("x x x x").voicing()'), "schema")).ok,
    ).toBe(true);
  });
  test("A major where the loop wants A minor is named by its symbol", async () => {
    const r = await row(sym("C G A F C G G C"), "schema");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("bar 3 is V/ii (A); the loop wants vi (Am) there");
  });
});

describe("C2 cadence: the message names the chords (U06.L04)", () => {
  test("ii → I is no cadence", async () => {
    const r = await row(sym("C G Am F C G Dm C"), "cadence");
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("bar 8 ends ii → I: no cadence; the brief asks for V → I or IV → I");
  });
  test("V → vi is the deceptive cadence; ♭VII → I is named, not passed", async () => {
    expect((await row(sym("C G Am F C G G Am"), "cadence")).detail).toBe(
      "bar 8 ends V → vi: a deceptive cadence, V to vi; the brief asks for V → I or IV → I",
    );
    const r = await row(sym("C G Am F C G Bb C"), "cadence");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("♭VII → I");
  });
  test("V7 → I and IV → I still pass; a hand-stacked cluster in bar 8 is no cadence, never read as bar 7's", async () => {
    expect((await row(sym("C G Am F C G G7 C"), "cadence")).ok).toBe(true);
    expect((await row(sym("F C G Am F C F C"), "cadence")).ok).toBe(true);
    const cluster = await row(
      song(
        'n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,1,2]>").scale("C3:major").s("piano")',
      ),
      "cadence",
    );
    expect(cluster.ok).toBe(false);
    expect(cluster.detail).toContain("no cadence");
  });
});

describe("a chord track played as a broken chord (tb.arp, U05.L04)", () => {
  const ARP = song(
    'n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]>").scale("C3:major").arp("0 1 2 1").s("piano")',
  );
  test("hand-stacked triads arpeggiated: the loop and the landing are read", async () => {
    expect((await row(ARP, "schema")).ok).toBe(true);
    expect((await row(ARP, "cadence")).ok).toBe(true);
  });
  test("an arpeggio of the wrong chord is still wrong", async () => {
    const r = await row(ARP.replace("[5,7,9] [3,5,7] [0,2,4]", "[3,5,7] [3,5,7] [0,2,4]"), "schema");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("bar 3 is IV (F)");
  });
});

// A synthetic folk tune with a one-beat pickup, two 4-bar phrases (the shape of the X1 songs).
const TUNE = "<[~ ~ ~ 4] [0 2 4 ~] [4 2 4 5] [4 ~ 2 ~] [~ ~ ~ 4] [2 2 4 ~] [5 4 2 1] [0 ~ ~ ~] [~ ~ ~ ~]>";
const SONG = {
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
    layers: { melody: `n("${TUNE}").scale("C4:major").s("piano")` },
    phrases: [
      [1, 4],
      [5, 8],
    ],
  },
} as unknown as SongDef;
// X1's melody check as content/capstones.ts writes it: the melody matcher and the rhythm matcher, label `mel`.
const PHRASE: PhraseCheck = {
  id: "phrase-2",
  phrase: 2,
  layer: "melody",
  pass: 0.85,
  matcher: {
    m: "all",
    of: [
      { m: "melody", pitch: "key-relative", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 16], track: "mel" },
      {
        m: "rhythm",
        tol: [1, 16],
        durations: false,
        perRole: false,
        displacementCredit: 0.5,
        tracks: ["mel"],
      },
    ],
  },
};
const check = (code: string) =>
  gradeWith(
    phraseCheckRequest({
      capstoneId: "X1",
      check: PHRASE,
      song: SONG,
      code,
      ctx: {
        params: {},
        attemptNo: 1,
        firstAttempt: true,
        rung: 0,
        tutorHints: 0,
        extraReplays: 0,
        lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
      },
    }),
    deps,
  );

describe("X1 phrase checks", () => {
  test("the tune in C minor (every 3 a ♭3) with perfect rhythm: the melody member fails, so the check does", async () => {
    const r = await check(`setcpm(90/4)\nmel: n("${TUNE}").scale("C4:minor").s("piano")`);
    expect(r.status).toBe("fail");
    expect(r.score).toBeLessThan(0.85);
    expect(r.diagnostics.map((d) => d.id)).toContain("melody.wrong-degree");
  });
  test("one wrong note in the phrase still passes, as the 0.85 mark intends", async () => {
    const r = await check(
      `setcpm(90/4)\nmel: n("${TUNE.replace("[5 4 2 1]", "[5 4 3 1]")}").scale("C4:major").s("piano")`,
    );
    expect(r.status).toBe("pass");
  });
  test("a tune labelled melody:, tune: or not at all is the learner's melody, not 'no line'", async () => {
    for (const label of ["melody: ", "tune: ", ""]) {
      const r = await check(`setcpm(90/4)\n${label}n("${TUNE}").scale("D4:major").s("piano")`);
      expect({ label, status: r.status }).toEqual({ label, status: "pass" });
    }
  });
});
