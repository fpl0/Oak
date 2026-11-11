// Adversarial music review of the matchers on real Strudel output: enharmonic spellings, relative keys,
// minor with the raised 7th, compound and odd meters in messages. `regression:` tests failed before their fix.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Matcher } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import type { MatchResult, NormalizeContext as NCtx } from "../types.ts";
import { lengthLabel } from "./common.ts";
import { runMatcher } from "./index.ts";

setDefaultTimeout(30_000);
const ids = (r: MatchResult): string[] => r.diagnostics.map((d) => d.id);
async function run(m: Matcher, ref: string, ans: string, ctx: NCtx, bars = 1): Promise<MatchResult> {
  return runMatcher(m, await strudel(ref, bars), await strudel(ans, bars), ctx);
}
const melody = (pitch: Extract<Matcher, { m: "melody" }>["pitch"]): Matcher => ({
  m: "melody",
  pitch,
  wPitch: 0.7,
  wRhythm: 0.3,
  rhythmTol: rat(0),
});
const C: NCtx = { meter: "4/4", key: { tonic: "C", mode: "major" } };

describe("melody matcher", () => {
  test("enharmonic spellings are the same pitch: F♯ = G♭, B♯ = C, E♯ = F", async () => {
    const ctx: NCtx = { meter: "4/4", key: { tonic: "F#", mode: "major" } };
    const r = await run(melody("absolute"), 'note("f#4 a#4 c#5 e#5")', 'note("gb4 bb4 db5 f5")', ctx);
    expect(r.score).toBe(1);
    expect(ids(r)).toEqual([]);
  });
  test("regression: key-relative with note names in a melody that leans on vi still reads the declared key", async () => {
    // A C-major tune that sits on A and E: a key estimate alone calls it A minor and shifts every degree.
    const tune = 'note("a4 e5 c5 a4 e4 a4 c5 e5")';
    const r = await run(melody("key-relative"), tune, tune, C);
    expect(r.score).toBe(1);
    expect(ids(r)).toEqual([]);
  });
  test("regression: key-relative answer in note names, transposed to D, matches degree for degree", async () => {
    const r = await run(
      melody("key-relative"),
      'note("a4 e5 c5 a4 e4 a4 c5 e5")',
      'note("b4 f#5 d5 b4 f#4 b4 d5 f#5")',
      C,
    );
    expect(r.dims.pitch?.score).toBe(1);
    expect(ids(r)).toEqual(["melody.transposed"]);
  });
  test("A harmonic minor: the raised 7th is degree 7 (ti), the natural one ♭7 (te)", async () => {
    const ctx: NCtx = { meter: "4/4", key: { tonic: "A", mode: "minor" } };
    const r = await run(
      melody("key-relative"),
      'n("0 6# 7 4").scale("A3:minor")',
      'n("0 6 7 4").scale("A3:minor")',
      ctx,
    );
    expect(ids(r)).toEqual(["melody.wrong-degree"]);
    expect(r.diagnostics[0]?.params).toMatchObject({ got: "b7", gotSyl: "te", exp: "7", expSyl: "ti" });
  });
});

describe("lengths in messages", () => {
  test("regression: in 7/8 and 5/8 half an 8th is a 16th", () => {
    expect(lengthLabel(rat(1, 14), "7/8")).toBe("a 16th");
    expect(lengthLabel(rat(1, 7), "7/8")).toBe("an 8th");
    expect(lengthLabel(rat(2, 7), "7/8")).toBe("2 8ths");
    expect(lengthLabel(rat(1, 10), "5/8")).toBe("a 16th");
  });
  test("compound and simple meters", () => {
    expect(lengthLabel(rat(1, 6), "6/8")).toBe("an 8th");
    expect(lengthLabel(rat(1, 2), "6/8")).toBe("a beat");
    expect(lengthLabel(rat(1, 12), "6/8")).toBe("a 16th");
    expect(lengthLabel(rat(1, 8), "4/4")).toBe("an 8th");
    expect(lengthLabel(rat(1, 12), "4/4")).toBe("a triplet 8th");
    expect(lengthLabel(rat(1, 3), "3/4")).toBe("a beat");
  });
});
