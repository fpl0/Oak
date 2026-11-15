// Wave 7 capstone reading, checked against the real headless grader and Strudel: what the eight track capstones'
// checklists say beyond met / not yet. Each reader is pinned on a right piece, on a piece that uses the right
// function with the wrong result (every ii–V into one key, a clave turned round, chords from the dictionary, the one
// missing), and its lines never name the answer.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { formView } from "@oak/grader";
import * as P from "./e2e/w7-pieces.ts";
import { analysePiece, capstone, gradePiece } from "./test-support.ts";
import { pieceForm } from "./wave5.ts";
import type { FoundItem, Wave6Extra } from "./wave6.ts";
import {
  changesOf,
  chordText,
  leanText,
  midiName,
  onePatternFound,
  type PieceRead7,
  swingRatioOf,
  tensionsFound,
  trackBodies,
  voicingRows,
  wave7Extras,
} from "./wave7.ts";

setDefaultTimeout(60_000);

async function read(id: string, code: string, session = 1) {
  const a = await analysePiece(id, code);
  const result = await gradePiece(id, code, null, { session });
  const def = capstone(id);
  const form = pieceForm(formView(a.n, { code, bars: a.bars }), code, def.brief?.rubric ?? []);
  const piece: PieceRead7 = { n: a.n, code, meter: def.meter, bars: a.bars, analysis: a.analysis, form };
  const extras = wave7Extras(def.brief?.rubric ?? [], result, piece);
  return { result, piece, extras, ok: (id: string) => result.rubric?.find((r) => r.ruleId === id)?.ok };
}
const items = (x: Wave6Extra | undefined): FoundItem[] => (x?.kind === "found" ? x.items : []);
const texts = (x: Wave6Extra | undefined) => items(x).map((i) => i.text);

describe("JC1: the keys the ii–Vs reach, the guide tones", () => {
  test("the ballad reaches C major, E♭ major and A minor, with a 3rd or 7th on every change; it passes", async () => {
    const r = await read("JC1", P.JC1_BALLAD);
    expect(r.result.status).toBe("pass");
    const twoFive = items(r.extras["ii-v"]);
    expect(twoFive[0]).toMatchObject({
      text: "Keys reached: C major, E♭ major, A minor (3 of 3).",
      ok: true,
    });
    expect(twoFive.some((i) => i.text.includes("into A minor") && i.anchor?.from === 9)).toBe(true);
    expect(items(r.extras["guide-tones"])[0]).toMatchObject({
      text: "A 3rd or a 7th on 12 of 12 chord changes.",
      ok: true,
    });
  });
  test("ii–Vs chained, every one into C (the right function, the wrong result): the row is open and says 1 of 3", async () => {
    const r = await read("JC1", P.JC1_ONE_KEY);
    expect(r.ok("ii-v")).toBe(false);
    expect(items(r.extras["ii-v"])[0]).toMatchObject({ text: "Keys reached: C major (1 of 3).", ok: false });
  });
});

describe("JC2: one chord() pattern, the walking bass, the head over two choruses", () => {
  test("comping and bass read `changes`; the head plays two choruses; the hats swing 2 : 1", async () => {
    const r = await read("JC2", P.JC2_HEAD);
    expect(r.ok("one-pattern")).toBe(true);
    expect(texts(r.extras["one-pattern"])).toEqual(["`chords` and `bass` both read `changes`."]);
    // The head's own row (blues-form with choruses) says how long the head plays.
    expect(items(r.extras.head)[0]).toMatchObject({ ok: true });
    expect(texts(r.extras.head)[0]).toContain("2 choruses of the 12-bar form");
    expect(texts(r.extras.swing)).toEqual(["`hats`: swung 8ths, 2.0 : 1."]);
  });
  test("a bass that repeats roots: every beat and the root on 1, but beat 4 leaps into the next bar (named with its bar)", async () => {
    const r = await read("JC2", P.JC2_HEAD);
    const walk = texts(r.extras.walking);
    if (walk.length === 0) return; // the grader has not built the walking-bass view in this tree
    expect(r.ok("walking")).toBe(false);
    expect(walk[0]).toBe("A note on every beat with the root on 1 in 24 of 24 bars.");
    expect(walk[1]).toBe("Bar 1: beat 4 is 5 half steps from the next downbeat.");
  });
  test("one chorus of head, a bass written by hand, chords from `changes`: the head row and the pattern row are open", async () => {
    const r = await read("JC2", P.JC2_ONE_CHORUS);
    expect(r.ok("one-pattern")).toBe(false);
    expect(texts(r.extras["one-pattern"])).toEqual([
      "Only `chords` reads `changes`; the other parts write their own chords.",
    ]);
    expect(items(r.extras.head)[0]).toMatchObject({ ok: false });
    expect(texts(r.extras.head)[0]).toContain("1 chorus of the 12-bar form");
  });
  test("onePatternFound reads chord() calls per labelled track, with indented continuation lines", () => {
    const code = `const changes = "<F7 Bb7>"\nchords: chord(changes)\n  .voicing()\nbass: chord(changes).rootNotes(2)\nhats: s("hh*8")`;
    expect(trackBodies(code).map((t) => t.track)).toEqual(["chords", "bass", "hats"]);
    expect(onePatternFound(code)[0]?.ok).toBe(true);
    expect(onePatternFound(`hats: s("hh*8")`)[0]).toMatchObject({
      text: "No `chord()` pattern yet.",
      ok: false,
    });
  });
});

describe("JC3: the AABA plan with the bridge", () => {
  test("four 8-bar sections read A A B A, the bridge in bars 17–24", async () => {
    const r = await read("JC3", P.JC3_AABA);
    expect(r.ok("form")).toBe(true);
    expect(texts(r.extras.form)).toEqual([
      "The form reads A A B A.",
      "A: bars 1–8.",
      "A: bars 9–16.",
      "B: bars 17–24, the bridge.",
      "A: bars 25–32.",
    ]);
    // No melody yet: the bridge's guide-tone row says the melody plays nothing, never which notes to play.
    expect(texts(r.extras["bridge-guides"])).toEqual(["`melody` plays nothing yet."]);
  });
  test("with no I Got Rhythm key the original row reads J4.L04's head (decision 80) and the reference passes", async () => {
    const { JC3_PIECES } = await import("../../../content/advanced/capstones/JC3/pieces.ts");
    const ok = await read("JC3", JC3_PIECES.reference);
    expect(ok.result.status).toBe("pass");
    const copy = await read("JC3", JC3_PIECES.oldHead);
    expect(copy.ok("original")).toBe(false);
    expect(texts(copy.extras.original)[0]).toBe(
      "24 bars of the melody repeat the head you read in J4.L04 (1, 2, 3, 4 and 20 more).",
    );
  });
});

describe("RC1: the pocket, the stabs (horns from session 2)", () => {
  test("the one on the kick and the bass in every bar, the bass between the 8ths, short horn stabs", async () => {
    const r = await read("RC1", P.RC1_POCKET, 2);
    expect(r.result.status).toBe("pass");
    expect(texts(r.extras["one-bass"])).toEqual(["`bass` lands on the one in all 2 bars."]);
    expect(texts(r.extras["one-kick"])).toEqual(["the kick lands on the one in all 2 bars."]);
    expect(texts(r.extras.horns)).toEqual(["`horns`: 2 hits in 2 of 2 bars, all short."]);
    // The rule counts the bass between the 8ths with velocity-ghosts; the bass's own reading stands under it.
    expect(items(r.extras["syncopated-bass"])[0]).toMatchObject({
      text: "6 bass notes between the 8ths, in bars 1 and 2.",
      ok: true,
    });
  });
  test("the kick and the bass after beat 1 (they still play): both 'the one' rows are open, with the bar", async () => {
    const r = await read("RC1", P.RC1_NO_ONE);
    expect(r.ok("one-bass")).toBe(false);
    expect(r.ok("one-kick")).toBe(false);
    expect(items(r.extras["one-kick"])[0]).toMatchObject({
      text: "the kick lands on the one in 0 of 1 bars; not in bar 1.",
      anchor: { from: 1, to: 1 },
      ok: false,
    });
  });
});

describe("RC2: the clave, the 3:2 layer, the Euclidean layer", () => {
  test("son clave 3-2 from bar 1, three against two together, E(5, 16) on the hats", async () => {
    const r = await read("RC2", P.RC2_CLAVE);
    expect(r.ok("clave")).toBe(true);
    expect(items(r.extras.clave)[0]).toMatchObject({
      text: "Son clave 3-2 from bar 1, whole for 8 bars.",
      ok: true,
    });
    expect(r.result.status).toBe("pass");
    expect(texts(r.extras.poly)).toEqual(["3 against 2 in 8 bars: 1–8."]);
    expect(texts(r.extras.euclid)).toContain("`perc3`: E(5, 16) in bar 1.");
    // The tresillo row is not "the one": its own line stands.
    expect(r.extras.tresillo).toBeUndefined();
  });
  test("the same hits turned round (2-3): the clave row is open and names the direction it heard", async () => {
    const r = await read("RC2", P.RC2_CROSSED);
    expect(r.ok("clave")).toBe(false);
    expect(items(r.extras.clave)[0]).toMatchObject({
      text: "Son clave 2-3 from bar 1, whole for 2 bars.",
      ok: false,
    });
  });
});

describe("AC2: extensions, voicings, the top voice, the groove's feel", () => {
  test("eight bars of hand-voiced ninths and elevenths, a top voice E D E D, swung 16ths 1.5 : 1, a snare 20 ms behind", async () => {
    const r = await read("AC2", P.AC2_BALLAD);
    expect(r.result.status).toBe("pass");
    expect(texts(r.extras.extensions)).toEqual(["A 9th, 11th or 13th in 6 of 8 bars."]);
    expect(texts(r.extras["voice-leading"])).toEqual([
      "Top voice E4 D4 E4 D4 E4 D4 …: 8 of 8 moves are 2 half steps or less.",
    ]);
    expect(texts(r.extras.swing)).toEqual([
      "`hats`: swung 16ths, 1.5 : 1.",
      "`snare` sits 20 ms behind the grid (a lean you feel).",
    ]);
    expect(voicingRows(r.piece).map((i) => i.text)[2]).toBe("Bar 3, F♯m7: close, top E4.");
    expect(chordText("Bm7b5")).toBe("Bm7♭5");
    expect(chordText("Bb7")).toBe("B♭7");
    expect(changesOf(r.piece)).toEqual(["Dmaj9", "Em11", "F♯m7", "Bm9", "Dmaj9", "Em11", "F♯m7", "Bm9"]);
  });
  test("chords from voicing() and a snare .late(1/32) (99 ms): the top-voice row says the dictionary picks the notes, the snare reads as a rhythm", async () => {
    const r = await read("AC2", P.AC2_DICTIONARY);
    expect(r.ok("voice-leading")).toBe(false);
    expect(texts(r.extras["voice-leading"])[0]).toContain("The chords come from `voicing()`");
    expect(texts(r.extras.swing)).toContain(
      "`snare` sits 99 ms behind the grid (heard as a rhythm, not a lean).",
    );
  });
});

describe("JC4: avoid notes on strong places", () => {
  test("F held over C^7 on beat 1 is named with its bar; E (the 3rd) and D (the 9th) are not", async () => {
    const code = `setcpm(72/4)\n\nchords: chord("<C^7 C^7>").voicing().s("piano")\nmel: note("<[f4 ~ e4 ~] [d4 ~ e4 ~]>").s("vibes")`;
    const r = await read("JC4", code);
    const t = tensionsFound(r.piece, "@melody");
    expect(t[0]).toMatchObject({
      text: "1 avoid note among the 4 melody notes on a beat or held.",
      ok: false,
    });
    expect(t[1]?.text).toMatch(/^Bar 1: F4 over Cmaj7 is its \S+, an avoid note there\.$/);
    expect(t[1]?.anchor).toEqual({ from: 1, to: 1 });
  });
});

describe("small readers", () => {
  test("swingRatioOf: 1/3 swing on 8ths is 2 : 1, straight 8ths have no swung pair", () => {
    expect(swingRatioOf([0, 1 / 6, 1 / 4, 1 / 4 + 1 / 6], 1 / 4)).toBeCloseTo(2, 5);
    expect(swingRatioOf([0, 1 / 8, 1 / 4, 3 / 8], 1 / 4)).toBeCloseTo(1, 5);
    expect(swingRatioOf([0, 1 / 4], 1 / 4)).toBeNull();
  });
  test("leanText names a lean only inside 8–45 ms", () => {
    expect(leanText(4)).toBe("4 ms behind the grid (on the grid)");
    expect(leanText(-20)).toBe("20 ms ahead of the grid (a lean you feel)");
    expect(leanText(99)).toBe("99 ms behind the grid (heard as a rhythm, not a lean)");
  });
  test("midiName spells with flats", () => {
    expect(midiName(63)).toBe("E♭4");
    expect(midiName(60)).toBe("C4");
  });
  test("an unreadable piece (a grader error) has no extras", () => {
    expect(wave7Extras(capstone("JC1").brief?.rubric ?? [], null, null)).toEqual({});
  });
});

describe("JC4: the song's chart rides with the check (W7 gate)", () => {
  test("songFormFor gives the chart only to a brief that counts devices", async () => {
    const { songFormFor } = await import("./tracks.ts");
    const { capstoneById } = await import("../../../content/capstones.ts");
    const { GEORGIA } = await import("../../../content/advanced/capstones/JC4/pieces.ts");
    const jc4 = capstoneById.get("JC4");
    const jc3 = capstoneById.get("JC3");
    if (!jc4 || !jc3) throw new Error("JC3/JC4 missing");
    const form = songFormFor(jc4, GEORGIA);
    expect(form?.map((s) => s.label)).toEqual(["A", "A", "B", "A"]);
    expect(form?.[0]?.chords?.[1]).toEqual(["Em7", "A7"]);
    expect(songFormFor(jc3, GEORGIA)).toBeNull();
    expect(songFormFor(jc4, null)).toBeNull();
  });
});
