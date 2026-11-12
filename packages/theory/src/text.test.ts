import { describe, expect, test } from "bun:test";
import { normalizeText, parseKeyText } from "./index.ts";

describe("normalizeText (exercises §3.9)", () => {
  test("notes", () => {
    const n = (t: string) => normalizeText("note", t);
    expect(n("e♭")).toBe("Eb");
    expect(n("Eb")).toBe("Eb");
    expect(n("f#")).toBe("F#");
    expect(n("F sharp")).toBe("F#");
    expect(n("b flat")).toBe("Bb");
    expect(n("Cx")).toBe("C##");
    expect(n("Dbb")).toBe("Dbb");
    expect(n("G natural")).toBe("G");
    expect(n("c4")).toBe("C4");
    expect(n("Ab 3")).toBe("Ab3");
    expect(n("H")).toBeNull();
    expect(n("C#b")).toBeNull();
  });
  test("chords", () => {
    const c = (t: string) => normalizeText("chord", t);
    expect(c("CΔ7")).toBe("C^7");
    expect(c("Cmaj7")).toBe("C^7");
    expect(c("cm7")).toBe("Cm7");
    expect(c("C-7")).toBe("Cm7");
    expect(c("Bø7")).toBe("Bm7b5");
    expect(c("G7")).toBe("G7");
    expect(c("B°7")).toBe("Bo7");
    expect(c("C/E")).toBe("C/E");
    expect(c("E♭maj7")).toBe("Eb^7");
    expect(c("C+")).toBe("Caug");
    expect(c("nope")).toBeNull();
  });
  test("Roman numerals (case-sensitive)", () => {
    const r = (t: string) => normalizeText("rn", t);
    expect(r("vii°")).toBe("viio");
    expect(r("viiø7")).toBe("viiø7");
    expect(r("viih7")).toBe("viiø7");
    expect(r("V7/V")).toBe("V7/V");
    expect(r("♭VII")).toBe("bVII");
    expect(r("V65")).toBe("V65");
    expect(r("ii")).toBe("ii");
    expect(r("II")).toBe("II");
    expect(r("IIX")).toBeNull();
  });
  test("intervals", () => {
    const i = (t: string) => normalizeText("interval", t);
    expect(i("P5")).toBe("P5");
    expect(i("perfect 5th")).toBe("P5");
    expect(i("m3")).toBe("m3");
    expect(i("M3")).toBe("M3");
    expect(i("minor 3rd")).toBe("m3");
    expect(i("major sixth")).toBe("M6");
    expect(i("perfect octave")).toBe("P8");
    expect(i("augmented fourth")).toBe("A4");
    expect(i("maj6")).toBe("M6");
    expect(i("aug4")).toBe("A4");
    expect(i("dim5")).toBe("d5");
    expect(i("A4")).toBe("A4");
    expect(i("M5")).toBeNull();
    expect(i("b3")).toBeNull();
    // Strudel's form, as in `.transpose("3M")`: number first; the sign is a direction, not part of the name.
    expect(i("3M")).toBe("M3");
    expect(i("-2m")).toBe("m2");
    expect(i("8P")).toBe("P8");
    expect(i("4M")).toBeNull();
  });
  test("keys", () => {
    const k = (t: string) => normalizeText("key", t);
    expect(k("Eb major")).toBe("Eb major");
    expect(k("c# minor")).toBe("C# minor");
    expect(k("F#m")).toBe("F# minor");
    expect(k("Am")).toBe("A minor");
    expect(k("Bb")).toBe("Bb major");
    expect(k("D dorian")).toBe("D dorian");
    expect(k("A harmonic minor")).toBe("A harmonic minor");
    expect(k("E♭ major")).toBe("Eb major");
    expect(k("C4:major")).toBe("C major");
    expect(k("A3:harmonic:minor")).toBe("A harmonic minor");
    expect(k("X major")).toBeNull();
    expect(parseKeyText("G mixolydian")).toEqual({ tonic: "G", mode: "mixolydian" });
  });
});
