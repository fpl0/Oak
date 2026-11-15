import { describe, expect, test } from "bun:test";
import { busyShare, unitLoads } from "./e2e-load.ts";

describe("e2e load profile", () => {
  test("busy share between two tick readings", () => {
    expect(busyShare({ busy: 100, idle: 100 }, { busy: 150, idle: 150 })).toBe(0.5);
    expect(busyShare({ busy: 0, idle: 0 }, { busy: 0, idle: 0 })).toBe(0);
  });
  test("each unit gets the means of the samples inside its window", () => {
    const samples = [
      { t: 5, running: 2, busy: 0.4, load1: 4 },
      { t: 10, running: 4, busy: 0.8, load1: 8 },
      { t: 15, running: 1, busy: 0.2, load1: 2 },
    ];
    const [a, b] = unitLoads(samples, [
      { name: "a", start: 0, end: 12 },
      { name: "b", start: 14, end: 20 },
    ]);
    expect(a).toMatchObject({ name: "a", meanRunning: 3, samples: 2 });
    expect(a?.meanBusy).toBeCloseTo(0.6);
    expect(a?.wallMin).toBeCloseTo(0.2);
    expect(b).toMatchObject({ name: "b", meanRunning: 1, meanLoad1: 2, samples: 1 });
  });
});
