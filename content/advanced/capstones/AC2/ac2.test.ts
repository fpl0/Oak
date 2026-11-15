// AC2 Neo-Soul Ballad (contracts §6.6 AC2, content/specs/A2.md): the brief of content/capstones.ts graded through the
// real grader in capstone mode, the way the capstone workspace grades a save.
//   - The brief: the four required lines of §6.6, tempo and length, the two suggestions (the snare's lean, tensions in
//     the tune), the sessions.
//   - The music the brief and pieces.ts state, by running it: the voicings spell their symbols and their top voice
//     moves by two half steps; `.swingBy(.2, 8)` on 16ths is 3:2; `.late(.006)` at 76 BPM is 19 ms, `.late(1/32)` 99 ms.
//   - One passing piece per shipped flavour; each required line fails on a piece that uses the right function without
//     the heard result (the right chord names voiced by the dictionary, a hand voicing that leaps, hats swung on the
//     8th grid, swung hats at gain 0, the Rhodes on another line, the Rhodes 30 dB down), and the lean line fails on a
//     snare a 32nd late while the piece still passes.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ComposeBriefEx, GradeResult, KeySpec, SessionId } from "@oak/content-kit";
import { IMPLEMENTED, lateMs, stripMarkers, swingRatio } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { CAPSTONE_LINER_PROMPTS, CAPSTONE_LINER_SEEDS, capstoneById } from "../../../capstones.ts";
import { toolbox } from "../../../toolbox.ts";
import { evaluate, lint, unlockedFor } from "../../../validate/harness.ts";
import { AC2_PIECES, AC2_TEMPLATE, AC2_VOICINGS, AC2_VOICINGS_EB } from "./pieces.ts";

setDefaultTimeout(120_000);

const ac2 = capstoneById.get("AC2");
const brief = ac2?.brief as ComposeBriefEx;
type Piece = keyof typeof AC2_PIECES;

/** Graded as the workspace grades a save: capstone mode, the brief's rubric, the key the code states. */
const grade = (code: string, key: KeySpec = { tonic: "D", mode: "major" }): Promise<GradeResult> =>
  grader.gradeExercise({
    exercise: brief,
    response: { code },
    ctx: {
      exerciseGlobalId: "AC2/brief",
      mode: "capstone",
      key,
      meter: "4/4",
      bpm: 75,
      ...(ac2?.swing ? { swing: ac2.swing } : {}),
      params: {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: {
        profile: "graded",
        unlocked: unlockedFor("AC2.S1" as SessionId),
        allowPreview: false,
        meter: "4/4",
        key: null,
      },
    },
  });
const failing = (r: GradeResult) => (r.rubric ?? []).filter((x) => !x.ok).map((x) => x.ruleId);
const detail = (r: GradeResult, id: string): string =>
  String((r.rubric ?? []).find((x) => x.ruleId === id)?.diag?.params.detail ?? "");
const PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
});

describe("AC2's brief", () => {
  test("four required lines as §6.6 writes them, then tempo and length; the lean and the tensions suggest", () => {
    expect(brief.rubric.map((r) => [r.id, r.rule, r.required])).toEqual([
      ["extensions", "custom", true],
      ["swing", "swing", true],
      ["voice-leading", "voice-leading", true],
      ["rhodes", "sounds", true],
      ["tempo", "tempo-bpm", true],
      ["bars", "bars", true],
      ["tune", "tracks", true],
      ["lean", "custom", false],
      ["tensions", "custom", false],
    ]);
    const [ext, swing, top, rhodes, tempo, bars, tune, lean, tensions] = brief.rubric;
    expect(tune).toMatchObject({ min: 1, roles: ["melody"] });
    expect(ext).toMatchObject({ fn: "extended-share", params: { harmony: "@chords", minRatio: 0.6 } });
    expect(swing).toMatchObject({ track: ["hats", "@drums"], subdivision: 16, ratio: [1.2, 2.4] });
    expect(top).toMatchObject({ track: "chords", maxMovePerVoice: 2, voice: "top", minRatio: 0.8 });
    expect(rhodes).toMatchObject({ contains: ["snd.rhodes"], track: "chords" });
    expect(tempo).toMatchObject({ min: 60, max: 90 });
    expect(bars).toMatchObject({ min: 8 });
    expect(lean).toMatchObject({
      fn: "microtiming",
      params: { track: "snare", direction: "late", minMs: 8, maxMs: 45 },
    });
    expect(tensions).toMatchObject({ fn: "tensions-used", params: { tensions: ["9", "11", "13"], min: 2 } });
    for (const fn of ["extended-share", "microtiming", "tensions-used"])
      expect(IMPLEMENTED.customRules).toContain(fn);
    expect(IMPLEMENTED.features).toContain("voice-leading.top");
  });
  test("the starter is S1's; the chord lines are S1's focus; only S3 reviews and releases", () => {
    expect(brief.code.starter).toBe(AC2_TEMPLATE);
    expect(ac2?.sessionDefs[0]?.starter).toBe(AC2_TEMPLATE);
    expect(ac2?.sessionDefs[0]?.focusRules).toEqual(["extensions", "voice-leading", "rhodes"]);
    const ids = new Set(brief.rubric.map((r) => r.id));
    for (const s of ac2?.sessionDefs ?? []) for (const f of s.focusRules ?? []) expect(ids.has(f)).toBe(true);
    expect(ac2?.sessionDefs.map((s) => [!!s.review, !!s.release])).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ]);
    expect(ac2?.swing).toEqual({ subdivision: 16, amount: 0.2 });
    // The starter writes no `.late(1/32)` (99 ms at 76 BPM) and no dictionary voicing (a top voice nobody chose).
    expect(AC2_TEMPLATE).not.toContain("1/32");
    expect(AC2_TEMPLATE).not.toContain(".voicing()");
  });
  test("the release asks about the chords and the groove, and offers three first lines", () => {
    expect(CAPSTONE_LINER_PROMPTS.AC2).toBe(
      "Which chord do you wait for, and what does the groove do around it?",
    );
    expect(CAPSTONE_LINER_SEEDS.AC2?.length).toBe(3);
    for (const t of CAPSTONE_LINER_SEEDS.AC2 ?? [])
      expect([t, /!|amazing|awesome|easy|simply|just /i.test(t)]).toEqual([t, false]);
  });
});

describe("the music the brief states, by running it", () => {
  /** Each bar's notes, lowest first, as pitch classes and the top note's MIDI. */
  async function bars(pattern: string) {
    const r = await evaluate(`setcpm(76/4)\nchords: note("${pattern}").s("rhodes")`, 4);
    expect(r.ok).toBe(true);
    return [0, 1, 2, 3].map((b) => {
      const ms = r.events
        .filter((e) => Math.floor(e.onset + 1e-9) === b)
        .map((e) => e.midi as number)
        .sort((x, y) => x - y);
      return { pcs: ms.map((m) => PC[m % 12]).join(" "), top: ms.at(-1) as number };
    });
  }
  test("Dmaj9 Em11 F♯m7 Bm9: the notes spell the symbols, the top voice is E4 D4 E4 D4", async () => {
    const b = await bars(AC2_VOICINGS);
    expect(b.map((x) => x.pcs)).toEqual(["D F# A C# E", "E G A B D", "F# A C# E", "B F# A C# D"]);
    expect(b.map((x) => x.top)).toEqual([64, 62, 64, 62]);
  });
  test("E♭maj9 Fm11 Gm7 Cm9: the top voice is F4 E♭4 F4 E♭4", async () => {
    const b = await bars(AC2_VOICINGS_EB);
    expect(b.map((x) => x.pcs)).toEqual(["D# G A# D F", "F G# A# C D#", "G A# D F", "C G A# D D#"]);
    expect(b.map((x) => x.top)).toEqual([65, 63, 65, 63]);
  });
  test("`.swingBy(.2, 8)` on 16ths plays each second 16th at 3/5 of its 8th: 3:2", async () => {
    const r = await evaluate('setcpm(76/4)\nhats: s("hh*16").swingBy(.2, 8)', 1);
    const at = r.events.map((e) => e.onset).sort((x, y) => x - y);
    expect(at[1]).toBeCloseTo((3 / 5) * (1 / 8), 9);
    expect(swingRatio(0.2)).toBeCloseTo(1.5, 9);
    expect(swingRatio(1 / 3)).toBeCloseTo(2, 9);
  });
  test("at 76 BPM `.late(.006)` is 19 ms (a feel) and `.late(1/32)` is 99 ms (a displacement)", () => {
    expect(Math.round(lateMs(0.006, 76))).toBe(19);
    expect(Math.round(lateMs(1 / 32, 76))).toBe(99);
    expect(lateMs(1 / 32, 76)).toBeGreaterThan(45);
    // The brief prints the number the learner copies: 19 ms is "about 20", never "20 ms is .late(.006)".
    expect(brief.prompt).toContain("about 20 ms at 76 BPM is `.late(.006)`");
  });
});

describe("every piece plays and lints clean when AC2 opens", () => {
  for (const [name, code] of Object.entries(AC2_PIECES))
    test(name, async () => {
      const plain = stripMarkers(code).code;
      const r = await evaluate(plain, 8);
      expect([r.ok, r.error ?? "", r.events.length > 0]).toEqual([true, "", true]);
      for (const session of ["AC2.S1", "AC2.S2"] as SessionId[])
        expect(
          lint(plain, { session, meter: "4/4", key: null })
            .diagnostics.filter((d) => d.severity === "error")
            .map((d) => `${d.id}: ${d.message}`),
        ).toEqual([]);
    });
});

describe("AC2 on the real grader (capstone mode)", () => {
  const EB: KeySpec = { tonic: "Eb", mode: "major" };
  const passes: [Piece, string, (KeySpec | undefined)?, string[]?][] = [
    ["jazzSoul", "jazz-soul: brushes, upright, Rhodes, the choir under it, vibes"],
    ["funk", "funk: 909 hats swung at .2, fingerbass, clav, at 88"],
    ["pop", "pop: E♭maj9 Fm11 Gm7 Cm9 by hand, a lighter swing (.15)", EB],
    ["indie", "indie: the E♭ changes, a 2:1 swing, a clean guitar on the tune", EB],
    ["beyond", "beyond the brief: E9sus4 on the last two beats, at 66"],
    ["minimal", "minimal: no kick or snare, so the lean has nothing to read", undefined, ["lean"]],
  ];
  for (const [piece, name, key, open] of passes)
    test(`passes: ${name}`, async () => {
      const r = await grade(AC2_PIECES[piece], key);
      expect([r.status, failing(r)]).toEqual(["pass", open ?? []]);
    });
  test("the starter fails on the hats and the length: the drums and the tune are session 2's", async () => {
    const r = await grade(AC2_PIECES.template);
    expect(failing(r)).toEqual(["swing", "bars", "tune", "lean", "tensions"]);
  });
  const fails: [Piece, string, string, string][] = [
    [
      "dictionary",
      "the right chord names, voiced by the dictionary",
      "voice-leading",
      "voiced by the dictionary",
    ],
    ["leaping", "a hand voicing whose top leaps at three changes", "voice-leading", "it leaps 5"],
    ["triads", "triads only", "extensions", "0% of the bars"],
    ["straight", "straight 16ths", "swing", "straight 16ths"],
    [
      "swingEighths",
      "the right function on the 8th grid: each pair of 16ths stays even",
      "swing",
      "straight 16ths",
    ],
    [
      "silentHats",
      "swung hats at gain 0: nothing heard, the kick is straight",
      "swing",
      "plays straight 16ths",
    ],
    ["piano", "the chords on the piano, the Rhodes doubling the tune", "rhodes", "no rhodes in `chords`"],
    ["fast", "104 BPM", "tempo", "104 BPM"],
    [
      "buriedTune",
      "the tune at gain .03, more than 24 dB under the band (W7 gate)",
      "tune",
      "no melody part",
    ],
  ];
  for (const [piece, name, rule, says] of fails)
    test(`fails on ${rule}: ${name}`, async () => {
      const r = await grade(AC2_PIECES[piece]);
      expect(r.status).toBe("fail");
      const required = failing(r).filter((id) => brief.rubric.find((x) => x.id === id)?.required);
      expect(required).toEqual([rule]);
      expect(detail(r, rule)).toContain(says);
    });
  test("fails on bars and tune: four bars, no tune", async () => {
    const r = await grade(AC2_PIECES.fourBars);
    const required = failing(r).filter((id) => brief.rubric.find((x) => x.id === id)?.required);
    expect(required).toEqual(["bars", "tune"]);
    expect(detail(r, "bars")).toContain("4 bars");
  });
  test("the Rhodes 30 dB under the tune is not heard: every chord line fails", async () => {
    const r = await grade(AC2_PIECES.quietRhodes);
    expect(failing(r).filter((id) => ["extensions", "voice-leading", "rhodes"].includes(id))).toEqual([
      "extensions",
      "voice-leading",
      "rhodes",
    ]);
  });
  test("the snare a 32nd late: 99 ms, a displacement; the lean line says so and the piece still passes", async () => {
    const r = await grade(AC2_PIECES.displaced);
    expect([r.status, failing(r)]).toEqual(["pass", ["lean"]]);
    expect(detail(r, "lean")).toContain("99 ms");
    // At .006 of a bar (19 ms) the same snare is a feel.
    expect(failing(await grade(AC2_PIECES.jazzSoul))).not.toContain("lean");
  });
});
