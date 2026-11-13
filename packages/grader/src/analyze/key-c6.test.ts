// Carry-over c6 (Wave 4 review): `keyEstimate` read the sparse sketch D F♯ A F♯ as F♯ minor and a long D-minor sketch
// (its melody leaning on F) as F major. Both are fixed: a sparse line is read in the key whose tonic triad holds it,
// and two relative keys that score close are decided by which tonic triad stands on the bar lines and where the
// music starts and ends. The clear cases keep their keys.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { strudel } from "./__support__/fixtures.ts";
import { keyEstimate, keyOf } from "./key.ts";

setDefaultTimeout(30_000);
const top = async (code: string, bars: number) => {
  const n = await strudel(code, bars);
  const k = keyEstimate(n.all)[0]?.key;
  return k ? `${k.tonic} ${k.mode}` : null;
};
const D_MINOR_SKETCH = `chords: note("<[d3,f3,a3] [bb2,d3,f3] [c3,e3,g3] [f2,a2,c3]>").slow(2)
bass: note("<d2 bb1 c2 f1>").slow(2)
mel: note("<[d4 f4 a4 f4] [e4 d4 c4 a3] [bb3 d4 f4 d4] [c4 e4 g4 e4] [f4 e4 d4 c4] [a3 c4 e4 a4] [d5 a4 f4 d4] [d4 ~ ~ ~]>")`;

describe("c6: keyEstimate on sparse and long sketches", () => {
  test("D F♯ A F♯ is D major (its tonic triad), not F♯ minor", async () => {
    expect(await top('mel: note("d4 f#4 a4 f#4")', 1)).toBe("D major");
    expect(await top('mel: note("a3 c4 e4 c4")', 1)).toBe("A minor");
    expect(await top('mel: note("g4 b4 d5 b4 g4")', 1)).toBe("G major");
  });
  test("a 64-bar D-minor sketch is D minor, not its relative F major", async () => {
    expect(await top(D_MINOR_SKETCH, 64)).toBe("D minor");
    // With the raised 7 (C♯ in the A chord) it was already D minor; it stays so.
    expect(await top(D_MINOR_SKETCH.replace("[f2,a2,c3]", "[a2,c#3,e3]").replace("f1>", "a1>"), 64)).toBe(
      "D minor",
    );
  });
  test("clear keys keep their key; a pop loop in C stays C major, not A minor", async () => {
    expect(await top('mel: note("c4 d4 e4 f4 g4 e4 c4 ~")', 1)).toBe("C major");
    expect(await top('mel: note("<[a3 c4 e4 c4] [d4 c4 b3 g#3] [a3 e4 c4 b3] [a3 ~ ~ ~]>")', 4)).toBe(
      "A minor",
    );
    expect(
      await top(
        'chords: note("<[c3,e3,g3] [g2,b2,d3] [a2,c3,e3] [f2,a2,c3]>")\nbass: note("<c2 g1 a1 f1>")',
        4,
      ),
    ).toBe("C major");
    expect(
      await top(
        'chords: note("<[a2,c3,e3] [f2,a2,c3] [c3,e3,g3] [g2,b2,d3]>")\nbass: note("<a1 f1 c2 g1>")',
        4,
      ),
    ).toBe("A minor");
  });
  test("a declared key and the code's own .scale() still come first (contracts §6.8 item 1)", async () => {
    const n = await strudel('mel: n("0 2 4 2").scale("F#4:minor")', 1);
    expect(keyOf(n.all)).toEqual({ tonic: "F#", mode: "minor" });
    expect(keyOf(n.all, { tonic: "D", mode: "major" })).toEqual({ tonic: "D", mode: "major" });
  });
});
