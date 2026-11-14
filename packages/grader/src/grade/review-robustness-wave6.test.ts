// Regression tests of the Wave 6 adversarial review (review:robustness), grading side: valid answers the builders
// had not tried and wrong answers that look right, each graded right with a message that names the fault. Real
// Strudel 1.2.6 output; the music checked by hand and with `bun run theory` (in C: V7/vi = E7 → Am, V/V = D → G,
// V7/ii = A7 → Dm; ♭VI = A♭; in A minor the Picardy I is A major; D Dorian's colour note is B).
//  - key-change: a lift written with `.transpose()` after `.scale()` (the lint's warning, contracts §6.8 item 3) is
//    read by ear, not as "+0"; a lift that starts two bars into the last chorus is named for that, not as "another
//    melody", and its six bars are counted, not the section's eight;
//  - tuplets: swung eighths (`.swingBy(1/3, 4)`) are long–short eighths, not triplets (U13.L05); a triplet inside
//    a swung line still counts; the views the tutor reads agree;
//  - pinned as right: a deceptive applied chord, V/V that goes home, a chain of dominants, a hand-voiced V7/V, an
//    applied chord only in a muted track, the Picardy I as a borrowed chord, Dorian with no 6th sounded.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExerciseOf, GradeResult, KeySpec, RubricRule } from "@oak/content-kit";
import { CORE_DEVICES } from "@oak/content-kit";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { swungTracks } from "../analyze/swing.ts";
import { rhythmView } from "../analyze/wave6-views.ts";
import type { GradeContext } from "../types.ts";
import { gradeWith } from "./index.ts";

setDefaultTimeout(120_000);
const deps = headlessDeps();
const req = (id: string, body: Record<string, unknown>): RubricRule =>
  ({ id, label: id, required: true, skills: [], ...body }) as unknown as RubricRule;
const brief = (rubric: RubricRule[], key: KeySpec | null): ExerciseOf<"compose-brief"> =>
  ({
    kind: "compose-brief",
    id: "brief",
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
    ...(key ? { key } : {}),
  }) as unknown as ExerciseOf<"compose-brief">;
const C: KeySpec = { tonic: "C", mode: "major" };
// A null key is a brief that names none (the tuplet and mode cases): the pipeline reads the piece's own.
const ctx = (key: KeySpec | null): GradeContext => ({
  exerciseGlobalId: "C/brief",
  mode: "capstone",
  key: key as KeySpec,
  meter: "4/4",
  bpm: 100,
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0,
  tutorHints: 0,
  extraReplays: 0,
  lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
});
const grade = (rubric: RubricRule[], code: string, key: KeySpec | null = C) =>
  gradeWith({ exercise: brief(rubric, key), response: { code }, ctx: ctx(key) }, deps);
const rule = (r: GradeResult, id: string) => {
  const x = (r.rubric ?? []).find((y) => y.ruleId === id);
  return { ok: x?.ok, detail: String(x?.diag?.params.detail ?? "") };
};
const devices = (r: GradeResult) => [...new Set((r.analysis?.deviceList ?? []).map((d) => d.device))];

// --- key-change (C7) -------------------------------------------------------------------------------------------
const LIFT = req("lift", {
  rule: "key-change",
  at: "last",
  semitones: [1, 2],
  minBarsAfter: 8,
  sameMelody: true,
});
const song = (scale: string, after = "", chorus2 = "<G A D Bm G A G D>") => `setcpm(100/4)
const chordsVerse = chord("<C Am F G C Am F G>").voicing()
const chordsChorus = chord("<F G C Am F G F C>").voicing()
const chordsChorus2 = chord("${chorus2}").voicing()
const melVerse = n("<[0 2 4 2] [4 2 1 ~] [1 3 5 3] [4 ~ ~ ~]>")
const melChorus = n("<[7 6 4 2] [4 ~ 2 ~] [4 5 7 5] [4 ~ ~ ~] [7 6 4 2] [4 ~ 2 ~] [4 ~ 3 ~] [2 ~ ~ ~]>")
chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus2]).s("piano")
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus]).scale("${scale}")${after}.s("piano")`;

describe("key-change: what the key plan says, read the way contracts §6.8 reads it", () => {
  test("the patterned .scale() lift passes, a modulation of eight bars", async () => {
    const r = await grade([LIFT], song("<C4:major!24 D4:major!8>"));
    expect(rule(r, "lift").ok).toBe(true);
    expect(r.analysis?.deviceList).toEqual([
      { device: "modulation", bar: 25, bars: 8, text: "modulation to D major bar 25" },
    ]);
  });
  test("a lift by .transpose() after .scale() is read by ear: +2, the same tune, and no false applied chord", async () => {
    // Before: "C major → C major is +0 …; the melody of chorus2 isn't the chorus melody" (the stale scaleCtx was
    // trusted), and the lifted chorus's A → D was counted as a secondary dominant of C.
    const r = await grade([LIFT], song("C4:major", '.transpose("<0!24 2!8>")'));
    expect(rule(r, "lift")).toEqual({ ok: true, detail: "" });
    expect(devices(r)).toEqual(["modulation"]);
  });
  test("a lift two bars into the last chorus is named for that, with the six bars it lasts", async () => {
    const r = await grade([LIFT], song("<C4:major!26 D4:major!6>"));
    expect(rule(r, "lift")).toEqual({
      ok: false,
      detail:
        "the key changes at bar 27, 2 bars into chorus2 (bar 25): change it where the section starts; the new key lasts 6 bars, at least 8",
    });
  });
});

// --- tuplets (U13.L05) -----------------------------------------------------------------------------------------
const TRIP = req("trip", { rule: "tuplets", track: "drums", division: 3, min: 1 });
describe("tuplets: swing is not a triplet", () => {
  test("swung eighths have no triplet, and the message says how to write one", async () => {
    const r = await grade([TRIP], 'setcpm(100/4)\ndrums: s("bd ~ sd ~, hh*8").swingBy(1/3, 4)', null);
    expect(rule(r, "trip")).toEqual({
      ok: false,
      detail: "no triplet yet: cut a beat into three equal notes, `[x x x]` inside one beat or `.ply(3)`",
    });
    const swing = await grade([TRIP], 'setcpm(100/4)\ndrums: s("bd ~ sd ~, hh*8").swing(4)', null);
    expect(rule(swing, "trip").ok).toBe(false);
  });
  test("a triplet inside a swung line still counts; a written shuffle is a written triplet", async () => {
    const inside = await grade(
      [TRIP],
      'setcpm(100/4)\ndrums: s("bd ~ sd ~, [hh hh] [hh hh] [hh hh hh] [hh hh]").swingBy(1/3, 4)',
      null,
    );
    expect(rule(inside, "trip")).toEqual({ ok: true, detail: "" });
    const shuffle = await grade([TRIP], 'setcpm(100/4)\ndrums: s("bd ~ sd ~, [hh@2 hh]*4")', null);
    expect(rule(shuffle, "trip").ok).toBe(true);
  });
  test("the rhythm view the tutor reads agrees: a swung line is binary, with no tuplets", async () => {
    const code = 'setcpm(100/4)\ndrums: s("hh*8").swingBy(1/3, 4)';
    const n = await strudel(code, 2);
    const v = rhythmView(n, { meter: "4/4", bars: 2, code });
    expect(v.tracks.map((t) => [t.tuplets.length, t.feel])).toEqual([[0, "binary"]]);
    expect([...swungTracks(code)]).toEqual([["drums", { x: [1, 3], slot: [1, 4] }]]);
    expect(swungTracks('drums: s("hh*8").swingBy("<0 .1>", 4)').size).toBe(0);
  });
});

// --- applied and borrowed chords, devices: pinned as right -------------------------------------------------------
const SEC = req("sec", {
  rule: "contains-rn",
  rn: [],
  kind: ["secondary-dominant"],
  min: 1,
  mustResolve: true,
});
const BOR = req("bor", { rule: "contains-rn", rn: [], kind: ["borrowed"], min: 1 });
const DEV = req("dev", { rule: "device-count", devices: [...CORE_DEVICES], min: 1 });
const loop = (chords: string) => `setcpm(100/4)\nchords: chord("<${chords}>").voicing().s("piano")`;

describe("applied chords: where they go decides", () => {
  test("V7/vi that goes to IV (deceptive) and V/V that goes home each name where they point", async () => {
    expect(rule(await grade([SEC], loop("C E7 F G")), "sec")).toEqual({
      ok: false,
      detail: "V7/vi (E7) in bar 2 doesn't resolve: it goes to IV (F), not to vi (Am)",
    });
    expect(rule(await grade([SEC], loop("C D C G")), "sec")).toEqual({
      ok: false,
      detail: "V/V (D) in bar 2 doesn't resolve: it goes to I (C), not to V (G)",
    });
  });
  test("a chain of dominants and a hand-voiced V7/V each count", async () => {
    expect(rule(await grade([SEC], loop("E7 A7 D7 G7")), "sec").ok).toBe(true);
    const hand =
      'setcpm(100/4)\nchords: note("<[c3,e3,g3] [d3,f#3,a3,c4] [b2,d3,g3] [c3,e3,g3]>").s("piano")';
    const r = await grade([SEC], hand);
    expect(rule(r, "sec").ok).toBe(true);
    expect(r.analysis?.deviceList?.[0]).toEqual({
      device: "secondary dominant",
      bar: 2,
      text: "V7/V→V bar 2",
    });
  });
  test("an applied chord only in a muted track is not heard and not counted", async () => {
    const r = await grade(
      [SEC, DEV],
      `${loop("C C F G")}\n_extra: chord("<C E7 Am F>").voicing().s("piano")`,
    );
    expect(rule(r, "sec").ok).toBe(false);
    expect(rule(r, "dev").ok).toBe(false);
  });
  test("♭VI before V is borrowed, not an applied chord; the Picardy I is borrowed in A minor", async () => {
    const r = await grade([BOR, SEC], loop("C Ab G C"));
    expect([rule(r, "bor").ok, rule(r, "sec").ok]).toEqual([true, false]);
    expect(devices(r)).toEqual(["borrowed chord"]);
    const picardy = await grade([BOR], loop("Am Dm E A"), { tonic: "A", mode: "minor" });
    expect(rule(picardy, "bor").ok).toBe(true);
  });
});

describe("mode: Dorian named in the code but its 6th never sounded", () => {
  test("fails on the colour note, named with its degree and letter", async () => {
    const MODE = req("mode", {
      rule: "mode",
      tonic: "declared",
      mode: "dorian",
      anyOf: ["mixolydian", "dorian"],
      requireCharacteristic: true,
    });
    const code = `setcpm(100/4)
chords: chord("<Dm7 Dm7 C C>").voicing().s("piano")
mel: n("<[0 2 4 2] [3 2 0 ~] [4 3 2 0] [0 ~ ~ ~]>").scale("D4:dorian").s("piano")`;
    expect(rule(await grade([MODE], code, null), "mode")).toEqual({
      ok: false,
      detail: "its colour note 6 (B) is on a strong beat 0 times; put it on beat 1 or 3 at least twice",
    });
  });
});
