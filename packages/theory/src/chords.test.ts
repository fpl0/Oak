import { describe, expect, test } from "bun:test";
import { CHORD_QUALITIES, type ChordQuality } from "@oak/content-kit";
import { Chord } from "tonal";
import {
  CHORD_TABLE,
  chordFamilyOf,
  chordInDict,
  chordNotes,
  chordOf,
  chordPcs,
  identifyChord,
  isCanonicalCode,
  parseChordSymbol,
  parseChordWithBass,
  qualityOf,
  sameChord,
  toAbcChord,
  toCode,
  toJazzGlyph,
  toLeadSheet,
  triadCore,
} from "./index.ts";

const P = (s: string) => {
  const c = parseChordSymbol(s);
  if (!c) throw new Error(`no parse: ${s}`);
  return c;
};

describe("the chord table", () => {
  test("one row per quality, in CHORD_QUALITIES order, unique code spellings", () => {
    expect(CHORD_TABLE.map((r) => r.quality)).toEqual([...CHORD_QUALITIES]);
    expect(new Set(CHORD_TABLE.map((r) => r.code)).size).toBe(CHORD_TABLE.length);
  });
  test("STYLE §5.1 core nine: code, lead sheet, jazz glyph", () => {
    const rows: [string, string, string, string][] = [
      ["C", "C", "C", "C"],
      ["Cm", "Cm", "Cm", "C–"],
      ["Co", "Co", "C°", "C°"],
      ["Caug", "Caug", "C+", "C+"],
      ["C^7", "C^7", "Cmaj7", "C∆7"],
      ["C7", "C7", "C7", "C7"],
      ["Cm7", "Cm7", "Cm7", "C–7"],
      ["Cm7b5", "Cm7b5", "Cm7♭5", "Cø7"],
      ["Co7", "Co7", "C°7", "C°7"],
    ];
    for (const [sym, code, lead, jazz] of rows) {
      const c = P(sym);
      expect([toCode(c), toLeadSheet(c), toJazzGlyph(c)]).toEqual([code, lead, jazz]);
    }
  });
  test("STYLE §5.1 jazz vocabulary", () => {
    const rows: [string, string, string][] = [
      ["C6", "C6", "C6"],
      ["Cm6", "Cm6", "C–6"],
      ["C69", "C6/9", "C6/9"],
      ["Csus", "Csus4", "Csus"],
      ["C2", "Csus2", "Csus2"],
      ["Cadd9", "Cadd9", "Cadd9"],
      ["C7sus", "C7sus4", "C7sus"],
      ["C9", "C9", "C9"],
      ["C13", "C13", "C13"],
      ["C^9", "Cmaj9", "C∆9"],
      ["Cm9", "Cm9", "C–9"],
      ["Cm11", "Cm11", "C–11"],
      ["C7b9", "C7♭9", "C7♭9"],
      ["C7#9", "C7♯9", "C7♯9"],
      ["C7#11", "C7♯11", "C7♯11"],
      ["C7b13", "C7♭13", "C7♭13"],
      ["C7alt", "C7alt", "C7alt"],
      ["C^7#11", "Cmaj7♯11", "C∆♯11"],
      ["Cm^7", "Cm(maj7)", "C–∆"],
    ];
    for (const [code, lead, jazz] of rows) {
      const c = P(code);
      expect(toCode(c)).toBe(code);
      expect(toLeadSheet(c)).toBe(lead);
      expect(toJazzGlyph(c)).toBe(jazz);
      expect(isCanonicalCode(code)).toBe(true);
    }
  });
  test("every quality's intervals agree with tonal's chord dictionary", () => {
    const tonalName: Partial<Record<ChordQuality, string>> = {
      maj: "C",
      min: "Cm",
      dim: "Cdim",
      aug: "Caug",
      sus2: "Csus2",
      sus4: "Csus4",
      maj7: "Cmaj7",
      "7": "C7",
      m7: "Cm7",
      m7b5: "Cm7b5",
      dim7: "Cdim7",
      mMaj7: "CmMaj7",
      "6": "C6",
      m6: "Cm6",
      "69": "C69",
      add9: "Cadd9",
      "9": "C9",
      maj9: "Cmaj9",
      m9: "Cm9",
      m11: "Cm11",
      "7b9": "C7b9",
      "7#9": "C7#9",
      "7#11": "C7#11",
      "7b13": "C7b13",
      "13": "C13",
      "maj7#11": "Cmaj7#11",
      "7sus4": "C7sus4",
    };
    for (const row of CHORD_TABLE) {
      const name = tonalName[row.quality];
      if (!name) continue;
      const t = Chord.get(name);
      expect(t.empty).toBe(false);
      const tonalPcs = new Set(t.notes.map((n) => pc(n)));
      const ours = new Set(chordPcs(chordOf("C", row.quality)));
      // tonal's 9/13 voicings may omit or add the 5th and 9th; the defining tones must agree.
      for (const p of ours) if (!tonalPcs.has(p)) expect([row.quality, p]).toEqual([row.quality, 7]);
    }
  });
  test("spelled chord tones", () => {
    expect(chordNotes(P("Eb7"))).toEqual(["Eb", "G", "Bb", "Db"]);
    expect(chordNotes(P("F#m7b5"))).toEqual(["F#", "A", "C", "E"]);
    expect(chordNotes(P("Bo7"))).toEqual(["B", "D", "F", "Ab"]);
    expect(chordNotes(P("C#o7"))).toEqual(["C#", "E", "G", "Bb"]);
    expect(chordNotes(P("Abaug"))).toEqual(["Ab", "C", "E"]);
    expect(chordNotes(P("Db^7"))).toEqual(["Db", "F", "Ab", "C"]);
    expect(chordNotes(P("G13"))).toEqual(["G", "B", "D", "F", "A", "E"]);
  });
});

describe("parsing the three dialects", () => {
  const same: [string, string][] = [
    // forbidden Strudel spellings
    ["C-7", "Cm7"],
    ["Ch7", "Cm7b5"],
    ["Ch", "Cm7b5"],
    ["C-7b5", "Cm7b5"],
    ["CM7", "C^7"],
    ["CM", "C"],
    ["C^", "C"],
    ["C-", "Cm"],
    ["C-^7", "Cm^7"],
    ["CmM7", "Cm^7"],
    ["C+", "Caug"],
    // lead sheet
    ["Cmaj7", "C^7"],
    ["Cdim", "Co"],
    ["Cdim7", "Co7"],
    ["Csus4", "Csus"],
    ["Csus2", "C2"],
    ["Cmaj9", "C^9"],
    ["Cm(maj7)", "Cm^7"],
    ["C6/9", "C69"],
    ["Cm7♭5", "Cm7b5"],
    ["C7♯11", "C7#11"],
    ["Cmaj7♯11", "C^7#11"],
    // jazz glyphs and abcjs
    ["CΔ7", "C^7"],
    ["C∆7", "C^7"],
    ["Cø7", "Cm7b5"],
    ["C°7", "Co7"],
    ["C°", "Co"],
    ["C–7", "Cm7"],
    ["C−7", "Cm7"],
    ["C–∆", "Cm^7"],
    ["C∆♯11", "C^7#11"],
    ["C07", "Cm7b5"],
    // roots
    ["B♭7", "Bb7"],
    ["F♯m", "F#m"],
  ];
  for (const [input, code] of same) test(`${input} → ${code}`, () => expect(toCode(P(input))).toBe(code));

  test("roots are upper-case; unknown suffixes and slash chords are null", () => {
    for (const bad of ["cm7", "H7", "Cxyz", "C/E", "", "Cm7/", "C7b9b13"])
      expect(parseChordSymbol(bad)).toBeNull();
  });
  test("parseChordWithBass reads slash chords", () => {
    const ce = parseChordWithBass("C/E");
    expect(ce).toMatchObject({ rootPc: 0, quality: "maj", bassPc: 4, bass: "E" });
    expect(toLeadSheet(ce as NonNullable<typeof ce>)).toBe("C/E");
    expect(toCode(ce as NonNullable<typeof ce>)).toBe("C");
    expect(
      toLeadSheet(parseChordWithBass("Cm7/Bb") as NonNullable<ReturnType<typeof parseChordWithBass>>),
    ).toBe("Cm7/B♭");
    expect(parseChordWithBass("C6/9/E")).toMatchObject({ quality: "69", bassPc: 4 });
    expect(parseChordWithBass("C6/9")).toMatchObject({ quality: "69", bassPc: 0 });
    expect(parseChordWithBass("C/X")).toBeNull();
  });
  test("abcjs chord text never contains h7 and uses what abcjs re-glyphs", () => {
    expect(toAbcChord(P("Ch7"))).toBe("Cm7b5");
    expect(toAbcChord(P("Bbo7"))).toBe("Bbo7");
    expect(toAbcChord(P("Eb^7"))).toBe("Ebmaj7");
    expect(toAbcChord(P("F#m7"))).toBe("F#m7");
    expect(toAbcChord(P("Caug"))).toBe("C+");
    for (const r of CHORD_TABLE) expect(toAbcChord(chordOf("C", r.quality))).not.toContain("h");
  });
  test("lead sheet shows Unicode accidentals on roots", () => {
    expect(toLeadSheet(P("Eb7b9"))).toBe("E♭7♭9");
    expect(toLeadSheet(P("F#m7b5"))).toBe("F♯m7♭5");
  });
});

describe("canonical code, families and dictionaries (STYLE §5.2)", () => {
  test("isCanonicalCode", () => {
    for (const s of ["C", "Cm", "Co", "Caug", "C^7", "C7", "Cm7", "Cm7b5", "Co7", "Bb7", "F#m7", "CmM7"]) {
      expect(isCanonicalCode(s)).toBe(true);
    }
    for (const s of ["C-7", "Ch7", "Cmaj7", "Cdim", "C+", "CM7", "C∆7", "cm7", "C-"])
      expect(isCanonicalCode(s)).toBe(false);
  });
  test("chordFamilyOf (contracts §3.2 E)", () => {
    const fam: [string, string][] = [
      ["C", "chord.triad"],
      ["Cm", "chord.triad"],
      ["Co", "chord.triad"],
      ["Caug", "chord.triad"],
      ["C7", "chord.dom7"],
      ["C^7", "chord.seventh"],
      ["Cm7", "chord.seventh"],
      ["Cm7b5", "chord.seventh-dim"],
      ["Co7", "chord.seventh-dim"],
      ["C6", "chord.sixth-sus"],
      ["Cm6", "chord.sixth-sus"],
      ["C69", "chord.sixth-sus"],
      ["Csus", "chord.sixth-sus"],
      ["C7sus", "chord.sixth-sus"],
      ["C2", "chord.sixth-sus"],
      ["Cadd9", "chord.sixth-sus"],
      ["C7b9", "chord.alt"],
      ["C7#9", "chord.alt"],
      ["C7#11", "chord.alt"],
      ["C7b13", "chord.alt"],
      ["C7alt", "chord.alt"],
      ["Cm^7", "chord.alt"],
      ["C^9", "chord.ext"],
      ["Cm9", "chord.ext"],
      ["C9", "chord.ext"],
      ["C13", "chord.ext"],
      ["Cm11", "chord.ext"],
    ];
    for (const [s, f] of fam) expect(chordFamilyOf(s)).toBe(f as never);
    expect(chordFamilyOf("Cxyz")).toBeNull();
  });
  test("chordInDict follows the STYLE §5.2 table", () => {
    expect(chordInDict("C", "triads")).toBe("ok");
    expect(chordInDict("Caug", "triads")).toBe("wrong");
    expect(chordInDict("Caug", "ireal")).toBe("ok");
    expect(chordInDict("C69", "lefthand")).toBe("wrong");
    expect(chordInDict("C69", "guidetones")).toBe("ok");
    expect(chordInDict("G7", "triads")).toBe("missing");
    expect(chordInDict("Dm", "lefthand")).toBe("missing");
    expect(chordInDict("C6", "lefthand")).toBe("missing");
    expect(chordInDict("C^9", "guidetones")).toBe("ok");
    expect(chordInDict("C9", "guidetones")).toBe("missing");
    expect(chordInDict("Cm^7", "lefthand")).toBe("missing");
    expect(chordInDict("CmM7", "lefthand")).toBe("ok");
    expect(chordInDict("CmM7", "ireal")).toBe("missing");
    expect(chordInDict("Cmaj7", "ireal")).toBe("missing");
    expect(chordInDict("C-7", "ireal")).toBe("ok");
    expect(chordInDict("C-7", "lefthand")).toBe("missing");
    expect(chordInDict("CM", "triads")).toBe("ok");
    expect(chordInDict("C+", "ireal")).toBe("missing");
    expect(chordInDict("cm7", "ireal")).toBe("unknown-chord");
    expect(chordInDict("Cxyz", "ireal")).toBe("unknown-chord");
  });
});

describe("pitch classes, triad cores, sameness", () => {
  test("chordPcs root first", () => {
    expect(chordPcs(P("C"))).toEqual([0, 4, 7]);
    expect(chordPcs(P("A7"))).toEqual([9, 1, 4, 7]);
    expect(chordPcs(P("Bo7"))).toEqual([11, 2, 5, 8]);
    expect(chordPcs(P("C69"))).toEqual([0, 4, 7, 9, 2]);
  });
  test("triadCore", () => {
    expect(triadCore(P("G13"))).toEqual({ rootPc: 7, quality: "maj" });
    expect(triadCore(P("Dm11"))).toEqual({ rootPc: 2, quality: "min" });
    expect(triadCore(P("Bm7b5"))).toEqual({ rootPc: 11, quality: "dim" });
    expect(triadCore(P("C7sus"))).toEqual({ rootPc: 0, quality: "sus4" });
  });
  test("sameChord at each depth", () => {
    expect(sameChord(P("C^7"), P("Cmaj7"))).toBe(true);
    expect(sameChord(P("C7"), P("C13"))).toBe(true);
    expect(sameChord(P("C7"), P("C^7"))).toBe(false);
    expect(sameChord(P("C7"), P("C^7"), { depth: "triad" })).toBe(true);
    expect(sameChord(P("C7"), P("C13"), { depth: "extended" })).toBe(false);
    expect(sameChord(P("C"), parseChordWithBass("C/E") as never, { bass: true })).toBe(false);
    expect(sameChord(P("C#"), P("Db"))).toBe(true);
  });
});

describe("qualityOf and identifyChord", () => {
  test("qualityOf every table row from its own intervals, and with the 5th omitted", () => {
    for (const r of CHORD_TABLE) {
      // rows whose interval set collides with an earlier row are named by the earlier one
      const q = qualityOf(r.intervals);
      expect(q).not.toBeNull();
      expect(chordPcs(chordOf("C", q as ChordQuality)).sort()).toEqual(
        chordPcs(chordOf("C", r.quality)).sort(),
      );
    }
    expect(qualityOf([4, 7])).toBe("maj");
    expect(qualityOf([3, 6, 9])).toBe("dim7");
    expect(qualityOf([4, 10])).toBe("7");
    expect(qualityOf([4, 11])).toBe("maj7");
    expect(qualityOf([1, 2])).toBeNull();
  });
  const top = (midis: number[], opts?: Parameters<typeof identifyChord>[1]) => {
    const c = identifyChord(midis, opts)[0];
    return c ? toLeadSheet(c) : null;
  };
  test("textbook voicings", () => {
    expect(top([60, 64, 67])).toBe("C");
    expect(top([64, 67, 72])).toBe("C/E");
    expect(top([55, 60, 64])).toBe("C/G");
    expect(top([57, 60, 64])).toBe("Am");
    expect(top([55, 59, 62, 65])).toBe("G7");
    expect(top([59, 62, 65, 67])).toBe("G7/B");
    expect(top([62, 65, 69, 72])).toBe("Dm7");
    expect(top([59, 62, 65, 69])).toBe("Bm7♭5");
    expect(top([59, 62, 65, 68])).toBe("B°7");
    expect(top([60, 63, 67, 71])).toBe("Cm(maj7)");
    expect(top([60, 64, 68])).toBe("C+");
    expect(top([60, 65, 67])).toBe("Csus4");
    expect(top([60, 64, 70])).toBe("C7"); // no 5th
    expect(top([48, 64, 67, 70, 74])).toBe("C9");
  });
  test("C6 ≡ Am7 is resolved by the bass", () => {
    expect(top([60, 64, 67, 69])).toBe("C6");
    expect(top([57, 60, 64, 67])).toBe("Am7");
  });
  test("rootless with a bass from another track", () => {
    // lefthand C7: Bb D E A, bass C from the bass track
    const c = identifyChord([58, 62, 64, 69], { allowRootless: true, bassPc: 0 })[0];
    expect(c?.rootPc).toBe(0);
    expect(c?.bassPc).toBe(0);
  });
  test("empty input", () => expect(identifyChord([])).toEqual([]));
});

const pc = (n: string) => {
  const L: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let v = L[n[0] as string] as number;
  for (const ch of n.slice(1)) v += ch === "#" ? 1 : ch === "b" ? -1 : 0;
  return ((v % 12) + 12) % 12;
};
