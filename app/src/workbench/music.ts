// Music labels for the views: spelled note names, 1-based scale degrees (major-relative, "♭3"),
// movable-do syllables, chord-tone roles and the tooltip text. Everything goes through @oak/theory;
// nothing reads Strudel's `value.note` spelling (it is backwards after `.scale()`). Pure.
import type { KeySpec } from "@oak/content-kit";
import {
  type ChordId,
  chordSpelling,
  degreeOf,
  parseChordSymbol,
  scalePcs,
  spellMidi,
  toLeadSheet,
} from "@oak/theory";
import { prettyDegree } from "./palette.ts";

export interface PitchLabel {
  midi: number;
  /** Scientific name in the key's spelling: "F#4", "Bb3". */
  name: string;
  /** Same with glyphs: "F♯4". */
  display: string;
  /** Present when a key context exists. */
  degree?: {
    /** Major-relative: "1", "b3", "#4". */
    raw: string;
    /** "♭3". */
    label: string;
    num: number;
    alt: number;
    syllable: string;
    /** The pitch class belongs to the key's scale. */
    inKey: boolean;
    tonic: boolean;
  };
}

const pcSetCache = new Map<string, Set<number>>();
function keyPcs(key: KeySpec): Set<number> {
  const k = `${key.tonic}:${key.mode}`;
  let set = pcSetCache.get(k);
  if (!set) {
    set = new Set(scalePcs(key));
    pcSetCache.set(k, set);
  }
  return set;
}

/** True when `midi`'s pitch class is in the key's scale. */
export function inKey(midi: number, key: KeySpec): boolean {
  return keyPcs(key).has((((Math.round(midi) % 12) + 12) % 12) as number);
}

export function pitchLabel(midi: number, key: KeySpec | null, chord?: ChordId): PitchLabel {
  const spelled = spellMidi(midi, chord ? { key, chord } : { key });
  const out: PitchLabel = {
    midi,
    name: spelled.name,
    display: spelled.name.replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭"),
  };
  if (key) {
    const d = degreeOf(midi, key);
    out.degree = {
      raw: d.degree,
      label: prettyDegree(d.degree),
      num: d.num,
      alt: d.alt,
      syllable: d.syllable,
      inKey: inKey(midi, key),
      tonic: d.semitones === 0,
    };
  }
  return out;
}

/** Row label for the roll gutter by the label mode of ux §3.4. */
export function rowLabel(
  midi: number,
  key: KeySpec | null,
  mode: "none" | "note" | "degree" | "degree+solfege",
): string {
  if (mode === "none") return "";
  const p = pitchLabel(midi, key);
  if (mode === "note" || !p.degree) return p.display;
  return mode === "degree+solfege" ? `${p.degree.label} ${p.degree.syllable}` : p.degree.label;
}

/**
 * The role of `midi` in the chord named by `symbol`: "R", "3", "5", "7", "9", "11", "13" (with ♭/♯ for
 * altered fifths and tensions, "2"/"4" for sus, "6" for sixth chords); `null` for a non-chord tone or
 * an unknown symbol.
 */
export function chordToneOf(midi: number, symbol: string): string | null {
  const chord = parseChordSymbol(symbol);
  if (!chord) return null;
  const rel = (((Math.round(midi) - chord.rootPc) % 12) + 12) % 12;
  const intervals = chordSpelling(chord.quality).intervals;
  const hit = intervals.find((v) => v % 12 === rel);
  if (hit === undefined) return null;
  return intervalRole(hit, chord.quality);
}

function intervalRole(v: number, quality: string): string {
  if (v === 0) return "R";
  if (v >= 12) {
    const t = v - 12;
    if (t === 1) return "♭9";
    if (t === 2) return "9";
    if (t === 3) return "♯9";
    if (t === 5) return "11";
    if (t === 6) return "♯11";
    if (t === 8) return "♭13";
    if (t === 9) return "13";
    return String(v);
  }
  switch (v) {
    case 1:
      return "♭9";
    case 2:
      return quality.startsWith("sus") ? "2" : "9";
    case 3:
    case 4:
      return "3";
    case 5:
      return quality.startsWith("sus") ? "4" : "11";
    case 6:
      return "♭5";
    case 7:
      return "5";
    case 8:
      return "♯5";
    case 9:
      // the ♭♭7 of a diminished seventh is its seventh; otherwise a sixth
      return quality === "dim7" || quality === "o7" ? "7" : "6";
    case 10:
    case 11:
      return "7";
    default:
      return String(v);
  }
}

export interface ChordRole {
  /** "R", "3", "5", "7" for chord tones; "9", "♭9", "♯11", "13" for tensions; "♭2", "♮3"… for others. */
  label: string;
  /** Chord tones are solid, tensions outlined thick, non-chord tones hollow dashed (ux §3.4 chordTone mode). */
  kind: "tone" | "tension" | "non";
}

const NON_LABELS = ["R", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♭6", "6", "♭7", "7"];

/**
 * How `midi` relates to the chord `symbol`: a chord tone of its quality, an available tension (9, 11, 13
 * and their alterations, as rootless voicings such as `lefthand` add them), or a non-chord tone.
 */
export function chordRoleOf(midi: number, symbol: string): ChordRole | null {
  const chord = parseChordSymbol(symbol);
  if (!chord) return null;
  const tone = chordToneOf(midi, symbol);
  if (tone !== null) {
    const isTension = /9|11|13/.test(tone);
    return { label: tone, kind: isTension ? "tension" : "tone" };
  }
  const rel = (((Math.round(midi) - chord.rootPc) % 12) + 12) % 12;
  const iv = new Set(chordSpelling(chord.quality).intervals.map((v) => v % 12));
  const majorThird = iv.has(4);
  const minorThird = iv.has(3);
  const fifth = iv.has(7);
  const seventh = iv.has(10) || iv.has(11);
  const tension = ((): string | null => {
    switch (rel) {
      case 1:
        return majorThird && seventh ? "♭9" : null;
      case 2:
        return "9";
      case 3:
        return majorThird && seventh ? "♯9" : null;
      case 5:
        return minorThird || !majorThird ? "11" : null;
      case 6:
        return majorThird && fifth ? "♯11" : null;
      case 8:
        return majorThird && seventh && fifth ? "♭13" : null;
      case 9:
        return seventh ? "13" : "6";
      default:
        return null;
    }
  })();
  if (tension) return { label: tension, kind: "tension" };
  return { label: NON_LABELS[rel] as string, kind: "non" };
}

/** Lead-sheet display of a code chord symbol ("C^7" → "Cmaj7"); the symbol itself when it does not parse. */
export function chordDisplay(symbol: string): string {
  const c = parseChordSymbol(symbol);
  return c ? toLeadSheet(c) : symbol;
}

export interface TooltipInput {
  midi: number | null;
  s?: string;
  chordSymbol?: string;
  track: string;
  bar: number;
  beatLabel: string;
}

/** "F♯4 · degree 3 · mi · bar 2, beat 1&" (ux §3.4: note names appear on hover). */
export function tooltipText(e: TooltipInput, key: KeySpec | null): string {
  const parts: string[] = [];
  if (e.midi !== null) {
    const chord = e.chordSymbol ? (parseChordSymbol(e.chordSymbol) ?? undefined) : undefined;
    const p = pitchLabel(e.midi, key, chord);
    parts.push(p.display);
    if (p.degree) {
      parts.push(`degree ${p.degree.label}`);
      parts.push(p.degree.syllable);
    }
    if (e.chordSymbol) {
      const role = chordRoleOf(e.midi, e.chordSymbol);
      const name = chordDisplay(e.chordSymbol);
      parts.push(
        role === null || role.kind === "non"
          ? `over ${name}`
          : `${role.label} of ${name}${role.kind === "tension" ? " (tension)" : ""}`,
      );
    }
  } else if (e.s) {
    parts.push(e.s);
  }
  parts.push(`${e.track}`);
  parts.push(`bar ${e.bar}, beat ${e.beatLabel}`);
  return parts.join(" · ");
}
