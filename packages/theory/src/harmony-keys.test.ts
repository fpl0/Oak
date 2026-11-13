// Exhaustive table tests of the Wave 4 harmony seams (docs/design/wave4.md §3.1) over EVERY major key of the
// circle (seven sharps to seven flats), with tonal 6.5.1 as the oracle for the chord tones and the pattern
// I ii iii IV V vi vii° worked by hand: in each key, every diatonic triad and seventh, every inversion read
// back from its notes, the numerals both ways (as parts, never as strings), function, the cadences, the
// schemas in every rotation, symbol normalisation between the dialects, and chord tones.
import { describe, expect, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { Chord, Note } from "tonal";
import {
  cadenceOf,
  chordNotes,
  chordOfRoman,
  chordPcs,
  chordSymbol,
  diatonicChordOn,
  harmonicFunction,
  inversionOf,
  readChord,
  romanParts,
  romanText,
  SCHEMAS,
  schemaOf,
  toCode,
  toLeadSheet,
  toneRole,
} from "./index.ts";
import type { ChordId } from "./types.ts";

const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
const keys: KeySpec[] = MAJOR_KEYS.map((tonic) => ({ tonic, mode: "major" }));
const TRIAD_RN = ["I", "ii", "iii", "IV", "V", "vi", "viio"];
const TRIAD_Q = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const SEVENTH_RN = ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"];
const SEVENTH_Q = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
const FUNCTION = ["T", "PD", "T", "PD", "D", "T", "D"];
const chroma = (n: string): number => Note.chroma(n) as number;
const sorted = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);
const withBass = (c: ChordId, bassPc: number): ChordId => ({ ...c, bassPc: bassPc as ChordId["bassPc"] });

describe.each(keys)("$tonic major", (key) => {
  const triads = [1, 2, 3, 4, 5, 6, 7].map((d) => diatonicChordOn(key, d));
  const sevenths = [1, 2, 3, 4, 5, 6, 7].map((d) => diatonicChordOn(key, d, { seventh: true }));

  test("diatonic triads: I ii iii IV V vi vii°, roots on the scale, tones agree with tonal", () => {
    expect(triads.map((c) => c.quality as string)).toEqual(TRIAD_Q);
    expect(triads.map((c) => romanText(c, key))).toEqual(TRIAD_RN);
    for (const c of triads) {
      const tonalName = `${c.root}${c.quality === "maj" ? "" : c.quality === "min" ? "m" : "dim"}`;
      expect(sorted(chordPcs(c))).toEqual(sorted(Chord.get(tonalName).notes.map(chroma)));
    }
    // The letters climb the scale: one chord root per letter.
    expect(new Set(triads.map((c) => c.root[0])).size).toBe(7);
  });

  test("diatonic sevenths: Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7", () => {
    expect(sevenths.map((c) => c.quality as string)).toEqual(SEVENTH_Q);
    expect(sevenths.map((c) => romanText(c, key))).toEqual(SEVENTH_RN);
    for (const c of sevenths) {
      const t = { maj7: "maj7", m7: "m7", "7": "7", m7b5: "m7b5" }[c.quality as "maj7"] as string;
      expect(sorted(chordPcs(c))).toEqual(sorted(Chord.get(`${c.root}${t}`).notes.map(chroma)));
    }
  });

  test("numerals both ways: the chord of each numeral is the diatonic chord; parts, never strings", () => {
    TRIAD_RN.forEach((rn, i) => {
      const c = chordOfRoman(rn, key) as ChordId;
      const d = triads[i] as ChordId;
      expect(c.rootPc).toBe(d.rootPc);
      expect(c.quality).toBe(d.quality);
      expect(romanParts(rn, key) as unknown).toEqual({
        degree: i + 1,
        alt: 0,
        quality: d.quality,
        inversion: 0,
      });
    });
    // vii°, viio and the ASCII spelling are one numeral.
    expect(romanParts("vii°", key)).toEqual(romanParts("viio", key));
    SEVENTH_RN.forEach((rn, i) => {
      const c = chordOfRoman(rn, key) as ChordId;
      const d = sevenths[i] as ChordId;
      expect(c.quality).toBe(d.quality);
      expect(c.rootPc).toBe(d.rootPc);
    });
  });

  test("every triad in root position, first and second inversion is read back from its notes", () => {
    for (const [i, c] of triads.entries()) {
      const pcs = chordPcs(c);
      const [root, third, fifth] = pcs as [number, number, number];
      const figures = ["", "6", "64"];
      [root, third, fifth].forEach((bass, inv) => {
        const r = readChord([...pcs].reverse(), bass);
        expect(r).not.toBeNull();
        expect(r?.chord.rootPc).toBe(c.rootPc);
        expect(r?.quality).toBe(c.quality);
        expect(r?.inversion as number).toBe(inv);
        expect(r?.slash).toBe(inv > 0);
        // The numeral carries the figure; the lead sheet the slash bass.
        expect(romanText(withBass(c, bass), key)).toBe(`${TRIAD_RN[i]}${figures[inv]}`);
        expect(inversionOf(withBass(c, bass)) as number).toBe(inv);
        if (inv > 0) expect(r?.leadSheet).toContain("/");
      });
    }
  });

  test("every seventh chord with its 7th in the bass is a third inversion (V42)", () => {
    for (const c of sevenths) {
      const pcs = chordPcs(c);
      const r = readChord(pcs, pcs[3] as number);
      expect(r?.quality).toBe(c.quality);
      expect(r?.inversion).toBe(3);
    }
    const v = sevenths[4] as ChordId;
    expect(romanText(withBass(v, chordPcs(v)[1] as number), key)).toBe("V65");
    expect(romanText(withBass(v, chordPcs(v)[2] as number), key)).toBe("V43");
    expect(romanText(withBass(v, chordPcs(v)[3] as number), key)).toBe("V42");
  });

  test("a cluster is not a chord: degrees 1 2 3 together, or a non-chord pitch class", () => {
    const [d1, d2, d3] = [triads[0], triads[1], triads[2]].map((c) => (c as ChordId).rootPc);
    expect(readChord([d1, d2, d3] as number[], d1 as number)).toBeNull();
    expect(readChord(chordPcs(triads[0] as ChordId), triads[1]?.rootPc as number)).toBeNull();
  });

  test("function: T PD T PD D T D", () => {
    expect(triads.map((c) => harmonicFunction(c, key) as string)).toEqual(FUNCTION);
    expect(sevenths.map((c) => harmonicFunction(c, key) as string)).toEqual(FUNCTION);
  });

  test("cadences: PAC needs the melody on 1 and root position; IAC, HC, PC, DC", () => {
    const [I, , , IV, V, vi] = triads as [ChordId, ChordId, ChordId, ChordId, ChordId, ChordId];
    const tonicMidi = 60 + I.rootPc;
    const thirdMidi = 60 + (chordPcs(I)[1] as number);
    expect(cadenceOf(V, I, key, { melodyMidi: tonicMidi })).toBe("PAC");
    expect(cadenceOf(V, I, key, { melodyMidi: thirdMidi })).toBe("IAC");
    expect(cadenceOf(withBass(V, chordPcs(V)[1] as number), I, key, { melodyMidi: tonicMidi })).toBe("IAC");
    expect(cadenceOf(sevenths[4] as ChordId, I, key, { melodyMidi: tonicMidi })).toBe("PAC");
    expect(cadenceOf(IV, I, key)).toBe("PC");
    expect(cadenceOf(I, V, key)).toBe("HC");
    expect(cadenceOf(V, vi, key)).toBe("DC");
  });

  test("schemas in every rotation: axis, axis-vi (rotation), doo-wop, three-chord rock", () => {
    const at = (rns: string[]) => rns.map((rn) => chordOfRoman(rn, key) as ChordId);
    const axis = ["I", "V", "vi", "IV"];
    for (let r = 0; r < 4; r++) {
      const rot = [...axis.slice(r), ...axis.slice(0, r)];
      const m = schemaOf(at(rot), key);
      expect(m?.schema.id).toMatch(/^schema\.axis/);
    }
    expect(schemaOf(at(["I", "vi", "IV", "V"]), key)?.schema.id).toBeDefined();
    // Sevenths pass on the triad core.
    expect(schemaOf(at(["Imaj7", "V7", "vi7", "IVmaj7"]), key)?.schema.id).toMatch(/^schema\.axis/);
    expect(schemaOf(at(["I", "ii", "iii", "IV"]), key)).toBeNull();
  });

  test("symbols: lead sheet ↔ Oak code ↔ jazz, round trip for every diatonic chord and inversion", () => {
    for (const c of [...triads, ...sevenths]) {
      const ls = toLeadSheet(c);
      const code = toCode(c);
      expect(chordSymbol(code, "lead-sheet")).toBe(ls);
      expect(chordSymbol(ls, "code")).toBe(code);
      const jazz = chordSymbol(ls, "jazz") as string;
      expect(chordSymbol(jazz, "code")).toBe(code);
      // A slash chord keeps its bass on the lead sheet; code drops it (code puts it on the bass track).
      const first = withBass(c, chordPcs(c)[1] as number);
      expect(chordSymbol(toLeadSheet(first), "code")).toBe(code);
      expect(chordSymbol(toLeadSheet(first), "lead-sheet")).toBe(toLeadSheet(first));
    }
  });

  test("chord tones vs non-chord tones: every tone of every triad is a chord tone; the 2nd above the root passes", () => {
    for (const c of triads) {
      for (const pc of chordPcs(c)) expect(toneRole(60 + pc, c, { strong: true })).toBe("chord-tone");
      const notes = chordNotes(c);
      expect(notes).toHaveLength(3);
      const root = 60 + c.rootPc;
      const third = 60 + (chordPcs(c)[1] as number) + ((chordPcs(c)[1] as number) < c.rootPc ? 12 : 0);
      const step = (
        triads.find((t) => t.rootPc !== c.rootPc && (t.rootPc - c.rootPc + 12) % 12 === 2) as
          | ChordId
          | undefined
      )?.rootPc;
      if (step === undefined) continue;
      const between = root + ((step - c.rootPc + 12) % 12);
      expect(toneRole(between, c, { prev: root, next: third, strong: false })).toBe("passing");
      expect(toneRole(between, c, { prev: root, next: root, strong: false })).toBe("neighbour");
    }
  });
});

test("the schema library parses in every major key (no numeral is outside the dialect)", () => {
  for (const key of keys)
    for (const s of SCHEMAS.filter((x) => x.mode === "major"))
      for (const rn of s.rn) expect(chordOfRoman(rn, key)).not.toBeNull();
});
