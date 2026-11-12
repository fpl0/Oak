// Key changes inside a score (Wave 3 review): a patterned `.scale("<C4:major G4:major D4:major A4:major>")`
// changes key at every bar line. Each bar is spelled in its own key, its signature is written at the bar line
// (`[K:…]`), accidentals are written against the signature in force, and the annotations read each bar in its
// key. Read back through abcjs's own parser (the corpus `readBack`), independently of the emitter.
import { describe, expect, test } from "bun:test";
import type { KeySpec, NEvent } from "@oak/content-kit";
import { labelPitch, METERS } from "@oak/theory";
import { readBack } from "../corpus/harness.ts";
import { buildScore, keyAtBar, notate, parseNoteList, toAbc } from "./index.ts";

const M44 = METERS["4/4"];
const K = (tonic: string): KeySpec => ({ tonic, mode: "major" });
/** Numbers as `n:` style midi events (no written spelling): the engraver spells them. */
const midis = (bars: number[][]): NEvent[] => {
  const shape = parseNoteList(bars.map((b) => b.map(() => `C4:${b.length}`).join(" ")).join(" | "), {
    track: "mel",
    meter: M44,
  });
  const flat = bars.flat();
  return shape.map((e, i) => {
    const { written: _w, ...rest } = e;
    return { ...rest, midi: flat[i] as number, pitchSource: "note-num" } as NEvent;
  });
};

describe("key changes at bar lines", () => {
  // 1 3 5 3 in C, G, D, A (n("0 2 4 2") over the patterned scale).
  const bars = [
    [60, 64, 67, 64],
    [67, 71, 74, 71],
    [62, 66, 69, 66],
    [69, 73, 76, 73],
  ];
  const changes = [
    { bar: 1, key: K("G") },
    { bar: 2, key: K("D") },
    { bar: 3, key: K("A") },
  ];

  test("every bar is spelled in its own key and its signature is written at the bar line", () => {
    const { score, abc } = notate(
      { events: midis(bars), meter: M44, key: K("C"), keyChanges: changes, bars: 4, staff: "treble" },
      { barsPerLine: 4 },
    );
    expect(score.keyChanges).toEqual(changes);
    expect(abc.abc).toContain("[K:G]");
    expect(abc.abc).toContain("[K:D]");
    expect(abc.abc).toContain("[K:A]");
    // A double barline marks each change; the piece ends with the final barline.
    expect(abc.abc).toContain(" || [K:G]");
    expect(abc.abc).toContain(" || [K:A]");
    expect(abc.abc).toMatch(/ \|\]\n/);
    // C♯ in A major, never D♭; F♯ in D major; no accidental written where the signature has it.
    const names = abc.idMap.map((e) => e.pitches[0]);
    expect(names).toEqual([
      "C4",
      "E4",
      "G4",
      "E4",
      "G4",
      "B4",
      "D5",
      "B4",
      "D4",
      "F#4",
      "A4",
      "F#4",
      "A4",
      "C#5",
      "E5",
      "C#5",
    ]);
    expect(abc.abc).not.toMatch(/\^[fc]/);
    const back = readBack(abc.abc).staves[0]?.voices[0]?.map((n) => n.midis[0]);
    expect(back).toEqual(bars.flat());
  });

  test("annotations read each bar in its key: 1 3 5 3 four times", () => {
    const { abc } = notate(
      {
        events: midis(bars),
        meter: M44,
        key: K("C"),
        keyChanges: changes,
        bars: 4,
        staff: "treble",
        annotations: { degree: true },
      },
      { barsPerLine: 4 },
    );
    const w = abc.abc.split("\n").find((l) => l.startsWith("w:"));
    expect(w?.replace(/\s+/g, " ")).toBe("w:1 3 5 3 | 1 3 5 3 | 1 3 5 3 | 1 3 5 3");
  });

  test("changes back to a sharp-free key cancel by the signature, not by naturals on the notes", () => {
    const { abc } = notate(
      {
        events: midis([
          [66, 67],
          [65, 67],
        ]),
        meter: M44,
        key: K("G"),
        keyChanges: [{ bar: 1, key: K("C") }],
        bars: 2,
        staff: "treble",
      },
      { barsPerLine: 4 },
    );
    expect(abc.abc).toContain("[K:C]");
    expect(abc.abc).not.toContain("=F");
    expect(readBack(abc.abc).staves[0]?.voices[0]?.map((n) => n.midis[0])).toEqual([66, 67, 65, 67]);
  });

  test("a grand staff writes the change in both staves; seven sharps and seven flats round-trip", () => {
    const events = [
      ...midis([
        [61, 65],
        [59, 64],
      ]),
      ...midis([[37], [35]]).map((e) => ({ ...e, track: "bass", id: `${e.id}b` })),
    ];
    const { abc } = notate(
      {
        events,
        meter: M44,
        key: K("C#"),
        keyChanges: [{ bar: 1, key: K("Cb") }],
        bars: 2,
        staff: "grand",
        split: "track",
      },
      { barsPerLine: 4 },
    );
    expect(abc.abc.match(/\[K:Cb\]/g)?.length).toBe(2);
    const back = readBack(abc.abc);
    const all = back.staves.flatMap((s) => s.voices.flatMap((v) => v.flatMap((n) => n.midis)));
    expect(all.sort()).toEqual([61, 65, 59, 64, 37, 35].sort());
    // In C♭ major B is C♭ (degree 1), E is F♭ (degree 4).
    const cb = abc.idMap.filter((e) => e.bar === 2).flatMap((e) => e.pitches);
    expect(cb.sort()).toEqual(["Cb2", "Cb4", "Fb4"]);
    expect(labelPitch(59, K("Cb")).degreeDisplay).toBe("1");
  });

  test("changes outside the engraved bars, at bar 0 or to the key in force are dropped", () => {
    const score = buildScore({
      events: midis(bars),
      meter: M44,
      key: K("C"),
      keyChanges: [
        { bar: 0, key: K("F") },
        { bar: 1, key: K("C") },
        { bar: 2, key: K("D") },
        { bar: 9, key: K("E") },
        { bar: 1.5, key: K("A") },
      ],
      bars: 4,
      staff: "treble",
    });
    expect(score.keyChanges).toEqual([{ bar: 2, key: K("D") }]);
    expect(keyAtBar(score, 1)).toEqual(K("C"));
    expect(keyAtBar(score, 3)).toEqual(K("D"));
    expect(toAbc(score).abc.match(/\[K:/g)?.length).toBe(1);
  });
});
