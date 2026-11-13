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
      const labels = it.pitches.map((p) => labelSpelled(p, k));
      if (which.degree) a.degree = labels.map((l) => l.degree).join(SEP);
      if (which.solfege) a.solfege = labels.map((l) => l.syllable).join(SEP);
    }
    if (which.noteName) a.noteName = it.pitches.map((p) => displayName(p)).join(SEP);
    out.push(a);
  }
  return out.sort((x, y) => x.n - y.n);
}
