// The bar grid's logic (wave5.md §11, `bar-grid`; contracts §6.6 C5, X2): a chord chart of `bars` boxes,
// `perRow` to a line, one numeral (`entry: "rn"`) or code-spelled chord symbol (`entry: "symbol"`) per bar, picked
// from a small palette limited to the step's `qualities`. Digits pick the chord on that degree of the key in the
// quality the key gives it when allowed (in a blues, every chord a dominant seventh), `-` first a flat degree.
// Graded bar by bar by degree and quality, never by string: this file only writes the entries. Pure.
import type { ChordQuality, KeySpec } from "@oak/api";
import { MODE_DEGREES } from "@oak/content-kit";
import { chartChordText } from "@oak/notation";
import { chordOf, chordOfRoman, formatRN, isMinorRef, parseChordWithBass, toCode } from "@oak/theory";
import { voiceChord } from "./harmony.ts";
import { spellDegreeName } from "./scale.ts";
import type { AnswerSpecOf } from "./types.ts";

export type BarGridSpec = AnswerSpecOf<"bar-grid">;

/** The triad and seventh each degree of a major or natural-minor key carries. */
const MAJOR_TRIADS: ChordQuality[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MAJOR_SEVENTHS: ChordQuality[] = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
const MINOR_TRIADS: ChordQuality[] = ["min", "dim", "maj", "min", "min", "maj", "maj"];
const MINOR_SEVENTHS: ChordQuality[] = ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"];
/** Harmonic minor: the major V and the diminished vii° of the raised 7th. */
const HARMONIC_TRIADS: ChordQuality[] = ["min", "dim", "maj", "min", "maj", "maj", "dim"];
const HARMONIC_SEVENTHS: ChordQuality[] = ["m7", "m7b5", "maj7", "m7", "7", "maj7", "dim7"];

const SEVENTH_QUALITIES = new Set<ChordQuality>(["maj7", "7", "m7", "m7b5", "dim7", "mMaj7"]);

/** The quality the key puts on a degree, as a triad or a seventh. Flat degrees borrow as major chords. */
export function diatonicQuality(
  degree: number,
  alt: number,
  key: KeySpec | null,
  seventh: boolean,
): ChordQuality {
  if (alt !== 0) return seventh ? "7" : "maj";
  const mode = key?.mode;
  const harmonic = mode === "harmonic minor" || mode === "melodic minor";
  const minor = key ? isMinorRef(key) || harmonic : false;
  const row = harmonic
    ? seventh
      ? HARMONIC_SEVENTHS
      : HARMONIC_TRIADS
    : minor
      ? seventh
        ? MINOR_SEVENTHS
        : MINOR_TRIADS
      : seventh
        ? MAJOR_SEVENTHS
        : MAJOR_TRIADS;
  return row[degree - 1] as ChordQuality;
}

/**
 * The quality a digit picks: the key's own quality on that degree when the palette has it (as a seventh when the
 * palette has only sevenths), else the palette's first quality (a blues palette `["7"]` makes every degree a
 * dominant seventh).
 */
export function defaultQuality(
  degree: number,
  alt: number,
  qualities: readonly ChordQuality[],
  key: KeySpec | null,
): ChordQuality {
  const triad = diatonicQuality(degree, alt, key, false);
  const seventh = diatonicQuality(degree, alt, key, true);
  if (qualities.includes(triad)) return triad;
  if (qualities.includes(seventh)) return seventh;
  return (qualities[0] ?? triad) as ChordQuality;
}

/**
 * The degree a palette number names in the key, against the major scale: numbers are the key's own degrees
 * (3 in A minor is ♭3, C, as III is C), a flat number is lowered from the major scale (♭VII in C is B♭).
 */
export function keyDegree(degree: number, alt: number, key: KeySpec | null): string {
  if (alt !== 0) return `${alt < 0 ? "b" : "#"}${degree}`;
  const own = key ? MODE_DEGREES[key.mode] : null;
  return own && own.length === 7 ? (own[degree - 1] as string) : String(degree);
}

/** One entry: the numeral or the code-spelled symbol for a degree and quality in the key. */
export function entryFor(
  kind: BarGridSpec["entry"],
  degree: number,
  alt: number,
  quality: ChordQuality,
  key: KeySpec | null,
): string {
  if (kind === "rn") return formatRN({ degree: degree as 1, alt: alt as 0, quality, inversion: 0 });
  const tonic = key?.tonic ?? "C";
  const root = spellDegreeName(tonic, keyDegree(degree, alt, key)) ?? "C";
  return toCode(chordOf(root, quality));
}

/** The degree and quality an entry holds, to change its quality or show it on the palette. */
export function entryParts(
  kind: BarGridSpec["entry"],
  entry: string,
  key: KeySpec | null,
): { degree: number; alt: number; quality: ChordQuality } | null {
  if (entry.trim() === "") return null;
  const k: KeySpec = key ?? { tonic: "C", mode: "major" };
  if (kind === "rn") {
    const m = /^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)/.exec(entry);
    const chord = chordOfRoman(entry, k);
    if (!m || !chord) return null;
    const numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii"];
    return {
      degree: numerals.indexOf((m[2] as string).toLowerCase()) + 1,
      alt: m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0,
      quality: chord.quality,
    };
  }
  const chord = parseChordWithBass(entry);
  if (!chord) return null;
  for (const [i, alt] of [0, -1, 1].flatMap((a) => [1, 2, 3, 4, 5, 6, 7].map((d) => [d, a] as const))) {
    const name = spellDegreeName(k.tonic, keyDegree(i, alt, key));
    if (name && name === chord.root) return { degree: i, alt, quality: chord.quality };
  }
  return null;
}

/** The next quality of the palette for an entry (`Q`), or the entry unchanged with one quality. */
export function cycleEntryQuality(
  kind: BarGridSpec["entry"],
  entry: string,
  qualities: readonly ChordQuality[],
  key: KeySpec | null,
): string {
  const p = entryParts(kind, entry, key);
  if (!p || qualities.length < 2) return entry;
  const at = qualities.indexOf(p.quality);
  const next = qualities[(at + 1) % qualities.length] as ChordQuality;
  return entryFor(kind, p.degree, p.alt, next, key);
}

/** How an entry prints: a numeral as written (`IV7`), a symbol as on a lead sheet (`B♭7`). */
export function entryText(kind: BarGridSpec["entry"], entry: string): string {
  if (entry === "") return "";
  return kind === "symbol" ? chartChordText(entry) : entry;
}

/** The notes an entry sounds (a close voicing; never graded), or null when it does not read. */
export function entryMidis(kind: BarGridSpec["entry"], entry: string, key: KeySpec | null): number[] | null {
  if (entry.trim() === "") return null;
  const chord =
    kind === "rn" ? chordOfRoman(entry, key ?? { tonic: "C", mode: "major" }) : parseChordWithBass(entry);
  return chord ? voiceChord(chord) : null;
}

export interface PaletteButton {
  /** 1–7. */
  degree: number;
  alt: -1 | 0;
  /** What the button puts in the bar. */
  entry: string;
  /** The key: "1"–"7", "-7" for a flat degree. */
  key: string;
}

/**
 * The palette: the seven degrees in the quality a digit picks, then (when the qualities allow major chords or
 * sevenths) the flat degrees a pop or blues chart borrows (♭III ♭VI ♭VII; in minor these are the key's own III VI
 * VII and are left out).
 */
export function barGridPalette(
  spec: Pick<BarGridSpec, "entry" | "qualities">,
  key: KeySpec | null,
): PaletteButton[] {
  const out: PaletteButton[] = [];
  for (let d = 1; d <= 7; d++) {
    const q = defaultQuality(d, 0, spec.qualities, key);
    out.push({ degree: d, alt: 0, entry: entryFor(spec.entry, d, 0, q, key), key: String(d) });
  }
  const minor = key
    ? isMinorRef(key) || key.mode === "harmonic minor" || key.mode === "melodic minor"
    : false;
  if (!minor && spec.qualities.some((q) => q === "maj" || q === "7"))
    for (const d of [3, 6, 7]) {
      const q = defaultQuality(d, -1, spec.qualities, key);
      out.push({ degree: d, alt: -1, entry: entryFor(spec.entry, d, -1, q, key), key: `-${d}` });
    }
  return out;
}

/** The rows of the chart: `perRow` bars a line (1-based bar numbers). */
export function barRows(bars: number, perRow: number): number[][] {
  const per = Math.max(1, perRow);
  const rows: number[][] = [];
  for (let b = 1; b <= bars; b += per)
    rows.push(Array.from({ length: Math.min(per, bars - b + 1) }, (_, i) => b + i));
  return rows;
}

/** True for a seventh quality (the palette shows a seventh glyph for it). */
export function isSeventh(q: ChordQuality): boolean {
  return SEVENTH_QUALITIES.has(q);
}

/** Puts an entry in a bar, skipping given bars, and returns the next bar to fill (or null when full). */
export function placeEntry(
  value: readonly string[],
  spec: Pick<BarGridSpec, "bars" | "given">,
  entry: string,
  at: number | null,
): { value: string[]; next: number | null } {
  const n = spec.bars;
  const given = new Set((spec.given ?? []).map((b) => b - 1));
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  const open = (k: number) => !given.has(k);
  const first = slots.findIndex((x, k) => x === "" && open(k));
  let i = at !== null && open(at) ? at : first;
  if (i < 0) {
    for (let k = n - 1; k >= 0; k--)
      if (open(k)) {
        i = k;
        break;
      }
  }
  if (i < 0) return { value: slots, next: null };
  slots[i] = entry;
  let next: number | null = null;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (slots[j] === "" && open(j)) {
      next = j;
      break;
    }
  }
  return { value: slots, next };
}

/** Backspace: clears the chosen bar if filled (never a given one), else the last filled open bar. */
export function clearEntry(
  value: readonly string[],
  spec: Pick<BarGridSpec, "bars" | "given">,
  at: number | null,
): { value: string[]; at: number | null } {
  const n = spec.bars;
  const given = new Set((spec.given ?? []).map((b) => b - 1));
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  let i = at !== null && slots[at] !== "" && !given.has(at) ? at : -1;
  if (i < 0)
    for (let k = n - 1; k >= 0; k--)
      if (slots[k] !== "" && !given.has(k)) {
        i = k;
        break;
      }
  if (i >= 0) slots[i] = "";
  return { value: slots, at: i >= 0 ? i : at };
}

/**
 * The value a host starts the grid from: empty bars, with the given bars filled from the exercise's answer
 * (`correct.rn` or `correct.text`), since a given bar is printed already filled.
 */
export function barGridStart(
  spec: Pick<BarGridSpec, "bars" | "given">,
  correct?: readonly string[],
): string[] {
  const out = Array.from({ length: spec.bars }, () => "");
  for (const b of spec.given ?? []) if (b >= 1 && b <= spec.bars) out[b - 1] = correct?.[b - 1] ?? "";
  return out;
}

/** When each filled bar sounds as the chart plays: one bar per `beatsPerBar` beats. */
export function chartHits(
  value: readonly string[],
  kind: BarGridSpec["entry"],
  key: KeySpec | null,
  o: { bpm?: number; beatsPerBar?: number } = {},
): { at: number; dur: number; midis: number[]; bar: number }[] {
  const bar = (o.beatsPerBar ?? 4) * (60 / (o.bpm ?? 100));
  const out: { at: number; dur: number; midis: number[]; bar: number }[] = [];
  value.forEach((e, i) => {
    const midis = entryMidis(kind, e, key);
    if (midis) out.push({ at: i * bar, dur: bar * 0.92, midis, bar: i });
  });
  return out;
}
