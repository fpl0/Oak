import { describe, expect, test } from "bun:test";
import type { Degree } from "@oak/api";
import { evalHeadless } from "@oak/grader/testing";
import { parseRN, rnToChord, toLeadSheet } from "@oak/theory";
import {
  beatSyllables,
  chromaticMidi,
  degreeForDigit,
  gridCounts,
  gridToCode,
  insertItem,
  moveItem,
  padOrder,
  pickKey,
  poolOrder,
  popSlot,
  putSlot,
  removeItem,
  rnDisplay,
  rnForKey,
  rnPalette,
  sliderText,
  snapToStep,
  toggleCase,
  typingLetter,
  withInversion,
} from "./keys.ts";

describe("degree pad keys", () => {
  const major: Degree[] = ["1", "2", "3", "4", "5", "6", "7"];
  const minor: Degree[] = ["1", "2", "b3", "4", "5", "b6", "b7"];
  test("digits pick the set's degree on that number", () => {
    expect(degreeForDigit(3, major)).toBe("3");
    expect(degreeForDigit(3, minor)).toBe("b3");
    expect(degreeForDigit(7, minor)).toBe("b7");
    expect(degreeForDigit(8, major)).toBeNull();
    expect(degreeForDigit(2, ["1", "3", "5"])).toBeNull();
  });
  test("prefixes ask for the altered degree; both spellings present prefer the natural", () => {
    const both: Degree[] = ["1", "b3", "3", "5", "b7", "7"];
    expect(degreeForDigit(3, both)).toBe("3");
    expect(degreeForDigit(3, both, "flat")).toBe("b3");
    expect(degreeForDigit(4, ["1", "#4", "5"], "sharp")).toBe("#4");
    expect(degreeForDigit(4, ["1", "#4", "5"])).toBe("#4");
    expect(degreeForDigit(5, both, "flat")).toBeNull();
  });
  test("pad order: by number, flat before natural before sharp", () => {
    expect(padOrder(["5", "b3", "1", "3", "#4", "b7"])).toEqual(["1", "b3", "3", "#4", "5", "b7"]);
  });
  test("slots fill, replace and pop", () => {
    expect(putSlot([], 3, "1")).toEqual(["1"]);
    expect(putSlot(["1", "3", "5"], 3, "7")).toEqual(["1", "3", "5"]);
    expect(putSlot(["1", "3", "5"], 3, "7", 1)).toEqual(["1", "7", "5"]);
    expect(putSlot(["1"], 1, "5")).toEqual(["5"]);
    expect(popSlot(["1", "3"])).toEqual(["1"]);
    expect(popSlot([])).toEqual([]);
  });
});

describe("Roman numeral palette", () => {
  test("triads in T | PD | D columns (ux §4.5)", () => {
    const g = rnPalette(["triads"]);
    expect(g.map((x) => [x.id, x.buttons.map((b) => b.display)])).toEqual([
      ["T", ["I", "vi", "iii"]],
      ["PD", ["IV", "ii"]],
      ["D", ["V", "vii°"]],
    ]);
  });
  test("every palette numeral parses and names the chord it says (C major)", () => {
    const key = { tonic: "C", mode: "major" } as const;
    const all = rnPalette(["triads", "sevenths", "secondary", "borrowed"]).flatMap((g) => g.buttons);
    const named = Object.fromEntries(
      all.map((b) => {
        const rn = parseRN(b.rn, key);
        if (!rn) throw new Error(`palette numeral ${b.rn} does not parse`);
        return [b.display, toLeadSheet(rnToChord(rn, key))];
      }),
    );
    expect(named).toMatchObject({
      I: "C",
      ii: "Dm",
      "vii°": "B°",
      "vii°7/V": "F♯°7",
      Imaj7: "Cmaj7",
      V7: "G7",
      viiø7: "Bm7♭5",
      "V/V": "D",
      "V7/V": "D7",
      "V/vi": "E",
      "♭VII": "B♭",
      "♭VI": "A♭",
      "♭III": "E♭",
      iv: "Fm",
      "♭II": "D♭",
    });
  });
  test("keys: digit = triad, Shift = seventh, - = flat degree", () => {
    const allow = ["triads", "sevenths", "borrowed"] as const;
    expect(rnForKey(5, { allow })).toBe("V");
    expect(rnForKey(7, { allow })).toBe("viio");
    expect(rnForKey(5, { shift: true, allow })).toBe("V7");
    expect(rnForKey(2, { shift: true, allow })).toBe("ii7");
    expect(rnForKey(7, { flat: true, allow })).toBe("bVII");
    expect(rnForKey(5, { flat: true, allow })).toBeNull();
    expect(rnForKey(7, { flat: true, allow: ["triads"] })).toBeNull();
    expect(rnForKey(5, { shift: true, allow: ["triads"] })).toBeNull();
    expect(rnForKey(5, { allow: ["sevenths"] })).toBe("V7");
  });
  test("inversions and case", () => {
    expect(withInversion("I", 1)).toBe("I6");
    expect(withInversion("I", 2)).toBe("I64");
    expect(withInversion("V7", 1)).toBe("V65");
    expect(withInversion("V7", 3)).toBe("V42");
    expect(withInversion("V65", 0)).toBe("V7");
    expect(withInversion("viio", 1)).toBe("viio6");
    expect(withInversion("V7/V", 2)).toBe("V43/V");
    expect(withInversion("I", 3)).toBeNull();
    const key = { tonic: "C", mode: "major" } as const;
    for (const rn of ["I6", "I64", "V65", "V43", "V42", "viio6", "V43/V"])
      expect(parseRN(rn, key)?.inversion).toBe(
        rn.endsWith("6") || rn.includes("65") ? 1 : rn.includes("43") || rn.endsWith("64") ? 2 : 3,
      );
    expect(toggleCase("IV")).toBe("iv");
    expect(toggleCase("ii")).toBe("II");
    expect(toggleCase("bVII")).toBe("bvii");
    expect(toggleCase("viio")).toBe("viio");
    expect(toggleCase("Imaj7")).toBe("i7");
    expect(rnDisplay("viio7/V")).toBe("vii°7/V");
  });
});

describe("chromatic typing row", () => {
  test("A W S … K from C of the octave", () => {
    expect(chromaticMidi("KeyA", 4)).toBe(60);
    expect(chromaticMidi("KeyW", 4)).toBe(61);
    expect(chromaticMidi("KeyK", 4)).toBe(72);
    expect(chromaticMidi("KeyJ", 3)).toBe(59);
    expect(chromaticMidi("KeyQ", 4)).toBeNull();
    expect(typingLetter(64, 4)).toBe("D");
    expect(typingLetter(73, 4)).toBeNull();
  });
  test("picks by mode", () => {
    expect(pickKey([], 60, "single")).toEqual([60]);
    expect(pickKey([60], 60, "single")).toEqual([]);
    expect(pickKey([60], 62, "single")).toEqual([62]);
    expect(pickKey([67, 60], 64, "chord")).toEqual([60, 64, 67]);
    expect(pickKey([60, 64, 67], 64, "chord")).toEqual([60, 67]);
    expect(pickKey([60, 60], 62, "sequence")).toEqual([60, 60, 62]);
  });
});

describe("ordering", () => {
  test("move, insert, remove", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -4)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a"], 3, 0)).toEqual(["a"]);
    expect(insertItem(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(insertItem(["a", "b"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(insertItem(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(removeItem(["a", "b"], "a")).toEqual(["b"]);
  });
  test("the pool order is shuffled but stable", () => {
    const blocks = ["l1", "l2", "l3", "l4", "d1"].map((id) => ({ id }));
    const a = poolOrder(blocks).map((b) => b.id);
    expect(a).toEqual(poolOrder([...blocks].reverse()).map((b) => b.id));
    expect(a).not.toEqual(blocks.map((b) => b.id));
  });
});

describe("rhythm grid", () => {
  test("counts", () => {
    expect(beatSyllables(4)).toEqual(["", "e", "&", "a"]);
    expect(gridCounts(8, 1)).toEqual(["1", "&", "2", "&", "3", "&", "4", "&"]);
    expect(gridCounts(16, 1).slice(0, 5)).toEqual(["1", "e", "&", "a", "2"]);
    expect(gridCounts(12, 1).slice(0, 4)).toEqual(["1", "&", "a", "2"]);
    expect(gridCounts(6, 2, 3)).toEqual(["1", "&", "2", "&", "3", "&", "1", "&", "2", "&", "3", "&"]);
  });

  test("the audition code plays exactly the cells (headless Strudel)", async () => {
    const kick = [true, false, false, true, false, false, true, false];
    const snare = [false, false, true, false, false, false, true, false];
    const code = gridToCode(["kick", "snare"], [kick, snare], { stepsPerBar: 8, bars: 1, bpm: 100 });
    expect(code).toBe('setcpm(100/4)\n\nkick: s("bd ~ ~ bd ~ ~ bd ~")\nsnare: s("~ ~ sd ~ ~ ~ sd ~")');
    const r = await evalHeadless(code, 1);
    expect(r.cps).toBeCloseTo(100 / 4 / 60, 10);
    const onsets = (s: string) => r.events.filter((e) => e.s === s).map((e) => e.onset * 8);
    expect(onsets("bd")).toEqual([0, 3, 6]);
    expect(onsets("sd")).toEqual([2, 6]);
  });

  test("two bars alternate; empty rows and empty grids", async () => {
    const hit = [...[true, false, false, false], ...[false, false, true, false]];
    const code = gridToCode(["hit"], [hit], { stepsPerBar: 4, bars: 2, bpm: 90 });
    expect(code).toBe('setcpm(90/4)\n\nperc: s("<[rim ~ ~ ~] [~ ~ rim ~]>")');
    const r = await evalHeadless(code, 2);
    expect(r.events.map((e) => e.onset)).toEqual([0, 1.5]);
    const empty = gridToCode(["kick", "snare"], [[false], [false]], { stepsPerBar: 1, bars: 1, bpm: 90 });
    expect(empty).toBe('setcpm(90/4)\n\nperc: s("~")');
    expect((await evalHeadless(empty, 1)).events).toEqual([]);
    const hats = gridToCode(
      ["hatClosed", "hatOpen"],
      [
        [true, false],
        [false, true],
      ],
      {
        stepsPerBar: 2,
        bars: 1,
        bpm: 120,
      },
    );
    expect(hats).toBe('setcpm(120/4)\n\nhats: s("hh ~")\nhats2: s("~ oh")');
  });
});

describe("slider", () => {
  test("snaps and clamps", () => {
    expect(snapToStep(97.4, 60, 180, 2)).toBe(98);
    expect(snapToStep(500, 60, 180, 1)).toBe(180);
    expect(snapToStep(0.34, 0, 0.5, 0.01)).toBe(0.34);
  });
  test("reads", () => {
    expect(sliderText(96, { unit: "BPM" })).toBe("96 BPM");
    expect(sliderText(0.4, { format: "percent" })).toBe("40%");
    expect(sliderText(0, { format: "swing" })).toBe("0 (straight)");
    expect(sliderText(1 / 3, { format: "swing" })).toBe("1/3 (triplet swing)");
    expect(sliderText(0.2, { format: "swing" })).toBe("0.2");
    expect(sliderText(null, {})).toBe("Not set");
  });
});
