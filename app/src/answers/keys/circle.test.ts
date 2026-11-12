import { describe, expect, test } from "bun:test";
import { intervalOf, normalizeText } from "@oak/theory";
import { Key } from "tonal";
import {
  CIRCLE_MAJORS,
  CIRCLE_MINORS,
  circleKeyOf,
  letterOfDia,
  parseSignatureValue,
  readSignature,
  ringPoint,
  signatureDia,
  signatureFor,
} from "./circle.ts";

describe("the circle", () => {
  test("clockwise from C, each key a perfect fifth above the last; enharmonic pairs at the bottom", () => {
    const common = CIRCLE_MAJORS.filter((k) => !k.enharmonic).map((k) => k.key.tonic);
    expect(common).toEqual(["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"]);
    for (let i = 0; i + 1 < common.length; i++)
      expect(intervalOf(`${common[i]}4`, `${common[i + 1]}5`).semitones % 12).toBe(7);
    expect(CIRCLE_MAJORS.filter((k) => k.enharmonic).map((k) => [k.position, k.key.tonic])).toEqual([
      [5, "Cb"],
      [6, "Gb"],
      [7, "C#"],
    ]);
  });
  test("the inner ring is the relative minors (tonal agrees)", () => {
    for (const min of CIRCLE_MINORS) {
      const maj = CIRCLE_MAJORS.find((k) => k.fifths === min.fifths);
      expect(maj?.position).toBe(min.position);
      expect(Key.majorKey(maj?.key.tonic as string).minorRelative).toBe(min.key.tonic);
    }
    expect(CIRCLE_MINORS).toHaveLength(12);
    expect(CIRCLE_MINORS.find((k) => k.position === 6)?.label).toBe("E♭m");
  });
  test("answer texts are what the key normaliser writes", () => {
    for (const k of [...CIRCLE_MAJORS, ...CIRCLE_MINORS]) expect(normalizeText("key", k.text)).toBe(k.text);
    expect(circleKeyOf("e flat")?.text).toBe("Eb major");
    expect(circleKeyOf("F#m")?.spoken).toBe("F sharp minor");
    expect(circleKeyOf("H major")).toBeNull();
  });
  test("positions: C at the top, F♯ at the bottom", () => {
    const c = { x: 100, y: 100 };
    const top = ringPoint(0, 50, c);
    expect(Math.round(top.x)).toBe(100);
    expect(Math.round(top.y)).toBe(50);
    const bottom = ringPoint(6, 50, c);
    expect(Math.round(bottom.y)).toBe(150);
  });
});

describe("key signatures", () => {
  test("signatures in written order, as tonal spells the key", () => {
    expect(signatureFor({ tonic: "D", mode: "major" })).toEqual(["F#", "C#"]);
    expect(signatureFor({ tonic: "Bb", mode: "major" })).toEqual(["Bb", "Eb"]);
    expect(signatureFor({ tonic: "C", mode: "minor" })).toEqual(["Bb", "Eb", "Ab"]);
    expect(Key.majorKey("Eb").keySignature).toBe("bbb");
  });
  test("reading back what was placed", () => {
    expect(readSignature(["F#", "C#"]).text).toBe("Reads as D major or B minor.");
    expect(readSignature(["C#", "F#"]).text).toBe(
      "The right sharps for D major or B minor, but written out of order.",
    );
    expect(readSignature(["C#", "F#"]).inOrder).toBe(false);
    expect(readSignature(["F#", "G#"]).valid).toBe(false);
    expect(readSignature(["F#", "Bb"]).text).toBe("A key signature has sharps or flats, never both.");
    expect(readSignature(["Bb", "Eb", "Ab"]).major?.tonic).toBe("Eb");
    expect(readSignature([]).text).toBe("No sharps or flats: C major or A minor.");
  });
  test("values parse forgivingly", () => {
    expect(parseSignatureValue("F♯ C# x Bb")).toEqual(["F#", "C#", "Bb"]);
  });
  test("standard staff positions: treble F♯ on the top line, bass two octaves down", () => {
    expect(letterOfDia(signatureDia("F#", "treble"))).toBe("F");
    expect(signatureDia("F#", "treble")).toBe(38);
    expect(signatureDia("Bb", "treble")).toBe(34);
    expect(signatureDia("F#", "bass")).toBe(24);
    for (const a of ["F#", "C#", "G#", "D#", "A#", "E#", "B#", "Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"])
      expect(letterOfDia(signatureDia(a, "treble"))).toBe(a[0] as string);
  });
});
