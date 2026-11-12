import { describe, expect, test } from "bun:test";
import { intervalOf } from "@oak/theory";
import { Interval, Note } from "tonal";
import { composeInterval, qualitiesFor, qualityForKey, splitInterval } from "./interval.ts";

describe("interval answers", () => {
  test("qualities follow the number: perfect for 1 4 5 8, major/minor for 2 3 6 7", () => {
    expect(qualitiesFor(5)).toEqual(["P", "A", "d"]);
    expect(qualitiesFor(3)).toEqual(["M", "m", "A", "d"]);
    expect(qualitiesFor(8)).toEqual(["P", "A", "d"]);
    expect(qualitiesFor(1)).toEqual(["P", "A"]);
    expect(composeInterval(3, "m")).toBe("m3");
    expect(composeInterval(5, "M")).toBeNull();
    expect(composeInterval(3, "P")).toBeNull();
  });
  test("every composed name has the size tonal gives it", () => {
    for (let n = 1; n <= 8; n++)
      for (const q of qualitiesFor(n)) {
        const name = composeInterval(n, q) as string;
        const tonalName = `${n}${q}`;
        const top = Note.transpose("C4", tonalName);
        expect(intervalOf("C4", top).name).toBe(name);
        expect(intervalOf("C4", top).semitones).toBe(Interval.semitones(tonalName) as number);
        expect(name).toBe(`${q}${n}`);
      }
  });
  test("forgiving text: words, ordinals, the tritone", () => {
    expect(splitInterval("minor third")).toEqual({ name: "m3", num: 3, q: "m" });
    expect(splitInterval("perfect 5th")).toEqual({ name: "P5", num: 5, q: "P" });
    expect(splitInterval("octave")).toEqual({ name: "P8", num: 8, q: "P" });
    expect(splitInterval("tritone")).toEqual({ name: "TT", num: null, q: null });
    expect(splitInterval("third")).toBeNull();
    expect(splitInterval("")).toBeNull();
  });
  test("quality keys: Shift+M is major, m minor", () => {
    expect(qualityForKey("M")).toBe("M");
    expect(qualityForKey("m")).toBe("m");
    expect(qualityForKey("p")).toBe("P");
    expect(qualityForKey("A")).toBe("A");
    expect(qualityForKey("x")).toBeNull();
  });
});
