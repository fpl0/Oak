// Wave 7 review (review:surfaces): the chord band's numerals beside jazz symbols. Theory's display leaves a figure's
// altered tension in Oak's ASCII dialect, so a band read "G7♭9 V7b9" and "C∆♯11 Imaj7#11"; the figure now carries
// the same glyphs as the symbol beside it. The microtiming lens drew its "+48 ms" over the note's degree label.
import { describe, expect, test } from "bun:test";
import { figureGlyphs, rnDisplay } from "./harmony.ts";
import { microLabelAt, type RollRect } from "./roll-layout.ts";

const C = { tonic: "C", mode: "major" } as const;

describe("numerals with altered tensions", () => {
  test("the figure's ♭ and ♯ as glyphs, the numeral as theory displays it", () => {
    expect(rnDisplay("V7b9", C)).toBe("V7♭9");
    expect(rnDisplay("Imaj7#11", C)).toBe("Imaj7♯11");
    expect(rnDisplay("V7#9", C)).toBe("V7♯9");
    expect(rnDisplay("V7b13", C)).toBe("V7♭13");
    expect(rnDisplay("bVII7", C)).toBe("♭VII7");
    expect(rnDisplay("viio7", C)).toBe("vii°7");
    expect(rnDisplay("iih7", C)).toBe("iiø7");
    expect(rnDisplay("V7#11/IV", C)).toBe("V7♯11/IV");
  });
  test("nothing else changes: a figure without an alteration, a numeral without a key", () => {
    expect(figureGlyphs("V13")).toBe("V13");
    expect(figureGlyphs("bVI7alt")).toBe("bVI7alt");
    expect(rnDisplay("V7b9", null)).toBe("V7b9");
    expect(rnDisplay(null, C)).toBeNull();
  });
});

describe("the microtiming label's place on the roll", () => {
  // A row of late notes a beat apart (28 px a beat, as a 4-bar roll at 1440 draws them), each with its degree
  // label above it: the label once stood above the first note, on "1 do".
  const row = (y: number, xs: number[]): RollRect[] =>
    xs.map((x, i) => ({ id: `n${y}-${i}`, kind: "note", x, y, w: 26, h: 7 }));
  const crosses = (at: { x: number; y: number }, w: number, o: RollRect) =>
    o.x < at.x + w + 2 && o.x + o.w > at.x - 2 && o.y < at.y + 6 && o.y + o.h > at.y - 6;
  test("never over a note or a degree label; under the note when its row has no room", () => {
    const notes = [...row(100, [74, 130, 186, 242]), ...row(70, [74, 130, 186, 242])];
    const r = notes[0] as RollRect;
    const at = microLabelAt(notes, r, 72, 35, 44, 496);
    expect(at).not.toBeNull();
    expect(at?.y).toBeGreaterThan(r.y + r.h);
    for (const o of notes) expect(crosses(at as { x: number; y: number }, 35, o)).toBe(false);
  });
  test("before the note when the row is free there; after it when only that side is", () => {
    const lone = row(100, [200])[0] as RollRect;
    expect(microLabelAt([lone], lone, 196, 35, 44, 496)).toEqual({ x: 196 - 4 - 35, y: 103.5 });
    expect(microLabelAt([lone], lone, 60, 35, 44, 496)).toEqual({ x: 230, y: 103.5 });
  });
  test("no room anywhere: no label (the facts line says it)", () => {
    const dense = [
      ...row(100, [50, 80, 110]),
      ...row(110, [40, 70, 100, 130]),
      ...row(90, [40, 70, 100, 130]),
    ];
    expect(microLabelAt(dense, dense[1] as RollRect, 78, 35, 44, 160)).toBeNull();
  });
});
