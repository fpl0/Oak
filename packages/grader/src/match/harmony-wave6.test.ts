// Wave 6 (U12.L03): a diminished 7th has no root by sound (its notes are a minor 3rd apart), so the notes a
// `harmony.pcset` finding prints are named on the root whose spelling fits the key best, not on the bass.
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { spellChordPcs } from "./harmony.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };

describe("the notes of a diminished 7th, named in the key", () => {
  test("B D F A♭ with D in the bass is Bo7 in C, never D F A♭ C♭", () => {
    expect(spellChordPcs([2, 5, 8, 11], 2, C)).toBe("B D F Ab");
    expect(spellChordPcs([2, 5, 8, 11], 11, C)).toBe("B D F Ab");
  });
  test("in A minor the same four notes are the key's own vii°7, G♯ B D F", () => {
    expect(spellChordPcs([2, 5, 8, 11], 2, A_MINOR)).toBe("G# B D F");
  });
  test("other chords keep the reading by the bass: C+ stays C E G♯, a minor 7th its own root", () => {
    expect(spellChordPcs([0, 4, 8], 0, C)).toBe("C E G#");
    expect(spellChordPcs([2, 5, 9, 0], 2, C)).toBe("D F A C");
  });
});
