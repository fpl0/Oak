import { describe, expect, test } from "bun:test";
import { rat } from "@oak/content-kit";
import {
  barPosition,
  euclid,
  gridSteps,
  gridToMini,
  meterWith,
  onsetsOf,
  RHYTHM_GRIDS,
  rhythmGrid,
} from "./index.ts";

const label = (n: number, d: number, meter: Parameters<typeof barPosition>[1]) =>
  barPosition(rat(n, d), meter).label;

describe("barPosition and beat labels (contracts §6.9)", () => {
  test("4/4: 1 e & a", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => label(i, 16, "4/4"))).toEqual([
      "1",
      "1e",
      "1&",
      "1a",
      "2",
      "2e",
      "2&",
      "2a",
    ]);
    expect(label(15, 16, "4/4")).toBe("4a");
    expect(label(1, 12, "4/4")).toBe("1-trip");
    expect(label(2, 12, "4/4")).toBe("1-let");
    // Off the counting grid: words, never a fraction such as "1+4/7".
    expect(label(4, 28, "4/4")).toBe("between 1 and 2");
    expect(label(27, 28, "4/4")).toBe("after 4, before the bar line");
    expect(barPosition(rat(9, 4), "4/4")).toEqual({
      bar: 3,
      beat: 2,
      label: "2",
      inBar: [1, 4],
      pickup: false,
    });
  });
  test("3/4 and 2/4 count quarters", () => {
    expect(label(1, 3, "3/4")).toBe("2");
    expect(label(1, 2, "3/4")).toBe("2&");
    expect(label(1, 2, "2/4")).toBe("2");
  });
  test("compound meters: 1 la li", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => label(i, 6, "6/8"))).toEqual(["1", "1la", "1li", "2", "2la", "2li"]);
    expect(label(1, 3, "9/8")).toBe("2");
    expect(label(5, 12, "12/8")).toBe("2li");
    expect(barPosition(rat(1, 2), "6/8").beat).toBe(2);
  });
  test("odd meters count each group from 1", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => label(i, 7, "7/8"))).toEqual(["1", "2", "1", "2", "1", "2", "3"]);
    const m = meterWith("7/8", [3, 2, 2]);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => label(i, 7, m))).toEqual(["1", "2", "3", "1", "2", "1", "2"]);
    expect([0, 1, 2, 3, 4].map((i) => label(i, 5, "5/8"))).toEqual(["1", "2", "1", "2", "3"]);
    expect(label(1, 14, "7/8")).toBe("1&");
  });
  test("pickups: cycle 0 is bar 0, the pickup bar", () => {
    const p = { units: rat(1) };
    expect(barPosition(rat(2, 3), "3/4", p)).toMatchObject({ bar: 0, beat: 3, label: "3", pickup: true });
    expect(barPosition(rat(1), "3/4", p)).toMatchObject({ bar: 1, pickup: false });
    expect(barPosition(rat(1), "3/4")).toMatchObject({ bar: 2, pickup: false });
  });
});

describe("Euclid and the timelines", () => {
  test("textbook Euclidean rhythms (Toussaint)", () => {
    const x = (k: number, n: number, r = 0) =>
      euclid(k, n, r)
        .map((b) => (b ? "x" : "."))
        .join("");
    expect(x(3, 8)).toBe("x..x..x.");
    expect(x(5, 8)).toBe("x.xx.xx.");
    expect(x(2, 5)).toBe("x.x..");
    expect(x(4, 12)).toBe("x..x..x..x..");
    expect(x(5, 16)).toBe("x..x..x..x..x...");
    expect(x(0, 4)).toBe("....");
    expect(x(-3, 8)).toBe(".xx.xx.x");
    expect(() => euclid(9, 8)).toThrow();
  });
  test("clave and friends", () => {
    const steps = (id: string) =>
      gridSteps(rhythmGrid(id) as never)
        .map((b) => (b ? "x" : "."))
        .join("");
    expect(steps("son-clave-3-2")).toBe("x..x..x...x.x...");
    expect(steps("son-clave-2-3")).toBe("..x.x...x..x..x.");
    expect(steps("rumba-clave-3-2")).toBe("x..x...x..x.x...");
    expect(steps("tresillo")).toBe("x..x..x.x..x..x.");
    expect(steps("cinquillo")).toBe("x.xx.xx.x.xx.xx.");
    expect(steps("habanera")).toBe("x..xx.x.x..xx.x.");
    // 2-3 is 3-2 starting at the other bar
    const a = onsetsOf(gridSteps(rhythmGrid("son-clave-3-2") as never))
      .map((o) => (o + 8) % 16)
      .sort((p, q) => p - q);
    expect(a).toEqual(rhythmGrid("son-clave-2-3")?.onsets ?? []);
    // the tresillo is euclid(3,8) in each bar
    expect(onsetsOf(euclid(3, 8))).toEqual([0, 3, 6]);
    for (const g of RHYTHM_GRIDS) expect(gridSteps(g).length).toBe(16);
  });
  test("mini-notation", () => {
    expect(gridToMini(rhythmGrid("son-clave-3-2") as never, "bd")).toBe(
      "<[bd ~ ~ bd ~ ~ bd ~] [~ ~ bd ~ bd ~ ~ ~]>",
    );
  });
});
