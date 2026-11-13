// "Hear this slot" on a slot strip (`AnswerEnv.slots.play`): the stimulus plays only the slot's span.
import { describe, expect, test } from "bun:test";
import { slicePlan } from "./plan-span.ts";

describe("a stimulus span", () => {
  const plan = {
    // Four bars at 0.5 cps (2 s a bar): one chord on each downbeat, each held for the bar.
    events: [0, 2, 4, 6].map((at, i) => ({ at, dur: 1.9, value: { s: "piano", note: 60 + i } })),
    durationSec: 8,
    preload: ["piano"],
  };
  test("bar 3 alone, moved to start at 0", () => {
    const s = slicePlan(plan, 4, 2);
    expect(s.events).toEqual([{ at: 0, dur: 1.9, value: { s: "piano", note: 62 } }]);
    expect(s.durationSec).toBe(2);
    expect(s.preload).toEqual(["piano"]);
  });
  test("a span of two bars keeps both chords; a note never rings past the span", () => {
    const s = slicePlan({ ...plan, events: [{ at: 1, dur: 3, value: { s: "piano", note: 60 } }] }, 0, 2);
    expect(s.events).toEqual([{ at: 1, dur: 1, value: { s: "piano", note: 60 } }]);
    expect(slicePlan(plan, 2, 4).events.map((e) => e.at)).toEqual([0, 2]);
  });
});
