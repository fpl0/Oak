// The schema library (exercises §3.5) and matching on root-semitones + triad quality over rotations.
import type { KeySpec } from "@oak/content-kit";
import { triadQuality } from "./chords.ts";
import { mod, pcOfSpelled } from "./pitch.ts";
import { parseRN, rnToChord } from "./roman.ts";
import { tonicOf } from "./scales.ts";
import type { RomanNumeral, SchemaDef } from "./types.ts";

/**
 * The schema library: four-chord loops and their rotations, three-chord, doo-wop, Aeolian, Andalusian,
 * Mixolydian and Dorian vamps, 12-bar blues (and the quick change), major and minor ii–V–I, turnarounds,
 * the backdoor and the Rhythm-changes A section. IDs follow `schema\.[a-z0-9-]+` (contracts §1).
 */
export const SCHEMAS: readonly SchemaDef[] = [
  {
    id: "schema.axis",
    title: "Four-chord (I–V–vi–IV)",
    mode: "major",
    rn: ["I", "V", "vi", "IV"],
    rotations: true,
  },
  {
    id: "schema.axis-vi",
    title: "Four-chord from vi (vi–IV–I–V)",
    mode: "major",
    rn: ["vi", "IV", "I", "V"],
    rotations: true,
  },
  {
    id: "schema.doo-wop",
    title: "Doo-wop (I–vi–IV–V)",
    mode: "major",
    rn: ["I", "vi", "IV", "V"],
    rotations: true,
  },
  {
    id: "schema.three-chord",
    title: "Three-chord (I–IV–V–I)",
    mode: "major",
    rn: ["I", "IV", "V", "I"],
    rotations: true,
  },
  { id: "schema.puff", title: "I–iii–IV", mode: "major", rn: ["I", "iii", "IV"], rotations: true },
  {
    id: "schema.aeolian",
    title: "Aeolian loop (i–VI–III–VII)",
    mode: "minor",
    rn: ["i", "VI", "III", "VII"],
    rotations: true,
  },
  {
    id: "schema.aeolian-climb",
    title: "Aeolian climb (i–VI–VII–i)",
    mode: "minor",
    rn: ["i", "VI", "VII", "i"],
    rotations: true,
  },
  {
    id: "schema.andalusian",
    title: "Andalusian cadence (i–VII–VI–V)",
    mode: "minor",
    rn: ["i", "VII", "VI", "V"],
    rotations: true,
  },
  {
    id: "schema.mixolydian",
    title: "Mixolydian vamp (I–bVII–IV–I)",
    mode: "mixolydian",
    rn: ["I", "bVII", "IV", "I"],
    rotations: true,
  },
  {
    id: "schema.dorian-vamp",
    title: "Dorian vamp (i7–IV7)",
    mode: "dorian",
    rn: ["i7", "IV7"],
    rotations: true,
  },
  {
    id: "schema.blues12",
    title: "12-bar blues",
    mode: "blues",
    rn: ["I7", "IV7", "I7", "V7", "IV7", "I7", "V7"],
    slotBars: [4, 2, 2, 1, 1, 1, 1],
    rotations: false,
  },
  {
    id: "schema.blues12-qc",
    title: "12-bar blues, quick change",
    mode: "blues",
    rn: ["I7", "IV7", "I7", "IV7", "I7", "V7", "IV7", "I7", "V7"],
    slotBars: [1, 1, 2, 2, 2, 1, 1, 1, 1],
    rotations: false,
  },
  { id: "schema.ii-v-i", title: "ii–V–I", mode: "major", rn: ["ii7", "V7", "Imaj7"], rotations: false },
  {
    id: "schema.minor-ii-v-i",
    title: "Minor ii–V–i",
    mode: "minor",
    rn: ["iiø7", "V7", "i"],
    rotations: false,
  },
  {
    id: "schema.turnaround",
    title: "Turnaround (I–vi–ii–V)",
    mode: "major",
    rn: ["I", "vi", "ii", "V"],
    rotations: true,
  },
  {
    id: "schema.iii-vi-ii-v",
    title: "iii–VI–ii–V",
    mode: "major",
    rn: ["iii7", "V7/ii", "ii7", "V7"],
    rotations: true,
  },
  {
    id: "schema.backdoor",
    title: "Backdoor (iv7–bVII7–I)",
    mode: "major",
    rn: ["iv7", "bVII7", "Imaj7"],
    rotations: false,
  },
  {
    id: "schema.rhythm-a",
    title: "Rhythm changes, A section",
    mode: "major",
    rn: ["I", "vi", "ii", "V", "I", "vi", "ii", "V", "I", "I7", "IV", "iv", "I", "V", "I"],
    rotations: false,
  },
];

/** The key a schema's numerals are read in (tonic C). */
export function schemaKey(schema: SchemaDef): KeySpec {
  const mode = schema.mode === "blues" ? "major" : schema.mode;
  return { tonic: "C", mode };
}

type Sig = string;
function sigOf(rn: RomanNumeral, key: KeySpec): Sig {
  const c = rnToChord(rn, key);
  return `${mod(c.rootPc - pcOfSpelled(tonicOf(key)), 12)}${triadQuality(c.quality)}`;
}
/** A schema's numerals as root-semitone + triad-quality signatures. */
export function schemaSignature(schema: SchemaDef): Sig[] {
  const key = schemaKey(schema);
  return schema.rn.map((t) => {
    const rn = parseRN(t, key);
    if (!rn) throw new Error(`schema ${schema.id}: bad numeral ${t}`);
    return sigOf(rn, key);
  });
}
/** Per bar when the schema has `slotBars` (whole bars only), else one per chord. */
export function schemaSignaturePerBar(schema: SchemaDef): Sig[] {
  const sig = schemaSignature(schema);
  if (!schema.slotBars) return sig;
  return sig.flatMap((s, i) => Array.from({ length: schema.slotBars?.[i] ?? 1 }, () => s));
}

function minimalPeriod<T>(xs: T[]): T[] {
  for (let p = 1; p < xs.length; p++) {
    if (xs.length % p !== 0) continue;
    if (xs.every((x, i) => x === xs[i % p])) return xs.slice(0, p);
  }
  return xs;
}
const eq = (a: Sig[], b: Sig[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Which schema a chord sequence is, comparing root (semitones above the tonic) and triad quality, so
 * sevenths and extensions pass and borrowed spellings (♭VI in major ≡ VI in minor) agree. The numerals
 * must come from one key. Pass that key when it is known: numerals of a minor key are read against natural
 * minor (VI = ♭6). Without it both readings are tried, major first. Exact matches beat rotations; a sequence
 * that repeats its loop counts once.
 */
export function schemaMatch(
  rns: RomanNumeral[],
  lib: readonly SchemaDef[] = SCHEMAS,
  key?: KeySpec,
): { schema: SchemaDef; rotation: number } | null {
  if (rns.length === 0) return null;
  const readings: KeySpec[] = key
    ? [{ tonic: "C", mode: key.mode }]
    : [
        { tonic: "C", mode: "major" },
        { tonic: "C", mode: "minor" },
      ];
  const inputs: Sig[][] = [];
  for (const k of readings) {
    const raw = rns.map((r) => sigOf(r, k));
    inputs.push(raw, minimalPeriod(raw));
  }
  const targets = lib.map((schema) => ({
    schema,
    seqs: [schemaSignature(schema), schemaSignaturePerBar(schema)],
  }));
  for (const input of inputs) {
    for (const { schema, seqs } of targets)
      for (const s of seqs) if (eq(input, s)) return { schema, rotation: 0 };
  }
  for (const input of inputs) {
    for (const { schema, seqs } of targets) {
      if (!schema.rotations) continue;
      for (const s of seqs) {
        if (s.length !== input.length) continue;
        for (let r = 1; r < s.length; r++) {
          if (eq(input, [...s.slice(r), ...s.slice(0, r)])) return { schema, rotation: r };
        }
      }
    }
  }
  return null;
}
