// Exhaustive table tests for the Wave 3 key seams over all 15 major and all 15 minor keys (C♭ … C♯,
// a♭ … a♯), cross-checked with tonal: scale spelling and degrees, syllables, key signatures in written
// order, circle-of-fifths neighbours, every diatonic interval, and Strudel interval strings.
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { Interval, Key, Note } from "tonal";
import {
  FLAT_ORDER,
  fifthsNeighbours,
  fifthsOfKey,
  intervalInKey,
  intervalOf,
  keyFromFifths,
  labelPitch,
  parseStrudelInterval,
  SHARP_ORDER,
  signatureOf,
  strudelInterval,
} from "./index.ts";

const FIFTHS = Array.from({ length: 15 }, (_, i) => i - 7);
const MAJORS = FIFTHS.map((f) => keyFromFifths(f, "major"));
const MINORS = FIFTHS.map((f) => keyFromFifths(f, "minor"));
const SYL_MAJOR = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const DEG_MAJOR = ["1", "2", "3", "4", "5", "6", "7"];
// Do-based minor: natural minor is 1 2 b3 4 5 b6 b7 (do re me fa sol le te).
const SYL_MINOR = ["do", "re", "me", "fa", "sol", "le", "te"];
const DEG_MINOR = ["1", "2", "b3", "4", "5", "b6", "b7"];
const keyName = (k: KeySpec) => `${k.tonic} ${k.mode}`;

describe("all 15 major and 15 minor keys", () => {
  test("the circle has the 15 textbook keys", () => {
    expect(MAJORS.map((k) => k.tonic).join(" ")).toBe("Cb Gb Db Ab Eb Bb F C G D A E B F# C#");
    expect(MINORS.map((k) => k.tonic).join(" ")).toBe("Ab Eb Bb F C G D A E B F# C# G# D# A#");
  });

  for (const key of [...MAJORS, ...MINORS]) {
    const major = key.mode === "major";
    const scale = major ? Key.majorKey(key.tonic).scale : Key.minorKey(key.tonic).natural.scale;
    test(`${keyName(key)}: every scale note in three octaves is labelled and spelled as tonal spells it`, () => {
      const tonicMidi = Note.midi(`${key.tonic}4`) as number;
      for (const octShift of [-12, 0, 12])
        scale.forEach((name, i) => {
          // The scale note at or above the tonic, then moved by whole octaves.
          let midi = Note.midi(`${name}4`) as number;
          while (midi < tonicMidi) midi += 12;
          midi += octShift;
          const l = labelPitch(midi, key);
          expect([keyName(key), midi, l.degree]).toEqual([
            keyName(key),
            midi,
            (major ? DEG_MAJOR : DEG_MINOR)[i] as string,
          ]);
          expect(l.syllable).toBe((major ? SYL_MAJOR : SYL_MINOR)[i] as string);
          expect(l.chromatic).toBe(false);
          // Spelling, octave included: tonal's own name for that MIDI with this letter.
          expect(l.name.replace(/-?\d+$/, "")).toBe(name);
          expect(Note.midi(l.name)).toBe(midi);
        });
    });

    test(`${keyName(key)}: the twelve pitch classes get twelve different labels, spelled by their degree`, () => {
      const tonicMidi = Note.midi(`${key.tonic}4`) as number;
      const labels = Array.from({ length: 12 }, (_, i) => labelPitch(tonicMidi + i, key));
      expect(new Set(labels.map((l) => l.degree)).size).toBe(12);
      for (const l of labels) {
        // The letter of the name is `num − 1` letters above the tonic's letter.
        const steps =
          ("CDEFGAB".indexOf(l.name[0] as string) - "CDEFGAB".indexOf(key.tonic[0] as string) + 7) % 7;
        expect([l.name, steps + 1]).toEqual([l.name, l.num]);
        expect(Note.midi(l.name)).toBe(l.midi);
        expect(l.syllable).not.toBe("?");
      }
      // Major keys follow Oak's chromatic convention: b2 b3 #4 b6 b7.
      if (major) expect(labels.map((l) => l.degree).join(" ")).toBe("1 b2 2 b3 3 4 #4 5 b6 6 b7 7");
    });

    test(`${keyName(key)}: key signature in written order, matching tonal`, () => {
      const sig = signatureOf(key);
      const tonalSig = major ? Key.majorKey(key.tonic).keySignature : Key.minorKey(key.tonic).keySignature;
      expect(sig.fifths).toBe(tonalSig.length * (tonalSig.startsWith("b") ? -1 : 1));
      expect(fifthsOfKey(key)).toBe(sig.fifths);
      const accidentals = [...sig.sharps, ...sig.flats];
      // Exactly the altered notes of the scale, in the order a signature is written.
      expect([...accidentals].sort()).toEqual(scale.filter((n) => /[#b]/.test(n)).sort());
      const order: readonly string[] = sig.fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
      expect(accidentals).toEqual(order.slice(0, accidentals.length));
      expect(sig.sharps.length === 0 || sig.flats.length === 0).toBe(true);
      // The two keys that share it.
      expect(keyName(major ? sig.major : sig.minor)).toBe(keyName(key));
      expect(sig.minor.tonic).toBe(Key.majorKey(sig.major.tonic).minorRelative);
    });

    test(`${keyName(key)}: circle-of-fifths neighbours`, () => {
      const n = fifthsNeighbours(key);
      const f = fifthsOfKey(key);
      const cw = fifthsOfKey(n.clockwise);
      const ccw = fifthsOfKey(n.counterclockwise);
      // One step round the circle, wrapping to the enharmonic key past seven accidentals.
      expect(cw).toBe(f === 7 ? -4 : f + 1);
      expect(ccw).toBe(f === -7 ? 4 : f - 1);
      expect(n.clockwise.mode).toBe(key.mode);
      // The neighbour a fifth up sounds a fifth (7 semitones) above.
      expect(
        ((Note.chroma(n.clockwise.tonic) as number) - (Note.chroma(key.tonic) as number) + 12) % 12,
      ).toBe(7);
      expect(
        ((Note.chroma(key.tonic) as number) - (Note.chroma(n.counterclockwise.tonic) as number) + 12) % 12,
      ).toBe(7);
      expect(fifthsOfKey(n.relative)).toBe(f);
      expect(n.parallel.tonic).toBe(key.tonic);
    });

    test(`${keyName(key)}: every interval between two degrees of the scale, as tonal names it`, () => {
      const degs = major ? DEG_MAJOR : DEG_MINOR;
      degs.forEach((from, i) => {
        degs.forEach((to, j) => {
          const info = intervalInKey(from, to, key);
          const a = `${scale[i]}4`;
          // The note of `to` at or above `from` by letter (the same letter = the octave above).
          const steps = (j - i + 7) % 7 || 7;
          const oct = 4 + Math.floor(("CDEFGAB".indexOf(a[0] as string) + steps) / 7);
          const b = `${scale[j]}${oct}`;
          const t = Interval.get(Interval.distance(a, b));
          expect([keyName(key), from, to, info.name]).toEqual([keyName(key), from, to, `${t.q}${t.num}`]);
          expect(info.semitones).toBe(t.semitones as number);
          expect(info.direction).toBe("up");
          // The same two notes by MIDI, spelled in the key, name the same interval.
          expect(intervalOf(Note.midi(a) as number, Note.midi(b) as number, key).name).toBe(info.name);
          // Down to the lower `to`: the inversion.
          const down = intervalInKey(from, to, key, { direction: "down" });
          expect(down.semitones).toBe(i === j ? 0 : 12 - info.semitones);
        });
      });
    });
  }
});

describe("intervalInKey: the classroom facts", () => {
  test("C major", () => {
    const C = keyFromFifths(0);
    expect(intervalInKey("1", "3", C).name).toBe("M3");
    expect(intervalInKey("3", "5", C).name).toBe("m3");
    expect(intervalInKey("1", "5", C).long).toBe("perfect 5th");
    expect(intervalInKey("4", "7", C)).toMatchObject({ name: "A4", tritone: true });
    expect(intervalInKey("7", "4", C)).toMatchObject({ name: "d5", tritone: true });
    expect(intervalInKey("1", "1", C)).toMatchObject({ name: "P8", long: "octave" });
    expect(intervalInKey("5", "1", C, { direction: "down" })).toMatchObject({
      name: "P5",
      direction: "down",
    });
    expect(intervalInKey("1", "b3", C)).toMatchObject({ name: "m3", low: "C4", high: "Eb4" });
  });
  test("bad input throws", () => {
    expect(() => intervalInKey("9x", "1", keyFromFifths(0))).toThrow(RangeError);
  });
});

describe("Strudel interval strings", () => {
  const NAMES = [
    "P1",
    "m2",
    "M2",
    "A2",
    "m3",
    "M3",
    "d4",
    "P4",
    "A4",
    "d5",
    "P5",
    "A5",
    "m6",
    "M6",
    "m7",
    "M7",
    "P8",
    "M9",
    "M10",
  ];
  test("number first, quality second, minus for down", () => {
    expect(strudelInterval("M3")).toBe("3M");
    expect(strudelInterval("m2", "down")).toBe("-2m");
    expect(strudelInterval("P8")).toBe("8P");
    expect(strudelInterval("P1", "down")).toBe("1P");
    expect(() => strudelInterval("M5")).toThrow(RangeError);
  });
  test("round trip, and the size agrees with tonal for every name both ways", () => {
    for (const name of NAMES)
      for (const dir of ["up", "down"] as const) {
        const text = strudelInterval(name, dir);
        const p = parseStrudelInterval(text);
        expect(p?.name).toBe(name);
        expect(p?.text).toBe(text);
        // tonal reads the same string as Strudel's transpose does.
        expect([text, p?.semitones]).toEqual([text, Interval.semitones(text)]);
      }
  });
  test("quality-first strings are read too, as Strudel reads them", () => {
    expect(parseStrudelInterval("M3")).toMatchObject({ text: "3M", semitones: 4, direction: "up" });
    expect(parseStrudelInterval("-m2")).toMatchObject({ text: "-2m", semitones: -1, direction: "down" });
    expect(parseStrudelInterval("1P")).toMatchObject({ direction: "unison", semitones: 0 });
  });
  test("not interval names", () => {
    for (const bad of ["3", "-5", "3X", "M4", "P3", "", "3 M"]) expect(parseStrudelInterval(bad)).toBeNull();
  });
});
