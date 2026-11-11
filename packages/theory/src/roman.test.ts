import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import {
  classifyCadence,
  diatonicChords,
  displayRN,
  formatRN,
  functionOf,
  parseChordSymbol,
  parseChordWithBass,
  parseRN,
  rnToChord,
  romanOf,
  toLeadSheet,
} from "./index.ts";

const K = (tonic: string, mode: KeySpec["mode"] = "major"): KeySpec => ({ tonic, mode });
const P = (s: string) => {
  const c = parseChordWithBass(s);
  if (!c) throw new Error(`no chord ${s}`);
  return c;
};
const rn = (sym: string, key: KeySpec, next?: string) =>
  formatRN(romanOf(P(sym), key, next ? P(next) : undefined));
const chordOfRN = (text: string, key: KeySpec) => {
  const r = parseRN(text, key);
  if (!r) throw new Error(`no RN ${text}`);
  return toLeadSheet(rnToChord(r, key));
};

describe("diatonic chords: the quality pattern in every key", () => {
  const MAJ = ["maj", "min", "min", "maj", "maj", "min", "dim"];
  const MAJ7 = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
  const MIN = ["min", "dim", "maj", "min", "min", "maj", "maj"];
  const MIN7 = ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"];
  for (const t of ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"]) {
    test(`${t} major and ${t} minor`, () => {
      expect(diatonicChords(K(t)).map((c): string => c.quality)).toEqual(MAJ);
      expect(diatonicChords(K(t), true).map((c): string => c.quality)).toEqual(MAJ7);
      expect(diatonicChords(K(t, "minor")).map((c): string => c.quality)).toEqual(MIN);
      expect(diatonicChords(K(t, "minor"), true).map((c): string => c.quality)).toEqual(MIN7);
      // and every diatonic chord reads back as its own numeral
      const want = ["I", "ii", "iii", "IV", "V", "vi", "viio"];
      expect(diatonicChords(K(t)).map((c) => formatRN(romanOf(c, K(t))))).toEqual(want);
      expect(diatonicChords(K(t), true).map((c) => formatRN(romanOf(c, K(t))))).toEqual([
        "Imaj7",
        "ii7",
        "iii7",
        "IVmaj7",
        "V7",
        "vi7",
        "viiø7",
      ]);
      expect(diatonicChords(K(t, "minor")).map((c) => formatRN(romanOf(c, K(t, "minor"))))).toEqual([
        "i",
        "iio",
        "III",
        "iv",
        "v",
        "VI",
        "VII",
      ]);
    });
  }
  test("spelled roots", () => {
    expect(diatonicChords(K("Eb")).map((c) => toLeadSheet(c))).toEqual([
      "E♭",
      "Fm",
      "Gm",
      "A♭",
      "B♭",
      "Cm",
      "D°",
    ]);
    expect(diatonicChords(K("F#", "minor")).map((c) => toLeadSheet(c))).toEqual([
      "F♯m",
      "G♯°",
      "A",
      "Bm",
      "C♯m",
      "D",
      "E",
    ]);
  });
});

describe("romanOf in several keys", () => {
  test("C major: diatonic, borrowed, applied", () => {
    const C = K("C");
    expect(rn("G7", C)).toBe("V7");
    expect(rn("Bb", C)).toBe("bVII");
    expect(rn("Ab", C)).toBe("bVI");
    expect(rn("Eb", C)).toBe("bIII");
    expect(rn("Fm", C)).toBe("iv");
    expect(rn("Gm", C)).toBe("v");
    expect(rn("Do", C)).toBe("iio");
    expect(rn("Db", C)).toBe("bII");
    expect(rn("D7", C)).toBe("V7/V");
    expect(rn("D", C)).toBe("V/V");
    expect(rn("E7", C)).toBe("V7/vi");
    expect(rn("A7", C)).toBe("V7/ii");
    expect(rn("B7", C)).toBe("V7/iii");
    expect(rn("C7", C)).toBe("V7/IV");
    expect(rn("F#o7", C)).toBe("viio7/V");
    expect(rn("C#o7", C)).toBe("viio7/ii");
    expect(rn("G#o7", C)).toBe("viio7/vi");
    expect(rn("Bo7", C)).toBe("viio7");
    expect(rn("F#m7b5", C)).toBe("viiø7/V");
    expect(rn("Abo7", C)).toBe("viio7/vi"); // enharmonic G#°7
    expect(rn("F#o", C)).toBe("viio/V");
  });
  test("inversions: figures from the bass", () => {
    const C = K("C");
    expect(rn("C/E", C)).toBe("I6");
    expect(rn("C/G", C)).toBe("I64");
    expect(rn("G7/B", C)).toBe("V65");
    expect(rn("G7/D", C)).toBe("V43");
    expect(rn("G7/F", C)).toBe("V42");
    expect(rn("Dm7/C", C)).toBe("ii42");
    expect(rn("Bm7b5/D", C)).toBe("viiø65");
    expect(rn("C^7/E", C)).toBe("Imaj65");
    expect(rn("D7/F#", C)).toBe("V65/V");
  });
  test("G, F, Eb, E major", () => {
    expect(rn("D7", K("G"))).toBe("V7");
    expect(rn("A7", K("G"))).toBe("V7/V");
    expect(rn("F", K("G"))).toBe("bVII");
    expect(rn("Bb", K("F"))).toBe("IV");
    expect(rn("Bbm", K("F"))).toBe("iv");
    expect(rn("G7", K("F"))).toBe("V7/V");
    expect(rn("Cb", K("Eb"))).toBe("bVI");
    expect(rn("Db", K("Eb"))).toBe("bVII");
    expect(rn("D#o7", K("E"))).toBe("viio7");
    expect(rn("C#7", K("E"))).toBe("V7/ii");
  });
  test("minor keys: harmonic-minor V and vii° are diatonic, VI and VII have no flats", () => {
    const Am = K("A", "minor");
    expect(rn("Am", Am)).toBe("i");
    expect(rn("E7", Am)).toBe("V7");
    expect(rn("E", Am)).toBe("V");
    expect(rn("Em", Am)).toBe("v");
    expect(rn("G#o7", Am)).toBe("viio7");
    expect(rn("G#o", Am)).toBe("viio");
    expect(rn("F", Am)).toBe("VI");
    expect(rn("G", Am)).toBe("VII");
    expect(rn("C", Am)).toBe("III");
    expect(rn("Bm7b5", Am)).toBe("iiø7");
    expect(rn("Dm", Am)).toBe("iv");
    expect(rn("D", Am)).toBe("IV");
    expect(rn("Bb", Am)).toBe("bII");
    expect(rn("B7", Am)).toBe("V7/V");
    expect(rn("A7", Am)).toBe("V7/iv");
    expect(rn("G7", Am, "C")).toBe("V7/III");
    expect(rn("G7", Am)).toBe("VII7");
    expect(rn("A", Am)).toBe("I"); // Picardy third
    const Cm = K("C", "minor");
    expect(rn("Ab", Cm)).toBe("VI");
    expect(rn("Bb", Cm)).toBe("VII");
    expect(rn("Eb", Cm)).toBe("III");
    expect(rn("G7", Cm)).toBe("V7");
    expect(rn("Bo7", Cm)).toBe("viio7");
    expect(rn("Db", Cm)).toBe("bII");
  });
  test("case is computed from the quality", () => {
    const C = K("C");
    expect(rn("Caug", C)).toBe("I+");
    expect(rn("Eaug", K("A", "minor"))).toBe("V+");
    expect(rn("Cm^7", K("C", "minor"))).toBe("imaj7");
    expect(rn("G9", C)).toBe("V9");
    expect(rn("Dm9", C)).toBe("ii9");
    expect(rn("C6", C)).toBe("Iadd6");
    expect(rn("Csus", C)).toBe("Isus4");
    expect(rn("G7sus", C)).toBe("V7sus4");
  });
});

describe("parseRN, formatRN, rnToChord", () => {
  test("round trip of the dialect", () => {
    const texts = [
      "I",
      "ii",
      "iii",
      "IV",
      "V",
      "vi",
      "viio",
      "I6",
      "I64",
      "V7",
      "V65",
      "V43",
      "V42",
      "ii7",
      "Imaj7",
      "IVmaj7",
      "imaj7",
      "viiø7",
      "viiø65",
      "viio7",
      "viio42",
      "III+",
      "bVII",
      "bVI",
      "bIII",
      "bII",
      "#ivo7",
      "V/V",
      "V7/vi",
      "viio7/V",
      "V65/ii",
      "Iadd6",
      "V9",
      "ii11",
      "V13",
      "V7b9",
      "V7alt",
      "Isus4",
    ];
    for (const t of texts) expect(formatRN(parseRN(t, K("C")) as never)).toBe(t);
  });
  test("aliases normalise", () => {
    const C = K("C");
    const f = (t: string) => {
      const r = parseRN(t, C);
      return r ? formatRN(r) : null;
    };
    expect(f("vii°")).toBe("viio");
    expect(f("vii°7")).toBe("viio7");
    expect(f("viidim7")).toBe("viio7");
    expect(f("viih7")).toBe("viiø7");
    expect(f("viiø")).toBe("viiø7");
    expect(f("♭VII")).toBe("bVII");
    expect(f("IM7")).toBe("Imaj7");
    expect(f("IΔ7")).toBe("Imaj7");
    expect(f("V2")).toBe("V42");
    expect(f("IIIaug")).toBe("III+");
    expect(f("Vsus")).toBe("Vsus4");
    for (const bad of ["", "VIII", "Io", "i+", "V8", "x", "V/"]) expect(f(bad)).toBeNull();
  });
  test("minor keys accept bIII bVI bVII as III VI VII", () => {
    const Am = K("A", "minor");
    expect(formatRN(parseRN("bVI", Am) as never)).toBe("VI");
    expect(formatRN(parseRN("bVII", Am) as never)).toBe("VII");
    expect(chordOfRN("bVI", Am)).toBe("F");
    expect(chordOfRN("VI", Am)).toBe("F");
    expect(chordOfRN("#viio7", Am)).toBe("G♯°7");
  });
  test("rnToChord in several keys", () => {
    expect(chordOfRN("V7", K("C"))).toBe("G7");
    expect(chordOfRN("V7/V", K("C"))).toBe("D7");
    expect(chordOfRN("V65/V", K("C"))).toBe("D7/F♯");
    expect(chordOfRN("viio7/V", K("C"))).toBe("F♯°7");
    expect(chordOfRN("V7/vi", K("C"))).toBe("E7");
    expect(chordOfRN("bVII", K("C"))).toBe("B♭");
    expect(chordOfRN("iv", K("C"))).toBe("Fm");
    expect(chordOfRN("I6", K("C"))).toBe("C/E");
    expect(chordOfRN("V43", K("C"))).toBe("G7/D");
    expect(chordOfRN("ii7", K("Bb"))).toBe("Cm7");
    expect(chordOfRN("V7", K("Eb"))).toBe("B♭7");
    expect(chordOfRN("viio", K("Eb"))).toBe("D°");
    expect(chordOfRN("V7", K("F#"))).toBe("C♯7");
    expect(chordOfRN("viio7", K("F#"))).toBe("E♯°7");
    expect(chordOfRN("V7", K("A", "minor"))).toBe("E7");
    expect(chordOfRN("viio7", K("A", "minor"))).toBe("G♯°7");
    expect(chordOfRN("VII", K("A", "minor"))).toBe("G");
    expect(chordOfRN("III", K("C", "minor"))).toBe("E♭");
    expect(chordOfRN("iiø7", K("C", "minor"))).toBe("Dm7♭5");
    expect(chordOfRN("V7/iv", K("C", "minor"))).toBe("C7");
    expect(chordOfRN("bII", K("C", "minor"))).toBe("D♭");
    expect(chordOfRN("Imaj7", K("Db"))).toBe("D♭maj7");
  });
  test("romanOf ∘ rnToChord is the identity on numerals (C, Eb, F# major; A, C minor)", () => {
    const texts = ["I", "ii7", "V7", "V65", "vi", "viio7/V", "V7/ii", "bVII", "iv", "bVI", "I64", "IVmaj7"];
    const minorTexts = ["i", "iio", "III", "iv", "V7", "VI", "VII", "viio7", "V7/iv", "iiø7", "bII", "V/V"];
    for (const t of ["C", "Eb", "F#"]) {
      for (const x of texts) {
        const r = parseRN(x, K(t)) as NonNullable<ReturnType<typeof parseRN>>;
        expect(formatRN(romanOf(rnToChord(r, K(t)), K(t)))).toBe(x);
      }
    }
    for (const t of ["A", "C"]) {
      for (const x of minorTexts) {
        const r = parseRN(x, K(t, "minor")) as NonNullable<ReturnType<typeof parseRN>>;
        expect(formatRN(romanOf(rnToChord(r, K(t, "minor")), K(t, "minor")))).toBe(x);
      }
    }
  });
  test("display form", () => {
    expect(displayRN(parseRN("viio7/V", K("C")) as never)).toBe("vii°7/V");
    expect(displayRN(parseRN("bVII", K("C")) as never)).toBe("♭VII");
  });
});

describe("harmonic function", () => {
  const fn = (t: string, key: KeySpec = K("C")) => functionOf(parseRN(t, key) as never, key);
  test("major", () => {
    expect(["I", "vi", "iii"].map((t) => fn(t))).toEqual(["T", "T", "T"]);
    expect(["ii", "IV", "ii7", "iv", "bVI", "bII"].map((t) => fn(t))).toEqual([
      "PD",
      "PD",
      "PD",
      "PD",
      "PD",
      "PD",
    ]);
    expect(["V", "V7", "viio", "viio7"].map((t) => fn(t))).toEqual(["D", "D", "D", "D"]);
    expect(fn("V7/V")).toBe("chromatic");
    expect(fn("bVII")).toBe("chromatic");
  });
  test("minor", () => {
    const Am = K("A", "minor");
    expect(["i", "VI", "III"].map((t) => fn(t, Am))).toEqual(["T", "T", "T"]);
    expect(["iio", "iiø7", "iv"].map((t) => fn(t, Am))).toEqual(["PD", "PD", "PD"]);
    expect(["V", "V7", "viio7", "VII"].map((t) => fn(t, Am))).toEqual(["D", "D", "D", "D"]);
  });
});

describe("cadences", () => {
  const cad = (a: string, b: string, key: KeySpec = K("C"), opts?: { melodyOnTonic?: boolean }) =>
    classifyCadence(parseRN(a, key) as never, parseRN(b, key) as never, key, opts);
  test("major", () => {
    expect(cad("V7", "I")).toBe("PAC");
    expect(cad("V", "I")).toBe("PAC");
    expect(cad("V", "I", K("C"), { melodyOnTonic: false })).toBe("IAC");
    expect(cad("V65", "I")).toBe("IAC");
    expect(cad("V", "I6")).toBe("IAC");
    expect(cad("viio", "I")).toBe("IAC");
    expect(cad("IV", "I")).toBe("PC");
    expect(cad("iv", "I")).toBe("PC");
    expect(cad("V7", "vi")).toBe("DC");
    expect(cad("V7", "bVI")).toBe("DC");
    expect(cad("ii", "V")).toBe("HC");
    expect(cad("IV", "V")).toBe("HC");
    expect(cad("I", "V")).toBe("HC");
    expect(cad("bVII", "I")).toBe("bVII-I");
    expect(cad("ii", "I")).toBe("none");
  });
  test("minor", () => {
    const Am = K("A", "minor");
    expect(cad("V7", "i", Am)).toBe("PAC");
    expect(cad("iv", "i", Am)).toBe("PC");
    expect(cad("V", "VI", Am)).toBe("DC");
    expect(cad("iv", "V", Am)).toBe("HC");
    expect(cad("VII", "i", Am)).toBe("bVII-I");
    expect(cad("V", "I", Am)).toBe("PAC"); // Picardy third
  });
});

test("parseChordSymbol never returns slash chords (romanOf needs parseChordWithBass for those)", () => {
  expect(parseChordSymbol("C/E")).toBeNull();
});
