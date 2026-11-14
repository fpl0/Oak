// A take ends where the song ends (review:studio, Wave 6): the piece plays once, then its tail fades on the
// recorder's own gain. Every album track used to end with the song starting over for a second and a half, cut off
// at a tenth of full scale.
import { describe, expect, test } from "bun:test";
import { mini } from "@strudel/mini";
import { playOnce } from "./play-once.ts";
import { scheduleTakeFade, TAKE_FADE_GUARD_SEC, TAKE_FADE_SEC } from "./recorder.ts";

describe("playOnce", () => {
  test("only the notes that start in the first bars sound; a long last note still sounds whole", () => {
    const repl = { scheduler: { pattern: mini("<a b [c d@3]>") as unknown as Strudel.Pattern } };
    expect(repl.scheduler.pattern.queryArc(0, 6).filter((h) => h.hasOnset())).toHaveLength(8);
    playOnce(repl, 3);
    const haps = repl.scheduler.pattern.queryArc(0, 6).filter((h) => h.hasOnset());
    expect(haps.map((h) => h.value)).toEqual(["a", "b", "c", "d"]);
    // d starts at 2.25 and lasts to the end of bar 3: it is kept whole.
    const d = haps.find((h) => h.value === "d");
    expect(Number(d?.whole?.end)).toBeCloseTo(3);
  });

  test("nothing to play once, or no bars: the pattern is left as it is", () => {
    const repl: { scheduler: { pattern?: Strudel.Pattern } } = { scheduler: {} };
    playOnce(repl, 4);
    expect(repl.scheduler.pattern).toBeUndefined();
    const p = mini("a b") as unknown as Strudel.Pattern;
    const r = { scheduler: { pattern: p } };
    playOnce(r, 0);
    expect(r.scheduler.pattern).toBe(p);
  });
});

describe("scheduleTakeFade", () => {
  const recorder = () => {
    const calls: string[] = [];
    return {
      calls,
      param: {
        cancelScheduledValues: (t: number) => calls.push(`cancel ${t}`),
        setValueAtTime: (v: number, t: number) => calls.push(`set ${v} ${t.toFixed(2)}`),
        linearRampToValueAtTime: (v: number, t: number) => calls.push(`ramp ${v} ${t.toFixed(2)}`),
      } as unknown as AudioParam,
    };
  };
  test("the last moments of the tail fade to silence before the recorder stops", () => {
    const r = recorder();
    scheduleTakeFade(r.param, 10, 21.5, 1.5);
    const end = 10 + 21.5 - TAKE_FADE_GUARD_SEC;
    expect(r.calls).toEqual([
      "cancel 10",
      "set 1 10.00",
      `set 1 ${(end - TAKE_FADE_SEC).toFixed(2)}`,
      `ramp 0 ${end.toFixed(2)}`,
    ]);
  });
  test("a take with no tail to fade in starts at full level and is not faded", () => {
    const r = recorder();
    scheduleTakeFade(r.param, 0, 8, 0.1);
    expect(r.calls).toEqual(["cancel 0", "set 1 0.00"]);
  });
});
