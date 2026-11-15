// The export's bounds (bounds.ts): a piece that could never end is refused before it runs, with a plain message.
import { describe, expect, test } from "bun:test";
import { lintBase } from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import { transpiler } from "@strudel/transpiler";
import { boundedQuery, checkSource, largestNumber, MAX_LITERAL, MAX_NOTES } from "./bounds.ts";
import { PieceRenderError } from "./errors.ts";

const piece = (body: string, bars = 2) =>
  `setcpm(120/4)\nconst melVerse = ${body}\nmel: arrange([${bars}, melVerse])`;

function refusal(fn: () => unknown): { code: string; message: string } | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof PieceRenderError)) throw e;
    return { code: e.code, message: e.message };
  }
}

describe("bound 1: the source is read before it runs", () => {
  test("a piece with a form gives its bars", () => {
    expect(checkSource(piece('note("c4 e4").s("piano")', 8))).toBe(8);
    expect(checkSource(piece('note("c4").s("piano").lpf(20000).fast(16)', 4))).toBe(4);
  });

  test("a JavaScript loop is refused before any frame, though the editor's base profile lets a learner type one", () => {
    for (const body of [
      "(() => { while (true) {} return silence })()",
      "(function f() { for (;;) {} })()",
      "(() => { do {} while (1); return silence })()",
      '(() => { for (const x of [1]) {} return note("c4") })()',
    ]) {
      expect(lintBase(piece(body)).filter((d) => d.severity === "error")).toEqual([]);
      const r = refusal(() => checkSource(piece(body)));
      expect([body, r?.code]).toEqual([body, "length"]);
      expect(r?.message).toContain("cannot stop a loop");
    }
    // A function and recursion are not loops: recursion ends at the stack's limit and throws, which the frame reports.
    expect(
      checkSource(piece('[0, 1].map((i) => note("c4").late(i / 2)).reduce((a, b) => stack(a, b))')),
    ).toBe(2);
  });

  test("a number past the limit is refused in JS, as a constant expression and inside a pattern string", () => {
    for (const body of [
      'note("c4").fast(1e9)',
      'note("c4").ply(1000 * 1000)',
      'n(run(10 ** 9)).scale("C4:major")',
      'note("c4*1000000000").s("piano")',
      's("hh").fast("<1 250000>")',
      'note("c4").segment(-2 * 100000)',
    ]) {
      const r = refusal(() => checkSource(piece(body)));
      expect([body, r?.code]).toEqual([body, "too-long"]);
      expect(r?.message).toContain("never finish");
    }
    // At the limit, and everything a piece writes (cutoffs, compressor settings, chord names), is fine.
    expect(checkSource(piece(`note("c4").s("piano").lpf(${MAX_LITERAL})`))).toBe(2);
    expect(
      checkSource(piece('chord("<C13 Bb7#11>").voicing().s("rhodes").compressor("-30:20:10:.002:.02")')),
    ).toBe(2);
  });

  test("largestNumber reads names as unknown, not as zero, and ignores the digits of note and chord names", () => {
    expect(largestNumber('const x = 4\nn(x * 1000).s("piano")')).toBe(1000);
    expect(largestNumber('note("c4 eb5 a3").s("piano")')).toBe(0);
    expect(largestNumber('s("bd:3 sd")')).toBe(3);
    expect(largestNumber('chord("C13 Cm11")')).toBe(0);
    expect(largestNumber("x(")).toBe(0); // a parse error is the lint's
  });

  test("the length comes from the form: none, inconsistent or too long is refused", () => {
    expect(refusal(() => checkSource('setcpm(30)\nmel: note("c4")'))?.code).toBe("length");
    expect(refusal(() => checkSource(piece('note("c4")', 129)))).toEqual({
      code: "too-long",
      message: "The piece has 129 bars; exports support at most 128.",
    });
  });

  test("Band code is read with the strict profile and has no form of its own", () => {
    expect(checkSource('bass: n("0 4").scale("C2:major").s("ebass")', true)).toBeNull();
    expect(refusal(() => checkSource('bass: n("0").fast(1e7).s("ebass")', true))?.code).toBe("too-long");
  });
});

describe("bound 3: notes are read a slice at a time against a note and a time budget", () => {
  const evaluate = async (code: string) => {
    // The scope headless Strudel uses (mini's SyntaxError left out, as @oak/grader/testing does).
    const { SyntaxError: _peggy, ...miniScope } = mini;
    await core.evalScope(core, miniScope);
    const repl = core.repl({ transpiler, getTime: () => 0 }) as unknown as {
      evaluate(code: string, autostart: boolean): Promise<Strudel.Pattern>;
    };
    return repl.evaluate(code, false);
  };
  const onset = (h: Strudel.Hap) => h.hasOnset();

  test("every onset of the form once, the same notes a whole-form query gives", async () => {
    const pattern = await evaluate('note("<[c4 e4 g4]@3 a4> [d4 f4]*3").s("piano")');
    const sliced = boundedQuery(pattern, { bars: 8, hasOnset: onset });
    const whole = pattern.queryArc(0, 8).filter(onset);
    const key = (h: Strudel.Hap) => `${Number(h.whole?.begin.valueOf())}:${JSON.stringify(h.value)}`;
    expect(sliced.map(key).sort()).toEqual(whole.map(key).sort());
    // And headless Strudel, the grader's realm, agrees on the count.
    const headless = await evalHeadless('note("<[c4 e4 g4]@3 a4> [d4 f4]*3").s("piano")', 8);
    expect(sliced.length).toBe(headless.events.length);
  });

  test("a pattern that grows denser than the budget later in the form is refused at that bar", async () => {
    // Sparse for three bars, then 70 000 notes in bar 4: the slices are a bar wide by then.
    const pattern = await evaluate('s("hh").fast("<1 1 1 70000>")');
    const r = refusal(() => boundedQuery(pattern, { bars: 8, hasOnset: onset }));
    expect(r?.code).toBe("too-long");
    expect(r?.message).toBe(
      `The piece plays more than ${MAX_NOTES.toLocaleString("en-US")} notes by bar 4; an export stops there. Thin out the fastest part.`,
    );
  });

  test("a dense product of allowed numbers is refused from the first slice, which stays small", async () => {
    // 10^10 notes a bar: the first slice (2^-18 of a bar) already holds more than the budget.
    const pattern = await evaluate('s("hh*100000").fast(100000)');
    let largest = 0;
    const counting = {
      queryArc: (b: number, e: number, st?: unknown) => {
        largest = Math.max(largest, e - b);
        return pattern.queryArc(b, e, st as Record<string, unknown> | undefined);
      },
    };
    const started = performance.now();
    expect(refusal(() => boundedQuery(counting, { bars: 4, hasOnset: onset, maxNotes: 1000 }))?.code).toBe(
      "too-long",
    );
    expect(largest).toBeLessThanOrEqual(2 ** -18);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  test("the time budget refuses with a plain message", async () => {
    const pattern = await evaluate('note("c4 e4").s("piano")');
    let t = 0;
    const r = refusal(() =>
      boundedQuery(pattern, { bars: 128, hasOnset: onset, budgetMs: 50, now: () => (t += 10) }),
    );
    expect(r?.code).toBe("timeout");
    expect(r?.message).toContain("longer than 0.05 seconds");
  });
});
