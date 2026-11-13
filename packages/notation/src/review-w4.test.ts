// Wave 4 review regressions: what the staff draws when two voices share a staff (the chord stack and the tune of
// U05.L02–L03 on one treble staff). An accidental one voice writes is restated in the other voice of the same bar,
// so the second part reads as it sounds on its own (abcjs and the readers in Oak apply accidentals per voice).
import { describe, expect, test } from "bun:test";
import type { KeySpec, NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { readBack } from "../corpus/harness.ts";
import { type NotationInput, notate, parseNoteList } from "./index.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const G: KeySpec = { tonic: "G", mode: "major" };
const W44 = METERS["4/4"];
const tracks = (lists: Record<string, string>): NEvent[] =>
  Object.entries(lists)
    .flatMap(([track, list]) => parseNoteList(list, { track, meter: W44 }))
    .sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0));
const input = (o: Partial<NotationInput> & { events: NEvent[] }): NotationInput => ({
  meter: W44,
  key: C,
  bars: 2,
  staff: "treble",
  split: "track",
  ...o,
});

const drawn = (abc: string) =>
  readBack(abc)
    .staves.flatMap((s) => s.voices.flatMap((v) => v.flatMap((n) => n.midis)))
    .sort((a, b) => a - b);
const sounding = (events: NEvent[]) => events.map((e) => e.midi as number).sort((a, b) => a - b);

describe("two voices on one staff", () => {
  test("C augmented under a tune on G sharp: the tune's G sharp carries its own sharp (U05.L03 make-it-rise)", () => {
    const events = tracks({
      chords: "[C4,E4,G#4]:1 | [C4,F4,A4]:1",
      mel: "G#4:4 r:4 E4:4 r:4 | A4:4 r:4 F4:4 r:4",
    });
    const { abc } = notate(input({ events }));
    expect(drawn(abc.abc)).toEqual(sounding(events));
    // Both voices write the sharp: the chord's ^G and the tune's ^G.
    expect(abc.abc.match(/\^G/g)?.length).toBe(2);
  });

  test("a sharp in one voice, a natural in the other: both written", () => {
    const events = tracks({ chords: "[D4,F#4,A4]:1", mel: "F4:2 F#4:2" });
    const { abc } = notate(input({ events, bars: 1 }));
    expect(drawn(abc.abc)).toEqual(sounding(events));
  });

  test("the key signature's own sharp is not restated (G major, F sharp in both voices)", () => {
    const events = tracks({ chords: "[D4,F#4,A4]:1", mel: "F#4:2 G4:2" });
    const { abc } = notate(input({ events, key: G, bars: 1 }));
    expect(drawn(abc.abc)).toEqual(sounding(events));
    expect(abc.abc).not.toMatch(/\^F/);
  });

  test("one voice repeating its own accidental in the bar does not restate it", () => {
    const events = tracks({ mel: "C#4:4 C#4:4 D4:2" });
    const { abc } = notate(input({ events, bars: 1 }));
    expect(abc.abc.match(/\^C/g)?.length).toBe(1);
  });
});
