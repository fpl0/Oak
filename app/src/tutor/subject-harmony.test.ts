// The tutor's chord map from the Workbench's analysis (`TutorSubject.harmony`): what the chord and numeral chips
// light. Real Strudel through the grader realm and the Workbench model, cross-checked with headless Strudel.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { buildModel } from "../workbench/model.ts";
import { barsWhere, chordAtsOfView } from "./harmony-chips.ts";

setDefaultTimeout(30_000);

beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

const C = { tonic: "C", mode: "major" } as const;

async function viewOf(code: string, bars: number) {
  const result = await evaluateForGrading(code, { mode: "lesson", bars, lint: null });
  const out = buildModel(code, result, { meter: "4/4", key: C, staff: "auto" });
  if (!out.ok) throw new Error(out.error.message);
  return out.model.harmony?.view ?? null;
}

describe("chordAtsOfView", () => {
  test("hand-stacked C G Am F in n(): one entry a bar, numerals in Oak's dialect", async () => {
    const code = 'chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")';
    // Headless Strudel: bar 3 is A3 C4 E4 (Am).
    const b3 = (await evalHeadless(code, 4)).events.filter((e) => e.onset === 2).map((e) => e.midi);
    expect(b3).toEqual([57, 60, 64]);
    const map = chordAtsOfView(await viewOf(code, 4));
    expect(map).toEqual([
      { bar: 1, symbol: "C", rn: "I" },
      { bar: 2, symbol: "G", rn: "V" },
      { bar: 3, symbol: "Am", rn: "vi" },
      { bar: 4, symbol: "F", rn: "IV" },
    ]);
  });

  test("a chord held over two bars is one entry; a second chord in a bar carries its beat", async () => {
    const code = 'chords: n("<[0,2,4] [0,2,4] [[3,5,7] [4,6,8]]>").scale("C3:major").s("piano")';
    const map = chordAtsOfView(await viewOf(code, 3));
    expect(map.map((c) => [c.bar, c.beat ?? 1, c.symbol])).toEqual([
      [1, 1, "C"],
      [3, 1, "F"],
      [3, 3, "G"],
    ]);
  });

  test("the map lights the bars a chip names, for code with no chord() pattern", async () => {
    const code = 'chords: n("<[0,2,4] [4,6,8] [5,7,9] [4,6,8]>").scale("C3:major").s("piano")';
    const map = chordAtsOfView(await viewOf(code, 4));
    expect(code).not.toContain("chord(");
    expect(barsWhere(map, { kind: "chord", value: "G" }, C)).toEqual([2, 4]);
    expect(barsWhere(map, { kind: "rn", value: "vi" }, C)).toEqual([3]);
  });

  test("no view, no entries", () => {
    expect(chordAtsOfView(null)).toEqual([]);
  });
});
