import { describe, expect, test } from "bun:test";
import { isId, type KeySpec } from "@oak/content-kit";
import {
  formatRN,
  parseChordSymbol,
  parseRN,
  rnToChord,
  romanOf,
  SCHEMAS,
  schemaKey,
  schemaMatch,
  schemaSignature,
  toLeadSheet,
} from "./index.ts";

const K = (tonic: string, mode: KeySpec["mode"] = "major"): KeySpec => ({ tonic, mode });
const rnsOf = (chords: string[], key: KeySpec) =>
  chords.map((c, i) => {
    const ch = parseChordSymbol(c);
    const next = chords[i + 1] ? parseChordSymbol(chords[i + 1] as string) : null;
    if (!ch) throw new Error(c);
    return romanOf(ch, key, next ?? undefined);
  });
const match = (chords: string[], key: KeySpec) => {
  const m = schemaMatch(rnsOf(chords, key), SCHEMAS, key);
  return m ? `${m.schema.id}@${m.rotation}` : null;
};

describe("the schema library", () => {
  test("every schema has a valid ID and parses in its own key", () => {
    for (const s of SCHEMAS) {
      expect(isId("schema", s.id)).toBe(true);
      expect(schemaSignature(s).length).toBe(s.rn.length);
      if (s.slotBars) expect(s.slotBars.length).toBe(s.rn.length);
    }
    expect(new Set(SCHEMAS.map((s) => s.id)).size).toBe(SCHEMAS.length);
  });
  test("the 12-bar blues forms span 12 bars", () => {
    for (const id of ["schema.blues12", "schema.blues12-qc"]) {
      const s = SCHEMAS.find((x) => x.id === id);
      expect(s?.slotBars?.reduce((a, b) => a + b, 0)).toBe(12);
    }
  });
  test("schemas spelled in a real key (textbook chords)", () => {
    const spell = (id: string, key: KeySpec) => {
      const s = SCHEMAS.find((x) => x.id === id);
      if (!s) throw new Error(id);
      return s.rn.map((t) => toLeadSheet(rnToChord(parseRN(t, key) as never, key))).join(" ");
    };
    expect(spell("schema.axis", K("C"))).toBe("C G Am F");
    expect(spell("schema.axis", K("G"))).toBe("G D Em C");
    expect(spell("schema.doo-wop", K("C"))).toBe("C Am F G");
    expect(spell("schema.aeolian", K("A", "minor"))).toBe("Am F C G");
    expect(spell("schema.andalusian", K("A", "minor"))).toBe("Am G F E");
    expect(spell("schema.mixolydian", K("D", "mixolydian"))).toBe("D C G D");
    expect(spell("schema.dorian-vamp", K("D", "dorian"))).toBe("Dm7 G7");
    expect(spell("schema.blues12", K("A", "blues"))).toBe("A7 D7 A7 E7 D7 A7 E7");
    expect(spell("schema.ii-v-i", K("Bb"))).toBe("Cm7 F7 B♭maj7");
    expect(spell("schema.minor-ii-v-i", K("C", "minor"))).toBe("Dm7♭5 G7 Cm");
    expect(spell("schema.iii-vi-ii-v", K("C"))).toBe("Em7 A7 Dm7 G7");
    expect(spell("schema.backdoor", K("C"))).toBe("Fm7 B♭7 Cmaj7");
    expect(spell("schema.rhythm-a", K("Bb"))).toBe("B♭ Gm Cm F B♭ Gm Cm F B♭ B♭7 E♭ E♭m B♭ F B♭");
    expect(schemaKey(SCHEMAS.find((s) => s.id === "schema.blues12") as never)).toEqual(K("C"));
  });
});

describe("schemaMatch", () => {
  test("four-chord loops and their rotations", () => {
    expect(match(["C", "G", "Am", "F"], K("C"))).toBe("schema.axis@0");
    expect(match(["Am", "F", "C", "G"], K("C"))).toBe("schema.axis-vi@0");
    expect(match(["F", "C", "G", "Am"], K("C"))).toBe("schema.axis@3");
    expect(match(["G", "Am", "F", "C"], K("C"))).toBe("schema.axis@1");
    expect(match(["C", "Am", "F", "G"], K("C"))).toBe("schema.doo-wop@0");
    expect(match(["C", "Am", "Dm", "G"], K("C"))).toBe("schema.turnaround@0");
  });
  test("sevenths and extensions pass (triad core)", () => {
    expect(match(["C^7", "G7", "Am7", "F^7"], K("C"))).toBe("schema.axis@0");
    expect(match(["Dm7", "G7", "C^7"], K("C"))).toBe("schema.ii-v-i@0");
    expect(match(["Dm9", "G13", "C^9"], K("C"))).toBe("schema.ii-v-i@0");
  });
  test("minor and modal loops", () => {
    expect(match(["Am", "F", "C", "G"], K("A", "minor"))).toBe("schema.aeolian@0");
    expect(match(["Am", "G", "F", "E"], K("A", "minor"))).toBe("schema.andalusian@0");
    expect(match(["Am", "G", "F", "E7"], K("A", "minor"))).toBe("schema.andalusian@0");
    expect(match(["Dm7", "G7"], K("D", "dorian"))).toBe("schema.dorian-vamp@0");
    expect(match(["D", "C", "G", "D"], K("D", "mixolydian"))).toBe("schema.mixolydian@0");
    expect(match(["Bm7b5", "E7", "Am"], K("A", "minor"))).toBe("schema.minor-ii-v-i@0");
  });
  test("borrowed spellings: the Aeolian loop read in the parallel major", () => {
    // Cm Ab Eb Bb in C major reads i bVI bIII bVII; it is still the Aeolian loop.
    expect(match(["Cm", "Ab", "Eb", "Bb"], K("C"))).toBe("schema.aeolian@0");
  });
  test("a repeated loop counts once; without a key both readings are tried", () => {
    expect(match(["C", "G", "Am", "F", "C", "G", "Am", "F"], K("C"))).toBe("schema.axis@0");
    const minorRns = rnsOf(["Am", "F", "C", "G"], K("A", "minor"));
    expect(schemaMatch(minorRns)?.schema.id).toBe("schema.aeolian");
  });
  test("12-bar blues by bar and by change, and the quick change", () => {
    const bars = ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"];
    expect(match(bars, K("C", "blues"))).toBe("schema.blues12@0");
    expect(match(["C7", "F7", "C7", "G7", "F7", "C7", "G7"], K("C", "blues"))).toBe("schema.blues12@0");
    const qc = ["C7", "F7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"];
    expect(match(qc, K("C", "blues"))).toBe("schema.blues12-qc@0");
    expect(rnsOf(["C7", "F7", "G7"], K("C", "blues")).map((r) => formatRN(r))).toEqual(["I7", "IV7", "V7"]);
  });
  test("no match", () => {
    expect(match(["C", "Dm", "Em", "F", "G"], K("C"))).toBeNull();
    expect(schemaMatch([])).toBeNull();
  });
});
