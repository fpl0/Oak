// Roman numerals in Oak's dialect, harmonic function and cadences (exercises §3.5). Case is computed from
// the chord quality, never taken from tonal: upper = major, augmented and dominant; lower = minor and diminished.
import type { CadenceType, ChordQuality, KeySpec } from "@oak/content-kit";
import { chordPcs, defaultPcName, qualityOf, rowOf, SEVENTH_CORE, triadQuality } from "./chords.ts";
import {
  addFifths,
  DEGREE_SEMIS,
  degreeFifths,
  letterIndex,
  mod,
  nameOf,
  parsePcName,
  pcOfSpelled,
} from "./pitch.ts";
import { diatonicChordTones, scalePcs, tonicOf } from "./scales.ts";
import type { ChordId, HarmonicFunction, Pc, RomanNumeral } from "./types.ts";

const MINOR_REF = new Set<KeySpec["mode"]>([
  "minor",
  "harmonic minor",
  "melodic minor",
  "dorian",
  "phrygian",
  "locrian",
  "minor pentatonic",
]);
/** Whether Roman numerals in this key are read against natural minor (blues reads as major: I7 IV7 V7). */
export const isMinorRef = (key: KeySpec): boolean => MINOR_REF.has(key.mode);

const MINOR_SEMIS = [0, 2, 3, 5, 7, 8, 10] as const;
const refSemis = (minor: boolean, num: number): number =>
  (minor ? MINOR_SEMIS[num - 1] : DEGREE_SEMIS[num - 1]) as number;

const UPPER = new Set<ChordQuality>([
  "maj",
  "aug",
  "sus2",
  "sus4",
  "maj7",
  "7",
  "6",
  "69",
  "add9",
  "9",
  "maj9",
  "7b9",
  "7#9",
  "7#11",
  "7b13",
  "13",
  "7alt",
  "maj7#11",
  "7sus4",
]);
const DIM_FAMILY = new Set<ChordQuality>(["dim", "dim7", "m7b5"]);
const isDominant = (q: ChordQuality): boolean => q === "maj" || SEVENTH_CORE[q] === "7";
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

function cmpChordPcsDiatonic(chord: ChordId, key: KeySpec): boolean {
  const pcs = new Set<number>(scalePcs(key));
  if (isMinorRef(key)) {
    const t = pcOfSpelled(tonicOf(key));
    pcs.add(mod(t + 9, 12));
    pcs.add(mod(t + 11, 12));
  }
  return chordPcs(chord).every((pc) => pcs.has(pc));
}

/** Degree and alteration of a root `semis` above the tonic, against major or natural minor. */
function degreeOfRoot(
  semis: number,
  minor: boolean,
  quality: ChordQuality,
): { degree: number; alt: -1 | 0 | 1 } {
  const dimFam = DIM_FAMILY.has(quality);
  for (let n = 1; n <= 7; n++) if (refSemis(minor, n) === semis) return { degree: n, alt: 0 };
  if (minor) {
    if (semis === 11) return { degree: 7, alt: dimFam ? 0 : 1 };
    if (semis === 9) return { degree: 6, alt: dimFam ? 0 : 1 };
    if (semis === 1) return { degree: 2, alt: -1 };
    if (semis === 4) return { degree: 3, alt: 1 };
    return dimFam ? { degree: 4, alt: 1 } : { degree: 5, alt: -1 };
  }
  if (semis === 6) return dimFam ? { degree: 4, alt: 1 } : { degree: 5, alt: -1 };
  return { degree: [0, 2, 0, 3, 0, 0, 0, 0, 6, 0, 7][semis] as number, alt: -1 };
}

function rnDegree(chord: ChordId, key: KeySpec): { degree: number; alt: -1 | 0 | 1 } {
  const minor = isMinorRef(key);
  const t = tonicOf(key);
  const semis = mod(chord.rootPc - pcOfSpelled(t), 12);
  const table = degreeOfRoot(semis, minor, chord.quality);
  if (table.alt === 0) return table;
  // A chromatic root keeps its spelled letter when that gives a single accidental (D♯°7 → ♯ii°7, E♭ → ♭III).
  const r = parsePcName(chord.root);
  if (r && pcOfSpelled(r) === chord.rootPc) {
    const num = mod(r.letter - t.letter, 7) + 1;
    let alt = mod(semis - refSemis(minor, num) + 6, 12) - 6;
    if (minor && (num === 6 || num === 7) && alt === 1 && DIM_FAMILY.has(chord.quality)) alt = 0;
    if (alt === -1 || alt === 1 || alt === 0) return { degree: num, alt: alt as -1 | 0 | 1 };
  }
  return table;
}

function inversionOf(chord: ChordId): 0 | 1 | 2 | 3 {
  if (chord.bassPc === chord.rootPc) return 0;
  const row = rowOf(chord.quality);
  const bassSemis = mod(chord.bassPc - chord.rootPc, 12);
  for (let i = 1; i < Math.min(row.tones.length, 4); i++) {
    if (mod(row.intervals[i] as number, 12) === bassSemis) {
      const tone = row.tones[i] as string;
      const n = Number(tone.replace(/[#b]/g, ""));
      if (n === 3 || n === 2 || n === 4) return 1;
      if (n === 5) return 2;
      if (n === 7 || n === 6) return 3;
    }
  }
  return 0;
}

function triadAt(key: KeySpec, degree: number): ChordQuality {
  const minor = isMinorRef(key);
  if (minor && degree === 5) return "maj";
  const k: KeySpec = { tonic: key.tonic, mode: minor ? "minor" : "major" };
  const tri = diatonicChordTones(k, 3)[degree - 1];
  if (!tri) return "maj";
  const root = parsePcName(tri.root);
  if (!root) return "maj";
  const ivs = tri.notes.slice(1).map((n) => mod(pcOfSpelled(parsePcName(n) ?? root) - pcOfSpelled(root), 12));
  return qualityOf(ivs) ?? "maj";
}

function targetRn(targetPc: number, key: KeySpec): RomanNumeral | null {
  const minor = isMinorRef(key);
  const semis = mod(targetPc - pcOfSpelled(tonicOf(key)), 12);
  if (semis === 0) return null;
  let degree = 0;
  for (let n = 2; n <= 7; n++) if (refSemis(minor, n) === semis) degree = n;
  if (!degree || (minor && degree === 7)) return null;
  const q = triadAt(key, degree);
  if (q !== "maj" && q !== "min") return null;
  return { degree: degree as RomanNumeral["degree"], alt: 0, quality: q, inversion: 0 };
}

/** Case is computed from the quality, never taken from tonal. `next` resolves applied chords (V7/vi). */
export function romanOf(chord: ChordId, key: KeySpec, next?: ChordId): RomanNumeral {
  const inversion = inversionOf(chord);
  const minor = isMinorRef(key);
  const semis = mod(chord.rootPc - pcOfSpelled(tonicOf(key)), 12);
  // In minor the raised 7th makes vii°7 diatonic, but only on the leading tone: a °7 on any other root
  // (D♯°7 in C♯ minor = D♯ F♯ A C) borrows the raised 7th by enharmony and is an applied vii°7 (of III).
  const diatonic = cmpChordPcsDiatonic(chord, key) && !(minor && chord.quality === "dim7" && semis !== 11);
  // Picardy I in minor stays I; in a blues key I7 IV7 V7 are the home chords, not applied dominants.
  const plainTonicTriad =
    (semis === 0 && chord.quality === "maj") || (key.mode === "blues" && [0, 5, 7].includes(semis));
  // Applied dominants: a major or dominant chord a P5 above a diatonic major/minor degree x ≠ I.
  if (isDominant(chord.quality) && !plainTonicTriad) {
    const target = targetRn(chord.rootPc - 7, key);
    const resolvesThere = next !== undefined && next.rootPc === mod(chord.rootPc - 7, 12);
    const subtonicSeventh = minor && semis === 10 && chord.quality !== "maj" && resolvesThere;
    if (target && (!diatonic || subtonicSeventh)) {
      return { degree: 5, alt: 0, quality: chord.quality, inversion, of: target };
    }
  }
  // Applied leading-tone chords: vii°(7)/x.
  if (DIM_FAMILY.has(chord.quality) && !diatonic) {
    const target = targetRn(chord.rootPc + 1, key);
    if (target) return { degree: 7, alt: 0, quality: chord.quality, inversion, of: target };
  }
  const { degree, alt } = rnDegree(chord, key);
  return { degree: degree as RomanNumeral["degree"], alt, quality: chord.quality, inversion };
}

// --- text --------------------------------------------------------------------------------------------

const SEVENTH_FIG = ["7", "65", "43", "42"] as const;
const TRIAD_FIG = ["", "6", "64"] as const;
/** RN suffixes for the qualities beyond triads and sevenths (no figures: their inversion is not written). */
const EXT_SUFFIX: Partial<Record<ChordQuality, string>> = {
  "6": "add6",
  m6: "add6",
  "69": "69",
  add9: "add9",
  "9": "9",
  maj9: "maj9",
  m9: "9",
  m11: "11",
  "7b9": "7b9",
  "7#9": "7#9",
  "7#11": "7#11",
  "7b13": "7b13",
  "13": "13",
  "7alt": "7alt",
  "maj7#11": "maj7#11",
  sus2: "sus2",
  sus4: "sus4",
  "7sus4": "7sus4",
};

/**
 * Oak's dialect, ASCII except ø: case = quality, `o` diminished, `ø7` half-diminished, `+` augmented,
 * `maj7`, figures 6 64 / 65 43 42, applied `/`, prefixes `b` `#`. Sixth chords are `add6` (a bare 6 is a figure).
 */
export function formatRN(rn: RomanNumeral): string {
  const q = rn.quality;
  const upper = UPPER.has(q);
  let s = `${rn.alt === -1 ? "b" : rn.alt === 1 ? "#" : ""}${upper ? NUMERALS[rn.degree - 1] : (NUMERALS[rn.degree - 1] as string).toLowerCase()}`;
  const inv = rn.inversion;
  switch (q) {
    case "maj":
    case "min":
      s += TRIAD_FIG[Math.min(inv, 2)];
      break;
    case "dim":
      s += `o${TRIAD_FIG[Math.min(inv, 2)]}`;
      break;
    case "aug":
      s += `+${TRIAD_FIG[Math.min(inv, 2)]}`;
      break;
    case "7":
    case "m7":
      s += SEVENTH_FIG[inv];
      break;
    case "maj7":
    case "mMaj7":
      s += inv === 0 ? "maj7" : `maj${SEVENTH_FIG[inv]}`;
      break;
    case "m7b5":
      s += `ø${SEVENTH_FIG[inv]}`;
      break;
    case "dim7":
      s += `o${SEVENTH_FIG[inv]}`;
      break;
    default:
      s += EXT_SUFFIX[q] ?? "";
  }
  return rn.of ? `${s}/${formatRN(rn.of)}` : s;
}

/** Display form with ° and the half-diminished ø: "vii°7", "V⁶" is not used (figures stay digits). */
export function displayRN(rn: RomanNumeral): string {
  return formatRN(rn)
    .replace(/o/g, "°")
    .replace(/b(?=[IViv])/g, "♭")
    .replace(/#(?=[IViv])/g, "♯");
}

const RN_RE = /^(b|♭|#|♯)?(VII|III|VI|IV|II|V|I|vii|iii|vi|iv|ii|v|i)(.*)$/;
const FIGURES: Record<string, { seventh: boolean; inv: 0 | 1 | 2 | 3 }> = {
  "": { seventh: false, inv: 0 },
  "6": { seventh: false, inv: 1 },
  "64": { seventh: false, inv: 2 },
  "7": { seventh: true, inv: 0 },
  "65": { seventh: true, inv: 1 },
  "43": { seventh: true, inv: 2 },
  "42": { seventh: true, inv: 3 },
  "2": { seventh: true, inv: 3 },
};
const UPPER_EXT: Record<string, ChordQuality> = {
  add6: "6",
  "69": "69",
  add9: "add9",
  "9": "9",
  maj9: "maj9",
  "13": "13",
  "7b9": "7b9",
  "7#9": "7#9",
  "7#11": "7#11",
  "7b13": "7b13",
  "7alt": "7alt",
  "maj7#11": "maj7#11",
  sus2: "sus2",
  sus4: "sus4",
  sus: "sus4",
  "7sus4": "7sus4",
  "7sus": "7sus4",
};
const LOWER_EXT: Record<string, ChordQuality> = { add6: "m6", "9": "m9", "11": "m11" };

function parsePrimary(text: string, minor: boolean): RomanNumeral | null {
  const m = RN_RE.exec(text);
  if (!m) return null;
  const numeral = m[2] as string;
  const upper = numeral === numeral.toUpperCase();
  const degree = (NUMERALS.indexOf(numeral.toUpperCase() as (typeof NUMERALS)[number]) +
    1) as RomanNumeral["degree"];
  let alt: -1 | 0 | 1 = m[1] === "b" || m[1] === "♭" ? -1 : m[1] === "#" || m[1] === "♯" ? 1 : 0;
  let rest = (m[3] ?? "")
    .replace(/[°º]/g, "o")
    .replace(/[∆Δ]7?/g, "maj7")
    .replace(/^M7/, "maj7")
    .replace(/♭/g, "b")
    .replace(/♯/g, "#");
  let marker = "";
  if (rest.startsWith("dim")) {
    marker = "o";
    rest = rest.slice(3);
  } else if (rest.startsWith("aug")) {
    marker = "+";
    rest = rest.slice(3);
  } else if (/^[o+øh]/.test(rest)) {
    marker = rest[0] === "h" ? "ø" : (rest[0] as string);
    rest = rest.slice(1);
  }
  let quality: ChordQuality | undefined;
  let inversion: 0 | 1 | 2 | 3 = 0;
  const ext = upper ? UPPER_EXT[rest] : LOWER_EXT[rest];
  if (marker === "" && ext) quality = ext;
  else {
    let maj = false;
    if (rest.startsWith("maj")) {
      maj = true;
      rest = rest.slice(3);
      if (rest === "") rest = "7";
    }
    if (marker === "ø" && rest === "") rest = "7";
    const fig = FIGURES[rest];
    if (!fig) return null;
    inversion = fig.inv;
    if (maj && !fig.seventh) {
      if (!upper || marker) return null;
      quality = "maj";
    } else if (upper) {
      if (marker === "") quality = fig.seventh ? (maj ? "maj7" : "7") : "maj";
      else if (marker === "+" && !fig.seventh) quality = "aug";
      else return null;
    } else if (marker === "") quality = fig.seventh ? (maj ? "mMaj7" : "m7") : "min";
    else if (marker === "o") quality = fig.seventh ? "dim7" : "dim";
    else if (marker === "ø" && fig.seventh) quality = "m7b5";
    else return null;
  }
  if (quality === undefined) return null;
  // Minor keys: ♭III ♭VI ♭VII are the diatonic III VI VII; ♯vi° and ♯vii° are the raised vi° and vii°.
  if (minor && alt === -1 && (degree === 3 || degree === 6 || degree === 7)) alt = 0;
  if (minor && alt === 1 && (degree === 6 || degree === 7) && DIM_FAMILY.has(quality)) alt = 0;
  return { degree, alt, quality, inversion };
}

/** Oak's dialect: case = quality, `o`/`°`, `ø`, `+`, figures 6 64 7 65 43 42, applied `/`, prefixes `b` `#`. */
export function parseRN(text: string, key: KeySpec): RomanNumeral | null {
  // Stacked figures written with a slash (V6/5, V4/3, V4/2, I6/4) are figures, not applied chords.
  const t = text.trim().replace(/(6\/[54]|4\/[32])(?![0-9])/g, (f) => f.replace("/", ""));
  if (!t) return null;
  const slash = t.indexOf("/");
  if (slash < 0) return parsePrimary(t, isMinorRef(key));
  const primary = parsePrimary(t.slice(0, slash), false);
  const target = parseRN(t.slice(slash + 1), key);
  if (!primary || !target) return null;
  return { ...primary, of: target };
}

function bassFor(root: ReturnType<typeof addFifths>, quality: ChordQuality, inversion: number) {
  if (inversion === 0) return undefined;
  const tone = rowOf(quality).tones[inversion];
  if (!tone) return undefined;
  const m = /^(bb|b|#)?(\d+)$/.exec(tone);
  if (!m) return undefined;
  const n = ((Number(m[2]) - 1) % 7) + 1;
  const alt = m[1] === "#" ? 1 : m[1] === "b" ? -1 : m[1] === "bb" ? -2 : 0;
  return addFifths(root, degreeFifths(n, alt));
}

export function rnToChord(rn: RomanNumeral, key: KeySpec): ChordId {
  if (rn.of) {
    const target = rnToChord(rn.of, key);
    const tq = triadQuality(target.quality);
    const targetKey: KeySpec = { tonic: target.root, mode: tq === "min" || tq === "dim" ? "minor" : "major" };
    const { of: _of, ...primary } = rn;
    return rnToChord(primary, targetKey);
  }
  const minor = isMinorRef(key);
  const t = tonicOf(key);
  let alt: number = rn.alt;
  if (minor && (rn.degree === 3 || rn.degree === 6 || rn.degree === 7)) alt -= 1;
  if (minor && (rn.degree === 6 || rn.degree === 7) && rn.alt === 0 && DIM_FAMILY.has(rn.quality)) alt = 0;
  const root = addFifths(t, degreeFifths(rn.degree, alt));
  const rootPc = pcOfSpelled(root);
  const chord: ChordId = { rootPc, root: nameOf(root), quality: rn.quality, bassPc: rootPc, ext: [] };
  const bass = bassFor(root, rn.quality, rn.inversion);
  if (bass) {
    chord.bassPc = pcOfSpelled(bass);
    chord.bass = nameOf(bass);
  }
  return chord;
}

/**
 * T = I, vi, iii (and i, VI, III in minor); PD = ii, IV, iv, ♭VI, ♭II (and ii°, iv in minor); D = V, vii°
 * (and VII in minor, the subtonic). Applied chords and everything else are `chromatic`.
 */
export function functionOf(rn: RomanNumeral, key: KeySpec): HarmonicFunction {
  if (rn.of) return "chromatic";
  const minor = isMinorRef(key);
  const d = rn.degree;
  if (rn.alt === 0) {
    if (d === 1 || d === 3 || d === 6) return minor && d === 6 && DIM_FAMILY.has(rn.quality) ? "PD" : "T";
    if (d === 2 || d === 4) return "PD";
    if (d === 5) return "D";
    if (d === 7) return "D";
  }
  if (rn.alt === -1 && (d === 6 || d === 2)) return "PD";
  if (rn.alt === 1 && d === 4 && DIM_FAMILY.has(rn.quality)) return "D";
  return "chromatic";
}

/**
 * The cadence formed by the last two chords of a phrase (exercises §3.5 `cadenceAt`). PAC needs V(7) → I with
 * both in root position and, when `melodyOnTonic` is given, the melody ending on 1.
 */
export function classifyCadence(
  penult: RomanNumeral,
  final: RomanNumeral,
  key: KeySpec,
  opts: { melodyOnTonic?: boolean } = {},
): CadenceType {
  const minor = isMinorRef(key);
  const is = (rn: RomanNumeral, degree: number, alt = 0) => !rn.of && rn.degree === degree && rn.alt === alt;
  const triad = (rn: RomanNumeral) => triadQuality(rn.quality);
  const tonic =
    is(final, 1) && (triad(final) === (minor ? "min" : "maj") || (minor && triad(final) === "maj"));
  const dominant = (rn: RomanNumeral) => is(rn, 5) && triad(rn) === "maj";
  const leading = (rn: RomanNumeral) => is(rn, 7) && DIM_FAMILY.has(rn.quality);
  if (tonic && dominant(penult)) {
    const rootPos = penult.inversion === 0 && final.inversion === 0;
    return rootPos && opts.melodyOnTonic !== false ? "PAC" : "IAC";
  }
  if (tonic && leading(penult)) return "IAC";
  if (tonic && is(penult, 4)) return "PC";
  if (tonic && is(penult, 7, minor ? 0 : -1) && !DIM_FAMILY.has(penult.quality)) return "bVII-I";
  if (dominant(penult) && (is(final, 6) || is(final, 6, -1))) return "DC";
  if (dominant(final)) return "HC";
  return "none";
}

/** Diatonic triads (or seventh chords) of a seven-note key, I to vii. Minor keys use natural minor. */
export function diatonicChords(key: KeySpec, seventh = false): ChordId[] {
  return diatonicChordTones(key, seventh ? 4 : 3).map(({ root, notes }) => {
    const r = parsePcName(root);
    if (!r) throw new Error(`bad root ${root}`);
    const ivs = notes.slice(1).map((n) => mod(pcOfSpelled(parsePcName(n) ?? r) - pcOfSpelled(r), 12));
    const quality = qualityOf(ivs);
    if (!quality) throw new Error(`no quality for ${notes.join(" ")}`);
    const rootPc = pcOfSpelled(r) as Pc;
    return { rootPc, root: nameOf(r), quality, bassPc: rootPc, ext: [] };
  });
}

export { defaultPcName, letterIndex };
