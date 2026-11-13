// The voicing() comparison: which sketch is the hand voicing, and Strudel's version of it, evaluated with
// headless Strudel (the same changes, close voice leading, the learner's bass and drums untouched).
import { describe, expect, test } from "bun:test";
import type { Sketch } from "@oak/api";
import { evalHeadless } from "@oak/grader/testing";
import { readChord } from "@oak/theory";
import {
  chordBlock,
  gateExample,
  HAND_VOICING_LESSON,
  handVoicingSketch,
  soundOf,
  strudelVersion,
} from "./voicing-compare.ts";

const sketch = (id: string, originId: string | null, updatedAt: string, kind = "lesson-make"): Sketch =>
  ({
    id,
    title: id,
    originKind: kind,
    originId,
    currentVersion: 1,
    tags: [],
    archived: false,
    listeningNote: null,
    createdAt: updatedAt,
    updatedAt,
  }) as Sketch;

const HAND = `setcpm(88/4)

chords: note("<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>").s("piano")
bass: note("<c2 f2 g2 c2>").s("piano")
drums: s("bd ~ sd ~")`;

describe("the hand voicing", () => {
  test("the latest U05.L07 Make sketch", () => {
    const list = [
      sketch("a", "U05.L07", "2026-11-01T10:00:00Z"),
      sketch("b", "U05.L07", "2026-11-03T10:00:00Z"),
      sketch("c", "U05.L06", "2026-11-04T10:00:00Z"),
      sketch("d", "U05.L07", "2026-11-05T10:00:00Z", "free"),
    ];
    expect(handVoicingSketch(list)?.id).toBe("b");
    expect(handVoicingSketch([])).toBeNull();
    expect(HAND_VOICING_LESSON).toBe("U05.L07");
  });

  test("the chord track and its sound", () => {
    const b = chordBlock(HAND);
    expect(b?.label).toBe("chords");
    expect(soundOf(HAND.slice(b?.from ?? 0, b?.to ?? 0))).toBe("piano");
    expect(soundOf('pad: note("c4").s("rhodes")')).toBe("rhodes");
    expect(chordBlock('mel: n("0")')).toBeNull();
  });
});

describe("Strudel's version", () => {
  test("only the chord track changes; the changes sound the same chords, voiced close", async () => {
    const code = strudelVersion(HAND, "<C F G C>");
    expect(code).toContain('chords: chord("<C F G C>").voicing().s("piano")');
    expect(code).toContain('bass: note("<c2 f2 g2 c2>").s("piano")');
    expect(code).toContain('drums: s("bd ~ sd ~")');
    expect(code.startsWith("setcpm(88/4)")).toBe(true);
    const out = await evalHeadless(code, 4);
    const chords = out.events.filter((e) => e.track === "chords");
    for (const [bar, want] of [
      [0, "C"],
      [1, "F"],
      [2, "G"],
      [3, "C"],
    ] as const) {
      const pcs = chords.filter((e) => Math.floor(e.onset) === bar).map((e) => (e.midi as number) % 12);
      expect(readChord(pcs, pcs[0] as number)?.root).toBe(want);
    }
    // Close voice leading: no voice of Strudel's voicing moves more than a 4th between neighbouring chords.
    const tops = [0, 1, 2, 3].map((bar) =>
      Math.max(...chords.filter((e) => Math.floor(e.onset) === bar).map((e) => e.midi as number)),
    );
    for (let i = 1; i < tops.length; i++)
      expect(Math.abs((tops[i] as number) - (tops[i - 1] as number))).toBeLessThanOrEqual(5);
  });

  test("without a chord track: the changes at the learner's tempo; the fallback example plays", async () => {
    expect(strudelVersion('setcpm(90/4)\nmel: n("0 2 4")', "<C G>")).toBe(
      'setcpm(90/4)\n\nchords: chord("<C G>").voicing().s("piano")',
    );
    const out = await evalHeadless(gateExample(), 4);
    expect(out.events.filter((e) => e.track === "chords").length).toBeGreaterThanOrEqual(12);
    expect(out.cps).toBeCloseTo(88 / 4 / 60, 5);
  });
});
