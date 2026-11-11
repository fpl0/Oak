// `fam.mel.nct`: name the non-chord tone (exercises §4.4, contracts §7.3). One bar in a major key: a
// half-bar of each of two chords and a melody with exactly one non-chord tone, marked on the staff (from
// level 4, heard only). Each pattern is the textbook shape of its kind:
//   passing      step, step, same direction, between two chord tones, unaccented
//   neighbour    step away and back to the same chord tone, unaccented
//   appoggiatura reached by leap, on the strong beat of the new chord, resolved by step
//   suspension   the same pitch held over the chord change (prepared as a chord tone), resolved down by step
// (Anticipation and escape tones are not taught by a lesson of the course, so the family never asks them.)
import type { KeySpec } from "@oak/content-kit";
import { buildPiece } from "../build.ts";
import { mod, type RnChord, rnRootPc, stepToMidi } from "../kernel.ts";
import { rn, voiceChord } from "../music.ts";
import { atom, type Node, seq } from "../pat.ts";
import { cueOf, type Generator, jitter, pickKey, pickSound, pickTempo, trialOf } from "./common.ts";
import { chordTrack, pickOctave } from "./keyed.ts";

type Chord = "I" | "IV" | "V";
const CHORD: Readonly<Record<Chord, RnChord>> = {
  I: rn("1", "maj"),
  IV: rn("4", "maj"),
  V: rn("5", "maj"),
};
/** Scale steps (mod 7) of each chord's tones. */
const TONES: Readonly<Record<Chord, readonly number[]>> = { I: [0, 2, 4], IV: [3, 5, 0], V: [4, 6, 1] };

export interface NctPattern {
  /** The chord of each half bar. */
  chords: [Chord, Chord];
  /** Melody: [scale step, length in eighths]; the lengths fill the bar (8). */
  mel: [number, number][];
  /** Index in `mel` of the non-chord tone. */
  marked: number;
}
export const NCT_PATTERNS: Readonly<Record<string, readonly NctPattern[]>> = {
  passing: [
    {
      chords: ["I", "V"],
      mel: [
        [2, 2],
        [3, 2],
        [4, 2],
        [4, 2],
      ],
      marked: 1,
    },
    {
      chords: ["I", "V"],
      mel: [
        [0, 2],
        [2, 1],
        [3, 1],
        [4, 4],
      ],
      marked: 2,
    },
    {
      chords: ["I", "IV"],
      mel: [
        [7, 2],
        [7, 1],
        [6, 1],
        [5, 4],
      ],
      marked: 2,
    },
  ],
  neighbour: [
    {
      chords: ["I", "V"],
      mel: [
        [2, 1],
        [3, 1],
        [2, 2],
        [1, 4],
      ],
      marked: 1,
    },
    {
      chords: ["I", "V"],
      mel: [
        [4, 1],
        [3, 1],
        [4, 2],
        [4, 2],
        [6, 2],
      ],
      marked: 1,
    },
    {
      chords: ["I", "IV"],
      mel: [
        [0, 1],
        [-1, 1],
        [0, 2],
        [0, 2],
        [3, 2],
      ],
      marked: 1,
    },
  ],
  appoggiatura: [
    {
      chords: ["I", "V"],
      mel: [
        [2, 2],
        [0, 2],
        [5, 2],
        [4, 2],
      ],
      marked: 2,
    },
    {
      chords: ["I", "V"],
      mel: [
        [4, 2],
        [2, 2],
        [7, 2],
        [6, 2],
      ],
      marked: 2,
    },
    {
      chords: ["I", "IV"],
      mel: [
        [2, 2],
        [0, 2],
        [6, 2],
        [5, 2],
      ],
      marked: 2,
    },
  ],
  suspension: [
    {
      chords: ["I", "V"],
      mel: [
        [2, 2],
        [0, 4],
        [-1, 2],
      ],
      marked: 1,
    },
    {
      chords: ["IV", "I"],
      mel: [
        [5, 2],
        [3, 4],
        [2, 2],
      ],
      marked: 1,
    },
    {
      chords: ["I", "V"],
      mel: [
        [4, 2],
        [7, 4],
        [6, 2],
      ],
      marked: 1,
    },
  ],
};

/** The chord sounding at an onset (in eighths) of a pattern. */
export const chordAt = (p: NctPattern, at8: number): Chord => (at8 < 4 ? p.chords[0] : p.chords[1]);
export const isChordTone = (step: number, chord: Chord): boolean => TONES[chord].includes(mod(step, 7));

export const melodyNct: Generator = {
  name: "melody-nct",
  generate(ctx) {
    const pats = NCT_PATTERNS[ctx.category] ?? (NCT_PATTERNS.passing as NctPattern[]);
    const p = ctx.rng.pick(pats);
    const key: KeySpec = pickKey(ctx, "major");
    const octave = pickOctave(ctx.rng, key, 60, 67);
    const chords = p.chords.map((c) => CHORD[c]);
    // The chords sit under the melody (bass in the second octave, upper voices from D3), so the melody and
    // its marked note stand out on top.
    const voiced = chords.map((c) =>
      voiceChord(rnRootPc(c, key), c.quality, { bass: [36, 47], upperFloor: 50 }),
    );
    const melNode: Node = seq(
      p.mel.map(([s]) => atom(s)),
      p.mel.map(([, l]) => l),
    );
    const melSound = pickSound(ctx);
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 1,
      tracks: [
        chordTrack(ctx, key, [voiced], { gain: 0.4 }),
        { label: "mel", src: "n", pat: melNode, key, octave, s: melSound, gain: jitter(ctx, 0.75) },
      ],
    });
    let at = 0;
    const onsets = p.mel.map(([, l]) => {
      const o = at;
      at += l;
      return o;
    });
    const earOnly = ctx.level.earOnly === true;
    const options = [
      ...new Set([
        ...ctx.level.categories.filter((c) => ctx.openCategories.includes(c) || c === ctx.category),
        ctx.category,
      ]),
    ];
    return trialOf(piece, { choice: [ctx.category] }, cueOf(ctx), {
      mode: "choice",
      key,
      options,
      chords: p.chords,
      melody: p.mel.map(([s]) => stepToMidi(s, key, octave)),
      markedIndex: p.marked,
      /** 1-based beat of the marked note ("2.5" = the "and" of 2). */
      markedBeat: 1 + (onsets[p.marked] as number) / 2,
      showStaff: !earOnly,
      prompt: earOnly
        ? "One melody note is not in the chord. What kind of note is it?"
        : "What kind of non-chord tone is the marked note?",
    });
  },
};
