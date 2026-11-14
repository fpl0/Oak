// Wave 6 review (review:surfaces): what the adversarial pass over the U12–U17 staff found in the engraver.
// - A triplet over two eighths inside a 12/8 (or 6/8) beat was written as ONE 9:6 bracket over the whole beat with a
//   dotted value inside it (`(9:6:4 A,3 B,2 C2 D2`); a reader writes an eighth and a `(3:2:3` triplet. Compound
//   beats now offer both two-eighth windows before the whole beat.
// - Seven sharps with a secondary dominant: V7/V of C♯ major is D♯ F𝄪 A♯ C♯, the double sharp written as `^^F`.
// Every case is read back from the ABC independently (corpus harness) and compared with the code's events.
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { checkAbc, eventsOf, readBack } from "../corpus/harness.ts";
import { notate } from "./index.ts";
import type { NotationInput } from "./types.ts";

const body = (abc: string): string =>
  abc
    .split("\n")
    .filter((l) => !/^[A-Z]:|^%%/.test(l))
    .join("\n")
    .replace(/!class=oak-e\d+!/g, "")
    .trim();

async function engrave(code: string, meter: keyof typeof METERS, key: KeySpec, bars = 1) {
  const events = await eventsOf({ code, bars });
  const input: NotationInput = { events, meter: METERS[meter], key, bars, staff: "auto" };
  const { score, abc } = notate(input);
  const read = readBack(abc.abc)
    .staves.flatMap((s) => s.voices.flat())
    .sort((a, b) => a.onset - b.onset);
  // A cycle is a bar: whole notes are cycles times the bar's length.
  const w = METERS[meter].num / METERS[meter].den;
  const want = events
    .filter((e) => e.midi !== null)
    .map((e) => ({ onset: R.toNum(e.onset) * w, dur: R.toNum(e.dur) * w, midi: e.midi as number }))
    .sort((a, b) => a.onset - b.onset);
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  return {
    score,
    abc: abc.abc,
    read: read.map((n) => ({ ...n, onset: r6(n.onset), dur: r6(n.dur) })),
    want: want.map((n) => ({ ...n, onset: r6(n.onset), dur: r6(n.dur) })),
  };
}

describe("triplets inside a compound beat", () => {
  test("12/8: an eighth then a triplet over two eighths is `A,2 (3:2:3B,2C2D2`, never a 9:6 bracket", async () => {
    const r = await engrave(
      'n("[0 [1 2 3]@2] [4 ~ 5] [[6 5 4] [3 2 1]] [0 ~ ~]").scale("A3:minor").s("piano")',
      "12/8",
      { tonic: "A", mode: "minor" },
    );
    // Every bar of every voice adds up to 12/8 with the tuplet applied.
    for (const v of checkAbc(r.abc).barTotals.flat()) for (const t of v) expect(t).toBeCloseTo(1.5, 9);
    const b = body(r.abc);
    expect(b).toContain("A,2 (3:2:3B,2C2D2");
    expect(b).not.toMatch(/\(9:6/);
    expect(r.score.approximate).toBe(false);
    expect(r.read.map((n) => [n.onset, n.dur, n.midis[0]])).toEqual(
      r.want.map((n) => [n.onset, n.dur, n.midi]),
    );
  });
  test("12/8: a triplet on the second pair of a beat brackets those two eighths only", async () => {
    const r = await engrave(
      'n("[[0 1 2]@2 3] [4 ~ ~] [5 ~ ~] [7 ~ ~]").scale("D4:minor").s("piano")',
      "12/8",
      {
        tonic: "D",
        mode: "minor",
      },
    );
    expect(body(r.abc)).toMatch(/^\(3:2:3D2E2F2 G2/);
    expect(r.read.map((n) => [n.onset, n.dur, n.midis[0]])).toEqual(
      r.want.map((n) => [n.onset, n.dur, n.midi]),
    );
  });
  test("6/8: the same triplet in the second beat", async () => {
    const r = await engrave('n("[0 1 2] [3 [4 5 6]@2]").scale("G4:major").s("piano")', "6/8", {
      tonic: "G",
      mode: "major",
    });
    expect(body(r.abc)).toContain("G2A2B2 c2 (3:2:3d2e2f2");
    expect(r.read.map((n) => [n.onset, n.dur, n.midis[0]])).toEqual(
      r.want.map((n) => [n.onset, n.dur, n.midi]),
    );
  });
});

describe("seven sharps with a secondary dominant", () => {
  test("V7/V in C♯ major draws D♯ F𝄪 A♯ C♯ (`^^F`), the melody's ♯4 too", async () => {
    const r = await engrave(
      'stack(n("[1 3# 5 0]").scale("C#4:major").s("piano"), note("[D#3,F##3,A#3,C#4]").s("piano"))',
      "4/4",
      { tonic: "C#", mode: "major" },
    );
    expect(r.abc).toContain("K:C#");
    // Every F in the bar is the double sharp (the melody's ♯4 and the chord's 3rd); no G, no ♮.
    expect((r.abc.match(/\^\^F/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(body(r.abc)).not.toMatch(/=|G/);
    const midis = r.read.flatMap((n) => n.midis).sort((a, b) => a - b);
    expect(midis).toEqual(r.want.map((n) => n.midi).sort((a, b) => a - b));
  });
});
