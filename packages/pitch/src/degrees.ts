// Wave 5: sung degrees in minor and in the blues (contracts §8.1, §8.3; U10 minor, U11 blue notes). Targets are
// built from 1-based degrees relative to major ("b3", "b6", "b7"), so a minor tune is 1 2 ♭3 4 5 ♭6 ♭7 with the
// do-based minor syllables (do re me fa sol le te; the raised 6 and 7 are la and ti). The one rule for a sung note
// stays `gradeSung`; this module only builds its targets, marks the blue notes and names what was sung in the key.
import type { Degree, Diagnostic, KeySpec } from "@oak/content-kit";
import { BLUE_NOTES, blueNoteOf, labelPitch, syllableOf } from "@oak/theory";
import type { SungResult, SungTarget } from "./types.ts";

const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11] as const;

/** Semitones above the tonic of a 1-based degree relative to major: "1" → 0, "b3" → 3, "#4" → 6, "7" → 11. */
export function degreeSemitones(degree: Degree): number {
  const m = /^(bb|b|##|#)?([1-7])$/.exec(degree);
  if (!m) throw new RangeError(`@oak/pitch: bad degree "${degree}"`);
  const acc = m[1] ?? "";
  const alt = acc.startsWith("#") ? acc.length : -acc.length;
  return (MAJOR_SEMIS[Number(m[2]) - 1] as number) + alt;
}

/** "♭3", "♯4", "5": a degree as the learner reads it. */
export function degreeText(degree: Degree): string {
  return degree.replace(/b/g, "♭").replace(/#/g, "♯");
}

/** One note of a degree line: the degree, its octave from the tonic (1′ is `octave: 1`), and its time. */
export interface DegreeNote {
  degree: Degree;
  octave?: number;
  /** Seconds after `startAt`. */
  at: number;
  dur: number;
}

/** A sung target that knows its degree and syllable (what the lane prints and the feedback names). */
export interface DegreeTarget extends SungTarget {
  degree: Degree;
  /** Movable do, do-based in minor: "me" for ♭3, "le" for ♭6, "te" for ♭7, "la"/"ti" for the raised 6 and 7. */
  syllable: string;
}

/** Which way each blue note bends (U11.L03): ♭3 up toward 3, ♭7 up toward 7, ♭5 either way (between 4 and 5). */
export const BLUE_BEND: Readonly<Record<"b3" | "b5" | "b7", 1 | -1 | 0>> = { b3: 1, b5: 0, b7: 1 };

/**
 * Sing targets from degrees in a key (a sung step, a sung drill answer, a sight-sung phrase): `tonicMidi` is the
 * tonic's MIDI note in the octave the line starts from (already moved into the learner's comfort range with
 * `fitToRange` when needed), times are AudioContext seconds from `startAt`. With `blues`, ♭3, ♭5 and ♭7 are
 * marked as blue notes (`markBlueNotes`).
 */
export function degreeTargets(o: {
  key: KeySpec;
  tonicMidi: number;
  notes: readonly DegreeNote[];
  startAt?: number;
  blues?: boolean;
}): DegreeTarget[] {
  const start = o.startAt ?? 0;
  const out: DegreeTarget[] = o.notes.map((n) => {
    const midi = o.tonicMidi + degreeSemitones(n.degree) + 12 * (n.octave ?? 0);
    return {
      midi,
      on: start + n.at,
      off: start + n.at + n.dur,
      degree: n.degree,
      syllable: syllableOf(n.degree),
    };
  });
  return o.blues ? markBlueNotes(out, o.key) : out;
}

/**
 * Marks the targets that are blue notes of `key` (♭3, ♭5, ♭7 against the key's tonic, read as major:
 * `blueNoteOf`), so `gradeSung` accepts a pitch bent toward the neighbouring semitone (`BLUE_BEND`) within the
 * normal tolerance and says so (`sing.blue-note`). Other targets are returned unchanged.
 */
export function markBlueNotes<T extends SungTarget>(targets: readonly T[], key: KeySpec): T[] {
  return targets.map((t) => {
    const blue = blueNoteOf(t.midi, key);
    return blue ? { ...t, blue: { toward: BLUE_BEND[blue.degree] } } : t;
  });
}

/** The degree and do-based syllable of a (rounded) MIDI pitch in `key`. */
export function sungDegree(midi: number, key: KeySpec): { degree: Degree; syllable: string; text: string } {
  const { degree } = labelPitch(Math.round(midi), key);
  return { degree, syllable: syllableOf(degree), text: degreeText(degree) };
}

/** The blue note's own name and syllable ("flat three", "me"), or `null`. */
export function blueNoteName(midi: number, key: KeySpec): { name: string; syllable: string } | null {
  const b = blueNoteOf(midi, key);
  return b ? { name: b.name, syllable: b.syllable } : null;
}

/**
 * The result with every per-note diagnostic named in the key as well (contracts §8.3: numbers, and syllables
 * once taught): `expDeg` / `expSyl` for the target, `gotDeg` / `gotSyl` for what was sung, `towardDeg` /
 * `towardSyl` for a blue note's neighbour. Do-based in minor: in A minor a sung C is ♭3, "me". With `targets`
 * (from `degreeTargets`), a target's own degree names it. Nothing else changes (credit, score and pass are
 * `gradeSung`'s).
 */
export function labelSungResult(
  result: SungResult,
  key: KeySpec,
  targets: readonly Partial<Pick<DegreeTarget, "degree">>[] = [],
): SungResult {
  const named = (d: Diagnostic): Diagnostic => {
    const p = d.params;
    const extra: Record<string, string> = {};
    // The target's own degree when it has one: a blue ♭5 stays ♭5 (the key alone would spell it ♯4).
    const own = d.where?.slot !== undefined ? targets[d.where.slot]?.degree : undefined;
    const put = (prefix: string, midi: unknown) => {
      if (typeof midi !== "number" || !Number.isFinite(midi)) return;
      const s = sungDegree(midi, key);
      extra[`${prefix}Deg`] = s.text;
      extra[`${prefix}Syl`] = s.syllable;
    };
    put("exp", p.expMidi);
    if (own) {
      extra.expDeg = degreeText(own);
      extra.expSyl = syllableOf(own);
    }
    put("got", p.gotMidi);
    put("toward", p.towardMidi);
    return Object.keys(extra).length > 0 ? { ...d, params: { ...p, ...extra } } : d;
  };
  return { ...result, diagnostics: result.diagnostics.map(named) };
}

/** The blue notes Oak teaches (U11.L03), re-exported for hosts that label a blues lane. */
export const BLUE_DEGREES: readonly Degree[] = BLUE_NOTES.map((b) => b.degree);
