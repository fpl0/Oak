// The Wave 4 lead-sheet seam (docs/design/wave4.md §3.3): Amazing Grace's opening shape in 3/4 with a
// one-beat pickup (contracts §6.11), C over the first full bar, F over the second.
import { describe, expect, test } from "bun:test";
import { METERS } from "@oak/theory";
import {
  chordLabelInput,
  chordLabelTexts,
  leadSheetInput,
  notate,
  parseNoteList,
  stepStaffInput,
} from "./index.ts";

const W34 = METERS["3/4"];

describe("chord labels", () => {
  const labels = [
    { bar: 0, beat: 1, symbol: "C", rn: "I" },
    { bar: 1, beat: 1, symbol: "G/B", rn: "V6" },
    { bar: 2, beat: 1, symbol: "Bo", rn: null },
  ];
  test("the lenses pick symbols, numerals, both or neither", () => {
    expect(chordLabelInput(labels, {})).toEqual({});
    expect(chordLabelInput(labels, { symbols: true }).chords?.map((c) => c.symbol)).toEqual([
      "C",
      "G/B",
      "Bo",
    ]);
    expect(chordLabelInput(labels, { romans: true })).toEqual({
      romans: [
        { bar: 0, beat: 1, rn: "I" },
        { bar: 1, beat: 1, rn: "V6" },
      ],
    });
  });
  test("symbols are engraved above, numerals below, translated for display", () => {
    const events = parseNoteList("C4:4 E4:4 G4:4 B3:4 D4:4 G4:4 B3:4 D4:4 F4:4", { track: "chords" });
    const { score, abc } = notate({
      events,
      meter: METERS["4/4"],
      key: { tonic: "C", mode: "major" },
      bars: 3,
      staff: "treble",
      ...chordLabelInput(labels, { symbols: true, romans: true }),
    });
    expect(chordLabelTexts(score).romans).toEqual(["I", "V6"]);
    expect(chordLabelTexts(score).symbols).toHaveLength(3);
    expect(abc.abc).toContain('"_I"');
    expect(abc.abc).toContain('"_V6"');
  });
});

describe("leadSheetInput", () => {
  test("3/4, a one-beat pickup, chord symbols above the melody", () => {
    // Pickup G4, then C5 (E5 C5) | E5 D5 C5 … : the shape of the first phrase, degrees 5 | 1 3 1 | 3 2 1.
    const melody = parseNoteList("r:2 G4:4 | C5:2 E5:8 C5:8 | E5:2 D5:4 | C5:2.", {
      track: "mel",
      meter: W34,
    });
    const input = leadSheetInput({
      melody,
      chords: [
        { bar: 1, beat: 1, symbol: "C", rn: "I" },
        { bar: 2, beat: 1, symbol: "C", rn: "I" },
        { bar: 3, beat: 1, symbol: "F", rn: "IV" },
      ],
      meter: W34,
      key: { tonic: "C", mode: "major" },
      bars: 4,
      pickup: { units: [1, 1] },
    });
    expect(input.staff).toBe("lead");
    expect(input.romans).toBeUndefined();
    const { score } = notate(input);
    expect(score.pickup).toBe(true);
    expect(chordLabelTexts(score).symbols).toEqual(["C", "C", "F"]);
    expect(score.staves).toHaveLength(1);
    expect(score.staves[0]?.clef).toBe("treble");
  });
});

describe("stepStaffInput: what a lesson host passes", () => {
  test("a grand staff splits by track, bass in the bass clef", () => {
    expect(stepStaffInput("grand", ["chords", "bass", "mel"])).toEqual({
      staff: "grand",
      split: "track",
      trackClefs: { chords: "treble", bass: "bass", mel: "treble" },
    });
    expect(stepStaffInput("bass", ["bass"])).toEqual({ staff: "bass" });
    expect(stepStaffInput("perc", [])).toEqual({ staff: "percussion" });
  });
});
