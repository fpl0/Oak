// Wave 4 review regressions in the Workbench (real Strudel in-process):
// - the lens lines of a piece with a pickup sit under their own notes (the first system holds the pickup bar
//   plus a full system, and the lines followed a plain four-bar grouping: bar 5's degrees printed under bar 6);
// - a chord under a tune on one staff gets its lens lines too; with numerals the first voice is padded with a
//   blank line per later-voice line, so the numerals stay under the staff below every lens line (c5, closer);
// - chord symbols are spelled in the key (C♯m in A major, F♭ in C♭ major), not by pitch class (D♭m, E).
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { checkAbc } from "../../../packages/notation/corpus/harness.ts";
import { spelledSymbol } from "./harmony.ts";
import { buildModel, busiestBar, type ModelOptions, staffPage, type WorkbenchModel } from "./model.ts";

setDefaultTimeout(60_000);
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(code: string, bars: number, opts: Partial<ModelOptions> = {}): Promise<WorkbenchModel> {
  const result = await evaluateForGrading(code, { mode: "lesson", bars, lint: null });
  const out = buildModel(code, result, { meter: "4/4", key: null, staff: "auto", ...opts });
  if (!out.ok) throw new Error(`${out.error.kind}: ${out.error.message}`);
  return out.model;
}

const DEGREES = { degree: true, solfege: false, noteName: false };

/** The `w:` lines of an ABC tune, per system, as written. */
const wLines = (abc: string) => abc.split("\n").filter((l) => l.startsWith("w:"));

describe("lens lines under a pickup", () => {
  test("bar 0 plus four bars on the first system: every degree under its own note", async () => {
    const code =
      'setcpm(90/4)\nmel: n("<[~ ~ ~ -3] [0 2] [4 2] [1 0] [4 4] [5 3] [2 1] 0>").scale("C4:major").s("piano")';
    const m = await model(code, 8, { pickup: { units: [1, 1] }, annotations: DEGREES });
    const page = staffPage({ ...(m.staffSource as NonNullable<typeof m.staffSource>), barsPerLine: 4 }, 0);
    const abc = page.abc?.abc ?? "";
    expect(wLines(abc)).toEqual(["w:5 | 1 3 | 5 3 | 2 1 | 5 5", "w:6 4 | 3 2 | 1"]);
    // abcjs reads one syllable per note: as many syllables as notes.
    expect(checkAbc(abc).lyrics.filter((l) => l !== null)).toHaveLength(14);
  });
});

describe("a chord under a tune on one staff", () => {
  const code =
    'setcpm(90/4)\nchords: n("<[0,2,4] [1,3,5]>").scale("A3:major").s("piano")\nmel: n("<[4 2] [5 3]>").scale("A4:major").s("piano")';

  test("the chord's degrees are written under it", async () => {
    const m = await model(code, 2, { annotations: DEGREES });
    const abc = m.abc?.abc ?? "";
    expect(abc).toContain("V:S1v2");
    // The tune's line, its blank pad (the chord's room under the staff), the chord's line.
    expect(wLines(abc)).toEqual(["w:5 3 | 6 4", "w:~ ~ | ~ ~", "w:1~3~5 | 2~4~6"]);
  });

  test("with numerals, both voices keep their lines and the numerals stay below them (c5)", async () => {
    const m = await model(code, 2, { annotations: DEGREES });
    const src = m.staffSource as NonNullable<typeof m.staffSource>;
    const page = staffPage({ ...src, chordSet: { symbols: true, romans: true } }, 0);
    const abc = page.abc?.abc ?? "";
    // The tune's line, a blank line reserving the chord's room under the staff, then the chord's line: abcjs sets
    // the numerals under the first voice's lines, so with the pad they clear the chord's (closer: above the staff
    // they ran into the chord symbols and the stems, ui-review wave4-notation).
    expect(wLines(abc)).toEqual(["w:5 3 | 6 4", "w:~ ~ | ~ ~", "w:1~3~5 | 2~4~6"]);
    expect(abc).toContain('"_I"');
    expect(abc).not.toContain('"^I"');
    const check = checkAbc(abc);
    expect(check.warnings).toEqual([]);
    expect(check.lyrics.filter((l) => l !== null)).toHaveLength(4);
    expect(check.labels.filter((l) => l.position === "below").map((l) => l.text)).toEqual(["I", "ii"]);
  });

  test("a staff with one voice keeps its numerals below", async () => {
    const m = await model('chords: n("<[0,2,4] [3,5,7]>").scale("A3:major").s("piano")', 2, {
      annotations: DEGREES,
    });
    const src = m.staffSource as NonNullable<typeof m.staffSource>;
    const abc = staffPage({ ...src, chordSet: { symbols: true, romans: true } }, 0).abc?.abc ?? "";
    expect(abc).toContain('"_I"');
  });
});

describe("the busiest bar, per staff (Wave 4 gate)", () => {
  test("a tune over a chord a bar: each staff of a grand staff is counted alone; one staff counts both", async () => {
    const code =
      'setcpm(90/4)\nchords: n("<[0,2,4] [4,6,8]>").scale("C3:major").s("piano")\nmel: n("<[4 2 0 2] [4 3 2 ~]>").scale("C4:major").s("piano")';
    const m = await model(code, 2);
    const events = m.staffSource?.events ?? [];
    // Four tune notes on the treble staff, three chord notes on the bass staff: the treble decides.
    expect(busiestBar(events, { grand: true })).toBe(4);
    // On one staff the chord's names and the tune's share the line: seven.
    expect(busiestBar(events)).toBe(7);
  });
});

describe("chord symbols spelled in the key", () => {
  const slot = (symbol: string, rn: string | null, pcs: number[], bassPc: number, written?: string) => ({
    symbol,
    rn,
    pcs,
    bassPc,
    ...(written ? { written } : {}),
  });
  const k = (tonic: string) => ({ tonic, mode: "major" }) as KeySpec;

  test("iii and vii° of A major, IV of C♭ major, V6 of E major", () => {
    expect(spelledSymbol(slot("D♭m", "iii", [1, 4, 8], 1), k("A"))).toBe("C♯m");
    expect(spelledSymbol(slot("A♭°", "viio", [2, 8, 11], 8), k("A"))).toBe("G♯°");
    expect(spelledSymbol(slot("E", "IV", [4, 8, 11], 4), k("Cb"))).toBe("F♭");
    expect(spelledSymbol(slot("B/E♭", "V6", [3, 6, 11], 3), k("E"))).toBe("B/D♯");
  });

  test("a symbol the learner wrote stays as written; no key, no change; a mismatch keeps the view's", () => {
    expect(spelledSymbol(slot("D♭m", "iii", [1, 4, 8], 1, "Dbm"), k("A"))).toBe("D♭m");
    expect(spelledSymbol(slot("D♭m", "iii", [1, 4, 8], 1), null)).toBe("D♭m");
    // A numeral that names another chord (a seventh read as a triad) is not used to respell.
    expect(spelledSymbol(slot("D♭m7", "iii", [1, 4, 8, 11], 1), k("A"))).toBe("D♭m7");
  });

  test("on the chord band: the seven triads of A major", async () => {
    const m = await model(
      'chords: n("<[0,2,4] [1,3,5] [2,4,6] [3,5,7] [4,6,8] [5,7,9] [6,8,10]>").scale("A3:major").s("piano")',
      7,
    );
    expect(m.harmony?.regions.map((r) => r.symbol)).toEqual(["A", "Bm", "C♯m", "D", "E", "F♯m", "G♯°"]);
  });
});
