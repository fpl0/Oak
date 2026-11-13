import { describe, expect, test } from "bun:test";
import { type SingNote, type TracePoint, traceKey, traceSegments } from "./sing.ts";

// 1 3 5 in A major from A3 (57 61 64), one second each.
const notes: SingNote[] = [
  { midi: 57, at: 0, dur: 1, degree: "1" },
  { midi: 61, at: 1, dur: 1, degree: "3" },
  { midi: 64, at: 2, dur: 1, degree: "5" },
];
const pt = (t: number, midi: number | null): TracePoint => ({ t, midi, folded: 0 });

describe("the live trace in degree colours", () => {
  test("the key: the reference's home, else read back from a target's degree", () => {
    expect(traceKey(notes, { tonic: 57, mode: "major" })).toEqual({ tonic: "A", mode: "major" });
    expect(traceKey(notes)).toEqual({ tonic: "A", mode: "major" });
    expect(traceKey([{ midi: 60, at: 0, dur: 1 }])).toBeNull();
  });
  test("in band: the target's degree; out of band: neutral; unvoiced: a gap", () => {
    const trace = [pt(0.2, 57.1), pt(0.4, 57.2), pt(0.6, 58.5), pt(0.8, null), pt(1.2, 61), pt(1.4, 61.3)];
    const segs = traceSegments(trace, notes, 50, traceKey(notes));
    expect(segs.map((s) => [s.degree, s.points.length])).toEqual([
      ["1", 2],
      [null, 2],
      ["3", 2],
    ]);
    // A change of colour starts at the previous point, so the line stays joined.
    expect(segs[1]?.points[0]).toEqual({ t: 0.4, midi: 57.2 });
  });
  test("targets without a degree are coloured from the key", () => {
    const plain = notes.map(({ degree: _d, ...n }) => n);
    const segs = traceSegments([pt(2.1, 64)], plain, 50, { tonic: "A", mode: "major" });
    expect(segs[0]?.degree).toBe("5");
    expect(traceSegments([pt(2.1, 64)], plain, 50, null)[0]?.degree).toBeNull();
  });
});
