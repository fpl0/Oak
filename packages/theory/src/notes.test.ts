import { describe, expect, test } from "bun:test";
import { Interval } from "tonal";
import {
  freqToMidi,
  intervalBetween,
  intervalSemitones,
  invertInterval,
  midiToFreq,
  midiToPc,
  normalizeNoteName,
  noteToMidi,
  parseInterval,
  parseNote,
  pcOf,
} from "./index.ts";

describe("parseNote: Strudel semantics (spike facts: s/f accidentals, octave 3 default)", () => {
  // Measured against Strudel 1.2.6 (note("…") → MIDI) in Wave 0 and again in this package's probe.
  const golden: [string, number][] = [
    ["c4", 60],
    ["cs4", 61],
    ["ef4", 63],
    ["f4", 65],
    ["ff4", 64],
    ["c", 48],
    ["bb3", 58],
    ["bf3", 58],
    ["b", 59],
    ["cs#4", 62],
    ["c##4", 62],
    ["cb-1", -1],
    ["c10", 132],
    ["E#5", 77],
    ["Bs3", 60],
    ["Fb4", 64],
    ["a4", 69],
    ["C#4", 61],
  ];
  for (const [text, midi] of golden) test(`${text} = ${midi}`, () => expect(noteToMidi(text)).toBe(midi));

  test("structure and the defaulted octave flag", () => {
    expect(parseNote("ef4")).toEqual({ midi: 63, letter: "E", alt: -1, oct: 4, defaultedOctave: false });
    expect(parseNote("c")).toEqual({ midi: 48, letter: "C", alt: 0, oct: 3, defaultedOctave: true });
    expect(parseNote("f")?.alt).toBe(0);
  });
  test("rejects non-notes and more than two accidentals", () => {
    for (const bad of ["", "h4", "c###4", "60", "c4.5", "x", "C 4"]) expect(parseNote(bad)).toBeNull();
  });
  test("normalizeNoteName gives tonal-compatible scientific names", () => {
    expect(normalizeNoteName("cs4")).toBe("C#4");
    expect(normalizeNoteName("ef4")).toBe("Eb4");
    expect(normalizeNoteName("ff4")).toBe("Fb4");
    expect(normalizeNoteName("c")).toBe("C3");
  });
});

describe("pitch classes and frequency", () => {
  test("pcOf", () => {
    expect(pcOf("C")).toBe(0);
    expect(pcOf("Eb")).toBe(3);
    expect(pcOf("F#")).toBe(6);
    expect(pcOf("Cb")).toBe(11);
    expect(pcOf("B#")).toBe(0);
    expect(pcOf("E♭")).toBe(3);
    expect(pcOf("bf")).toBe(10);
    expect(() => pcOf("H")).toThrow();
  });
  test("midiToPc wraps negatives", () => {
    expect(midiToPc(-1)).toBe(11);
    expect(midiToPc(61)).toBe(1);
  });
  test("A4 = 440 Hz = MIDI 69; C4 ≈ 261.63 Hz", () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
    expect(freqToMidi(440)).toBe(69);
    expect(freqToMidi(880)).toBe(81);
    expect(freqToMidi(415.3047)).toBeCloseTo(68, 3);
  });
});

describe("intervals: every interval against textbook facts and tonal", () => {
  test("named textbook examples", () => {
    expect(intervalBetween("C", "E")).toBe("M3");
    expect(intervalBetween("C", "Eb")).toBe("m3");
    expect(intervalBetween("C", "G")).toBe("P5");
    expect(intervalBetween("F", "B")).toBe("A4");
    expect(intervalBetween("B", "F")).toBe("d5");
    expect(intervalBetween("C", "C#")).toBe("A1");
    expect(intervalBetween("C", "Db")).toBe("m2");
    expect(intervalBetween("C", "B#")).toBe("A7");
    expect(intervalBetween("B", "Cb")).toBe("d2");
    expect(intervalBetween("C#", "Bb")).toBe("d7");
    expect(intervalBetween("E", "C")).toBe("m6");
    expect(intervalBetween("C4", "E5")).toBe("M10");
    expect(intervalBetween("C4", "C5")).toBe("P8");
    expect(intervalBetween("C4", "G5")).toBe("P12");
    expect(intervalBetween("E4", "C4")).toBe("M3");
    expect(intervalBetween("cs4", "e4")).toBe("m3");
  });

  test("all 12×12 pairs of common spellings match tonal's distance", () => {
    const names = [
      "C",
      "C#",
      "Db",
      "D",
      "D#",
      "Eb",
      "E",
      "F",
      "F#",
      "Gb",
      "G",
      "G#",
      "Ab",
      "A",
      "A#",
      "Bb",
      "B",
    ];
    let checked = 0;
    for (const a of names) {
      for (const b of names) {
        const tonalName = Interval.distance(a, b); // "3M" style, ascending within the octave
        const t = Interval.get(tonalName);
        if (t.empty || (t.num as number) < 1) continue;
        const ours = intervalBetween(a, b);
        const p = parseInterval(ours);
        expect(p?.num).toBe(t.num as number);
        expect(mod12(p?.semitones ?? -99)).toBe(mod12(t.semitones as number));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(250);
  });

  test("semitones of every simple interval", () => {
    const facts: Record<string, number> = {
      P1: 0,
      m2: 1,
      M2: 2,
      m3: 3,
      M3: 4,
      P4: 5,
      A4: 6,
      d5: 6,
      P5: 7,
      A5: 8,
      m6: 8,
      M6: 9,
      d7: 9,
      m7: 10,
      M7: 11,
      P8: 12,
      M9: 14,
      P11: 17,
      M13: 21,
    };
    for (const [n, s] of Object.entries(facts)) expect(intervalSemitones(n)).toBe(s);
    for (const bad of ["M5", "P3", "m4", "x3", "P0"]) expect(parseInterval(bad)).toBeNull();
  });

  test("inversion within the octave (inversions sum to 9; M↔m, A↔d, P↔P)", () => {
    const pairs: [string, string][] = [
      ["m3", "M6"],
      ["M3", "m6"],
      ["P5", "P4"],
      ["A4", "d5"],
      ["m2", "M7"],
      ["M2", "m7"],
      ["P1", "P8"],
      ["P8", "P1"],
      ["M10", "m6"],
    ];
    for (const [a, b] of pairs) expect(invertInterval(a)).toBe(b);
    for (const n of ["m2", "M2", "m3", "M3", "P4", "A4", "d5", "P5", "m6", "M6", "m7", "M7"]) {
      expect(intervalSemitones(n) + intervalSemitones(invertInterval(n))).toBe(12);
    }
  });
});

const mod12 = (n: number) => ((n % 12) + 12) % 12;
