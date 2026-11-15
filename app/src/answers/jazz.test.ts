// The jazz track's answer logic (jazz.ts), every musical claim checked against @oak/theory and content-kit.
import { describe, expect, test } from "bun:test";
import { AVAILABLE_TENSIONS, isDropTwo, TENSION_OPTIONS } from "@oak/content-kit";
import { drop2, normalizeText, rootlessVoicing, shellVoicing, voicingType } from "@oak/theory";
import {
  composeJazz,
  JAZZ_PICKER_ROWS,
  jazzReading,
  jazzRnButtons,
  jazzTyped,
  noteMidi,
  pickerQuality,
  rnBrackets,
  suffixOf,
  tensionOf,
  voicedChordOf,
  voicingReadout,
} from "./jazz.ts";

const C = { tonic: "C", mode: "major" } as const;

describe("jazz chord symbols", () => {
  const same: [string, string][] = [
    ["C7b9", "C7(♭9)"],
    ["C7b9", "C7(b9)"],
    ["C7b9", "C7 ♭9"],
    ["Cmaj9", "C∆9"],
    ["Cmaj9", "CΔ9"],
    ["Cmaj9", "CM9"],
    ["Cm11", "C-11"],
    ["Cm11", "C–11"],
    ["Dm7", "D–7"],
    ["Dm7", "Dmin7"],
    ["Dm7", "D-7"],
    ["Bm7b5", "Bø"],
    ["Bm7b5", "Bø7"],
    ["G7alt", "G7 alt"],
    ["G7alt", "G7(alt)"],
    ["G7#9", "G7(♯9)"],
    ["C69", "C6/9"],
    ["C69", "C6add9"],
    ["CmMaj7", "C–∆7"],
    ["CmMaj7", "C-^7"],
    ["Cmaj7#11", "Cmaj7(#11)"],
    ["Cmaj7#11", "C∆7♯11"],
    ["C7", "Cdom7"],
    ["Cmaj7", "C∆"],
  ];
  for (const [a, b] of same)
    test(`${b} reads as ${a}`, () => {
      const ra = jazzReading(a);
      const rb = jazzReading(b);
      expect(ra.state).toBe("ok");
      expect(rb.state).toBe("ok");
      if (ra.state === "ok" && rb.state === "ok") expect(rb.code).toBe(ra.code);
    });

  test("shown back in lead-sheet form and in glyphs", () => {
    const r = jazzReading("C7(♭9)");
    expect(r).toMatchObject({ state: "ok", leadSheet: "C7♭9", code: "C7b9" });
    const m = jazzReading("C-11");
    expect(m).toMatchObject({ leadSheet: "Cm11", glyph: "C–11" });
    expect(jazzReading("Bø")).toMatchObject({
      leadSheet: "Bm7♭5",
      glyph: "Bø7",
      spoken: expect.stringContaining("half-diminished"),
    });
    expect(jazzReading("C∆9")).toMatchObject({ leadSheet: "Cmaj9", glyph: "C∆9" });
    expect(jazzReading("Ebmaj7")).toMatchObject({ leadSheet: "E♭maj7", spoken: "E flat major 7" });
  });

  test("the code Oak sends is the grader's own normal form", () => {
    for (const t of ["C7(♭9)", "C-11", "Dmin7", "Bø", "C∆9", "G7 alt", "C6/9", "C–∆7"]) {
      const r = jazzReading(t);
      expect(r.state).toBe("ok");
      if (r.state === "ok") expect(normalizeText("chord", r.code)).toBe(r.code);
    }
  });

  test("a slash bass is kept apart from 6/9", () => {
    expect(jazzTyped("Cm7/bb")).toBe("Cm7/Bb");
    expect(jazzTyped("C6/9")).toBe("C69");
    expect(jazzReading("Am7/G")).toMatchObject({ leadSheet: "Am7/G" });
  });

  test("not a chord: a calm hint, never a throw", () => {
    expect(jazzReading("")).toEqual({ state: "empty" });
    expect(jazzReading("H7").state).toBe("unknown");
    expect(jazzReading("C7b9#9").state).toBe("unknown");
  });

  test("the picker's rows are the chord table's own spellings, every one readable", () => {
    for (const row of JAZZ_PICKER_ROWS)
      for (const q of row.qualities) {
        const code = composeJazz("Eb", q);
        const r = jazzReading(code);
        expect(r.state).toBe("ok");
        if (r.state === "ok") expect(r.chord.quality).toBe(q);
        expect(pickerQuality(q).label.length).toBeGreaterThan(0);
      }
    expect(suffixOf("maj7", "jazz")).toBe("∆7");
    expect(suffixOf("m7b5", "jazz")).toBe("ø7");
    expect(suffixOf("m7b5")).toBe("m7♭5");
  });
});

describe("voicings", () => {
  test("theory's own builders read as the shapes they build", () => {
    for (const sym of ["Dm7", "G7", "Cmaj7", "Fmaj7", "Bbm7", "Eb7"]) {
      expect(voicingReadout(shellVoicing(sym, "1-3-7", 43), sym)?.shape).toBe("shell");
      expect(voicingReadout(shellVoicing(sym, "1-7-3", 43), sym)?.shape).toBe("shell");
      expect(voicingReadout(rootlessVoicing(sym, "A", 52), sym)?.shape).toBe("rootless-a");
      expect(voicingReadout(rootlessVoicing(sym, "B", 52), sym)?.shape).toBe("rootless-b");
    }
  });

  test("drop-2 is octave-aware: the same notes closed up are close, not drop-2", () => {
    const close = [60, 64, 67, 71];
    expect(voicingReadout(close, "Cmaj7")?.shape).toBe("close");
    const d2 = drop2(close);
    expect(d2).toEqual([55, 60, 64, 71]);
    expect(isDropTwo(d2)).toBe(true);
    expect(voicingReadout(d2, "Cmaj7")?.shape).toBe("drop-2");
    // The same pitch classes spread another way: neither.
    expect(voicingReadout([55, 64, 72, 83], "Cmaj7")?.shape).toBeNull();
  });

  test("the readout names every note's role and never prescribes", () => {
    const r = voicingReadout([50, 53, 60], "Dm7", "shell");
    expect(r?.text).toBe("D3 F3 C4: root, 3rd, 7th. A shell voicing of Dm7.");
    expect(r?.asked).toBe(true);
    const g7 = voicingReadout([59, 64, 65, 69], "G7", ["rootless-a", "rootless-b"]);
    expect(g7?.notes.map((n) => n.role)).toEqual(["3rd", "13th", "7th", "9th"]);
    expect(g7?.shape).toBe("rootless-a");
    const notYet = voicingReadout([50, 53], "Dm7", "shell");
    expect(notYet?.text).toBe("D3 F3: root, 3rd. Not one of the named voicings of Dm7 yet.");
    expect(notYet?.asked).toBe(false);
    expect(voicingReadout([53, 60], "Dm7")?.text).toContain("The guide tones of Dm7");
    expect(voicingType([53, 60], "Dm7").type).toBe("guide-tones");
  });

  test("sixth chords: the shell takes the 6th", () => {
    const c = voicedChordOf("C6");
    expect(c).toMatchObject({ root: 0, third: 4, fifth: 7, seventh: 9 });
    expect(voicingReadout([48, 64, 69], "C6")?.shape).toBe("shell");
  });
});

describe("tensions against a melody note", () => {
  test("every available tension and avoid note of the table, by name", () => {
    const names: Record<number, string> = { 1: "b9", 2: "9", 3: "#9", 5: "11", 6: "#11", 8: "b13", 9: "13" };
    for (const [q, t] of Object.entries(AVAILABLE_TENSIONS)) {
      const sym = composeJazz("C", q as never);
      for (const s of t?.tensions ?? []) expect(tensionOf(60 + s, sym)?.id).toBe((names[s] ?? null) as never);
      for (const s of t?.avoid ?? []) expect(tensionOf(60 + s, sym)?.id).toBe("avoid");
      for (const s of t?.chordTones ?? []) expect(tensionOf(60 + s, sym)?.id).toBe("chord-tone");
    }
  });

  test("the ids are content-kit's own options", () => {
    const ids = new Set(TENSION_OPTIONS.map((o) => o.id));
    for (const n of ["D5", "F5", "A5", "Db5", "E5"]) {
      const id = tensionOf(n, "C7")?.id;
      if (id) expect(ids.has(id)).toBe(true);
    }
  });

  test("the facts the J2 spec names", () => {
    // G over Fm7 is the 9th; A♭ over E♭maj7 a clash above G; C over B♭7 the 9th; G over B♭7 the 13th.
    expect(tensionOf("G4", "Fm7")?.id).toBe("9");
    expect(tensionOf("Ab4", "Ebmaj7")).toEqual({
      id: "avoid",
      fact: "A♭ over E♭maj7 sits a half step above the 3rd: held, it clashes. On a passing note it is fine.",
    });
    expect(tensionOf("C5", "Bb7")?.id).toBe("9");
    expect(tensionOf("G4", "Bb7")?.fact).toBe("G over B♭7 is the 13th: a common colour on this chord.");
    // Over Fm7 the 11th (B♭) is available.
    expect(tensionOf("Bb4", "Fm7")?.id).toBe("11");
    expect(tensionOf("E5", "Cmaj7")?.fact).toBe("E over Cmaj7 is a chord tone: the 3rd.");
  });

  test("note names", () => {
    expect(noteMidi("D5")).toBe(74);
    expect(noteMidi("eb4")).toBe(63);
    expect(noteMidi("F♯")).toBe(66);
    expect(noteMidi("X1")).toBeNull();
  });
});

describe("jazz numerals and ii–V brackets", () => {
  test("the jazz row is the theory's own numerals, each a dominant or a minor ii", () => {
    const want: Record<string, string> = {
      II7: "D7",
      VI7: "A7",
      III7: "E7",
      bII7: "D♭7",
      iv7: "Fm7",
      bVII7: "B♭7",
      iiø7: "Dm7♭5",
    };
    for (const b of jazzRnButtons("major")) expect(normalizeText("rn", b.rn)).not.toBeNull();
    expect(Object.keys(want)).toEqual(jazzRnButtons("major").map((b) => b.rn));
    expect(jazzRnButtons("minor").map((b) => b.rn)).toEqual(["bII7", "bVII7"]);
  });

  test("brackets: ii–V, ii–♭II, a lone sub, the backdoor", () => {
    expect(rnBrackets(["ii7", "V7", "Imaj7", ""], C)).toEqual([
      { from: 0, to: 1, kind: "ii–V", text: "Slots 1 and 2: a ii–V" },
    ]);
    expect(rnBrackets(["Imaj7", "VI7", "ii7", "V7"], C).map((b) => b.kind)).toEqual(["ii–V"]);
    // iii–VI–ii–V: iii7 VI7 is itself a ii–V into ii.
    expect(rnBrackets(["iii7", "VI7", "ii7", "V7"], C).map((b) => [b.from, b.kind])).toEqual([
      [0, "ii–V"],
      [2, "ii–V"],
    ]);
    expect(rnBrackets(["ii7", "bII7", "Imaj7"], C).map((b) => b.kind)).toEqual(["ii–♭II"]);
    expect(rnBrackets(["Imaj7", "bII7", "Imaj7"], C).map((b) => b.kind)).toEqual(["sub"]);
    expect(rnBrackets(["iv7", "bVII7", "Imaj7"], C).map((b) => [b.from, b.to, b.kind])).toEqual([
      [0, 2, "backdoor"],
    ]);
    expect(rnBrackets(["IVmaj7", "bVII7", "Imaj7"], C).map((b) => [b.from, b.to, b.kind])).toEqual([
      [1, 2, "backdoor"],
    ]);
    // Over C°7, B is a whole step above the 6th (A): available, no name of its own.
    expect(tensionOf("B4", "Co7")).toEqual({
      id: null,
      fact: "B over C°7 is a whole step above the 7th: a common colour on this chord.",
    });
    // Not a ii–V: the dominant is a whole step away, or the first chord is major.
    expect(rnBrackets(["ii7", "VI7"], C)).toEqual([]);
    expect(rnBrackets(["IVmaj7", "bVII7"], C).map((b) => b.kind)).toEqual([]);
    // Minor: iiø7 V7 i.
    expect(rnBrackets(["iiø7", "V7", "i7"], { tonic: "A", mode: "minor" }).map((b) => b.kind)).toEqual([
      "ii–V",
    ]);
  });
});

describe("voicings written on the staff", () => {
  test("chords are the notes that start together, low to high", async () => {
    const { staffChordMidis } = await import("./jazz.ts");
    expect(staffChordMidis("[D3,F3,C4]:2 [G3,B3,F4]:2")).toEqual([
      [50, 53, 60],
      [55, 59, 65],
    ]);
    expect(staffChordMidis("[F4,C4,A4,E5]:1")).toEqual([[60, 65, 69, 76]]);
    expect(staffChordMidis("not a staff")).toEqual([]);
    // Dm7 shell, G7 shell (root, 3rd, 7th).
    const [a, b] = staffChordMidis("[D3,F3,C4]:2 [G3,B3,F4]:2");
    expect(voicingReadout(a as number[], "Dm7")?.shape).toBe("shell");
    expect(voicingReadout(b as number[], "G7")?.shape).toBe("shell");
  });
});
