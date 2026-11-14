// Wave 6 notation seams (docs/design/wave6.md §3.3): the host helpers, and the engraving facts U12–U17 rely on,
// pinned on the existing pipeline: ties across beats and bar lines, dotted values, compound-meter beaming, triplets
// and tuplets, a signature change at a double bar, modal signatures both ways, chromatic notes spelled by the chord
// under them, seventh-chord symbols and applied numerals.
import { describe, expect, test } from "bun:test";
import type { KeySpec, MeterSpec } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { chordSymbolDisplay, notate, numeralDisplay, parseNoteList } from "./index.ts";
import {
  harmonyLabels,
  keyChangesOf,
  MODAL_SIGNATURE_DEFAULT,
  modalSignatureKey,
  scoreRhythm,
} from "./wave6.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const D: KeySpec = { tonic: "D", mode: "major" };
const line = (dsl: string, meter: MeterSpec = METERS["4/4"]) => parseNoteList(dsl, { track: "mel", meter });
/** The ABC body (after the header lines), without the `!class=…!` decorations. */
const body = (abc: string): string =>
  abc
    .split("\n")
    .filter((l) => !/^[A-Z]:|^%%/.test(l))
    .join("\n")
    .replace(/!class=oak-e\d+!/g, "")
    .trim();

describe("keyChangesOf", () => {
  test("a content key plan: bar 9 is cycle 8; with a pickup bar 9 is cycle 9", () => {
    const plan = [
      { bar: 1, key: C },
      { bar: 9, key: D },
    ];
    expect(keyChangesOf(plan)).toEqual({ key: C, keyChanges: [{ bar: 8, key: D }] });
    expect(keyChangesOf(plan, { pickup: true })).toEqual({ key: C, keyChanges: [{ bar: 9, key: D }] });
  });
  test("the grader's key spans; a repeated key is dropped; one key has no changes", () => {
    expect(
      keyChangesOf([
        { fromBar: 1, key: C },
        { fromBar: 5, key: C },
        { fromBar: 17, key: D },
      ]),
    ).toEqual({ key: C, keyChanges: [{ bar: 16, key: D }] });
    expect(keyChangesOf([{ fromBar: 1, key: C }])).toEqual({ key: C });
    expect(keyChangesOf([])).toEqual({ key: null });
  });
  test("the staff writes the new signature after a double barline", () => {
    const events = line("C4:4 E4:4 G4:4 E4:4 | D4:4 F#4:4 A4:4 F#4:4");
    const { abc } = notate({
      events,
      meter: METERS["4/4"],
      bars: 2,
      staff: "treble",
      ...keyChangesOf([
        { bar: 1, key: C },
        { bar: 2, key: D },
      ]),
    });
    expect(abc.abc).toContain(" || [K:D]");
    // F♯ is in the new signature: no accidental is written.
    expect(body(abc.abc)).toBe("C4 E4 G4 E4 || [K:D] D4 F4 A4 F4 |]");
  });
});

describe("modal signatures", () => {
  const G_MIX: KeySpec = { tonic: "G", mode: "mixolydian" };
  const events = line("G4:4 B4:4 D5:4 F5:4");
  test("default: the mode's own signature, the colour tone unmarked", () => {
    expect(MODAL_SIGNATURE_DEFAULT).toBe("mode");
    expect(modalSignatureKey(G_MIX)).toEqual(G_MIX);
    const { abc } = notate({
      events,
      meter: METERS["4/4"],
      key: modalSignatureKey(G_MIX),
      bars: 1,
      staff: "treble",
    });
    expect(abc.abc).toContain("K:Gmix");
    expect(body(abc.abc)).toBe("G4 B4 d4 f4 |]");
  });
  test("parallel: the tonic's major or minor signature, the colour tone as an accidental", () => {
    expect(modalSignatureKey(G_MIX, "parallel")).toEqual({ tonic: "G", mode: "major" });
    expect(modalSignatureKey({ tonic: "D", mode: "dorian" }, "parallel")).toEqual({
      tonic: "D",
      mode: "minor",
    });
    expect(modalSignatureKey({ tonic: "F", mode: "lydian" }, "parallel")).toEqual({
      tonic: "F",
      mode: "major",
    });
    expect(modalSignatureKey({ tonic: "E", mode: "phrygian" }, "parallel")).toEqual({
      tonic: "E",
      mode: "minor",
    });
    expect(modalSignatureKey(C, "parallel")).toEqual(C);
    const { abc } = notate({
      events,
      meter: METERS["4/4"],
      key: modalSignatureKey(G_MIX, "parallel"),
      bars: 1,
      staff: "treble",
    });
    expect(abc.abc).toContain("K:G\n");
    // The ♭7 (F natural) carries a natural sign against the one-sharp signature.
    expect(body(abc.abc)).toBe("G4 B4 d4 =f4 |]");
    // D Dorian against D minor: the ♮6 (B natural) is marked.
    const dor = notate({
      events: line("D4:4 F4:4 A4:4 B4:4"),
      meter: METERS["4/4"],
      key: modalSignatureKey({ tonic: "D", mode: "dorian" }, "parallel"),
      bars: 1,
      staff: "treble",
    });
    expect(dor.abc.abc).toContain("K:Dm");
    expect(body(dor.abc.abc)).toBe("D4 F4 A4 =B4 |]");
  });
});

describe("rhythm as the staff writes it (U13)", () => {
  const notes = (dsl: string, bars: number, meter: MeterSpec = METERS["4/4"]) =>
    notate({ events: line(dsl, meter), meter, key: C, bars, staff: "treble" });
  test("a dotted quarter and an eighth; a note held over the bar line is tied", () => {
    const a = notes("C4:4. D4:8 E4:2", 1);
    expect(body(a.abc.abc)).toBe("C6 D2 E8 |]");
    expect(scoreRhythm(a.score)).toEqual({ ties: 0, tiesAcrossBar: 0, dotted: 1, tuplets: [], exact: true });
    const b = notes("C4:4 D4:4 E4:4 G4:4~ | G4:4 A4:4 C5:2", 2);
    expect(body(b.abc.abc)).toBe("C4 D4 E4 G4- | G4 A4 c8 |]");
    expect(scoreRhythm(b.score)).toMatchObject({ ties: 1, tiesAcrossBar: 1, dotted: 0 });
  });
  test("a note held over a beat inside the bar is tied across the beat (the push of U13.L01)", () => {
    // Eighth rest, then quarters on every "&": each one is two tied eighths; the last is tied over the bar line.
    const s = notes("r:8 D4:4 E4:4 G4:4 C4:4 D4:4 E4:4 G4:4 C4:8", 2);
    const r = scoreRhythm(s.score);
    expect(r.exact).toBe(true);
    expect(r.ties).toBeGreaterThanOrEqual(6);
    expect(r.tiesAcrossBar).toBe(1);
  });
  test("6/8 beams in two groups of three; the dotted quarter is one beat", () => {
    const m = METERS["6/8"];
    const a = notes("C4:8 D4:8 E4:8 F4:8 G4:8 A4:8", 1, m);
    expect(a.abc.abc).toContain("M:6/8");
    expect(body(a.abc.abc)).toBe("C2D2E2 F2G2A2 |]");
    const b = notes("C4:4. D4:4 E4:8", 1, m);
    expect(body(b.abc.abc)).toBe("C6 D4 E2 |]");
    expect(scoreRhythm(b.score)).toMatchObject({ dotted: 1, exact: true, tuplets: [] });
  });
  test("12/8 beams four groups of three and rests by the beat", () => {
    const m = METERS["12/8"];
    const a = notes("C4:4. r:4. E4:8 F4:8 G4:8 A4:4.", 1, m);
    expect(a.abc.abc).toContain("M:12/8");
    expect(body(a.abc.abc)).toBe("C6 z6 E2F2G2 A6 |]");
    expect(a.score.approximate).toBe(false);
  });
  test("an eighth-note triplet, a quarter-note triplet and a quintuplet", () => {
    const a = notes("C4:8t D4:8t E4:8t G4:4 A4:4t G4:4t E4:4t", 1);
    expect(body(a.abc.abc)).toBe("(3:2:3C2D2E2 G4 (3:2:3A4 G4 E4 |]");
    expect(scoreRhythm(a.score).tuplets).toEqual([
      { p: 3, q: 2, r: 3, bar: 0 },
      { p: 3, q: 2, r: 3, bar: 0 },
    ]);
    const b = notes("(5:4 C4:16 D4:16 E4:16 F4:16 G4:16) G4:4 E4:2", 1);
    expect(body(b.abc.abc)).toBe("(5:4:5CDEFG G4 E8 |]");
    expect(b.score.approximate).toBe(false);
  });
});

describe("chromatic spelling by function, chord symbols and numerals (U12, U15, U16)", () => {
  test("the same pitch is G♯ under E7 and A♭ under A♭", () => {
    const events = parseNoteList("C4:1 | C4:1", { track: "mel" }).map((e, i) => {
      const { written: _w, ...rest } = e;
      return { ...rest, id: `mel|${i}`, midi: 68, pitchSource: "note-num" as const };
    });
    const { abc } = notate({
      events,
      meter: METERS["4/4"],
      key: C,
      bars: 2,
      staff: "treble",
      ...harmonyLabels([
        { bar: 1, beat: 1, symbol: "E7", rn: "V7/vi" },
        { bar: 2, beat: 1, symbol: "Ab", rn: "bVI" },
      ]),
    });
    expect(abc.idMap.map((e) => e.pitches[0])).toEqual(["G#4", "Ab4"]);
    expect(abc.abc).toContain('"E7"');
    expect(abc.abc).toContain('"_V7/vi"');
    expect(abc.abc).toContain('"_♭VI"');
  });
  test("seventh-chord symbols as printed", () => {
    expect(["C^7", "Dm7", "G7", "Bm7b5", "Co7", "G7/B"].map(chordSymbolDisplay)).toEqual([
      "Cmaj7",
      "Dm7",
      "G7",
      "Bm7b5",
      "Co7",
      "G7/B",
    ]);
  });
  test("applied and borrowed numerals as printed", () => {
    expect(["V7/V", "viio7/ii", "bVI", "bVII", "iiø7", "iih7", "V65/V", "bII"].map(numeralDisplay)).toEqual([
      "V7/V",
      "vii°7/ii",
      "♭VI",
      "♭VII",
      "iiø7",
      "iiø7",
      "V65/V",
      "♭II",
    ]);
  });
  test("harmonyLabels places one list above and below; either line can be left out", () => {
    const list = [{ bar: 1, beat: 1, symbol: "D7", rn: "V7/V" }];
    expect(harmonyLabels(list)).toEqual({
      chords: [{ bar: 0, beat: 1, symbol: "D7" }],
      romans: [{ bar: 0, beat: 1, rn: "V7/V" }],
    });
    expect(harmonyLabels(list, { numerals: false })).toEqual({ chords: [{ bar: 0, beat: 1, symbol: "D7" }] });
    expect(harmonyLabels(list, { pickup: true, symbols: false })).toEqual({
      romans: [{ bar: 1, beat: 1, rn: "V7/V" }],
    });
  });
});
