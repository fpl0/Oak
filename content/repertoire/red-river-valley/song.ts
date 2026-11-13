// Red River Valley (trad), the verse, in Oak's teaching key C. Oak's setting doubles the note values of the
// usual eight-bar printing, so each phrase is four bars of 4/4 and the pickup "From this" is two quarters
// (`pickup: { units: [2, 1] }`). Plain rhythm: dotted pairs become even ones, and a dotted half that ends a
// line becomes a half and a rest (bars 3 and 11). The last cycle (bar 16) is the rest that ends the tune.
// Harmony, one triad a bar: I I I I | I I V V | I I IV IV | V V I I.
import { folkSong } from "../folk.ts";

export const setting =
  "Note values doubled (16 bars of 4/4, a two-beat pickup); dotted pairs become even ones; held notes at the ends of lines are shortened so nothing crosses a bar line.";
/**
 * The rhythm of phrase 1, given to the learner in X1.S1 (contracts §6.6 X1): the pickup and bars 1–3, one
 * hit per note, no pitches (bar 4 holds only phrase 2's pickup, so it rests here).
 */
export const phrase1Rhythm =
  'setcpm(104/4)\n\nmel: s("<[~@2 rim rim] [rim@2 rim rim] [rim@2 rim rim] [rim rim@2 ~] ~>")';
export default folkSong({
  id: "song.red-river-valley",
  bpm: 104,
  melody: [
    // Pickup: 5 1
    "[~@2 -3 0]",
    // Phrase 1: 3 . 3 3 | 3 . 2 3 | 2 1 . | (5 1)
    "[2@2 2 2]",
    "[2@2 1 2]",
    "[1 0@2 ~]",
    "[~@2 -3 0]",
    // Phrase 2: 3 . 1 3 | 5 . 4 3 | 2 | (5' 4)
    "[2@2 0 2]",
    "[4@2 3 2]",
    "1",
    "[~@2 4 3]",
    // Phrase 3: 3 . 3 2 | 1 . 2 3 | 5 4 . | (6 6)
    "[2@2 2 1]",
    "[0@2 1 2]",
    "[4 3@2 ~]",
    "[~@2 -2 -2]",
    // Phrase 4: 5 . 7 1 | 2 . 3 2 | 1 | rest
    "[-3@2 -1 0]",
    "[1@2 2 1]",
    "0",
    "~",
  ],
  harmony: ["I", "I", "I", "I", "I", "I", "V", "V", "I", "I", "IV", "IV", "V", "V", "I", "I"],
  phrases: [
    [1, 4],
    [5, 8],
    [9, 12],
    [13, 16],
  ],
  setting,
});
