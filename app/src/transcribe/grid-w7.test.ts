// Wave 7 on the timeline: swung 16ths, odd meters by their groups and the two-bar clave grid, each checked against
// what Strudel plays (headless, the same rendering the grader reads) and against @oak/theory's own tables.
import { describe, expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { claveOf } from "@oak/theory";
import {
  CLAVE_CYCLE,
  claveSideOfBar,
  claveStrokesInBar,
  claveText,
  feelOfOnsets,
  feelText,
  gridTicks,
  groupingText,
  isOddEighths,
  nextClave,
} from "./grid.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("swung 16ths on the grid (R1.L02)", () => {
  test("the late 16ths sit where swingBy(1/3, 8) plays them in 4/4", async () => {
    const r = await evalHeadless(`setcpm(90/4)\nhats: s("hh*16").swingBy(1/3, 8)`, 1);
    const played = r.events.map((e) => e.onset).sort((a, b) => a - b);
    const ticks = gridTicks("4/4", "swing16").map((t) => t.at);
    expect(ticks).toHaveLength(16);
    for (const at of played) expect(ticks.some((t) => near(t, at))).toBe(true);
    // The count: "1 e & a", the "e" a third into the beat, the "a" five sixths.
    expect(
      gridTicks("4/4", "swing16")
        .slice(0, 4)
        .map((t) => t.label),
    ).toEqual(["1", "e", "&", "a"]);
    expect(gridTicks("4/4", "swing16")[1]?.at).toBeCloseTo(1 / 12, 9);
    expect(gridTicks("4/4", "swing16")[3]?.at).toBeCloseTo(5 / 24, 9);
  });

  test("the feel read from the onsets: swung 16ths are not triplets and not straight 16ths", async () => {
    const swung = await evalHeadless(`hats: s("hh*16").swingBy(1/3, 8)`, 2);
    expect(
      feelOfOnsets(
        swung.events.map((e) => e.onset),
        "4/4",
      ),
    ).toBe("swing16");
    const straight = await evalHeadless(`hats: s("hh*16")`, 2);
    expect(
      feelOfOnsets(
        straight.events.map((e) => e.onset),
        "4/4",
      ),
    ).toBe("straight");
    const trip = await evalHeadless(`hats: s("hh*12")`, 2);
    expect(
      feelOfOnsets(
        trip.events.map((e) => e.onset),
        "4/4",
      ),
    ).toBe("triplet");
    const eighths = await evalHeadless(`hats: s("hh*8").swingBy(1/3, 4)`, 2);
    expect(
      feelOfOnsets(
        eighths.events.map((e) => e.onset),
        "4/4",
      ),
    ).toBe("swing");
  });

  test("the feel is named with its ratio; a compound meter is never swung", () => {
    expect(feelText("4/4", "swing16")).toBe("Swing 16ths (2:1)");
    expect(feelText("4/4", "swing")).toBe("Swing 8ths");
    expect(feelText("12/8", "swing16")).toBe("12/8: the beat is the dotted quarter, in three");
    // 12/8 keeps its three eighths a beat whatever the feel says.
    expect(gridTicks("12/8", "swing16")).toHaveLength(12);
  });
});

describe("odd meters by their groups (R2.L01–L02)", () => {
  test("7/8 is 2+2+3: a beat tick on each group's first eighth, counted 1 2 | 1 2 | 1 2 3", () => {
    const t = gridTicks("7/8", "straight");
    expect(t.map((x) => x.label).join(" ")).toBe("1 2 1 2 1 2 3");
    expect(t.filter((x) => x.kind === "beat").map((x) => x.at * 7)).toEqual([0, 2, 4]);
    expect(isOddEighths("7/8")).toBe(true);
    expect(feelText("7/8", "straight")).toBe("7/8 · 2+2+3");
  });

  test("a declared grouping moves the beats (7/8 as 3+2+2); an illegal one falls back to the default", () => {
    const t = gridTicks("7/8", "straight", [3, 2, 2]);
    expect(t.filter((x) => x.kind === "beat").map((x) => x.at * 7)).toEqual([0, 3, 5]);
    expect(groupingText("7/8", [3, 2, 2])).toBe("3+2+2");
    expect(groupingText("7/8", [4, 3])).toBe("2+2+3");
    expect(gridTicks("9/8i", "straight").filter((x) => x.kind === "beat")).toHaveLength(4);
    expect(feelText("9/8i", "straight")).toBe("9/8i · 2+2+2+3");
  });

  test("5/4 counts five quarters and names its 3+2", () => {
    expect(gridTicks("5/4", "straight").filter((x) => x.kind === "beat")).toHaveLength(5);
    expect(groupingText("5/4", null)).toBe("3+2");
    expect(groupingText("4/4", null)).toBeNull();
  });

  test("the group starts match what Strudel plays for a 2+2+3 accent line in 7/8", async () => {
    // One bar of 7/8 as seven eighths, accents on the group starts: bd on 1, 3, 5.
    const r = await evalHeadless(`setcpm(140/7)\nkick: s("bd ~ bd ~ bd ~ ~")`, 1);
    const beats = gridTicks("7/8", "straight").filter((x) => x.kind === "beat");
    expect(r.events.map((e) => e.onset)).toEqual(beats.map((b) => b.at));
  });
});

describe("the two-bar clave grid (R3.L02)", () => {
  test("son 3-2 holds three strokes in the first bar and two in the second, as Strudel plays the two-bar fixture", async () => {
    const son32 = { type: "son", direction: "3-2" } as const;
    expect(claveStrokesInBar(son32, 0)).toEqual([0, 3 / 8, 6 / 8]);
    expect(claveStrokesInBar(son32, 1)).toEqual([2 / 8, 4 / 8]);
    expect(claveStrokesInBar(son32, 2)).toEqual([0, 3 / 8, 6 / 8]);
    expect(claveSideOfBar(son32, 1)).toBe("2");
    // The R3.L02 fixture line: son 3-2 on two bars of eighths.
    const r = await evalHeadless(`clave: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")`, 2);
    const steps = r.events.map((e) => Math.round(e.onset * 8));
    expect(claveOf(steps)).toEqual(son32);
    const drawn = [0, 1].flatMap((b) => claveStrokesInBar(son32, b).map((x) => Math.round((b + x) * 8)));
    expect(drawn).toEqual(steps);
  });

  test("2-3 swaps the sides; rumba moves the third stroke of the three-side to the 'and' of 4", () => {
    expect(claveStrokesInBar({ type: "son", direction: "2-3" }, 0)).toEqual([2 / 8, 4 / 8]);
    expect(claveStrokesInBar({ type: "rumba", direction: "3-2" }, 0)).toEqual([0, 3 / 8, 7 / 8]);
    expect(claveText({ type: "rumba", direction: "2-3" })).toBe("Rumba clave, 2-3");
  });

  test("K cycles off, son 3-2, son 2-3, rumba 3-2, rumba 2-3 and off again", () => {
    let c = nextClave(null);
    const seen = [c];
    for (let i = 0; i < CLAVE_CYCLE.length - 1; i++) {
      c = nextClave(c);
      seen.push(c);
    }
    expect(seen.map((x) => (x ? claveText(x) : "off"))).toEqual([
      "Son clave, 3-2",
      "Son clave, 2-3",
      "Rumba clave, 3-2",
      "Rumba clave, 2-3",
      "off",
    ]);
  });
});
