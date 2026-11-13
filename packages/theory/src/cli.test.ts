import { describe, expect, test } from "bun:test";
import { runTheoryCli } from "./cli.ts";

const json = (...args: string[]) => {
  const r = runTheoryCli(args);
  expect(r.code).toBe(0);
  return JSON.parse(r.out);
};

describe("theory CLI", () => {
  test("help and usage errors", () => {
    expect(runTheoryCli([]).out).toContain("theory <op>");
    const bad = runTheoryCli(["nope"]);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('unknown op "nope"');
    expect(runTheoryCli(["scale", "X:major"]).code).toBe(1);
    expect(runTheoryCli(["rn", "Cxyz", "C"]).code).toBe(1);
  });
  test("notes, spelling, intervals", () => {
    expect(json("note", "cs4", "f4", "c")).toMatchObject([
      { midi: 61, name: "C#4" },
      { midi: 65, name: "F4" },
      { midi: 48, defaultedOctave: true },
    ]);
    expect(json("spell", "68", "A:minor").name).toBe("G#4");
    expect(json("spell", "61", "C", "--down").name).toBe("Db4");
    expect(json("spell", "68", "C", "--chord", "E7").name).toBe("G#4");
    expect(json("interval", "C4", "E5")).toEqual({ interval: "M10", semitones: 16, inversion: "m6" });
    expect(json("invert", "A4").inversion).toBe("d5");
  });
  test("keys, scales, degrees, steps", () => {
    const s = json("scale", "Eb");
    expect(s.notes).toEqual(["Eb", "F", "G", "Ab", "Bb", "C", "D"]);
    expect(s.signature.accidentals).toBe(-3);
    expect(s.relative).toBe("C minor");
    expect(json("scale", "A:harmonic:minor").notes[6]).toBe("G#");
    expect(json("scale", "D_dorian").characteristic).toEqual(["6"]);
    expect(json("keysig", "F#m").notes).toEqual(["F#", "C#", "G#"]);
    expect(json("transpose", "C", "6")).toBe("Gb major");
    expect(json("degree", "eb4", "C").degree).toBe("b3");
    expect(json("step", "b7", "G").step).toBe("6b");
    expect(json("step", "b7", "G").note).toBe("F5");
    expect(json("n", "C4:major", "0", "4#", "7b").map((x: { midi: number }) => x.midi)).toEqual([60, 68, 71]);
    expect(json("circle")).toHaveLength(12);
  });
  test("Wave 3: labels, signatures, neighbours, intervals and Strudel interval strings", () => {
    expect(json("label", "66", "C", "--down")).toMatchObject({ degree: "b5", syllable: "se", name: "Gb4" });
    expect(json("label", "f#4", "D")).toMatchObject({ degree: "3", syllable: "mi", display: "F♯4" });
    expect(json("signature", "-3", "--minor")).toMatchObject({
      accidentals: ["Bb", "Eb", "Ab"],
      kind: "flats",
      key: "C minor",
    });
    expect(json("signature", "A").accidentals).toEqual(["F#", "C#", "G#"]);
    expect(json("signature", "0").kind).toBe("none");
    expect(json("neighbours", "C#")).toMatchObject({ clockwise: "Ab major", relative: "A# minor" });
    expect(json("between", "C4", "Eb4")).toMatchObject({ name: "m3", strudel: "3m", inversion: "M6" });
    expect(json("between", "67", "60")).toMatchObject({ name: "P5", direction: "down", strudel: "-5P" });
    expect(json("between", "66", "72", "G")).toMatchObject({ name: "d5", tritone: true });
    expect(json("ivl", "M3")).toMatchObject({ text: "3M", semitones: 4 });
    expect(json("ivl", "m2", "--down")).toMatchObject({ text: "-2m", semitones: -1 });
    expect(json("ivl", "-2m").name).toBe("m2");
    expect(runTheoryCli(["ivl", "M4"]).code).toBe(1);
    expect(json("degree-interval", "7", "4", "C")).toMatchObject({ name: "d5", strudel: "5d" });
    expect(json("degree-interval", "5", "1", "C", "--down")).toMatchObject({ name: "P5", strudel: "-5P" });
  });
  test("chords", () => {
    const c = json("chord", "C69");
    expect(c).toMatchObject({ code: "C69", leadSheet: "C6/9", canonical: true, family: "chord.sixth-sus" });
    expect(c.dicts.lefthand).toBe("wrong");
    expect(json("dict", "Caug", "triads").status).toBe("wrong");
    expect(json("identify", "e3", "g3", "c4")[0].chord).toBe("C/E");
    expect(json("identify", "bb3", "d4", "e4", "a4", "--bass", "c", "--rootless")[0].code).toBe("C13");
    expect(json("diatonic", "D", "--sevenths").map((x: { chord: string }) => x.chord)).toEqual([
      "Dmaj7",
      "Em7",
      "F♯m7",
      "Gmaj7",
      "A7",
      "Bm7",
      "C♯m7♭5",
    ]);
  });
  test("Roman numerals, cadences, schemas", () => {
    expect(json("rn", "D7/F#", "C").rn).toBe("V65/V");
    expect(json("chord-of", "viio7/V", "G").leadSheet).toBe("C♯°7");
    expect(json("function", "iv", "C").function).toBe("PD");
    expect(json("cadence", "V7", "vi", "C").cadence).toBe("DC");
    expect(json("cadence", "V7", "I", "C", "--melody-not-tonic").cadence).toBe("IAC");
    expect(json("progression", "G", "G", "D", "Em", "C").schema.id).toBe("schema.axis");
    expect(json("schema", "C", "ii7", "V7", "Imaj7").id).toBe("schema.ii-v-i");
    expect(json("schemas").length).toBeGreaterThan(10);
  });
  test("time and text", () => {
    expect(json("tempo", "120", "4/4")).toMatchObject({ tempoLine: "setcpm(120/4)", cpm: 30 });
    expect(json("meter", "6/8", "60").tempoLine).toBe("setcpm(60/2)");
    expect(json("pos", "3/8", "4/4").label).toBe("2&");
    expect(json("pos", "2/3", "3/4", "--pickup")).toMatchObject({ bar: 0, pickup: true });
    expect(json("euclid", "3", "8").grid).toBe("x..x..x.");
    expect(json("grid", "son-clave-3-2").steps).toBe("x..x..x...x.x...");
    expect(json("normalize", "rn", "vii°").normalized).toBe("viio");
    expect(json("normalize", "key", "f#", "minor").normalized).toBe("F# minor");
    expect(json("table")).toHaveLength(28);
  });
  test("Wave 4: read, symbol, cadence-of, rn-parts, tone", () => {
    expect(json("read", "C4", "E4", "G4", "--bass", "E", "--key", "C")).toMatchObject({
      leadSheet: "C/E",
      code: "C",
      inversion: 1,
      rn: "I6",
      function: "T",
    });
    expect(json("read", "C4", "D4", "E4")).toBeNull();
    expect(json("read", "B3", "D4", "F4")).toMatchObject({ leadSheet: "B°", code: "Bo", quality: "dim" });
    expect(json("symbol", "Cdim")).toMatchObject({ leadSheet: "C°", code: "Co" });
    expect(json("symbol", "G/B")).toMatchObject({ leadSheet: "G/B", code: "G" });
    expect(json("symbol", "Caug", "--dict", "triads")).toMatchObject({ code: "Caug", inDict: "wrong" });
    expect(runTheoryCli(["symbol", "Hxyz"]).code).toBe(1);
    expect(json("cadence-of", "G", "C", "C", "--melody", "C5").cadence).toBe("PAC");
    expect(json("cadence-of", "G", "C", "C", "--melody", "E5").cadence).toBe("IAC");
    expect(json("cadence-of", "F", "C", "C").cadence).toBe("PC");
    expect(json("rn-parts", "V6", "G")).toMatchObject({
      degree: 5,
      quality: "maj",
      inversion: 1,
      chord: "D/F♯",
    });
    expect(json("tone", "F4", "C", "--prev", "E4", "--next", "G4").role).toBe("passing");
    expect(json("tone", "F4", "C", "--prev", "F4", "--next", "E4", "--strong").role).toBe("suspension");
    expect(json("tone", "E4", "C").role).toBe("chord-tone");
  });
});
