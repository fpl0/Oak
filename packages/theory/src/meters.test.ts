import { describe, expect, test } from "bun:test";
import { METER_IDS, schemas } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { z } from "zod";
import {
  barSeconds,
  bpmToCpm,
  bpmToCps,
  cpmToBpm,
  cpsToBpm,
  METERS,
  meterWith,
  swingByArgs,
  tempoLine,
} from "./meters.ts";

// One golden row per meter, straight from the table of contracts §6.9.
const GOLDEN = [
  { id: "4/4", unit: "quarter", unitsPerBar: 4, line: "setcpm(120/4)", cpm: 30 },
  { id: "3/4", unit: "quarter", unitsPerBar: 3, line: "setcpm(120/3)", cpm: 40 },
  { id: "2/4", unit: "quarter", unitsPerBar: 2, line: "setcpm(120/2)", cpm: 60 },
  { id: "6/8", unit: "dottedQuarter", unitsPerBar: 2, line: "setcpm(120/2)", cpm: 60 },
  { id: "9/8", unit: "dottedQuarter", unitsPerBar: 3, line: "setcpm(120/3)", cpm: 40 },
  { id: "12/8", unit: "dottedQuarter", unitsPerBar: 4, line: "setcpm(120/4)", cpm: 30 },
  { id: "5/4", unit: "quarter", unitsPerBar: 5, line: "setcpm(120/5)", cpm: 24 },
  { id: "5/8", unit: "eighth", unitsPerBar: 5, line: "setcpm(120/5)", cpm: 24 },
  { id: "7/8", unit: "eighth", unitsPerBar: 7, line: "setcpm(120/7)", cpm: 120 / 7 },
  { id: "9/8i", unit: "eighth", unitsPerBar: 9, line: "setcpm(120/9)", cpm: 120 / 9 },
] as const;

describe("METERS (contracts §6.9)", () => {
  test("the table has exactly the ten meters", () => {
    expect(Object.keys(METERS)).toEqual([...METER_IDS]);
    expect(GOLDEN.map((g) => g.id)).toEqual([...METER_IDS]);
  });

  for (const g of GOLDEN) {
    test(`${g.id}: BPM counts the ${g.unit}, ${g.unitsPerBar} per bar`, () => {
      const m = METERS[g.id];
      expect(m.id).toBe(g.id);
      expect(m.tempoUnit).toBe(g.unit);
      expect(m.unitsPerBar).toBe(g.unitsPerBar);
      expect(tempoLine(120, g.id)).toBe(g.line);
      expect(bpmToCpm(120, g.id)).toBeCloseTo(g.cpm, 12);
      expect(cpmToBpm(bpmToCpm(97, g.id), g.id)).toBeCloseTo(97, 12);
      expect(cpsToBpm(bpmToCps(97, g.id), g.id)).toBeCloseTo(97, 12);
      // The grouping covers the bar: in tempo units for /4 meters, in eighths for /8 meters.
      expect(m.grouping.reduce((a, b) => a + b, 0)).toBe(m.den === 8 ? m.num : m.unitsPerBar);
    });
  }

  test("num and den read as written; 9/8i is nine eighths", () => {
    expect([METERS["6/8"].num, METERS["6/8"].den]).toEqual([6, 8]);
    expect([METERS["9/8i"].num, METERS["9/8i"].den]).toEqual([9, 8]);
    expect(METERS["9/8"].grouping).toEqual([3, 3, 3]);
    expect(METERS["9/8i"].grouping).toEqual([2, 2, 2, 3]);
  });

  test("the facts executed in Wave 0: setcpm(120/4) is 0.5 cps, setcpm(90) is 1.5 cps", () => {
    expect(bpmToCps(120, "4/4")).toBe(0.5);
    expect(cpsToBpm(1.5, "4/4")).toBe(360);
    // "That is 480 BPM: divide by the beats per bar": setcpm(120) in 4/4 is off by exactly unitsPerBar.
    expect(cpmToBpm(120, "4/4")).toBe(480);
    expect(barSeconds(120, "4/4")).toBe(2);
    expect(barSeconds(120, "6/8")).toBe(1);
  });

  test("declared groupings", () => {
    expect(meterWith("7/8", [3, 2, 2]).grouping).toEqual([3, 2, 2]);
    expect(meterWith("5/4", [2, 3]).grouping).toEqual([2, 3]);
    expect(meterWith("4/4")).toBe(METERS["4/4"]);
    expect(() => meterWith("7/8", [4, 3])).toThrow(RangeError);
    expect(() => meterWith("4/4", [2, 2])).toThrow(RangeError);
    expect(METERS["7/8"].grouping).toEqual([2, 2, 3]);
  });

  test("swing convention (contracts §6.10): swingBy(1/3, unitsPerBar) for 8ths, twice that for 16ths, none in compound meters", () => {
    expect(swingByArgs("4/4", 8)).toBe(4);
    expect(swingByArgs("3/4", 8)).toBe(3);
    expect(swingByArgs("4/4", 16)).toBe(8);
    expect(swingByArgs("6/8", 8)).toBeNull();
    expect(swingByArgs("7/8", 8)).toBeNull();
  });

  test("every row is a valid MeterSpec for the content schema", () => {
    const MeterSpecSchema = z.strictObject({
      id: z.enum(METER_IDS),
      num: z.number().int().positive(),
      den: z.union([z.literal(4), z.literal(8)]),
      tempoUnit: z.enum(["quarter", "dottedQuarter", "eighth"]),
      unitsPerBar: z.number().int().positive(),
      grouping: z.array(z.number().int().positive()).min(1),
    });
    for (const m of Object.values(METERS)) expect(MeterSpecSchema.safeParse(m).success).toBe(true);
    expect(schemas.KeySpecSchema.safeParse({ tonic: "Eb", mode: "major" }).success).toBe(true);
  });
});

describe("the tempo line against headless Strudel", () => {
  test("setcpm(bpm / unitsPerBar) gives one bar per cycle at the stated BPM", async () => {
    for (const g of GOLDEN) {
      // Exactly the line a lesson would contain, then one hit per tempo unit.
      const { cps, cpsSet, events } = await evalHeadless(
        `${tempoLine(96, g.id)}\ns("bd*${METERS[g.id].unitsPerBar}")`,
      );
      expect(cpsSet).toBe(true);
      expect(events).toHaveLength(METERS[g.id].unitsPerBar);
      expect(cpsToBpm(cps, g.id)).toBeCloseTo(96, 9);
      // One tempo unit lasts 60 / bpm seconds.
      expect(1 / cps / METERS[g.id].unitsPerBar).toBeCloseTo(60 / 96, 9);
    }
  });

  test("swingByArgs gives the argument that swings the stated subdivision (contracts §6.10)", async () => {
    // 3/4, eighth swing: the off-beat of every beat sits at 2/3 of the beat.
    const three = await evalHeadless(`s("hh*6").swingBy(1/3, ${swingByArgs("3/4", 8)})`);
    expect(three.events.map((e) => e.begin)).toEqual(["0", "2/9", "1/3", "5/9", "2/3", "8/9"]);
    // 4/4, sixteenth swing.
    const sixteen = await evalHeadless(`s("hh*16").swingBy(1/3, ${swingByArgs("4/4", 16)})`);
    expect(sixteen.events.slice(0, 4).map((e) => e.begin)).toEqual(["0", "1/12", "1/8", "5/24"]);
  });
});
