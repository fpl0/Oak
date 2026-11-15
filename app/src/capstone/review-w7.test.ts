// The Wave 7 learner review of the eight track capstones (review:studio): for each, two honest pieces a learner at
// that point would write (not the authored references) and the near misses the review tried, graded as the browser's
// check grades (`checkPiece`: the brief's key, else the code's stated mode, else the estimate; the picked song's
// melody; AC1's other version). Each verdict must be right and each open line must say what is wrong where the
// learner can act on it, without naming the answer. Regressions it pins (app/src/capstone/wave7.ts):
// - a part written but not heard (a tune at gain .03 under the ride) read "`melody` plays nothing yet", and named the
//   role, not the learner's label (`mel`); it now says the part is written but not heard;
// - a son clave played an 8th late read "No clave in `perc` yet" while `perc` plays five hits a bar;
// - RC2's bell row (`perc3`, E(5,16)) listed the bass's tresillo as a ticked E(3, 8) under an open bell line;
// - RC1's stab line ticked "1 of 10 notes an 8th or shorter" and read a 16-bar piece's hits as "in 8 bars";
// - a one-bar vamp "lands on the one in all 1 bars".
// JC3's `original` line cannot be judged here: no I Got Rhythm answer key exists yet (listed for the gate).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, SongDef } from "@oak/content-kit";
import { evaluateForGrading, formView, keyEstimate, modeView, type SongMelodyNote } from "@oak/grader";
import { AC1_VERSIONS, ac1 } from "../../../content/advanced/capstones/AC1/pieces.ts";
import { AC2_PIECES } from "../../../content/advanced/capstones/AC2/pieces.ts";
import {
  HEAD_1,
  head,
  JAZZ_BLUES_AM7,
  JC2_TEMPLATE,
  jc2,
  U11_BLUES,
  walk,
} from "../../../content/advanced/capstones/JC2/pieces.ts";
import {
  chartChanges,
  GEORGIA,
  georgiaSetting,
  reharmonized,
} from "../../../content/advanced/capstones/JC4/pieces.ts";
import sgb from "../../../content/repertoire/sweet-georgia-brown/song.ts";
import { checklistOf } from "./checklist.ts";
import * as P from "./review-w7-pieces.ts";
import { songMelodyOf } from "./song-melody.ts";
import { analysePiece, capstone, ensureRealm, gradePiece } from "./test-support.ts";
import { pieceForm } from "./wave5.ts";
import type { FoundItem } from "./wave6.ts";
import { type PieceRead7, wave7Extras } from "./wave7.ts";

setDefaultTimeout(240_000);

const melodyOf = (song: SongDef) =>
  songMelodyOf(song, async (code, opts) => {
    await ensureRealm();
    return evaluateForGrading(code, opts);
  });

interface Extras {
  session?: number;
  songMelody?: readonly SongMelodyNote[];
  otherVersion?: { id: "a" | "b"; code: string };
}

/** `engine.checkPiece` without the worker, and the checklist the workspace shows. */
async function check(id: string, code: string, extras: Extras = {}) {
  const c = capstone(id);
  const a = await analysePiece(id, code);
  const key: KeySpec | null =
    c.key ?? modeView(a.n, { meter: c.meter }).stated ?? keyEstimate(a.n.all)[0]?.key ?? null;
  const brief = c.brief?.rubric ?? [];
  const form = pieceForm(formView(a.n, { code, bars: a.bars }), code, brief);
  const result = await gradePiece(id, code, key, extras);
  const rows = checklistOf(brief, result);
  const piece: PieceRead7 = { n: a.n, code, meter: c.meter, bars: a.bars, analysis: a.analysis, form };
  const extra = wave7Extras(brief, result, piece);
  const items = (ruleId: string): FoundItem[] => {
    const x = extra[ruleId];
    return x?.kind === "found" ? x.items : [];
  };
  const open = rows.filter((r) => r.required && r.state !== "met").map((r) => r.id);
  const detail = (ruleId: string) => rows.find((r) => r.id === ruleId)?.detail ?? "";
  const texts = (ruleId: string) => items(ruleId).map((i) => i.text);
  return { status: result.status, open, items, texts, detail, bars: a.bars };
}

describe("JC1 ii–V Ballad", () => {
  test.each([
    ["down whole steps, F E♭ D♭", P.JC1_DOWN_STEPS, "Keys reached: F major, E♭ major, D♭ major (3 of 3)."],
    ["minor ii–Vs into A, G and F minor", P.JC1_MINOR, "Keys reached: A minor, G minor, F minor (3 of 3)."],
    [
      "the guide tones anticipated by an 8th",
      P.JC1_ANTICIPATED,
      "Keys reached: F major, E♭ major, D♭ major (3 of 3).",
    ],
  ])("honest: %s passes", async (_name, code, keys) => {
    const r = await check("JC1", code, { session: 2 });
    expect(r.status).toBe("pass");
    expect(r.texts("ii-v")[0]).toBe(keys);
    expect(r.texts("guide-tones")[0]).toBe("A 3rd or a 7th on 12 of 12 chord changes.");
  });
  test("three keys of I and IV but no ii–V: the ii–V line is open and says what a ii–V is, not where to put one", async () => {
    const r = await check("JC1", P.JC1_NO_TWO_FIVE, { session: 2 });
    expect(r.status).toBe("fail");
    expect(r.open).toContain("ii-v");
    expect(r.texts("ii-v")).toEqual(["No ii–V yet."]);
  });
  test("the tune on the 5th of every chord: guide tones open, 0 of 12, with the bars", async () => {
    const r = await check("JC1", P.JC1_FIFTHS, { session: 2 });
    expect(r.open).toEqual(["guide-tones"]);
    expect(r.texts("guide-tones")[0]).toBe("A 3rd or a 7th on 0 of 12 chord changes.");
    expect(r.texts("guide-tones")[1]).toStartWith("Not on the change in bars 1, 2, 3, 5");
  });
  test("the right tune buried 24 dB under the ride: open, and the line says it is written but not heard", async () => {
    const r = await check("JC1", P.JC1_BURIED, { session: 2 });
    expect(r.open).toEqual(["guide-tones"]);
    expect(r.texts("guide-tones")).toEqual([
      "`melody` is written but not heard: it is silent, or more than 24 dB under the loudest part.",
    ]);
  });
});

describe("JC2 Jazz Blues in F", () => {
  // A walk of my own (beats 2–4) under the bar-8 variant, comping on 2 and 4.
  const WALK2 =
    "<[~ g2 a2 e2] [~ c3 d3 e2] [~ a2 c3 b2] [~ d3 e2 e2] [~ d3 f2 a2] [~ d3 ab2 g2] [~ g2 a2 e2] [~ c3 c3 ab2] [~ a2 bb2 b2] [~ d3 e2 e2] [~ c3 d2 ab2] [~ bb2 c3 e2]>";
  const MY_1 =
    'note("<[c5 ~ a4 f4] [ab4 ~ ~ ~] [a4 c5 ~ a4] [g4 ~ f4 eb4] [d4 f4 ab4 ~] [ab4 ~ f4 ~] [a4 ~ c5 ~] [c5 ~ a4 ~] [bb4 ~ g4 ~] [g4 ~ e4 ~] [f4 ~ ~ ~] [~ ~ ~ ~]>")';
  const MY_2 =
    'note("<[c5 ~ a4 f4] [ab4 ~ ~ ~] [a4 c5 ~ a4] [g4 ~ f4 eb4] [d4 f4 ab4 ~] [ab4 ~ f4 ~] [a4 ~ c5 ~] [c5 ~ a4 ~] [d5 ~ bb4 ~] [c5 ~ bb4 g4] [a4 ~ f#4 ~] [g4 ~ e4 ~]>")';
  const HONEST_150 = jc2({
    bpm: 150,
    changes: JAZZ_BLUES_AM7,
    chords: 'chords: chord(changes).voicing().struct("~ x ~ x").swingBy(1/3,4).s("piano").gain(.5)',
    bass: walk(WALK2, "upright"),
    mel: head("vibes"),
  });
  const HONEST_116 = jc2({
    bpm: 116,
    mel: `mel: arrange([12, ${MY_1}], [12, ${MY_2}]).swingBy(1/3, 4).s("mutetpt")`,
  });
  test.each([
    ["my walk and comping on 2 and 4 at 150, the vibes head", HONEST_150],
    ["my own head over two choruses, the second changed, at 116", HONEST_116],
  ])("honest: %s passes", async (_name, code) => {
    const r = await check("JC2", code, { session: 2 });
    expect(r.status).toBe("pass");
    expect(r.texts("one-pattern")).toEqual(["`chords` and `bass` both read `changes`."]);
    expect(r.texts("head")[0]).toContain("2 choruses of the 12-bar form");
  });
  test("a bass that repeats the root on 1 to 3 and only approaches on 4: the walk is open, and says why", async () => {
    const ROOTY =
      "<[~ f2 f2 a2] [~ bb2 bb2 g2] [~ f2 f2 b2] [~ f2 f2 a2] [~ bb2 bb2 c3] [~ b2 b2 e2] [~ f2 f2 c#2] [~ d2 d2 ab2] [~ g2 g2 db2] [~ c2 c2 gb2] [~ d2 d2 f#2] [~ c2 c2 e2]>";
    const r = await check("JC2", jc2({ bass: walk(ROOTY) }), { session: 2 });
    expect(r.open).toEqual(["walking"]);
    expect(r.detail("walking")).toContain("a walk keeps moving");
  });
  test("the second chorus plays the first again: the form line is open", async () => {
    const r = await check(
      "JC2",
      jc2({ mel: `mel: arrange([12, ${HEAD_1}], [12, ${HEAD_1}]).swingBy(1/3, 4).s("mutetpt")` }),
      { session: 2 },
    );
    expect(r.open).toEqual(["form"]);
    expect(r.detail("form")).toContain("the second plays the first again");
  });
  test("the head buried under the band: open, and the head line names `mel` as written but not heard", async () => {
    const r = await check("JC2", jc2({ mel: head().replace('.s("mutetpt")', '.s("mutetpt").gain(.03)') }), {
      session: 2,
    });
    expect(r.open).toContain("head");
    expect(r.texts("head")).toEqual([
      "`mel` is written but not heard: it is silent, or more than 24 dB under the loudest part.",
    ]);
  });
  test("the bass walks a second chord pattern (U11's blues) under the jazz comping: the walk is open where they differ", async () => {
    const r = await check("JC2", jc2({ bass: walk().replace("chord(changes)", `chord("${U11_BLUES}")`) }), {
      session: 2,
    });
    expect(r.open).toContain("walking");
    expect(r.texts("walking")).toContain("Bar 4: beat 1 is not the chord's root.");
  });
  test("the starter is still open (no walk, no head)", async () => {
    expect((await check("JC2", JC2_TEMPLATE, { session: 1 })).status).toBe("fail");
  });
});

describe("JC4 Reharmonize a Standard (Georgia on My Mind)", () => {
  const layer = (GEORGIA.answerKey.layers.melody ?? "").replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "");
  const ch = reharmonized();
  test("honest: the three devices and a fourth (a tritone sub for bar 22's E7), piano on 2 and 4", async () => {
    const mel = await melodyOf(GEORGIA);
    const four = [...ch];
    four[21] = "[Dm7 Bb7]";
    const r = await check(
      "JC4",
      georgiaSetting({ changes: four, chords: '.voicing().struct("~ x ~ x").s("piano").gain(.5)' }),
      { session: 2, songMelody: mel },
    );
    expect(r.status).toBe("pass");
  });
  test.each([
    [
      "a note in the bridge moved a step (bar 18, D to E)",
      layer.replace("[0 -2 0@2]", "[0 -1 0@2]"),
      "bar 18, beat 2",
    ],
    ["one note an 8th late (bar 5)", layer.replace("[2 4 6 5]", "[[~ 2] 4 6 5]"), "bar 5, beat 1"],
  ])("the melody touched: %s: the melody line is open at that place", async (_name, line, place) => {
    const mel = await melodyOf(GEORGIA);
    expect(line).not.toBe(layer);
    const r = await check("JC4", georgiaSetting({ changes: ch, mel: `mel: ${line}` }), {
      session: 2,
      songMelody: mel,
    });
    expect(r.open).toEqual(["melody"]);
    expect(r.detail("melody")).toContain(place);
  });
  test("three tritone subs are one device: the devices line counts different devices and names the open ones", async () => {
    const mel = await melodyOf(GEORGIA);
    const tri = [...chartChanges()];
    for (const bar of [6, 14, 24]) tri[bar - 1] = "[Gm7 Gb7]";
    const r = await check("JC4", georgiaSetting({ changes: tri }), { session: 2, songMelody: mel });
    expect(r.open).toEqual(["devices"]);
    expect(r.detail("devices")).toContain("still open: backdoor, diminished passing");
  });
});

describe("RC1 16th-Note Funk", () => {
  test.each([
    ["D minor at 104 with clav", P.RC1_D_MINOR],
    ["G minor at 112, gain ghosts, hand stabs", P.RC1_G_MINOR],
  ])("honest: %s passes", async (_name, code) => {
    const r = await check("RC1", code, { session: 2 });
    expect(r.status).toBe("pass");
    expect(r.texts("one-kick")).toEqual(["the kick lands on the one in its one bar."]);
    expect(r.items("horns")[0]?.ok).toBe(true);
  });
  test("everything on the beat: the ghosts and the bass between the 8ths are open", async () => {
    const r = await check("RC1", P.RC1_ON_THE_BEAT, { session: 2 });
    expect(r.open).toEqual(["ghosts", "syncopated-bass"]);
    expect(r.texts("syncopated-bass")).toEqual(["Every bass note sits on the 8th grid."]);
  });
  test("horns held as pads: the stab line is open, and the reading under it is not ticked", async () => {
    const r = await check("RC1", P.RC1_LONG_HORNS, { session: 2 });
    expect(r.open).toEqual(["horns"]);
    expect(r.items("horns")[0]).toMatchObject({
      text: "`horns`: 2 hits in 1 of 1 bar, 0 of 10 notes an 8th or shorter.",
      ok: false,
    });
  });
  test("every hat at .3: the ghosts line is open (nothing is accented)", async () => {
    const r = await check("RC1", P.RC1_FLAT_HATS, { session: 2 });
    expect(r.open).toEqual(["ghosts"]);
  });
});

describe("RC2 Clave & Polyrhythm", () => {
  test.each([
    ["A minor at 100 with a montuno figure", P.RC2_A_MINOR],
    ["G on the 808 at 124, the bell turned", P.RC2_G_808],
    ["the tresillo written out by hand", P.RC2_TRESILLO_BY_HAND],
  ])("honest: %s passes", async (_name, code) => {
    const r = await check("RC2", code, { session: 2 });
    expect(r.status).toBe("pass");
    expect(r.texts("clave")).toEqual(["Son clave 3-2 from bar 1, whole for 8 bars."]);
    // The bell row reads `perc3` alone, never the bass's tresillo.
    expect(r.texts("bell")).toHaveLength(1);
    expect(r.texts("bell")[0]).toStartWith("`perc3`: E(5, 16");
  });
  test("the clave turned round: open, and the line names the direction heard", async () => {
    const r = await check("RC2", P.RC2_TURNED, { session: 2 });
    expect(r.open).toEqual(["clave"]);
    expect(r.items("clave")[0]).toMatchObject({
      text: "Son clave 2-3 from bar 1, whole for 8 bars.",
      ok: false,
    });
  });
  test("the clave an 8th late: open, and the line says `perc` plays but makes no clave on the grid (never “no clave yet”)", async () => {
    const r = await check("RC2", P.RC2_CLAVE_LATE, { session: 2 });
    expect(r.open).toEqual(["clave"]);
    expect(r.texts("clave")).toEqual([
      "`perc` plays 5 hits in bars 1–2, but they do not make a son or rumba clave on the 8th grid.",
    ]);
  });
  test("five even hits on the bell: the bell is open and its row lists only `perc3`", async () => {
    const r = await check("RC2", P.RC2_BELL_EVEN, { session: 2 });
    expect(r.open).toEqual(["bell"]);
    // Only the one hit on the 16-step grid is read as a spread: E(1, 16), never ticked under the bell line.
    expect(r.items("bell")).toEqual([
      { text: "`perc3`: E(1, 16) in bar 1.", anchor: { from: 1, to: 1 }, ok: false },
    ]);
  });
  test("three over two bars: the 3:2 line is open", async () => {
    const r = await check("RC2", P.RC2_THREE_OVER_TWO_BARS, { session: 2 });
    expect(r.open).toEqual(["poly"]);
  });
});

describe("AC1 One Tune, Two Genres (Sweet Georgia Brown)", () => {
  /** A reggae-ish version of my own at 84: one-drop drums, the bass with a low-pass, skank chords, an echoing tune. */
  const REGGAE = ac1({
    bpm: 84,
    drums: 's("~ ~ bd ~, ~ ~ sd ~, ~ hh ~ hh ~ hh ~ hh").gain(.6)',
    bass: 'chord(changes).rootNotes(2).struct("x ~ ~ x ~ ~ x ~").s("ebass").lpf(500)',
    chords: 'chord(changes).voicing().struct("~ x ~ x").s("acgtr").clip(.3).gain(.4)',
    mel: '.s("rhodes").delay(.4).delaytime(.375).delayfeedback(.4)',
  });
  const ctx = async (other: string) => ({
    session: 3,
    songMelody: await melodyOf(sgb as SongDef),
    otherVersion: { id: "b" as const, code: other },
  });
  test("honest: my reggae version beside the funk one, and the funk one beside mine, both pass", async () => {
    expect((await check("AC1", REGGAE, await ctx(AC1_VERSIONS.funk))).status).toBe("pass");
    expect((await check("AC1", AC1_VERSIONS.funk, await ctx(REGGAE))).status).toBe("pass");
  });
  test("two versions that differ only in tempo: the differ line is open and counts the sounds", async () => {
    const r = await check(
      "AC1",
      AC1_VERSIONS.funk.replace("setcpm(104/4)", "setcpm(140/4)"),
      await ctx(AC1_VERSIONS.funk),
    );
    expect(r.open).toEqual(["differ"]);
    expect(r.detail("differ")).toBe("0 sounds differ between the versions; at least 2");
  });
  test("one sound swapped and 20 BPM apart: the differ line is open (two sounds of its own)", async () => {
    const one = AC1_VERSIONS.funk
      .replace("setcpm(104/4)", "setcpm(84/4)")
      .replace('s("organ")', 's("piano")');
    const r = await check("AC1", one, await ctx(AC1_VERSIONS.funk));
    expect(r.open).toEqual(["differ"]);
    expect(r.detail("differ")).toBe("only 1 sound differs between the versions; at least 2");
  });
  test("the tune buried under the band: the melody line is open", async () => {
    const r = await check(
      "AC1",
      REGGAE.replace('.s("rhodes").delay', '.s("rhodes").gain(.02).delay'),
      await ctx(AC1_VERSIONS.funk),
    );
    expect(r.open).toContain("melody");
  });
});

describe("AC2 Neo-Soul Ballad", () => {
  /** My own: F major at 70, Fmaj9 Gm11 Am11 B♭maj9 voiced by hand, the top note stepping, the snare 15 ms late. */
  const F_BALLAD = `setcpm(70/4)

kick: s("bd ~ ~ ~ ~ ~ bd ~")
snare: s("~ sd ~ sd").late(.0044)
hats: s("hh*16").swingBy(.2, 8).gain(.35)
chords: note("<[f3,a3,e4,g4] [g3,bb3,c4,f4] [a3,c4,d4,g4] [bb3,c4,d4,a4] [f3,a3,e4,g4] [g3,bb3,c4,f4] [a3,c4,d4,g4] [bb3,c4,d4,a4]>").s("rhodes").gain(.6)
bass: note("<f2 g2 a2 bb2>").s("upright")
mel: note("<[c5@3 a4] [d5@2 c5 bb4] [e5@3 c5] [d5@4] [c5@3 a4] [d5@2 c5 bb4] [e5@3 g5] [f5@4]>").s("vibes").gain(.7)`;
  test("the top note leaps into the last chord and back to the first as the loop repeats: open, and the reading counts both moves", async () => {
    const leap = F_BALLAD.replace("[bb3,c4,d4,a4]>", "[bb3,d4,a4,c5]>");
    const r = await check("AC2", leap, { session: 3 });
    expect(r.open).toEqual(["voice-leading"]);
    expect(r.items("voice-leading")[0]).toMatchObject({
      text: "Top voice G4 F4 G4 A4 G4 F4 …: 6 of 8 moves are 2 half steps or less.",
      ok: false,
    });
  });
  test.each([
    ["my F major ballad at 70", F_BALLAD],
    ["the authored funk ballad", AC2_PIECES.funk],
  ])("honest: %s passes", async (_name, code) => {
    expect((await check("AC2", code, { session: 3 })).status).toBe("pass");
  });
  test("every reader line of a passing ballad is ticked or neutral, none names a note to play", async () => {
    const r = await check("AC2", AC2_PIECES.jazzSoul, { session: 3 });
    for (const id of ["extensions", "swing", "voice-leading"]) {
      for (const i of r.items(id)) expect(i.ok).not.toBe(false);
    }
  });
});
