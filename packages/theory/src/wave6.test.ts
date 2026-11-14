// Wave 6 theory seam (docs/design/wave6.md §3.1). Every fact here was checked by hand against the chord table and
// the scale tables; the code spellings (`n("3#")`) are checked against Strudel in strudel.test.ts.
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import {
  CHROMATIC_DEGREES,
  CHROMATIC_STEPS,
  DIATONIC_SEVENTHS,
  MODE_CHARACTERISTIC,
  SEVENTH_DEGREES,
} from "@oak/content-kit";
import { parseChordSymbol, toLeadSheet } from "./chords.ts";
import { degreeSemitones } from "./scales.ts";
import type { ChordId } from "./types.ts";
import {
  appliedChord,
  appliedChords,
  appliedReading,
  appliedTargets,
  beatGrid,
  borrowedChords,
  borrowedReading,
  CHROMATIC_DEGREE_TABLE,
  CHROMATIC_SOLFEGE,
  characteristicTonesOf,
  chromaticChordKind,
  chromaticLabel,
  compoundInterval,
  dominantChain,
  dorianFour,
  guideToneLine,
  guideTones,
  intervalFacts,
  keyAtBarOfPlan,
  keyDisplay,
  keyDistance,
  keyLiftScale,
  keySevenths,
  MODE_COLOURS,
  modalChords,
  modalProgression,
  modeColour,
  modesContaining,
  outsideChordKind,
  parentMajor,
  parseKeyPlan,
  picardy,
  pivotChords,
  pushAmount,
  SEVENTH_CHORDS,
  seventhFromPcs,
  seventhQualityOf,
} from "./wave6.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const Am: KeySpec = { tonic: "A", mode: "minor" };
const ch = (s: string): ChordId => parseChordSymbol(s) as ChordId;

describe("seventh chords", () => {
  test("the five qualities with their code and lead-sheet spellings", () => {
    expect(SEVENTH_CHORDS.map((s) => [s.quality, s.code, s.leadSheet, s.triad, s.seventh])).toEqual([
      ["maj7", "^7", "maj7", "maj", "M7"],
      ["7", "7", "7", "maj", "m7"],
      ["m7", "m7", "m7", "min", "m7"],
      ["m7b5", "m7b5", "m7♭5", "dim", "m7"],
      ["dim7", "o7", "°7", "dim", "d7"],
    ]);
    expect(SEVENTH_CHORDS.map((s) => s.intervals)).toEqual([
      [0, 4, 7, 11],
      [0, 4, 7, 10],
      [0, 3, 7, 10],
      [0, 3, 6, 10],
      [0, 3, 6, 9],
    ]);
    // The chord table and content-kit's degree spelling of each quality name the same notes.
    for (const s of SEVENTH_CHORDS)
      expect(SEVENTH_DEGREES[s.quality].map((d) => degreeSemitones(d))).toEqual(s.intervals);
  });
  test("from symbols always; from notes only when the notes spell one", () => {
    expect(["C^7", "Cm7", "C7", "Cm7b5", "Co7", "G7/B", "C13", "Dm9"].map(seventhQualityOf)).toEqual([
      "maj7",
      "m7",
      "7",
      "m7b5",
      "dim7",
      "7",
      "7",
      "m7",
    ]);
    expect(["C", "Cm", "C6", "Csus", "nonsense"].map(seventhQualityOf)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    // D F A C with F in the bass: Dm7, first inversion.
    expect(seventhFromPcs([2, 5, 9, 0], 5)).toMatchObject({ quality: "m7", inversion: 1, symbol: "Dm7/F" });
    expect(seventhFromPcs([11, 2, 5, 9], 11)?.symbol).toBe("Bm7♭5");
    expect(seventhFromPcs([0, 4, 7], 0)).toBeNull();
  });
  test("the diatonic sevenths of major and minor keys, numerals both ways", () => {
    expect(keySevenths(C).map((k) => `${k.rn} ${k.symbol}`)).toEqual([
      "Imaj7 Cmaj7",
      "ii7 Dm7",
      "iii7 Em7",
      "IVmaj7 Fmaj7",
      "V7 G7",
      "vi7 Am7",
      "viiø7 Bm7♭5",
    ]);
    expect(keySevenths(Am).map((k) => `${k.rn} ${k.symbol}`)).toEqual([
      "i7 Am7",
      "iiø7 Bm7♭5",
      "IIImaj7 Cmaj7",
      "iv7 Dm7",
      "v7 Em7",
      "VImaj7 Fmaj7",
      "VII7 G7",
    ]);
    // content-kit's table of diatonic seventh qualities says the same.
    expect(keySevenths(C).map((k) => k.chord.quality)).toEqual([...DIATONIC_SEVENTHS.major]);
    expect(keySevenths(Am).map((k) => k.chord.quality)).toEqual([...DIATONIC_SEVENTHS.minor]);
    const harmonic = keySevenths(Am, { form: "harmonic" });
    expect([harmonic[4]?.symbol, harmonic[6]?.symbol]).toEqual(["E7", "G♯°7"]);
    expect(keySevenths({ tonic: "Eb", mode: "major" }).map((k) => k.symbol)).toEqual([
      "E♭maj7",
      "Fm7",
      "Gm7",
      "A♭maj7",
      "B♭7",
      "Cm7",
      "Dm7♭5",
    ]);
  });
});

describe("guide tones", () => {
  test("the 3rd and the 7th of each chord", () => {
    expect(guideTones(ch("Dm7"))).toEqual({
      third: { role: "third", pc: 5, name: "F", interval: "m3" },
      seventh: { role: "seventh", pc: 0, name: "C", interval: "m7" },
    });
    expect(guideTones(ch("G7")).third?.name).toBe("B");
    expect(guideTones(ch("G7")).seventh?.name).toBe("F");
    expect(guideTones(ch("Co7")).seventh).toMatchObject({ name: "Bbb", interval: "d7", pc: 9 });
    expect(guideTones(ch("C"))).toMatchObject({ third: { name: "E" }, seventh: null });
    expect(guideTones(ch("C6")).seventh).toBeNull();
    expect(guideTones(ch("Csus")).third).toBeNull();
  });
  test("the two lines through ii7–V7–Imaj7 in C: F F E and C B B", () => {
    const chords = ["Dm7", "G7", "C^7"].map(ch);
    const a = guideToneLine(chords);
    expect(a.map((s) => s?.name)).toEqual(["F", "F", "E"]);
    expect(a.map((s) => s?.role)).toEqual(["third", "seventh", "third"]);
    expect(a.map((s) => s?.move)).toEqual([0, 0, -1]);
    const b = guideToneLine(chords, { start: "seventh" });
    expect(b.map((s) => s?.name)).toEqual(["C", "B", "B"]);
    expect(b.map((s) => s?.move)).toEqual([0, -1, 0]);
    // A minor ii–V–i (U12.L05): Bm7♭5 E7 Am7: D D C and A G♯ G.
    const m = ["Bm7b5", "E7", "Am7"].map(ch);
    expect(guideToneLine(m).map((s) => s?.name)).toEqual(["D", "D", "C"]);
    expect(guideToneLine(m, { start: "seventh" }).map((s) => s?.name)).toEqual(["A", "G#", "G"]);
  });
});

describe("interval inversion and compound intervals", () => {
  test("inversions add to nine and swap major with minor", () => {
    expect(["M3", "m7", "P5", "A4", "m2"].map((i) => intervalFacts(i).inversion)).toEqual([
      "m6",
      "M2",
      "P4",
      "d5",
      "M7",
    ]);
  });
  test("a compound interval is an octave plus a simple one", () => {
    expect(intervalFacts("M10")).toEqual({
      name: "M10",
      semitones: 16,
      simple: "M3",
      octaves: 1,
      compound: true,
      inversion: "m6",
    });
    expect(intervalFacts("M9")).toMatchObject({ simple: "M2", semitones: 14 });
    expect(intervalFacts("P8")).toMatchObject({ compound: false, octaves: 0, simple: "P8" });
    expect(["M2", "M3", "P4", "M6"].map((i) => compoundInterval(i))).toEqual(["M9", "M10", "P11", "M13"]);
    expect(() => compoundInterval("M10")).toThrow();
  });
});

describe("modes", () => {
  test("the colour tone of each mode", () => {
    expect(MODE_COLOURS.map((m) => [m.name, m.colour, m.family, m.brightness])).toEqual([
      ["Lydian", "♯4", "major", 7],
      ["Ionian", "4 and 7", "major", 6],
      ["Mixolydian", "♭7", "major", 5],
      ["Dorian", "♮6", "minor", 4],
      ["Aeolian", "♭6", "minor", 3],
      ["Phrygian", "♭2", "minor", 2],
    ]);
    for (const [mode, c] of Object.entries(MODE_CHARACTERISTIC)) {
      expect(modeColour(mode as "dorian")?.characteristic).toEqual([c.tone]);
      expect(modeColour(mode as "dorian")?.family).toBe(c.parent);
    }
    expect(characteristicTonesOf({ tonic: "G", mode: "mixolydian" })).toEqual([
      { degree: "b7", display: "♭7", syllable: "te", pc: 5, name: "F", n: 6 },
    ]);
    expect(characteristicTonesOf({ tonic: "D", mode: "dorian" })[0]).toMatchObject({
      name: "B",
      degree: "6",
      n: 5,
    });
    expect(characteristicTonesOf({ tonic: "F", mode: "lydian" })[0]).toMatchObject({
      name: "B",
      degree: "#4",
      n: 3,
    });
    expect(characteristicTonesOf({ tonic: "E", mode: "phrygian" })[0]).toMatchObject({
      name: "F",
      degree: "b2",
      n: 1,
    });
  });
  test("modal numerals: ♭VII, II and ♭II are read in the mode, never as applied chords", () => {
    const rn = (tonic: string, mode: "mixolydian" | "dorian" | "lydian" | "phrygian") =>
      modalChords({ tonic, mode })
        .map((k) => `${k.rn}=${k.symbol}`)
        .join(" ");
    expect(rn("G", "mixolydian")).toBe("I=G ii=Am iiio=B° IV=C v=Dm vi=Em bVII=F");
    expect(rn("D", "dorian")).toBe("i=Dm ii=Em III=F IV=G v=Am vio=B° VII=C");
    expect(rn("F", "lydian")).toBe("I=F II=G iii=Am #ivo=B° V=C vi=Dm vii=Em");
    expect(rn("E", "phrygian")).toBe("i=Em bII=F III=G iv=Am vo=B° VI=C vii=Dm");
  });
  test("the characteristic progressions, in a key", () => {
    expect(modalProgression({ tonic: "G", mode: "mixolydian" }).map((k) => k.symbol)).toEqual([
      "G",
      "F",
      "C",
    ]);
    expect(modalProgression({ tonic: "D", mode: "dorian" }).map((k) => k.symbol)).toEqual(["Dm", "G"]);
    expect(modalProgression({ tonic: "F", mode: "lydian" }).map((k) => k.symbol)).toEqual(["F", "G"]);
    expect(modalProgression({ tonic: "E", mode: "phrygian" }).map((k) => k.symbol)).toEqual(["Em", "F"]);
    expect(modeColour("dorian")?.progressions[1]).toEqual(["i7", "IV7"]);
  });
  test("the parent major and which modes a set of notes fits", () => {
    expect(parentMajor({ tonic: "D", mode: "dorian" })).toEqual(C);
    expect(parentMajor({ tonic: "G", mode: "mixolydian" })).toEqual(C);
    expect(parentMajor({ tonic: "E", mode: "phrygian" })).toEqual(C);
    expect(parentMajor({ tonic: "F", mode: "lydian" })).toEqual(C);
    expect(parentMajor(Am)).toEqual(C);
    // G A B C D E F on G: only Mixolydian. Without the F: Lydian, Ionian and Mixolydian all fit.
    expect(modesContaining([7, 9, 11, 0, 2, 4, 5], 7)).toEqual(["mixolydian"]);
    expect(modesContaining([7, 9, 11, 2, 4], 7)).toEqual(["lydian", "major", "mixolydian"]);
  });
});

describe("chromatic degrees", () => {
  test("the taught seven with their syllables and n steps", () => {
    const byDeg = Object.fromEntries(CHROMATIC_DEGREE_TABLE.map((d) => [d.degree, d]));
    expect(
      CHROMATIC_DEGREES.map((d) => [d, byDeg[d]?.syllable, byDeg[d]?.step, byDeg[d]?.resolvesTo]),
    ).toEqual([
      ["#4", "fi", "3#", "5"],
      ["b7", "te", "6b", "6"],
      ["#5", "si", "4#", "6"],
      ["#1", "di", "0#", "2"],
      ["b2", "ra", "1b", "1"],
      ["b3", "me", "2b", "2"],
      ["b6", "le", "5b", "5"],
    ]);
    for (const d of CHROMATIC_DEGREE_TABLE) expect(CHROMATIC_STEPS[d.degree]).toBe(d.step);
    expect(CHROMATIC_SOLFEGE.up.join(" ")).toBe("do di re ri mi fa fi sol si la li ti");
    expect(CHROMATIC_SOLFEGE.down.join(" ")).toBe("do ti te la le sol se fa mi me re ra");
  });
  test("a chromatic note is labelled by the chord under it, then by direction", () => {
    // G♯ under E7 in C is ♯5 (si); the same pitch under A♭ is ♭6 (le).
    expect(chromaticLabel(68, C, { chord: ch("E7") })).toMatchObject({
      degree: "#5",
      syllable: "si",
      name: "G#",
      step: "4#",
      chromatic: true,
    });
    expect(chromaticLabel(68, C, { chord: ch("Ab") })).toMatchObject({
      degree: "b6",
      syllable: "le",
      name: "Ab",
      step: "5b",
    });
    expect(chromaticLabel(66, C, { chord: ch("D7") })).toMatchObject({
      degree: "#4",
      syllable: "fi",
      name: "F#",
    });
    expect(chromaticLabel(61, C, { direction: 1 })).toMatchObject({
      degree: "#1",
      syllable: "di",
      name: "C#",
    });
    expect(chromaticLabel(61, C, { direction: -1 })).toMatchObject({
      degree: "b2",
      syllable: "ra",
      name: "Db",
    });
    expect(chromaticLabel(70, C)).toMatchObject({ degree: "b7", syllable: "te", name: "Bb", step: "6b" });
    expect(chromaticLabel(64, C)).toMatchObject({ degree: "3", syllable: "mi", chromatic: false, step: 2 });
  });
});

describe("applied chords", () => {
  test("the targets of a key", () => {
    expect(appliedTargets(C).map((t) => t.rn)).toEqual(["ii", "iii", "IV", "V", "vi"]);
    expect(appliedTargets(Am).map((t) => t.rn)).toEqual(["III", "iv", "V", "VI", "VII"]);
  });
  test("V/x, V7/x and vii°/x with their leading tones", () => {
    expect(appliedChord("V7", 5, C)).toMatchObject({
      rn: "V7/V",
      symbol: "D7",
      leadingTone: { name: "F#", degree: "#4", display: "♯4", resolvesTo: "G" },
      chromatic: ["F#"],
    });
    expect(appliedChords(C, ["V7"]).map((a) => `${a.rn}=${a.symbol}`)).toEqual([
      "V7/ii=A7",
      "V7/iii=B7",
      "V7/IV=C7",
      "V7/V=D7",
      "V7/vi=E7",
    ]);
    expect(appliedChord("V", 6, C)).toMatchObject({ symbol: "E", leadingTone: { name: "G#", degree: "#5" } });
    expect(appliedChord("viio", 5, C)).toMatchObject({
      rn: "viio/V",
      symbol: "F♯°",
      leadingTone: { name: "F#" },
    });
    expect(appliedChord("viio7", 2, C)).toMatchObject({
      symbol: "C♯°7",
      leadingTone: { name: "C#", degree: "#1" },
    });
    expect(appliedChord("V7", 4, C)?.chromatic).toEqual(["Bb"]);
    expect(appliedChord("V7", 7, C)).toBeNull();
    // In A minor the dominant is E major, so V7/V is B7 with D♯.
    expect(appliedChord("V7", 5, Am)).toMatchObject({
      rn: "V7/V",
      symbol: "B7",
      leadingTone: { name: "D#" },
    });
  });
  test("reading a chord back, and whether it resolves", () => {
    expect(appliedReading(ch("D7"), C, ch("G"))).toMatchObject({
      rn: "V7/V",
      kind: "V7",
      resolves: true,
      target: { rn: "V", symbol: "G" },
    });
    expect(appliedReading(ch("D7"), C, ch("F"))).toMatchObject({ rn: "V7/V", resolves: false });
    expect(appliedReading(ch("E"), C, ch("Am"))).toMatchObject({ rn: "V/vi", kind: "V", resolves: true });
    expect(appliedReading(ch("F#o"), C, ch("G"))).toMatchObject({
      rn: "viio/V",
      kind: "viio",
      resolves: true,
    });
    expect(appliedReading(ch("G7"), C, ch("C"))).toBeNull();
  });
  test("a dominant chain: III7–VI7–II7–V7 in C (Five Foot Two)", () => {
    const chain = dominantChain(C, 4);
    expect(chain.map((x) => x.symbol)).toEqual(["E7", "A7", "D7", "G7"]);
    expect(chain.map((x) => x.chainRn)).toEqual(["III7", "VI7", "II7", "V7"]);
    expect(chain.map((x) => x.rn)).toEqual(["V7/vi", "V7/ii", "V7/V", "V7"]);
    expect(dominantChain({ tonic: "Bb", mode: "major" }, 4).map((x) => x.symbol)).toEqual([
      "D7",
      "G7",
      "C7",
      "F7",
    ]);
  });
});

describe("mixture", () => {
  test("the five chords a major key borrows from its parallel minor", () => {
    expect(borrowedChords(C).map((b) => [b.rn, b.symbol, b.sourceRn, b.lowered])).toEqual([
      ["iv", "Fm", "iv", ["b6"]],
      ["bVI", "A♭", "VI", ["b6", "b3"]],
      ["bVII", "B♭", "VII", ["b7"]],
      ["bIII", "E♭", "III", ["b7", "b3"]],
      ["iio", "D°", "iio", ["b6"]],
    ]);
    expect(borrowedChords({ tonic: "G", mode: "major" }).map((b) => b.symbol)).toEqual([
      "Cm",
      "E♭",
      "F",
      "B♭",
      "A°",
    ]);
    expect(borrowedReading(ch("Dm7b5"), C)?.rn).toBe("iio");
    expect(borrowedReading(ch("Fm7"), C)?.rn).toBe("iv");
    expect(borrowedReading(ch("F"), C)).toBeNull();
  });
  test("Picardy third and Dorian IV in minor", () => {
    expect(picardy(Am)).toMatchObject({ rn: "I", symbol: "A", raised: { degree: "3", name: "C#" } });
    expect(dorianFour(Am)).toMatchObject({ rn: "IV", symbol: "D", raised: { degree: "6", name: "F#" } });
    expect(() => picardy(C)).toThrow();
  });
  test("where a chord stands in its key", () => {
    expect(chromaticChordKind(ch("Dm7"), C)).toBe("diatonic");
    expect(chromaticChordKind(ch("D7"), C, ch("G"))).toBe("applied");
    expect(chromaticChordKind(ch("Ab"), C)).toBe("borrowed");
    expect(chromaticChordKind(ch("Bb"), C)).toBe("borrowed");
    expect(chromaticChordKind(ch("F#"), C)).toBe("other");
    expect(chromaticChordKind(ch("E"), Am)).toBe("diatonic");
    expect(chromaticChordKind(ch("A"), Am)).toBe("picardy");
    expect(chromaticChordKind(ch("D"), Am)).toBe("dorian-iv");
    // As a rule or an answer names them (content-kit OutsideChordKind).
    expect(outsideChordKind(ch("D7"), C, ch("G"))).toBe("secondary-dominant");
    expect(outsideChordKind(ch("F#o"), C, ch("G"))).toBe("applied-leading-tone");
    expect(outsideChordKind(ch("Fm"), C)).toBe("borrowed");
    expect(outsideChordKind(ch("A"), Am)).toBe("borrowed");
    expect(outsideChordKind(ch("G7"), C, ch("C"))).toBeNull();
  });
});

describe("modulation", () => {
  test("pivot chords between C major and G major", () => {
    expect(pivotChords(C, { tonic: "G", mode: "major" }).map((p) => `${p.symbol} ${p.from}/${p.to}`)).toEqual(
      ["C I/IV", "Em iii/vi", "G V/I", "Am vi/ii"],
    );
    expect(pivotChords(C, { tonic: "Db", mode: "major" })).toEqual([]);
    expect(pivotChords(C, Am).length).toBeGreaterThanOrEqual(4);
  });
  test("the distance of a key change", () => {
    expect(keyDistance(C, { tonic: "D", mode: "major" })).toEqual({
      semitones: 2,
      fifths: 2,
      relation: "up-step",
      commonTones: 5,
      pivots: 2,
    });
    expect(keyDistance(C, { tonic: "Db", mode: "major" })).toMatchObject({
      semitones: 1,
      fifths: -5,
      relation: "up-half",
      commonTones: 2,
      pivots: 0,
    });
    expect(keyDistance(C, { tonic: "G", mode: "major" })).toMatchObject({
      fifths: 1,
      relation: "dominant",
      commonTones: 6,
    });
    expect(keyDistance(C, Am).relation).toBe("relative");
    expect(keyDistance(C, { tonic: "C", mode: "minor" }).relation).toBe("parallel");
  });
  test("a key plan read from a patterned .scale()", () => {
    const plan = parseKeyPlan("<C4:major!16 D4:major!8>");
    expect(plan?.totalBars).toBe(24);
    expect(plan?.spans.map((s) => [s.key.tonic, s.key.mode, s.fromBar, s.bars])).toEqual([
      ["C", "major", 0, 16],
      ["D", "major", 16, 8],
    ]);
    expect(plan?.changes).toHaveLength(1);
    expect(plan?.changes[0]).toMatchObject({ bar: 16, distance: { semitones: 2, relation: "up-step" } });
    if (!plan) throw new Error("plan");
    expect(keyAtBarOfPlan(plan, 15).tonic).toBe("C");
    expect(keyAtBarOfPlan(plan, 16).tonic).toBe("D");
    expect(keyAtBarOfPlan(plan, 24).tonic).toBe("C");
    expect(parseKeyPlan("C4:major")?.spans).toHaveLength(1);
    expect(parseKeyPlan("<C4:major G4:major>")?.changes[0]?.distance.relation).toBe("dominant");
    expect(parseKeyPlan("<C4:major [D4:major E4:major]>")).toBeNull();
    expect(keyLiftScale("C", 16, 2, 8)).toBe("<C4:major!16 D4:major!8>");
    expect(keyLiftScale("Bb", 8, 1, 8)).toBe("<Bb4:major!8 B4:major!8>");
  });
  test("keys as a sentence names them", () => {
    expect(keyDisplay({ tonic: "F#", mode: "dorian" })).toBe("F♯ Dorian");
    expect(keyDisplay({ tonic: "Bb", mode: "major" })).toBe("B♭ major");
    expect(toLeadSheet(ch("Bb"))).toBe("B♭");
  });
});

describe("rhythm II", () => {
  test("the compound beat grid: two dotted-quarter beats of 1 la li in 6/8, four in 12/8", () => {
    const g = beatGrid("6/8");
    expect([g.beats, g.division, g.compound, g.beatLen, g.subLen]).toEqual([2, 3, true, [1, 2], [1, 6]]);
    expect(g.lines.map((l) => l.label).join(" ")).toBe("1 la li 2 la li");
    expect(g.lines.filter((l) => l.level === "beat").map((l) => l.at)).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(beatGrid("12/8").lines.filter((l) => l.level === "beat")).toHaveLength(4);
    expect(() => beatGrid("7/8")).toThrow();
  });
  test("simple meters count 1 & or, with triplets, 1 trip let", () => {
    expect(
      beatGrid("4/4")
        .lines.map((l) => l.label)
        .join(" "),
    ).toBe("1 & 2 & 3 & 4 &");
    const t = beatGrid("4/4", { triplets: true });
    expect(t.division).toBe(3);
    expect(t.lines.slice(0, 3).map((l) => l.label)).toEqual(["1", "trip", "let"]);
    expect(t.subLen).toEqual([1, 12]);
  });
  test("a push by an eighth or a sixteenth, as code writes it", () => {
    expect(pushAmount("4/4", 8)).toEqual({ cycles: [1, 8], code: "1/8" });
    expect(pushAmount("4/4", 16)).toEqual({ cycles: [1, 16], code: "1/16" });
    expect(pushAmount("3/4", 8).code).toBe("1/6");
    expect(pushAmount("6/8", 8).code).toBe("1/6");
  });
});
