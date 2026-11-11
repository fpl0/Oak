import { describe, expect, test } from "bun:test";
import type { TermEntry, ToolEntry } from "@oak/content-kit";
import { midiToPc, noteToMidi } from "@oak/theory";
import { CADENCE, chordMidis, describeToken, type TokenContext } from "./music-tokens.ts";

const ctx: TokenContext = {
  terms: [
    {
      id: "term.cadence",
      term: "cadence",
      definition: "A musical full stop: the chords that end a phrase.",
      example: "",
      introducedBy: "U05.L03",
    } as unknown as TermEntry,
    {
      id: "term.bar",
      term: "bar",
      definition: "A group of beats.",
      example: "",
      introducedBy: "U01.L01",
    } as unknown as TermEntry,
  ],
  introduced: new Set(["term.bar"]),
  tools: [
    {
      id: "tb.scale",
      code: '.scale("C4:major")',
      concept: "key as one parameter",
      unlock: { at: "U03.L02" },
    } as unknown as ToolEntry,
  ],
  unlocked: new Set<string>(),
};

const names = (midis: number[]) =>
  midis.map((m) => ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][midiToPc(m)]);

describe("describeToken", () => {
  test("the cadence is I IV V I in C major", () => {
    expect(CADENCE.map(names)).toEqual([
      ["C", "E", "G"],
      ["F", "A", "C"],
      ["G", "B", "D"],
      ["C", "E", "G"],
    ]);
  });

  test("degrees: colour, n = degree − 1, and the played note after the cadence", () => {
    const five = describeToken({ kind: "deg", value: "5" }, ctx);
    expect(five?.label).toBe("5");
    expect(five?.title).toContain('n("4")');
    expect(five?.title).toContain("sol");
    expect(five?.play?.at(-1)).toEqual([noteToMidi("G4") as number]);
    const flat3 = describeToken({ kind: "deg", value: "b3" }, ctx);
    expect(flat3?.label).toBe("♭3");
    expect(flat3?.play?.at(-1)).toEqual([noteToMidi("Eb4") as number]);
    expect(describeToken({ kind: "deg", value: "#4" }, ctx)?.play?.at(-1)).toEqual([
      noteToMidi("F#4") as number,
    ]);
  });

  test("roman numerals: function and the chord in C major", () => {
    const v7 = describeToken({ kind: "rn", value: "V7" }, ctx);
    expect(v7?.title).toContain("G7");
    expect(v7?.title).toContain("dominant");
    expect(v7?.play?.[0]).toEqual([55, 59, 62, 65]);
    expect(names(v7?.play?.[0] ?? [])).toEqual(["G", "B", "D", "F"]);
    const ii = describeToken({ kind: "rn", value: "ii" }, ctx);
    expect(names(ii?.play?.[0] ?? [])).toEqual(["D", "F", "A"]);
    const applied = describeToken({ kind: "rn", value: "V7/vi" }, ctx);
    expect(applied?.title).toContain("E7");
    expect(applied?.degree).toBeUndefined();
    expect(describeToken({ kind: "rn", value: "bVII" }, ctx)?.label).toBe("♭VII");
  });

  test("notes and chords", () => {
    const n = describeToken({ kind: "note", value: "F#4" }, ctx);
    expect(n?.label).toBe("F♯4");
    expect(n?.play).toEqual([[66]]);
    const am7 = describeToken({ kind: "chord", value: "Am7" }, ctx);
    expect(am7?.label).toBe("Am7");
    expect(names(am7?.play?.[0] ?? [])).toEqual(["A", "C", "E", "G"]);
    expect(chordMidis(9, [9, 0, 4, 7])).toEqual([57, 60, 64, 67]);
  });

  test("bars, tools and terms", () => {
    expect(describeToken({ kind: "bars", value: "3-4" }, ctx)).toMatchObject({
      label: "bars 3–4",
      bars: { from: 3, to: 4 },
    });
    expect(describeToken({ kind: "bars", value: "2" }, ctx)).toMatchObject({
      label: "bar 2",
      bars: { from: 2, to: 2 },
    });
    const tool = describeToken({ kind: "tool", value: "tb.scale" }, ctx);
    expect(tool).toMatchObject({ preview: true, unlocksAt: "U03.L02", href: "/toolbox/tb.scale" });
    const cadence = describeToken({ kind: "term", value: "cadence" }, ctx);
    expect(cadence).toMatchObject({ label: "cadence", preview: true });
    expect(cadence?.title).toContain("full stop");
    expect(describeToken({ kind: "term", value: "bar" }, ctx)?.preview).toBeUndefined();
    expect(
      describeToken({ kind: "term", value: "bar" }, { ...ctx, introduced: null })?.preview,
    ).toBeUndefined();
    expect(describeToken({ kind: "reveal" }, ctx)).toBeNull();
  });
});
