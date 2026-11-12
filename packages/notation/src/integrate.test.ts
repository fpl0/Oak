// Wave 3 integration: the items the reviewers left on @oak/notation, each read back through abcjs's own
// parser (the corpus `readBack`), independently of the emitter.
//  - A grand-staff answer edited so the hands overlap (a left-hand half note under right-hand quarters) kept
//    only the right hand: `plainNoteList` cannot write the overlap and the fallback printed staff 0.
//  - Two tracks in different keys on one grand staff: without `trackKeys` they take one signature and the other
//    staff's notes must still SOUND right, spelled against it; with `trackKeys` (second review pass) each staff
//    shows its own signature and spells its notes in its own key.
//  - A key change inside a bar (`.scale("C:major G:major")` in one cycle) keeps the bar's signature: the
//    notes after it must still sound right, with accidentals.
import { describe, expect, test } from "bun:test";
import type { KeySpec, NEvent } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { readBack } from "../corpus/harness.ts";
import { editNoteList, notate, noteListInput, parseNoteList, slicedNoteList } from "./index.ts";

const M44 = METERS["4/4"];
const K = (tonic: string): KeySpec => ({ tonic, mode: "major" });

/** Every sounding note of a read-back tune as [onset, dur, midi], sorted. */
function sounding(abc: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const st of readBack(abc).staves)
    for (const v of st.voices) for (const n of v) for (const m of n.midis) out.push([n.onset, n.dur, m]);
  return out.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}
/** The same for events (cycles → whole notes in 4/4: × 1). */
function eventsSounding(events: readonly NEvent[]): [number, number, number][] {
  return events
    .filter((e) => e.midi !== null)
    .map((e): [number, number, number] => [e.onset[0] / e.onset[1], e.dur[0] / e.dur[1], e.midi as number])
    .sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}

describe("grand-staff answers keep both hands through an edit", () => {
  const ctx = { meter: M44, key: K("C"), bars: 1, staff: "grand" as const };
  const idOf = (list: string, midi: number): string =>
    (noteListInput(list, ctx).events.find((e) => e.midi === midi) as NEvent).id;

  test("shortening a right-hand note under a left-hand half note keeps the left hand", () => {
    const list = "[C3,C4]:2 [G3,E4]:2";
    const out = editNoteList(list, { op: "resize", eventId: idOf(list, 60), dur: [1, 4] }, ctx);
    expect(out.changed).toBe(true);
    const evs = noteListInput(out.list, ctx).events;
    expect(eventsSounding(evs)).toEqual([
      [0, 0.5, 48],
      [0, 0.25, 60],
      [0.5, 0.5, 55],
      [0.5, 0.5, 64],
    ]);
    // Engraved on both staves, and what abcjs reads back is what the answer holds.
    expect(out.score.staves.length).toBe(2);
    expect(sounding(out.abc.abc)).toEqual(eventsSounding(evs));
  });

  test("right-hand quarters added over a left-hand whole note", () => {
    let list = "C3:1";
    list = editNoteList(
      list,
      { op: "insert", onset: [0, 1], dur: [1, 4], pitch: "E4", keep: true },
      ctx,
    ).list;
    list = editNoteList(
      list,
      { op: "insert", onset: [1, 4], dur: [1, 4], pitch: "G4", keep: true },
      ctx,
    ).list;
    const evs = noteListInput(list, ctx).events;
    expect(eventsSounding(evs)).toEqual([
      [0, 1, 48],
      [0, 0.25, 64],
      [0.25, 0.25, 67],
    ]);
  });

  test("slicedNoteList writes overlaps with ties and refuses a re-struck note it could not tell apart", () => {
    const evs = parseNoteList("[C3,E4]:4~ C3:4~ [C3,G4]:2", { meter: M44 });
    expect(eventsSounding(evs)).toEqual([
      [0, 1, 48],
      [0, 0.25, 64],
      [0.5, 0.5, 67],
    ]);
    const back = slicedNoteList(evs, { meter: M44, bars: 1 });
    expect(back).not.toBeNull();
    expect(eventsSounding(parseNoteList(back as string, { meter: M44 }))).toEqual(eventsSounding(evs));
    // E4 stops where a new E4 starts while C3 goes on: one tied chord cannot say that.
    const restruck = parseNoteList("[C3,E4]:4 E4:4", { meter: M44 }).map((e) =>
      e.midi === 48 ? { ...e, dur: [1, 2] as [number, number] } : e,
    );
    expect(slicedNoteList(restruck, { meter: M44, bars: 1 })).toBeNull();
  });
});

describe("one signature for two keys: a limitation, not a wrong drawing", () => {
  test("a bass in C under a melody in G-flat: the bass is spelled against six flats and sounds right", () => {
    const mel = parseNoteList("Gb4:4 Bb4:4 Db5:4 Bb4:4", { track: "mel", meter: M44 });
    // B2 E3 G3 B2: C major notes, written as numbers (no spelling of their own).
    const bass = parseNoteList("C3:4 C3:4 C3:4 C3:4", { track: "bass", meter: M44 }).map((e, i) => {
      const { written: _w, ...rest } = e;
      return { ...rest, midi: [47, 52, 55, 47][i] as number, pitchSource: "note-num" } as NEvent;
    });
    const events = [...mel, ...bass];
    const { score, abc } = notate({ events, meter: M44, key: K("Gb"), bars: 1, staff: "grand" });
    expect(score.staves.length).toBe(2);
    expect(abc.abc).toMatch(/K:Gb/);
    expect(sounding(abc.abc)).toEqual(eventsSounding(events));
  });
});

describe("per-staff signatures (trackKeys)", () => {
  test("a bass in G-flat under a melody in C: six flats on the bass staff only, both sound right", () => {
    const mel = parseNoteList("C4:4 E4:4 G4:4 C5:4", { track: "mel", meter: M44 });
    const bass = parseNoteList("Gb2:4 Bb2:4 Db3:4 Gb2:4", { track: "bass", meter: M44 });
    const events = [...mel, ...bass];
    const { score, abc } = notate({
      events,
      meter: M44,
      key: K("C"),
      trackKeys: { mel: { key: K("C") }, bass: { key: K("Gb") } },
      bars: 1,
      staff: "grand",
    });
    expect(score.staves.map((s) => s.key)).toEqual([undefined, K("Gb")]);
    expect(abc.abc).toMatch(/K:C\n/);
    expect(abc.abc).toContain("[K:Gb]");
    // No accidental is written on the bass: the signature carries its flats.
    const bassLine = abc.abc.split("\n").find((l) => l.startsWith("[K:Gb]")) ?? "";
    expect(bassLine).not.toContain("_");
    expect(abc.idMap.map((e) => e.pitches[0]).sort()).toEqual(
      ["C4", "E4", "G4", "C5", "Gb2", "Bb2", "Db3", "Gb2"].sort(),
    );
    expect(sounding(abc.abc)).toEqual(eventsSounding(events));
  });

  test("a staff mixing tracks of two keys, or tracks of the piece's key, keeps the piece's signature", () => {
    const a = parseNoteList("C4:2 E4:2", { track: "a", meter: M44 });
    const b = parseNoteList("Gb4:2 Bb4:2", { track: "b", meter: M44 });
    const { score, abc } = notate({
      events: [...a, ...b],
      meter: M44,
      key: K("C"),
      trackKeys: { a: { key: K("C") }, b: { key: K("Gb") } },
      bars: 1,
      staff: "treble",
    });
    expect(score.staves[0]?.key).toBeUndefined();
    expect(abc.abc).not.toContain("[K:");
    expect(sounding(abc.abc)).toEqual(eventsSounding([...a, ...b]));
  });
});

describe("a key change inside a bar keeps the bar's signature", () => {
  test("C major then G major in one bar: the F-sharp is written with its accidental and sounds right", () => {
    // n("0 2 4 6").scale("<C4:major G4:major>") squeezed into one bar would give C E | B F#: the second half in G.
    const events = parseNoteList("C4:4 E4:4 B4:4 F#5:4", { track: "mel", meter: M44 });
    const { abc } = notate({ events, meter: M44, key: K("C"), bars: 1, staff: "treble" });
    expect(abc.abc).toContain("^f");
    expect(sounding(abc.abc)).toEqual(eventsSounding(events));
  });
});
