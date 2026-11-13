// Pure helpers behind the Wave 4 chord widgets (docs/design/wave4.md §11): the chord-name picker, the chord builder
// (staff or keyboard), the Roman-numeral palette's playback, and the slot strips (function, cadence). Every chord
// name, numeral and inversion comes from `@oak/theory` (`readChord`, `chordOfRoman`, `toLeadSheet`), never from a
// table here (wave4.md §10 item 11). No DOM: tested with `bun test`.
import type { Choice, ChordQuality, KeySpec } from "@oak/api";
import {
  type ChordReading,
  chordOf,
  chordOfRoman,
  chordPcs,
  type Degree,
  degreeSemitones,
  normalizeText,
  parseChordWithBass,
  readChord,
  spellMidi,
  toLeadSheet,
} from "@oak/theory";
import { keyName } from "./normalize.ts";

type ChordId = ReturnType<typeof chordOf>;

// --- chord names --------------------------------------------------------------------------------

/** The qualities the chord-name picker offers, in the order U05–U06 teach them. */
export interface PickerQuality {
  quality: ChordQuality;
  /** What the button prints (the lead-sheet suffix, `maj` for the empty one). */
  label: string;
  /** Spoken on the button. */
  spoken: string;
  /** Sevenths sit in a second row, shown when the step or the typed answer asks for them. */
  seventh: boolean;
}

export const PICKER_QUALITIES: readonly PickerQuality[] = [
  { quality: "maj", label: "maj", spoken: "major", seventh: false },
  { quality: "min", label: "m", spoken: "minor", seventh: false },
  { quality: "dim", label: "°", spoken: "diminished", seventh: false },
  { quality: "aug", label: "+", spoken: "augmented", seventh: false },
  { quality: "7", label: "7", spoken: "dominant 7th", seventh: true },
  { quality: "maj7", label: "maj7", spoken: "major 7th", seventh: true },
  { quality: "m7", label: "m7", spoken: "minor 7th", seventh: true },
  { quality: "m7b5", label: "m7♭5", spoken: "half-diminished 7th", seventh: true },
  { quality: "dim7", label: "°7", spoken: "diminished 7th", seventh: true },
];

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Letter = (typeof LETTERS)[number];
export type Acc = -1 | 0 | 1;

/** A chord name split into what the picker's buttons set. */
export interface ChordParts {
  letter: Letter;
  acc: Acc;
  quality: ChordQuality;
  /** The slash bass (`G/B` → B), or null in root position. */
  bass: { letter: Letter; acc: Acc } | null;
}

function splitPc(name: string): { letter: Letter; acc: Acc } | null {
  const m = /^([A-G])(#|b)?$/.exec(name);
  if (!m) return null;
  return { letter: m[1] as Letter, acc: m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0 };
}

const pcName = (letter: Letter, acc: Acc) => `${letter}${acc === 1 ? "#" : acc === -1 ? "b" : ""}`;

/**
 * What the picker shows for a typed answer: the parts of the chord Oak reads in it (the grader's normaliser),
 * or `null` when it is not a chord name (yet). Extended chords keep their quality but the picker cannot set them.
 */
export function chordParts(text: string): ChordParts | null {
  let canonical: string | null = null;
  try {
    canonical = normalizeText("chord", text);
  } catch {
    canonical = null;
  }
  const c = canonical ? parseChordWithBass(canonical) : null;
  if (!c) return null;
  const root = splitPc(c.root);
  if (!root) return null;
  const bass = c.bass && c.bassPc !== c.rootPc ? splitPc(c.bass) : null;
  return { ...root, quality: c.quality, bass };
}

/** The lead-sheet name the picker writes into the field: `C`, `Cm`, `C°`, `C+`, `G/B`, `F♯m7♭5`. */
export function composeChord(p: ChordParts): string {
  const chord = chordOf(
    pcName(p.letter, p.acc),
    p.quality,
    p.bass ? pcName(p.bass.letter, p.bass.acc) : undefined,
  );
  return toLeadSheet(chord);
}

/** 0 root position … 3 third inversion, from where the bass sits in the chord; null when it is not a chord tone. */
export function inversionOfParts(p: ChordParts): 0 | 1 | 2 | 3 | null {
  if (!p.bass) return 0;
  const chord = chordOf(pcName(p.letter, p.acc), p.quality, pcName(p.bass.letter, p.bass.acc));
  const pcs = chordPcs(chord) as number[];
  const i = pcs.indexOf(chord.bassPc);
  return i < 0 || i > 3 ? null : (i as 0 | 1 | 2 | 3);
}

export const INVERSION_WORDS = [
  "root position",
  "first inversion",
  "second inversion",
  "third inversion",
] as const;

// --- the chord builder --------------------------------------------------------------------------

export interface BuiltChord {
  /** Sorted MIDI notes, low to high (duplicates removed). */
  midis: number[];
  /** Note names low to high, spelled in the key when there is one: "F A C". */
  names: string[];
  /** The lowest note's name. */
  bassName: string;
  /** What `readChord` makes of it: a triad or a seventh, or null (two notes, a cluster, a sus chord). */
  reading: ChordReading | null;
}

/** Spells a MIDI note in the key (`F♯4` in D, `B♭3` in F); in C or without a key, the plain sharp name. */
export function noteName(midi: number, key?: KeySpec | null): string {
  if (!key) return keyName(midi, "sharp");
  const s = spellMidi(midi, { key });
  return `${s.letter}${s.alt > 0 ? "♯".repeat(s.alt) : "♭".repeat(-s.alt)}${s.oct}`;
}

/** The chord a set of notes makes: names low to high and the triad or seventh it reads as (the bass decides). */
export function buildChord(midis: readonly number[], key?: KeySpec | null): BuiltChord | null {
  const sorted = [...new Set(midis.map((m) => Math.round(m)))].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const bass = sorted[0] as number;
  const names = sorted.map((m) => noteName(m, key));
  return {
    midis: sorted,
    names,
    bassName: names[0] as string,
    reading: sorted.length >= 2 ? readChord(sorted, bass) : null,
  };
}

/** "C major", "B diminished", "G dominant 7th": the reading's quality in words. */
export function qualityWords(q: ChordQuality): string {
  return PICKER_QUALITIES.find((x) => x.quality === q)?.spoken ?? q;
}

/**
 * The line a builder prints under a chord: the notes, and (when naming is on) the chord and its inversion,
 * "C/E: C major, first inversion (E at the bottom)". Never invents a name: an unreadable stack says so.
 */
export function describeBuilt(b: BuiltChord, name: boolean): { notes: string; name: string | null } {
  const notes = `${b.names.map((n) => n.replace(/-?\d+$/, "")).join(" ")}, ${b.bassName.replace(/-?\d+$/, "")} at the bottom`;
  if (!name) return { notes, name: null };
  if (b.midis.length < 3) return { notes, name: "Not a chord yet: a triad has three notes." };
  if (!b.reading) return { notes, name: "Not a triad or a seventh chord: check each 3rd." };
  const r = b.reading;
  return {
    notes,
    name: `${r.leadSheet}: ${r.root.replace("#", "♯").replace(/b$/, "♭")} ${qualityWords(r.quality)}, ${INVERSION_WORDS[r.inversion]}`,
  };
}

/**
 * A close voicing to hear a chord by: the bass in the octave below middle C, the chord tones above it from
 * middle C up (each pitch class once). Used for numerals and chord names; never graded.
 */
export function voiceChord(chord: ChordId): number[] {
  const bass = 48 + chord.bassPc;
  const upper = (chordPcs(chord) as number[]).map((pc) => 60 + pc).sort((a, b) => a - b);
  return [bass, ...upper];
}

/** The notes a numeral plays in a key (`V6` in C → B2 G4 B4 D5 … voiced as `voiceChord`), or null. */
export function rnMidis(rn: string, key: KeySpec): number[] | null {
  if (rn.trim() === "") return null;
  const c = chordOfRoman(rn, key);
  return c ? voiceChord(c) : null;
}

/**
 * Whether a numeral's chord contains a bass degree (ux §4.5, staged dictation stage 2: once the bass is known, the
 * palette lights the chords that contain it). Degrees are read against the major scale ("b7", "#4"); without a key
 * the numerals are read in C major, which gives the same answer for degree relations. Unreadable input: true.
 */
export function rnHasDegree(rn: string, degree: string, key?: KeySpec): boolean {
  if (!/^[b#]?[1-7]$/.test(degree)) return true;
  const k: KeySpec = key ?? { tonic: "C", mode: "major" };
  const chord = chordOfRoman(rn, k);
  const tonic = chordOfRoman("I", k);
  if (!chord || !tonic) return true;
  const pc = (((tonic.bassPc + degreeSemitones(degree as Degree)) % 12) + 12) % 12;
  return (chordPcs(chord) as number[]).includes(pc);
}

/** The lead-sheet name of a numeral in a key ("IV" in F → "B♭"), for the palette's "IV · B♭". */
export function rnSymbol(rn: string, key: KeySpec): string | null {
  const c = chordOfRoman(rn, key);
  return c ? toLeadSheet(c) : null;
}

export interface Hit {
  /** Seconds after the start. */
  at: number;
  dur: number;
  midis: number[];
  slot: number;
}

/**
 * When each filled slot sounds when the progression plays: one slot per bar (or per half bar), at the given
 * tempo in the meter's beats. Empty or unreadable slots are silent but keep their time.
 */
export function progressionHits(
  rns: readonly string[],
  key: KeySpec,
  o: { bpm?: number; beatsPerBar?: number; slotsPerBar?: 1 | 2 } = {},
): Hit[] {
  const beat = 60 / (o.bpm ?? 90);
  const slotLen = ((o.beatsPerBar ?? 4) / (o.slotsPerBar ?? 1)) * beat;
  const out: Hit[] = [];
  rns.forEach((rn, slot) => {
    const midis = rnMidis(rn, key);
    if (midis) out.push({ at: slot * slotLen, dur: slotLen * 0.92, midis, slot });
  });
  return out;
}

// --- slots ---------------------------------------------------------------------------------------

export interface SlotLabel {
  /** Read by a screen reader: "Bar 2", "Bar 2, beat 3". */
  spoken: string;
  /** Printed over the slot: "bar 2", "beat 3". */
  short: string;
  /** 1-based bar the slot is in. */
  bar: number;
  /** True for the first slot of a bar (the bar header goes there). */
  barStart: boolean;
}

/**
 * The labels of a slot strip: authored labels win; else one slot per bar ("bar 1") or two ("beat 1", "beat 3"
 * under a "Bar 1" header; in 3/4 the second half starts on the "and" of 2, so it reads "half 2").
 */
export function slotLabels(
  n: number,
  o: { slotsPerBar?: 1 | 2; beatsPerBar?: number; labels?: readonly string[] } = {},
): SlotLabel[] {
  const per = o.slotsPerBar ?? 1;
  const beats = o.beatsPerBar ?? 4;
  return Array.from({ length: n }, (_, i) => {
    const bar = Math.floor(i / per) + 1;
    const authored = o.labels?.[i];
    if (authored) return { spoken: authored, short: authored, bar, barStart: i % per === 0 };
    if (per === 1) return { spoken: `Bar ${bar}`, short: `bar ${bar}`, bar, barStart: true };
    const half = i % per;
    const second = beats % 2 === 0 ? `beat ${beats / 2 + 1}` : "half 2";
    const short = half === 0 ? "beat 1" : second;
    return { spoken: `Bar ${bar}, ${short}`, short, bar, barStart: half === 0 };
  });
}

/**
 * What a slot prints for a chosen option: the part before ":" of a label written "T: home (tonic)", else a short
 * upper-case id (`PAC`, `HC`), else the label itself.
 */
export function optionShort(o: Choice): string {
  const colon = o.label.indexOf(":");
  if (colon > 0 && colon <= 6) return o.label.slice(0, colon).trim();
  if (/^[A-Z][A-Za-z0-9♭♯°+]{0,4}$/.test(o.id)) return o.id;
  return o.label;
}

/** The harmonic function an option stands for (T, PD, D), for the function colours; null for any other option. */
export function optionFunction(o: Choice): "T" | "PD" | "D" | null {
  return o.id === "T" || o.id === "PD" || o.id === "D" ? o.id : null;
}

/** Fills the selected slot (or the first empty one, else the last) and returns the new value and the next slot. */
export function fillSlot(
  value: readonly string[],
  n: number,
  id: string,
  at: number | null,
): { value: string[]; next: number | null } {
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  const first = slots.indexOf("");
  const i = at ?? (first < 0 ? n - 1 : first);
  slots[i] = id;
  // After a chosen slot, move on to the next empty one to its right (wrapping), so typing 1 2 3 1 fills a strip.
  let next: number | null = null;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (slots[j] === "") {
      next = j;
      break;
    }
  }
  return { value: slots, next };
}

/** Backspace: clears the selected slot if it is filled, else the last filled one. */
export function clearSlot(
  value: readonly string[],
  n: number,
  at: number | null,
): { value: string[]; at: number | null } {
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  let i = at !== null && slots[at] !== "" ? at : -1;
  if (i < 0)
    for (let k = n - 1; k >= 0; k--)
      if (slots[k] !== "") {
        i = k;
        break;
      }
  if (i < 0) return { value: slots, at };
  slots[i] = "";
  return { value: slots, at: i };
}
