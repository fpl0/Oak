// Public options of a staff render (Wave 3 seam, docs/design/wave3.md §3.1): clef, key signature and the
// per-note annotations (degree number, solfège syllable, note name) the lenses switch on. Pure: the text of
// each annotation is computed here from the Score; the ABC emitter and the DOM layer place it.
import type { KeySpec, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import {
  type Degree,
  displayName,
  keyOf,
  labelPitch,
  parseNote,
  type SpelledPitch,
  syllableOf,
} from "@oak/theory";
import { toRat } from "./q.ts";
import type { KeyChange, NoteItem, Score, Staff, StaffKind } from "./types.ts";

/** The clefs a staff can show. `grand` = treble over bass, split by register (NotationInput.splitMidi). */
export type Clef = Extract<StaffKind, "treble" | "bass" | "grand" | "percussion">;
export const CLEFS: readonly Clef[] = ["treble", "bass", "grand", "percussion"];

/**
 * A key signature: a key (`{ tonic: "D", mode: "major" }`), a key name or `.scale()` argument ("Eb",
 * "F#m", "C4:major"), or a signature in fifths (−7 … 7, read as major). `null`: no signature (C major look).
 */
export type KeySignatureOption = KeySpec | string | number | null;

/** The key a `KeySignatureOption` stands for; throws on a name or number that is not a key. */
export function resolveKeySignature(opt: KeySignatureOption): KeySpec | null {
  if (opt === null) return null;
  const key = keyOf(opt);
  if (!key) throw new RangeError(`@oak/notation: not a key signature: ${JSON.stringify(opt)}`);
  return key;
}

/** Which annotation lines to show, each a lens (docs/design/wave3.md §4.3). */
export interface AnnotationSet {
  /** 1-based scale degree with alteration ("1", "♭3", "♯4"). Needs a key. */
  degree?: boolean;
  /** Movable-do syllable ("do", "me", "fi"). Needs a key. */
  solfege?: boolean;
  /** Spelled note name ("F♯4"). */
  noteName?: boolean;
  /** Where the lines go. Default: below the staff (abcjs lyric lines), in the order degree, solfège, name. */
  position?: "below" | "above";
  /**
   * c5: name a chord's upper members without their octave ("E♭4 G♭ B♭"): the lowest keeps it, the others sit
   * above it. `staffTextLayout` turns it on when full names would not fit a host's width.
   */
  compactNames?: boolean;
}

/** The annotation texts of one engraved note or chord (chord members low to high, joined by a thin space). */
export interface NoteAnnotation {
  n: number;
  degree?: string;
  solfege?: string;
  noteName?: string;
}

/**
 * Stable class names of the annotation text elements, one per kind, plus `oak-ann-e{n}` linking a text to
 * its note. The DOM layer adds them after abcjs renders; tests and the Workbench select on them.
 */
export const ANNOTATION_CLASSES = {
  /** On every annotation text (tagged abcjs text or one `placeAnnotations` drew). */
  base: "oak-ann",
  degree: "oak-ann-degree",
  solfege: "oak-ann-solfege",
  noteName: "oak-ann-name",
  /** Prefix: `oak-ann-e12` marks every annotation of note `n = 12`. */
  note: "oak-ann-e",
} as const;

const SEP = " ";

function* noteItems(score: Score): Generator<{ it: NoteItem; staff: Staff }> {
  for (const s of score.staves) {
    if (s.clef === "perc") continue;
    for (const v of s.voices) for (const b of v.bars) for (const it of b.items) yield { it, staff: s };
  }
}

/**
 * The degree (with Unicode accidentals) and movable-do syllable of an engraved pitch in a key. The degree
 * follows the spelling on the staff: A♯ in C is ♯6 (li), B♭ is ♭7 (te), as `labelPitch` with a direction.
 */
/**
 * In a blues (`Score.blues`) the note six semitones above the tonic is the blue ♭5 (se), whichever way the staff
 * spells it by direction (F♯ climbing to G, G♭ falling to F in C): the lens names the blue note U11 teaches,
 * not ♯4. ♭3 and ♭7 need nothing: the staff always spells them flat in a blues.
 */
function blueFive(p: SpelledPitch, key: KeySpec): { degree: string; syllable: string } | null {
  const tonic = parseNote(`${key.tonic}4`);
  if (!tonic || (((p.midi - tonic.midi) % 12) + 12) % 12 !== 6) return null;
  return { degree: "♭5", syllable: syllableOf("b5") };
}

export function labelSpelled(p: SpelledPitch, key: KeySpec): { degree: string; syllable: string } {
  const tries: { direction?: 1 | -1 }[] = [{}, { direction: 1 }, { direction: -1 }];
  for (const t of tries) {
    const l = labelPitch(p.midi, key, t);
    if (l.name === p.name) return { degree: l.degreeDisplay, syllable: l.syllable };
  }
  // A spelling the key's labels never use (C in G♯ major): the degree from the letter, the alteration from
  // the distance to that degree of the major scale (C over G♯ is ♭4).
  const l = labelPitch(p.midi, key);
  const tonic = parseNote(`${key.tonic}4`);
  if (!tonic) return { degree: l.degreeDisplay, syllable: l.syllable };
  const num = (((LETTERS.indexOf(p.letter) - LETTERS.indexOf(tonic.letter)) % 7) + 7) % 7;
  const semis = (((p.midi - tonic.midi) % 12) + 12) % 12;
  const alt = ((((semis - (MAJOR[num] as number) + 6) % 12) + 12) % 12) - 6;
  const degree = `${alt > 0 ? "#".repeat(alt) : "b".repeat(-alt)}${num + 1}`;
  const syl = syllableOf(degree as Degree);
  return {
    degree: degree.replace(/#/g, "♯").replace(/b/g, "♭"),
    syllable: syl === "?" ? l.syllable : syl,
  };
}
/**
 * The key in force at an onset on a staff: the staff's own plan (`Staff.key`) or the score's, changes inside a bar
 * from their beat (build.ts `keyAtOnset`; kept here to avoid an import cycle).
 */
function signatureAt(score: Score, staff: Staff, onset: Rat): KeySpec | null {
  const own = staff.key !== undefined;
  let key = own ? (staff.key ?? null) : score.key;
  const changes: readonly KeyChange[] = (own ? staff.keyChanges : score.keyChanges) ?? [];
  for (const c of changes) {
    const at = R.add([c.bar, 1], R.div(toRat((c.beat ?? 1) - 1), [score.meter.unitsPerBar, 1]));
    if (R.lte(at, onset)) key = c.key;
  }
  return key;
}
const LETTERS = "CDEFGAB";
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/**
 * The key in force where a drawn pitch stands on its staff, with the degree and syllable its spelling has there
 * (`labelSpelled`; in a blues the blue ♭5 whichever way it is spelled). `null` without a key. Used by the lens
 * lines here and by `drawnLabels` (host.ts), so both read one rule.
 */
export function spelledLabel(
  score: Score,
  staff: Staff,
  onset: Rat,
  p: SpelledPitch,
): { key: KeySpec; degree: string; syllable: string } | null {
  const key = signatureAt(score, staff, onset);
  if (!key) return null;
  const l = score.blues ? (blueFive(p, key) ?? labelSpelled(p, key)) : labelSpelled(p, key);
  return { key, degree: l.degree, syllable: l.syllable };
}

/**
 * The annotation texts of every engraved pitched note, by `n` (tied continuations are skipped: only the
 * first piece of a tie chain is labelled). Degree and solfège need a key: `key` or else `score.key`; without
 * one they are left out. Pure; the emitter and the DOM layer decide where the text goes.
 */
export function noteAnnotations(
  score: Score,
  which: AnnotationSet,
  key: KeySpec | null = score.key,
): NoteAnnotation[] {
  const out: NoteAnnotation[] = [];
  const seen = new Set<number>();
  for (const { it, staff } of noteItems(score)) {
    if (it.n === null || it.kind === "rest" || it.hidden || it.tieFromPrev || seen.has(it.n)) continue;
    if (it.pitches.length === 0) continue;
    seen.add(it.n);
    const a: NoteAnnotation = { n: it.n };
    // Each note is read in the key in force where it starts on its staff (`keyChanges`, a staff's own key),
    // unless a key is given.
    const k = key === score.key ? signatureAt(score, staff, it.onset) : key;
    if (k && (which.degree || which.solfege)) {
      const labels = it.pitches.map((p) =>
        score.blues ? (blueFive(p, k) ?? labelSpelled(p, k)) : labelSpelled(p, k),
      );
      if (which.degree) a.degree = labels.map((l) => l.degree).join(SEP);
      if (which.solfege) a.solfege = labels.map((l) => l.syllable).join(SEP);
    }
    if (which.noteName) a.noteName = noteNameText(it.pitches, which.compactNames ?? false);
    out.push(a);
  }
  return out.sort((x, y) => x.n - y.n);
}

/**
 * The note-name text of a note or chord, members low to high: "F♯4", "C4 E4 G4"; compact (c5), the members above
 * the lowest without octave: "C4 E G".
 */
export function noteNameText(pitches: readonly SpelledPitch[], compact = false): string {
  return pitches
    .map((p, i) => (compact && i > 0 ? displayName(p).replace(/-?\d+$/, "") : displayName(p)))
    .join(SEP);
}

// --- room for the lens lines (c5) ------------------------------------------------------------------------

/** The size abcjs sets lens lines in (`%%vocalfont Helvetica 12`), in SVG units. */
export const ANNOTATION_FONT_PX = 12;
/** The least room a note takes on a staff, in SVG units (abcjs's note spacing at its default scale). */
const NOTE_MIN_PX = 22;
/** Space kept between two neighbouring texts. */
const TEXT_GAP_PX = 8;
/** The clef, key and time signature at the start of a system, and the margins. */
const LINE_START_PX = 80;

/** Width of a text in Helvetica at `px`, from per-character advance widths (an estimate within a few percent). */
export function textWidthPx(text: string, px = ANNOTATION_FONT_PX): number {
  let em = 0;
  for (const ch of text) {
    if (/[ilj.,'|!:;~\s]/.test(ch)) em += 0.26;
    else if (/[frt]/.test(ch)) em += 0.33;
    else if (/[mwMW]/.test(ch)) em += 0.86;
    else if (/[A-Z]/.test(ch)) em += 0.68;
    else if (/[♭♯°ø]/.test(ch)) em += 0.62;
    else em += 0.56;
  }
  return em * px;
}

/** Room each bar's lens texts need, in SVG units, by bar index of the score (every voice, every pitched staff). */
export function barTextPx(score: Score, which: AnnotationSet): number[] {
  const texts = new Map<number, NoteAnnotation>();
  for (const a of noteAnnotations(score, which)) texts.set(a.n, a);
  const kinds = (["degree", "solfege", "noteName"] as const).filter((k) => which[k]);
  const nBars = score.staves[0]?.voices[0]?.bars.length ?? 0;
  const out: number[] = [];
  for (let bi = 0; bi < nBars; bi++) {
    // The widest text at each onset of the bar, over every voice and staff.
    const at = new Map<string, number>();
    for (const s of score.staves) {
      if (s.clef === "perc") continue;
      for (const v of s.voices)
        for (const it of v.bars[bi]?.items ?? []) {
          const k = `${it.onset[0]}/${it.onset[1]}`;
          const a = it.n === null || it.tieFromPrev ? undefined : texts.get(it.n);
          const w = Math.max(0, ...kinds.map((kind) => textWidthPx(a?.[kind] ?? "")));
          at.set(k, Math.max(at.get(k) ?? 0, w));
        }
    }
    out.push([...at.values()].reduce((sum, w) => sum + Math.max(NOTE_MIN_PX, w + TEXT_GAP_PX), 0));
  }
  return out;
}

/** How a staff with lens lines is laid out in a host `width` CSS pixels wide (c5). */
export interface StaffTextLayout {
  /** Bars per system (at most `maxBarsPerLine`, at least 1). */
  barsPerLine: number;
  /** The abcjs `staffwidth` that engraves at the host's own scale (texts stay 12 px). */
  staffwidth: number;
  /** Chord names were shortened (`AnnotationSet.compactNames`) because full names do not fit one bar a line. */
  compactNames: boolean;
}
/**
 * The layout that keeps neighbouring lens texts apart at a host's width: as many bars a system as fit the widest
 * bar's texts (4 at most), and compact chord names when even one bar a line is too narrow for the full ones.
 */
export function staffTextLayout(
  width: number,
  score: Score,
  which: AnnotationSet,
  opts: { maxBarsPerLine?: number } = {},
): StaffTextLayout {
  const staffwidth = Math.round(Math.max(200, Math.min(740, width - 40)));
  const room = staffwidth - LINE_START_PX;
  const max = Math.max(1, opts.maxBarsPerLine ?? 4);
  const fit = (need: number[]) => {
    const widest = Math.max(1, ...need);
    return Math.max(1, Math.min(max, Math.floor(room / widest)));
  };
  const full = barTextPx(score, { ...which, compactNames: false });
  const fullFits = Math.max(0, ...full) <= room;
  if (fullFits || !which.noteName) return { barsPerLine: fit(full), staffwidth, compactNames: false };
  const compact = barTextPx(score, { ...which, compactNames: true });
  return { barsPerLine: fit(compact), staffwidth, compactNames: true };
}
