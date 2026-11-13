// Aura Lee (G. R. Poulton, 1861), the whole song: an eight-bar verse (two phrases on the same tune) and an
// eight-bar chorus. Oak's teaching key is C; the Hills printing (1887) is in A-flat. Plain rhythm: each
// dotted quarter and eighth becomes two quarters (bars 3, 6, 7, 9, 10, 11, 14 and 15 of the source).
// Harmony, one triad a bar: I ii V I | I ii V I | iii vi I I | I ii V I. Hills's piano part has a
// cadential I64 before V7 in bars 3, 7 and 15, ii in first inversion in bars 2, 6 and 14, and the major III
// (V of vi) in bar 9; Oak plays diatonic root-position triads, so bar 9 is iii.
import { folkSong } from "../folk.ts";

export const setting =
  "Plain rhythm: each dotted quarter and eighth becomes two quarters. Harmony: diatonic triads in root position, one a bar (bar 9 is iii where the 1887 piano part has the major III).";
/**
 * The rhythm of phrase 1, given to the learner in X1.S1 (contracts §6.6 X1): one hit per note of bars 1–4,
 * no pitches.
 */
export const phrase1Rhythm =
  'setcpm(84/4)\n\nmel: s("<[rim rim rim rim] [rim rim rim@2] [rim rim rim rim] rim>")';
export default folkSong({
  id: "song.aura-lee",
  bpm: 84,
  melody: [
    // Phrase 1: 5 1 7 1 | 2 6 2 | 1 7 6 7 | 1
    "[-3 0 -1 0]",
    "[1 -2 1@2]",
    "[0 -1 -2 -1]",
    "0",
    // Phrase 2: the same, with 2 2 2 in bar 6
    "[-3 0 -1 0]",
    "[1 1 1@2]",
    "[0 -1 -2 -1]",
    "0",
    // Phrase 3 (chorus): 7 7 7 | 1 1 1 | 3 2 1 2 | 3
    "[-1 -1 -1@2]",
    "[0 0 0@2]",
    "[2 1 0 1]",
    "2",
    // Phrase 4: 3 3 4 3 | 2 6 2 1 | 7 7 3 2 | 1
    "[2 2 3 2]",
    "[1 -2 1 0]",
    "[-1 -1 2 1]",
    "0",
  ],
  harmony: ["I", "ii", "V", "I", "I", "ii", "V", "I", "iii", "vi", "I", "I", "I", "ii", "V", "I"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
    [13, 16],
  ],
  setting,
});
