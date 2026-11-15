// AC1 One Tune, Two Genres (contracts §6.6 AC1, content/specs/A2.md): the brief of content/capstones.ts graded through
// the real grader in capstone mode, the way the two-version workspace grades a save: each version on its own code,
// with the picked song's melody (`GradeContext.songMelody`, from the answer key, as app/src/capstone/song-melody.ts
// reads it) and the other version's code (`GradeContext.otherVersion`).
//   - The brief: five required lines, the two versions, the two songs, the sessions.
//   - The tune in pieces.ts is the answer key's, note for note; its changes are the answer key's chart.
//   - Two pairs of versions in the four shipped flavours pass, both ways round; the tune an octave down passes.
//   - Each required line fails on a piece that uses the right function without the heard result: two notes of the
//     tune moved, a tempo 12 BPM away, the same version again at another tempo, vibrato with no depth, crush at 16
//     bits, FM on a sample.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ComposeBriefEx, GradeResult, KeySpec, Rat, SessionId } from "@oak/content-kit";
import { IMPLEMENTED, PLANNED, R } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { CAPSTONE_LINER_PROMPTS, CAPSTONE_LINER_SEEDS, capstoneById } from "../../../capstones.ts";
import { songById } from "../../../repertoire/index.ts";
import slb from "../../../repertoire/st-louis-blues/song.ts";
import sgb from "../../../repertoire/sweet-georgia-brown/song.ts";
import { toolbox } from "../../../toolbox.ts";
import { evaluate, lint, unlockedFor } from "../../../validate/harness.ts";
import { AC1_PIECES, AC1_SLB, AC1_TEMPLATE, SGB_CHANGES, SLB_BARS, SLB_CHANGES, sgbTune } from "./pieces.ts";

setDefaultTimeout(120_000);

const ac1 = capstoneById.get("AC1");
const brief = ac1?.brief as ComposeBriefEx;
const F: KeySpec = { tonic: "F", mode: "major" };
type Piece = keyof typeof AC1_PIECES;

/** The answer key's melody, note by note, bars from the first full bar (app/src/capstone/song-melody.ts). */
async function songMelody(song: typeof sgb): Promise<grader.SongMelodyNote[]> {
  const ev = await grader.evaluateForGrading(`melody: ${song.answerKey.layers.melody}`, {
    mode: "capstone",
    bars: song.answerKey.bars,
    lint: null,
    meter: "4/4",
  });
  if (!ev.ok) throw new Error("the answer key's melody does not evaluate");
  const n = grader.normalize(ev, { meter: "4/4" });
  return (n.byTrack.melody ?? [])
    .filter((e) => e.midi !== null)
    .sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi as number) - (b.midi as number))
    .map((e) => ({ onset: e.onset as Rat, dur: e.dur, midi: e.midi as number }));
}
let MELODY: grader.SongMelodyNote[] = [];
let BLUES: grader.SongMelodyNote[] = [];

/** Graded as the workspace grades a save of one version, beside the other version's code. */
const grade = (
  code: string,
  other: string | null,
  o: { song?: boolean; blues?: boolean; session?: SessionId } = {},
): Promise<GradeResult> =>
  grader.gradeExercise({
    exercise: brief,
    response: { code },
    ctx: {
      exerciseGlobalId: "AC1/brief",
      mode: "capstone",
      key: F,
      meter: "4/4",
      bpm: 140,
      ...(o.song === false ? {} : { songMelody: o.blues ? BLUES : MELODY }),
      ...(other !== null ? { otherVersion: { id: "b", code: other } } : {}),
      params: {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: {
        profile: "graded",
        unlocked: unlockedFor(o.session ?? ("AC1.S1" as SessionId)),
        allowPreview: false,
        meter: "4/4",
        key: null,
      },
    },
  });
const failing = (r: GradeResult) => (r.rubric ?? []).filter((x) => !x.ok).map((x) => x.ruleId);
const detail = (r: GradeResult, id: string): string =>
  String((r.rubric ?? []).find((x) => x.ruleId === id)?.diag?.params.detail ?? "");
const notes = (es: readonly { onset: Rat; midi: number | null }[]) =>
  es.map((e) => `${R.toNum(e.onset).toFixed(5)}:${e.midi}`).join(" ");

beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
  MELODY = await songMelody(sgb);
  BLUES = await songMelody(slb);
});

describe("AC1's brief", () => {
  test("five required lines: the song's tune, a shaped sound heard, two versions that differ, 12 bars, 60–220 BPM", () => {
    expect(brief.rubric.map((r) => [r.id, r.rule, r.required])).toEqual([
      ["melody", "custom", true],
      ["sound", "custom", true],
      ["differ", "custom", true],
      ["bars", "bars", true],
      ["tempo", "tempo-bpm", true],
    ]);
    const [melody, sound, differ, bars, tempo] = brief.rubric;
    expect(melody).toMatchObject({
      fn: "song-melody-kept",
      params: { melody: "@melody", pitch: "pitch-class" },
    });
    expect(sound).toMatchObject({ fn: "control-set" });
    expect(
      ((sound as unknown as { params: { anyOf: { control: string }[] } }).params.anyOf ?? []).map(
        (x) => x.control,
      ),
    ).toEqual([
      "lpenv",
      "distort",
      "crush",
      "vib",
      "phaserrate",
      "tremolosync",
      "lprate",
      "fmi",
      "roomsize",
      "delaytime",
    ]);
    expect(differ).toMatchObject({
      fn: "two-versions-differ",
      params: { melody: "@melody", tempoDelta: 20, soundsDiffer: 2 },
    });
    expect(bars).toMatchObject({ min: 12 });
    expect(tempo).toMatchObject({ min: 60, max: 220 });
    expect(ac1?.bpm).toEqual([60, 220]);
    // Not a `uses` rule: §6.6's "uses ≥ 1 A1 tool" is read as a control set to a value that is heard.
    expect(brief.rubric.some((r) => r.rule === "uses")).toBe(false);
  });
  test("two versions, version two starting in session 2; the two songs, Sweet Georgia Brown first", () => {
    expect(ac1?.versions).toEqual([
      { id: "a", label: "Version one", startsIn: "AC1.S1" },
      { id: "b", label: "Version two", startsIn: "AC1.S2" },
    ]);
    expect(ac1?.song).toEqual(["song.sweet-georgia-brown", "song.st-louis-blues"]);
    for (const id of ac1?.song ?? []) expect(songById.has(id)).toBe(true);
    expect(songById.get("song.sweet-georgia-brown")?.availableFrom).toBe("U15.L05");
  });
  test("St. Louis Blues has its answer key: the 12-bar strain in G, twelve bars", () => {
    expect([slb.id, slb.answerKey.bars, slb.key]).toEqual([
      "song.st-louis-blues",
      12,
      { tonic: "G", mode: "major" },
    ]);
  });
  test("each session works on its own lines; S1 opens the template; only S3 reviews and releases", () => {
    const ids = new Set(brief.rubric.map((r) => r.id));
    expect(ac1?.sessionDefs.map((s) => s.focusRules)).toEqual([
      ["melody", "sound", "bars", "tempo"],
      ["melody", "sound", "differ", "bars", "tempo"],
      ["melody", "sound", "differ", "bars", "tempo"],
    ]);
    for (const s of ac1?.sessionDefs ?? []) for (const f of s.focusRules ?? []) expect(ids.has(f)).toBe(true);
    expect(ac1?.sessionDefs[0]?.starter).toBe(AC1_TEMPLATE);
    expect(brief.code.starter).toBe(AC1_TEMPLATE);
    expect(ac1?.sessionDefs.map((s) => [!!s.review, !!s.release])).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ]);
    expect(ac1?.reviewRevisions).toBe(2);
  });
  test("the release asks what each style changed and offers three first lines", () => {
    expect(CAPSTONE_LINER_PROMPTS.AC1).toBe("What did each style change, and what did the tune keep?");
    expect(CAPSTONE_LINER_SEEDS.AC1?.length).toBe(3);
    for (const t of CAPSTONE_LINER_SEEDS.AC1 ?? [])
      expect([t, /!|amazing|awesome|easy|simply|just /i.test(t)]).toEqual([t, false]);
  });
  test("its rules are built; the two-version workspace is the planned feature content CI waits for", () => {
    for (const fn of ["song-melody-kept", "two-versions-differ", "control-set"])
      expect(IMPLEMENTED.customRules).toContain(fn);
    const versionsReady = (IMPLEMENTED.features ?? []).includes("capstone.versions");
    expect(versionsReady || (PLANNED.features ?? []).includes("capstone.versions")).toBe(true);
  });
});

describe("the tune and the changes are the answer key's", () => {
  test("pieces.ts's tune plays the answer key's notes at the answer key's onsets, all 32 bars", async () => {
    const ev = await grader.evaluateForGrading(`melody: note("${sgbTune()}")`, {
      mode: "capstone",
      bars: 32,
      lint: null,
      meter: "4/4",
    });
    if (!ev.ok) throw new Error("the tune does not evaluate");
    const mine = grader.normalize(ev, { meter: "4/4" }).byTrack.melody ?? [];
    expect(MELODY.length).toBe(95);
    expect(notes(mine)).toBe(notes(MELODY));
  });
  test("St. Louis Blues in pieces.ts plays its answer key's notes, and its changes are the chart's", async () => {
    const ev = await grader.evaluateForGrading(`melody: note("<${SLB_BARS.join(" ")}>")`, {
      mode: "capstone",
      bars: 12,
      lint: null,
      meter: "4/4",
    });
    if (!ev.ok) throw new Error("the tune does not evaluate");
    expect(notes(grader.normalize(ev, { meter: "4/4" }).byTrack.melody ?? [])).toBe(notes(BLUES));
    expect([...SLB_CHANGES]).toEqual((slb.answerKey.chords ?? []).map((c) => c.symbol));
  });
  test("the changes are the chart's, bar by bar (its F^7 written F)", () => {
    const chart = sgb.answerKey.chords ?? [];
    const bars = Array.from({ length: 32 }, (_, i) =>
      chart
        .filter((c) => c.bar === i + 1)
        .sort((a, b) => a.beat - b.beat)
        .map((c) => c.symbol.replace("^7", "")),
    );
    const mine = SGB_CHANGES.map((x) => x.replace(/[[\]]/g, "").split(" "));
    expect(mine).toEqual(bars.map((b, i) => (b.length > 0 ? b : (mine[i] as string[]))));
    expect(mine.length).toBe(32);
  });
});

describe("every piece plays and lints clean when AC1 opens", () => {
  const all = { ...AC1_PIECES, slbJazzSoul: AC1_SLB.jazzSoul, slbIndie: AC1_SLB.indie };
  for (const [name, code] of Object.entries(all))
    test(name, async () => {
      const r = await evaluate(code, 4);
      expect([r.ok, r.error ?? "", r.events.length > 0]).toEqual([true, "", true]);
      for (const session of ["AC1.S1", "AC1.S2"] as SessionId[])
        expect(
          lint(code, { session, meter: "4/4", key: null })
            .diagnostics.filter((d) => d.severity === "error")
            .map((d) => `${d.id}: ${d.message}`),
        ).toEqual([]);
    });
});

describe("AC1 on the real grader (capstone mode, with the song and the other version)", () => {
  const pairs: [Piece, Piece, string][] = [
    ["jazzSoul", "funk", "jazz-soul at 132, lightly swung, beside funk at 104, straight"],
    ["funk", "jazzSoul", "funk at 104 beside jazz-soul at 132"],
    ["pop", "indie", "pop at 112 beside indie at 140, both straight"],
    ["indie", "pop", "indie at 140 beside pop at 112"],
    ["jazzSoulLow", "funk", "the tune an octave down (checked by pitch class)"],
  ];
  for (const [a, b, name] of pairs)
    test(`passes: ${name}`, async () => {
      const r = await grade(AC1_PIECES[a], AC1_PIECES[b]);
      expect([r.status, failing(r)]).toEqual(["pass", []]);
    });
  test("passes on St. Louis Blues, the twelve-bar strain played twice: jazz-soul at 126 swung beside indie at 92 straight", async () => {
    for (const [a, b] of [
      [AC1_SLB.jazzSoul, AC1_SLB.indie],
      [AC1_SLB.indie, AC1_SLB.jazzSoul],
    ] as const) {
      const r = await grade(a, b, { blues: true });
      expect([r.status, failing(r)]).toEqual(["pass", []]);
    }
  });
  test("one song's versions read against the other song's tune fail the tune line", async () => {
    const r = await grade(AC1_SLB.indie, AC1_SLB.jazzSoul);
    expect(failing(r)).toContain("melody");
  });
  test("the right function, the wrong tune: the blues with its blue third (B♭) played as B", async () => {
    const r = await grade(AC1_SLB.indie.replaceAll("bb4", "b4"), AC1_SLB.jazzSoul, { blues: true });
    expect(failing(r)).toEqual(["melody", "differ"]);
  });
  test("the starter fails only on the shaped sound: the tune is given, plain piano is not arranged", async () => {
    const r = await grade(AC1_TEMPLATE, AC1_PIECES.funk);
    expect([r.status, failing(r)]).toEqual(["fail", ["sound"]]);
  });
  test("the right function, the wrong tune: two notes of bar 2 moved", async () => {
    const r = await grade(AC1_PIECES.tuneChanged, AC1_PIECES.funk);
    expect(failing(r)).toEqual(["melody", "differ"]);
    expect(detail(r, "melody")).toContain("bar 2");
  });
  test("the right function, too close: the tempo moved only 12 BPM from the other straight version", async () => {
    const r = await grade(AC1_PIECES.funkNear, AC1_PIECES.pop);
    expect(failing(r)).toEqual(["differ"]);
    expect(detail(r, "differ")).toContain("12 BPM apart");
  });
  test("the same version twice at another tempo: 30 BPM apart, but no sound of its own", async () => {
    const r = await grade(AC1_PIECES.jazzSoulAgain, AC1_PIECES.jazzSoul);
    expect(failing(r)).toEqual(["differ"]);
    expect(detail(r, "differ")).toContain("0 sounds");
  });
  const sounds: [Piece, string, string][] = [
    ["funkPlain", "no shaped sound at all", "no sound has one of the sound-design controls"],
    ["funkNoDepth", "vibrato with no depth", "no depth"],
    [
      "funkCrush16",
      "crush at 16 bits, where the sound already is",
      "no sound has one of the sound-design controls",
    ],
    ["funkFmPiano", "FM on a sampled piano", "a sample has no oscillator"],
  ];
  for (const [piece, name, says] of sounds)
    test(`the sound line fails: ${name}`, async () => {
      const r = await grade(AC1_PIECES[piece], AC1_PIECES.jazzSoul);
      expect(failing(r)).toEqual(["sound"]);
      expect(detail(r, "sound")).toContain(says);
    });
  test("eight bars: too short, and the tune stops before the song does", async () => {
    const r = await grade(AC1_PIECES.short, AC1_PIECES.jazzSoul);
    expect(failing(r)).toContain("bars");
  });
  test("without the song's melody the tune line never passes; without version two the differ line waits", async () => {
    const noSong = await grade(AC1_PIECES.jazzSoul, AC1_PIECES.funk, { song: false });
    expect(failing(noSong)).toEqual(["melody"]);
    const alone = await grade(AC1_PIECES.jazzSoul, null);
    expect(failing(alone)).toEqual(["differ"]);
    expect(detail(alone, "differ")).toContain("not written yet");
  });
  // The spec lets a version arrange only the A and B sections, and the brief invites swinging one version: the
  // learner's swing since U11.L07 is the triplet `.swingBy(1/3, 4)` (or `.swing(4)`). `song-melody-kept` now bounds
  // the song by the piece's length and straightens a swung tune (these were test.todo until the grader did).
  test("a 16-bar version (the A and B sections) keeps the tune", async () => {
    const r = await grade(AC1_PIECES.funk16, AC1_PIECES.jazzSoul);
    expect(failing(r)).toEqual([]);
  });
  test("a version that swings its tune at 2:1 keeps the tune: `.swingBy(1/3, 4)` and `.swing(4)`", async () => {
    for (const swing of [".swingBy(1/3, 4)", ".swing(4)"]) {
      const r = await grade(AC1_PIECES.jazzSoul.replaceAll(".swingBy(.2, 4)", swing), AC1_PIECES.funk);
      expect([swing, failing(r)]).toEqual([swing, []]);
    }
    const blues = await grade(
      AC1_SLB.jazzSoul.replaceAll(".swingBy(.2, 4)", ".swingBy(1/3, 4)"),
      AC1_SLB.indie,
      { blues: true },
    );
    expect(failing(blues)).toEqual([]);
  });
});
